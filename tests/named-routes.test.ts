/**
 * Named Routes Tests
 *
 * TDD Red Phase: These tests define the expected behavior for named routes
 * and URL generation. Tests should FAIL until the feature is implemented.
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

describe("Named Routes", () => {
	describe("name() method", () => {
		it("should register a named route", async () => {
			const app = createApp();

			app.get("/users", () => ({ users: [] })).name("users.index");

			// Route should work normally
			const res = await app.fetch(new Request("http://localhost/users"));
			expect(res.status).toBe(200);
		});

		it("should allow chaining after name()", async () => {
			const app = createApp();

			// name() should return a builder for chaining
			const result = app
				.get("/users", () => ({ users: [] }))
				.name("users.index")
				.get("/posts", () => ({ posts: [] }))
				.name("posts.index");

			// RouteBuilder should have all the same methods
			expect(typeof result.get).toBe("function");
			expect(typeof result.name).toBe("function");
			expect(typeof result.listen).toBe("function");
		});

		it("should throw on duplicate route names", () => {
			const app = createApp();

			app.get("/users", () => ({})).name("users");

			expect(() => {
				app.get("/other", () => ({})).name("users");
			}).toThrow(/route.*users.*already.*defined/i);
		});
	});

	describe("route() URL generation", () => {
		it("should generate URL for a named route without params", () => {
			const app = createApp();

			app.get("/users", () => ({})).name("users.index");

			expect(app.route("users.index")).toBe("/users");
		});

		it("should generate URL for a named route with params", () => {
			const app = createApp();

			app.get("/users/:id", () => ({})).name("users.show");

			expect(app.route("users.show", { id: 123 })).toBe("/users/123");
		});

		it("should generate URL with multiple params", () => {
			const app = createApp();

			app.get("/users/:userId/posts/:postId", () => ({})).name("users.posts.show");

			expect(app.route("users.posts.show", { userId: 42, postId: 7 })).toBe("/users/42/posts/7");
		});

		it("should throw for unknown route name", () => {
			const app = createApp();

			expect(() => {
				app.route("unknown.route");
			}).toThrow(/route.*unknown\.route.*not.*found/i);
		});

		it("should throw for missing required params", () => {
			const app = createApp();

			app.get("/users/:id", () => ({})).name("users.show");

			expect(() => {
				app.route("users.show"); // Missing 'id' param
			}).toThrow(/missing.*param.*id/i);
		});

		it("should append extra params as query string", () => {
			const app = createApp();

			app.get("/users/:id", () => ({})).name("users.show");

			const url = app.route("users.show", { id: 123, tab: "profile", sort: "name" });
			expect(url).toBe("/users/123?tab=profile&sort=name");
		});

		it("should handle optional params in URL generation", () => {
			const app = createApp();

			app.get("/users/:id?", () => ({})).name("users.show");

			// With param
			expect(app.route("users.show", { id: 123 })).toBe("/users/123");

			// Without param
			expect(app.route("users.show")).toBe("/users");
		});

		it("should URL-encode param values", () => {
			const app = createApp();

			app.get("/search/:query", () => ({})).name("search");

			expect(app.route("search", { query: "hello world" })).toBe("/search/hello%20world");
		});
	});

	describe("hasRoute() check", () => {
		it("should return true for existing named route", () => {
			const app = createApp();

			app.get("/users", () => ({})).name("users.index");

			expect(app.hasRoute("users.index")).toBe(true);
		});

		it("should return false for non-existent route", () => {
			const app = createApp();

			expect(app.hasRoute("unknown")).toBe(false);
		});
	});

	describe("getRoutes() listing", () => {
		it("should return all named routes", () => {
			const app = createApp();

			app.get("/users", () => ({})).name("users.index");
			app.get("/users/:id", () => ({})).name("users.show");
			app.post("/users", () => ({})).name("users.store");

			const routes = app.getRoutes();

			expect(routes).toContainEqual({
				name: "users.index",
				method: "GET",
				path: "/users",
			});
			expect(routes).toContainEqual({
				name: "users.show",
				method: "GET",
				path: "/users/:id",
			});
			expect(routes).toContainEqual({
				name: "users.store",
				method: "POST",
				path: "/users",
			});
		});

		it("should include unnamed routes with null name", () => {
			const app = createApp();

			app.get("/health", () => ({})); // No name
			app.get("/users", () => ({})).name("users.index");

			const routes = app.getRoutes();

			expect(routes).toContainEqual({
				name: null,
				method: "GET",
				path: "/health",
			});
		});
	});
});
