/**
 * Path manipulation utilities for route handling.
 */

/**
 * Normalize a path prefix (ensure leading slash, no trailing slash).
 *
 * @param prefix - Path prefix to normalize
 * @returns Normalized prefix with leading slash and no trailing slash
 *
 * @example
 * ```ts
 * normalizePrefix("api")     // "/api"
 * normalizePrefix("/api/")   // "/api"
 * normalizePrefix("/")       // "/"
 * ```
 */
export function normalizePrefix(prefix: string): string {
	let normalized = prefix;
	if (!normalized.startsWith("/")) {
		normalized = `/${normalized}`;
	}
	if (normalized.endsWith("/") && normalized.length > 1) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

/**
 * Join path segments, handling slashes correctly.
 *
 * @param prefix - Path prefix
 * @param path - Path to append
 * @returns Combined path
 *
 * @example
 * ```ts
 * joinPaths("/api", "/users")  // "/api/users"
 * joinPaths("/api", "users")   // "/api/users"
 * joinPaths("/api/", "/users") // "/api/users"
 * joinPaths("/", "/")          // "/"
 * ```
 */
export function joinPaths(prefix: string, path: string): string {
	const normalizedPrefix = normalizePrefix(prefix);
	let normalizedPath = path;

	if (!normalizedPath.startsWith("/") && normalizedPath !== "") {
		normalizedPath = `/${normalizedPath}`;
	}

	// Handle edge case: path is just "/" - treat as empty (root)
	if (normalizedPath === "/") {
		return normalizedPrefix;
	}

	return normalizedPrefix + normalizedPath;
}
