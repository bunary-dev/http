/**
 * Type-level tests for route model binding (#158).
 *
 * These assertions are checked by `bun run typecheck`; the runtime `expect`s
 * only keep the file honest as a test. A `@ts-expect-error` that stops being an
 * error fails the typecheck, so the negative cases are real assertions too.
 *
 * @see {@link ../src/types/binding.ts}
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { BindingContext, BoundOf, PathParams, RequestContext } from "../src/index.js";
import { createRouter } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Assert two types are identical. */
function expectExact<A, B>(_proof: Equals<A, B> extends true ? true : never): void {}

class User {
	constructor(readonly id: number) {}
	async delete(): Promise<void> {}
}

class Post {
	constructor(
		readonly id: number,
		readonly userId: number,
	) {}
}

const findUser = (id: number): User | null => (id > 0 ? new User(id) : null);

// ─── BoundOf ──────────────────────────────────────────────────────────

describe("BoundOf", () => {
	test("strips null, undefined and Promise from each resolver's result", () => {
		expectExact<
			BoundOf<{
				user: (id: number) => User | null;
				post: () => Promise<Post | undefined>;
				zero: () => number;
			}>,
			{ user: User; post: Post; zero: number }
		>(true);
		expect(true).toBe(true);
	});
});

// ─── Handler ctx.bound ────────────────────────────────────────────────

describe("Typed ctx.bound", () => {
	test("the issue's example types ctx.bound and ctx.params", () => {
		const router = createRouter();
		router
			.delete(
				"/users/:user",
				{ params: z.object({ user: z.coerce.number() }), bind: { user: findUser } },
				async (ctx) => {
					expectExact<typeof ctx.bound.user, User>(true);
					expectExact<typeof ctx.params.user, number>(true);
					expectExact<typeof ctx.bound, { user: User }>(true);
					// @ts-expect-error — only declared bindings are on ctx.bound
					ctx.bound.post;
					await ctx.bound.user.delete();
					return new Response(null, { status: 204 });
				},
			)
			.name("users.delete");
		expect(router.hasRoute("users.delete")).toBe(true);
	});

	test("async resolvers and nullable results are unwrapped", () => {
		const router = createRouter();
		router.get(
			"/users/:user/posts/:post",
			{
				bind: {
					user: async (raw) => (raw ? new User(Number(raw)) : undefined),
					post: (raw, ctx) => {
						const user = ctx.bound.user as User;
						return raw ? new Post(Number(raw), user.id) : null;
					},
				},
			},
			(ctx) => {
				expectExact<typeof ctx.bound, { user: User; post: Post }>(true);
				return { ok: true };
			},
		);
		expect(true).toBe(true);
	});

	test("0-ish result types are kept", () => {
		const router = createRouter();
		router.get("/n/:n", { bind: { n: () => 0 as number | null } }, (ctx) => {
			expectExact<typeof ctx.bound.n, number>(true);
			return { n: ctx.bound.n };
		});
		expect(true).toBe(true);
	});

	test("query and body schemas still type ctx alongside bind", () => {
		const router = createRouter();
		router.post(
			"/users/:user",
			{
				params: z.object({ user: z.coerce.number() }),
				query: z.object({ notify: z.enum(["yes", "no"]) }),
				body: z.object({ name: z.string() }),
				bind: { user: findUser },
			},
			(ctx) => {
				expectExact<typeof ctx.query.notify, "yes" | "no">(true);
				expectExact<typeof ctx.body.name, string>(true);
				expectExact<typeof ctx.bound.user, User>(true);
				return { ok: true };
			},
		);
		expect(true).toBe(true);
	});

	test("typed locals reach a bound handler", () => {
		const router = createRouter<{ tenant: string }>();
		router.get("/users/:user", { bind: { user: () => new User(1) } }, (ctx) => {
			expectExact<typeof ctx.locals.tenant, string>(true);
			return { ok: true };
		});
		expect(true).toBe(true);
	});

	test("works inside groups, with every registration method", () => {
		const router = createRouter();
		router.group("/admin", (group) => {
			const bind = { user: findUser };
			const params = z.object({ user: z.coerce.number() });
			group.get("/users/:user", { params, bind }, (ctx) => {
				expectExact<typeof ctx.bound.user, User>(true);
				return {};
			});
			group.post("/users/:user", { params, bind }, (ctx) => ({ id: ctx.bound.user.id }));
			group.put("/users/:user", { params, bind }, (ctx) => ({ id: ctx.bound.user.id }));
			group.patch("/users/:user", { params, bind }, (ctx) => ({ id: ctx.bound.user.id }));
			group.delete("/users/:user", { params, bind }, (ctx) => ({ id: ctx.bound.user.id }));
		});
		expect(true).toBe(true);
	});
});

// ─── Resolver arguments ───────────────────────────────────────────────

describe("Resolver arguments", () => {
	test("an inline resolver gets the validated param type", () => {
		const router = createRouter();
		router.get(
			"/users/:user",
			{
				params: z.object({ user: z.coerce.number() }),
				bind: {
					user: (id, ctx) => {
						expectExact<typeof id, number>(true);
						expectExact<typeof ctx.bound, Record<string, unknown>>(true);
						expectExact<typeof ctx, BindingContext>(true);
						return findUser(id);
					},
				},
			},
			() => ({}),
		);
		expect(true).toBe(true);
	});

	test("without a params schema it gets the raw string", () => {
		const router = createRouter();
		router.get(
			"/tags/:tag",
			{
				bind: {
					tag: (raw) => {
						expectExact<typeof raw, string | undefined>(true);
						return raw;
					},
				},
			},
			() => ({}),
		);
		expect(true).toBe(true);
	});

	test("a resolver whose value type does not match the schema is rejected", () => {
		const router = createRouter();
		const byName = (name: string) => new User(name.length);
		router.get(
			"/users/:user",
			// @ts-expect-error — `user` is a number after validation, not a string
			{ params: z.object({ user: z.coerce.number() }), bind: { user: byName } },
			() => ({}),
		);
		expect(true).toBe(true);
	});
});

// ─── Unchanged routes ─────────────────────────────────────────────────

describe("Routes without bind", () => {
	test("keep their context type and have no ctx.bound", () => {
		const router = createRouter();
		router.get("/users/:id", (ctx) => {
			expectExact<typeof ctx, RequestContext<Record<string, unknown>, PathParams>>(true);
			// @ts-expect-error — no bind, no ctx.bound
			ctx.bound;
			return {};
		});
		router.get("/items/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => {
			expectExact<
				typeof ctx,
				RequestContext<Record<string, unknown>, { id: number }, URLSearchParams>
			>(true);
			// @ts-expect-error — no bind, no ctx.bound
			ctx.bound;
			return {};
		});
		router.get<{ id: string }>("/typed/:id", (ctx) => {
			expectExact<typeof ctx.params.id, string>(true);
			return {};
		});
		expect(true).toBe(true);
	});
});
