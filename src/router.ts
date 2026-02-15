/**
 * Route matching utilities for compiling paths and extracting parameters.
 */
import type { Route } from "./types/index.js";

/**
 * Result of compiling a path pattern.
 */
export interface CompiledPath {
	/** Regex pattern for matching */
	pattern: RegExp;
	/** Parameter names in order */
	paramNames: string[];
	/** Names of optional parameters */
	optionalParams: string[];
	/** Whether this path ends with a wildcard catch-all */
	isWildcard: boolean;
}

/**
 * Compile a path pattern into a regex and extract parameter names.
 * Supports optional parameters with :param? syntax.
 *
 * @param path - Route path pattern (e.g., "/users/:id" or "/users/:id?")
 * @returns Object with regex pattern, parameter names, and optional param names
 *
 * @example
 * ```ts
 * const { pattern, paramNames, optionalParams } = compilePath("/users/:id?");
 * // pattern matches "/users" and "/users/123"
 * // paramNames = ["id"]
 * // optionalParams = ["id"]
 * ```
 */
export function compilePath(path: string): CompiledPath {
	const paramNames: string[] = [];
	const optionalParams: string[] = [];
	let isWildcard = false;
	let processedPath = path;

	// Detect and strip wildcard catch-all suffix (/* or /**)
	// Must appear at the very end of the path.
	if (processedPath.endsWith("/**")) {
		processedPath = processedPath.slice(0, -3);
		isWildcard = true;
	} else if (processedPath.endsWith("/*")) {
		processedPath = processedPath.slice(0, -2);
		isWildcard = true;
	}

	// Validate: * in the middle of a path is not supported
	if (processedPath.includes("*")) {
		throw new Error(
			`Wildcard "*" must appear at the end of the route pattern "${path}". Mid-path wildcards are not supported.`,
		);
	}

	// Escape special regex chars except : which we use for params
	let regexString = processedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Process all params in order of appearance, handling both required and optional
	regexString = regexString.replace(
		/\/:([a-zA-Z_][a-zA-Z0-9_]*)(\\\?)?/g,
		(_match, paramName, isOptional) => {
			// Check for duplicate parameter names
			if (paramNames.includes(paramName)) {
				throw new Error(
					`Duplicate parameter name ":${paramName}" in route pattern "${path}". Each parameter name must be unique within a route.`,
				);
			}

			paramNames.push(paramName);
			if (isOptional) {
				optionalParams.push(paramName);
				return "(?:/([^/]+))?";
			}
			return "/([^/]+)";
		},
	);

	if (isWildcard) {
		// Wildcard capture: matches "/" + anything, or nothing at all.
		// The captured value is the remaining path (without leading slash).
		regexString += "(?:/(.*))?";
		paramNames.push("*");
	} else {
		// Allow optional trailing slash at the end
		regexString += "/?";
	}

	return {
		pattern: new RegExp(`^${regexString}$`),
		paramNames,
		optionalParams,
		isWildcard,
	};
}

/**
 * Safely decode a URI component, returning the raw value if decoding fails.
 *
 * @param value - The possibly-encoded string
 * @returns The decoded string, or the original if decoding throws
 */
function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Extract path parameters from a matched route.
 * Handles optional parameters by only including them if they have values.
 * Applies `decodeURIComponent` to each captured value (standard behaviour).
 *
 * @param path - The request path
 * @param route - The matched route
 * @returns Record of parameter names to decoded values (undefined for missing optional params)
 */
export function extractParams(path: string, route: Route): Record<string, string | undefined> {
	const match = path.match(route.pattern);
	if (!match) return {};

	const params: Record<string, string | undefined> = {};
	for (let i = 0; i < route.paramNames.length; i++) {
		const value = match[i + 1];
		// Only set value if it exists (for optional params)
		if (value !== undefined && value !== "") {
			params[route.paramNames[i]] = safeDecodeURIComponent(value);
		}
	}
	return params;
}

/**
 * Check if route constraints are satisfied.
 *
 * @param params - Extracted route parameters
 * @param constraints - Parameter constraints (regex patterns)
 * @returns True if all constraints pass
 */
export function checkConstraints(
	params: Record<string, string | undefined>,
	constraints?: Record<string, RegExp>,
): boolean {
	if (!constraints) return true;

	for (const [param, pattern] of Object.entries(constraints)) {
		const value = params[param];
		// Skip constraint check for missing optional params
		if (value === undefined) continue;
		if (!pattern.test(value)) return false;
	}
	return true;
}
