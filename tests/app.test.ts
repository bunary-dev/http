import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("createApp()", () => {
	test("returns an app instance with routing methods", () => {
		const app = createApp();

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
		const app = createApp();

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
		const app = createApp();
		app.get("/health", () => ({ status: "ok" }));

		const response = await app.fetch(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	test("POST route responds to POST requests", async () => {
		const app = createApp();
		app.post("/users", () => ({ created: true }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "POST" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ created: true });
	});

	test("PUT route responds to PUT requests", async () => {
		const app = createApp();
		app.put("/users/1", () => ({ updated: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "PUT" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ updated: true });
	});

	test("DELETE route responds to DELETE requests", async () => {
		const app = createApp();
		app.delete("/users/1", () => ({ deleted: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "DELETE" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ deleted: true });
	});

	test("PATCH route responds to PATCH requests", async () => {
		const app = createApp();
		app.patch("/users/1", () => ({ patched: true }));

		const response = await app.fetch(new Request("http://localhost/users/1", { method: "PATCH" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ patched: true });
	});

	test("returns 404 for unregistered routes", async () => {
		const app = createApp();
		app.get("/exists", () => ({ found: true }));

		const response = await app.fetch(new Request("http://localhost/not-found"));

		expect(response.status).toBe(404);
	});

	test("returns 405 for wrong HTTP method", async () => {
		const app = createApp();
		app.get("/users", () => ({ method: "GET" }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "POST" }));

		expect(response.status).toBe(405);
	});

	test("first registered route wins when paths match", async () => {
		const app = createApp();
		app.get("/users", () => ({ first: true }));
		app.get("/users", () => ({ second: true }));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(await response.json()).toEqual({ first: true });
	});
});

describe("listen()", () => {
	test("listen({ port }) returns server with correct port and hostname", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen({ port: 0 }); // 0 = let OS pick port

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");
		expect(typeof server.stop).toBe("function");

		server.stop();
	});

	test("listen({ port, hostname }) returns server with correct values", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen({ port: 0, hostname: "localhost" });

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen(port, hostname) positional form still works", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen(0, "localhost");

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen() with no arguments uses defaults", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen();

		expect(server.port).toBe(3000);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen(port) with only port argument uses default hostname", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen(0);

		expect(server.port).toBeGreaterThanOrEqual(0);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});

	test("listen({}) with empty object uses defaults", () => {
		const app = createApp();
		app.get("/", () => ({}));

		const server = app.listen({});

		expect(server.port).toBe(3000);
		expect(server.hostname).toBe("localhost");

		server.stop();
	});
});
