/**
 * Tests for the first-static-segment route index (#12).
 *
 * The index is a pure performance change: every lookup through a RouteIndex
 * must return exactly what a linear scan of the same routes returns.
 *
 * @see {@link ../src/routes/find.ts}
 */
import { describe, expect, it } from "bun:test";
import { createRouter } from "../src/index.js";
import { compilePath } from "../src/router.js";
import {
	findRoute,
	findRouteByPath,
	getAllowedMethods,
	hasMatchingPath,
	RouteIndex,
	resolveRoute,
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

function indexOf(routes: Route[]): RouteIndex {
	const index = new RouteIndex();
	for (const route of routes) index.add(route);
	return index;
}

describe("RouteIndex", () => {
	it("keeps all routes in registration order", () => {
		const routes = [
			makeRoute("GET", "/api/users"),
			makeRoute("GET", "/:slug"),
			makeRoute("GET", "/health"),
		];
		expect(indexOf(routes).routes).toEqual(routes);
	});

	it("returns static routes plus fallback routes, interleaved in registration order", () => {
		const a = makeRoute("GET", "/:slug");
		const b = makeRoute("GET", "/api/users");
		const c = makeRoute("GET", "/*");
		const d = makeRoute("GET", "/api/posts");
		const e = makeRoute("GET", "/health");
		const index = indexOf([a, b, c, d, e]);

		expect(index.candidates("/api/users")).toEqual([a, b, c, d]);
		expect(index.candidates("/health")).toEqual([a, c, e]);
		expect(index.candidates("/unknown")).toEqual([a, c]);
	});

	it("puts parameter, optional, wildcard and slash-less routes in the fallback bucket", () => {
		const routes = [
			makeRoute("GET", "/:id"),
			makeRoute("GET", "/:id?"),
			makeRoute("GET", "/*"),
			makeRoute("GET", "/**"),
			makeRoute("GET", ""),
		];
		const index = indexOf(routes);
		expect(index.candidates("/anything")).toEqual(routes);
	});

	it("indexes the root route under the empty segment", () => {
		const root = makeRoute("GET", "/");
		const index = indexOf([root, makeRoute("GET", "/api")]);
		expect(index.candidates("/")).toEqual([root]);
	});
});

describe("RouteIndex lookups match a linear scan", () => {
	const routes = [
		makeRoute("GET", "/"),
		makeRoute("GET", "/users/:id", { id: /^\d+$/ }),
		makeRoute("GET", "/:slug"),
		makeRoute("POST", "/users"),
		makeRoute("GET", "/users"),
		makeRoute("PUT", "/users/:id"),
		makeRoute("GET", "/posts/:id?"),
		makeRoute("DELETE", "/:resource/:id"),
		makeRoute("GET", "/assets/*"),
		makeRoute("GET", "/api/v1/items"),
		makeRoute("PATCH", "/api/v1/items/:id"),
		makeRoute("GET", "/api.v2/items"),
		makeRoute("OPTIONS", "/opt"),
		makeRoute("GET", "/**"),
	];
	const index = indexOf(routes);

	const paths = [
		"/",
		"//",
		"",
		"users",
		"/users",
		"/users/",
		"/users/42",
		"/users/abc",
		"/users/42/extra",
		"/posts",
		"/posts/1",
		"/assets",
		"/assets/a/b.css",
		"/api",
		"/api/v1/items",
		"/api/v1/items/7",
		"/api.v2/items",
		"/apixv2/items",
		"/opt",
		"/nothing/here",
		"/__proto__",
		"/constructor/1",
		"/USERS",
		"/users%2F42",
	];
	const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

	for (const path of paths) {
		it(`same results for "${path}"`, () => {
			for (const method of methods) {
				expect(findRoute(index, method, path)).toEqual(findRoute(routes, method, path));
				expect(resolveRoute(index, method, path)).toEqual(resolveRoute(routes, method, path));
			}
			expect(hasMatchingPath(index, path)).toBe(hasMatchingPath(routes, path));
			expect(findRouteByPath(index, path)).toEqual(findRouteByPath(routes, path));
			expect(getAllowedMethods(index, path)).toEqual(getAllowedMethods(routes, path));
		});
	}

	it("picks up routes added after earlier lookups", () => {
		const live = new RouteIndex();
		live.add(makeRoute("GET", "/a"));
		expect(findRoute(live, "GET", "/b")).toBeNull();
		const b = makeRoute("GET", "/b");
		live.add(b);
		expect(findRoute(live, "GET", "/b")?.route).toBe(b);
		const fallback = makeRoute("POST", "/:x");
		live.add(fallback);
		expect(findRoute(live, "POST", "/a")?.route).toBe(fallback);
		expect(findRoute(live, "POST", "/new")?.route).toBe(fallback);
	});
});

describe("router: first match wins across index buckets", () => {
	it("an earlier parameter route beats a later static route", async () => {
		const app = createRouter();
		app.get("/:slug", (ctx) => ({ hit: "param", slug: ctx.params.slug }));
		app.get("/about", () => ({ hit: "static" }));

		const res = await app.fetch(new Request("http://localhost/about"));
		expect(await res.json()).toEqual({ hit: "param", slug: "about" });
	});

	it("an earlier static route beats a later parameter route", async () => {
		const app = createRouter();
		app.get("/about", () => ({ hit: "static" }));
		app.get("/:slug", () => ({ hit: "param" }));

		expect(await (await app.fetch(new Request("http://localhost/about"))).json()).toEqual({
			hit: "static",
		});
		expect(await (await app.fetch(new Request("http://localhost/other"))).json()).toEqual({
			hit: "param",
		});
	});

	it("an earlier wildcard beats a later static route in a group and basePath", async () => {
		const app = createRouter({ basePath: "/v1" });
		app.get("/*", () => ({ hit: "wildcard" }));
		app.group("/api", (router) => {
			router.get("/users", () => ({ hit: "static" }));
		});

		const res = await app.fetch(new Request("http://localhost/v1/api/users"));
		expect(await res.json()).toEqual({ hit: "wildcard" });
	});

	it("group routes are found through the index", async () => {
		const app = createRouter();
		app.group("/api", (router) => {
			router.get("/users", () => ({ hit: "users" }));
			router.get("/posts", () => ({ hit: "posts" }));
		});
		app.get("/health", () => ({ hit: "health" }));

		expect(await (await app.fetch(new Request("http://localhost/api/posts"))).json()).toEqual({
			hit: "posts",
		});
		expect(await (await app.fetch(new Request("http://localhost/health"))).json()).toEqual({
			hit: "health",
		});
		expect((await app.fetch(new Request("http://localhost/api/nope"))).status).toBe(404);
	});
});

describe("router: 405, HEAD and OPTIONS unchanged with the index", () => {
	function build() {
		const app = createRouter();
		app.post("/:resource", () => ({ hit: "create" }));
		app.get("/users", () => ({ hit: "list" }));
		app.delete("/users", () => ({ hit: "delete" }));
		app.put("/:resource/:id", () => ({ hit: "update" }));
		return app;
	}

	it("405 Allow merges methods from static and fallback buckets", async () => {
		const res = await build().fetch(new Request("http://localhost/users", { method: "PATCH" }));
		expect(res.status).toBe(405);
		expect(res.headers.get("Allow")).toBe("DELETE, GET, HEAD, OPTIONS, POST");
	});

	it("405 Allow for a path only fallback routes serve", async () => {
		const res = await build().fetch(new Request("http://localhost/posts", { method: "GET" }));
		expect(res.status).toBe(405);
		expect(res.headers.get("Allow")).toBe("OPTIONS, POST");
	});

	it("HEAD falls back to the indexed GET route", async () => {
		const res = await build().fetch(new Request("http://localhost/users", { method: "HEAD" }));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
	});

	it("OPTIONS lists methods from both buckets", async () => {
		const res = await build().fetch(new Request("http://localhost/users", { method: "OPTIONS" }));
		expect(res.status).toBe(204);
		expect(res.headers.get("Allow")).toBe("DELETE, GET, HEAD, OPTIONS, POST");
	});

	it("OPTIONS on an unknown path is still 404", async () => {
		const res = await build().fetch(new Request("http://localhost/a/b/c", { method: "OPTIONS" }));
		expect(res.status).toBe(404);
	});
});
