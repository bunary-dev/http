/**
 * URL encoding and unicode path behaviour tests.
 *
 * Documents and verifies how @bunary/http handles URL-encoded
 * path segments, unicode characters, and edge cases like
 * double-encoding and encoded slashes.
 *
 * Current behaviour: params are decoded via decodeURIComponent
 * to match standard framework conventions (Express, Fastify, Hono).
 *
 * @see {@link https://github.com/bunary-dev/http/issues/52}
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

describe("URL-encoded path parameters", () => {
	it("decodes %20 space in path parameter", async () => {
		const app = createApp();
		app.get("/users/:name", (ctx) => ({ name: ctx.params.name }));

		const res = await app.fetch(new Request("http://localhost/users/hello%20world"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "hello world" });
	});

	it("decodes + as literal plus (not space) in path parameter", async () => {
		const app = createApp();
		app.get("/users/:name", (ctx) => ({ name: ctx.params.name }));

		// In path segments, + is a literal character (unlike query strings)
		const res = await app.fetch(new Request("http://localhost/users/hello+world"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "hello+world" });
	});

	it("decodes special characters in path parameter", async () => {
		const app = createApp();
		app.get("/tags/:tag", (ctx) => ({ tag: ctx.params.tag }));

		// @ is %40
		const res = await app.fetch(new Request("http://localhost/tags/%40bunary"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ tag: "@bunary" });
	});

	it("handles double-encoded values (decodes one layer)", async () => {
		const app = createApp();
		app.get("/files/:name", (ctx) => ({ name: ctx.params.name }));

		// %2520 → first decode → %20 (the literal string "%20", not a space)
		const res = await app.fetch(new Request("http://localhost/files/hello%2520world"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "hello%20world" });
	});

	it("encoded slash %2F does not split path segments", async () => {
		const app = createApp();
		app.get("/files/:path", (ctx) => ({ path: ctx.params.path }));

		// %2F is an encoded slash — it should match within a single segment
		const res = await app.fetch(new Request("http://localhost/files/dir%2Ffile.txt"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ path: "dir/file.txt" });
	});

	it("decodes multiple encoded params in one path", async () => {
		const app = createApp();
		app.get("/users/:userId/files/:fileName", (ctx) => ({
			userId: ctx.params.userId,
			fileName: ctx.params.fileName,
		}));

		const res = await app.fetch(
			new Request("http://localhost/users/john%20doe/files/my%20doc.pdf"),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			userId: "john doe",
			fileName: "my doc.pdf",
		});
	});
});

describe("Unicode path parameters", () => {
	it("handles unicode characters in path parameter", async () => {
		const app = createApp();
		app.get("/users/:name", (ctx) => ({ name: ctx.params.name }));

		// The URL constructor will percent-encode the unicode chars in the path
		const res = await app.fetch(new Request("http://localhost/users/café"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		expect(body.name).toBe("café");
	});

	it("handles pre-encoded unicode (UTF-8 percent-encoding)", async () => {
		const app = createApp();
		app.get("/users/:name", (ctx) => ({ name: ctx.params.name }));

		// "café" → "caf%C3%A9" in UTF-8 percent-encoding
		const res = await app.fetch(new Request("http://localhost/users/caf%C3%A9"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "café" });
	});

	it("handles CJK characters in path parameter", async () => {
		const app = createApp();
		app.get("/pages/:title", (ctx) => ({ title: ctx.params.title }));

		const res = await app.fetch(new Request("http://localhost/pages/日本語"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { title: string };
		expect(body.title).toBe("日本語");
	});

	it("handles emoji in path parameter", async () => {
		const app = createApp();
		app.get("/reactions/:emoji", (ctx) => ({ emoji: ctx.params.emoji }));

		const res = await app.fetch(new Request("http://localhost/reactions/🚀"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { emoji: string };
		expect(body.emoji).toBe("🚀");
	});
});

describe("URL-encoded query parameters", () => {
	it("automatically decodes query parameter values", async () => {
		const app = createApp();
		app.get("/search", (ctx) => ({ q: ctx.query.get("q") }));

		const res = await app.fetch(new Request("http://localhost/search?q=hello%20world"));
		expect(res.status).toBe(200);
		// URL.searchParams already decodes query values
		expect(await res.json()).toEqual({ q: "hello world" });
	});

	it("handles + as space in query parameters", async () => {
		const app = createApp();
		app.get("/search", (ctx) => ({ q: ctx.query.get("q") }));

		// In query strings, + traditionally means space
		const res = await app.fetch(new Request("http://localhost/search?q=hello+world"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ q: "hello world" });
	});

	it("handles unicode in query values", async () => {
		const app = createApp();
		app.get("/search", (ctx) => ({ q: ctx.query.get("q") }));

		const res = await app.fetch(new Request("http://localhost/search?q=カフェ"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { q: string };
		expect(body.q).toBe("カフェ");
	});
});

describe("URL-encoded static paths", () => {
	it("does not match spaces in registered path against percent-encoding", async () => {
		const app = createApp();
		app.get("/files/my file", () => ({ matched: true }));

		// Static segments with spaces won't match %20 — use params instead.
		// The regex compiles from the literal path, and URL.pathname keeps %20.
		const res = await app.fetch(new Request("http://localhost/files/my%20file"));
		expect(res.status).toBe(404);
	});

	it("matches URL-encoded static path registered with percent-encoding", async () => {
		const app = createApp();
		// Register with the same encoding the URL will have
		app.get("/files/my%20file", () => ({ matched: true }));

		const res = await app.fetch(new Request("http://localhost/files/my%20file"));
		expect(res.status).toBe(200);
	});
});

describe("Constraints with decoded parameters", () => {
	it("applies constraints to decoded parameter values", async () => {
		const app = createApp();
		app.get("/users/:name", (ctx) => ({ name: ctx.params.name })).where("name", /^[a-z ]+$/);

		// "hello%20world" decodes to "hello world" which matches the constraint
		const res = await app.fetch(new Request("http://localhost/users/hello%20world"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: "hello world" });
	});
});
