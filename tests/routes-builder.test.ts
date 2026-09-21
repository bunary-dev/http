/**
 * Unit tests for src/routes/builder.ts — compilePattern(), createRouteBuilder(),
 * and wrapBuilderWithNamePrefix() — imported directly, not through createApp.
 *
 * createRouteBuilder() only needs a Router-shaped object to forward its
 * getters to, so tests build a minimal stub app rather than a real one.
 *
 * @see {@link ../src/routes/builder.ts}
 */
import { describe, expect, it } from "bun:test";
import { compilePath } from "../src/router.js";
import {
	compilePattern,
	createRouteBuilder,
	wrapBuilderWithNamePrefix,
} from "../src/routes/builder.js";
import type { Route, Router } from "../src/types/index.js";

function makeRoute(path = "/users/:id"): Route {
	const compiled = compilePath(path);
	return {
		method: "GET",
		path,
		pattern: compiled.pattern,
		paramNames: compiled.paramNames,
		optionalParams: compiled.optionalParams,
		isWildcard: compiled.isWildcard,
		handler: () => ({}),
	};
}

function makeStubApp(): Router {
	return {
		get: (() => {}) as unknown as Router["get"],
		post: (() => {}) as unknown as Router["post"],
		put: (() => {}) as unknown as Router["put"],
		delete: (() => {}) as unknown as Router["delete"],
		patch: (() => {}) as unknown as Router["patch"],
		use: (() => {}) as unknown as Router["use"],
		group: (() => {}) as unknown as Router["group"],
		route: (() => "/") as unknown as Router["route"],
		hasRoute: (() => false) as unknown as Router["hasRoute"],
		getRoutes: (() => []) as unknown as Router["getRoutes"],
		listen: (() => ({}) as never) as unknown as Router["listen"],
		fetch: (async () => new Response()) as unknown as Router["fetch"],
	};
}

describe("compilePattern()", () => {
	it("compiles a valid regex string", () => {
		const regex = compilePattern("^\\d+$", "id");
		expect(regex.test("123")).toBe(true);
		expect(regex.test("abc")).toBe(false);
	});

	it("throws a descriptive error for an invalid regex", () => {
		expect(() => compilePattern("(unterminated", "id")).toThrow(
			/Invalid regex pattern for parameter "id"/,
		);
	});
});

describe("createRouteBuilder()", () => {
	it("forwards all Router methods through getters", () => {
		const app = makeStubApp();
		const namedRoutes = new Map<string, Route>();
		const builder = createRouteBuilder(makeRoute(), namedRoutes, app);

		expect(builder.get).toBe(app.get);
		expect(builder.post).toBe(app.post);
		expect(builder.put).toBe(app.put);
		expect(builder.delete).toBe(app.delete);
		expect(builder.patch).toBe(app.patch);
		expect(builder.use).toBe(app.use);
		expect(builder.group).toBe(app.group);
		expect(builder.route).toBe(app.route);
		expect(builder.hasRoute).toBe(app.hasRoute);
		expect(builder.getRoutes).toBe(app.getRoutes);
		expect(builder.listen).toBe(app.listen);
		expect(builder.fetch).toBe(app.fetch);
	});

	it("name() assigns the route name and registers it in namedRoutes", () => {
		const app = makeStubApp();
		const namedRoutes = new Map<string, Route>();
		const route = makeRoute();
		const builder = createRouteBuilder(route, namedRoutes, app);

		const result = builder.name("users.show");

		expect(result).toBe(builder);
		expect(route.name).toBe("users.show");
		expect(namedRoutes.get("users.show")).toBe(route);
	});

	it("name() throws when the name is already registered", () => {
		const app = makeStubApp();
		const namedRoutes = new Map<string, Route>([["taken", makeRoute()]]);
		const builder = createRouteBuilder(makeRoute(), namedRoutes, app);

		expect(() => builder.name("taken")).toThrow(/already defined/);
	});

	describe("where()", () => {
		it("adds a single constraint from a RegExp", () => {
			const app = makeStubApp();
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), app);

			const result = builder.where("id", /^\d+$/);

			expect(result).toBe(builder);
			expect(route.constraints?.id?.test("42")).toBe(true);
		});

		it("adds a single constraint from a string pattern", () => {
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), makeStubApp());

			builder.where("id", "^\\d+$");

			expect(route.constraints?.id?.test("42")).toBe(true);
		});

		it("throws when called with a param but no pattern", () => {
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), makeStubApp());

			expect(() => (builder.where as unknown as (p: string) => unknown)("id")).toThrow(
				/Pattern is required for constraint on "id"/,
			);
		});

		it("adds multiple constraints from an object, mixing RegExp and string", () => {
			const route = makeRoute("/users/:id/posts/:slug");
			const builder = createRouteBuilder(route, new Map(), makeStubApp());

			builder.where({ id: /^\d+$/, slug: "^[a-z-]+$" });

			expect(route.constraints?.id?.test("42")).toBe(true);
			expect(route.constraints?.slug?.test("hello-world")).toBe(true);
		});

		it("preserves existing constraints when adding another", () => {
			const route = makeRoute("/users/:id/posts/:slug");
			route.constraints = { id: /^\d+$/ };
			const builder = createRouteBuilder(route, new Map(), makeStubApp());

			builder.where("slug", /^[a-z-]+$/);

			expect(route.constraints?.id).toBeDefined();
			expect(route.constraints?.slug).toBeDefined();
		});
	});

	it("whereNumber() constrains the param to digits", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		builder.whereNumber("id");
		expect(route.constraints?.id?.test("123")).toBe(true);
		expect(route.constraints?.id?.test("abc")).toBe(false);
	});

	it("whereAlpha() constrains the param to letters", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		builder.whereAlpha("id");
		expect(route.constraints?.id?.test("abc")).toBe(true);
		expect(route.constraints?.id?.test("123")).toBe(false);
	});

	it("whereAlphaNumeric() constrains the param to letters and digits", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		builder.whereAlphaNumeric("id");
		expect(route.constraints?.id?.test("a1b2")).toBe(true);
		expect(route.constraints?.id?.test("a1-b2")).toBe(false);
	});

	it("whereUuid() constrains the param to UUID format", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		builder.whereUuid("id");
		expect(route.constraints?.id?.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
		expect(route.constraints?.id?.test("not-a-uuid")).toBe(false);
	});

	it("whereUlid() constrains the param to ULID format", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		builder.whereUlid("id");
		expect(route.constraints?.id?.test("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
		expect(route.constraints?.id?.test("not-a-ulid")).toBe(false);
	});

	describe("whereIn()", () => {
		it("constrains the param to one of the given values", () => {
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), makeStubApp());
			builder.whereIn("status", ["draft", "published"]);
			expect(route.constraints?.status?.test("draft")).toBe(true);
			expect(route.constraints?.status?.test("archived")).toBe(false);
		});

		it("escapes regex special characters in values", () => {
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), makeStubApp());
			builder.whereIn("tag", ["a.b", "c+d"]);
			expect(route.constraints?.tag?.test("a.b")).toBe(true);
			expect(route.constraints?.tag?.test("aXb")).toBe(false);
		});

		it("throws when given an empty values array", () => {
			const route = makeRoute();
			const builder = createRouteBuilder(route, new Map(), makeStubApp());
			expect(() => builder.whereIn("status", [])).toThrow(
				/whereIn requires at least one value for parameter "status"/,
			);
		});
	});
});

describe("wrapBuilderWithNamePrefix()", () => {
	it("returns the original builder unchanged when there is no prefix", () => {
		const builder = createRouteBuilder(makeRoute(), new Map(), makeStubApp());
		expect(wrapBuilderWithNamePrefix(builder, "")).toBe(builder);
	});

	it("prepends the prefix when name() is called on the wrapped builder", () => {
		const namedRoutes = new Map<string, Route>();
		const route = makeRoute();
		const builder = createRouteBuilder(route, namedRoutes, makeStubApp());
		const wrapped = wrapBuilderWithNamePrefix(builder, "admin.");

		wrapped.name("users.show");

		expect(route.name).toBe("admin.users.show");
		expect(namedRoutes.get("admin.users.show")).toBe(route);
	});

	it("forwards other properties straight through to the target builder", () => {
		const route = makeRoute();
		const builder = createRouteBuilder(route, new Map(), makeStubApp());
		const wrapped = wrapBuilderWithNamePrefix(builder, "admin.");

		expect(wrapped.where).toBe(builder.where);
		expect(wrapped.get).toBe(builder.get);
	});
});
