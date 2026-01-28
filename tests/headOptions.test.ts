import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("HEAD requests", () => {
	test("HEAD request to GET route returns 200 with empty body", async () => {
		const app = createApp();
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(response.headers.get("Content-Type")).toBe("application/json");
	});

	test("HEAD request preserves response headers from GET handler", async () => {
		const app = createApp();
		app.get("/users", () => {
			return new Response(JSON.stringify({ users: [] }), {
				headers: { "X-Custom-Header": "test" },
			});
		});

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(response.headers.get("X-Custom-Header")).toBe("test");
	});

	test("HEAD request to non-existent route returns 404", async () => {
		const app = createApp();
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/posts", { method: "HEAD" }));

		expect(response.status).toBe(404);
	});

	test("HEAD request to route with wrong method returns 405", async () => {
		const app = createApp();
		app.post("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(405);
	});

	test("HEAD request works with path parameters", async () => {
		const app = createApp();
		app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

		const response = await app.fetch(new Request("http://localhost/users/123", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	test("HEAD request works with middleware", async () => {
		const app = createApp();
		app.use((ctx, next) => {
			ctx.locals.test = "middleware";
			return next();
		});
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	test("HEAD request preserves status code from GET handler", async () => {
		const app = createApp();
		app.get("/users", () => {
			return new Response(JSON.stringify({ users: [] }), { status: 201 });
		});

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(201);
		expect(await response.text()).toBe("");
	});
});

describe("OPTIONS requests", () => {
	test("OPTIONS request to existing route returns 204 with Allow header", async () => {
		const app = createApp();
		app.get("/users", () => ({ users: [] }));
		app.post("/users", () => ({ created: true }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.status).toBe(204);
		const allowHeader = response.headers.get("Allow");
		expect(allowHeader).toBeTruthy();
		expect(allowHeader?.split(", ").sort()).toEqual(["GET", "POST"].sort());
		expect(await response.text()).toBe("");
	});

	test("OPTIONS request includes all methods for a path", async () => {
		const app = createApp();
		app.get("/users", () => ({}));
		app.post("/users", () => ({}));
		app.put("/users", () => ({}));
		app.delete("/users", () => ({}));
		app.patch("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.status).toBe(204);
		const allowHeader = response.headers.get("Allow");
		const methods = allowHeader?.split(", ").sort() || [];
		expect(methods).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
	});

	test("OPTIONS request to non-existent route returns 404", async () => {
		const app = createApp();
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/posts", { method: "OPTIONS" }));

		expect(response.status).toBe(404);
		expect(response.headers.get("Allow")).toBeNull();
	});

	test("OPTIONS request works with path parameters", async () => {
		const app = createApp();
		app.get("/users/:id", () => ({}));
		app.put("/users/:id", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users/123", { method: "OPTIONS" }));

		expect(response.status).toBe(204);
		const allowHeader = response.headers.get("Allow");
		expect(allowHeader?.split(", ").sort()).toEqual(["GET", "PUT"].sort());
	});

	test("OPTIONS request respects route constraints", async () => {
		const app = createApp();
		app.get("/users/:id", () => ({}))
			.where("id", /^\d+$/);
		app.get("/users/:id", () => ({}))
			.where("id", /^[a-z]+$/);

		// Only numeric constraint matches
		const response1 = await app.fetch(
			new Request("http://localhost/users/123", { method: "OPTIONS" }),
		);
		expect(response1.status).toBe(204);
		const allow1 = response1.headers.get("Allow");
		expect(allow1).toBe("GET");

		// Only alphabetic constraint matches
		const response2 = await app.fetch(
			new Request("http://localhost/users/abc", { method: "OPTIONS" }),
		);
		expect(response2.status).toBe(204);
		const allow2 = response2.headers.get("Allow");
		expect(allow2).toBe("GET");
	});
});

describe("405 Method Not Allowed with Allow header", () => {
	test("405 response includes Allow header", async () => {
		const app = createApp();
		app.get("/users", () => ({ users: [] }));
		app.post("/users", () => ({ created: true }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

		expect(response.status).toBe(405);
		const allowHeader = response.headers.get("Allow");
		expect(allowHeader).toBeTruthy();
		expect(allowHeader?.split(", ").sort()).toEqual(["GET", "POST"].sort());
	});

	test("405 response includes all allowed methods", async () => {
		const app = createApp();
		app.get("/users", () => ({}));
		app.post("/users", () => ({}));
		app.delete("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

		expect(response.status).toBe(405);
		const allowHeader = response.headers.get("Allow");
		const methods = allowHeader?.split(", ").sort() || [];
		expect(methods).toEqual(["DELETE", "GET", "POST"]);
	});

	test("405 response respects route constraints", async () => {
		const app = createApp();
		app.get("/users/:id", () => ({}))
			.where("id", /^\d+$/);
		app.post("/users/:id", () => ({}))
			.where("id", /^\d+$/);

		const response = await app.fetch(new Request("http://localhost/users/123", { method: "PUT" }));

		expect(response.status).toBe(405);
		const allowHeader = response.headers.get("Allow");
		expect(allowHeader?.split(", ").sort()).toEqual(["GET", "POST"].sort());
	});

	test("405 response works with path parameters", async () => {
		const app = createApp();
		app.get("/users/:id", () => ({}));
		app.delete("/users/:id", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users/123", { method: "POST" }));

		expect(response.status).toBe(405);
		const allowHeader = response.headers.get("Allow");
		expect(allowHeader?.split(", ").sort()).toEqual(["DELETE", "GET"].sort());
	});
});
