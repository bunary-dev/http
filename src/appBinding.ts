import type { Application } from "@bunary/core";

/**
 * Router → `Application` bindings.
 *
 * Kept in a module-level `WeakMap` rather than on the router object so the
 * public `Router` interface stays free of a `@bunary/core` type at runtime and
 * a standalone router never reaches for the optional peer. The map holds weak
 * keys, so a discarded router is still collectable.
 *
 * @internal
 */
const bindings = new WeakMap<object, Application>();

/**
 * Bind a core `Application` to a router, so every request context built by
 * that router carries it as `ctx.app`.
 *
 * Called by `createRouter({ app })` and by `httpProvider()` during `register`.
 *
 * @internal
 */
export function bindApp(router: object, app: Application): void {
	bindings.set(router, app);
}

/**
 * Read the `Application` bound to a router, or `undefined` for a standalone
 * router that was never mounted on one.
 *
 * @internal
 */
export function getBoundApp(router: object): Application | undefined {
	return bindings.get(router);
}
