import { checkConstraints, extractParams } from "../router.js";
import type { Route } from "../types/index.js";

/** Matches a route segment that is an optional parameter (`:id?`). */
const OPTIONAL_SEGMENT = /^:[a-zA-Z_][a-zA-Z0-9_]*\?/;

/** {@link TrieNode.reach} bit meaning "a request of any length may match below" */
const ANY_DEPTH = 1 << 31;

/** Upper bound on cached merges per bucket, so the merge cache stays small. */
const MERGES_PER_BUCKET = 16;

/** Routes stored at one trie node, in registration order. */
interface Bucket {
	routes: Route[];
	/** Registration index of each entry in `routes` */
	order: number[];
	/**
	 * Cached merges of this bucket (reached first) with the other buckets a
	 * lookup reached after it, in reach order
	 */
	merges: Array<{ with: Bucket[]; routes: Route[] }>;
}

/** A node of the {@link RouteIndex} trie. */
interface TrieNode {
	/** The literal segment leading here from its parent (`""` for the root and parameter nodes) */
	segment: string;
	/** Next literal sibling whose segment has the same {@link hashSegment} hash */
	collision: TrieNode | null;
	/** Routes whose whole path ends here: they only match a request ending here */
	exact: Bucket;
	/**
	 * Routes indexed up to here that continue with an optional parameter or
	 * wildcard: they may match any request whose walk reaches this node
	 */
	open: Bucket;
	/**
	 * Literal children by segment hash (chained through `collision`). Keyed by
	 * a hash computed while scanning the request path, so a lookup never
	 * allocates a substring.
	 */
	static: Map<number, TrieNode> | null;
	/** Child for a required parameter segment (`:id`, `:name.json`) */
	dynamic: TrieNode | null;
	/**
	 * Bit `k` is set when an exact route at or below this node is `k`
	 * segments deeper than it; {@link ANY_DEPTH} when an open route (or a
	 * route 30 or more segments deeper) is. Lets a lookup skip subtrees
	 * that cannot match the request's segment count.
	 */
	reach: number;
}

function createBucket(): Bucket {
	return { routes: [], order: [], merges: [] };
}

function createNode(segment: string): TrieNode {
	return {
		segment,
		collision: null,
		exact: createBucket(),
		open: createBucket(),
		static: null,
		dynamic: null,
		reach: 0,
	};
}

/** Hash step shared by {@link hashSegment} and the request scan in {@link scanSegments}. */
function hashStep(hash: number, charCode: number): number {
	return (Math.imul(hash, 31) + charCode) | 0;
}

/** Hash of a literal route segment, as {@link scanSegments} computes it for a request. */
function hashSegment(segment: string): number {
	let hash = 0;
	for (let i = 0; i < segment.length; i++) hash = hashStep(hash, segment.charCodeAt(i));
	return hash;
}

/** Scratch: hash of each request segment, filled by {@link scanSegments} */
let segmentHashes = new Int32Array(32);
/** Scratch: offset just past each request segment, filled by {@link scanSegments} */
let segmentEnds = new Int32Array(32);

/**
 * Scan a request path starting with `/` once, recording each segment's hash
 * and end offset. Returns the number of segments (`"/"` has one, empty).
 */
function scanSegments(path: string): number {
	let count = 0;
	let hash = 0;
	for (let i = 1; i <= path.length; i++) {
		const code = i === path.length ? 47 : path.charCodeAt(i);
		if (code !== 47 /* "/" */) {
			hash = hashStep(hash, code);
			continue;
		}
		if (count === segmentHashes.length) {
			const hashes = new Int32Array(count * 2);
			const ends = new Int32Array(count * 2);
			hashes.set(segmentHashes);
			ends.set(segmentEnds);
			segmentHashes = hashes;
			segmentEnds = ends;
		}
		segmentHashes[count] = hash;
		segmentEnds[count] = i;
		count++;
		hash = 0;
	}
	return count;
}

/** Whether `path.slice(start, end)` equals `segment`, without allocating the slice. */
function sameSegment(segment: string, path: string, start: number, end: number): boolean {
	if (segment.length !== end - start) return false;
	for (let i = 0; i < segment.length; i++) {
		if (segment.charCodeAt(i) !== path.charCodeAt(start + i)) return false;
	}
	return true;
}

/** Whether a subtree with `reach` can match a request with `remaining` segments left. */
function canReach(reach: number, remaining: number, trailing: boolean): boolean {
	if (reach & ANY_DEPTH) return true;
	if (remaining > 30) return false;
	// An exact route also matches with a single trailing slash left
	const want = (1 << remaining) | (trailing && remaining > 0 ? 1 << (remaining - 1) : 0);
	return (reach & want) !== 0;
}

/**
 * Scratch list of reached buckets, reused by every lookup (lookups are
 * synchronous); only the first {@link reachedCount} entries are current
 */
const reached: Bucket[] = [];
let reachedCount = 0;

/** Push the buckets of `node` that can match a request whose walk reached it. */
function visit(node: TrieNode, last: boolean): void {
	if (node.open.routes.length > 0) reached[reachedCount++] = node.open;
	// A route's whole path ends here: the request must end here too, or with
	// only the optional trailing slash left
	if (last && node.exact.routes.length > 0) reached[reachedCount++] = node.exact;
}

/**
 * Walk request segments `i..count - 1` (as recorded by {@link scanSegments})
 * below `node`, pushing every bucket that can match onto {@link reached}.
 * `trailing` is whether the last segment is empty (the path ends with `/`).
 */
function collect(node: TrieNode, path: string, i: number, count: number, trailing: boolean): void {
	// Follow the literal child in a loop; only parameter branches recurse
	for (;;) {
		const start = i === 0 ? 1 : (segmentEnds[i - 1] as number) + 1;
		const end = segmentEnds[i] as number;
		const remaining = count - 1 - i;
		const last = remaining === 0 || (remaining === 1 && trailing);

		// A required parameter matches exactly one non-empty segment
		const dynamic = node.dynamic;
		if (dynamic !== null && end > start && canReach(dynamic.reach, remaining, trailing)) {
			visit(dynamic, last);
			if (remaining > 0) collect(dynamic, path, i + 1, count, trailing);
		}

		let child: TrieNode | null | undefined = node.static?.get(segmentHashes[i] as number);
		while (child && !sameSegment(child.segment, path, start, end)) {
			child = child.collision;
		}
		if (!child || !canReach(child.reach, remaining, trailing)) return;
		visit(child, last);
		if (remaining === 0) return;
		node = child;
		i++;
	}
}

/** Merge two route lists into one in registration order. */
function merge(a: Bucket, b: Bucket): Bucket {
	const routes: Route[] = [];
	const order: number[] = [];
	let i = 0;
	let j = 0;
	while (i < a.order.length && j < b.order.length) {
		if ((a.order[i] as number) < (b.order[j] as number)) {
			routes.push(a.routes[i] as Route);
			order.push(a.order[i++] as number);
		} else {
			routes.push(b.routes[j] as Route);
			order.push(b.order[j++] as number);
		}
	}
	for (; i < a.order.length; i++) {
		routes.push(a.routes[i] as Route);
		order.push(a.order[i] as number);
	}
	for (; j < b.order.length; j++) {
		routes.push(b.routes[j] as Route);
		order.push(b.order[j] as number);
	}
	return { routes, order, merges: [] };
}

/** Whether `others` holds exactly the buckets after the first in {@link reached}. */
function sameRest(others: Bucket[]): boolean {
	if (others.length !== reachedCount - 1) return false;
	for (let n = 0; n < others.length; n++) {
		if (others[n] !== reached[n + 1]) return false;
	}
	return true;
}

/**
 * Route table indexed by a segment trie built at registration time (#12, #166).
 *
 * Each node has one child per literal path segment and one dynamic child for
 * a required parameter (`:id`) at that position. A route is walked down the
 * trie through its literal and required-parameter segments and stored, with
 * its registration index, at the node where that walk stops: the end of the
 * path, or just before the first optional parameter (`:id?`) or wildcard
 * (`*`, `**`), which can match a varying number of segments (everything from
 * there on is left to the regex). If an optional parameter in that run has
 * text after it in its segment (`/posts/:id?.json`), the route is stored one
 * node higher, since leaving the parameters out joins that text onto the
 * previous segment (`/posts.json`). A path without a leading slash is stored
 * at the root. Group prefixes and `basePath` are already part of `route.path`.
 *
 * A request path is scanned once, then walked segment by segment, following
 * both the literal child and, for a non-empty segment, the dynamic child,
 * skipping subtrees whose routes cannot have the request's segment count. The
 * candidates are the routes stored at every node reached (a route whose whole
 * path was indexed only where the request ends), merged in registration
 * order. Callers test them with the compiled regex and constraint checks, so
 * first match still wins across branches (an earlier `/api/:x` still beats a
 * later `/api/users`). The trie only narrows the candidates: every route it
 * skips could never have matched the path.
 *
 * The trie is updated incrementally by {@link RouteIndex.add}; lookups never
 * rebuild it. Merged candidate lists are cached per combination of reached
 * nodes (bounded, and cleared on every `add`).
 */
export class RouteIndex {
	/** All routes in registration order */
	readonly routes: Route[] = [];
	private readonly root: TrieNode = createNode("");
	/** Buckets holding cached merges, cleared on every `add` */
	private readonly merging: Bucket[] = [];

	/** Register a route at the node where its indexable prefix ends. */
	add(route: Route): void {
		const order = this.routes.length;
		this.routes.push(route);
		for (const bucket of this.merging) bucket.merges.length = 0;
		this.merging.length = 0;

		// A path without a leading slash is only matched by its regex
		const bucket =
			route.path.charCodeAt(0) === 47 /* "/" */ ? this.walk(route.path) : this.root.open;
		bucket.routes.push(route);
		bucket.order.push(order);
	}

	/**
	 * Bucket a route path starting with `/` belongs in, creating nodes as
	 * needed and recording the route's depth in each ancestor's `reach`.
	 */
	private walk(path: string): Bucket {
		const nodes = [this.root];
		let node = this.root;
		let bucket: Bucket | null = null;
		const segments = path.slice(1).split("/");
		for (const [i, segment] of segments.entries()) {
			if (segment.includes("*")) {
				bucket = node.open;
				break;
			}
			if (OPTIONAL_SEGMENT.test(segment)) {
				// The slash sits inside the optional group, so when this and any
				// following optional parameters are left out, text after one of
				// them joins the previous segment (`/posts/:id?.json` matches
				// `/posts.json`): then index up to the node before that segment
				if (hasOptionalSuffix(segments, i) && nodes.length > 1) {
					nodes.pop();
					node = nodes[nodes.length - 1] as TrieNode;
				}
				bucket = node.open;
				break;
			}
			if (segment.charCodeAt(0) === 58 /* ":" */) {
				node.dynamic ??= createNode("");
				node = node.dynamic;
			} else {
				node = staticChild(node, segment);
			}
			nodes.push(node);
		}
		const depth = nodes.length - 1;
		for (const [i, ancestor] of nodes.entries()) {
			const below = depth - i;
			ancestor.reach |= bucket || below >= 30 ? ANY_DEPTH : 1 << below;
		}
		return bucket ?? node.exact;
	}

	/** Routes that could match `path`, in registration order. */
	candidates(path: string): Route[] {
		reachedCount = 0;
		if (this.root.open.routes.length > 0) reached[reachedCount++] = this.root.open;
		if (path.charCodeAt(0) === 47 /* "/" */) {
			const count = scanSegments(path);
			collect(this.root, path, 0, count, path.charCodeAt(path.length - 1) === 47);
		}
		if (reachedCount === 1) return (reached[0] as Bucket).routes;
		return reachedCount === 0 ? [] : this.merged();
	}

	/** Merge {@link reached} in registration order, through the merge cache. */
	private merged(): Route[] {
		const first = reached[0] as Bucket;
		for (const entry of first.merges) {
			if (sameRest(entry.with)) return entry.routes;
		}
		let merged = first;
		for (let n = 1; n < reachedCount; n++) merged = merge(merged, reached[n] as Bucket);
		if (first.merges.length < MERGES_PER_BUCKET) {
			if (first.merges.length === 0) this.merging.push(first);
			first.merges.push({ with: reached.slice(1, reachedCount), routes: merged.routes });
		}
		return merged.routes;
	}
}

/**
 * Whether the run of optional-parameter segments starting at `segments[i]`
 * has one with text after `:name?` (`:id?.json`). With every optional
 * parameter up to it left out, that text joins the segment before the run.
 */
function hasOptionalSuffix(segments: string[], i: number): boolean {
	for (let j = i; j < segments.length; j++) {
		const optional = OPTIONAL_SEGMENT.exec(segments[j] as string);
		if (!optional) return false;
		if (optional[0].length < (segments[j] as string).length) return true;
	}
	return false;
}

/** The literal child of `node` for `segment`, created if missing. */
function staticChild(node: TrieNode, segment: string): TrieNode {
	node.static ??= new Map();
	const hash = hashSegment(segment);
	const head = node.static.get(hash);
	for (let child: TrieNode | null | undefined = head; child; child = child.collision) {
		if (child.segment === segment) return child;
	}
	const child = createNode(segment);
	child.collision = head ?? null;
	node.static.set(hash, child);
	return child;
}

/**
 * Routes to search: a {@link RouteIndex} (what the router uses) or a plain
 * array, which is scanned in full, in order.
 */
export type RouteTable = RouteIndex | Route[];

function candidatesFor(routes: RouteTable, path: string): Route[] {
	return routes instanceof RouteIndex ? routes.candidates(path) : routes;
}

export interface RouteMatch {
	route: Route;
	params: Record<string, string | undefined>;
}

/**
 * Result of a single-pass route resolution.
 *
 * Combines route matching, HEAD→GET fallback, and allowed-method
 * collection into one scan of the route table.
 */
export interface RouteResolution {
	/** The matched route and extracted params, or null if no match */
	match: RouteMatch | null;
	/** Methods that match this path (populated when match is null and path exists for other methods) */
	allowedMethods: string[];
}

/**
 * Resolve a route in a single pass through the route table.
 *
 * For HEAD requests this also checks for a GET fallback.
 * When no exact match is found it collects all methods whose path
 * pattern matches (with constraints), enabling 405 responses and
 * OPTIONS Allow headers without a second scan.
 *
 * **Complexity**: one pass over the candidates for this path. With a
 * {@link RouteIndex} those are the routes stored at the trie nodes the path
 * reaches, not every registered route.
 */
export function resolveRoute(routes: RouteTable, method: string, path: string): RouteResolution {
	let getFallback: RouteMatch | null = null;
	const allowedMethods = new Set<string>();

	for (const route of candidatesFor(routes, path)) {
		if (!route.pattern.test(path)) continue;

		const params = extractParams(path, route);
		if (!checkConstraints(params, route.constraints)) continue;

		// Path matches with valid constraints — record the method
		allowedMethods.add(route.method);

		if (route.method === method) {
			// Exact method match — return immediately
			return { match: { route, params }, allowedMethods: [] };
		}

		// For HEAD requests, remember the first GET fallback
		if (method === "HEAD" && route.method === "GET" && !getFallback) {
			getFallback = { route, params };
		}
	}

	// HEAD with GET fallback — finish the scan first to populate allowedMethods
	if (getFallback) {
		return { match: getFallback, allowedMethods: [] };
	}

	return {
		match: null,
		allowedMethods: Array.from(allowedMethods).sort(),
	};
}

/**
 * Find a matching route for the given method and path.
 *
 * **Complexity**: given a {@link RouteIndex}, only the routes stored at the
 * trie nodes the request path reaches (following literal segments and
 * parameter branches) are tested. A plain array is scanned in full.
 *
 * Route order matters: candidates are tested in registration order and the
 * first matching route wins, allowing intentional route shadowing — even
 * across trie branches (an earlier `/:slug` still beats a later `/about`).
 */
export function findRoute(routes: RouteTable, method: string, path: string): RouteMatch | null {
	for (const route of candidatesFor(routes, path)) {
		if (route.pattern.test(path)) {
			if (route.method === method) {
				const params = extractParams(path, route);
				// Check constraints
				if (!checkConstraints(params, route.constraints)) {
					continue;
				}
				return { route, params };
			}
		}
	}
	return null;
}

/**
 * Check if any route matches the path (regardless of method).
 */
export function hasMatchingPath(routes: RouteTable, path: string): boolean {
	return candidatesFor(routes, path).some((route) => {
		if (!route.pattern.test(path)) return false;
		const params = extractParams(path, route);
		return checkConstraints(params, route.constraints);
	});
}

/**
 * Find the first route whose path matches, regardless of HTTP method.
 *
 * Used by the OPTIONS/CORS preflight handler to locate group middleware
 * attached to a route at this path.
 */
export function findRouteByPath(routes: RouteTable, path: string): RouteMatch | null {
	for (const route of candidatesFor(routes, path)) {
		if (!route.pattern.test(path)) continue;
		const params = extractParams(path, route);
		if (!checkConstraints(params, route.constraints)) continue;
		return { route, params };
	}
	return null;
}

/**
 * Get all allowed HTTP methods for a given path.
 * Respects route constraints when determining matches.
 *
 * @param routes - All registered routes (indexed or a plain array)
 * @param path - Path to check
 * @returns Array of allowed HTTP methods
 */
export function getAllowedMethods(routes: RouteTable, path: string): string[] {
	const methods = new Set<string>();
	for (const route of candidatesFor(routes, path)) {
		if (route.pattern.test(path)) {
			const params = extractParams(path, route);
			// Only include method if constraints pass
			if (checkConstraints(params, route.constraints)) {
				methods.add(route.method);
			}
		}
	}
	return Array.from(methods).sort();
}
