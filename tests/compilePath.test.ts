/**
 * Unit tests for compilePath() — the path-to-regex compiler.
 *
 * These tests exercise compilePath directly, covering edge cases
 * that integration tests miss: empty paths, root paths, special
 * characters, and parameter name validation.
 *
 * @see {@link ../src/router.ts}
 */
import { describe, expect, it } from "bun:test";
import { compilePath } from "../src/router.js";

describe("compilePath()", () => {
	describe("static paths", () => {
		it("compiles root path", () => {
			const result = compilePath("/");
			expect(result.paramNames).toEqual([]);
			expect(result.optionalParams).toEqual([]);
			expect(result.pattern.test("/")).toBe(true);
		});

		it("compiles simple static path", () => {
			const result = compilePath("/users");
			expect(result.pattern.test("/users")).toBe(true);
			expect(result.pattern.test("/users/")).toBe(true); // trailing slash
			expect(result.pattern.test("/other")).toBe(false);
		});

		it("compiles multi-segment static path", () => {
			const result = compilePath("/api/v1/users");
			expect(result.pattern.test("/api/v1/users")).toBe(true);
			expect(result.pattern.test("/api/v1")).toBe(false);
			expect(result.pattern.test("/api/v1/users/extra")).toBe(false);
		});

		it("allows optional trailing slash on static paths", () => {
			const result = compilePath("/users");
			expect(result.pattern.test("/users")).toBe(true);
			expect(result.pattern.test("/users/")).toBe(true);
		});
	});

	describe("required parameters", () => {
		it("extracts single parameter name", () => {
			const result = compilePath("/users/:id");
			expect(result.paramNames).toEqual(["id"]);
			expect(result.optionalParams).toEqual([]);
		});

		it("extracts multiple parameter names in order", () => {
			const result = compilePath("/users/:userId/posts/:postId");
			expect(result.paramNames).toEqual(["userId", "postId"]);
		});

		it("matches parameter segments", () => {
			const { pattern } = compilePath("/users/:id");
			expect(pattern.test("/users/123")).toBe(true);
			expect(pattern.test("/users/abc")).toBe(true);
			expect(pattern.test("/users/")).toBe(false);
			expect(pattern.test("/users")).toBe(false);
		});

		it("does not match slashes within parameter segments", () => {
			const { pattern } = compilePath("/users/:id");
			expect(pattern.test("/users/123/extra")).toBe(false);
		});

		it("supports underscore-prefixed parameter names", () => {
			const result = compilePath("/items/:_id");
			expect(result.paramNames).toEqual(["_id"]);
		});

		it("supports alphanumeric parameter names", () => {
			const result = compilePath("/items/:item2Id");
			expect(result.paramNames).toEqual(["item2Id"]);
		});
	});

	describe("optional parameters", () => {
		it("marks optional parameters", () => {
			const result = compilePath("/users/:id?");
			expect(result.paramNames).toEqual(["id"]);
			expect(result.optionalParams).toEqual(["id"]);
		});

		it("matches with and without optional parameter", () => {
			const { pattern } = compilePath("/users/:id?");
			expect(pattern.test("/users")).toBe(true);
			expect(pattern.test("/users/123")).toBe(true);
		});

		it("handles mix of required and optional parameters", () => {
			const result = compilePath("/users/:id/posts/:postId?");
			expect(result.paramNames).toEqual(["id", "postId"]);
			expect(result.optionalParams).toEqual(["postId"]);

			expect(result.pattern.test("/users/42/posts")).toBe(true);
			expect(result.pattern.test("/users/42/posts/99")).toBe(true);
			expect(result.pattern.test("/users/42")).toBe(false);
		});
	});

	describe("duplicate parameter names", () => {
		it("throws on duplicate parameter names", () => {
			expect(() => compilePath("/users/:id/posts/:id")).toThrow(
				'Duplicate parameter name ":id"',
			);
		});
	});

	describe("special characters in static segments", () => {
		it("escapes regex special characters in static segments", () => {
			const { pattern } = compilePath("/api/v1.0");
			expect(pattern.test("/api/v1.0")).toBe(true);
			expect(pattern.test("/api/v1X0")).toBe(false); // dot should not match any char
		});

		it("escapes parentheses in static segments", () => {
			const { pattern } = compilePath("/files/(legacy)");
			expect(pattern.test("/files/(legacy)")).toBe(true);
		});

		it("escapes brackets in static segments", () => {
			const { pattern } = compilePath("/data/[0]");
			expect(pattern.test("/data/[0]")).toBe(true);
		});
	});
});
