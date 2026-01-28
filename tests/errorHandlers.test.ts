import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("Configurable Error Handlers", () => {
	describe("onNotFound", () => {
		test("default behavior when onNotFound not provided", async () => {
			const app = createApp();
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ error: "Not found" });
			expect(response.headers.get("Content-Type")).toBe("application/json");
		});

		test("custom onNotFound handler overrides default 404", async () => {
			const app = createApp({
				onNotFound: (ctx) => {
					return new Response("Custom 404 Page", {
						status: 404,
						headers: { "Content-Type": "text/plain" },
					});
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Custom 404 Page");
			expect(response.headers.get("Content-Type")).toBe("text/plain");
		});

		test("onNotFound receives request context with query params", async () => {
			let receivedCtx: any = null;
			const app = createApp({
				onNotFound: (ctx) => {
					receivedCtx = ctx;
					return new Response("Not found", { status: 404 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/posts?search=test&page=2"));

			expect(receivedCtx).toBeTruthy();
			expect(receivedCtx.query.get("search")).toBe("test");
			expect(receivedCtx.query.get("page")).toBe("2");
			expect(receivedCtx.params).toEqual({});
		});

		test("onNotFound can return HandlerResponse (object)", async () => {
			const app = createApp({
				onNotFound: () => {
					return { error: "Custom not found", code: 404 };
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ error: "Custom not found", code: 404 });
		});

		test("onNotFound works with OPTIONS requests to non-existent paths", async () => {
			const app = createApp({
				onNotFound: () => {
					return new Response("Custom 404", { status: 404 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts", { method: "OPTIONS" }));

			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Custom 404");
		});
	});

	describe("onMethodNotAllowed", () => {
		test("default behavior when onMethodNotAllowed not provided", async () => {
			const app = createApp();
			app.get("/users", () => ({ users: [] }));
			app.post("/users", () => ({ created: true }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			expect(await response.json()).toEqual({ error: "Method not allowed" });
			expect(response.headers.get("Allow")).toBe("GET, POST");
			expect(response.headers.get("Content-Type")).toBe("application/json");
		});

		test("custom onMethodNotAllowed handler overrides default 405", async () => {
			const app = createApp({
				onMethodNotAllowed: (ctx, allowed) => {
					return new Response(
						JSON.stringify({ message: "Method not allowed", allowed }),
						{
							status: 405,
							headers: { "Content-Type": "application/json" },
						},
					);
				},
			});
			app.get("/users", () => ({ users: [] }));
			app.post("/users", () => ({ created: true }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			const body = (await response.json()) as { message: string; allowed: string[] };
			expect(body.message).toBe("Method not allowed");
			expect(body.allowed).toEqual(["GET", "POST"]);
		});

		test("onMethodNotAllowed receives allowed methods array", async () => {
			let receivedAllowed: string[] = [];
			const app = createApp({
				onMethodNotAllowed: (ctx, allowed) => {
					receivedAllowed = allowed;
					return new Response("Method not allowed", { status: 405 });
				},
			});
			app.get("/users", () => ({}));
			app.post("/users", () => ({}));
			app.delete("/users", () => ({}));

			await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(receivedAllowed.sort()).toEqual(["DELETE", "GET", "POST"]);
		});

		test("onMethodNotAllowed receives request context with query params", async () => {
			let receivedCtx: any = null;
			const app = createApp({
				onMethodNotAllowed: (ctx, allowed) => {
					receivedCtx = ctx;
					return new Response("Method not allowed", { status: 405 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/users?filter=active", { method: "PUT" }));

			expect(receivedCtx).toBeTruthy();
			expect(receivedCtx.query.get("filter")).toBe("active");
			expect(receivedCtx.params).toEqual({});
		});

		test("onMethodNotAllowed ensures Allow header is present", async () => {
			const app = createApp({
				onMethodNotAllowed: () => {
					// Custom handler that doesn't set Allow header
					return new Response("Method not allowed", { status: 405 });
				},
			});
			app.get("/users", () => ({ users: [] }));
			app.post("/users", () => ({ created: true }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			expect(response.headers.get("Allow")).toBe("GET, POST");
		});

		test("onMethodNotAllowed preserves Allow header if custom handler sets it", async () => {
			const app = createApp({
				onMethodNotAllowed: () => {
					return new Response("Method not allowed", {
						status: 405,
						headers: { Allow: "CUSTOM" },
					});
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			expect(response.headers.get("Allow")).toBe("CUSTOM");
		});

		test("onMethodNotAllowed can return HandlerResponse (object)", async () => {
			const app = createApp({
				onMethodNotAllowed: (ctx, allowed) => {
					return { error: "Method not allowed", allowed };
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(200);
			const body = (await response.json()) as { error: string; allowed: string[] };
			expect(body.error).toBe("Method not allowed");
			expect(body.allowed).toEqual(["GET"]);
		});
	});

	describe("onError", () => {
		test("default behavior when onError not provided", async () => {
			const app = createApp();
			app.get("/error", () => {
				throw new Error("Test error");
			});

			const response = await app.fetch(new Request("http://localhost/error"));

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: "Test error" });
			expect(response.headers.get("Content-Type")).toBe("application/json");
		});

		test("custom onError handler overrides default 500", async () => {
			const app = createApp({
				onError: (ctx, error) => {
					return new Response("Custom error page", {
						status: 500,
						headers: { "Content-Type": "text/plain" },
					});
				},
			});
			app.get("/error", () => {
				throw new Error("Test error");
			});

			const response = await app.fetch(new Request("http://localhost/error"));

			expect(response.status).toBe(500);
			expect(await response.text()).toBe("Custom error page");
			expect(response.headers.get("Content-Type")).toBe("text/plain");
		});

		test("onError receives error object", async () => {
			let receivedError: unknown = null;
			const app = createApp({
				onError: (ctx, error) => {
					receivedError = error;
					return new Response("Error", { status: 500 });
				},
			});
			const testError = new Error("Test error");
			app.get("/error", () => {
				throw testError;
			});

			await app.fetch(new Request("http://localhost/error"));

			expect(receivedError).toBe(testError);
		});

		test("onError receives request context with params and query", async () => {
			let receivedCtx: any = null;
			const app = createApp({
				onError: (ctx, error) => {
					receivedCtx = ctx;
					return new Response("Error", { status: 500 });
				},
			});
			app.get("/users/:id", () => {
				throw new Error("Test error");
			});

			await app.fetch(new Request("http://localhost/users/123?debug=true"));

			expect(receivedCtx).toBeTruthy();
			expect(receivedCtx.params.id).toBe("123");
			expect(receivedCtx.query.get("debug")).toBe("true");
		});

		test("onError handles non-Error objects", async () => {
			let receivedError: unknown = null;
			const app = createApp({
				onError: (ctx, error) => {
					receivedError = error;
					return new Response("Error", { status: 500 });
				},
			});
			app.get("/error", () => {
				throw "String error";
			});

			await app.fetch(new Request("http://localhost/error"));

			expect(receivedError).toBe("String error");
		});

		test("onError can return HandlerResponse (object)", async () => {
			const app = createApp({
				onError: (ctx, error) => {
					return {
						error: "Internal server error",
						message: error instanceof Error ? error.message : String(error),
					};
				},
			});
			app.get("/error", () => {
				throw new Error("Test error");
			});

			const response = await app.fetch(new Request("http://localhost/error"));

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				error: string;
				message: string;
			};
			expect(body).toEqual({
				error: "Internal server error",
				message: "Test error",
			});
		});

		test("onError handles errors from middleware", async () => {
			let receivedError: unknown = null;
			const app = createApp({
				onError: (ctx, error) => {
					receivedError = error;
					return new Response("Error", { status: 500 });
				},
			});
			app.use(() => {
				throw new Error("Middleware error");
			});
			app.get("/test", () => ({ ok: true }));

			await app.fetch(new Request("http://localhost/test"));

			expect(receivedError).toBeInstanceOf(Error);
			expect((receivedError as Error).message).toBe("Middleware error");
		});
	});

	describe("Async handlers", () => {
		test("onNotFound supports async handlers", async () => {
			let logged = false;
			const app = createApp({
				onNotFound: async (ctx) => {
					// Simulate async operation (e.g., logging to external service)
					await new Promise((resolve) => setTimeout(resolve, 10));
					logged = true;
					return new Response("Async 404", { status: 404 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Async 404");
			expect(logged).toBe(true);
		});

		test("onMethodNotAllowed supports async handlers", async () => {
			let logged = false;
			const app = createApp({
				onMethodNotAllowed: async (ctx, allowed) => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					logged = true;
					return new Response(
						JSON.stringify({ error: "Method not allowed", allowed }),
						{ status: 405, headers: { "Content-Type": "application/json" } },
					);
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			const body = (await response.json()) as { error: string; allowed: string[] };
			expect(body.error).toBe("Method not allowed");
			expect(logged).toBe(true);
		});

		test("onError supports async handlers", async () => {
			let logged = false;
			const app = createApp({
				onError: async (ctx, error) => {
					// Simulate async error logging
					await new Promise((resolve) => setTimeout(resolve, 10));
					logged = true;
					return new Response("Async error", { status: 500 });
				},
			});
			app.get("/error", () => {
				throw new Error("Test error");
			});

			const response = await app.fetch(new Request("http://localhost/error"));

			expect(response.status).toBe(500);
			expect(await response.text()).toBe("Async error");
			expect(logged).toBe(true);
		});

		test("async handlers can return HandlerResponse objects", async () => {
			const app = createApp({
				onNotFound: async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return { error: "Not found", async: true };
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(200);
			const body = (await response.json()) as { error: string; async: boolean };
			expect(body.error).toBe("Not found");
			expect(body.async).toBe(true);
		});
	});

	describe("Combined handlers", () => {
		test("all handlers can be used together", async () => {
			const app = createApp({
				onNotFound: () => new Response("Custom 404", { status: 404 }),
				onMethodNotAllowed: () => new Response("Custom 405", { status: 405 }),
				onError: () => new Response("Custom 500", { status: 500 }),
			});
			app.get("/users", () => ({ users: [] }));

			const notFoundResponse = await app.fetch(new Request("http://localhost/posts"));
			expect(notFoundResponse.status).toBe(404);
			expect(await notFoundResponse.text()).toBe("Custom 404");

			const methodNotAllowedResponse = await app.fetch(
				new Request("http://localhost/users", { method: "PUT" }),
			);
			expect(methodNotAllowedResponse.status).toBe(405);
			expect(await methodNotAllowedResponse.text()).toBe("Custom 405");

			app.get("/error", () => {
				throw new Error("Test");
			});
			const errorResponse = await app.fetch(new Request("http://localhost/error"));
			expect(errorResponse.status).toBe(500);
			expect(await errorResponse.text()).toBe("Custom 500");
		});
	});
});
