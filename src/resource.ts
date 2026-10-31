/**
 * API Resources and Accept-header content negotiation (#37).
 *
 * A handler returns a {@link Resource}; the router picks the response format
 * from the request's `Accept` header among the formats the resource opted
 * into, and answers 406 when none is acceptable.
 */

/** Media type served by {@link Resource.toJSON}, always available. */
export const JSON_MEDIA_TYPE = "application/json";

/** Converts a resource into the body for one media type. */
export type ResourceConverter = () => unknown;

/**
 * Base class for API resources: one object, several representations.
 *
 * Subclasses implement `toJSON()` (served as `application/json`, always
 * supported) and may opt into more formats through `formats`, a map of media
 * type to converter. Only formats listed there are ever served.
 *
 * A converter's result is sent as-is when it is a string, `Blob`,
 * `ArrayBuffer`, typed array or stream, and JSON-encoded otherwise.
 *
 * @example
 * ```ts
 * import { Resource } from "@bunary/http";
 *
 * class UserResource extends Resource {
 *   constructor(private readonly user: User) {
 *     super();
 *   }
 *
 *   override formats = {
 *     "application/ld+json": () => this.toJsonLd(),
 *   };
 *
 *   toJSON() {
 *     return { id: this.user.id, name: this.user.name };
 *   }
 *
 *   toJsonLd() {
 *     return { "@context": "https://schema.org", "@type": "Person", name: this.user.name };
 *   }
 * }
 *
 * router.get("/users/:id", (ctx) => new UserResource(findUser(ctx.params.id)));
 * ```
 */
export abstract class Resource {
	/**
	 * Additional formats, keyed by media type (e.g. `"application/ld+json"`).
	 * An `application/json` entry is ignored: JSON always comes from `toJSON()`.
	 */
	declare formats: Readonly<Record<string, ResourceConverter>>;

	/** Response status for a successful negotiation. Defaults to 200. */
	declare status?: number;

	/** Extra response headers. A `Vary` here is kept; `Accept` is appended. */
	declare headers?: ResponseInit["headers"];

	// Fields are `declare`d and defaulted here rather than with initializers:
	// Bun 1.4.2 reports a class's synthesized field initializer as an
	// uncovered function, which sinks this file under the coverage threshold.
	constructor() {
		this.formats = {};
	}

	/** The `application/json` representation. Also used by `JSON.stringify`. */
	abstract toJSON(): unknown;
}

/**
 * Every media type a resource can be served as, `application/json` first,
 * then its `formats` in declaration order.
 */
export function availableMediaTypes(resource: Resource): Map<string, ResourceConverter> {
	const available = new Map<string, ResourceConverter>([
		[JSON_MEDIA_TYPE, () => resource.toJSON()],
	]);
	for (const [type, convert] of Object.entries(resource.formats ?? {})) {
		const key = type.trim().toLowerCase();
		if (!available.has(key)) available.set(key, convert);
	}
	return available;
}

interface MediaRange {
	type: string;
	subtype: string;
	q: number;
	index: number;
}

/** Parse an `Accept` header into media ranges, dropping malformed entries. */
function parseAccept(header: string): MediaRange[] {
	const ranges: MediaRange[] = [];
	header.split(",").forEach((part, index) => {
		const [range = "", ...params] = part.split(";");
		const [type, subtype] = range.trim().toLowerCase().split("/");
		if (!type || !subtype) return;
		let q = 1;
		for (const param of params) {
			const [name, value] = param.split("=").map((s) => s.trim());
			if (name?.toLowerCase() === "q") {
				q = Number(value);
			}
		}
		if (!Number.isFinite(q) || q < 0 || q > 1) return;
		ranges.push({ type, subtype, q, index });
	});
	return ranges;
}

/** How specifically a range matches a media type: 3 exact, 2 `type/*`, 1 `*\/*`, 0 none. */
function specificity(range: MediaRange, type: string, subtype: string): number {
	if (range.type === type && range.subtype === subtype) return 3;
	if (range.type === type && range.subtype === "*") return 2;
	if (range.type === "*" && range.subtype === "*") return 1;
	return 0;
}

/**
 * Pick the media type to serve, per RFC 9110 §12.5.1.
 *
 * Each candidate takes the q-value of the most specific range matching it.
 * The highest q wins; ties go to the range listed first in `Accept`, then to
 * the candidate's own order. A missing or empty `Accept` accepts anything.
 *
 * @param accept - The request's `Accept` header, if any
 * @param candidates - Media types in server preference order
 * @returns The chosen media type, or `undefined` when none is acceptable
 */
export function negotiateMediaType(
	accept: string | null | undefined,
	candidates: readonly string[],
): string | undefined {
	const ranges = accept ? parseAccept(accept) : [];
	if (ranges.length === 0) return candidates[0];

	let best: { type: string; q: number; index: number } | undefined;
	for (const candidate of candidates) {
		const [type = "", subtype = ""] = candidate.split("/");
		let match: MediaRange | undefined;
		let matchSpecificity = 0;
		for (const range of ranges) {
			const s = specificity(range, type, subtype);
			if (s > matchSpecificity) {
				match = range;
				matchSpecificity = s;
			}
		}
		if (!match || match.q === 0) continue;
		if (!best || match.q > best.q || (match.q === best.q && match.index < best.index)) {
			best = { type: candidate, q: match.q, index: match.index };
		}
	}
	return best?.type;
}
