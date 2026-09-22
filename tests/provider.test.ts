import { describe, expect, test } from "bun:test";
import { createApp, defineConfig, MissingBindingError } from "@bunary/core";
import { createRouter } from "../src/index.js";
import { httpProvider, RouterToken, serve } from "../src/provider.js";
import type { BunaryServer, Router } from "../src/types/index.js";

/** Boot an app around a router with the given `http` config namespace. */
function bootApp(router: Router, http?: unknown) {
	return createApp({
		config: { app: { name: "http-provider-test" }, ...(http !== undefined && { http }) } as never,
		providers: [httpProvider(router)],
	});
}

/** Run `fn` against a live server and always stop it afterwards. */
async function withServer(
	server: BunaryServer,
	fn: (base: string) => Promise<void>,
): Promise<void> {
	try {
		await fn(`http://${server.hostname}:${server.port}`);
	} finally {
		server.stop();
	}
}

describe("RouterToken", () => {
	test("is a core token named http.router", () => {
		expect(String(RouterToken)).toBe("Token(http.router)");
	});
});

describe("httpProvider", () => {
	test("binds the router under RouterToken", async () => {
		const router = createRouter();
		const app = await bootApp(router, { port: 0 }).boot();

		expect(app.get(RouterToken)).toBe(router);
	});

	test("is named so core can describe it in errors", () => {
		expect(httpProvider(createRouter()).name).toBe("@bunary/http");
	});

	test("does not listen during register or boot", async () => {
		const router = createRouter();
		let listened = false;
		const spy = {
			...router,
			listen: () => {
				listened = true;
				return undefined;
			},
		} as unknown as Router;

		await bootApp(spy, { port: 0 }).boot();

		expect(listened).toBe(false);
	});

	test("accepts an absent http namespace", async () => {
		const app = await bootApp(createRouter()).boot();

		expect(app.booted).toBe(true);
	});

	test("accepts a fully populated http namespace", async () => {
		const app = await bootApp(createRouter(), {
			port: 0,
			hostname: "127.0.0.1",
			cors: { origin: "*" },
		}).boot();

		expect(app.booted).toBe(true);
	});

	test("rejects a non-object http namespace", async () => {
		expect(bootApp(createRouter(), 8080).boot()).rejects.toThrow(/"http" must be an object/);
	});

	test("rejects a non-numeric http.port", async () => {
		expect(bootApp(createRouter(), { port: "8080" }).boot()).rejects.toThrow(/"http.port"/);
	});

	test("rejects an out-of-range http.port", async () => {
		expect(bootApp(createRouter(), { port: 70000 }).boot()).rejects.toThrow(/"http.port"/);
	});

	test("rejects a non-string http.hostname", async () => {
		expect(bootApp(createRouter(), { hostname: 8080 }).boot()).rejects.toThrow(/"http.hostname"/);
	});

	test("rejects a non-object http.cors", async () => {
		expect(bootApp(createRouter(), { cors: "*" }).boot()).rejects.toThrow(/"http.cors"/);
	});
});

describe("serve", () => {
	test("listens on the configured port and round-trips a request", async () => {
		const router = createRouter();
		router.get("/ping", (ctx) => ctx.json({ pong: true }));
		const app = await bootApp(router, { port: 0, hostname: "127.0.0.1" }).boot();

		await withServer(serve(app), async (base) => {
			const response = await fetch(`${base}/ping`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ pong: true });
		});
	});

	test("exposes the Application to handlers as ctx.app", async () => {
		const router = createRouter();
		router.get("/name", (ctx) => ctx.json({ name: ctx.app?.config.get("app.name") }));
		const app = await bootApp(router, { port: 0, hostname: "127.0.0.1" }).boot();

		await withServer(serve(app), async (base) => {
			expect(await (await fetch(`${base}/name`)).json()).toEqual({ name: "http-provider-test" });
		});
	});

	test("overrides win over the http config namespace", async () => {
		const router = createRouter();
		const app = await bootApp(router, { port: 65530, hostname: "0.0.0.0" }).boot();

		await withServer(serve(app, { port: 0, hostname: "127.0.0.1" }), async (base) => {
			expect(base).not.toContain("65530");
		});
	});

	test("falls back to listen() defaults when http config is absent", async () => {
		const router = createRouter();
		const app = await bootApp(router).boot();

		await withServer(serve(app, { port: 0 }), async (base) => {
			expect(base).toContain("://");
		});
	});

	test("throws MissingBindingError when the provider was never registered", async () => {
		const app = await createApp({ config: { app: { name: "bare" } } }).boot();

		expect(() => serve(app)).toThrow(MissingBindingError);
	});
});

describe("ctx.app", () => {
	test("is undefined for a standalone router", async () => {
		const router = createRouter();
		let seen: unknown = "unset";
		router.get("/", (ctx) => {
			seen = ctx.app;
			return ctx.text("ok");
		});

		await router.fetch(new Request("http://localhost/"));

		expect(seen).toBeUndefined();
	});

	test("is set by createRouter({ app }) without the provider", async () => {
		const app = createApp({ config: { app: { name: "manual" } } });
		const router = createRouter({ app });
		router.get("/", (ctx) => ctx.json({ name: ctx.app?.config.get("app.name") }));

		const response = await router.fetch(new Request("http://localhost/"));

		expect(await response.json()).toEqual({ name: "manual" });
	});

	test("is available on 404 contexts too", async () => {
		const router = createRouter({
			onNotFound: (ctx) => ctx.json({ name: ctx.app?.config.get("app.name") }, { status: 404 }),
		});
		await bootApp(router, { port: 0 }).boot();

		const response = await router.fetch(new Request("http://localhost/missing"));

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ name: "http-provider-test" });
	});
});

describe("BunaryConfig augmentation", () => {
	test("accepts an http namespace in defineConfig", () => {
		const config = defineConfig({
			app: { name: "augmented" },
			http: { port: 1, hostname: "localhost", cors: { origin: "*" } },
		});

		expect(config.http?.port).toBe(1);
	});

	test("leaves the http namespace optional", () => {
		expect(defineConfig({ app: { name: "augmented" } }).http).toBeUndefined();
	});
});
