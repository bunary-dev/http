/**
 * Expand a set of registered HTTP methods with the methods the router serves
 * automatically.
 *
 * `OPTIONS` is always answered by the router, and `HEAD` is answered from the
 * matching `GET` route, so both belong in `Allow` even though neither is
 * registered explicitly (RFC 9110 §10.2.1).
 *
 * @param methods - Methods registered at the path
 * @returns The advertised methods, sorted
 *
 * @example
 * ```ts
 * expandAllowedMethods(["GET", "POST"]); // ["GET", "HEAD", "OPTIONS", "POST"]
 * expandAllowedMethods(["POST"]);        // ["OPTIONS", "POST"]
 * ```
 */
export function expandAllowedMethods(methods: string[]): string[] {
	const advertised = new Set(methods);
	if (advertised.has("GET")) {
		advertised.add("HEAD");
	}
	advertised.add("OPTIONS");
	return Array.from(advertised).sort();
}
