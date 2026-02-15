/**
 * Unit tests for extractParams() and checkConstraints().
 *
 * Tests these functions directly with pre-compiled route objects
 * rather than going through the full app stack.
 *
 * @see {@link ../src/router.ts}
 */
import { describe, expect, it } from "bun:test";
import { checkConstraints, compilePath, extractParams } from "../src/router.js";
import type { HttpMethod, Route } from "../src/types/index.js";

/** Helper: create a minimal Route for testing */
function makeRoute(path: string, method: HttpMethod = "GET"): Route {
	const compiled = compilePath(path);
	return {
		method,
		path,
		pattern: compiled.pattern,
		paramNames: compiled.paramNames,
		handler: () => null,
		optionalParams: compiled.optionalParams.length > 0 ? compiled.optionalParams : undefined,
	};
}

describe("extractParams()", () => {
	it("extracts a single parameter", () => {
		const route = makeRoute("/users/:id");
		expect(extractParams("/users/42", route)).toEqual({ id: "42" });
	});

	it("extracts multiple parameters", () => {
		const route = makeRoute("/users/:userId/posts/:postId");
		expect(extractParams("/users/1/posts/99", route)).toEqual({
			userId: "1",
			postId: "99",
		});
	});

	it("returns empty object when path does not match", () => {
		const route = makeRoute("/users/:id");
		expect(extractParams("/posts/42", route)).toEqual({});
	});

	it("omits missing optional parameters", () => {
		const route = makeRoute("/users/:id?");
		expect(extractParams("/users", route)).toEqual({});
	});

	it("includes present optional parameters", () => {
		const route = makeRoute("/users/:id?");
		expect(extractParams("/users/42", route)).toEqual({ id: "42" });
	});

	it("handles mix of required and optional parameters", () => {
		const route = makeRoute("/users/:id/posts/:slug?");

		// Both present
		expect(extractParams("/users/1/posts/hello", route)).toEqual({
			id: "1",
			slug: "hello",
		});

		// Optional missing
		expect(extractParams("/users/1/posts", route)).toEqual({
			id: "1",
		});
	});

	it("extracts parameters with special characters", () => {
		const route = makeRoute("/files/:name");
		expect(extractParams("/files/my-file_v2.txt", route)).toEqual({
			name: "my-file_v2.txt",
		});
	});

	it("decodes URL-encoded parameter values", () => {
		const route = makeRoute("/users/:name");
		expect(extractParams("/users/hello%20world", route)).toEqual({
			name: "hello world",
		});
	});

	it("returns raw value for malformed percent-encoding", () => {
		const route = makeRoute("/users/:name");
		// %ZZ is not valid percent-encoding — gracefully returns raw value
		expect(extractParams("/users/hello%ZZworld", route)).toEqual({
			name: "hello%ZZworld",
		});
	});
});

describe("checkConstraints()", () => {
	it("returns true when no constraints provided", () => {
		expect(checkConstraints({ id: "42" })).toBe(true);
	});

	it("returns true when constraints is undefined", () => {
		expect(checkConstraints({ id: "42" }, undefined)).toBe(true);
	});

	it("passes when param matches constraint", () => {
		expect(checkConstraints({ id: "123" }, { id: /^\d+$/ })).toBe(true);
	});

	it("fails when param does not match constraint", () => {
		expect(checkConstraints({ id: "abc" }, { id: /^\d+$/ })).toBe(false);
	});

	it("checks multiple constraints — all must pass", () => {
		const constraints = { id: /^\d+$/, slug: /^[a-z-]+$/ };
		expect(checkConstraints({ id: "42", slug: "hello-world" }, constraints)).toBe(true);
		expect(checkConstraints({ id: "42", slug: "Hello" }, constraints)).toBe(false);
	});

	it("skips constraint check for missing optional params", () => {
		// If param is undefined (optional and not provided), constraint is skipped
		expect(checkConstraints({ id: undefined }, { id: /^\d+$/ })).toBe(true);
	});

	it("ignores constraints for params not in constraints map", () => {
		expect(checkConstraints({ id: "42", name: "test" }, { id: /^\d+$/ })).toBe(true);
	});
});
