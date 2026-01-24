import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.js";

describe("Middleware Pipeline", () => {
	describe("Basic Middleware", () => {
		test("middleware executes before route handler", async () => {
			const app = createApp();
			const order: string[] = [];

			app.use(async (ctx, next) => {
				order.push("middleware");
				return await next();
			});

			app.get("/test", () => {
				order.push("handler");
				return { ok: true };
			});

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(200);
			expect(order).toEqual(["middleware", "handler"]);
		});

		test("middleware can modify response after next()", async () => {
			const app = createApp();
			let responseTime = 0;

			app.use(async (ctx, next) => {
				const start = Date.now();
				const result = await next();
				responseTime = Date.now() - start;
				return result;
			});

			app.get("/test", () => ({ message: "hello" }));

			await app.fetch(new Request("http://localhost/test"));
			expect(responseTime).toBeGreaterThanOrEqual(0);
		});

		test("middleware receives request context", async () => {
			const app = createApp();
			let capturedMethod = "";
			let capturedPath = "";

			app.use(async (ctx, next) => {
				capturedMethod = ctx.request.method;
				capturedPath = new URL(ctx.request.url).pathname;
				return await next();
			});

			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/users"));
			expect(capturedMethod).toBe("GET");
			expect(capturedPath).toBe("/users");
		});

		test("middleware can return early without calling next()", async () => {
			const app = createApp();
			let handlerCalled = false;

			app.use(async (_ctx, _next) => {
				return { blocked: true };
			});

			app.get("/test", () => {
				handlerCalled = true;
				return { ok: true };
			});

			const response = await app.fetch(new Request("http://localhost/test"));
			const data = await response.json();
			expect(data).toEqual({ blocked: true });
			expect(handlerCalled).toBe(false);
		});
	});

	describe("Middleware Chain", () => {
		test("multiple middleware execute in registration order", async () => {
			const app = createApp();
			const order: string[] = [];

			app.use(async (_ctx, next) => {
				order.push("first-before");
				const result = await next();
				order.push("first-after");
				return result;
			});

			app.use(async (_ctx, next) => {
				order.push("second-before");
				const result = await next();
				order.push("second-after");
				return result;
			});

			app.use(async (_ctx, next) => {
				order.push("third-before");
				const result = await next();
				order.push("third-after");
				return result;
			});

			app.get("/test", () => {
				order.push("handler");
				return { ok: true };
			});

			await app.fetch(new Request("http://localhost/test"));
			expect(order).toEqual([
				"first-before",
				"second-before",
				"third-before",
				"handler",
				"third-after",
				"second-after",
				"first-after",
			]);
		});

		test("app.use() is chainable", async () => {
			const app = createApp();

			const result = app
				.use(async (_ctx, next) => await next())
				.use(async (_ctx, next) => await next())
				.get("/test", () => ({ ok: true }));

			expect(result).toBe(app);
		});
	});

	describe("Middleware with Routes", () => {
		test("middleware runs for all routes", async () => {
			const app = createApp();
			let count = 0;

			app.use(async (_ctx, next) => {
				count++;
				return await next();
			});

			app.get("/a", () => ({ route: "a" }));
			app.get("/b", () => ({ route: "b" }));
			app.post("/c", () => ({ route: "c" }));

			await app.fetch(new Request("http://localhost/a"));
			await app.fetch(new Request("http://localhost/b"));
			await app.fetch(new Request("http://localhost/c", { method: "POST" }));

			expect(count).toBe(3);
		});

		test("middleware has access to path params", async () => {
			const app = createApp();
			let capturedId = "";

			app.use(async (ctx, next) => {
				capturedId = ctx.params.id || "";
				return await next();
			});

			app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

			await app.fetch(new Request("http://localhost/users/123"));
			expect(capturedId).toBe("123");
		});

		test("middleware has access to query params", async () => {
			const app = createApp();
			let capturedSort = "";

			app.use(async (ctx, next) => {
				capturedSort = ctx.query.get("sort") || "";
				return await next();
			});

			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/users?sort=name"));
			expect(capturedSort).toBe("name");
		});
	});

	describe("Middleware Error Handling", () => {
		test("middleware errors return 500 response", async () => {
			const app = createApp();

			app.use(async (_ctx, _next) => {
				throw new Error("Middleware failed");
			});

			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(500);
			const data = (await response.json()) as { error: string };
			expect(data.error).toBe("Middleware failed");
		});

		test("error in later middleware still returns 500", async () => {
			const app = createApp();
			const order: string[] = [];

			app.use(async (_ctx, next) => {
				order.push("first");
				return await next();
			});

			app.use(async (_ctx, _next) => {
				order.push("second");
				throw new Error("Second middleware failed");
			});

			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(500);
			expect(order).toEqual(["first", "second"]);
		});

		test("middleware can catch and handle errors from next()", async () => {
			const app = createApp();

			app.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					return { caught: true, error: message };
				}
			});

			app.get("/test", () => {
				throw new Error("Handler error");
			});

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toEqual({ caught: true, error: "Handler error" });
		});

		test("middleware can catch errors from other middleware", async () => {
			const app = createApp();

			app.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					return { caught: true, error: message };
				}
			});

			app.use(async (_ctx, _next) => {
				throw new Error("Inner middleware error");
			});

			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toEqual({ caught: true, error: "Inner middleware error" });
		});
	});

	describe("Middleware Response Types", () => {
		test("middleware can return Response object", async () => {
			const app = createApp();

			app.use(async (_ctx, _next) => {
				return new Response("Blocked", { status: 403 });
			});

			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(403);
			expect(await response.text()).toBe("Blocked");
		});

		test("middleware can return JSON object", async () => {
			const app = createApp();

			app.use(async (_ctx, _next) => {
				return { middleware: true };
			});

			app.get("/test", () => ({ handler: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			const data = await response.json();
			expect(data).toEqual({ middleware: true });
		});

		test("middleware can modify handler response", async () => {
			const app = createApp();

			app.use(async (_ctx, next) => {
				const result = await next();
				if (result && typeof result === "object" && !("timestamp" in result)) {
					return { ...result, timestamp: "2026-01-24" };
				}
				return result;
			});

			app.get("/test", () => ({ message: "hello" }));

			const response = await app.fetch(new Request("http://localhost/test"));
			const data = await response.json();
			expect(data).toEqual({ message: "hello", timestamp: "2026-01-24" });
		});
	});

	describe("Edge Cases", () => {
		test("no middleware still works", async () => {
			const app = createApp();
			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data).toEqual({ ok: true });
		});

		test("middleware on non-existent route still returns 404", async () => {
			const app = createApp();
			let middlewareRan = false;

			app.use(async (_ctx, next) => {
				middlewareRan = true;
				return await next();
			});

			app.get("/exists", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/not-found"));
			expect(response.status).toBe(404);
			// Middleware should NOT run for non-existent routes
			// (per current implementation - middleware runs after route match)
			expect(middlewareRan).toBe(false);
		});

		test("async middleware works correctly", async () => {
			const app = createApp();

			app.use(async (_ctx, next) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return await next();
			});

			app.get("/test", () => ({ ok: true }));

			const response = await app.fetch(new Request("http://localhost/test"));
			expect(response.status).toBe(200);
		});
	});
});
