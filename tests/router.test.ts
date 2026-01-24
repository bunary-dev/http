import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("Path Parameters", () => {
	test("extracts single path parameter", async () => {
		const app = createApp();
		app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

		const response = await app.fetch(new Request("http://localhost/users/123"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: "123" });
	});

	test("extracts multiple path parameters", async () => {
		const app = createApp();
		app.get("/users/:userId/posts/:postId", (ctx) => ({
			userId: ctx.params.userId,
			postId: ctx.params.postId,
		}));

		const response = await app.fetch(new Request("http://localhost/users/42/posts/99"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: "42", postId: "99" });
	});

	test("handles parameter at end of path", async () => {
		const app = createApp();
		app.get("/api/v1/items/:itemId", (ctx) => ({ itemId: ctx.params.itemId }));

		const response = await app.fetch(new Request("http://localhost/api/v1/items/abc"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ itemId: "abc" });
	});

	test("handles parameter at beginning of path", async () => {
		const app = createApp();
		app.get("/:version/api", (ctx) => ({ version: ctx.params.version }));

		const response = await app.fetch(new Request("http://localhost/v2/api"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ version: "v2" });
	});

	test("distinguishes between static and parameterized segments", async () => {
		const app = createApp();
		app.get("/users/me", () => ({ type: "current-user" }));
		app.get("/users/:id", (ctx) => ({ type: "user-by-id", id: ctx.params.id }));

		// Static route should match exactly
		const meResponse = await app.fetch(new Request("http://localhost/users/me"));
		expect(await meResponse.json()).toEqual({ type: "current-user" });

		// Parameterized route should match other values
		const idResponse = await app.fetch(new Request("http://localhost/users/123"));
		expect(await idResponse.json()).toEqual({ type: "user-by-id", id: "123" });
	});
});

describe("Query Parameters", () => {
	test("provides query parameters via ctx.query", async () => {
		const app = createApp();
		app.get("/search", (ctx) => ({
			q: ctx.query.get("q"),
			page: ctx.query.get("page"),
		}));

		const response = await app.fetch(new Request("http://localhost/search?q=bunary&page=2"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ q: "bunary", page: "2" });
	});

	test("handles missing query parameters", async () => {
		const app = createApp();
		app.get("/search", (ctx) => ({
			q: ctx.query.get("q"),
			missing: ctx.query.get("missing"),
		}));

		const response = await app.fetch(new Request("http://localhost/search?q=test"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ q: "test", missing: null });
	});

	test("handles multiple values for same query parameter", async () => {
		const app = createApp();
		app.get("/filter", (ctx) => ({
			tags: ctx.query.getAll("tag"),
		}));

		const response = await app.fetch(new Request("http://localhost/filter?tag=a&tag=b&tag=c"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ tags: ["a", "b", "c"] });
	});

	test("combines path and query parameters", async () => {
		const app = createApp();
		app.get("/users/:id/posts", (ctx) => ({
			userId: ctx.params.id,
			sort: ctx.query.get("sort"),
		}));

		const response = await app.fetch(new Request("http://localhost/users/123/posts?sort=date"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: "123", sort: "date" });
	});
});
