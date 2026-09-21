import { describe, expect, test } from "bun:test";
import { createRouter } from "../src/index.js";

describe("Response helpers on the request context", () => {
	describe("ctx.json()", () => {
		test("builds a JSON response", async () => {
			const app = createRouter();
			app.get("/users", (ctx) => ctx.json({ users: ["Alice"] }));

			const response = await app.fetch(new Request("http://localhost/users"));

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
			expect(await response.json()).toEqual({ users: ["Alice"] });
		});

		test("honours status and headers from init", async () => {
			const app = createRouter();
			app.post("/users", (ctx) =>
				ctx.json({ id: 1 }, { status: 201, headers: { location: "/users/1" } }),
			);

			const response = await app.fetch(new Request("http://localhost/users", { method: "POST" }));

			expect(response.status).toBe(201);
			expect(response.headers.get("location")).toBe("/users/1");
			expect(await response.json()).toEqual({ id: 1 });
		});
	});

	describe("ctx.text()", () => {
		test("builds a text/plain response", async () => {
			const app = createRouter();
			app.get("/ping", (ctx) => ctx.text("pong"));

			const response = await app.fetch(new Request("http://localhost/ping"));

			expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
			expect(await response.text()).toBe("pong");
		});

		test("honours init", async () => {
			const app = createRouter();
			app.get("/teapot", (ctx) => ctx.text("nope", { status: 418 }));

			const response = await app.fetch(new Request("http://localhost/teapot"));

			expect(response.status).toBe(418);
		});
	});

	describe("ctx.html()", () => {
		test("builds a text/html response", async () => {
			const app = createRouter();
			app.get("/page", (ctx) => ctx.html("<h1>Page</h1>"));

			const response = await app.fetch(new Request("http://localhost/page"));

			expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(await response.text()).toBe("<h1>Page</h1>");
		});
	});

	describe("ctx.redirect()", () => {
		test("defaults to 302", async () => {
			const app = createRouter();
			app.get("/old", (ctx) => ctx.redirect("/new"));

			const response = await app.fetch(new Request("http://localhost/old"));

			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toBe("/new");
		});

		test("accepts an explicit status", async () => {
			const app = createRouter();
			app.get("/old", (ctx) => ctx.redirect("/new", 301));

			const response = await app.fetch(new Request("http://localhost/old"));

			expect(response.status).toBe(301);
		});
	});

	describe("ctx.status()", () => {
		test("builds an empty response with the given code", async () => {
			const app = createRouter();
			app.delete("/users/:id", (ctx) => ctx.status(204));

			const response = await app.fetch(
				new Request("http://localhost/users/1", { method: "DELETE" }),
			);

			expect(response.status).toBe(204);
			expect(await response.text()).toBe("");
		});

		test("carries headers from init", async () => {
			const app = createRouter();
			app.post("/jobs", (ctx) => ctx.status(202, { headers: { "x-job": "queued" } }));

			const response = await app.fetch(new Request("http://localhost/jobs", { method: "POST" }));

			expect(response.status).toBe(202);
			expect(response.headers.get("x-job")).toBe("queued");
		});
	});

	describe("ctx.request", () => {
		test("exposes the underlying Web Request", async () => {
			const app = createRouter();
			app.get("/who", (ctx) =>
				ctx.json({
					isRequest: ctx.request instanceof Request,
					method: ctx.request.method,
					url: ctx.request.url,
					header: ctx.request.headers.get("x-custom"),
				}),
			);

			const response = await app.fetch(
				new Request("http://localhost/who", { headers: { "x-custom": "yes" } }),
			);

			expect(await response.json()).toEqual({
				isRequest: true,
				method: "GET",
				url: "http://localhost/who",
				header: "yes",
			});
		});
	});

	describe("helpers are available in middleware and fallback contexts", () => {
		test("middleware can build a response with ctx.json()", async () => {
			const app = createRouter();
			app.use(async (ctx, next) => {
				if (ctx.request.headers.get("x-block") === "1") {
					return ctx.json({ error: "blocked" }, { status: 403 });
				}
				return await next();
			});
			app.get("/data", () => ({ ok: true }));

			const blocked = await app.fetch(
				new Request("http://localhost/data", { headers: { "x-block": "1" } }),
			);
			expect(blocked.status).toBe(403);
			expect(await blocked.json()).toEqual({ error: "blocked" });

			const allowed = await app.fetch(new Request("http://localhost/data"));
			expect(await allowed.json()).toEqual({ ok: true });
		});

		test("a custom 404 handler can use ctx.text()", async () => {
			const app = createRouter({
				onNotFound: (ctx) => ctx.text("no such page", { status: 404 }),
			});
			app.get("/known", () => "ok");

			const response = await app.fetch(new Request("http://localhost/unknown"));

			expect(response.status).toBe(404);
			expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
			expect(await response.text()).toBe("no such page");
		});
	});

	describe("plain returns still work", () => {
		test("objects, strings and Responses pass through toResponse()", async () => {
			const app = createRouter();
			app.get("/object", () => ({ a: 1 }));
			app.get("/string", () => "plain");
			app.get("/response", () => new Response("raw", { status: 201 }));
			app.get("/nothing", () => null);

			expect(await (await app.fetch(new Request("http://localhost/object"))).json()).toEqual({
				a: 1,
			});
			expect(await (await app.fetch(new Request("http://localhost/string"))).text()).toBe("plain");

			const raw = await app.fetch(new Request("http://localhost/response"));
			expect(raw.status).toBe(201);
			expect(await raw.text()).toBe("raw");

			expect((await app.fetch(new Request("http://localhost/nothing"))).status).toBe(204);
		});
	});
});
