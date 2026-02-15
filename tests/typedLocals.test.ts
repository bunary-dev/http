/**
 * Tests for typed ctx.locals via createApp<TLocals>() generic (#43).
 *
 * Verifies that the TLocals generic propagates through middleware,
 * handlers, groups, and custom error/notFound/methodNotAllowed hooks.
 * All assertions are runtime — the TypeScript compiler would catch type
 * mismatches at build time, but these tests prove the plumbing works.
 *
 * @see {@link ../src/types/requestContext.ts}
 */
import { describe, expect, test } from "bun:test";
import type { Middleware } from "../src/index.js";
import { createApp } from "../src/index.js";

// ─── Shared types ─────────────────────────────────────────────────────

interface AppLocals {
	user: { id: number; name: string };
	requestId: string;
}

/** Middleware that populates typed locals */
const authMiddleware: Middleware<AppLocals> = async (ctx, next) => {
	ctx.locals.user = { id: 42, name: "Alice" };
	ctx.locals.requestId = "req-abc-123";
	return next();
};

// ─── Helpers ──────────────────────────────────────────────────────────

function req(
	app: { fetch: (req: Request) => Response | Promise<Response> },
	path: string,
	method = "GET",
) {
	return app.fetch(new Request(`http://localhost${path}`, { method }));
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Typed locals (createApp<TLocals>)", () => {
	test("handler receives typed locals set by middleware", async () => {
		const app = createApp<AppLocals>();
		app.use(authMiddleware);
		app.get("/me", (ctx) => ({
			name: ctx.locals.user.name,
			requestId: ctx.locals.requestId,
		}));

		const res = await req(app, "/me");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toEqual({ name: "Alice", requestId: "req-abc-123" });
	});

	test("locals start empty and are populated by middleware", async () => {
		const app = createApp<AppLocals>();

		// No middleware — locals not yet populated
		app.get("/empty", (ctx) => ({
			hasUser: ctx.locals.user !== undefined,
		}));

		const res = await req(app, "/empty");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.hasUser).toBe(false);
	});

	test("typed locals work in POST handlers", async () => {
		const app = createApp<AppLocals>();
		app.use(authMiddleware);
		app.post("/action", (ctx) => ({
			userId: ctx.locals.user.id,
		}));

		const res = await req(app, "/action", "POST");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.userId).toBe(42);
	});

	test("typed locals propagate into route groups", async () => {
		const app = createApp<AppLocals>();
		app.use(authMiddleware);

		app.group("/api", (router) => {
			router.get("/profile", (ctx) => ({
				name: ctx.locals.user.name,
			}));
		});

		const res = await req(app, "/api/profile");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Alice");
	});

	test("typed locals propagate into nested groups", async () => {
		const app = createApp<AppLocals>();
		app.use(authMiddleware);

		app.group("/api", (router) => {
			router.group("/v1", (inner) => {
				inner.get("/me", (ctx) => ({
					requestId: ctx.locals.requestId,
				}));
			});
		});

		const res = await req(app, "/api/v1/me");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.requestId).toBe("req-abc-123");
	});

	test("typed locals work in custom onNotFound handler", async () => {
		const app = createApp<AppLocals>({
			onNotFound: (ctx) => {
				ctx.locals.requestId = "not-found-req";
				return new Response(JSON.stringify({ requestId: ctx.locals.requestId }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				});
			},
		});

		const res = await req(app, "/nonexistent");
		expect(res.status).toBe(404);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.requestId).toBe("not-found-req");
	});

	test("typed locals work in custom onError handler", async () => {
		const app = createApp<AppLocals>({
			onError: (ctx, error) => {
				ctx.locals.requestId = "error-req";
				return new Response(
					JSON.stringify({
						error: error instanceof Error ? error.message : "unknown",
						requestId: ctx.locals.requestId,
					}),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			},
		});
		app.get("/boom", () => {
			throw new Error("kaboom");
		});

		const res = await req(app, "/boom");
		expect(res.status).toBe(500);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.requestId).toBe("error-req");
		expect(body.error).toBe("kaboom");
	});

	test("default createApp() accepts Record<string, unknown> locals", async () => {
		// Backward-compatible: no generic needed
		const app = createApp();
		app.use(async (ctx, next) => {
			ctx.locals.anything = "works";
			return next();
		});
		app.get("/", (ctx) => ({
			val: ctx.locals.anything,
		}));

		const res = await req(app, "/");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.val).toBe("works");
	});

	test("locals are not shared between requests", async () => {
		const app = createApp<AppLocals>();
		let callCount = 0;

		app.use(async (ctx, next) => {
			callCount++;
			ctx.locals.requestId = `req-${callCount}`;
			ctx.locals.user = { id: callCount, name: `User${callCount}` };
			return next();
		});

		app.get("/track", (ctx) => ({
			requestId: ctx.locals.requestId,
		}));

		const [res1, res2] = await Promise.all([req(app, "/track"), req(app, "/track")]);

		const body1 = (await res1.json()) as Record<string, unknown>;
		const body2 = (await res2.json()) as Record<string, unknown>;
		// Each request gets its own locals
		expect(body1.requestId).not.toBe(body2.requestId);
	});
});
