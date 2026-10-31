import { describe, expect, test } from "bun:test";
import { createRouter, HttpError } from "../src/index.js";

function post(body: string | FormData, headers: Record<string, string> = {}): Request {
	return new Request("http://localhost/echo", { method: "POST", headers, body });
}

/** A request whose body is streamed, so it carries no Content-Length. */
function streamed(text: string): Request {
	const bytes = new TextEncoder().encode(text);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += 4) {
				controller.enqueue(bytes.slice(i, i + 4));
			}
			controller.close();
		},
	});
	const request = new Request("http://localhost/echo", { method: "POST", body: stream });
	expect(request.headers.get("content-length")).toBeNull();
	return request;
}

describe("maxBodySize", () => {
	test("json() within the limit parses normally", async () => {
		const app = createRouter({ maxBodySize: 64 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.json() }));

		const response = await app.fetch(
			post(JSON.stringify({ a: 1 }), { "Content-Type": "application/json" }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: { a: 1 } });
	});

	test("json() over the limit answers 413", async () => {
		const app = createRouter({ maxBodySize: 8 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.json() }));

		const response = await app.fetch(
			post(JSON.stringify({ name: "far too long" }), { "Content-Type": "application/json" }),
		);

		expect(response.status).toBe(413);
		const body = (await response.json()) as { title: string; status: number };
		expect(body.title).toBe("Content Too Large");
		expect(body.status).toBe(413);
	});

	test("text() over the limit answers 413", async () => {
		const app = createRouter({ maxBodySize: 4 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.text() }));

		const response = await app.fetch(post("hello world"));

		expect(response.status).toBe(413);
	});

	test("text() exactly at the limit is accepted", async () => {
		const app = createRouter({ maxBodySize: 5 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.text() }));

		const response = await app.fetch(post("hello"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: "hello" });
	});

	test("formData() within the limit parses normally", async () => {
		const app = createRouter({ maxBodySize: 1024 });
		app.post("/echo", async (ctx) => ({ name: (await ctx.body.formData()).get("name") }));

		const form = new FormData();
		form.set("name", "Alice");
		const response = await app.fetch(post(form));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ name: "Alice" });
	});

	test("formData() over the limit answers 413", async () => {
		const app = createRouter({ maxBodySize: 16 });
		app.post("/echo", async (ctx) => ({ name: (await ctx.body.formData()).get("name") }));

		const form = new FormData();
		form.set("name", "x".repeat(100));
		const response = await app.fetch(post(form));

		expect(response.status).toBe(413);
	});

	test("enforces the limit on streamed bodies without Content-Length", async () => {
		const app = createRouter({ maxBodySize: 10 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.text() }));

		const response = await app.fetch(streamed("this body is longer than ten bytes"));

		expect(response.status).toBe(413);
	});

	test("streamed bodies within the limit are read in full", async () => {
		const app = createRouter({ maxBodySize: 64 });
		app.post("/echo", async (ctx) => ({ received: await ctx.body.text() }));

		const response = await app.fetch(streamed("short and sweet"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: "short and sweet" });
	});

	test("the thrown error is an HttpError with status 413", async () => {
		let caught: unknown;
		const app = createRouter({ maxBodySize: 2 });
		app.post("/echo", async (ctx) => {
			try {
				await ctx.body.text();
			} catch (error) {
				caught = error;
			}
			return {};
		});

		await app.fetch(post("too long"));

		expect(caught).toBeInstanceOf(HttpError);
		expect((caught as HttpError).status).toBe(413);
	});

	test("invalid JSON within the limit still throws BodyParseError (400 path)", async () => {
		const app = createRouter({ maxBodySize: 64 });
		app.post("/echo", async (ctx) => {
			try {
				await ctx.body.json();
				return { ok: true };
			} catch (error) {
				return { name: (error as Error).name };
			}
		});

		const response = await app.fetch(post("{not json"));

		expect(await response.json()).toEqual({ name: "BodyParseError" });
	});

	test("no limit by default", async () => {
		const app = createRouter();
		app.post("/echo", async (ctx) => ({ length: (await ctx.body.text()).length }));

		const response = await app.fetch(post("x".repeat(100_000)));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ length: 100_000 });
	});
});
