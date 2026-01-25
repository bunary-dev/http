/**
 * Route Constraints Tests
 *
 * These tests define and verify the expected behavior for route
 * parameter constraints in the implemented feature.
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

describe("Route Constraints", () => {
	describe("where() method", () => {
		it("should match when param satisfies regex constraint", async () => {
			const app = createApp();

			app.get("/users/:id", (ctx) => ({ id: ctx.params.id })).where("id", /^\d+$/);

			const res = await app.fetch(new Request("http://localhost/users/123"));
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ id: "123" });
		});

		it("should return 404 when param fails regex constraint", async () => {
			const app = createApp();

			app.get("/users/:id", (ctx) => ({ id: ctx.params.id })).where("id", /^\d+$/);

			const res = await app.fetch(new Request("http://localhost/users/abc"));
			expect(res.status).toBe(404);
		});

		it("should support string regex pattern", async () => {
			const app = createApp();

			app.get("/users/:id", (ctx) => ({ id: ctx.params.id })).where("id", "^\\d+$");

			const valid = await app.fetch(new Request("http://localhost/users/123"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/users/abc"));
			expect(invalid.status).toBe(404);
		});

		it("should support multiple constraints", async () => {
			const app = createApp();

			app.get("/users/:id/posts/:slug", (ctx) => ({
				id: ctx.params.id,
				slug: ctx.params.slug,
			}))
				.where("id", /^\d+$/)
				.where("slug", /^[a-z0-9-]+$/);

			const valid = await app.fetch(new Request("http://localhost/users/123/posts/hello-world"));
			expect(valid.status).toBe(200);

			const invalidId = await app.fetch(new Request("http://localhost/users/abc/posts/hello-world"));
			expect(invalidId.status).toBe(404);

			const invalidSlug = await app.fetch(new Request("http://localhost/users/123/posts/Hello World"));
			expect(invalidSlug.status).toBe(404);
		});

		it("should support object syntax for multiple constraints", async () => {
			const app = createApp();

			app.get("/users/:id/posts/:slug", (ctx) => ({
				id: ctx.params.id,
				slug: ctx.params.slug,
			})).where({
				id: /^\d+$/,
				slug: /^[a-z0-9-]+$/,
			});

			const valid = await app.fetch(new Request("http://localhost/users/123/posts/hello-world"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/users/abc/posts/hello-world"));
			expect(invalid.status).toBe(404);
		});

		it("should allow chaining after where()", async () => {
			const app = createApp();

			const result = app
				.get("/users/:id", () => ({}))
				.where("id", /^\d+$/)
				.name("users.show")
				.get("/posts/:id", () => ({}))
				.where("id", /^\d+$/);

			// RouteBuilder should have all the same methods
			expect(typeof result.get).toBe("function");
			expect(typeof result.where).toBe("function");
			expect(typeof result.name).toBe("function");
			expect(typeof result.listen).toBe("function");
		});
	});

	describe("helper methods", () => {
		it("whereNumber() should constrain to digits only", async () => {
			const app = createApp();

			app.get("/users/:id", (ctx) => ({ id: ctx.params.id })).whereNumber("id");

			const valid = await app.fetch(new Request("http://localhost/users/123"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/users/12a"));
			expect(invalid.status).toBe(404);
		});

		it("whereAlpha() should constrain to letters only", async () => {
			const app = createApp();

			app.get("/category/:name", (ctx) => ({ name: ctx.params.name })).whereAlpha("name");

			const valid = await app.fetch(new Request("http://localhost/category/electronics"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/category/electronics123"));
			expect(invalid.status).toBe(404);
		});

		it("whereAlphaNumeric() should constrain to letters and digits", async () => {
			const app = createApp();

			app.get("/code/:code", (ctx) => ({ code: ctx.params.code })).whereAlphaNumeric("code");

			const valid = await app.fetch(new Request("http://localhost/code/ABC123"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/code/ABC-123"));
			expect(invalid.status).toBe(404);
		});

		it("whereUuid() should constrain to UUID format", async () => {
			const app = createApp();

			app.get("/items/:id", (ctx) => ({ id: ctx.params.id })).whereUuid("id");

			const valid = await app.fetch(
				new Request("http://localhost/items/550e8400-e29b-41d4-a716-446655440000"),
			);
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/items/not-a-uuid"));
			expect(invalid.status).toBe(404);
		});

		it("whereUlid() should constrain to ULID format", async () => {
			const app = createApp();

			app.get("/items/:id", (ctx) => ({ id: ctx.params.id })).whereUlid("id");

			const valid = await app.fetch(
				new Request("http://localhost/items/01ARZ3NDEKTSV4RRFFQ69G5FAV"),
			);
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/items/not-a-ulid"));
			expect(invalid.status).toBe(404);
		});

		it("whereIn() should constrain to specific values", async () => {
			const app = createApp();

			app.get("/status/:status", (ctx) => ({ status: ctx.params.status }))
				.whereIn("status", ["active", "inactive", "pending"]);

			const valid = await app.fetch(new Request("http://localhost/status/active"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/status/unknown"));
			expect(invalid.status).toBe(404);
		});

		it("should support chaining multiple helper methods", async () => {
			const app = createApp();

			app.get("/users/:id/status/:status", (ctx) => ({
				id: ctx.params.id,
				status: ctx.params.status,
			}))
				.whereNumber("id")
				.whereIn("status", ["active", "inactive"]);

			const valid = await app.fetch(new Request("http://localhost/users/123/status/active"));
			expect(valid.status).toBe(200);

			const invalidId = await app.fetch(new Request("http://localhost/users/abc/status/active"));
			expect(invalidId.status).toBe(404);

			const invalidStatus = await app.fetch(new Request("http://localhost/users/123/status/banned"));
			expect(invalidStatus.status).toBe(404);
		});
	});

	describe("constraints in groups", () => {
		it("should apply constraints to routes within groups", async () => {
			const app = createApp();

			app.group("/api", (router) => {
				router.get("/users/:id", (ctx) => ({ id: ctx.params.id })).whereNumber("id");
			});

			const valid = await app.fetch(new Request("http://localhost/api/users/123"));
			expect(valid.status).toBe(200);

			const invalid = await app.fetch(new Request("http://localhost/api/users/abc"));
			expect(invalid.status).toBe(404);
		});
	});

	describe("error handling", () => {
		it("should throw descriptive error for invalid regex pattern", () => {
			const app = createApp();

			expect(() => {
				app.get("/users/:id", () => ({})).where("id", "(?<");
			}).toThrow('Invalid regex pattern for parameter "id"');
		});

		it("should throw descriptive error for invalid pattern in object syntax", () => {
			const app = createApp();

			expect(() => {
				app.get("/users/:id/posts/:slug", () => ({})).where({
					id: "^\\d+$",
					slug: "[invalid",
				});
			}).toThrow('Invalid regex pattern for parameter "slug"');
		});
	});
});
