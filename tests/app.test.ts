import { describe, expect, spyOn, test } from "bun:test";
import { createRouter } from "../src/index.js";

describe("createRouter()", () => {
	test("returns an app instance with routing methods", () => {
		const app = createRouter();

		expect(app).toBeDefined();
		expect(typeof app.get).toBe("function");
		expect(typeof app.post).toBe("function");
		expect(typeof app.put).toBe("function");
		expect(typeof app.delete).toBe("function");
		expect(typeof app.patch).toBe("function");
		expect(typeof app.use).toBe("function");
		expect(typeof app.listen).toBe("function");
		expect(typeof app.fetch).toBe("function");
	});

	test("routing methods return a chainable builder", () => {
		const app = createRouter();

		const result = app
			.get("/", () => ({}))
			.post("/", () => ({}))
			.put("/", () => ({}))
			.delete("/", () => ({}))
			.patch("/", () => ({}));

		// RouteBuilder should have all the same methods as the app
		expect(typeof result.get).toBe("function");
		expect(typeof result.post).toBe("function");
		expect(typeof result.put).toBe("function");
		expect(typeof result.delete).toBe("function");
		expect(typeof result.patch).toBe("function");
		expect(typeof result.use).toBe("function");
		expect(typeof result.listen).toBe("function");
		expect(typeof result.fetch).toBe("function");
	});
});

describe("Route Registration", () => {
	test("GET route responds to GET requests", async () => {
		const app = createRouter();
		app.get("/health", () => ({ status: "ok" }));

		const response = await app.fetch(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	test("POST route responds to POST requests", async () => {
		const app = createRouter();
		app.post("/users", () => ({ created: true }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "POST" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ created: true });
	});

	test("PUT route responds to PUT requests", async () => {
		const app = createRouter();
		app.put("/users/1", () => ({ updated: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "PUT" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ updated: true });
	});

	test("DELETE route responds to DELETE requests", async () => {
		const app = createRouter();
		app.delete("/users/1", () => ({ deleted: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "DELETE" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: true });
	});

	test("PATCH route responds to PATCH requests", async () => {
		const app = createRouter();
		app.patch("/users/1", () => ({ patched: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "PATCH" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ patched: true });
	});

	test("returns 404 for unregistered routes", async () => {
		const app = createRouter();
		app.get("/exists", () => ({ found: true }));

		const response = await app.fetch(new Request("http://localhost/not-found"));

		expect(response.status).toBe(404);
	});

	test("returns 405 for wrong HTTP method", async () => {
		const app = createRouter();
		app.get("/users", () => ({ method: "GET" }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "POST" }));

		expect(response.status).toBe(405);
	});

	test("first registered route wins when paths match", async () => {
		const app = createRouter();
		app.get("/users", () => ({ first: true }));
		app.get("/users", () => ({ second: true }));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(await response.json()).toEqual({ first: true });
	});
});

describe("listen()", () => {
	test("listen({ port }) returns server with correct port and hostname", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen({ port: 0 }); // 0 = let OS pick port

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");
		expect(typeof server.stop).toBe("function");

		server.stop();
	});

	test("listen({ port, hostname }) returns server with correct values", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen({ port: 0, hostname: "localhost" });

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen(port, hostname) positional form still works", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen(0, "localhost");

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen() with no arguments uses defaults", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen();

		expect(server.port).toBe(3000);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen(port) with only port argument uses default hostname", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen(0);

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen({}) with empty object uses defaults", () => {
		const app = createRouter();
		app.get("/", () => ({}));

		const server = app.listen({});

		expect(server.port).toBe(3000);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	describe("Bun.serve pass-through", () => {
		function serveOptionsFor(options: Parameters<ReturnType<typeof createRouter>["listen"]>[0]) {
			const spy = spyOn(Bun, "serve");
			try {
				const app = createRouter();
				app.get("/", () => ({}));
				app.listen(options).stop();
				return spy.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
			} finally {
				spy.mockRestore();
			}
		}

		test("passes maxRequestBodySize and idleTimeout when supplied", () => {
			const serveOptions = serveOptionsFor({
				port: 0,
				maxRequestBodySize: 1024,
				idleTimeout: 30,
			});

			expect(serveOptions.maxRequestBodySize).toBe(1024);
			expect(serveOptions.idleTimeout).toBe(30);
		});

		test("passes tls when supplied", () => {
			const spy = spyOn(Bun, "serve").mockImplementation(
				() => ({ port: 0, hostname: "localhost", stop: () => {} }) as never,
			);
			try {
				const tls = { cert: "CERT", key: "KEY" };
				const app = createRouter();
				app.listen({ port: 0, tls });
				const serveOptions = spy.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
				expect(serveOptions.tls).toBe(tls);
			} finally {
				spy.mockRestore();
			}
		});

		test("omits the options entirely when not supplied", () => {
			const serveOptions = serveOptionsFor({ port: 0 });

			expect("maxRequestBodySize" in serveOptions).toBe(false);
			expect("idleTimeout" in serveOptions).toBe(false);
			expect("tls" in serveOptions).toBe(false);
		});
	});
});
