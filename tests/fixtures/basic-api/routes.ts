/**
 * The `basic-api` fixture's routes: one small API that touches every symbol of
 * the 1.0.0-rc.1 public API.
 *
 * A consumer writes `import { ... } from "@bunary/http"`; this fixture imports
 * `../../../src/index.js` so the consumer test exercises the working tree.
 */
import { z } from "zod";
import type { Middleware, RequestContext, Router } from "../../../src/index.js";
// A consumer writes: import { ... } from "@bunary/http";
import {
	abort,
	BadRequestError,
	BodyParseError,
	ConflictError,
	cors,
	createRouter,
	ForbiddenError,
	HttpError,
	html,
	InternalServerError,
	isHttpError,
	json,
	MethodNotAllowedError,
	NotFoundError,
	problemResponse,
	redirect,
	status,
	TooManyRequestsError,
	text,
	UnauthorizedError,
	UnprocessableError,
} from "../../../src/index.js";
import { apiEnv } from "./config.js";
import { DatabaseToken, type FakeConnection } from "./database.js";

/**
 * Per-request store this API's middleware fills in.
 *
 * A `type` alias, not an `interface`: only an alias gets TypeScript's implicit
 * index signature, and without one a `Router<ApiLocals>` is not assignable to
 * the `Router<Record<string, unknown>>` that `router.use(cors())` and
 * `httpProvider()` expect. (docs/index.md's "Typed Locals" example uses an
 * `interface`, which does not compose with either.)
 */
export type ApiLocals = {
	/** Correlation id minted by the global logging middleware. */
	requestId: string;
};

/**
 * Read the fake connection off the Application the router is mounted on.
 *
 * `ctx.app` is `undefined` for a standalone router, which is exactly the shape
 * a consumer has to handle: here that becomes a 503 rather than a crash.
 *
 * The parameter is `Pick<..., "app">` rather than `RequestContext`, because a
 * validated route's `ValidatedContext` replaces `params`/`query`/`body` and is
 * therefore *not* assignable to `RequestContext`: a shared helper has to ask
 * for the slots it actually uses.
 */
function connection(ctx: Pick<RequestContext<ApiLocals>, "app">): FakeConnection {
	const conn = ctx.app?.get(DatabaseToken);
	if (conn === undefined) {
		abort(503, "No database: this router is not mounted on an Application");
	}
	return conn;
}

/** Copy a response so a header can be added without mutating a frozen one. */
function withHeader(response: Response, name: string, value: string): Response {
	const copy = new Response(response.body, response);
	copy.headers.set(name, value);
	return copy;
}

/**
 * Global middleware: mints a correlation id and stamps it on *every* response.
 *
 * Registered with `router.use()`, so it wraps matched routes, 404, 405, the
 * OPTIONS auto-response and error responses alike (#65) — which is what the
 * consumer test asserts against a 404.
 */
const requestLogger: Middleware<ApiLocals> = async (ctx, next) => {
	ctx.locals.requestId = `req_${ctx.request.method.toLowerCase()}`;
	// Global middleware is handed a Response, never a raw handler return value.
	const response = (await next()) as Response;
	return withHeader(response, "x-request-id", ctx.locals.requestId);
};

/**
 * Group middleware: advertises the API version on the group's responses.
 *
 * Unlike the global chain, a group's `next()` resolves to the handler's raw
 * return value, so this group's handlers all return a `Response`.
 */
const apiVersion: Middleware<ApiLocals> = async (_ctx, next) => {
	const response = (await next()) as Response;
	return withHeader(response, "x-api-version", "v1");
};

/** Throw the `HttpError` subclass named by the path, for the error-mapping test. */
function throwByKind(kind: string): never {
	switch (kind) {
		case "bad-request":
			throw new BadRequestError("id must be a number");
		case "unauthorized":
			throw new UnauthorizedError();
		case "forbidden":
			throw new ForbiddenError();
		case "not-found":
			throw new NotFoundError("No such widget");
		case "method-not-allowed":
			throw new MethodNotAllowedError();
		case "conflict":
			throw new ConflictError("That name is taken");
		case "unprocessable":
			throw new UnprocessableError("Cannot process", {
				details: [{ path: "name", message: "already used" }],
			});
		case "too-many-requests":
			throw new TooManyRequestsError("Slow down", { headers: { "retry-after": "30" } });
		case "internal":
			throw new InternalServerError();
		default:
			throw new HttpError(418, "I am a teapot");
	}
}

/**
 * Build the API router.
 *
 * A factory rather than a module singleton: every app (and the standalone
 * test) gets its own router, because a router is bound to one Application.
 */
export function createApiRouter(): Router<ApiLocals> {
	const router = createRouter<ApiLocals>();

	// Global middleware, in order: logging wraps everything cors() produces,
	// including the preflight short-circuit.
	router.use(requestLogger);
	router.use(cors({ origin: "*", exposeHeaders: ["x-request-id"], maxAge: 600 }));

	// --- plain routes -------------------------------------------------------
	router.get("/health", (ctx) => ctx.text("ok"));
	router.get("/docs", (ctx) => ctx.html("<h1>basic-api</h1>"));
	router.get("/old-docs", (ctx) => ctx.redirect("/docs", 301));

	// --- validated routes ---------------------------------------------------
	router.get(
		"/users/:id",
		{ params: z.object({ id: z.coerce.number().int().positive() }) },
		(ctx) => {
			const user = connection(ctx).findUser(ctx.params.id); // ctx.params.id is a number
			if (user === undefined) {
				throw new NotFoundError(`No user ${ctx.params.id}`);
			}
			return ctx.json(user);
		},
	);

	router.post(
		"/users",
		{
			body: z.object({ name: z.string().min(1), email: z.email() }),
			query: z.object({ notify: z.enum(["yes", "no"]).default("no") }),
		},
		(ctx) => {
			const created = connection(ctx).insertUser(ctx.body.name); // ctx.body IS the validated body
			return ctx.json(
				{ ...created, email: ctx.body.email, notify: ctx.query.notify },
				{ status: 201 },
			);
		},
	);

	router.delete(
		"/users/:id",
		{ params: z.object({ id: z.coerce.number().int().positive() }) },
		(ctx) => ctx.status(204),
	);

	// --- errors -------------------------------------------------------------
	router.get("/admin/secret", () => abort(403, "Admin access requires an invite"));
	router.get("/boom", () => {
		throw new Error("postgres://app:hunter2@db/app refused the connection");
	});
	router.get("/errors/:kind", (ctx) => throwByKind(ctx.params.kind ?? ""));

	// A consumer's own error reporter: catch, tell an expected HTTP failure
	// from a bug with `isHttpError`, and render the same problem document the
	// router's default mapper would have produced.
	router.get("/inspect/:kind", (ctx) => {
		try {
			throwByKind(ctx.params.kind ?? "");
		} catch (error) {
			const response = problemResponse(error, {
				instance: new URL(ctx.request.url).pathname,
			});
			return withHeader(response, "x-expected", String(isHttpError(error)));
		}
	});

	// --- body reader, cookies -----------------------------------------------
	router.post("/raw", async (ctx) => {
		try {
			const payload = await ctx.body.json<{ note: string }>();
			return ctx.json({ note: payload.note, length: payload.note.length });
		} catch (error) {
			// Malformed JSON surfaces as BodyParseError, which the default
			// mapper renders as a 400 problem document.
			const parseFailure = error instanceof BodyParseError;
			return problemResponse(parseFailure ? error : new InternalServerError(), {
				instance: new URL(ctx.request.url).pathname,
			});
		}
	});

	router.get("/login", (ctx) => {
		ctx.cookies.set("session", "s3cr3t", {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			maxAge: 3600,
		});
		return ctx.json({ ok: true });
	});
	router.get("/whoami", (ctx) => ctx.json({ session: ctx.cookies.get("session") ?? null }));

	// --- standalone response helpers ----------------------------------------
	router.get("/helpers/text", () => text("standalone"));
	router.get("/helpers/html", () => html("<p>standalone</p>"));
	router.get("/helpers/redirect", () => redirect("/docs"));
	router.get("/helpers/status", () => status(202, { headers: { "x-job": "queued" } }));
	router.get("/helpers/json", () => json({ standalone: true }, { status: 200 }));

	// --- a group with its own prefix, middleware and name prefix -------------
	router.group({ prefix: "/api/v1", middleware: [apiVersion], name: "v1." }, (api) => {
		api
			.get("/stats", (ctx) => {
				const conn = connection(ctx);
				return ctx.json({
					app: ctx.app?.config.get("app.name"),
					env: ctx.app?.env,
					logLevel: apiEnv.BASIC_API_LOG_LEVEL,
					database: { url: conn.url, open: conn.open },
					users: conn.count(),
				});
			})
			.name("stats");

		api.get("/echo", (ctx) =>
			json({
				method: ctx.request.method,
				tags: ctx.query.getAll("tag"),
				agent: ctx.request.headers.get("x-agent"),
			}),
		);
	});

	return router;
}
