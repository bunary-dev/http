/**
 * Tests for typed route parameters via app.get<TParams>() generic (#50).
 *
 * Verifies that per-route TParams generic provides typed param access
 * without runtime coercion — values remain strings. The TypeScript
 * compiler would catch type mismatches at build time, but these tests
 * prove the routing plumbing still extracts params correctly when the
 * generic is used.
 *
 * @see {@link ../src/types/requestContext.ts}
 */
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function req(
	app: { fetch: (req: Request) => Response | Promise<Response> },
	path: string,
	method = "GET",
) {
	return app.fetch(new Request(`http://localhost${path}`, { method }));
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Typed params (app.get<TParams>)", () => {
	test("typed single param is extracted as string", async () => {
		const app = createApp();
		app.get<{ id: string }>("/users/:id", (ctx) => ({
			id: ctx.params.id,
			type: typeof ctx.params.id,
		}));

		const res = await req(app, "/users/42");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("42");
		expect(body.type).toBe("string"); // No coercion
	});

	test("typed multiple params", async () => {
		const app = createApp();
		app.get<{ org: string; repo: string }>("/orgs/:org/repos/:repo", (ctx) => ({
			org: ctx.params.org,
			repo: ctx.params.repo,
		}));

		const res = await req(app, "/orgs/bunary/repos/http");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.org).toBe("bunary");
		expect(body.repo).toBe("http");
	});

	test("typed optional param may be undefined", async () => {
		const app = createApp();
		app.get<{ format?: string }>("/data/:format?", (ctx) => ({
			format: ctx.params.format ?? "json",
		}));

		// Without optional param
		const res1 = await req(app, "/data");
		const body1 = (await res1.json()) as Record<string, unknown>;
		expect(body1.format).toBe("json");

		// With optional param
		const res2 = await req(app, "/data/xml");
		const body2 = (await res2.json()) as Record<string, unknown>;
		expect(body2.format).toBe("xml");
	});

	test("typed params work with POST", async () => {
		const app = createApp();
		app.post<{ id: string }>("/users/:id/update", (ctx) => ({
			updated: ctx.params.id,
		}));

		const res = await req(app, "/users/99/update", "POST");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.updated).toBe("99");
	});

	test("typed params work with PUT", async () => {
		const app = createApp();
		app.put<{ id: string }>("/items/:id", (ctx) => ({
			replaced: ctx.params.id,
		}));

		const res = await req(app, "/items/7", "PUT");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.replaced).toBe("7");
	});

	test("typed params work with DELETE", async () => {
		const app = createApp();
		app.delete<{ id: string }>("/items/:id", (ctx) => ({
			deleted: ctx.params.id,
		}));

		const res = await req(app, "/items/7", "DELETE");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.deleted).toBe("7");
	});

	test("typed params work with PATCH", async () => {
		const app = createApp();
		app.patch<{ id: string }>("/items/:id", (ctx) => ({
			patched: ctx.params.id,
		}));

		const res = await req(app, "/items/7", "PATCH");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.patched).toBe("7");
	});

	test("typed params work in route groups", async () => {
		const app = createApp();
		app.group("/api", (router) => {
			router.get<{ slug: string }>("/posts/:slug", (ctx) => ({
				slug: ctx.params.slug,
			}));
		});

		const res = await req(app, "/api/posts/hello-world");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.slug).toBe("hello-world");
	});

	test("typed params work in nested groups", async () => {
		const app = createApp();
		app.group("/api", (router) => {
			router.group("/v2", (inner) => {
				inner.get<{ id: string }>("/users/:id", (ctx) => ({
					id: ctx.params.id,
				}));
			});
		});

		const res = await req(app, "/api/v2/users/123");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("123");
	});

	test("typed params combined with typed locals", async () => {
		interface Locals {
			role: string;
		}
		const app = createApp<Locals>();
		app.use(async (ctx, next) => {
			ctx.locals.role = "admin";
			return next();
		});
		app.get<{ id: string }>("/users/:id", (ctx) => ({
			id: ctx.params.id,
			role: ctx.locals.role,
		}));

		const res = await req(app, "/users/42");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("42");
		expect(body.role).toBe("admin");
	});

	test("typed params with constraints still work", async () => {
		const app = createApp();
		app
			.get<{ id: string }>("/users/:id", (ctx) => ({
				id: ctx.params.id,
			}))
			.whereNumber("id");

		// Valid numeric id
		const res1 = await req(app, "/users/42");
		expect(res1.status).toBe(200);
		const body = (await res1.json()) as Record<string, unknown>;
		expect(body.id).toBe("42");

		// Non-numeric id — constraint rejects
		const res2 = await req(app, "/users/abc");
		expect(res2.status).toBe(404);
	});

	test("untyped route still defaults to PathParams", async () => {
		const app = createApp();
		// No generic — params default to Record<string, string | undefined>
		app.get("/items/:id", (ctx) => ({
			id: ctx.params.id,
		}));

		const res = await req(app, "/items/55");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBe("55");
	});

	test("URL-decoded params still work with typed generic", async () => {
		const app = createApp();
		app.get<{ name: string }>("/files/:name", (ctx) => ({
			name: ctx.params.name,
		}));

		const res = await req(app, "/files/hello%20world");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("hello world");
	});
});
