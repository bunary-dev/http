/**
 * Type-level tests for typed locals composing with `cors()` and
 * `httpProvider()` (#96).
 *
 * These assertions are checked by `bun run typecheck`: an `interface` locals
 * type has no implicit index signature, so before #96 neither call compiled.
 * The runtime `expect`s keep the file honest as a test.
 *
 * @see {@link ../src/cors.ts}
 * @see {@link ../src/provider.ts}
 */
import { describe, expect, test } from "bun:test";
import { createApp } from "@bunary/core";
import type { Middleware } from "../src/index.js";
import { cors, createRouter } from "../src/index.js";
import { httpProvider, RouterToken } from "../src/provider.js";

// ─── Shared types ─────────────────────────────────────────────────────

interface InterfaceLocals {
	user: { id: number; name: string };
	requestId: string;
}

type AliasLocals = {
	user: { id: number; name: string };
	requestId: string;
};

const config = { app: { name: "typed-locals-compat" }, http: { port: 0 } } as never;

// ─── Tests ────────────────────────────────────────────────────────────

describe("interface locals", () => {
	test("router.use(cors()) compiles and runs", async () => {
		const router = createRouter<InterfaceLocals>();
		router.use(cors());
		router.get("/", (ctx) => ({ requestId: ctx.locals.requestId ?? null }));

		const res = await router.fetch(
			new Request("http://localhost/", { headers: { Origin: "https://example.com" } }),
		);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	test("cors() can be stored as Middleware<InterfaceLocals>", () => {
		const mw: Middleware<InterfaceLocals> = cors<InterfaceLocals>({ origin: "https://a.com" });
		expect(typeof mw).toBe("function");
	});

	test("httpProvider(router) compiles and binds the router", async () => {
		const router = createRouter<InterfaceLocals>();
		const app = await createApp({ config, providers: [httpProvider(router)] }).boot();
		expect(app.get(RouterToken)).toBe(router as never);
	});
});

describe("type alias locals", () => {
	test("router.use(cors()) still compiles", () => {
		const router = createRouter<AliasLocals>();
		expect(router.use(cors())).toBe(router);
	});

	test("httpProvider(router) still compiles", async () => {
		const router = createRouter<AliasLocals>();
		const app = await createApp({ config, providers: [httpProvider(router)] }).boot();
		expect(app.get(RouterToken)).toBe(router as never);
	});
});

describe("default locals", () => {
	test("cors() without a type argument is still a plain Middleware", () => {
		const mw: Middleware = cors();
		const router = createRouter();
		router.use(mw);
		expect(httpProvider(router).name).toBe("@bunary/http");
	});
});
