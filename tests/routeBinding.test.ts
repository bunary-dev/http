/**
 * Runtime tests for route model binding (#158).
 *
 * A route declares `bind: { key: resolver }` in its schemas object. After group
 * middleware and validation, each resolver is called — one at a time, in the
 * order its param appears in the path — with the param's value and the request
 * context, and its result lands on `ctx.bound[key]`. A `null`/`undefined`
 * result is a 404 problem naming the key; a thrown error takes the normal
 * error path.
 *
 * @see {@link ../src/binding.ts}
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { abort, createRouter, type Middleware } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

type Fetcher = { fetch: (request: Request) => Promise<Response> };

function req(app: Fetcher, path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(`http://localhost${path}`, init));
}

interface ProblemBody {
	status: number;
	title: string;
	detail?: string;
	instance?: string;
}

interface User {
	id: number;
	name: string;
}

interface Post {
	id: number;
	userId: number;
}

const USERS: User[] = [
	{ id: 0, name: "Root" },
	{ id: 1, name: "Ada" },
	{ id: 2, name: "Grace" },
];

const POSTS: Post[] = [
	{ id: 10, userId: 1 },
	{ id: 20, userId: 2 },
];

const findUser = (id: number): User | null => USERS.find((u) => u.id === id) ?? null;

// ─── Basic binding ────────────────────────────────────────────────────

describe("Route model binding — resolving", () => {
	test("puts the resolved value on ctx.bound and leaves ctx.params alone", async () => {
		const app = createRouter();
		app.get(
			"/users/:user",
			{ params: z.object({ user: z.coerce.number() }), bind: { user: findUser } },
			(ctx) => ({ name: ctx.bound.user.name, param: ctx.params.user }),
		);

		const res = await req(app, "/users/1");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "Ada", param: 1 });
	});

	test("null is missing: 404 problem naming the key, handler not called", async () => {
		const app = createRouter();
		let handled = false;
		app.get(
			"/users/:user",
			{ params: z.object({ user: z.coerce.number() }), bind: { user: findUser } },
			() => {
				handled = true;
				return { ok: true };
			},
		);

		const res = await req(app, "/users/99");
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/problem+json");
		const body = (await res.json()) as ProblemBody;
		expect(body.status).toBe(404);
		expect(body.detail).toBe("user not found");
		expect(JSON.stringify(body)).not.toContain("99");
		expect(handled).toBe(false);
	});

	test("undefined is missing too", async () => {
		const app = createRouter();
		app.get("/users/:user", { bind: { user: () => undefined } }, () => ({ ok: true }));

		const res = await req(app, "/users/1");
		expect(res.status).toBe(404);
		expect(((await res.json()) as ProblemBody).detail).toBe("user not found");
	});

	test("the not-found detail is the same in debug and production", async () => {
		for (const debug of [true, false]) {
			const app = createRouter({ debug });
			app.get("/users/:user", { bind: { user: () => null } }, () => ({ ok: true }));
			const body = (await (await req(app, "/users/secret-id")).json()) as ProblemBody;
			expect(body.detail).toBe("user not found");
			expect(JSON.stringify(body)).not.toContain("secret-id");
		}
	});

	test("0, empty string and false are real values, not missing", async () => {
		const app = createRouter();
		app.get("/zero/:n", { bind: { n: () => 0 } }, (ctx) => ({ n: ctx.bound.n }));
		app.get("/empty/:s", { bind: { s: () => "" } }, (ctx) => ({ s: ctx.bound.s }));
		app.get("/false/:b", { bind: { b: () => false } }, (ctx) => ({ b: ctx.bound.b }));

		expect(await (await req(app, "/zero/x")).json()).toEqual({ n: 0 });
		expect(await (await req(app, "/empty/x")).json()).toEqual({ s: "" });
		expect(await (await req(app, "/false/x")).json()).toEqual({ b: false });
	});

	test("a record with id 0 is found", async () => {
		const app = createRouter();
		app.get(
			"/users/:user",
			{ params: z.object({ user: z.coerce.number() }), bind: { user: findUser } },
			(ctx) => ({ name: ctx.bound.user.name }),
		);

		const res = await req(app, "/users/0");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "Root" });
	});

	test("async resolvers are awaited", async () => {
		const app = createRouter();
		app.get(
			"/users/:user",
			{
				params: z.object({ user: z.coerce.number() }),
				bind: { user: async (id) => findUser(id) },
			},
			(ctx) => ({ name: ctx.bound.user.name }),
		);

		expect(await (await req(app, "/users/2")).json()).toEqual({ name: "Grace" });
		expect((await req(app, "/users/7")).status).toBe(404);
	});
});

// ─── Resolver input ───────────────────────────────────────────────────

describe("Route model binding — resolver input", () => {
	test("gets the coerced param when a params schema exists", async () => {
		const app = createRouter();
		const seen: unknown[] = [];
		app.get(
			"/users/:user",
			{
				params: z.object({ user: z.coerce.number() }),
				bind: {
					user: (id) => {
						seen.push(id);
						return findUser(id);
					},
				},
			},
			() => ({ ok: true }),
		);

		await req(app, "/users/1");
		expect(seen).toEqual([1]);
	});

	test("gets the raw decoded string without a schema", async () => {
		const app = createRouter();
		const seen: unknown[] = [];
		app.get(
			"/tags/:tag",
			{
				bind: {
					tag: (raw) => {
						seen.push(raw);
						return { raw };
					},
				},
			},
			(ctx) => ctx.bound.tag,
		);

		const res = await req(app, "/tags/caf%C3%A9%20bar");
		expect(await res.json()).toEqual({ raw: "café bar" });
		expect(seen).toEqual(["café bar"]);
	});

	test("gets the request context: locals, params and query", async () => {
		const app = createRouter();
		app.use(async (ctx, next) => {
			ctx.locals.tenant = "acme";
			return await next();
		});
		app.get(
			"/users/:user",
			{
				query: z.object({ include: z.string().optional() }),
				bind: {
					user: (raw, ctx) => ({
						raw,
						tenant: ctx.locals.tenant,
						param: (ctx.params as Record<string, unknown>).user,
						include: (ctx.query as { include?: string }).include,
					}),
				},
			},
			(ctx) => ctx.bound.user,
		);

		const res = await req(app, "/users/5?include=posts");
		expect(await res.json()).toEqual({ raw: "5", tenant: "acme", param: "5", include: "posts" });
	});
});

// ─── Ordering ─────────────────────────────────────────────────────────

describe("Route model binding — ordering", () => {
	test("resolves in path order, and a child resolver reads ctx.bound of its parent", async () => {
		const app = createRouter();
		const calls: string[] = [];
		app.get(
			"/users/:user/posts/:post",
			{
				params: z.object({ user: z.coerce.number(), post: z.coerce.number() }),
				// Declared in reverse order: resolution still follows the path.
				bind: {
					post: (id, ctx) => {
						calls.push("post");
						const user = ctx.bound.user as User;
						return POSTS.find((p) => p.id === id && p.userId === user.id);
					},
					user: (id) => {
						calls.push("user");
						return findUser(id);
					},
				},
			},
			(ctx) => ({ user: ctx.bound.user.name, post: ctx.bound.post.id }),
		);

		const ok = await req(app, "/users/1/posts/10");
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ user: "Ada", post: 10 });
		expect(calls).toEqual(["user", "post"]);

		// Grace's post under Ada: scoped lookup misses
		const scoped = await req(app, "/users/1/posts/20");
		expect(scoped.status).toBe(404);
		expect(((await scoped.json()) as ProblemBody).detail).toBe("post not found");
	});

	test("a missing parent stops before the child resolver runs", async () => {
		const app = createRouter();
		const calls: string[] = [];
		app.get(
			"/users/:user/posts/:post",
			{
				bind: {
					user: () => {
						calls.push("user");
						return null;
					},
					post: () => {
						calls.push("post");
						return {};
					},
				},
			},
			() => ({ ok: true }),
		);

		const res = await req(app, "/users/1/posts/2");
		expect(((await res.json()) as ProblemBody).detail).toBe("user not found");
		expect(calls).toEqual(["user"]);
	});

	test("middleware rejection happens before any resolver is called", async () => {
		const app = createRouter();
		let resolved = false;
		const auth: Middleware = (ctx, next) =>
			ctx.request.headers.get("authorization") ? next() : abort(401);

		app.group({ prefix: "/admin", middleware: [auth] }, (group) => {
			group.get(
				"/users/:user",
				{
					bind: {
						user: () => {
							resolved = true;
							return null;
						},
					},
				},
				() => ({ ok: true }),
			);
		});

		const res = await req(app, "/admin/users/1");
		expect(res.status).toBe(401);
		expect(resolved).toBe(false);

		const authed = await req(app, "/admin/users/1", { headers: { authorization: "x" } });
		expect(authed.status).toBe(404);
		expect(resolved).toBe(true);
	});

	test("validation failure (422) happens before any resolver is called", async () => {
		const app = createRouter();
		let resolved = false;
		app.get(
			"/users/:user",
			{
				params: z.object({ user: z.coerce.number().int() }),
				bind: {
					user: (id) => {
						resolved = true;
						return findUser(id);
					},
				},
			},
			() => ({ ok: true }),
		);

		const res = await req(app, "/users/abc");
		expect(res.status).toBe(422);
		expect(resolved).toBe(false);
	});

	test("global middleware wraps the binding 404", async () => {
		const app = createRouter();
		app.use(async (_ctx, next) => {
			const res = (await next()) as Response;
			res.headers.set("x-wrapped", "yes");
			return res;
		});
		app.get("/users/:user", { bind: { user: () => null } }, () => ({ ok: true }));

		const res = await req(app, "/users/1");
		expect(res.status).toBe(404);
		expect(res.headers.get("x-wrapped")).toBe("yes");
	});
});

// ─── Errors ───────────────────────────────────────────────────────────

describe("Route model binding — errors", () => {
	test("a resolver that throws abort(410) keeps its status", async () => {
		const app = createRouter();
		app.get(
			"/users/:user",
			{ bind: { user: () => abort(410, "That account was deleted") } },
			() => ({ ok: true }),
		);

		const res = await req(app, "/users/1");
		expect(res.status).toBe(410);
		expect(((await res.json()) as ProblemBody).detail).toBe("That account was deleted");
	});

	test("a resolver can customise not-found by throwing abort(404)", async () => {
		const app = createRouter();
		app.get(
			"/users/:user",
			{ bind: { user: (raw) => findUser(Number(raw)) ?? abort(404, "No such member") } },
			() => ({ ok: true }),
		);

		const res = await req(app, "/users/99");
		expect(res.status).toBe(404);
		expect(((await res.json()) as ProblemBody).detail).toBe("No such member");
	});

	test("an unexpected error is a 500 through onError", async () => {
		const seen: unknown[] = [];
		const app = createRouter({
			onError: (_ctx, error) => {
				seen.push(error);
				return new Response("custom", { status: 503 });
			},
		});
		app.get(
			"/users/:user",
			{
				bind: {
					user: () => {
						throw new Error("db down");
					},
				},
			},
			() => ({ ok: true }),
		);

		const res = await req(app, "/users/1");
		expect(res.status).toBe(503);
		expect((seen[0] as Error).message).toBe("db down");
	});
});

// ─── Registration check ───────────────────────────────────────────────

describe("Route model binding — registration", () => {
	test("a bind key with no matching param throws at registration", () => {
		const app = createRouter();
		expect(() =>
			app.get("/users/:id", { bind: { user: () => ({}) } }, () => ({ ok: true })),
		).toThrow('bind key "user" has no ":user" in "/users/:id"');
	});

	test("checks the full path inside a group, prefix param included", () => {
		const app = createRouter();
		app.group("/teams/:team", (group) => {
			// `team` comes from the group prefix: fine
			group.get("/members/:member", { bind: { team: () => ({}), member: () => ({}) } }, () => ({
				ok: true,
			}));
		});

		expect(() =>
			app.group("/teams/:team", (group) => {
				group.get("/members/:id", { bind: { member: () => ({}) } }, () => ({ ok: true }));
			}),
		).toThrow('bind key "member" has no ":member" in "/teams/:team/members/:id"');
	});

	test("binds a group prefix param at request time", async () => {
		const app = createRouter();
		app.group({ prefix: "/teams/:team" }, (group) => {
			group.group("/members", (inner) => {
				inner.get(
					"/:member",
					{
						bind: {
							team: (raw) => ({ team: raw }),
							member: (raw, ctx) => ({ ...(ctx.bound.team as object), member: raw }),
						},
					},
					(ctx) => ctx.bound.member,
				);
			});
		});

		const res = await req(app, "/teams/red/members/ann");
		expect(await res.json()).toEqual({ team: "red", member: "ann" });
	});
});

// ─── Methods and constraints ──────────────────────────────────────────

describe("Route model binding — methods and constraints", () => {
	test("works for every HTTP method route, HEAD included", async () => {
		const app = createRouter();
		const calls: string[] = [];
		const bind = {
			user: (raw: string | undefined, ctx: { request: Request }) => {
				calls.push(ctx.request.method);
				return raw === "1" ? { id: 1 } : null;
			},
		};
		const handler = (ctx: { bound: { user: { id: number } } }) => ({ id: ctx.bound.user.id });
		app.get("/users/:user", { bind }, handler);
		app.post("/users/:user", { bind }, handler);
		app.put("/users/:user", { bind }, handler);
		app.patch("/users/:user", { bind }, handler);
		app.delete("/users/:user", { bind }, handler);

		for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
			const ok = await req(app, "/users/1", { method });
			expect(ok.status).toBe(200);
			expect(await ok.json()).toEqual({ id: 1 });
			expect((await req(app, "/users/2", { method })).status).toBe(404);
		}

		const head = await req(app, "/users/2", { method: "HEAD" });
		expect(head.status).toBe(404);
		expect(calls).toContain("HEAD");
	});

	test("a constraint failure is a route-level 404 and the resolver is not called", async () => {
		const app = createRouter();
		let resolved = false;
		app
			.get(
				"/users/:user",
				{
					bind: {
						user: () => {
							resolved = true;
							return {};
						},
					},
				},
				() => ({ ok: true }),
			)
			.whereNumber("user");

		const res = await req(app, "/users/abc");
		expect(res.status).toBe(404);
		expect(((await res.json()) as ProblemBody).detail).toBe("No route matches GET /users/abc");
		expect(resolved).toBe(false);

		expect((await req(app, "/users/12")).status).toBe(200);
		expect(resolved).toBe(true);
	});

	test("routes without bind behave as before and have no ctx.bound", async () => {
		const app = createRouter();
		app.get("/users/:id", (ctx) => ({ id: ctx.params.id, hasBound: "bound" in ctx }));
		app.get("/items/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
			id: ctx.params.id,
			hasBound: "bound" in ctx,
		}));

		expect(await (await req(app, "/users/7")).json()).toEqual({ id: "7", hasBound: false });
		expect(await (await req(app, "/items/7")).json()).toEqual({ id: 7, hasBound: false });
	});
});
