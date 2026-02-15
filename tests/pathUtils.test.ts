/**
 * Unit tests for normalizePrefix() and joinPaths().
 *
 * Covers edge cases: empty strings, double slashes, root paths,
 * and various prefix/path combinations.
 *
 * @see {@link ../src/pathUtils.ts}
 */
import { describe, expect, it } from "bun:test";
import { joinPaths, normalizePrefix } from "../src/pathUtils.js";

describe("normalizePrefix()", () => {
	it("adds leading slash when missing", () => {
		expect(normalizePrefix("api")).toBe("/api");
	});

	it("preserves existing leading slash", () => {
		expect(normalizePrefix("/api")).toBe("/api");
	});

	it("removes trailing slash", () => {
		expect(normalizePrefix("/api/")).toBe("/api");
	});

	it("adds leading and removes trailing slash", () => {
		expect(normalizePrefix("api/")).toBe("/api");
	});

	it("returns root as-is", () => {
		expect(normalizePrefix("/")).toBe("/");
	});

	it("handles multi-segment prefix", () => {
		expect(normalizePrefix("api/v1/")).toBe("/api/v1");
	});

	it("handles already-correct prefix", () => {
		expect(normalizePrefix("/api/v1")).toBe("/api/v1");
	});
});

describe("joinPaths()", () => {
	it("joins prefix and path with single slash", () => {
		expect(joinPaths("/api", "/users")).toBe("/api/users");
	});

	it("adds slash between prefix and path without leading slash", () => {
		expect(joinPaths("/api", "users")).toBe("/api/users");
	});

	it("handles double slashes at join point", () => {
		expect(joinPaths("/api/", "/users")).toBe("/api/users");
	});

	it("handles root prefix with path", () => {
		expect(joinPaths("/", "/users")).toBe("/users");
	});

	it("handles root path (returns prefix)", () => {
		expect(joinPaths("/api", "/")).toBe("/api");
	});

	it("handles both root", () => {
		expect(joinPaths("/", "/")).toBe("/");
	});

	it("handles empty path", () => {
		expect(joinPaths("/api", "")).toBe("/api");
	});

	it("normalizes prefix without leading slash", () => {
		expect(joinPaths("api", "/users")).toBe("/api/users");
	});

	it("joins multi-segment prefix and path", () => {
		expect(joinPaths("/api/v1", "/users/list")).toBe("/api/v1/users/list");
	});
});
