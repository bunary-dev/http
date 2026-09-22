/**
 * Routing / HEAD / OPTIONS cleanups (#68).
 *
 * - `//` must not match the root route
 * - HEAD responses advertise `Content-Length` (RFC 9110)
 * - `Allow` advertises the auto-served `HEAD` and `OPTIONS` methods
 * - `listen()` passes `development` and `error` through to `Bun.serve`
 */
import { describe, expect, test } from "bun:test";
import { toHeadResponse } from "../src/handlers/head.js";
import { createRouter } from "../src/index.js";
import { compilePath } from "../src/router.js";

describe("double-slash paths (#68)", () => {
	test('the root route pattern does not match "//"', () => {
		const { pattern } = compilePath("/");

		expect(pattern.test("/")).toBe(true);
		expect(pattern.test("//")).toBe(false);
	});

	test('a request to "//" does not hit the root route', async () => {
		const app = createRouter();
		app.get("/", () => ({ root: true }));

		const response = await app.fetch(new Request("http://localhost//"));

		expect(response.status).toBe(404);
	});

	test('a request to "/" still hits the root route', async () => {
		const app = createRouter();
		app.get("/", () => ({ root: true }));

		const response = await app.fetch(new Request("http://localhost/"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ root: true });
	});

	test("non-root routes keep their optional trailing slash", async () => {
		const app = createRouter();
		app.get("/users", () => ({ users: [] }));

		const withSlash = await app.fetch(new Request("http://localhost/users/"));
		const withoutSlash = await app.fetch(new Request("http://localhost/users"));

		expect(withSlash.status).toBe(200);
		expect(withoutSlash.status).toBe(200);
	});
});

describe("HEAD Content-Length (#68)", () => {
	test("toHeadResponse sets Content-Length to the discarded body length", async () => {
		const original = new Response("hello world", { status: 200 });

		const head = await toHeadResponse(original);

		expect(head.headers.get("Content-Length")).toBe("11");
		expect(await head.text()).toBe("");
	});

	test("toHeadResponse counts bytes, not characters", async () => {
		const original = new Response("héllo", { status: 200 });

		const head = await toHeadResponse(original);

		expect(head.headers.get("Content-Length")).toBe(String(new TextEncoder().encode("héllo").length));
	});

	test("toHeadResponse keeps an existing Content-Length header", async () => {
		const original = new Response("hello", {
			status: 200,
			headers: { "Content-Length": "999" },
		});

		const head = await toHeadResponse(original);

		expect(head.headers.get("Content-Length")).toBe("999");
	});

	test("toHeadResponse leaves bodyless responses without Content-Length", async () => {
		const original = new Response(null, { status: 204 });

		const head = await toHeadResponse(original);

		expect(head.headers.get("Content-Length")).toBeNull();
	});

	test("toHeadResponse preserves status, statusText and headers", async () => {
		const original = new Response("hello world", {
			status: 201,
			statusText: "Created",
			headers: { "x-custom": "value", "content-type": "text/plain" },
		});

		const head = await toHeadResponse(original);

		expect(head.status).toBe(201);
		expect(head.statusText).toBe("Created");
		expect(head.headers.get("x-custom")).toBe("value");
		expect(head.headers.get("content-type")).toBe("text/plain");
	});

	test("a HEAD request through the router advertises Content-Length", async () => {
		const app = createRouter();
		const payload = { users: [] };
		app.get("/users", () => payload);

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(response.headers.get("Content-Length")).toBe(
			String(new TextEncoder().encode(JSON.stringify(payload)).length),
		);
	});
});

describe("Allow advertises auto-served methods (#68)", () => {
	test("OPTIONS Allow includes OPTIONS and HEAD alongside GET", async () => {
		const app = createRouter();
		app.get("/users", () => ({}));
		app.post("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.status).toBe(204);
		expect(response.headers.get("Allow")?.split(", ").sort()).toEqual([
			"GET",
			"HEAD",
			"OPTIONS",
			"POST",
		]);
	});

	test("OPTIONS Allow omits HEAD when no GET route exists", async () => {
		const app = createRouter();
		app.post("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.headers.get("Allow")?.split(", ").sort()).toEqual(["OPTIONS", "POST"]);
	});

	test("OPTIONS Allow keeps an explicitly registered HEAD-free path clean", async () => {
		const app = createRouter();
		app.patch("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.headers.get("Allow")).toBe("OPTIONS, PATCH");
	});

	test("405 Allow includes OPTIONS and HEAD", async () => {
		const app = createRouter();
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "DELETE" }));

		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")?.split(", ").sort()).toEqual(["GET", "HEAD", "OPTIONS"]);
	});

	test("onMethodNotAllowed still receives the concrete registered methods", async () => {
		let received: string[] = [];
		const app = createRouter({
			onMethodNotAllowed: (_ctx, allowed) => {
				received = allowed;
				return new Response("nope", { status: 405 });
			},
		});
		app.get("/users", () => ({}));
		app.post("/users", () => ({}));

		await app.fetch(new Request("http://localhost/users", { method: "DELETE" }));

		expect(received).toEqual(["GET", "POST"]);
	});
});

describe("listen() passthrough options (#68)", () => {
	test("development is forwarded to Bun.serve", () => {
		const app = createRouter();
		app.get("/", () => "ok");

		const server = app.listen({ port: 0, development: true });

		try {
			expect(server.server.development).toBe(true);
		} finally {
			server.stop();
		}
	});

	test("development defaults to Bun's own behaviour when omitted", () => {
		const app = createRouter();
		app.get("/", () => "ok");

		const server = app.listen({ port: 0 });

		try {
			expect(typeof server.server.development).toBe("boolean");
		} finally {
			server.stop();
		}
	});

	test("error is forwarded to Bun.serve and catches a throwing onError", async () => {
		const app = createRouter({
			onError: () => {
				throw new Error("error handler exploded");
			},
		});
		app.get("/boom", () => {
			throw new Error("kaboom");
		});

		const server = app.listen({
			port: 0,
			error: () => new Response("caught by Bun.serve", { status: 503 }),
		});

		try {
			const response = await fetch(`http://localhost:${server.port}/boom`);
			expect(response.status).toBe(503);
			expect(await response.text()).toBe("caught by Bun.serve");
		} finally {
			server.stop();
		}
	});
});
