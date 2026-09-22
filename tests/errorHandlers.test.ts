import { describe, expect, test } from "bun:test";
import type { RequestContext } from "../src/index.js";
import { createRouter } from "../src/index.js";

describe("Configurable Error Handlers", () => {
	describe("onNotFound", () => {
		test("default behavior when onNotFound not provided", async () => {
			const app = createRouter();
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(new Request("http://localhost/posts"));

			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({
				type: "about:blank",
				title: "Not Found",
				status: 404,
				detail: "No route matches GET /posts",
				instance: "/posts",
			});
			expect(response.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
		});

		test("custom onNotFound handler overrides default 404", async () => {
			const app = createRouter({
				onNotFound: (_ctx) => {
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
			let receivedCtx: RequestContext | null = null;
			const app = createRouter({
				onNotFound: (ctx) => {
					receivedCtx = ctx;
					return new Response("Not found", { status: 404 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/posts?search=test&page=2"));

			expect(receivedCtx).toBeTruthy();
			const ctx = receivedCtx as unknown as RequestContext;
			expect(ctx.query.get("search")).toBe("test");
			expect(ctx.query.get("page")).toBe("2");
			expect(ctx.params).toEqual({});
		});

		test("onNotFound can return HandlerResponse (object)", async () => {
			const app = createRouter({
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
			const app = createRouter({
				onNotFound: () => {
					return new Response("Custom 404", { status: 404 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			const response = await app.fetch(
				new Request("http://localhost/posts", { method: "OPTIONS" }),
			);

			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Custom 404");
		});
	});

	describe("onMethodNotAllowed", () => {
		test("default behavior when onMethodNotAllowed not provided", async () => {
			const app = createRouter();
			app.get("/users", () => ({ users: [] }));
			app.post("/users", () => ({ created: true }));

			const response = await app.fetch(new Request("http://localhost/users", { method: "PUT" }));

			expect(response.status).toBe(405);
			expect(await response.json()).toEqual({
				type: "about:blank",
				title: "Method Not Allowed",
				status: 405,
				detail: "PUT is not allowed for /users",
				instance: "/users",
			});
			expect(response.headers.get("Allow")).toBe("GET, POST");
			expect(response.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
		});

		test("custom onMethodNotAllowed handler overrides default 405", async () => {
			const app = createRouter({
				onMethodNotAllowed: (_ctx, allowed) => {
					return new Response(JSON.stringify({ message: "Method not allowed", allowed }), {
						status: 405,
						headers: { "Content-Type": "application/json" },
					});
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
			const app = createRouter({
				onMethodNotAllowed: (_ctx, allowed) => {
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
			let receivedCtx: RequestContext | null = null;
			const app = createRouter({
				onMethodNotAllowed: (ctx, _allowed) => {
					receivedCtx = ctx;
					return new Response("Method not allowed", { status: 405 });
				},
			});
			app.get("/users", () => ({ users: [] }));

			await app.fetch(new Request("http://localhost/users?filter=active", { method: "PUT" }));

			expect(receivedCtx).toBeTruthy();
			const ctx = receivedCtx as unknown as RequestContext;
			expect(ctx.query.get("filter")).toBe("active");
			expect(ctx.params).toEqual({});
		});

		test("onMethodNotAllowed ensures Allow header is present", async () => {
			const app = createRouter({
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
			const app = createRouter({
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
			const app = createRouter({
				onMethodNotAllowed: (_ctx, allowed) => {
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
			const app = createRouter();
			app.get("/error", () => {
				throw new Error("Test error");
			});

			const response = await app.fetch(new Request("http://localhost/error"));

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				type: "about:blank",
				title: "Internal Server Error",
				status: 500,
				detail: "Test error",
				instance: "/error",
			});
			expect(response.headers.get("Content-Type")).toBe("application/problem+json; charset=utf-8");
		});

		test("hides error message in production mode", async () => {
			const original = Bun.env.NODE_ENV;
			Bun.env.NODE_ENV = "production";
			try {
				const app = createRouter();
				app.get("/error", () => {
					throw new Error("SQLITE_CANTOPEN: /var/app/data/prod.sqlite");
				});

				const response = await app.fetch(new Request("http://localhost/error"));

				expect(response.status).toBe(500);
				expect(await response.json()).toEqual({
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					instance: "/error",
				});
			} finally {
				Bun.env.NODE_ENV = original;
			}
		});

		test("shows error message in development mode", async () => {
			const original = Bun.env.NODE_ENV;
			Bun.env.NODE_ENV = "development";
			try {
				const app = createRouter();
				app.get("/error", () => {
					throw new Error("Detailed dev error");
				});

				const response = await app.fetch(new Request("http://localhost/error"));

				expect(response.status).toBe(500);
				expect(await response.json()).toEqual({
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					detail: "Detailed dev error",
					instance: "/error",
				});
			} finally {
				Bun.env.NODE_ENV = original;
			}
		});

		test("shows error message when NODE_ENV is not set", async () => {
			const original = Bun.env.NODE_ENV;
			Bun.env.NODE_ENV = undefined;
			try {
				const app = createRouter();
				app.get("/error", () => {
					throw new Error("Visible without NODE_ENV");
				});

				const response = await app.fetch(new Request("http://localhost/error"));

				expect(response.status).toBe(500);
				expect(await response.json()).toEqual({
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					detail: "Visible without NODE_ENV",
					instance: "/error",
				});
			} finally {
				Bun.env.NODE_ENV = original;
			}
		});

		test("hides non-Error objects in production mode", async () => {
			const original = Bun.env.NODE_ENV;
			Bun.env.NODE_ENV = "production";
			try {
				const app = createRouter();
				app.get("/error", () => {
					throw "secret string error";
				});

				const response = await app.fetch(new Request("http://localhost/error"));

				expect(response.status).toBe(500);
				expect(await response.json()).toEqual({
					type: "about:blank",
					title: "Internal Server Error",
					status: 500,
					instance: "/error",
				});
			} finally {
				Bun.env.NODE_ENV = original;
			}
		});

		test("custom onError handler overrides default 500", async () => {
			const app = createRouter({
				onError: (_ctx, _error) => {
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
			const app = createRouter({
				onError: (_ctx, error) => {
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
			let receivedCtx: RequestContext | null = null;
			const app = createRouter({
				onError: (ctx, _error) => {
					receivedCtx = ctx;
					return new Response("Error", { status: 500 });
				},
			});
			app.get("/users/:id", () => {
				throw new Error("Test error");
			});

			await app.fetch(new Request("http://localhost/users/123?debug=true"));

			expect(receivedCtx).toBeTruthy();
			const ctx = receivedCtx as unknown as RequestContext<Record<string, unknown>, { id: string }>;
			expect(ctx.params.id).toBe("123");
			expect(ctx.query.get("debug")).toBe("true");
		});

		test("onError handles non-Error objects", async () => {
			let receivedError: unknown = null;
			const app = createRouter({
				onError: (_ctx, error) => {
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
			const app = createRouter({
				onError: (_ctx, error) => {
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
			const app = createRouter({
				onError: (_ctx, error) => {
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
			const app = createRouter({
				onNotFound: async (_ctx) => {
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
			const app = createRouter({
				onMethodNotAllowed: async (_ctx, allowed) => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					logged = true;
					return new Response(JSON.stringify({ error: "Method not allowed", allowed }), {
						status: 405,
						headers: { "Content-Type": "application/json" },
					});
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
			const app = createRouter({
				onError: async (_ctx, _error) => {
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
			const app = createRouter({
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
			const app = createRouter({
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
