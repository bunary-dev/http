import { describe, expect, test } from "bun:test";
import { createApp } from "../src/index.js";

describe("Body Parsing Helpers", () => {
	describe("ctx.json()", () => {
		test("parses JSON body from POST request", async () => {
			const app = createApp();
			app.post("/users", async (ctx) => {
				const body = await ctx.json();
				return { received: body };
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Alice", age: 30 }),
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				received: { name: "Alice", age: 30 },
			});
		});

		test("returns typed result with generic parameter", async () => {
			interface CreateUser {
				name: string;
				age: number;
			}

			const app = createApp();
			app.post("/users", async (ctx) => {
				const body = await ctx.json<CreateUser>();
				// Type-level check: body.name and body.age should be accessible
				return { name: body.name, age: body.age };
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Bob", age: 25 }),
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ name: "Bob", age: 25 });
		});

		test("throws BodyParseError for invalid JSON", async () => {
			const app = createApp();
			app.post("/users", async (ctx) => {
				const body = await ctx.json();
				return { received: body };
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not valid json{{{",
				}),
			);

			// Default error handler returns 500; handler didn't catch the error
			expect(response.status).toBe(500);
		});

		test("BodyParseError can be caught in handler for custom 400 response", async () => {
			const { BodyParseError } = await import("../src/index.js");

			const app = createApp();
			app.post("/users", async (ctx) => {
				try {
					return await ctx.json();
				} catch (error) {
					if (error instanceof BodyParseError) {
						return new Response(JSON.stringify({ error: error.message }), {
							status: 400,
							headers: { "Content-Type": "application/json" },
						});
					}
					throw error;
				}
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not valid json",
				}),
			);

			expect(response.status).toBe(400);
			const data = (await response.json()) as { error: string };
			expect(data.error).toContain("Failed to parse JSON body");
		});

		test("parses nested JSON objects", async () => {
			const app = createApp();
			app.post("/data", async (ctx) => {
				return await ctx.json();
			});

			const nested = { user: { name: "Alice", roles: ["admin", "user"] } };
			const response = await app.fetch(
				new Request("http://localhost/data", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(nested),
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(nested);
		});

		test("parses JSON array body", async () => {
			const app = createApp();
			app.post("/items", async (ctx) => {
				const items = await ctx.json();
				return { items };
			});

			const response = await app.fetch(
				new Request("http://localhost/items", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify([1, 2, 3]),
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ items: [1, 2, 3] });
		});
	});

	describe("ctx.text()", () => {
		test("returns request body as string", async () => {
			const app = createApp();
			app.post("/echo", async (ctx) => {
				const text = await ctx.text();
				return { echo: text };
			});

			const response = await app.fetch(
				new Request("http://localhost/echo", {
					method: "POST",
					headers: { "Content-Type": "text/plain" },
					body: "Hello, Bunary!",
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ echo: "Hello, Bunary!" });
		});

		test("returns empty string for empty body", async () => {
			const app = createApp();
			app.post("/echo", async (ctx) => {
				const text = await ctx.text();
				return { echo: text };
			});

			const response = await app.fetch(
				new Request("http://localhost/echo", {
					method: "POST",
					body: "",
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ echo: "" });
		});

		test("returns raw JSON string without parsing", async () => {
			const app = createApp();
			app.post("/raw", async (ctx) => {
				const text = await ctx.text();
				return { raw: text };
			});

			const jsonBody = JSON.stringify({ key: "value" });
			const response = await app.fetch(
				new Request("http://localhost/raw", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: jsonBody,
				}),
			);

			expect(response.status).toBe(200);
			const data = (await response.json()) as { raw: string };
			expect(data.raw).toBe(jsonBody);
		});
	});

	describe("ctx.formData()", () => {
		test("parses multipart form data", async () => {
			const app = createApp();
			app.post("/form", async (ctx) => {
				const form = await ctx.formData();
				return {
					name: form.get("name"),
					email: form.get("email"),
				};
			});

			const formData = new FormData();
			formData.append("name", "Alice");
			formData.append("email", "alice@example.com");

			const response = await app.fetch(
				new Request("http://localhost/form", {
					method: "POST",
					body: formData,
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				name: "Alice",
				email: "alice@example.com",
			});
		});

		test("parses URL-encoded form data", async () => {
			const app = createApp();
			app.post("/form", async (ctx) => {
				const form = await ctx.formData();
				return {
					name: form.get("name"),
					email: form.get("email"),
				};
			});

			const response = await app.fetch(
				new Request("http://localhost/form", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: "name=Bob&email=bob%40example.com",
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				name: "Bob",
				email: "bob@example.com",
			});
		});

		test("throws BodyParseError for invalid form data", async () => {
			const { BodyParseError } = await import("../src/index.js");

			const app = createApp();
			app.post("/form", async (ctx) => {
				try {
					return await ctx.formData();
				} catch (error) {
					if (error instanceof BodyParseError) {
						return new Response(JSON.stringify({ error: error.message }), {
							status: 400,
							headers: { "Content-Type": "application/json" },
						});
					}
					throw error;
				}
			});

			const response = await app.fetch(
				new Request("http://localhost/form", {
					method: "POST",
					headers: { "Content-Type": "multipart/form-data; boundary=invalid" },
					body: "this is not valid multipart data",
				}),
			);

			expect(response.status).toBe(400);
			const data = (await response.json()) as { error: string };
			expect(data.error).toContain("Failed to parse form data");
		});
	});

	describe("helpers work with middleware", () => {
		test("body helpers are available after middleware runs", async () => {
			const app = createApp();

			app.use(async (ctx, next) => {
				// Middleware runs before handler — helpers should still work
				return await next();
			});

			app.post("/users", async (ctx) => {
				const body = await ctx.json();
				return body;
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Alice" }),
				}),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ name: "Alice" });
		});

		test("fails when middleware consumes body before handler", async () => {
			const app = createApp();

			app.use(async (ctx, next) => {
				// Middleware consumes the body before the handler
				await ctx.json();
				return await next();
			});

			app.post("/users", async (ctx) => {
				// Second attempt to read body should fail per Fetch API spec
				const body = await ctx.json();
				return body;
			});

			const response = await app.fetch(
				new Request("http://localhost/users", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Bob" }),
				}),
			);

			// Document expected behavior when body is consumed multiple times:
			// second read should result in a failure (e.g. 500 error)
			expect(response.status).not.toBe(200);
		});
	});
});
