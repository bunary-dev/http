/**
 * End-to-end proof that a consumer can build a real API on the 1.0.0-rc.1
 * surface: the `tests/fixtures/basic-api` app is booted, served over a real
 * socket on an ephemeral port, and driven with `fetch`.
 *
 * Every symbol in the epic's public API table (bunary-dev/http#84) is
 * exercised at least once below:
 *
 * - [x] `createRouter(options?)` / `Router`            — fixtures/basic-api/routes.ts
 * - [x] `router.<method>(path, options?, handler)`     — get/post/delete, with and without schemas
 * - [x] route `params` / `query` / `body` validators   — zod schemas on /users and /users/:id
 * - [x] `router.use()` global middleware               — requestLogger, asserted on 404
 * - [x] `router.group()` prefix + middleware + name    — /api/v1, x-api-version, "v1.stats"
 * - [x] `router.route()` / `hasRoute()` / `getRoutes()`— named-route assertions
 * - [x] `router.listen()` (via `serve`) / `router.fetch()` — live server + standalone router
 * - [x] `ctx.request`                                  — /api/v1/echo
 * - [x] `ctx.params`                                   — /users/:id (typed number)
 * - [x] `ctx.query`                                    — /api/v1/echo (URLSearchParams), /users (validated)
 * - [x] `ctx.body`                                     — /raw (BodyReader), /users (validated)
 * - [x] `ctx.cookies`                                  — /login, /whoami
 * - [x] `ctx.app`                                      — /api/v1/stats
 * - [x] `ctx.json` / `.text` / `.html` / `.redirect` / `.status`
 * - [x] standalone `json` / `text` / `html` / `redirect` / `status` — /helpers/*
 * - [x] `HttpError` + status subclasses                — /errors/:kind
 * - [x] `abort()`                                      — /admin/secret, /users/:id without an app
 * - [x] `problemResponse()`                            — /inspect/:kind, /raw
 * - [x] `isHttpError()`                                — /inspect/:kind (x-expected header)
 * - [x] `BodyParseError`                               — /raw with malformed JSON
 * - [x] `cors()`                                       — preflight + Vary
 * - [x] `httpProvider(router)`                         — fixtures/basic-api/app.ts
 * - [x] `RouterToken`                                  — app.get(RouterToken)
 * - [x] `serve(app)`                                   — boots on config.http.port/hostname
 * - [x] `BunaryConfig.http` augmentation               — fixtures/basic-api/config.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Application } from "@bunary/core";
import type { BunaryServer, Router } from "../src/index.js";
import { RouterToken, serve } from "../src/provider.js";
import {
	type ApiLocals,
	apiEnv,
	createApiRouter,
	createBasicApi,
	DatabaseToken,
} from "./fixtures/basic-api/index.js";

/** The booted development app, its router and the live server. */
let app: Application;
let router: Router<ApiLocals>;
let server: BunaryServer;
let base: string;

/** A second app configured as production, for the error-detail assertions. */
let prodServer: BunaryServer;
let prodBase: string;

beforeAll(async () => {
	const dev = createBasicApi("development");
	router = dev.router;
	app = await dev.app.boot();
	server = serve(app); // port 0 / 127.0.0.1 come from config.http
	base = `http://${server.hostname}:${server.port}`;

	const prod = createBasicApi("production");
	prodServer = serve(await prod.app.boot());
	prodBase = `http://${prodServer.hostname}:${prodServer.port}`;
});

afterAll(() => {
	server.stop();
	prodServer.stop();
});

describe("boot", () => {
	test("serve() binds the hostname and an ephemeral port from config.http", () => {
		expect(server.hostname).toBe("127.0.0.1");
		expect(server.port).toBeGreaterThan(0);
	});

	test("httpProvider binds the router under RouterToken", () => {
		expect(app.get(RouterToken)).toBe(router);
	});

	test("the database provider's async boot opened the connection", () => {
		const connection = app.get(DatabaseToken);
		expect(connection.open).toBe(true);
		expect(connection.url).toBe(apiEnv.BASIC_API_DATABASE_URL);
	});

	test("named routes resolve through the group's name prefix", () => {
		expect(router.hasRoute("v1.stats")).toBe(true);
		expect(router.route("v1.stats")).toBe("/api/v1/stats");
		expect(router.getRoutes().some((route) => route.path === "/users/:id")).toBe(true);
	});
});

describe("happy paths", () => {
	test("GET /users/:id returns the typed body a params schema produced", async () => {
		const response = await fetch(`${base}/users/1`);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(await response.json()).toEqual({ id: 1, name: "Ada" });
	});

	test("a missing row becomes the NotFoundError the handler threw", async () => {
		const response = await fetch(`${base}/users/999`);
		const body = (await response.json()) as { detail: string };

		expect(response.status).toBe(404);
		expect(body.detail).toBe("No user 999");
	});

	test("POST /users validates body and query and returns 201", async () => {
		const response = await fetch(`${base}/users?notify=yes`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Grace", email: "grace@example.com" }),
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			id: 2,
			name: "Grace",
			email: "grace@example.com",
			notify: "yes",
		});
	});

	test("DELETE /users/:id returns an empty 204 via ctx.status", async () => {
		const response = await fetch(`${base}/users/1`, { method: "DELETE" });

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
	});

	test("POST /raw reads the body through ctx.body.json()", async () => {
		const response = await fetch(`${base}/raw`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ note: "hello" }),
		});

		expect(await response.json()).toEqual({ note: "hello", length: 5 });
	});

	test("the group's prefix, middleware and ctx.app are all visible", async () => {
		const response = await fetch(`${base}/api/v1/stats`);
		const body = (await response.json()) as Record<string, unknown>;

		expect(response.headers.get("x-api-version")).toBe("v1");
		expect(body.app).toBe("basic-api"); // ctx.app.config.get("app.name")
		expect(body.env).toBe("development");
		expect(body.database).toEqual({ url: apiEnv.BASIC_API_DATABASE_URL, open: true });
	});

	test("ctx.request and ctx.query are the raw Request and URLSearchParams", async () => {
		const response = await fetch(`${base}/api/v1/echo?tag=a&tag=b`, {
			headers: { "x-agent": "consumer-test" },
		});

		expect(await response.json()).toEqual({
			method: "GET",
			tags: ["a", "b"],
			agent: "consumer-test",
		});
	});
});

describe("response helpers", () => {
	test("ctx.text and ctx.html set their content types", async () => {
		const [ok, docs] = await Promise.all([fetch(`${base}/health`), fetch(`${base}/docs`)]);

		expect(await ok.text()).toBe("ok");
		expect(ok.headers.get("content-type")).toContain("text/plain");
		expect(await docs.text()).toBe("<h1>basic-api</h1>");
		expect(docs.headers.get("content-type")).toContain("text/html");
	});

	test("ctx.redirect sets the status and location", async () => {
		const response = await fetch(`${base}/old-docs`, { redirect: "manual" });

		expect(response.status).toBe(301);
		expect(response.headers.get("location")).toBe("/docs");
	});

	test("the standalone helpers behave identically off the context", async () => {
		const [txt, html, redirect, status, json] = await Promise.all([
			fetch(`${base}/helpers/text`),
			fetch(`${base}/helpers/html`),
			fetch(`${base}/helpers/redirect`, { redirect: "manual" }),
			fetch(`${base}/helpers/status`),
			fetch(`${base}/helpers/json`),
		]);

		expect(await txt.text()).toBe("standalone");
		expect(await html.text()).toBe("<p>standalone</p>");
		expect(redirect.status).toBe(302);
		expect(redirect.headers.get("location")).toBe("/docs");
		expect(status.status).toBe(202);
		expect(status.headers.get("x-job")).toBe("queued");
		expect(await json.json()).toEqual({ standalone: true });
	});
});

describe("cookies", () => {
	test("a cookie set by one route round-trips to another", async () => {
		const login = await fetch(`${base}/login`);
		const setCookie = login.headers.get("set-cookie") ?? "";

		expect(setCookie).toContain("session=s3cr3t");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Max-Age=3600");

		const whoami = await fetch(`${base}/whoami`, {
			headers: { cookie: setCookie.split(";")[0] as string },
		});

		expect(await whoami.json()).toEqual({ session: "s3cr3t" });
	});
});

describe("problem details", () => {
	test("a rejected body schema is a 422 problem document listing every issue", async () => {
		const response = await fetch(`${base}/users`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "", email: "not-an-email" }),
		});
		const body = (await response.json()) as {
			status: number;
			errors?: { path: string; message: string }[];
		};

		expect(response.status).toBe(422);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
		expect(body.status).toBe(422);
		expect(body.errors?.map((issue) => issue.path).sort()).toEqual(["email", "name"]);
	});

	test("a malformed body is a 400, not a 422 (BodyParseError)", async () => {
		const response = await fetch(`${base}/raw`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{ not json",
		});

		expect(response.status).toBe(400);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
	});

	test("a 404 problem document still carries the global middleware header (#65)", async () => {
		const response = await fetch(`${base}/nope`);
		const body = (await response.json()) as { status: number; instance: string };

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
		expect(body.instance).toBe("/nope");
		expect(response.headers.get("x-request-id")).toBe("req_get");
	});

	test("a 405 advertises Allow and keeps the global middleware header", async () => {
		const response = await fetch(`${base}/health`, { method: "POST" });

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
		expect(response.headers.get("x-request-id")).toBe("req_post");
	});

	test("abort(403) becomes a 403 problem document", async () => {
		const response = await fetch(`${base}/admin/secret`);
		const body = (await response.json()) as { status: number; detail: string };

		expect(response.status).toBe(403);
		expect(body.detail).toBe("Admin access requires an invite");
	});

	test.each([
		["bad-request", 400],
		["unauthorized", 401],
		["forbidden", 403],
		["not-found", 404],
		["method-not-allowed", 405],
		["conflict", 409],
		["unprocessable", 422],
		["too-many-requests", 429],
		["internal", 500],
		["teapot", 418],
	])("a thrown %s error maps to %i", async (kind, status) => {
		const response = await fetch(`${base}/errors/${kind}`);

		expect(response.status).toBe(status);
		expect(response.headers.get("content-type")).toContain("application/problem+json");
	});

	test("an HttpError carries its own headers and details through", async () => {
		const [rateLimited, unprocessable] = await Promise.all([
			fetch(`${base}/errors/too-many-requests`),
			fetch(`${base}/errors/unprocessable`),
		]);
		const body = (await unprocessable.json()) as { errors?: { path: string }[] };

		expect(rateLimited.headers.get("retry-after")).toBe("30");
		expect(body.errors?.[0]?.path).toBe("name");
	});

	test("problemResponse + isHttpError render the same document by hand", async () => {
		const response = await fetch(`${base}/inspect/teapot`);

		expect(response.status).toBe(418);
		expect(response.headers.get("x-expected")).toBe("true");
		// An unlisted status keeps its own detail but falls back to a generic
		// class title ("Client Error"), not the RFC reason phrase.
		expect(await response.json()).toMatchObject({
			status: 418,
			title: "Client Error",
			detail: "I am a teapot",
			instance: "/inspect/teapot",
		});
	});

	test("an unexpected error hides its detail in production and shows it in development", async () => {
		const [development, production] = await Promise.all([
			fetch(`${base}/boom`),
			fetch(`${prodBase}/boom`),
		]);
		const devBody = (await development.json()) as { detail?: string };
		const prodBody = (await production.json()) as { detail?: string };

		expect(development.status).toBe(500);
		expect(devBody.detail).toContain("refused the connection");

		expect(production.status).toBe(500);
		expect(prodBody.detail).toBeUndefined();
	});
});

describe("cors()", () => {
	test("a preflight is answered with 204, the allowed methods and Vary", async () => {
		const response = await fetch(`${base}/users/1`, {
			method: "OPTIONS",
			headers: {
				origin: "https://app.example",
				"access-control-request-method": "GET",
				"access-control-request-headers": "content-type",
			},
		});

		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-methods")).toContain("GET");
		expect(response.headers.get("access-control-max-age")).toBe("600");
		expect(response.headers.get("vary")).toContain("Access-Control-Request-Headers");
	});

	test("an actual request gets the CORS headers too", async () => {
		const response = await fetch(`${base}/health`, { headers: { origin: "https://app.example" } });

		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-expose-headers")).toContain("x-request-id");
	});
});

describe("standalone router", () => {
	test("the same routes work through router.fetch() with no Application", async () => {
		const standalone = createApiRouter();

		const health = await standalone.fetch(new Request("http://localhost/health"));
		expect(health.status).toBe(200);
		expect(await health.text()).toBe("ok");
		expect(health.headers.get("x-request-id")).toBe("req_get");
	});

	test("ctx.app is undefined without the provider, so the app-bound route aborts", async () => {
		const standalone = createApiRouter();

		const response = await standalone.fetch(new Request("http://localhost/users/1"));
		const body = (await response.json()) as { detail: string };

		expect(response.status).toBe(503);
		expect(body.detail).toContain("not mounted on an Application");
	});
});
