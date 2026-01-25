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

	// Escape special regex chars except : which we use for params
	let regexString = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

	// Allow optional trailing slash at the end
	regexString += "/?";

	return {
		pattern: new RegExp(`^${regexString}$`),
		paramNames,
		optionalParams,
	};
}

/**
 * Extract path parameters from a matched route.
 * Handles optional parameters by only including them if they have values.
 *
 * @param path - The request path
 * @param route - The matched route
 * @returns Record of parameter names to values (undefined for missing optional params)
 */
export function extractParams(path: string, route: Route): Record<string, string | undefined> {
	const match = path.match(route.pattern);
	if (!match) return {};

	const params: Record<string, string | undefined> = {};
	for (let i = 0; i < route.paramNames.length; i++) {
		const value = match[i + 1];
		// Only set value if it exists (for optional params)
		if (value !== undefined && value !== "") {
			params[route.paramNames[i]] = value;
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
