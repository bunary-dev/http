/**
 * Tests for `ctx.cookies`: lazy request-cookie parsing, queuing `Set-Cookie`
 * headers, and appending them onto whatever `Response` the router produces.
 *
 * @see {@link ../src/cookies.ts}
 */
import { describe, expect, it } from "bun:test";
import { createCookieJar } from "../src/cookies.js";
import { createRouter } from "../src/index.js";

describe("createCookieJar()", () => {
	describe("parsing", () => {
		it("returns undefined / empty when there is no Cookie header", () => {
			const jar = createCookieJar(new Request("http://localhost/"));

			expect(jar.get("session")).toBeUndefined();
			expect(jar.getAll()).toEqual({});
		});

		it("parses a single cookie", () => {
			const jar = createCookieJar(
				new Request("http://localhost/", { headers: { cookie: "session=abc123" } }),
			);

			expect(jar.get("session")).toBe("abc123");
			expect(jar.getAll()).toEqual({ session: "abc123" });
		});

		it("parses many cookies", () => {
			const jar = createCookieJar(
				new Request("http://localhost/", {
					headers: { cookie: "session=abc123; theme=dark; lang=en" },
				}),
			);

			expect(jar.getAll()).toEqual({ session: "abc123", theme: "dark", lang: "en" });
			expect(jar.get("theme")).toBe("dark");
			expect(jar.get("missing")).toBeUndefined();
		});

		it("URL-decodes cookie values", () => {
			const jar = createCookieJar(
				new Request("http://localhost/", {
					headers: { cookie: `greeting=${encodeURIComponent("hello world")}` },
				}),
			);

			expect(jar.get("greeting")).toBe("hello world");
		});

		it("parses lazily, caching after the first access", () => {
			let reads = 0;
			const request = new Request("http://localhost/", { headers: { cookie: "a=1" } });
			const originalGet = request.headers.get.bind(request.headers);
			Object.defineProperty(request.headers, "get", {
				value: (name: string) => {
					if (name.toLowerCase() === "cookie") reads++;
					return originalGet(name);
				},
			});

			const jar = createCookieJar(request);
			expect(reads).toBe(0);

			jar.get("a");
			expect(reads).toBe(1);

			jar.getAll();
			expect(reads).toBe(1);
		});
	});

	describe("set()", () => {
		it("queues a bare Set-Cookie header with no options", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.set("session", "abc123");

			expect(jar.headers()).toEqual(["session=abc123"]);
		});

		it("serializes options in order: Max-Age, Path, HttpOnly, Secure, SameSite", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.set("session", "abc123", {
				path: "/",
				httpOnly: true,
				secure: true,
				sameSite: "strict",
				maxAge: 3600,
			});

			expect(jar.headers()).toEqual([
				"session=abc123; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Strict",
			]);
		});

		it("queues multiple set() calls as separate header values", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.set("a", "1");
			jar.set("b", "2");

			expect(jar.headers()).toEqual(["a=1", "b=2"]);
		});
	});

	describe("delete()", () => {
		it("forces Max-Age=0 and an epoch Expires", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.delete("session");

			const [header] = jar.headers();
			expect(header).toContain("session=");
			expect(header).toContain("Max-Age=0");
			expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
		});

		it("keeps caller-supplied path/domain while forcing expiry", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.delete("session", { path: "/admin", domain: "example.com" });

			const [header] = jar.headers();
			expect(header).toContain("Path=/admin");
			expect(header).toContain("Domain=example.com");
			expect(header).toContain("Max-Age=0");
		});

		it("overrides a caller-supplied maxAge/expires with deletion values", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.delete("session", { maxAge: 3600, expires: new Date("2099-01-01") });

			const [header] = jar.headers();
			expect(header).toContain("Max-Age=0");
			expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
			expect(header).not.toContain("2099");
		});
	});

	describe("headers()", () => {
		it("returns an empty array when nothing was queued", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			expect(jar.headers()).toEqual([]);
		});

		it("returns a snapshot that later set() calls do not mutate", () => {
			const jar = createCookieJar(new Request("http://localhost/"));
			jar.set("a", "1");
			const snapshot = jar.headers();
			jar.set("b", "2");

			expect(snapshot).toEqual(["a=1"]);
		});
	});
});

describe("ctx.cookies integration", () => {
	it("appends Set-Cookie to a 200 response", async () => {
		const app = createRouter();
		app.get("/login", (ctx) => {
			ctx.cookies.set("session", "abc123", { httpOnly: true });
			return ctx.json({ ok: true });
		});

		const response = await app.fetch(new Request("http://localhost/login"));

		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toBe("session=abc123; HttpOnly");
	});

	it("appends Set-Cookie to a 404 response (queued by global middleware)", async () => {
		const app = createRouter();
		app.use(async (ctx, next) => {
			ctx.cookies.set("visited", "1");
			return await next();
		});

		const response = await app.fetch(new Request("http://localhost/missing"));

		expect(response.status).toBe(404);
		expect(response.headers.get("set-cookie")).toBe("visited=1");
	});

	it("appends Set-Cookie to a 405 response", async () => {
		const app = createRouter();
		app.use(async (ctx, next) => {
			ctx.cookies.set("visited", "1");
			return await next();
		});
		app.get("/only-get", () => ({ ok: true }));

		const response = await app.fetch(new Request("http://localhost/only-get", { method: "POST" }));

		expect(response.status).toBe(405);
		expect(response.headers.get("set-cookie")).toBe("visited=1");
	});

	it("appends Set-Cookie to an error response", async () => {
		const app = createRouter();
		app.get("/boom", (ctx) => {
			ctx.cookies.set("errored", "1");
			throw new Error("boom");
		});

		const response = await app.fetch(new Request("http://localhost/boom"));

		expect(response.status).toBe(500);
		expect(response.headers.get("set-cookie")).toBe("errored=1");
	});

	it("appends Set-Cookie to an immutable redirect response", async () => {
		const app = createRouter();
		app.get("/old", (ctx) => {
			ctx.cookies.set("seen", "1");
			return Response.redirect("http://localhost/new", 301);
		});

		const response = await app.fetch(new Request("http://localhost/old"));

		expect(response.status).toBe(301);
		expect(response.headers.get("location")).toBe("http://localhost/new");
		expect(response.headers.get("set-cookie")).toBe("seen=1");
	});

	it("appends Set-Cookie to ctx.redirect()", async () => {
		const app = createRouter();
		app.get("/old", (ctx) => {
			ctx.cookies.set("seen", "1");
			return ctx.redirect("/new");
		});

		const response = await app.fetch(new Request("http://localhost/old"));

		expect(response.status).toBe(302);
		expect(response.headers.get("set-cookie")).toBe("seen=1");
	});

	it("preserves multiple Set-Cookie headers as separate header entries", async () => {
		const app = createRouter();
		app.get("/multi", (ctx) => {
			ctx.cookies.set("a", "1");
			ctx.cookies.set("b", "2");
			return ctx.json({ ok: true });
		});

		const response = await app.fetch(new Request("http://localhost/multi"));
		const values = response.headers.getSetCookie();

		expect(values.sort()).toEqual(["a=1", "b=2"]);
	});

	it("reads incoming cookies via ctx.cookies.get()/getAll()", async () => {
		const app = createRouter();
		app.get("/whoami", (ctx) =>
			ctx.json({ session: ctx.cookies.get("session"), all: ctx.cookies.getAll() }),
		);

		const response = await app.fetch(
			new Request("http://localhost/whoami", { headers: { cookie: "session=abc; theme=dark" } }),
		);

		expect(await response.json()).toEqual({
			session: "abc",
			all: { session: "abc", theme: "dark" },
		});
	});

	it("does not add a set-cookie header when nothing was queued", async () => {
		const app = createRouter();
		app.get("/plain", () => ({ ok: true }));

		const response = await app.fetch(new Request("http://localhost/plain"));

		expect(response.headers.has("set-cookie")).toBe(false);
	});

	it("survives toResponse() for plain-object handler returns", async () => {
		const app = createRouter();
		app.get("/object", (ctx) => {
			ctx.cookies.set("via", "object-return");
			return { ok: true };
		});

		const response = await app.fetch(new Request("http://localhost/object"));

		expect(response.headers.get("set-cookie")).toBe("via=object-return");
		expect(await response.json()).toEqual({ ok: true });
	});
});
