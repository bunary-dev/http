/**
 * Tests for the segment-trie route index (#166).
 *
 * The trie is a pure performance change: every lookup through a RouteIndex
 * must return exactly what a linear scan of the same routes returns, while
 * routes under a shared prefix (`/api`, nested groups) are no longer all
 * candidates for every request under that prefix.
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
import type { HttpMethod, Route } from "../src/types/index.js";

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

const get = (app: ReturnType<typeof createRouter>, path: string, method = "GET") =>
	app.fetch(new Request(`http://localhost${path}`, { method }));

describe("RouteIndex trie candidates", () => {
	it("matches an optional parameter with a suffix in its segment when it is left out", () => {
		// compilePath puts the slash inside the optional group, so without the
		// parameter its suffix joins the previous segment: /posts.json
		const json = makeRoute("GET", "/posts/:id?.json");
		const v2 = makeRoute("GET", "/files/:name?-v2");
		const lang = makeRoute("GET", "/:lang?.txt");
		const nested = makeRoute("GET", "/api/:resource/:id?.xml");
		const routes = [json, v2, lang, nested];
		const index = indexOf(routes);

		expect(findRoute(index, "GET", "/posts.json")?.route).toBe(json);
		expect(findRoute(index, "GET", "/posts/7.json")?.params).toEqual({ id: "7" });
		expect(findRoute(index, "GET", "/files-v2")?.route).toBe(v2);
		expect(findRoute(index, "GET", "/files/readme-v2")?.params).toEqual({ name: "readme" });
		// At the root the parameter takes the leading slash with it
		expect(findRoute(index, "GET", ".txt")?.route).toBe(lang);
		expect(findRoute(index, "GET", "/en.txt")?.params).toEqual({ lang: "en" });
		expect(findRoute(index, "GET", "/api/users.xml")?.route).toBe(nested);
		for (const path of [
			"/posts.json",
			"/files-v2",
			".txt",
			"/.txt",
			"/en.txt",
			"/api/users.xml",
			"/x",
		]) {
			expect(resolveRoute(index, "GET", path)).toEqual(resolveRoute(routes, "GET", path));
		}
	});

	it("matches a suffix after several left-out optional parameters", () => {
		// Leaving out both :q? and :t? joins "-v2" to "c"
		const route = makeRoute("GET", "/c/:q?/:t?-v2");
		const routes = [route, makeRoute("GET", "/c/:q?/x/:t?-v2")];
		const index = indexOf(routes);

		expect(findRoute(index, "GET", "/c-v2")?.route).toBe(route);
		// Greedy: :q? takes the segment, :t? is left out
		expect(findRoute(index, "GET", "/c/1-v2")?.params).toEqual({ q: "1" });
		expect(findRoute(index, "GET", "/c/1/2-v2")?.params).toEqual({ q: "1", t: "2" });
		for (const path of ["/c-v2", "/c/1-v2", "/c/1/2-v2", "/c/x-v2", "/c/1/x-v2", "/c/1/x/2-v2"]) {
			expect(resolveRoute(index, "GET", path)).toEqual(resolveRoute(routes, "GET", path));
		}
	});

	it("serves an optional parameter with a suffix through the router", async () => {
		const app = createRouter();
		app.get("/posts/:id?.json", (ctx) => ({ id: ctx.params.id ?? null }));
		app.get("/posts", () => ({ hit: "list" }));
		expect(await (await get(app, "/posts.json")).json()).toEqual({ id: null });
		expect(await (await get(app, "/posts/3.json")).json()).toEqual({ id: "3" });
		expect(await (await get(app, "/posts")).json()).toEqual({ hit: "list" });
	});

	it("handles routes and requests deeper than 30 segments", () => {
		const deep = (n: number, last = "s") =>
			`/${Array.from({ length: n }, (_, i) => (i === n - 1 ? last : `s${i}`)).join("/")}`;
		const paths = [deep(34), deep(35), `${deep(35)}/`, deep(35, "x"), deep(36), deep(80)];
		for (const n of [29, 30, 31, 32, 33]) paths.push(deep(n), `${deep(n)}/`, `${deep(n)}//`);

		const tables = [
			[
				makeRoute("GET", deep(35)),
				makeRoute("GET", deep(35, ":id")),
				makeRoute("GET", "/:a/:b"),
				makeRoute("GET", deep(40, "*")),
			],
			// No wildcard, so depth pruning applies all the way down
			[makeRoute("GET", deep(30)), makeRoute("GET", deep(31)), makeRoute("GET", deep(32))],
		];
		for (const routes of tables) {
			const index = indexOf(routes);
			for (const path of paths) {
				expect(resolveRoute(index, "GET", path)).toEqual(resolveRoute(routes, "GET", path));
			}
		}
		expect(findRoute(indexOf(tables[1] as Route[]), "GET", `${deep(31)}/`)?.route.path).toBe(
			deep(31),
		);
	});

	it("tells apart literal segments whose lookup hashes collide", () => {
		// "Aa" and "BB" share a 31-multiplier string hash
		const aa = makeRoute("GET", "/Aa");
		const bb = makeRoute("GET", "/BB/x");
		const bbRoot = makeRoute("GET", "/BB");
		const index = indexOf([aa, bb, bbRoot]);

		expect(index.candidates("/Aa")).toEqual([aa]);
		expect(index.candidates("/BB")).toEqual([bbRoot]);
		expect(index.candidates("/BB/x")).toEqual([bb]);
		expect(index.candidates("/Aa/x")).toEqual([]);
		expect(findRoute(index, "GET", "/BB")?.route).toBe(bbRoot);
	});

	it("only returns routes along the request's branch under a shared prefix", () => {
		const users = makeRoute("GET", "/api/users");
		const user = makeRoute("GET", "/api/users/:id");
		const posts = makeRoute("GET", "/api/posts");
		const v1 = makeRoute("GET", "/api/v1/items");
		const index = indexOf([users, user, posts, v1]);

		expect(index.candidates("/api/users")).toEqual([users]);
		expect(index.candidates("/api/users/7")).toEqual([user]);
		expect(index.candidates("/api/posts")).toEqual([posts]);
		expect(index.candidates("/api/v1/items")).toEqual([v1]);
		expect(index.candidates("/api/nope")).toEqual([]);
	});

	it("follows the static child and the parameter branch, in registration order", () => {
		const x = makeRoute("GET", "/api/:x");
		const users = makeRoute("GET", "/api/users");
		const tenant = makeRoute("GET", "/:tenant/users");
		const index = indexOf([x, users, tenant]);

		expect(index.candidates("/api/users")).toEqual([x, users, tenant]);
		expect(index.candidates("/acme/users")).toEqual([tenant]);
	});

	it("stores optional and wildcard routes where their static prefix ends", () => {
		const opt = makeRoute("GET", "/api/posts/:id?");
		const wild = makeRoute("GET", "/api/files/*");
		const deep = makeRoute("GET", "/api/**");
		const index = indexOf([opt, wild, deep]);

		expect(index.candidates("/api/posts")).toEqual([opt, deep]);
		expect(index.candidates("/api/posts/1")).toEqual([opt, deep]);
		expect(index.candidates("/api/files/a/b/c")).toEqual([wild, deep]);
		expect(index.candidates("/other")).toEqual([]);
	});
});

describe("router: first match wins with the trie", () => {
	it("an earlier parameter route beats a later static route under a shared prefix", async () => {
		const app = createRouter();
		app.group("/api", (router) => {
			router.get("/:x", (ctx) => ({ hit: "param", x: ctx.params.x }));
			router.get("/users", () => ({ hit: "static" }));
		});
		expect(await (await get(app, "/api/users")).json()).toEqual({ hit: "param", x: "users" });
	});

	it("an earlier parameter route beats a later static route at the root", async () => {
		const app = createRouter();
		app.get("/:x", (ctx) => ({ hit: "param", x: ctx.params.x }));
		app.get("/users", () => ({ hit: "static" }));
		expect(await (await get(app, "/users")).json()).toEqual({ hit: "param", x: "users" });
	});

	it("an earlier static route beats a later parameter route under a shared prefix", async () => {
		const app = createRouter();
		app.get("/api/users", () => ({ hit: "static" }));
		app.get("/api/:x", () => ({ hit: "param" }));
		expect(await (await get(app, "/api/users")).json()).toEqual({ hit: "static" });
		expect(await (await get(app, "/api/other")).json()).toEqual({ hit: "param" });
	});

	it("matches optional params and wildcards under a shared prefix", async () => {
		const app = createRouter();
		app.group("/api", (router) => {
			router.get("/posts/:id?", (ctx) => ({ hit: "posts", id: ctx.params.id ?? null }));
			router.get("/files/*", (ctx) => ({ hit: "files", rest: ctx.params["*"] ?? null }));
			router.get("/users", () => ({ hit: "users" }));
		});
		expect(await (await get(app, "/api/posts")).json()).toEqual({ hit: "posts", id: null });
		expect(await (await get(app, "/api/posts/3")).json()).toEqual({ hit: "posts", id: "3" });
		expect(await (await get(app, "/api/files")).json()).toEqual({ hit: "files", rest: null });
		expect(await (await get(app, "/api/files/a/b.txt")).json()).toEqual({
			hit: "files",
			rest: "a/b.txt",
		});
		expect((await get(app, "/api/posts/3/4")).status).toBe(404);
	});

	it("matches nested groups", async () => {
		const app = createRouter();
		app.group("/api", (api) => {
			api.group("/v1", (v1) => {
				v1.get("/users/:id", (ctx) => ({ v: 1, id: ctx.params.id }));
			});
			api.group("/v2", (v2) => {
				v2.get("/users/:id", (ctx) => ({ v: 2, id: ctx.params.id }));
			});
		});
		expect(await (await get(app, "/api/v1/users/5")).json()).toEqual({ v: 1, id: "5" });
		expect(await (await get(app, "/api/v2/users/6")).json()).toEqual({ v: 2, id: "6" });
		expect((await get(app, "/api/v3/users/6")).status).toBe(404);
	});

	it("405 + Allow, HEAD and OPTIONS under a shared prefix", async () => {
		const app = createRouter();
		app.group("/api", (router) => {
			router.post("/:resource", () => ({ hit: "create" }));
			router.get("/users", () => ({ hit: "list" }));
			router.delete("/users", () => ({ hit: "delete" }));
			router.get("/posts", () => ({ hit: "posts" }));
		});

		const patch = await get(app, "/api/users", "PATCH");
		expect(patch.status).toBe(405);
		expect(patch.headers.get("Allow")).toBe("DELETE, GET, HEAD, OPTIONS, POST");

		const head = await get(app, "/api/users", "HEAD");
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");

		const options = await get(app, "/api/users", "OPTIONS");
		expect(options.status).toBe(204);
		expect(options.headers.get("Allow")).toBe("DELETE, GET, HEAD, OPTIONS, POST");

		const onlyPost = await get(app, "/api/other", "GET");
		expect(onlyPost.status).toBe(405);
		expect(onlyPost.headers.get("Allow")).toBe("OPTIONS, POST");

		expect((await get(app, "/api/a/b", "OPTIONS")).status).toBe(404);
	});

	it("keeps trailing-slash and empty-path behaviour", async () => {
		const app = createRouter();
		app.get("/", () => ({ hit: "root" }));
		app.get("/api/users", () => ({ hit: "users" }));
		expect(await (await get(app, "/api/users/")).json()).toEqual({ hit: "users" });
		expect(await (await get(app, "/")).json()).toEqual({ hit: "root" });
		expect(await (await get(app, "")).json()).toEqual({ hit: "root" });
		expect((await get(app, "/api/users//")).status).toBe(404);

		const routes = [makeRoute("GET", ""), makeRoute("GET", "/"), makeRoute("GET", "/api/")];
		const index = indexOf(routes);
		for (const path of ["", "/", "//", "/api", "/api/", "/api//", "api"]) {
			expect(resolveRoute(index, "GET", path)).toEqual(resolveRoute(routes, "GET", path));
			expect(getAllowedMethods(index, path)).toEqual(getAllowedMethods(routes, path));
		}
	});
});

describe("trie equivalence with a linear scan over a mixed table", () => {
	const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
	const resources = ["users", "posts", "items", "orders", "tags"];
	const routes: Route[] = [];
	const add = (method: HttpMethod, path: string, constraints?: Record<string, RegExp>) =>
		routes.push(makeRoute(method, path, constraints));

	// Static, param-first, optional, wildcard and nested group routes, interleaved
	add("GET", "/");
	// Optional parameters with a suffix, early so they decide their requests
	add("GET", "/posts/:id?.json");
	add("GET", "/files/:name?-v2");
	add("GET", "/api/:resource/:id?.xml");
	add("GET", "/:lang?.txt");
	add("GET", "/a/:x?/b");
	add("GET", "/c/:q?/:t?-v2");
	add("GET", "/:slug");
	add("GET", "/health");
	for (const [i, resource] of resources.entries()) {
		add("GET", `/api/${resource}`);
		add("POST", `/api/${resource}`);
		add("GET", `/api/${resource}/:id`, i % 2 === 0 ? { id: /^\d+$/ } : undefined);
		add(methods[i % methods.length] as HttpMethod, `/api/${resource}/:id`);
		add("GET", `/api/${resource}/:id/comments/:cid?`);
		for (const version of ["v1", "v2", "v3"]) {
			add("GET", `/api/${version}/${resource}`);
			add("PUT", `/api/${version}/${resource}/:id`);
			add("GET", `/api/${version}/${resource}/:id/files/*`);
			add("DELETE", `/api/${version}/${resource}/:id/:action`);
		}
	}
	add("POST", "/api/:resource");
	add("GET", "/api/:resource/:id/export");
	add("PATCH", "/:tenant/api/:resource");
	add("GET", "/assets/**");
	add("GET", "/docs/:page?");
	add("GET", "/api/users");
	for (let i = 0; routes.length < 195; i++) {
		add(methods[i % methods.length] as HttpMethod, `/g${i % 7}/r${i}${i % 3 === 0 ? "/:id" : ""}`);
	}
	add("GET", "/api/**");
	add("DELETE", "/:a/:b/:c");
	add("GET", "/**");
	add("GET", "");
	add("GET", "/api.v2/items");
	add("GET", "/files/:name.json");
	add("GET", "/opt/:a?/tail");
	add("POST", "/api/users/");
	add("GET", "/api//double");
	add("GET", "/:");

	const index = indexOf(routes);

	const paths = [
		"",
		"/",
		"//",
		"api",
		"/health",
		"/health/",
		"/about",
		"/api",
		"/api/",
		"/api//users",
		"/api.v2/items",
		"/apixv2/items",
		"/assets",
		"/assets/a/b/c.css",
		"/docs",
		"/docs/intro",
		"/docs/intro/more",
		"/g3/r3/9",
		"/g3/r3",
		"/g0/r7",
		"/g5/nope",
		"/acme/api/users",
		"/x/y/z",
		"/x/y/z/w",
		"/USERS",
		"/__proto__",
		"/constructor/1",
		"/users%2F42",
		"/files/a.json",
		"/files/.json",
		"/files/a.txt",
		"/opt/tail",
		"/opt/x/tail",
		"/opt//tail",
		"/api//double",
		"/api//double/",
		"/api/users//",
		"/:",
		"/posts.json",
		"/posts/7.json",
		"/posts/.json",
		"/posts.jsonx",
		"/files-v2",
		"/files/readme-v2",
		"/files-v3",
		"/api/users.xml",
		"/api/users/9.xml",
		"/api.xml",
		"/.txt",
		".txt",
		"/en.txt",
		"/a/b",
		"/a/q/b",
		"/c-v2",
		"/c/x-v2",
		"/c/x/y-v2",
		"/c/x/y",
	];
	for (const resource of [...resources, "unknown"]) {
		paths.push(
			`/api/${resource}`,
			`/api/${resource}/`,
			`/api/${resource}/42`,
			`/api/${resource}/abc`,
			`/api/${resource}/42/export`,
			`/api/${resource}/42/comments`,
			`/api/${resource}/42/comments/7`,
			`/api/${resource}/42/comments/7/8`,
		);
		for (const version of ["v1", "v2", "v4"]) {
			paths.push(
				`/api/${version}/${resource}`,
				`/api/${version}/${resource}/1`,
				`/api/${version}/${resource}/1/files`,
				`/api/${version}/${resource}/1/files/a/b`,
				`/api/${version}/${resource}/1/archive`,
			);
		}
	}
	const requestMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

	it("registers ~200 routes", () => {
		expect(routes.length).toBeGreaterThanOrEqual(200);
		expect(index.routes).toEqual(routes);
	});

	it("resolves every request identically", () => {
		for (const path of paths) {
			for (const method of requestMethods) {
				expect(resolveRoute(index, method, path)).toEqual(resolveRoute(routes, method, path));
				expect(findRoute(index, method, path)).toEqual(findRoute(routes, method, path));
			}
			expect(getAllowedMethods(index, path)).toEqual(getAllowedMethods(routes, path));
			expect(hasMatchingPath(index, path)).toBe(hasMatchingPath(routes, path));
			expect(findRouteByPath(index, path)).toEqual(findRouteByPath(routes, path));
		}
	});
});
