import { describe, expect, test } from "bun:test";
import { cors } from "../src/cors.js";
import { createApp } from "../src/index.js";

describe("CORS Middleware", () => {
	describe("Default configuration (allow all)", () => {
		test("adds CORS headers to simple GET request with Origin", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ data: "value" }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://example.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(await response.json()).toEqual({ data: "value" });
		});

		test("does not add CORS headers when no Origin header", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ data: "value" }));

			const response = await app.fetch(new Request("http://localhost/api/data"));

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		test("handles preflight OPTIONS request", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ data: "value" }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
		});

		test("preflight includes default allowed methods", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ data: "value" }));

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
			const methods = response.headers.get("Access-Control-Allow-Methods");
			expect(methods).toContain("GET");
			expect(methods).toContain("POST");
			expect(methods).toContain("PUT");
			expect(methods).toContain("DELETE");
			expect(methods).toContain("PATCH");
		});

		test("preflight reflects Access-Control-Request-Headers", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ data: "value" }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "POST",
						"Access-Control-Request-Headers": "Content-Type, Authorization",
					},
				}),
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
				"Content-Type, Authorization",
			);
		});
	});

	describe("Configured origin", () => {
		test("single string origin — matching request", async () => {
			const app = createApp();
			app.use(cors({ origin: "https://myapp.com" }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://myapp.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://myapp.com");
			expect(response.headers.get("Vary")).toContain("Origin");
		});

		test("single string origin — non-matching request", async () => {
			const app = createApp();
			app.use(cors({ origin: "https://myapp.com" }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://evil.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});

		test("array of origins — matching one", async () => {
			const app = createApp();
			app.use(cors({ origin: ["https://app1.com", "https://app2.com"] }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://app2.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app2.com");
			expect(response.headers.get("Vary")).toContain("Origin");
		});

		test("array of origins — none matching", async () => {
			const app = createApp();
			app.use(cors({ origin: ["https://app1.com", "https://app2.com"] }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://evil.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});
	});

	describe("Configured methods", () => {
		test("custom methods in preflight", async () => {
			const app = createApp();
			app.use(cors({ methods: ["GET", "POST"] }));
			app.get("/api/data", () => ({ ok: true }));

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
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
		});
	});

	describe("Configured headers", () => {
		test("custom allowHeaders in preflight", async () => {
			const app = createApp();
			app.use(cors({ allowHeaders: ["Content-Type", "X-Custom"] }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
						"Access-Control-Request-Headers": "Authorization",
					},
				}),
			);

			expect(response.status).toBe(204);
			// Explicit allowHeaders overrides request headers reflection
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Custom");
		});
	});

	describe("Expose headers", () => {
		test("exposeHeaders on actual response", async () => {
			const app = createApp();
			app.use(cors({ exposeHeaders: ["X-Request-Id", "X-Total-Count"] }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://example.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
				"X-Request-Id, X-Total-Count",
			);
		});
	});

	describe("Credentials", () => {
		test("credentials: true adds Allow-Credentials header", async () => {
			const app = createApp();
			app.use(cors({ origin: "https://myapp.com", credentials: true }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					headers: { Origin: "https://myapp.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
		});

		test("credentials: true on preflight", async () => {
			const app = createApp();
			app.use(cors({ origin: "https://myapp.com", credentials: true }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://myapp.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
		});
	});

	describe("Max age", () => {
		test("maxAge sets Access-Control-Max-Age on preflight", async () => {
			const app = createApp();
			app.use(cors({ maxAge: 86400 }));
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
		});

		test("no maxAge by default", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(response.headers.get("Access-Control-Max-Age")).toBeNull();
		});
	});

	describe("Works with route groups", () => {
		test("CORS middleware in group applies to group routes", async () => {
			const app = createApp();
			app.group({ prefix: "/api", middleware: [cors()] }, (router) => {
				router.get("/users", () => ({ users: [] }));
			});

			const response = await app.fetch(
				new Request("http://localhost/api/users", {
					headers: { Origin: "https://example.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});

		test("preflight OPTIONS uses group middleware, not just global", async () => {
			const app = createApp();
			// No global CORS — only the /api group has it
			app.group({ prefix: "/api", middleware: [cors()] }, (router) => {
				router.get("/users", () => ({ users: [] }));
			});
			app.get("/public", () => ({ public: true }));

			// Preflight to /api/users should get CORS headers from group middleware
			const apiResponse = await app.fetch(
				new Request("http://localhost/api/users", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(apiResponse.status).toBe(204);
			expect(apiResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(apiResponse.headers.get("Access-Control-Allow-Methods")).toBeTruthy();

			// Preflight to /public should NOT get CORS headers (no CORS middleware)
			const publicResponse = await app.fetch(
				new Request("http://localhost/public", {
					method: "OPTIONS",
					headers: {
						Origin: "https://example.com",
						"Access-Control-Request-Method": "GET",
					},
				}),
			);

			expect(publicResponse.status).toBe(204);
			expect(publicResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});
	});

	describe("Works with handler responses", () => {
		test("adds CORS headers to custom Response objects", async () => {
			const app = createApp();
			app.use(cors());
			app.get(
				"/api/custom",
				() =>
					new Response(JSON.stringify({ custom: true }), {
						status: 201,
						headers: { "Content-Type": "application/json" },
					}),
			);

			const response = await app.fetch(
				new Request("http://localhost/api/custom", {
					headers: { Origin: "https://example.com" },
				}),
			);

			expect(response.status).toBe(201);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(await response.json()).toEqual({ custom: true });
		});

		test("adds CORS headers to string responses", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/text", () => "hello");

			const response = await app.fetch(
				new Request("http://localhost/api/text", {
					headers: { Origin: "https://example.com" },
				}),
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(await response.text()).toBe("hello");
		});
	});

	describe("Non-CORS OPTIONS requests", () => {
		test("OPTIONS without Origin still returns normal 204", async () => {
			const app = createApp();
			app.use(cors());
			app.get("/api/data", () => ({ ok: true }));

			const response = await app.fetch(
				new Request("http://localhost/api/data", {
					method: "OPTIONS",
				}),
			);

			// Normal OPTIONS handling (no CORS headers)
			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});
	});
});
