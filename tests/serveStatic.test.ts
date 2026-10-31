/**
 * Tests for `serveStatic()` (#126): file headers, conditional requests,
 * HEAD, path traversal (plain, encoded, symlink), dotfiles and index files.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouter, serveStatic } from "../src/index.js";

let base: string;
let root: string;

beforeAll(() => {
	base = mkdtempSync(join(tmpdir(), "bunary-static-"));
	root = join(base, "public");
	mkdirSync(join(root, "css"), { recursive: true });
	mkdirSync(join(root, "docs"));
	mkdirSync(join(root, "empty"));
	writeFileSync(join(root, "hello.txt"), "hello world");
	writeFileSync(join(root, "css", "site.css"), "body{}");
	writeFileSync(join(root, "docs", "index.html"), "<h1>docs</h1>");
	writeFileSync(join(root, ".env"), "SECRET=1");
	mkdirSync(join(root, ".well-known"));
	writeFileSync(join(root, ".well-known", "security.txt"), "contact");
	writeFileSync(join(base, "secret.txt"), "top secret");
	mkdirSync(join(base, "public-other"));
	writeFileSync(join(base, "public-other", "x.txt"), "sibling");
	symlinkSync(join(base, "secret.txt"), join(root, "escape.txt"));
	symlinkSync(base, join(root, "escapedir"));
	symlinkSync(join(root, "hello.txt"), join(root, "inside.txt"));
});

afterAll(() => {
	rmSync(base, { recursive: true, force: true });
});

function app(options?: Parameters<typeof serveStatic>[1]) {
	const router = createRouter();
	router.get("/assets/*", serveStatic(root, options));
	return router;
}

function get(router: ReturnType<typeof createRouter>, path: string, init?: RequestInit) {
	return router.fetch(new Request(`http://localhost${path}`, init));
}

describe("serveStatic", () => {
	test("serves a file with content headers", async () => {
		const res = await get(app(), "/assets/hello.txt");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello world");
		expect(res.headers.get("Content-Type")).toStartWith("text/plain");
		expect(res.headers.get("Content-Length")).toBe("11");
		expect(res.headers.get("Last-Modified")).toBeTruthy();
		expect(Number.isNaN(Date.parse(res.headers.get("Last-Modified") ?? ""))).toBe(false);
		expect(res.headers.get("ETag")).toMatch(/^W\/"[^"]+"$/);
		expect(res.headers.get("Cache-Control")).toBeNull();
	});

	test("serves nested files", async () => {
		const res = await get(app(), "/assets/css/site.css");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toStartWith("text/css");
		expect(await res.text()).toBe("body{}");
	});

	test("accepts a relative root", async () => {
		const router = createRouter();
		router.get("/files/*", serveStatic("./tests/fixtures"));
		const res = await get(router, "/files/basic-api/routes.ts");
		expect(res.status).toBe(200);
	});

	test("maxAge sets Cache-Control", async () => {
		const res = await get(app({ maxAge: 3600 }), "/assets/hello.txt");
		expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
	});

	test("304 when If-None-Match matches the ETag", async () => {
		const router = app({ maxAge: 60 });
		const first = await get(router, "/assets/hello.txt");
		const etag = first.headers.get("ETag") ?? "";
		const res = await get(router, "/assets/hello.txt", { headers: { "If-None-Match": etag } });
		expect(res.status).toBe(304);
		expect(await res.text()).toBe("");
		expect(res.headers.get("ETag")).toBe(etag);
		expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
	});

	test("If-None-Match matches in a list, strong form, and *", async () => {
		const router = app();
		const etag = (await get(router, "/assets/hello.txt")).headers.get("ETag") ?? "";
		const strong = etag.slice(2);
		for (const value of [`"nope", ${etag}`, strong, "*"]) {
			const res = await get(router, "/assets/hello.txt", { headers: { "If-None-Match": value } });
			expect(res.status).toBe(304);
		}
	});

	test("200 when If-None-Match does not match, even if If-Modified-Since would", async () => {
		const res = await get(app(), "/assets/hello.txt", {
			headers: {
				"If-None-Match": '"other"',
				"If-Modified-Since": new Date(Date.now() + 60_000).toUTCString(),
			},
		});
		expect(res.status).toBe(200);
	});

	test("304 when not modified since If-Modified-Since", async () => {
		const router = app();
		const lastModified =
			(await get(router, "/assets/hello.txt")).headers.get("Last-Modified") ?? "";
		const res = await get(router, "/assets/hello.txt", {
			headers: { "If-Modified-Since": lastModified },
		});
		expect(res.status).toBe(304);
	});

	test("200 when modified after If-Modified-Since", async () => {
		const res = await get(app(), "/assets/hello.txt", {
			headers: { "If-Modified-Since": new Date(0).toUTCString() },
		});
		expect(res.status).toBe(200);
	});

	test("HEAD returns headers only", async () => {
		const res = await get(app(), "/assets/hello.txt", { method: "HEAD" });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
		expect(res.headers.get("Content-Length")).toBe("11");
		expect(res.headers.get("Content-Type")).toStartWith("text/plain");
		expect(res.headers.get("ETag")).toMatch(/^W\//);
	});

	test("missing file is 404", async () => {
		expect((await get(app(), "/assets/nope.txt")).status).toBe(404);
	});

	test("directory without index is 404 (no listing)", async () => {
		const router = app();
		expect((await get(router, "/assets/css")).status).toBe(404);
		expect((await get(router, "/assets")).status).toBe(404);
		expect((await get(router, "/assets/")).status).toBe(404);
	});

	test("index option serves index file for directories", async () => {
		const router = app({ index: "index.html" });
		const res = await get(router, "/assets/docs");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toStartWith("text/html");
		expect(await res.text()).toBe("<h1>docs</h1>");
		expect((await get(router, "/assets/docs/")).status).toBe(200);
		expect((await get(router, "/assets/empty")).status).toBe(404);
	});

	test("dotfiles are 404 by default", async () => {
		const router = app();
		expect((await get(router, "/assets/.env")).status).toBe(404);
		expect((await get(router, "/assets/.well-known/security.txt")).status).toBe(404);
	});

	test('dotfiles: "allow" serves dotfiles', async () => {
		const router = app({ dotfiles: "allow" });
		expect(await (await get(router, "/assets/.env")).text()).toBe("SECRET=1");
		expect((await get(router, "/assets/.well-known/security.txt")).status).toBe(200);
	});

	test("symlinks that stay inside root are served", async () => {
		const res = await get(app(), "/assets/inside.txt");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello world");
	});

	describe("path traversal", () => {
		const attempts = [
			"/assets/../secret.txt",
			"/assets/%2e%2e/secret.txt",
			"/assets/..%2fsecret.txt",
			"/assets/%2e%2e%2fsecret.txt",
			"/assets/css/..%2f..%2fsecret.txt",
			"/assets/css%2f..%2f..%2fsecret.txt",
			"/assets/..%5csecret.txt",
			"/assets/%2fetc%2fpasswd",
			"/assets//etc/passwd",
			"/assets/hello.txt%00.png",
			"/assets/..%2fpublic-other%2fx.txt",
			"/assets/escape.txt",
			"/assets/escapedir/secret.txt",
		];
		for (const path of attempts) {
			test(`${path} is 404`, async () => {
				const res = await get(app({ dotfiles: "allow" }), path);
				expect(res.status).toBe(404);
				expect(await res.text()).not.toContain("top secret");
			});
		}

		test("symlink escape is 404 even via index", async () => {
			const res = await get(app({ index: "secret.txt" }), "/assets/escapedir");
			expect(res.status).toBe(404);
		});
	});
});
