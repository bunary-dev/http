import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("basePath", () => {
	test("createApp({ basePath }) prefixes all routes", async () => {
		const app = createApp({ basePath: "/api" });
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/api/users"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ users: [] });
	});

	test("basePath with trailing slash is normalized", async () => {
		const app = createApp({ basePath: "/api/" });
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/api/users"));

		expect(response.status).toBe(200);
	});

	test("basePath without leading slash is normalized", async () => {
		const app = createApp({ basePath: "api" });
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/api/users"));

		expect(response.status).toBe(200);
	});

	test("routes without basePath do not match prefixed paths", async () => {
		const app = createApp({ basePath: "/api" });
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(404);
	});

	test("basePath composes with route groups", async () => {
		const app = createApp({ basePath: "/api" });
		app.group("/v1", (router) => {
			router.get("/users", () => ({ users: [] }));
		});

		const response = await app.fetch(new Request("http://localhost/api/v1/users"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ users: [] });
	});

	test("basePath composes with nested route groups", async () => {
		const app = createApp({ basePath: "/api" });
		app.group("/v1", (router) => {
			router.group("/admin", (nestedRouter) => {
				nestedRouter.get("/users", () => ({ users: [] }));
			});
		});

		const response = await app.fetch(new Request("http://localhost/api/v1/admin/users"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ users: [] });
	});

	test("app.route() includes basePath in generated URLs", () => {
		const app = createApp({ basePath: "/api" });
		app.get("/users/:id", () => ({})).name("users.show");

		const url = app.route("users.show", { id: 123 });

		expect(url).toBe("/api/users/123");
	});

	test("app.route() includes basePath with groups", () => {
		const app = createApp({ basePath: "/api" });
		app.group("/v1", (router) => {
			router.get("/users/:id", () => ({})).name("users.show");
		});

		const url = app.route("users.show", { id: 123 });

		expect(url).toBe("/api/v1/users/123");
	});

	test("basePath with root path", async () => {
		const app = createApp({ basePath: "/" });
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(200);
	});

	test("basePath works with path parameters", async () => {
		const app = createApp({ basePath: "/api" });
		app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

		const response = await app.fetch(new Request("http://localhost/api/users/123"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: "123" });
	});

	test("basePath works with optional path parameters", async () => {
		const app = createApp({ basePath: "/api" });
		app.get("/posts/:id?/comments", (ctx) => ({ id: ctx.params.id }));

		const response1 = await app.fetch(new Request("http://localhost/api/posts/123/comments"));
		const response2 = await app.fetch(new Request("http://localhost/api/posts/comments"));

		expect(response1.status).toBe(200);
		expect(await response1.json()).toEqual({ id: "123" });
		expect(response2.status).toBe(200);
		expect(await response2.json()).toEqual({ id: undefined });
	});
});
