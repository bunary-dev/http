/**
 * Route matching benchmark: linear scan (pre-#12) vs first-segment index.
 *
 * Run with `bun bench/routes.ts`. Not part of `bun test`.
 *
 * Each app registers N routes spread over N/10 group prefixes, plus a
 * parameter catch-all registered last (it lands in every index bucket). The
 * request mix hits an early route, a late route, a parameter route, a 405
 * and a 404.
 */
import { compilePath } from "../src/router.js";
import { RouteIndex, resolveRoute } from "../src/routes/find.js";
import type { HttpMethod, Route } from "../src/types/index.js";

function makeRoute(method: HttpMethod, path: string): Route {
	const { pattern, paramNames, optionalParams, isWildcard } = compilePath(path);
	return {
		method,
		path,
		pattern,
		paramNames,
		optionalParams: optionalParams.length > 0 ? optionalParams : undefined,
		isWildcard: isWildcard || undefined,
		handler: () => ({}),
	};
}

function buildRoutes(count: number): Route[] {
	const groups = Math.max(1, Math.floor(count / 10));
	const routes: Route[] = [];
	for (let i = 0; routes.length < count - 1; i++) {
		const group = `/g${i % groups}`;
		routes.push(
			i % 2 === 0 ? makeRoute("GET", `${group}/r${i}`) : makeRoute("GET", `${group}/r${i}/:id`),
		);
	}
	routes.push(makeRoute("POST", "/:resource/:id/:action"));
	return routes;
}

function requestsFor(routes: Route[]): Array<[string, string]> {
	const last = routes[routes.length - 2] as Route;
	const lastPath = last.path.replace(":id", "42");
	return [
		["GET", (routes[0] as Route).path],
		["GET", lastPath],
		["GET", (routes[1] as Route).path.replace(":id", "7")],
		["DELETE", lastPath],
		["GET", "/missing/path"],
	];
}

function opsPerSec(fn: () => void, durationMs = 500): number {
	for (let i = 0; i < 2_000; i++) fn(); // warm up
	let ops = 0;
	const start = performance.now();
	let elapsed = 0;
	while (elapsed < durationMs) {
		for (let i = 0; i < 200; i++) fn();
		ops += 200;
		elapsed = performance.now() - start;
	}
	return (ops / elapsed) * 1000;
}

const format = (n: number) => Math.round(n).toLocaleString("en-US").padStart(12);

console.log(`Bun ${Bun.version} — resolveRoute() ops/sec over a 5-request mix`);
console.log("routes |   linear (old) |  indexed (new) | speedup");
console.log("-------|----------------|----------------|--------");

for (const count of [10, 100, 500]) {
	const routes = buildRoutes(count);
	const index = new RouteIndex();
	for (const route of routes) index.add(route);
	const requests = requestsFor(routes);

	// Sanity check: both must resolve identically
	for (const [method, path] of requests) {
		const a = resolveRoute(routes, method, path);
		const b = resolveRoute(index, method, path);
		if (a.match?.route !== b.match?.route || a.allowedMethods.join() !== b.allowedMethods.join()) {
			throw new Error(`Mismatch for ${method} ${path}`);
		}
	}

	// A plain array is the pre-#12 linear scan over every route
	const linear = opsPerSec(() => {
		for (const [method, path] of requests) resolveRoute(routes, method, path);
	});
	const indexed = opsPerSec(() => {
		for (const [method, path] of requests) resolveRoute(index, method, path);
	});

	console.log(
		`${String(count).padStart(6)} | ${format(linear)}   | ${format(indexed)}   | ${(indexed / linear).toFixed(2)}x`,
	);
}
