import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("JSON Serialization", () => {
	test("returns JSON for plain objects", async () => {
		const app = createApp();
		app.get("/object", () => ({ message: "hello" }));

		const response = await app.fetch(new Request("http://localhost/object"));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(await response.json()).toEqual({ message: "hello" });
	});

	test("returns JSON for arrays", async () => {
		const app = createApp();
		app.get("/array", () => [1, 2, 3]);

		const response = await app.fetch(new Request("http://localhost/array"));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(await response.json()).toEqual([1, 2, 3]);
	});

	test("returns JSON for nested objects", async () => {
		const app = createApp();
		app.get("/nested", () => ({
			user: {
				id: 1,
				profile: {
					name: "Test",
					tags: ["a", "b"],
				},
			},
		}));

		const response = await app.fetch(new Request("http://localhost/nested"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			user: {
				id: 1,
				profile: {
					name: "Test",
					tags: ["a", "b"],
				},
			},
		});
	});

	test("passes through Response objects unchanged", async () => {
		const app = createApp();
		app.get("/custom", () => {
			return new Response("Custom body", {
				status: 201,
				headers: { "X-Custom": "header" },
			});
		});

		const response = await app.fetch(new Request("http://localhost/custom"));

		expect(response.status).toBe(201);
		expect(response.headers.get("X-Custom")).toBe("header");
		expect(await response.text()).toBe("Custom body");
	});

	test("handles null return value", async () => {
		const app = createApp();
		app.get("/null", () => null);

		const response = await app.fetch(new Request("http://localhost/null"));

		expect(response.status).toBe(204);
	});

	test("handles undefined return value", async () => {
		const app = createApp();
		app.get("/undefined", () => undefined);

		const response = await app.fetch(new Request("http://localhost/undefined"));

		expect(response.status).toBe(204);
	});

	test("handles string return value as text", async () => {
		const app = createApp();
		app.get("/text", () => "Hello, World!");

		const response = await app.fetch(new Request("http://localhost/text"));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
		expect(await response.text()).toBe("Hello, World!");
	});

	test("handles number return value as text", async () => {
		const app = createApp();
		app.get("/number", () => 42);

		const response = await app.fetch(new Request("http://localhost/number"));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("42");
	});

	test("handles async handlers", async () => {
		const app = createApp();
		app.get("/async", async () => {
			await Promise.resolve();
			return { async: true };
		});

		const response = await app.fetch(new Request("http://localhost/async"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ async: true });
	});
});

describe("Error Handling", () => {
	test("returns 500 when handler throws", async () => {
		const app = createApp();
		app.get("/error", () => {
			throw new Error("Something went wrong");
		});

		const response = await app.fetch(new Request("http://localhost/error"));

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBeDefined();
	});

	test("returns 500 when async handler rejects", async () => {
		const app = createApp();
		app.get("/async-error", async () => {
			throw new Error("Async error");
		});

		const response = await app.fetch(new Request("http://localhost/async-error"));

		expect(response.status).toBe(500);
	});
});

describe("Request Context", () => {
	test("provides access to original request", async () => {
		const app = createApp();
		app.get("/request-info", (ctx) => ({
			method: ctx.request.method,
			url: ctx.request.url,
		}));

		const response = await app.fetch(new Request("http://localhost/request-info"));

		const body = await response.json();
		expect(body.method).toBe("GET");
		expect(body.url).toBe("http://localhost/request-info");
	});

	test("provides empty params for routes without parameters", async () => {
		const app = createApp();
		app.get("/no-params", (ctx) => ({
			paramsCount: Object.keys(ctx.params).length,
		}));

		const response = await app.fetch(new Request("http://localhost/no-params"));

		expect(await response.json()).toEqual({ paramsCount: 0 });
	});

	test("provides empty query for requests without query string", async () => {
		const app = createApp();
		app.get("/no-query", (ctx) => ({
			hasQuery: ctx.query.toString().length > 0,
		}));

		const response = await app.fetch(new Request("http://localhost/no-query"));

		expect(await response.json()).toEqual({ hasQuery: false });
	});
});
