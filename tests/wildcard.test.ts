/**
 * Tests for wildcard/catch-all route support (#46).
 *
 * Verifies that `/*` and `/**` suffixes create catch-all routes that
 * capture the remaining path as `ctx.params["*"]`. Covers matching,
 * parameter extraction, groups, basePath, named routes with URL
 * generation, priority ordering, and combined params + wildcard.
 *
 * @see {@link ../src/router.ts}
 */
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";
import { compilePath } from "../src/router.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function req(
	app: { fetch: (req: Request) => Response | Promise<Response> },
	path: string,
	method = "GET",
) {
	return app.fetch(new Request(`http://localhost${path}`, { method }));
}

// ─── compilePath unit tests ───────────────────────────────────────────

describe("compilePath wildcard", () => {
	test("/* produces a wildcard pattern", () => {
		const result = compilePath("/*");
		expect(result.isWildcard).toBe(true);
		expect(result.paramNames).toEqual(["*"]);
	});

	test("/** produces a wildcard pattern", () => {
		const result = compilePath("/**");
		expect(result.isWildcard).toBe(true);
		expect(result.paramNames).toEqual(["*"]);
	});

	test("/assets/* produces a wildcard pattern with prefix", () => {
		const result = compilePath("/assets/*");
		expect(result.isWildcard).toBe(true);
		expect(result.paramNames).toEqual(["*"]);
		expect(result.pattern.test("/assets")).toBe(true);
		expect(result.pattern.test("/assets/foo")).toBe(true);
		expect(result.pattern.test("/assets/foo/bar")).toBe(true);
	});

	test("wildcard matches prefix alone", () => {
		const { pattern } = compilePath("/assets/*");
		expect(pattern.test("/assets")).toBe(true);
	});

	test("wildcard matches prefix with trailing slash", () => {
		const { pattern } = compilePath("/assets/*");
		expect(pattern.test("/assets/")).toBe(true);
	});

	test("wildcard matches deeply nested paths", () => {
		const { pattern } = compilePath("/assets/*");
		expect(pattern.test("/assets/css/vendor/reset.css")).toBe(true);
	});

	test("/* matches root path /", () => {
		const { pattern } = compilePath("/*");
		expect(pattern.test("/")).toBe(true);
	});

	test("/* matches any path", () => {
		const { pattern } = compilePath("/*");
		expect(pattern.test("/foo")).toBe(true);
		expect(pattern.test("/foo/bar/baz")).toBe(true);
	});

	test("non-wildcard route is not flagged", () => {
		const result = compilePath("/users/:id");
		expect(result.isWildcard).toBe(false);
	});

	test("throws for mid-path wildcard", () => {
		expect(() => compilePath("/*/foo")).toThrow(/must appear at the end/);
	});

	test("combined named param + wildcard", () => {
		const result = compilePath("/users/:id/*");
		expect(result.paramNames).toEqual(["id", "*"]);
		expect(result.isWildcard).toBe(true);
		expect(result.pattern.test("/users/42")).toBe(true);
		expect(result.pattern.test("/users/42/posts")).toBe(true);
		expect(result.pattern.test("/users/42/posts/1/comments")).toBe(true);
	});
});

// ─── Integration tests (app.fetch) ───────────────────────────────────

describe("Wildcard routes", () => {
	test("basic wildcard captures remaining path", async () => {
		const app = createApp();
		app.get("/assets/*", (ctx) => ({
			path: ctx.params["*"],
		}));

		const res = await req(app, "/assets/css/style.css");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.path).toBe("css/style.css");
	});

	test("/** syntax works identically to /*", async () => {
		const app = createApp();
		app.get("/files/**", (ctx) => ({
			path: ctx.params["*"],
		}));

		const res = await req(app, "/files/docs/readme.md");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.path).toBe("docs/readme.md");
	});

	test("wildcard matches prefix alone (no remaining path)", async () => {
		const app = createApp();
		app.get("/assets/*", (ctx) => ({
			path: ctx.params["*"] ?? "none",
		}));

		const res = await req(app, "/assets");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.path).toBe("none");
	});

	test("root wildcard /* matches everything", async () => {
		const app = createApp();
		app.get("/*", (ctx) => ({
			path: ctx.params["*"] ?? "root",
		}));

		const res1 = await req(app, "/");
		const body1 = (await res1.json()) as Record<string, unknown>;
		expect(body1.path).toBe("root");

		const res2 = await req(app, "/any/deep/path");
		const body2 = (await res2.json()) as Record<string, unknown>;
		expect(body2.path).toBe("any/deep/path");
	});

	test("specific routes take priority over wildcard when registered first", async () => {
		const app = createApp();
		// Register specific route first
		app.get("/assets/favicon.ico", () => ({ type: "specific" }));
		// Then wildcard
		app.get("/assets/*", () => ({ type: "wildcard" }));

		const res1 = await req(app, "/assets/favicon.ico");
		const body1 = (await res1.json()) as Record<string, unknown>;
		expect(body1.type).toBe("specific");

		const res2 = await req(app, "/assets/other.css");
		const body2 = (await res2.json()) as Record<string, unknown>;
		expect(body2.type).toBe("wildcard");
	});

	test("wildcard with named param before it", async () => {
		const app = createApp();
		app.get("/users/:id/*", (ctx) => ({
			id: ctx.params.id,
			rest: ctx.params["*"] ?? "none",
		}));

		const res = await req(app, "/users/42/posts/1/comments");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("42");
		expect(body.rest).toBe("posts/1/comments");
	});

	test("wildcard with named param, no remaining path", async () => {
		const app = createApp();
		app.get("/users/:id/*", (ctx) => ({
			id: ctx.params.id,
			rest: ctx.params["*"] ?? "none",
		}));

		const res = await req(app, "/users/42");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("42");
		expect(body.rest).toBe("none");
	});

	test("wildcard works with POST method", async () => {
		const app = createApp();
		app.post("/api/*", (ctx) => ({
			captured: ctx.params["*"],
		}));

		const res = await req(app, "/api/users/42/update", "POST");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.captured).toBe("users/42/update");
	});

	test("wildcard works with PUT, DELETE, PATCH", async () => {
		const app = createApp();
		app.put("/proxy/*", (ctx) => ({ method: "PUT", path: ctx.params["*"] }));
		app.delete("/proxy/*", (ctx) => ({ method: "DELETE", path: ctx.params["*"] }));
		app.patch("/proxy/*", (ctx) => ({ method: "PATCH", path: ctx.params["*"] }));

		const putRes = await req(app, "/proxy/resource/1", "PUT");
		expect(((await putRes.json()) as Record<string, unknown>).method).toBe("PUT");

		const delRes = await req(app, "/proxy/resource/1", "DELETE");
		expect(((await delRes.json()) as Record<string, unknown>).method).toBe("DELETE");

		const patchRes = await req(app, "/proxy/resource/1", "PATCH");
		expect(((await patchRes.json()) as Record<string, unknown>).method).toBe("PATCH");
	});

	test("wildcard works inside route groups", async () => {
		const app = createApp();
		app.group("/api", (router) => {
			router.get("/*", (ctx) => ({
				captured: ctx.params["*"] ?? "root",
			}));
		});

		const res = await req(app, "/api/users/42");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.captured).toBe("users/42");
	});

	test("wildcard works inside nested groups", async () => {
		const app = createApp();
		app.group("/api", (api) => {
			api.group("/v1", (v1) => {
				v1.get("/*", (ctx) => ({
					captured: ctx.params["*"],
				}));
			});
		});

		const res = await req(app, "/api/v1/deep/nested/path");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.captured).toBe("deep/nested/path");
	});

	test("wildcard works with basePath", async () => {
		const app = createApp({ basePath: "/app" });
		app.get("/static/*", (ctx) => ({
			file: ctx.params["*"],
		}));

		const res = await req(app, "/app/static/images/logo.png");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.file).toBe("images/logo.png");
	});

	test("wildcard captures URL-decoded values", async () => {
		const app = createApp();
		app.get("/files/*", (ctx) => ({
			path: ctx.params["*"],
		}));

		const res = await req(app, "/files/my%20folder/hello%20world.txt");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.path).toBe("my folder/hello world.txt");
	});

	test("HEAD request works with wildcard routes", async () => {
		const app = createApp();
		app.get("/assets/*", () => ({ ok: true }));

		const res = await req(app, "/assets/style.css", "HEAD");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
	});

	test("405 works for wildcard routes on wrong method", async () => {
		const app = createApp();
		app.get("/assets/*", () => ({ ok: true }));

		const res = await req(app, "/assets/style.css", "POST");
		expect(res.status).toBe(405);
		expect(res.headers.get("Allow")).toContain("GET");
	});
});

// ─── Named wildcard routes + URL generation ───────────────────────────

describe("Wildcard named routes", () => {
	test("URL generation with wildcard param", () => {
		const app = createApp();
		app.get("/assets/*", () => ({})).name("assets");

		const url = app.route("assets", { "*": "css/style.css" });
		expect(url).toBe("/assets/css/style.css");
	});

	test("URL generation without wildcard param strips suffix", () => {
		const app = createApp();
		app.get("/assets/*", () => ({})).name("assets");

		const url = app.route("assets");
		expect(url).toBe("/assets");
	});

	test("URL generation with wildcard and named param", () => {
		const app = createApp();
		app.get("/users/:id/*", () => ({})).name("user.files");

		const url = app.route("user.files", { id: 42, "*": "docs/readme.md" });
		expect(url).toBe("/users/42/docs/readme.md");
	});

	test("URL generation encodes special characters in wildcard segments", () => {
		const app = createApp();
		app.get("/files/*", () => ({})).name("files");

		const url = app.route("files", { "*": "hello world/café.txt" });
		expect(url).toBe("/files/hello%20world/caf%C3%A9.txt");
	});

	test("extra params become query string with wildcard routes", () => {
		const app = createApp();
		app.get("/assets/*", () => ({})).name("assets");

		const url = app.route("assets", { "*": "style.css", v: "2" });
		expect(url).toContain("?v=2");
	});
});
