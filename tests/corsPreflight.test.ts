/**
 * CORS preflight and `Vary` correctness tests (#66).
 *
 * Covers:
 * - `Vary: Origin` on disallowed origins (cache poisoning guard)
 * - `Vary` appended, never overwritten
 * - `Access-Control-Allow-Methods` derived from the router's Allow set
 * - preflight picking group middleware from the route matching
 *   `Access-Control-Request-Method`
 */
import { describe, expect, test } from "bun:test";
import { cors } from "../src/cors.js";
import { createRouter } from "../src/index.js";

function varyTokens(response: Response): string[] {
	return (response.headers.get("Vary") ?? "")
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean);
}

describe("CORS Vary handling (#66)", () => {
	test("disallowed origin still gets Vary: Origin", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/api/data", () => ({ ok: true }));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				headers: { Origin: "https://evil.com" },
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect(varyTokens(response)).toContain("Origin");
	});

	test("disallowed origin on a preflight still gets Vary: Origin", async () => {
		const app = createRouter();
		app.use(cors({ origin: ["https://app1.com"] }));
		app.get("/api/data", () => ({ ok: true }));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				method: "OPTIONS",
				headers: {
					Origin: "https://evil.com",
					"Access-Control-Request-Method": "GET",
				},
			}),
		);

		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect(varyTokens(response)).toContain("Origin");
	});

	test("Vary from the handler is preserved, not overwritten", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get(
			"/api/data",
			() =>
				new Response("ok", {
					headers: { Vary: "Accept-Encoding" },
				}),
		);

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		const tokens = varyTokens(response);
		expect(tokens).toContain("Accept-Encoding");
		expect(tokens).toContain("Origin");
	});

	test("Vary: Origin is not duplicated when the handler already set it", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get(
			"/api/data",
			() =>
				new Response("ok", {
					headers: { Vary: "origin" },
				}),
		);

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				headers: { Origin: "https://myapp.com" },
			}),
		);

		const originTokens = varyTokens(response).filter((token) => token.toLowerCase() === "origin");
		expect(originTokens).toHaveLength(1);
	});

	test("no Vary: Origin for a wildcard origin without credentials", async () => {
		const app = createRouter();
		app.use(cors());
		app.get("/api/data", () => ({ ok: true }));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				headers: { Origin: "https://example.com" },
			}),
		);

		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(varyTokens(response)).not.toContain("Origin");
	});

	test("preflight varies on the preflight request headers", async () => {
		const app = createRouter();
		app.use(cors());
		app.get("/api/data", () => ({ ok: true }));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "GET",
					"Access-Control-Request-Headers": "X-Custom",
				},
			}),
		);

		expect(response.status).toBe(204);
		const tokens = varyTokens(response);
		expect(tokens).toContain("Access-Control-Request-Method");
		expect(tokens).toContain("Access-Control-Request-Headers");
	});
});

describe("CORS preflight Allow-Methods from the route table (#66)", () => {
	test("Allow-Methods reflects the methods registered at the path", async () => {
		const app = createRouter();
		app.use(cors());
		app.get("/api/data", () => ({}));
		app.post("/api/data", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "POST",
				},
			}),
		);

		expect(response.status).toBe(204);
		const methods = (response.headers.get("Access-Control-Allow-Methods") ?? "").split(", ").sort();
		expect(methods).toEqual(["GET", "HEAD", "OPTIONS", "POST"]);
	});

	test("Allow-Methods does not advertise methods the path does not serve", async () => {
		const app = createRouter();
		app.use(cors());
		app.get("/api/read-only", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/api/read-only", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "GET",
				},
			}),
		);

		const methods = response.headers.get("Access-Control-Allow-Methods") ?? "";
		expect(methods).not.toContain("DELETE");
		expect(methods).not.toContain("PUT");
		expect(methods).not.toContain("PATCH");
		expect(methods).toContain("GET");
	});

	test("explicit methods option still wins over the route table", async () => {
		const app = createRouter();
		app.use(cors({ methods: ["GET", "POST"] }));
		app.get("/api/data", () => ({}));
		app.delete("/api/data", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/api/data", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "POST",
				},
			}),
		);

		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
	});

	test("preflight for an unknown path falls through to 404 with CORS headers", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com" }));
		app.get("/api/data", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/api/nope", {
				method: "OPTIONS",
				headers: {
					Origin: "https://myapp.com",
					"Access-Control-Request-Method": "GET",
				},
			}),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
	});

	test("preflight for an unknown path keeps credentials headers on the 404", async () => {
		const app = createRouter();
		app.use(cors({ origin: "https://myapp.com", credentials: true }));
		app.get("/api/data", () => ({}));

		const response = await app.fetch(
			new Request("http://localhost/api/nope", {
				method: "OPTIONS",
				headers: {
					Origin: "https://myapp.com",
					"Access-Control-Request-Method": "GET",
				},
			}),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
		expect(varyTokens(response)).toContain("Origin");
	});

	test("cors() used outside the router still advertises the default methods", async () => {
		const middleware = cors();
		const request = new Request("http://localhost/api/data", {
			method: "OPTIONS",
			headers: {
				Origin: "https://example.com",
				"Access-Control-Request-Method": "GET",
			},
		});
		const ctx = {
			request,
			params: {},
			query: new URLSearchParams(),
			locals: {},
		} as unknown as Parameters<typeof middleware>[0];

		const result = await middleware(ctx, async () => new Response(null, { status: 204 }));
		const response = result as Response;

		expect(response.status).toBe(204);
		const methods = response.headers.get("Access-Control-Allow-Methods") ?? "";
		expect(methods).toContain("GET");
		expect(methods).toContain("DELETE");
	});
});

describe("preflight picks middleware by Access-Control-Request-Method (#66)", () => {
	test("group middleware comes from the route matching the requested method", async () => {
		const app = createRouter();
		const seen: string[] = [];

		app.group(
			{
				prefix: "/api",
				middleware: [
					async (_ctx, next) => {
						seen.push("get-group");
						return await next();
					},
				],
			},
			(router) => {
				router.get("/items", () => ({}));
			},
		);

		app.group(
			{
				prefix: "/api",
				middleware: [
					async (_ctx, next) => {
						seen.push("post-group");
						return await next();
					},
				],
			},
			(router) => {
				router.post("/items", () => ({}));
			},
		);

		await app.fetch(
			new Request("http://localhost/api/items", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "POST",
				},
			}),
		);

		expect(seen).toEqual(["post-group"]);
	});

	test("preflight gets CORS headers from the requested method's group only", async () => {
		const app = createRouter();

		app.group({ prefix: "/api" }, (router) => {
			router.get("/items", () => ({}));
		});

		app.group(
			{ prefix: "/api", middleware: [cors({ origin: "https://writer.example" })] },
			(router) => {
				router.post("/items", () => ({}));
			},
		);

		const preflight = await app.fetch(
			new Request("http://localhost/api/items", {
				method: "OPTIONS",
				headers: {
					Origin: "https://writer.example",
					"Access-Control-Request-Method": "POST",
				},
			}),
		);

		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://writer.example");
	});

	test("preflight without Access-Control-Request-Method falls back to the first route at the path", async () => {
		const app = createRouter();
		const seen: string[] = [];

		app.group(
			{
				prefix: "/api",
				middleware: [
					async (_ctx, next) => {
						seen.push("get-group");
						return await next();
					},
				],
			},
			(router) => {
				router.get("/items", () => ({}));
			},
		);

		await app.fetch(
			new Request("http://localhost/api/items", {
				method: "OPTIONS",
				headers: { Origin: "https://example.com" },
			}),
		);

		expect(seen).toEqual(["get-group"]);
	});

	test("preflight exposes the matched route's params to middleware", async () => {
		const app = createRouter();
		let seenId: string | undefined;

		app.group(
			{
				prefix: "/api",
				middleware: [
					async (ctx, next) => {
						seenId = ctx.params.id;
						return await next();
					},
				],
			},
			(router) => {
				router.put("/items/:id", () => ({}));
			},
		);

		await app.fetch(
			new Request("http://localhost/api/items/7", {
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "PUT",
				},
			}),
		);

		expect(seenId).toBe("7");
	});
});
