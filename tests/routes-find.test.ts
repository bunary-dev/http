/**
 * Unit tests for the route-resolution helpers in src/routes/find.ts —
 * findRoute(), hasMatchingPath(), findRouteByPath(), and getAllowedMethods() —
 * imported directly, not through createApp.
 *
 * resolveRoute() is exercised extensively already via router.test.ts /
 * headOptions.test.ts through createApp; this file targets the standalone
 * helpers that createApp does not call.
 *
 * @see {@link ../src/routes/find.ts}
 */
import { describe, expect, it } from "bun:test";
import { compilePath } from "../src/router.js";
import {
	findRoute,
	findRouteByPath,
	getAllowedMethods,
	hasMatchingPath,
} from "../src/routes/find.js";
import type { Route } from "../src/types/index.js";

function makeRoute(
	method: Route["method"],
	path: string,
	constraints?: Record<string, RegExp>,
): Route {
	const compiled = compilePath(path);
	return {
		method,
		path,
		pattern: compiled.pattern,
		paramNames: compiled.paramNames,
		optionalParams: compiled.optionalParams,
		isWildcard: compiled.isWildcard,
		handler: () => ({}),
		constraints,
	};
}

describe("findRoute()", () => {
	it("returns the matching route and extracted params", () => {
		const routes = [makeRoute("GET", "/users/:id")];
		const match = findRoute(routes, "GET", "/users/42");
		expect(match).not.toBeNull();
		expect(match?.params).toEqual({ id: "42" });
	});

	it("skips a route whose constraints fail and continues scanning", () => {
		const routes = [
			makeRoute("GET", "/users/:id", { id: /^\d+$/ }),
			makeRoute("GET", "/users/:id/other"),
		];
		// "/users/abc" matches the first pattern but fails its constraint,
		// so findRoute must continue past it rather than returning early.
		expect(findRoute(routes, "GET", "/users/abc")).toBeNull();
	});

	it("returns null when no route matches the path", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(findRoute(routes, "GET", "/posts")).toBeNull();
	});

	it("returns null when the path matches but the method differs", () => {
		const routes = [makeRoute("POST", "/users")];
		expect(findRoute(routes, "GET", "/users")).toBeNull();
	});
});

describe("hasMatchingPath()", () => {
	it("returns true when a route's path pattern matches, regardless of method", () => {
		const routes = [makeRoute("POST", "/users")];
		expect(hasMatchingPath(routes, "/users")).toBe(true);
	});

	it("returns false when no route's pattern matches", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(hasMatchingPath(routes, "/posts")).toBe(false);
	});

	it("returns false when the pattern matches but constraints fail", () => {
		const routes = [makeRoute("GET", "/users/:id", { id: /^\d+$/ })];
		expect(hasMatchingPath(routes, "/users/abc")).toBe(false);
	});
});

describe("findRouteByPath()", () => {
	it("returns the first route whose path matches, ignoring method", () => {
		const routes = [makeRoute("DELETE", "/users/:id")];
		const match = findRouteByPath(routes, "/users/7");
		expect(match?.route.method).toBe("DELETE");
		expect(match?.params).toEqual({ id: "7" });
	});

	it("skips routes with failing constraints and returns null if none match", () => {
		const routes = [makeRoute("GET", "/users/:id", { id: /^\d+$/ })];
		expect(findRouteByPath(routes, "/users/abc")).toBeNull();
	});

	it("returns null when no route's pattern matches the path", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(findRouteByPath(routes, "/posts")).toBeNull();
	});
});

describe("getAllowedMethods()", () => {
	it("collects and sorts all methods whose pattern matches the path", () => {
		const routes = [
			makeRoute("POST", "/users"),
			makeRoute("GET", "/users"),
			makeRoute("DELETE", "/users"),
		];
		expect(getAllowedMethods(routes, "/users")).toEqual(["DELETE", "GET", "POST"]);
	});

	it("excludes methods whose constraints fail", () => {
		const routes = [
			makeRoute("GET", "/users/:id", { id: /^\d+$/ }),
			makeRoute("POST", "/users/:id"),
		];
		expect(getAllowedMethods(routes, "/users/abc")).toEqual(["POST"]);
	});

	it("returns an empty array when nothing matches the path", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(getAllowedMethods(routes, "/posts")).toEqual([]);
	});
});
