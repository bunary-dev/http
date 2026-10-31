/**
 * Type-level tests for route validation (#78).
 *
 * These assertions are checked by `bun run typecheck`; the runtime `expect`s
 * only keep the file honest as a test. A `@ts-expect-error` that stops being an
 * error fails the typecheck, so the negative cases are real assertions too.
 *
 * @see {@link ../src/types/validation.ts}
 */
import { describe, expect, test } from "bun:test";
import type { Application } from "@bunary/core";
import { z } from "zod";
import type {
	AnyContext,
	BodyReader,
	InferSchemaOutput,
	PathParams,
	RequestContext,
	ValidatedContext,
} from "../src/index.js";
import { createRouter } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Assert that `value` is assignable to `T`. */
function expectType<T>(value: T): T {
	return value;
}

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Assert two types are identical. */
function expectExact<A, B>(_proof: Equals<A, B> extends true ? true : never): void {}

// ─── InferSchemaOutput ────────────────────────────────────────────────

describe("InferSchemaOutput", () => {
	test("infers a Standard Schema output", () => {
		expectExact<InferSchemaOutput<z.ZodObject<{ name: z.ZodString }>>, { name: string }>(true);
		expect(true).toBe(true);
	});

	test("infers a plain function's return type", () => {
		expectExact<InferSchemaOutput<(input: unknown) => { id: number }>, { id: number }>(true);
		expect(true).toBe(true);
	});
});

// ─── Handler context typing ───────────────────────────────────────────

describe("Typed context from route schemas", () => {
	test("a zod body schema makes ctx.body the validated value", async () => {
		const app = createRouter();
		app.post("/users", { body: z.object({ name: z.string(), age: z.number() }) }, (ctx) => {
			expectType<string>(ctx.body.name);
			expectType<number>(ctx.body.age);
			expectExact<typeof ctx.body, { name: string; age: number }>(true);
			// @ts-expect-error — ctx.body is the validated value, not a BodyReader
			type _NoReader = (typeof ctx.body)["json"];
			// @ts-expect-error — `email` is not on the schema's output
			type _NoEmail = (typeof ctx.body)["email"];
			return { name: ctx.body.name };
		});

		const res = await app.fetch(
			new Request("http://localhost/users", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Ada", age: 36 }),
			}),
		);
		expect(await res.json()).toEqual({ name: "Ada" });
	});

	test("a plain-function body schema types ctx.body from its return type", async () => {
		const app = createRouter();
		app.post("/echo", { body: (raw: unknown) => ({ raw, length: String(raw).length }) }, (ctx) => {
			expectType<number>(ctx.body.length);
			expectType<unknown>(ctx.body.raw);
			return { length: ctx.body.length };
		});

		const res = await app.fetch(
			new Request("http://localhost/echo", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify("abc"),
			}),
		);
		expect(await res.json()).toEqual({ length: 3 });
	});

	test("params and query take their types from their schemas", async () => {
		const app = createRouter();
		app.get(
			"/users/:id",
			{
				params: z.object({ id: z.coerce.number() }),
				query: (raw) => ({ page: Number(raw.page ?? "1") }),
			},
			(ctx) => {
				expectType<number>(ctx.params.id);
				expectType<number>(ctx.query.page);
				// @ts-expect-error — ctx.query is no longer URLSearchParams
				type _NoSearchParams = (typeof ctx.query)["get"];
				return { id: ctx.params.id, page: ctx.query.page };
			},
		);

		const res = await app.fetch(new Request("http://localhost/users/4?page=2"));
		expect(await res.json()).toEqual({ id: 4, page: 2 });
	});

	test("an unvalidated slot keeps its default type", async () => {
		const app = createRouter();
		app.post("/mixed/:id", { params: z.object({ id: z.coerce.number() }) }, async (ctx) => {
			expectType<number>(ctx.params.id);
			expectType<URLSearchParams>(ctx.query);
			expectType<BodyReader>(ctx.body);
			return { id: ctx.params.id, name: (await ctx.body.json<{ name: string }>()).name };
		});

		const res = await app.fetch(
			new Request("http://localhost/mixed/2", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Ada" }),
			}),
		);
		expect(await res.json()).toEqual({ id: 2, name: "Ada" });
	});

	test("the two-argument form still gives PathParams, URLSearchParams and a BodyReader", async () => {
		const app = createRouter();
		app.get("/legacy/:id", (ctx) => {
			expectExact<typeof ctx.params, PathParams>(true);
			expectType<URLSearchParams>(ctx.query);
			expectType<BodyReader>(ctx.body);
			expectExact<ReturnType<typeof ctx.body.json>, Promise<unknown>>(true);
			// @ts-expect-error — without a body schema ctx.body is the reader
			type _NoValidatedBody = (typeof ctx.body)["name"];
			return { id: ctx.params.id };
		});

		const res = await app.fetch(new Request("http://localhost/legacy/7"));
		expect(await res.json()).toEqual({ id: "7" });
	});

	test("the per-route TParams generic still works alongside", async () => {
		const app = createRouter();
		app.get<{ id: string }>("/typed/:id", (ctx) => {
			expectType<string>(ctx.params.id);
			return { id: ctx.params.id };
		});

		const res = await app.fetch(new Request("http://localhost/typed/9"));
		expect(await res.json()).toEqual({ id: "9" });
	});

	test("group routes are typed the same way", async () => {
		const app = createRouter();
		app.group("/api", (api) => {
			api.put("/users/:id", { body: z.object({ name: z.string() }) }, (ctx) => {
				expectType<string>(ctx.body.name);
				return { name: ctx.body.name };
			});
		});

		const res = await app.fetch(
			new Request("http://localhost/api/users/1", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Grace" }),
			}),
		);
		expect(await res.json()).toEqual({ name: "Grace" });
	});

	test("typed locals survive the schemas overload", async () => {
		interface Locals {
			requestId: string;
		}
		const app = createRouter<Locals>();
		app.use(async (ctx, next) => {
			ctx.locals.requestId = "abc";
			return await next();
		});
		app.get("/whoami", { query: z.object({ q: z.string() }) }, (ctx) => {
			expectType<string>(ctx.locals.requestId);
			expectType<string>(ctx.query.q);
			return { requestId: ctx.locals.requestId, q: ctx.query.q };
		});

		const res = await app.fetch(new Request("http://localhost/whoami?q=x"));
		expect(await res.json()).toEqual({ requestId: "abc", q: "x" });
	});
});

// ─── AnyContext ───────────────────────────────────────────────────────

describe("AnyContext for shared helpers (#97)", () => {
	interface Locals {
		requestId: string;
	}

	/** One helper, called from a validated and an unvalidated handler. */
	function describeRequest(ctx: AnyContext<Locals>): string {
		expectType<string>(ctx.locals.requestId);
		expectType<Application | undefined>(ctx.app);
		expectType<unknown>(ctx.params);
		return `${ctx.request.method} ${ctx.locals.requestId}`;
	}

	test("RequestContext and every ValidatedContext are assignable to AnyContext", () => {
		type Schemas = { params: z.ZodObject<{ id: z.ZodCoercedNumber }> };
		expectExact<AnyContext<Locals>, RequestContext<Locals, unknown, unknown, unknown>>(true);
		expectType<AnyContext<Locals>>({} as RequestContext<Locals>);
		expectType<AnyContext<Locals>>({} as ValidatedContext<Locals, Schemas>);
		expectType<AnyContext<Locals>>(
			{} as ValidatedContext<
				Locals,
				{ query: z.ZodObject<{ q: z.ZodString }>; body: () => number }
			>,
		);
		// @ts-expect-error — a ValidatedContext is not a RequestContext (the reason AnyContext exists)
		expectType<RequestContext<Locals>>({} as ValidatedContext<Locals, Schemas>);
		// @ts-expect-error — locals stay typed: other locals do not fit
		expectType<AnyContext<Locals>>({} as RequestContext<{ other: number }>);
		expect(true).toBe(true);
	});

	test("one helper serves a validated and an unvalidated route", async () => {
		const app = createRouter<Locals>();
		app.use(async (ctx, next) => {
			ctx.locals.requestId = "abc";
			return await next();
		});
		app.get("/plain", (ctx) => ({ seen: describeRequest(ctx) }));
		app.get("/users/:id", { params: z.object({ id: z.coerce.number() }) }, (ctx) => ({
			seen: describeRequest(ctx),
			id: ctx.params.id,
		}));

		expect(await (await app.fetch(new Request("http://localhost/plain"))).json()).toEqual({
			seen: "GET abc",
		});
		expect(await (await app.fetch(new Request("http://localhost/users/7"))).json()).toEqual({
			seen: "GET abc",
			id: 7,
		});
	});
});
