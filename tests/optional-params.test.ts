/**
 * Optional Parameters Tests
 *
 * TDD Red Phase: These tests define the expected behavior for optional
 * route parameters. Tests should FAIL until the feature is implemented.
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

describe("Optional Route Parameters", () => {
	describe("basic optional params", () => {
		it("should match route with optional param provided", async () => {
			const app = createApp();

			app.get("/users/:id?", (ctx) => ({
				id: ctx.params.id ?? null,
			}));

			const res = await app.fetch(new Request("http://localhost/users/123"));
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ id: "123" });
		});

		it("should match route with optional param omitted", async () => {
			const app = createApp();

			app.get("/users/:id?", (ctx) => ({
				id: ctx.params.id ?? null,
			}));

			const res = await app.fetch(new Request("http://localhost/users"));
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ id: null });
		});

		it("should match route with trailing slash when param omitted", async () => {
			const app = createApp();

			app.get("/users/:id?", (ctx) => ({
				id: ctx.params.id ?? null,
			}));

			const res = await app.fetch(new Request("http://localhost/users/"));
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ id: null });
		});

		it("should set undefined for omitted optional param", async () => {
			const app = createApp();

			app.get("/users/:id?", (ctx) => ({
				hasId: "id" in ctx.params,
				id: ctx.params.id,
			}));

			const res = await app.fetch(new Request("http://localhost/users"));
			const data = (await res.json()) as { id?: string };
			expect(data.id).toBeUndefined();
		});
	});

	describe("multiple optional params", () => {
		it("should support multiple optional params", async () => {
			const app = createApp();

			app.get("/archive/:year?/:month?", (ctx) => ({
				year: ctx.params.year ?? null,
				month: ctx.params.month ?? null,
			}));

			// Both provided
			const both = await app.fetch(new Request("http://localhost/archive/2024/06"));
			expect(await both.json()).toEqual({ year: "2024", month: "06" });

			// Only year
			const yearOnly = await app.fetch(new Request("http://localhost/archive/2024"));
			expect(await yearOnly.json()).toEqual({ year: "2024", month: null });

			// Neither
			const neither = await app.fetch(new Request("http://localhost/archive"));
			expect(await neither.json()).toEqual({ year: null, month: null });
		});
	});

	describe("mixed required and optional params", () => {
		it("should require params before optional ones", async () => {
			const app = createApp();

			app.get("/users/:id/posts/:postId?", (ctx) => ({
				id: ctx.params.id,
				postId: ctx.params.postId ?? null,
			}));

			// All provided
			const all = await app.fetch(new Request("http://localhost/users/42/posts/7"));
			expect(await all.json()).toEqual({ id: "42", postId: "7" });

			// Optional omitted
			const optional = await app.fetch(new Request("http://localhost/users/42/posts"));
			expect(await optional.json()).toEqual({ id: "42", postId: null });

			// Required missing - should 404
			const missing = await app.fetch(new Request("http://localhost/users"));
			expect(missing.status).toBe(404);
		});

		it("should handle prefix before optional param", async () => {
			const app = createApp();

			app.get("/blog/:slug?", (ctx) => ({
				slug: ctx.params.slug ?? "index",
			}));

			const withSlug = await app.fetch(new Request("http://localhost/blog/hello-world"));
			expect(await withSlug.json()).toEqual({ slug: "hello-world" });

			const withoutSlug = await app.fetch(new Request("http://localhost/blog"));
			expect(await withoutSlug.json()).toEqual({ slug: "index" });
		});
	});

	describe("optional params with constraints", () => {
		it("should apply constraints to optional params when provided", async () => {
			const app = createApp();

			app.get("/users/:id?", (ctx) => ({
				id: ctx.params.id ?? null,
			})).whereNumber("id");

			// Valid number
			const valid = await app.fetch(new Request("http://localhost/users/123"));
			expect(valid.status).toBe(200);

			// Invalid (letters)
			const invalid = await app.fetch(new Request("http://localhost/users/abc"));
			expect(invalid.status).toBe(404);

			// Omitted (should still match)
			const omitted = await app.fetch(new Request("http://localhost/users"));
			expect(omitted.status).toBe(200);
		});
	});

	describe("optional params in groups", () => {
		it("should work with optional params in route groups", async () => {
			const app = createApp();

			app.group("/api", (router) => {
				router.get("/items/:id?", (ctx) => ({
					id: ctx.params.id ?? null,
				}));
			});

			const withId = await app.fetch(new Request("http://localhost/api/items/42"));
			expect(await withId.json()).toEqual({ id: "42" });

			const withoutId = await app.fetch(new Request("http://localhost/api/items"));
			expect(await withoutId.json()).toEqual({ id: null });
		});
	});

	describe("edge cases", () => {
		it("should differentiate between similar routes with optional params", async () => {
			const app = createApp();

			app.get("/users", () => ({ route: "list" }));
			app.get("/users/:id", () => ({ route: "show" }));

			const list = await app.fetch(new Request("http://localhost/users"));
			expect(await list.json()).toEqual({ route: "list" });

			const show = await app.fetch(new Request("http://localhost/users/123"));
			expect(await show.json()).toEqual({ route: "show" });
		});

		it("should handle empty string param value", async () => {
			const app = createApp();

			app.get("/search/:query?", (ctx) => ({
				query: ctx.params.query ?? null,
			}));

			// Empty path segment is treated as omitted
			const res = await app.fetch(new Request("http://localhost/search/"));
			expect(await res.json()).toEqual({ query: null });
		});
	});
});
