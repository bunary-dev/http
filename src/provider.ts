import { type Application, BunaryError, createToken, type Provider } from "@bunary/core";
import { bindApp } from "./appBinding.js";
import type { CorsOptions } from "./cors.js";
import type { BunaryServer, ListenOptions, Router } from "./types/index.js";

/**
 * The `http` configuration namespace added to `BunaryConfig`.
 *
 * Every key is optional: the augmentation below is program-wide, so a core
 * application that never uses `@bunary/http` must still type-check.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@bunary/core";
 *
 * export default defineConfig({
 *   app: { name: "my-api" },
 *   http: { port: 3000, hostname: "0.0.0.0", cors: { origin: "*" } },
 * });
 * ```
 */
export interface HttpConfig {
	/** Port `serve()` binds to (default: `listen()`'s own default, `3000`) */
	port?: number;
	/** Hostname `serve()` binds to (default: `listen()`'s own default, `localhost`) */
	hostname?: string;
	/** Options for the shipped `cors()` middleware; read by your own bootstrap */
	cors?: CorsOptions;
}

declare module "@bunary/core" {
	interface BunaryConfig {
		http?: HttpConfig;
	}
}

/**
 * Container token the router is bound under by {@link httpProvider}.
 *
 * @example
 * ```ts
 * import { RouterToken } from "@bunary/http/provider";
 *
 * const router = app.get(RouterToken);
 * router.getRoutes();
 * ```
 */
export const RouterToken = createToken<Router>("http.router");

/** The largest value a TCP port can take. */
const MAX_PORT = 65535;

/**
 * Validate the `http` configuration namespace, throwing a core `BunaryError`
 * the way core itself reports a bad config.
 *
 * Runs during `register()` so a typo fails at boot rather than at the first
 * request. An absent namespace is valid — every key is optional.
 *
 * @internal
 */
function assertHttpConfig(value: unknown): asserts value is HttpConfig | undefined {
	if (value === undefined) {
		return;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new BunaryError('BunaryConfig: "http" must be an object');
	}

	const { port, hostname, cors } = value as Record<string, unknown>;

	if (
		port !== undefined &&
		(typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > MAX_PORT)
	) {
		throw new BunaryError(`BunaryConfig: "http.port" must be an integer between 0 and ${MAX_PORT}`);
	}
	if (hostname !== undefined && typeof hostname !== "string") {
		throw new BunaryError('BunaryConfig: "http.hostname" must be a string');
	}
	if (cors !== undefined && (typeof cors !== "object" || cors === null || Array.isArray(cors))) {
		throw new BunaryError('BunaryConfig: "http.cors" must be an object');
	}
}

/**
 * Mount a router on a `@bunary/core` Application.
 *
 * `register()` binds the router under {@link RouterToken}, validates the `http`
 * configuration namespace and makes the Application available to handlers as
 * `ctx.app`. Nothing listens: starting the server is {@link serve}'s job, so a
 * booted application is still safe to use from a test or a CLI command.
 *
 * @param router - The router to mount
 * @returns A core `Provider`
 *
 * @example
 * ```ts
 * import { createApp } from "@bunary/core";
 * import { createRouter } from "@bunary/http";
 * import { httpProvider, serve } from "@bunary/http/provider";
 *
 * const router = createRouter();
 * router.get("/", (ctx) => ctx.json({ app: ctx.app?.config.get("app.name") }));
 *
 * const app = await createApp({
 *   config: { app: { name: "my-api" }, http: { port: 3000 } },
 *   providers: [httpProvider(router)],
 * }).boot();
 *
 * serve(app);
 * ```
 */
export function httpProvider(router: Router): Provider {
	return {
		name: "@bunary/http",
		register(app: Application): void {
			assertHttpConfig(app.config.get("http"));
			app.set(RouterToken, router);
			bindApp(router, app);
		},
	};
}

/**
 * Start the HTTP server for an Application the router was mounted on.
 *
 * Reads the router from {@link RouterToken} and the `port` / `hostname` from
 * the `http` configuration namespace, then calls `router.listen()` and returns
 * its handle unchanged. `overrides` win over the configuration, and anything
 * the configuration does not set falls through to `listen()`'s own defaults.
 *
 * @param app - A booted Application carrying {@link httpProvider}
 * @param overrides - `ListenOptions` that win over the `http` config namespace
 * @returns The same server handle `router.listen()` returns
 * @throws `MissingBindingError` if `httpProvider()` was never registered
 *
 * @example
 * ```ts
 * import { serve } from "@bunary/http/provider";
 *
 * const server = serve(app);              // port/hostname from config.http
 * const test = serve(app, { port: 0 });   // ephemeral port for a test
 * test.stop();
 * ```
 */
export function serve(app: Application, overrides?: ListenOptions): BunaryServer {
	const router = app.get(RouterToken);
	const config = app.config.get<HttpConfig>("http") ?? {};

	return router.listen({
		...(config.port !== undefined && { port: config.port }),
		...(config.hostname !== undefined && { hostname: config.hostname }),
		...overrides,
	});
}
