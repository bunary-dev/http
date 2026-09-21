import type { Route, RouteBuilder, Router } from "../types/index.js";

/**
 * Safely compile a string pattern to RegExp with error handling.
 * Provides better error messages for invalid regex patterns.
 */
export function compilePattern(pattern: string, param: string): RegExp {
	try {
		return new RegExp(pattern);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid pattern";
		throw new Error(`Invalid regex pattern for parameter "${param}": ${message}`);
	}
}

/**
 * Create a RouteBuilder for a specific route.
 * Each builder captures its own route reference to avoid shared mutable state issues.
 */
export function createRouteBuilder(
	route: Route,
	namedRoutes: Map<string, Route>,
	router: Router,
): RouteBuilder {
	function addConstraint(param: string, pattern: RegExp): void {
		if (!route.constraints) {
			route.constraints = {};
		}
		route.constraints[param] = pattern;
	}

	const builder: RouteBuilder = {
		// Forward all Router methods
		get get() {
			return router.get;
		},
		get post() {
			return router.post;
		},
		get put() {
			return router.put;
		},
		get delete() {
			return router.delete;
		},
		get patch() {
			return router.patch;
		},
		get use() {
			return router.use;
		},
		get group() {
			return router.group;
		},
		get route() {
			return router.route;
		},
		get hasRoute() {
			return router.hasRoute;
		},
		get getRoutes() {
			return router.getRoutes;
		},
		get listen() {
			return router.listen;
		},
		get fetch() {
			return router.fetch;
		},

		// Route-specific methods that capture this specific route
		name: (name: string) => {
			if (namedRoutes.has(name)) {
				throw new Error(`Route name "${name}" is already defined`);
			}
			route.name = name;
			namedRoutes.set(name, route);
			return builder;
		},

		where: ((
			paramOrConstraints: string | Record<string, RegExp | string>,
			pattern?: RegExp | string,
		) => {
			if (typeof paramOrConstraints === "string") {
				// Single constraint: where("id", /^\d+$/)
				if (!pattern) {
					throw new Error(`Pattern is required for constraint on "${paramOrConstraints}"`);
				}
				const regex =
					typeof pattern === "string" ? compilePattern(pattern, paramOrConstraints) : pattern;
				addConstraint(paramOrConstraints, regex);
			} else {
				// Multiple constraints: where({ id: /^\d+$/, slug: /^[a-z-]+$/ })
				for (const [param, pat] of Object.entries(paramOrConstraints)) {
					const regex = typeof pat === "string" ? compilePattern(pat, param) : pat;
					addConstraint(param, regex);
				}
			}
			return builder;
		}) as RouteBuilder["where"],

		whereNumber: (param: string) => {
			addConstraint(param, /^\d+$/);
			return builder;
		},

		whereAlpha: (param: string) => {
			addConstraint(param, /^[a-zA-Z]+$/);
			return builder;
		},

		whereAlphaNumeric: (param: string) => {
			addConstraint(param, /^[a-zA-Z0-9]+$/);
			return builder;
		},

		whereUuid: (param: string) => {
			addConstraint(param, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
			return builder;
		},

		whereUlid: (param: string) => {
			addConstraint(param, /^[0-9A-HJKMNP-TV-Z]{26}$/);
			return builder;
		},

		whereIn: (param: string, values: string[]) => {
			if (values.length === 0) {
				throw new Error(`whereIn requires at least one value for parameter "${param}"`);
			}
			const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			addConstraint(param, new RegExp(`^(${escaped.join("|")})$`));
			return builder;
		},
	};

	return builder;
}

/**
 * Wrap a route builder to auto-apply name prefix.
 * Uses a Proxy to maintain dynamic getter behavior from the original builder.
 */
export function wrapBuilderWithNamePrefix(builder: RouteBuilder, namePrefix: string): RouteBuilder {
	if (!namePrefix) return builder;

	return new Proxy(builder, {
		get(target, prop) {
			if (prop === "name") {
				return (name: string) => {
					return target.name(namePrefix + name);
				};
			}
			return target[prop as keyof RouteBuilder];
		},
	});
}
