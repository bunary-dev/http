/**
 * Route matching benchmark: linear scan (pre-#12) vs first-segment index
 * (#12) vs segment trie (#166).
 *
 * Run with `bun bench/routes.ts` (`BENCH_RUNS=n` sets the processes per cell,
 * default 5; the median is reported). Not part of `bun test`.
 *
 * Shapes, each at 10 / 100 / 500 routes:
 * - (a) distinct first segments: N routes over N/10 prefixes `/g0`, `/g1`, …
 * - (b) one shared prefix: every route under `/api/...`
 * - (c) nested shared prefixes: `/api/v1/<resource>/...`
 * - (d) a mix of (a) and (b) with some param-first routes (`/:tenant/...`)
 *
 * Each cell runs in its own process, so the variants do not share JIT state
 * (in one process, `resolveRoute` turns polymorphic and later variants look
 * slower). Every shape also registers a parameter catch-all last. The request mix hits
 * an early route, a late route, a parameter route, a 405 and a 404.
 */
import { compilePath } from "../src/router.js";
import { RouteIndex, type RouteTable, resolveRoute } from "../src/routes/find.js";
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

/**
 * The #12 first-static-segment index, as shipped before #166, kept here for
 * comparison. It subclasses RouteIndex so `resolveRoute` treats it exactly
 * like the trie; only `add` and `candidates` differ.
 */
class FirstSegmentIndex extends RouteIndex {
	private readonly fallback: Route[] = [];
	private readonly buckets = new Map<string, Route[]>();

	private static segment(path: string): string | null {
		if (path.charCodeAt(0) !== 47) return null;
		const end = path.indexOf("/", 1);
		return end === -1 ? path.slice(1) : path.slice(1, end);
	}

	override add(route: Route): void {
		this.routes.push(route);
		const segment = FirstSegmentIndex.segment(route.path);
		if (segment === null || segment.startsWith(":") || segment === "*" || segment === "**") {
			this.fallback.push(route);
			for (const bucket of this.buckets.values()) bucket.push(route);
			return;
		}
		let bucket = this.buckets.get(segment);
		if (!bucket) {
			bucket = [...this.fallback];
			this.buckets.set(segment, bucket);
		}
		bucket.push(route);
	}

	override candidates(path: string): Route[] {
		const key = FirstSegmentIndex.segment(path);
		return (key === null ? undefined : this.buckets.get(key)) ?? this.fallback;
	}
}

/** Fill `count - 1` routes from `pathFor(i)`, then the catch-all. */
function fill(count: number, pathFor: (i: number) => string): Route[] {
	const routes: Route[] = [];
	for (let i = 0; routes.length < count - 1; i++) {
		const path = pathFor(i);
		routes.push(makeRoute("GET", i % 2 === 0 ? path : `${path}/:id`));
	}
	routes.push(makeRoute("POST", "/:resource/:id/:action"));
	return routes;
}

const shapes: Record<string, (count: number) => Route[]> = {
	"(a) distinct first segments": (count) => {
		const groups = Math.max(1, Math.floor(count / 10));
		return fill(count, (i) => `/g${i % groups}/r${i}`);
	},
	"(b) one shared prefix /api": (count) => fill(count, (i) => `/api/r${i}`),
	"(c) nested /api/v1/<resource>": (count) => {
		const resources = Math.max(1, Math.floor(count / 10));
		return fill(count, (i) => `/api/v1/res${i % resources}/r${i}`);
	},
	"(d) mix with param-first routes": (count) => {
		const groups = Math.max(1, Math.floor(count / 20));
		return fill(count, (i) => {
			if (i % 5 === 0) return `/:tenant/t${i}`;
			return i % 2 === 0 ? `/api/r${i}` : `/g${i % groups}/r${i}`;
		});
	},
};

function requestsFor(routes: Route[]): Array<[string, string]> {
	const last = routes[routes.length - 2] as Route;
	const lastPath = last.path.replace(":tenant", "acme").replace(":id", "42");
	const firstParam = routes.find((route) => route.path.endsWith("/:id")) as Route;
	return [
		["GET", (routes[0] as Route).path.replace(":tenant", "acme")],
		["GET", lastPath],
		["GET", firstParam.path.replace(":tenant", "acme").replace(":id", "7")],
		["DELETE", lastPath],
		["GET", "/api/missing/path"],
	];
}
/** Run `fn` for `ms` milliseconds; returns the number of calls. */
function runFor(fn: () => void, ms: number): number {
	let ops = 0;
	const start = performance.now();
	while (performance.now() - start < ms) {
		for (let i = 0; i < 200; i++) fn();
		ops += 200;
	}
	return ops;
}

function opsPerSec(fn: () => void, durationMs = 700): number {
	// Warm up long enough for every variant to reach the optimising JIT tier
	runFor(fn, 300);
	const start = performance.now();
	const ops = runFor(fn, durationMs);
	return (ops / (performance.now() - start)) * 1000;
}

type Variant = "linear" | "first-seg" | "trie";

function tableFor(variant: Variant, routes: Route[]): RouteTable {
	// A plain array is the pre-#12 linear scan over every route
	if (variant === "linear") return routes;
	const table = variant === "trie" ? new RouteIndex() : new FirstSegmentIndex();
	for (const route of routes) table.add(route);
	return table;
}

/** Measure one cell. Runs in its own process so the variants don't share JIT state. */
function runCell(shape: string, count: number, variant: Variant): number {
	const routes = (shapes[shape] as (count: number) => Route[])(count);
	const table = tableFor(variant, routes);
	const requests = requestsFor(routes);
	return opsPerSec(() => {
		for (const [method, path] of requests) resolveRoute(table, method, path);
	});
}

const counts = [10, 100, 500];
const variants: Variant[] = ["linear", "first-seg", "trie"];

if (Bun.argv[2] === "--cell") {
	const [, , , shape, count, variant] = Bun.argv;
	console.log(runCell(shape as string, Number(count), variant as Variant));
} else {
	// Sanity check: all three must resolve identically
	for (const [shape, build] of Object.entries(shapes)) {
		for (const count of counts) {
			const routes = build(count);
			const [linear, firstSegment, trie] = variants.map((variant) => tableFor(variant, routes));
			for (const [method, path] of requestsFor(routes)) {
				const a = resolveRoute(linear as RouteTable, method, path);
				for (const table of [firstSegment, trie]) {
					const b = resolveRoute(table as RouteTable, method, path);
					if (
						b.match?.route !== a.match?.route ||
						b.allowedMethods.join() !== a.allowedMethods.join()
					) {
						throw new Error(`Mismatch for ${shape} ${count}: ${method} ${path}`);
					}
				}
			}
		}
	}

	const format = (n: number) => Math.round(n).toLocaleString("en-US").padStart(11);
	const runs = Number(Bun.env.BENCH_RUNS ?? 5);
	const measure = (shape: string, count: number, variant: Variant) =>
		Number(
			Bun.spawnSync([process.execPath, import.meta.path, "--cell", shape, String(count), variant])
				.stdout.toString()
				.trim(),
		);
	const median = (values: number[]) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)] as number;
	};

	console.log(
		`Bun ${Bun.version} — resolveRoute() ops/sec over a 5-request mix, median of ${runs} processes per cell`,
	);
	for (const shape of Object.keys(shapes)) {
		console.log(`\n${shape}`);
		console.log("routes |      linear |  first-seg. |        trie | trie vs first-seg.");
		console.log("-------|-------------|-------------|-------------|-------------------");
		for (const count of counts) {
			// Interleave the variants' runs so system noise hits them evenly
			const samples: number[][] = variants.map(() => []);
			for (let run = 0; run < runs; run++) {
				for (const [v, variant] of variants.entries()) {
					samples[v]?.push(measure(shape, count, variant));
				}
			}
			const [linear, indexed, trie] = samples.map(median) as [number, number, number];
			console.log(
				`${String(count).padStart(6)} | ${format(linear)} | ${format(indexed)} | ${format(trie)} | ${(trie / indexed).toFixed(2)}x`,
			);
		}
	}
}
