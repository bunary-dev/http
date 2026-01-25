/**
 * Route Groups Tests
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

describe("Route Groups", () => {
	describe("prefix", () => {
		it("should prefix all routes in a group", async () => {
			const app = createApp();

			app.group("/api", (router) => {
				router.get("/users", () => ({ route: "users" }));
				router.get("/posts", () => ({ route: "posts" }));
			});

			const usersRes = await app.fetch(new Request("http://localhost/api/users"));
			expect(usersRes.status).toBe(200);
			expect(await usersRes.json()).toEqual({ route: "users" });

			const postsRes = await app.fetch(new Request("http://localhost/api/posts"));
			expect(postsRes.status).toBe(200);
			expect(await postsRes.json()).toEqual({ route: "posts" });
		});

		it("should handle prefix without leading slash", async () => {
			const app = createApp();

			app.group("api", (router) => {
				router.get("/users", () => ({ route: "users" }));
			});

			const res = await app.fetch(new Request("http://localhost/api/users"));
			expect(res.status).toBe(200);
		});

		it("should handle prefix with trailing slash", async () => {
			const app = createApp();

			app.group("/api/", (router) => {
				router.get("users", () => ({ route: "users" }));
			});

			const res = await app.fetch(new Request("http://localhost/api/users"));
			expect(res.status).toBe(200);
		});

		it("should support nested groups", async () => {
			const app = createApp();

			app.group("/api", (router) => {
				router.group("/v1", (v1) => {
					v1.get("/users", () => ({ version: 1 }));
				});
				router.group("/v2", (v2) => {
					v2.get("/users", () => ({ version: 2 }));
				});
			});

			const v1Res = await app.fetch(new Request("http://localhost/api/v1/users"));
			expect(v1Res.status).toBe(200);
			expect(await v1Res.json()).toEqual({ version: 1 });

			const v2Res = await app.fetch(new Request("http://localhost/api/v2/users"));
			expect(v2Res.status).toBe(200);
			expect(await v2Res.json()).toEqual({ version: 2 });
		});

		it("should support path parameters in groups", async () => {
			const app = createApp();

			app.group("/users/:userId", (router) => {
				router.get("/posts", (ctx) => ({ userId: ctx.params.userId }));
				router.get("/posts/:postId", (ctx) => ({
					userId: ctx.params.userId,
					postId: ctx.params.postId,
				}));
			});

			const postsRes = await app.fetch(new Request("http://localhost/users/42/posts"));
			expect(postsRes.status).toBe(200);
			expect(await postsRes.json()).toEqual({ userId: "42" });

			const postRes = await app.fetch(new Request("http://localhost/users/42/posts/7"));
			expect(postRes.status).toBe(200);
			expect(await postRes.json()).toEqual({ userId: "42", postId: "7" });
		});
	});

	describe("middleware", () => {
		it("should apply middleware to all routes in a group", async () => {
			const app = createApp();
			const calls: string[] = [];

			app.group({
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						calls.push("group-middleware");
						return next();
					},
				],
			}, (router) => {
				router.get("/test", () => {
					calls.push("handler");
					return { ok: true };
				});
			});

			await app.fetch(new Request("http://localhost/api/test"));
			expect(calls).toEqual(["group-middleware", "handler"]);
		});

		it("should not apply group middleware to routes outside the group", async () => {
			const app = createApp();
			const calls: string[] = [];

			app.group({
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						calls.push("group-middleware");
						return next();
					},
				],
			}, (router) => {
				router.get("/test", () => ({ inside: true }));
			});

			app.get("/outside", () => {
				calls.push("outside-handler");
				return { outside: true };
			});

			await app.fetch(new Request("http://localhost/outside"));
			expect(calls).toEqual(["outside-handler"]);
		});

		it("should apply nested group middleware in order", async () => {
			const app = createApp();
			const calls: string[] = [];

			app.group({
				prefix: "/api",
				middleware: [async (ctx, next) => { calls.push("api"); return next(); }],
			}, (router) => {
				router.group({
					prefix: "/admin",
					middleware: [async (ctx, next) => { calls.push("admin"); return next(); }],
				}, (admin) => {
					admin.get("/dashboard", () => {
						calls.push("handler");
						return { ok: true };
					});
				});
			});

			await app.fetch(new Request("http://localhost/api/admin/dashboard"));
			expect(calls).toEqual(["api", "admin", "handler"]);
		});

		it("should combine global middleware with group middleware", async () => {
			const app = createApp();
			const calls: string[] = [];

			app.use(async (ctx, next) => {
				calls.push("global");
				return next();
			});

			app.group({
				prefix: "/api",
				middleware: [async (ctx, next) => { calls.push("group"); return next(); }],
			}, (router) => {
				router.get("/test", () => {
					calls.push("handler");
					return { ok: true };
				});
			});

			await app.fetch(new Request("http://localhost/api/test"));
			expect(calls).toEqual(["global", "group", "handler"]);
		});
	});

	describe("name prefix", () => {
		it("should prefix route names in a group", async () => {
			const app = createApp();

			app.group({
				prefix: "/api",
				name: "api.",
			}, (router) => {
				router.get("/users", () => ({ users: [] })).name("users.index");
				router.get("/users/:id", () => ({ id: 1 })).name("users.show");
			});

			// Route names should be "api.users.index" and "api.users.show"
			expect(app.route("api.users.index")).toBe("/api/users");
			expect(app.route("api.users.show", { id: 123 })).toBe("/api/users/123");
		});
	});

	describe("all HTTP methods", () => {
		it("should support all HTTP methods in groups", async () => {
			const app = createApp();

			app.group("/api", (router) => {
				router.get("/resource", () => ({ method: "GET" }));
				router.post("/resource", () => ({ method: "POST" }));
				router.put("/resource/:id", () => ({ method: "PUT" }));
				router.patch("/resource/:id", () => ({ method: "PATCH" }));
				router.delete("/resource/:id", () => ({ method: "DELETE" }));
			});

			const get = await app.fetch(new Request("http://localhost/api/resource"));
			expect(await get.json()).toEqual({ method: "GET" });

			const post = await app.fetch(new Request("http://localhost/api/resource", { method: "POST" }));
			expect(await post.json()).toEqual({ method: "POST" });

			const put = await app.fetch(new Request("http://localhost/api/resource/1", { method: "PUT" }));
			expect(await put.json()).toEqual({ method: "PUT" });

			const patch = await app.fetch(new Request("http://localhost/api/resource/1", { method: "PATCH" }));
			expect(await patch.json()).toEqual({ method: "PATCH" });

			const del = await app.fetch(new Request("http://localhost/api/resource/1", { method: "DELETE" }));
			expect(await del.json()).toEqual({ method: "DELETE" });
		});
	});
});
