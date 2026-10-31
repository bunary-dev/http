import { afterEach, describe, expect, test } from "bun:test";
import { createRouter, type RateLimitStore, rateLimit } from "../src/index.js";

const realNow = Date.now;
afterEach(() => {
	Date.now = realNow;
});

/** Freeze `Date.now()` at `ms`; call again to move the clock. */
function setNow(ms: number): void {
	Date.now = () => ms;
}

function appWith(options: Parameters<typeof rateLimit>[0]) {
	const app = createRouter();
	app.use(rateLimit(options));
	app.get("/", () => ({ ok: true }));
	return app;
}

const get = (headers?: Record<string, string>) => new Request("http://localhost/", { headers });

describe("rateLimit()", () => {
	test("allows `limit` requests, then answers 429 with Retry-After", async () => {
		setNow(1_000_000);
		const app = appWith({ limit: 2, windowMs: 60_000 });

		expect((await app.fetch(get())).status).toBe(200);
		expect((await app.fetch(get())).status).toBe(200);

		setNow(1_010_000);
		const blocked = await app.fetch(get());
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("content-type")).toContain("application/problem+json");
		expect(blocked.headers.get("Retry-After")).toBe("50");
		const body = (await blocked.json()) as { status: number; title: string };
		expect(body.status).toBe(429);
		expect(body.title).toBe("Too Many Requests");
	});

	test("the window resets after windowMs", async () => {
		setNow(1_000_000);
		const app = appWith({ limit: 1, windowMs: 1_000 });

		expect((await app.fetch(get())).status).toBe(200);
		expect((await app.fetch(get())).status).toBe(429);

		setNow(1_001_000);
		const fresh = await app.fetch(get());
		expect(fresh.status).toBe(200);
		expect(fresh.headers.get("RateLimit-Remaining")).toBe("0");
	});

	test("keys are counted independently", async () => {
		const app = appWith({
			limit: 1,
			windowMs: 60_000,
			key: (ctx) => ctx.request.headers.get("x-api-key") ?? "anon",
		});

		expect((await app.fetch(get({ "x-api-key": "a" }))).status).toBe(200);
		expect((await app.fetch(get({ "x-api-key": "a" }))).status).toBe(429);
		expect((await app.fetch(get({ "x-api-key": "b" }))).status).toBe(200);
	});

	test("every response carries RateLimit-* headers", async () => {
		setNow(2_000_000);
		const app = appWith({ limit: 3, windowMs: 30_000 });

		const first = await app.fetch(get());
		expect(first.headers.get("RateLimit-Limit")).toBe("3");
		expect(first.headers.get("RateLimit-Remaining")).toBe("2");
		expect(first.headers.get("RateLimit-Reset")).toBe("30");

		setNow(2_010_500);
		const second = await app.fetch(get());
		expect(second.headers.get("RateLimit-Remaining")).toBe("1");
		expect(second.headers.get("RateLimit-Reset")).toBe("20");

		await app.fetch(get());
		const blocked = await app.fetch(get());
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("RateLimit-Limit")).toBe("3");
		expect(blocked.headers.get("RateLimit-Remaining")).toBe("0");
		expect(blocked.headers.get("RateLimit-Reset")).toBe("20");
	});

	test("headers are added to 404 and error responses too", async () => {
		const app = createRouter();
		app.use(rateLimit({ limit: 5, windowMs: 1_000 }));
		app.get("/boom", () => {
			throw new Error("boom");
		});

		const missing = await app.fetch(new Request("http://localhost/nope"));
		expect(missing.status).toBe(404);
		expect(missing.headers.get("RateLimit-Remaining")).toBe("4");

		const failed = await app.fetch(new Request("http://localhost/boom"));
		expect(failed.status).toBe(500);
		expect(failed.headers.get("RateLimit-Remaining")).toBe("3");
	});

	test("trustProxy: false ignores x-forwarded-for", async () => {
		const app = appWith({ limit: 1, windowMs: 60_000 });

		expect((await app.fetch(get({ "x-forwarded-for": "1.1.1.1" }))).status).toBe(200);
		expect((await app.fetch(get({ "x-forwarded-for": "2.2.2.2" }))).status).toBe(429);
	});

	test("trustProxy: true keys on the first x-forwarded-for hop", async () => {
		const app = appWith({ limit: 1, windowMs: 60_000, trustProxy: true });

		expect((await app.fetch(get({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).status).toBe(200);
		expect((await app.fetch(get({ "x-forwarded-for": "1.1.1.1, 10.0.0.2" }))).status).toBe(429);
		expect((await app.fetch(get({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).status).toBe(200);
	});

	test("default key uses the socket address from the server", async () => {
		const app = appWith({ limit: 1, windowMs: 60_000 });
		const serverFor = (address: string) => ({
			requestIP: () => ({ address, family: "IPv4", port: 1234 }),
		});

		expect((await app.fetch(get(), serverFor("1.1.1.1"))).status).toBe(200);
		expect((await app.fetch(get(), serverFor("1.1.1.1"))).status).toBe(429);
		expect((await app.fetch(get(), serverFor("2.2.2.2"))).status).toBe(200);
	});

	test("default key uses the socket address under listen()", async () => {
		const app = appWith({ limit: 1, windowMs: 60_000 });
		const server = app.listen({ port: 0, hostname: "127.0.0.1" });
		try {
			const url = `http://127.0.0.1:${server.port}/`;
			expect((await fetch(url)).status).toBe(200);
			expect((await fetch(url)).status).toBe(429);
		} finally {
			server.stop();
		}
	});

	test("prunes expired entries from the memory store", async () => {
		setNow(1_000_000);
		const app = appWith({
			limit: 1,
			windowMs: 1_000,
			key: (ctx) => ctx.request.headers.get("x-k") ?? "",
		});
		for (let i = 0; i < 50; i++) {
			await app.fetch(get({ "x-k": String(i) }));
		}
		setNow(1_002_000);
		// A request after expiry must still count from 1 for an old key.
		const again = await app.fetch(get({ "x-k": "0" }));
		expect(again.status).toBe(200);
		expect(again.headers.get("RateLimit-Remaining")).toBe("0");
	});

	test("accepts a custom store", async () => {
		const calls: Array<[string, number]> = [];
		const store: RateLimitStore = {
			increment: (key, windowMs) => {
				calls.push([key, windowMs]);
				return { count: 7, resetAt: Date.now() + 5_000 };
			},
		};
		const app = appWith({ limit: 10, windowMs: 9_000, store, key: () => "k" });

		const response = await app.fetch(get());
		expect(calls).toEqual([["k", 9_000]]);
		expect(response.headers.get("RateLimit-Remaining")).toBe("3");
		expect(response.headers.get("RateLimit-Reset")).toBe("5");
	});

	test("rejects invalid options", () => {
		expect(() => rateLimit({ limit: 0, windowMs: 1_000 })).toThrow();
		expect(() => rateLimit({ limit: 1, windowMs: 0 })).toThrow();
	});
});
