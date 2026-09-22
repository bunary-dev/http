/**
 * Runtime tests for route-level validation (#78).
 *
 * A route may carry an options object between its path and handler:
 * `router.post("/users/:id", { params, query, body }, handler)`. Each schema is
 * a `SchemaLike` — a Standard Schema object (zod, valibot, ...) or a plain
 * function. Validation runs inside the route pipeline, after route middleware
 * and before the handler, and a failure surfaces as core's `ValidationError`,
 * which the default mapper turns into a 422 problem document.
 *
 * @see {@link ../src/validation.ts}
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createRouter } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

type Fetcher = { fetch: (request: Request) => Promise<Response> };

function req(app: Fetcher, path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(`http://localhost${path}`, init));
}

function jsonReq(app: Fetcher, path: string, body: unknown, method = "POST"): Promise<Response> {
	return req(app, path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

interface ProblemBody {
	status: number;
	title: string;
	detail?: string;
	errors?: { path: string; message: string }[];
}

async function problemOf(response: Response): Promise<ProblemBody> {
	return (await response.json()) as ProblemBody;
}

// ─── Params ───────────────────────────────────────────────────────────

describe("Route validation — params", () => {
	test("validates and coerces params with a zod schema", async () => {
		const app = createRouter();
		app.get("/users/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
			id: ctx.params.id,
			type: typeof ctx.params.id,
		}));

		const res = await req(app, "/users/42");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: 42, type: "number" });
	});

	test("validates params with a plain function", async () => {
		const app = createRouter();
		app.get(
			"/orders/:ref",
			{
				params: (raw) => {
					if (!raw.ref?.startsWith("ord_")) {
						throw new Error("ref must start with ord_");
					}
					return { ref: raw.ref };
				},
			},
			(ctx) => ({ ref: ctx.params.ref }),
		);

		const ok = await req(app, "/orders/ord_1");
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ ref: "ord_1" });

		const bad = await req(app, "/orders/nope");
		expect(bad.status).toBe(422);
		const problem = await problemOf(bad);
		expect(problem.title).toBe("Unprocessable Content");
		expect(problem.detail).toContain("Params validation failed");
	});

	test("a failing params schema is a 422 problem document with errors[].path", async () => {
		const app = createRouter();
		app.get("/users/:id", { params: z.object({ id: z.coerce.number().int() }) }, (ctx) => ({
			id: ctx.params.id,
		}));

		const res = await req(app, "/users/abc");
		expect(res.status).toBe(422);
		expect(res.headers.get("content-type")).toContain("application/problem+json");
		const problem = await problemOf(res);
		expect(problem.status).toBe(422);
		expect(problem.errors?.[0]?.path).toBe("id");
		expect(typeof problem.errors?.[0]?.message).toBe("string");
	});
});

// ─── Query ────────────────────────────────────────────────────────────

describe("Route validation — query", () => {
	test("validates query with a zod schema", async () => {
		const app = createRouter();
		app.get(
			"/search",
			{ query: z.object({ q: z.string(), page: z.coerce.number().default(1) }) },
			(ctx) => ({ q: ctx.query.q, page: ctx.query.page }),
		);

		const res = await req(app, "/search?q=bun");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ q: "bun", page: 1 });
	});

	test("validates query with a plain function", async () => {
		const app = createRouter();
		app.get("/feed", { query: (raw) => ({ limit: Number(raw.limit ?? "10") }) }, (ctx) => ({
			limit: ctx.query.limit,
		}));

		const res = await req(app, "/feed?limit=5");
		expect(await res.json()).toEqual({ limit: 5 });
	});

	test("repeated query keys collapse to the last value", async () => {
		const app = createRouter();
		app.get("/tags", { query: z.object({ tag: z.string() }) }, (ctx) => ({ tag: ctx.query.tag }));

		const res = await req(app, "/tags?tag=a&tag=b");
		expect(await res.json()).toEqual({ tag: "b" });
	});

	test("a failing query schema is a 422", async () => {
		const app = createRouter();
		app.get("/search", { query: z.object({ q: z.string() }) }, (ctx) => ({ q: ctx.query.q }));

		const res = await req(app, "/search");
		expect(res.status).toBe(422);
		const problem = await problemOf(res);
		expect(problem.detail).toContain("Query validation failed");
		expect(problem.errors?.[0]?.path).toBe("q");
	});
});

// ─── Body ─────────────────────────────────────────────────────────────

describe("Route validation — body", () => {
	test("replaces ctx.body with the validated JSON value", async () => {
		const app = createRouter();
		app.post("/users", { body: z.object({ name: z.string(), age: z.coerce.number() }) }, (ctx) =>
			ctx.json({ name: ctx.body.name, age: ctx.body.age }, { status: 201 }),
		);

		const res = await jsonReq(app, "/users", { name: "Ada", age: "36" });
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ name: "Ada", age: 36 });
	});

	test("validates the body with a plain function", async () => {
		const app = createRouter();
		app.post(
			"/echo",
			{
				body: (raw) => {
					const value = raw as { message?: unknown };
					if (typeof value.message !== "string") throw new Error("message must be a string");
					return { message: value.message };
				},
			},
			(ctx) => ({ message: ctx.body.message }),
		);

		const ok = await jsonReq(app, "/echo", { message: "hi" });
		expect(await ok.json()).toEqual({ message: "hi" });

		const bad = await jsonReq(app, "/echo", { message: 1 });
		expect(bad.status).toBe(422);
	});

	test("parses a urlencoded form body into a plain object", async () => {
		const app = createRouter();
		app.post("/form", { body: z.object({ name: z.string(), age: z.coerce.number() }) }, (ctx) => ({
			name: ctx.body.name,
			age: ctx.body.age,
		}));

		const res = await req(app, "/form", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ name: "Grace", age: "45" }).toString(),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "Grace", age: 45 });
	});

	test("parses a multipart form body into a plain object", async () => {
		const app = createRouter();
		app.post("/upload", { body: z.object({ title: z.string() }) }, (ctx) => ({
			title: ctx.body.title,
		}));

		const form = new FormData();
		form.set("title", "notes");
		const res = await req(app, "/upload", { method: "POST", body: form });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ title: "notes" });
	});

	test("a missing body is validated as undefined and fails with 422", async () => {
		const app = createRouter();
		app.post("/users", { body: z.object({ name: z.string() }) }, (ctx) => ({
			name: ctx.body.name,
		}));

		const res = await req(app, "/users", { method: "POST" });
		expect(res.status).toBe(422);
		const problem = await problemOf(res);
		expect(problem.detail).toContain("Body validation failed");
	});

	test("an unsupported content-type validates undefined rather than guessing", async () => {
		const app = createRouter();
		app.post("/raw", { body: z.string().optional() }, (ctx) => ({ body: ctx.body ?? null }));

		const res = await req(app, "/raw", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "hello",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ body: null });
	});

	test("malformed JSON is a 400 BodyParseError, not a 422", async () => {
		const app = createRouter();
		app.post("/users", { body: z.object({ name: z.string() }) }, (ctx) => ({
			name: ctx.body.name,
		}));

		const res = await req(app, "/users", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{ not json",
		});
		expect(res.status).toBe(400);
		const problem = await problemOf(res);
		expect(problem.detail).toContain("Failed to parse JSON body");
	});

	test("a json content-type with parameters is still parsed as JSON", async () => {
		const app = createRouter();
		app.put("/users/:id", { body: z.object({ name: z.string() }) }, (ctx) => ({
			name: ctx.body.name,
		}));

		const res = await req(app, "/users/1", {
			method: "PUT",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ name: "Ada" }),
		});
		expect(await res.json()).toEqual({ name: "Ada" });
	});
});

// ─── Combinations, methods and groups ─────────────────────────────────

describe("Route validation — wiring", () => {
	test("params, query and body validate together", async () => {
		const app = createRouter();
		app.patch(
			"/users/:id",
			{
				params: z.object({ id: z.coerce.number() }),
				query: z.object({ notify: z.enum(["yes", "no"]) }),
				body: z.object({ name: z.string() }),
			},
			(ctx) => ({ id: ctx.params.id, notify: ctx.query.notify, name: ctx.body.name }),
		);

		const res = await jsonReq(app, "/users/7?notify=yes", { name: "Ada" }, "PATCH");
		expect(await res.json()).toEqual({ id: 7, notify: "yes", name: "Ada" });
	});

	test("works on delete routes", async () => {
		const app = createRouter();
		app.delete("/users/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) =>
			ctx.json({ id: ctx.params.id }),
		);

		const res = await req(app, "/users/9", { method: "DELETE" });
		expect(await res.json()).toEqual({ id: 9 });
	});

	test("works inside a route group and keeps the group prefix", async () => {
		const app = createRouter();
		app.group("/api", (api) => {
			api.get("/users/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
				id: ctx.params.id,
			}));
			api.group("/v2", (v2) => {
				v2.post("/users", { body: z.object({ name: z.string() }) }, (ctx) => ({
					name: ctx.body.name,
				}));
			});
		});

		expect(await (await req(app, "/api/users/3")).json()).toEqual({ id: 3 });
		expect(await (await jsonReq(app, "/api/v2/users", { name: "Ada" })).json()).toEqual({
			name: "Ada",
		});
	});

	test("the route builder still chains after schemas are given", async () => {
		const app = createRouter();
		app
			.get("/posts/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
				id: ctx.params.id,
			}))
			.name("posts.show")
			.whereNumber("id");

		expect(app.route("posts.show", { id: 5 })).toBe("/posts/5");
		expect((await req(app, "/posts/abc")).status).toBe(404);
	});

	test("route middleware runs before validation and sees the raw context", async () => {
		const app = createRouter();
		const seen: unknown[] = [];
		app.group(
			{
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						seen.push(typeof (ctx.params as Record<string, unknown>).id);
						seen.push(ctx.query instanceof URLSearchParams);
						seen.push(typeof (ctx.body as { json?: unknown }).json);
						return await next();
					},
				],
			},
			(api) => {
				api.get("/users/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
					id: ctx.params.id,
				}));
			},
		);

		const res = await req(app, "/api/users/8?x=1");
		expect(await res.json()).toEqual({ id: 8 });
		expect(seen).toEqual(["string", true, "function"]);
	});

	test("an empty options object validates nothing", async () => {
		const app = createRouter();
		app.get("/plain/:id", {}, (ctx) => ({ id: (ctx.params as Record<string, string>).id }));

		expect(await (await req(app, "/plain/x")).json()).toEqual({ id: "x" });
	});

	test("omitting the handler after schemas throws at registration", () => {
		const app = createRouter();
		expect(() =>
			(app.get as unknown as (path: string, schemas: unknown) => unknown)("/oops", {
				params: z.object({}),
			}),
		).toThrow(TypeError);
	});

	test("the two-argument form is untouched", async () => {
		const app = createRouter();
		app.get("/legacy/:id", (ctx) => ({ id: ctx.params.id }));

		expect(await (await req(app, "/legacy/7")).json()).toEqual({ id: "7" });
	});
});

// ─── Optional core peer ───────────────────────────────────────────────

describe("Route validation — @bunary/core stays optional", () => {
	test("the bundled entry point never imports @bunary/core statically", async () => {
		const build = await Bun.build({
			entrypoints: ["./src/index.ts"],
			target: "bun",
			external: ["@bunary/core"],
		});
		expect(build.success).toBe(true);
		const code = await build.outputs[0]?.text();
		expect(code).toBeString();
		// A dynamic `import("@bunary/core")` is fine — it is only reached by a
		// route that declares schemas. A static `from "@bunary/core"` is not.
		expect(code).not.toMatch(/from\s*["']@bunary\/core["']/);
		expect(code).not.toMatch(/require\(["']@bunary\/core["']\)/);
	});

	test("a router with no schemas never reaches for core", async () => {
		const { coreImportAttempts } = await import("../src/validation.js");
		const app = createRouter();
		app.get("/ping", () => ({ ok: true }));
		app.post("/ping", async (ctx) => ({ echo: await ctx.body.json() }));

		const before = coreImportAttempts();
		expect(await (await req(app, "/ping")).json()).toEqual({ ok: true });
		expect(await (await jsonReq(app, "/ping", { a: 1 })).json()).toEqual({ echo: { a: 1 } });
		expect(coreImportAttempts()).toBe(before);
	});

	test("a route that declares schemas does reach for core", async () => {
		const { coreImportAttempts } = await import("../src/validation.js");
		const app = createRouter();
		app.get("/counted/:id", { params: z.object({ id: z.string() }) }, (ctx) => ({
			id: ctx.params.id,
		}));

		const before = coreImportAttempts();
		expect((await req(app, "/counted/1")).status).toBe(200);
		expect(coreImportAttempts()).toBeGreaterThan(before);
	});
});
