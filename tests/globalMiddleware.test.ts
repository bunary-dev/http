/**
 * Global middleware pipeline tests (#65).
 *
 * Global middleware registered with `router.use()` must wrap EVERY response the
 * router produces — matched routes, 404, 405, OPTIONS auto-responses and error
 * responses — so that `cors()` and logging middleware always run.
 */
import { describe, expect, test } from "bun:test";
import { cors } from "../src/cors.js";
import { createRouter } from "../src/index.js";

describe("global middleware wraps every response (#65)", () => {
	test("404 responses carry CORS headers", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(
			new Request("http://localhost/missing", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
		expect(response.headers.get("Vary")).toContain("Origin");
	});

	test("405 responses carry CORS headers and keep the Allow header", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(
			new Request("http://localhost/users", {
				method: "POST",
				headers: { Origin: "https://myapp.com" },
			}),
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
		expect(response.headers.get("Allow")).toContain("GET");
	});

	test("500 error responses carry CORS headers", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/boom", () => {
			throw new Error("kaboom");
		});

		const response = await app.fetch(
			new Request("http://localhost/boom", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		expect(response.status).toBe(500);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
	});

	test("custom onError responses carry CORS headers", async () => {
		const app = createRouter({
			onError: () => new Response("custom failure", { status: 503 }),
		});
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/boom", () => {
			throw new Error("kaboom");
		});

		const response = await app.fetch(
			new Request("http://localhost/boom", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
	});

	test("custom onNotFound responses carry CORS headers", async () => {
		const app = createRouter({
			onNotFound: () => new Response("nope", { status: 404 }),
		});
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/users", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/missing", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("nope");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
	});

	test("global middleware runs for unmatched paths", async () => {
		const app = createRouter();
		const seen: string[] = [];
		app.use(async (ctx, next) => {
			seen.push(new URL(ctx.request.url).pathname);
			return await next();
		});
		app.get("/users", () => ({}));

		await app.fetch(new Request("http://localhost/missing"));
		await app.fetch(new Request("http://localhost/users", { method: "DELETE" }));

		expect(seen).toEqual(["/missing", "/users"]);
	});

	test("global middleware observes the 404 response object", async () => {
		const app = createRouter();
		let observedStatus = 0;
		app.use(async (_ctx, next) => {
			const result = await next();
			observedStatus = (result as Response).status;
			return result;
		});
		app.get("/users", () => ({}));

		await app.fetch(new Request("http://localhost/missing"));

		expect(observedStatus).toBe(404);
	});

	test("global middleware observes the error response object", async () => {
		const app = createRouter();
		let observedStatus = 0;
		app.use(async (_ctx, next) => {
			const result = await next();
			observedStatus = (result as Response).status;
			return result;
		});
		app.get("/boom", () => {
			throw new Error("kaboom");
		});

		await app.fetch(new Request("http://localhost/boom"));

		expect(observedStatus).toBe(500);
	});

	test("global middleware can rewrite the 404 response", async () => {
		const app = createRouter();
		app.use(async (_ctx, next) => {
			const result = await next();
			const response = result as Response;
			if (response.status === 404) {
				return new Response("rewritten", { status: 410 });
			}
			return result;
		});
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/missing"));

		expect(response.status).toBe(410);
		expect(await response.text()).toBe("rewritten");
	});

	test("an error thrown by global middleware reaches the error handler", async () => {
		const app = createRouter();
		app.use(() => {
			throw new Error("middleware exploded");
		});
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ status: 500, detail: "middleware exploded" });
	});

	test("an error thrown by global middleware after next() reaches the error handler", async () => {
		const app = createRouter();
		app.use(async (_ctx, next) => {
			await next();
			throw new Error("post-processing exploded");
		});
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ status: 500, detail: "post-processing exploded" });
	});

	test("global middleware errors reach a custom onError handler", async () => {
		const app = createRouter({
			onError: (_ctx, error) => new Response((error as Error).message, { status: 502 }),
		});
		app.use(() => {
			throw new Error("middleware exploded");
		});
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(502);
		expect(await response.text()).toBe("middleware exploded");
	});

	test("global middleware runs before group middleware", async () => {
		const app = createRouter();
		const order: string[] = [];
		app.use(async (_ctx, next) => {
			order.push("global");
			return await next();
		});
		app.group(
			{
				prefix: "/api",
				middleware: [
					async (_ctx, next) => {
						order.push("group");
						return await next();
					},
				],
			},
			(router) => {
				router.get("/users", () => {
					order.push("handler");
					return {};
				});
			},
		);

		await app.fetch(new Request("http://localhost/api/users"));

		expect(order).toEqual(["global", "group", "handler"]);
	});

	test("global middleware runs exactly once per request", async () => {
		const app = createRouter();
		let calls = 0;
		app.use(async (_ctx, next) => {
			calls++;
			return await next();
		});
		app.get("/users", () => ({}));

		await app.fetch(new Request("http://localhost/users"));

		expect(calls).toBe(1);
	});

	test("global middleware wraps the OPTIONS auto-response", async () => {
		const app = createRouter();
		app.use(async (_ctx, next) => {
			const response = (await next()) as Response;
			const headers = new Headers(response.headers);
			headers.set("X-Seen", "yes");
			return new Response(response.body, { status: response.status, headers });
		});
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/users", { method: "OPTIONS" }));

		expect(response.status).toBe(204);
		expect(response.headers.get("X-Seen")).toBe("yes");
		expect(response.headers.get("Allow")).toContain("GET");
	});

	test("global middleware wraps a HEAD response and the body stays empty", async () => {
		const app = createRouter();
		app.use(async (_ctx, next) => {
			const response = (await next()) as Response;
			const headers = new Headers(response.headers);
			headers.set("X-Seen", "yes");
			return new Response(response.body, { status: response.status, headers });
		});
		app.get("/users", () => ({ users: [] }));

		const response = await app.fetch(new Request("http://localhost/users", { method: "HEAD" }));

		expect(response.status).toBe(200);
		expect(response.headers.get("X-Seen")).toBe("yes");
		expect(await response.text()).toBe("");
	});

	test("HEAD responses for unmatched paths have no body", async () => {
		const app = createRouter();
		app.get("/users", () => ({}));

		const response = await app.fetch(new Request("http://localhost/missing", { method: "HEAD" }));

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("");
	});

	test("global middleware that short-circuits skips the route handler", async () => {
		const app = createRouter();
		let handlerCalled = false;
		app.use(() => new Response("blocked", { status: 401 }));
		app.get("/users", () => {
			handlerCalled = true;
			return {};
		});

		const response = await app.fetch(new Request("http://localhost/users"));

		expect(response.status).toBe(401);
		expect(handlerCalled).toBe(false);
	});

	test("global middleware sees params of the matched route", async () => {
		const app = createRouter();
		let seenId: string | undefined;
		app.use(async (ctx, next) => {
			seenId = ctx.params.id;
			return await next();
		});
		app.get("/users/:id", (ctx) => ({ id: ctx.params.id }));

		await app.fetch(new Request("http://localhost/users/42"));

		expect(seenId).toBe("42");
	});

	test("global and group middleware share one request context", async () => {
		const app = createRouter();
		app.use(async (ctx, next) => {
			ctx.locals.traceId = "trace-1";
			return await next();
		});
		app.group(
			{
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						ctx.locals.fromGroup = ctx.locals.traceId;
						return await next();
					},
				],
			},
			(router) => {
				router.get("/x", (ctx) => ({ trace: ctx.locals.fromGroup }));
			},
		);

		const response = await app.fetch(new Request("http://localhost/api/x"));

		expect(await response.json()).toEqual({ trace: "trace-1" });
	});
});
