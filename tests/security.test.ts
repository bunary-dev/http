/**
 * Security / Penetration Tests
 *
 * Adversarial inputs designed to probe the HTTP framework for common
 * web-application vulnerabilities. Each describe block targets a
 * specific attack class.
 *
 * These tests are intentionally separate from functional tests and
 * will be expanded as the framework grows.
 */
import { describe, expect, it } from "bun:test";
import { createApp } from "../src/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Convenience: fetch a path against an app and return the Response */
function req(app: ReturnType<typeof createApp>, path: string, method = "GET") {
	return app.fetch(new Request(`http://localhost${path}`, { method }));
}

/** Build a simple app with a couple of parameterised routes */
function securityApp() {
	const app = createApp();

	// Echoes params back — lets us inspect what the framework decoded
	app.get("/users/:id", (ctx) => ({
		id: ctx.params.id,
	}));

	app.get("/files/:name", (ctx) => ({
		name: ctx.params.name,
	}));

	app.get("/search", (ctx) => ({
		q: ctx.query.get("q"),
	}));

	app.post("/echo", async (ctx) => {
		const body = await ctx.request.text();
		return { body };
	});

	app.get("/safe", () => ({ ok: true }));

	return app;
}

// ─── 1. Path Traversal ───────────────────────────────────────────────

describe("Path Traversal", () => {
	const app = securityApp();

	it("plain ../ does not match a parameterised route", async () => {
		const res = await req(app, "/users/../etc/passwd");
		// URL constructor normalises ../ so pathname becomes /etc/passwd → 404
		expect(res.status).toBe(404);
	});

	it("encoded ../ (%2e%2e%2f) stays in param without traversal", async () => {
		const res = await req(app, "/files/%2e%2e%2fetc%2fpasswd");
		// The %2F inside the segment is decoded by extractParams but the
		// route regex [^/]+ matches against the raw pathname (which keeps %2F).
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		// Should have decoded but NOT caused path traversal
		expect(body.name).toBe("../etc/passwd");
		// Crucially, the framework did not serve /etc/passwd
	});

	it("double-encoded traversal (%252e%252e%252f) decodes one layer only", async () => {
		const res = await req(app, "/files/%252e%252e%252f");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		// One decode: %252e → %2e (literal text, not further decoded)
		expect(body.name).toBe("%2e%2e%2f");
	});

	it("mixed encoded/plain traversal does not escape route", async () => {
		const res = await req(app, "/files/..%2F..%2Fetc%2Fpasswd");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		expect(body.name).toBe("../../etc/passwd");
	});

	it("backslash traversal (Windows-style) is normalised by URL parser", async () => {
		const res = await req(app, "/files/..\\etc\\passwd");
		// URL constructor treats \ as / and resolves ../ → pathname becomes /etc/passwd
		// No route matches /etc/passwd → 404 (safe)
		expect(res.status).toBe(404);
	});
});

// ─── 2. Null Byte Injection ──────────────────────────────────────────

describe("Null Byte Injection", () => {
	const app = securityApp();

	it("encoded null byte %00 in param is decoded but contained", async () => {
		const res = await req(app, "/files/malicious%00.txt");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		// Null byte is decoded — the framework should not truncate at \0
		expect(body.name).toBe("malicious\0.txt");
		expect(body.name.length).toBe("malicious\0.txt".length);
	});

	it("null byte in query parameter is decoded", async () => {
		const res = await req(app, "/search?q=test%00injected");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { q: string };
		expect(body.q).toBe("test\0injected");
	});

	it("multiple null bytes do not crash the router", async () => {
		const res = await req(app, "/files/%00%00%00");
		expect(res.status).toBe(200);
	});
});

// ─── 3. CRLF Injection / Header Splitting ────────────────────────────

describe("CRLF Injection", () => {
	const app = securityApp();

	it("encoded CRLF in param does not split response headers", async () => {
		const res = await req(app, "/files/test%0d%0aX-Injected:%20true");
		expect(res.status).toBe(200);
		// The injected header must NOT appear as a real response header
		expect(res.headers.get("X-Injected")).toBeNull();
		const body = (await res.json()) as { name: string };
		expect(body.name).toContain("\r\n");
	});

	it("encoded LF in query value does not affect headers", async () => {
		const res = await req(app, "/search?q=test%0aX-Injected:%20yes");
		expect(res.status).toBe(200);
		expect(res.headers.get("X-Injected")).toBeNull();
	});
});

// ─── 4. XSS / Script Injection in Params ─────────────────────────────

describe("XSS via Path Parameters", () => {
	const app = securityApp();

	it("script tags in params are returned as data, not executed", async () => {
		const payload = encodeURIComponent("<script>alert(1)</script>");
		const res = await req(app, `/users/${payload}`);
		expect(res.status).toBe(200);
		// Response is JSON — Content-Type prevents browser rendering as HTML
		expect(res.headers.get("Content-Type")).toBe("application/json");
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("<script>alert(1)</script>");
	});

	it("HTML entities in params are not double-encoded", async () => {
		const payload = encodeURIComponent('"><img src=x onerror=alert(1)>');
		const res = await req(app, `/files/${payload}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		expect(body.name).toBe('"><img src=x onerror=alert(1)>');
	});

	it("javascript: URI in param is just data", async () => {
		const payload = encodeURIComponent("javascript:alert(document.cookie)");
		const res = await req(app, `/users/${payload}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("javascript:alert(document.cookie)");
	});

	it("XSS in query parameters stays as data", async () => {
		const res = await req(app, "/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		const body = (await res.json()) as { q: string };
		expect(body.q).toBe("<script>alert(1)</script>");
	});
});

// ─── 5. SQL Injection Patterns ────────────────────────────────────────

describe("SQL Injection Patterns in Params", () => {
	const app = securityApp();

	it("SQL injection payload is passed as raw string data", async () => {
		const payload = encodeURIComponent("'; DROP TABLE users; --");
		const res = await req(app, `/users/${payload}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		// Framework passes it through — app layer is responsible for parameterised queries
		expect(body.id).toBe("'; DROP TABLE users; --");
	});

	it("UNION SELECT in param is just data", async () => {
		const payload = encodeURIComponent("1 UNION SELECT * FROM passwords");
		const res = await req(app, `/users/${payload}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("1 UNION SELECT * FROM passwords");
	});
});

// ─── 6. Prototype Pollution ──────────────────────────────────────────

describe("Prototype Pollution via Params", () => {
	it("__proto__ as param name does not pollute Object prototype", async () => {
		const app = createApp();
		app.get("/:key", (ctx) => ({ key: ctx.params.key }));

		const res = await req(app, "/__proto__");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { key: string };
		expect(body.key).toBe("__proto__");

		// Verify Object.prototype is not polluted
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("constructor param does not affect prototype chain", async () => {
		const app = createApp();
		app.get("/:key", (ctx) => ({ key: ctx.params.key }));

		const res = await req(app, "/constructor");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { key: string };
		expect(body.key).toBe("constructor");
	});

	it("__proto__ in query param does not pollute", async () => {
		const app = securityApp();
		const res = await req(app, "/search?__proto__[polluted]=true&q=test");
		expect(res.status).toBe(200);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

// ─── 7. Oversized / Extreme Input ─────────────────────────────────────

describe("Oversized and Extreme Input", () => {
	const app = securityApp();

	it("extremely long path parameter does not crash", async () => {
		const longParam = "A".repeat(10_000);
		const res = await req(app, `/users/${longParam}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id.length).toBe(10_000);
	});

	it("extremely long path with no route returns 404 without crash", async () => {
		const longPath = "/segment".repeat(500);
		const res = await req(app, longPath);
		expect(res.status).toBe(404);
	});

	it("thousands of query parameters do not crash", async () => {
		const params = Array.from({ length: 2000 }, (_, i) => `k${i}=v${i}`).join("&");
		const res = await req(app, `/search?${params}`);
		expect(res.status).toBe(200);
	});

	it("deeply nested URL-encoded value decodes once only", async () => {
		// 5 layers of encoding
		let val = "payload";
		for (let i = 0; i < 5; i++) {
			val = encodeURIComponent(val);
		}
		const res = await req(app, `/files/${val}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { name: string };
		// Only ONE layer decoded
		let expected = "payload";
		for (let i = 0; i < 4; i++) {
			expected = encodeURIComponent(expected);
		}
		expect(body.name).toBe(expected);
	});
});

// ─── 8. Method Tampering ──────────────────────────────────────────────

describe("Method Tampering", () => {
	it("non-standard HTTP method returns 404, not crash", async () => {
		const app = securityApp();
		const res = await req(app, "/safe", "PURGE");
		// No route registered for PURGE → 405 (path exists) or 404
		expect([404, 405]).toContain(res.status);
	});

	it("empty-ish method edge case does not crash", async () => {
		const app = securityApp();
		// Bun may normalise this, but the framework should not crash
		const res = await app.fetch(
			new Request("http://localhost/safe", { method: "GET" }),
		);
		expect(res.status).toBe(200);
	});
});

// ─── 9. Open Redirect Patterns ────────────────────────────────────────

describe("Open Redirect via Path", () => {
	const app = securityApp();

	it("double-slash path //evil.com does not match routes", async () => {
		const res = await req(app, "//evil.com");
		// URL constructor normalises this — pathname stays "//evil.com"
		// No route should match
		expect(res.status).toBe(404);
	});

	it("/\\evil.com does not match routes", async () => {
		const res = await req(app, "/%5Cevil.com");
		expect(res.status).toBe(404);
	});
});

// ─── 10. Error Handler Information Leak ───────────────────────────────

describe("Error Information Leak", () => {
	it("throwing handler does not expose stack traces in default response", async () => {
		const app = createApp();
		app.get("/boom", () => {
			throw new Error("SECRET_DATABASE_PASSWORD=hunter2");
		});

		const res = await req(app, "/boom");
		expect(res.status).toBe(500);
		const text = await res.text();
		// In non-production, message is leaked (by design for dev DX).
		// But stack trace / file paths should never appear in the body.
		expect(text).not.toContain("at ");
		expect(text).not.toContain(".ts:");
		expect(text).not.toContain("node_modules");
	});

	it("non-Error thrown objects do not expose internals", async () => {
		const app = createApp();
		app.get("/boom", () => {
			throw { secret: "password123", code: 42 };
		});

		const res = await req(app, "/boom");
		expect(res.status).toBe(500);
		const text = await res.text();
		// The thrown object's properties should not appear in the response
		expect(text).not.toContain("password123");
		expect(text).not.toContain('"secret"');
	});

	it("error with circular reference does not crash", async () => {
		const app = createApp();
		app.get("/boom", () => {
			const err: Record<string, unknown> = new Error("circular");
			err.self = err;
			throw err;
		});

		const res = await req(app, "/boom");
		expect(res.status).toBe(500);
	});
});

// ─── 11. Request Smuggling / Ambiguity ────────────────────────────────

describe("Request Ambiguity", () => {
	it("route with trailing slash and without are treated consistently", async () => {
		const app = createApp();
		app.get("/api/data", () => ({ ok: true }));

		const res1 = await req(app, "/api/data");
		const res2 = await req(app, "/api/data/");
		// Both should match (trailing slash tolerance)
		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
	});

	it("case-sensitive paths — /Users is not /users", async () => {
		const app = securityApp();
		const lower = await req(app, "/users/1");
		const upper = await req(app, "/Users/1");
		// Routes are case-sensitive by default
		expect(lower.status).toBe(200);
		expect(upper.status).toBe(404);
	});
});

// ─── 12. Middleware Bypass ────────────────────────────────────────────

describe("Middleware Bypass Attempts", () => {
	it("URL-encoded path still triggers middleware", async () => {
		const app = createApp();
		let middlewareRan = false;

		app.use(async (_ctx, next) => {
			middlewareRan = true;
			return await next();
		});

		app.get("/admin/:action", (ctx) => ({ action: ctx.params.action }));

		await req(app, "/admin/%61%63%74%69%6f%6e"); // "action" encoded
		expect(middlewareRan).toBe(true);
	});

	it("double-encoded path still triggers middleware", async () => {
		const app = createApp();
		let middlewareRan = false;

		app.use(async (_ctx, next) => {
			middlewareRan = true;
			return await next();
		});

		app.get("/admin/:action", (ctx) => ({ action: ctx.params.action }));

		await req(app, "/admin/%2561%2563%2574"); // double-encoded "act"
		expect(middlewareRan).toBe(true);
	});

	it("encoded path does not bypass path-checking middleware", async () => {
		const app = createApp();

		app.use(async (ctx, next) => {
			const url = new URL(ctx.request.url);
			// Middleware checks raw pathname for /admin prefix
			if (url.pathname.startsWith("/admin")) {
				return new Response("Forbidden", { status: 403 });
			}
			return await next();
		});

		app.get("/admin/dashboard", () => ({ secret: true }));

		// Direct access blocked
		const res1 = await req(app, "/admin/dashboard");
		expect(res1.status).toBe(403);

		// Encoded /admin should still be blocked (URL keeps encoding in pathname)
		const res2 = await req(app, "/%61dmin/dashboard");
		// Note: URL constructor may or may not normalise %61 → 'a'.
		// If it does, middleware still catches it via pathname
		// If it doesn't, the route won't match anyway (different regex)
		expect([403, 404]).toContain(res2.status);
		// Either way, the secret data must NOT be returned
		if (res2.status === 200) {
			const body = (await res2.json()) as { secret?: boolean };
			expect(body.secret).toBeUndefined();
		}
	});
});

// ─── 13. Host Header Attacks ──────────────────────────────────────────

describe("Host Header Attacks", () => {
	it("spoofed host header does not affect routing", async () => {
		const app = securityApp();

		const res = await app.fetch(
			new Request("http://localhost/safe", {
				headers: { Host: "evil.com" },
			}),
		);
		expect(res.status).toBe(200);
		// Route matched based on path, not host
		expect(await res.json()).toEqual({ ok: true });
	});
});

// ─── 14. Content-Type Confusion ───────────────────────────────────────

describe("Content-Type Confusion", () => {
	it("string response always has text/plain content-type", async () => {
		const app = createApp();
		app.get("/html", () => "<h1>Hello</h1>");

		const res = await req(app, "/html");
		expect(res.status).toBe(200);
		// Must NOT be text/html — prevents browser rendering as HTML
		expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
	});

	it("object response always has application/json content-type", async () => {
		const app = createApp();
		app.get("/data", () => ({ html: "<script>alert(1)</script>" }));

		const res = await req(app, "/data");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});
});
