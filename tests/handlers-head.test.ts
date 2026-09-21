/**
 * Unit tests for the HEAD handler helpers — normalizeHeadMethod() and
 * toHeadResponse() — imported directly from src/handlers/head.ts.
 *
 * These bypass createApp entirely so the route table is built by hand
 * with compilePath(), matching the shape the router itself produces.
 *
 * @see {@link ../src/handlers/head.ts}
 */
import { describe, expect, it } from "bun:test";
import { normalizeHeadMethod, toHeadResponse } from "../src/handlers/head.js";
import { compilePath } from "../src/router.js";
import type { Route } from "../src/types/index.js";

function makeRoute(method: Route["method"], path: string): Route {
	const compiled = compilePath(path);
	return {
		method,
		path,
		pattern: compiled.pattern,
		paramNames: compiled.paramNames,
		optionalParams: compiled.optionalParams,
		isWildcard: compiled.isWildcard,
		handler: () => ({}),
	};
}

describe("normalizeHeadMethod()", () => {
	it("returns the method unchanged when it is not HEAD", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(normalizeHeadMethod("GET", "/users", routes)).toBe("GET");
		expect(normalizeHeadMethod("POST", "/users", routes)).toBe("POST");
	});

	it("returns HEAD when an explicit HEAD route exists for the path", () => {
		const routes = [makeRoute("HEAD", "/users"), makeRoute("GET", "/users")];
		expect(normalizeHeadMethod("HEAD", "/users", routes)).toBe("HEAD");
	});

	it("falls back to GET when no explicit HEAD route exists but a GET route does", () => {
		const routes = [makeRoute("GET", "/users")];
		expect(normalizeHeadMethod("HEAD", "/users", routes)).toBe("GET");
	});

	it("falls back to HEAD when neither a HEAD nor GET route exists", () => {
		const routes = [makeRoute("POST", "/users")];
		expect(normalizeHeadMethod("HEAD", "/users", routes)).toBe("HEAD");
	});

	it("falls back to HEAD when the route table is empty", () => {
		expect(normalizeHeadMethod("HEAD", "/users", [])).toBe("HEAD");
	});
});

describe("toHeadResponse()", () => {
	it("strips the body but preserves status, statusText, and headers", () => {
		const original = new Response("hello world", {
			status: 201,
			statusText: "Created",
			headers: { "x-custom": "value", "content-type": "text/plain" },
		});

		const head = toHeadResponse(original);

		expect(head.status).toBe(201);
		expect(head.statusText).toBe("Created");
		expect(head.headers.get("x-custom")).toBe("value");
		expect(head.headers.get("content-type")).toBe("text/plain");
	});

	it("produces a response with a null body", async () => {
		const original = new Response("body content", { status: 200 });
		const head = toHeadResponse(original);
		const text = await head.text();
		expect(text).toBe("");
	});
});
