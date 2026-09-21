/**
 * Standalone response helpers.
 *
 * Every helper returns a plain Web `Response`, so they work anywhere — inside a
 * route handler, inside middleware, or in code that has no request context at
 * all. The same functions back `ctx.json()`, `ctx.text()`, `ctx.html()`,
 * `ctx.redirect()` and `ctx.status()`.
 */

/** Content-type for {@link json} responses. */
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
/** Content-type for {@link text} responses. */
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
/** Content-type for {@link html} responses. */
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

/**
 * Merge a caller-supplied `ResponseInit` with a default content-type.
 *
 * Headers from `init` win: passing an explicit `content-type` overrides the
 * helper's default, and every other header is preserved.
 *
 * @internal
 */
function withContentType(init: ResponseInit | undefined, contentType: string): ResponseInit {
	// `ResponseInit["headers"]` and the global `Headers` constructor come from
	// different lib typings under Bun; the cast keeps them interchangeable.
	const headers = new Headers(init?.headers as ConstructorParameters<typeof Headers>[0]);

	if (!headers.has("content-type")) {
		headers.set("content-type", contentType);
	}

	return { ...init, headers: headers as ResponseInit["headers"] };
}

/**
 * Build a JSON `Response` from any serializable value.
 *
 * Sets `content-type: application/json; charset=utf-8` unless `init` provides
 * its own content-type. Any other `ResponseInit` field (`status`, `statusText`,
 * extra headers) is honoured.
 *
 * @typeParam T — Type of the value being serialized
 * @param data - Value to serialize with `JSON.stringify`
 * @param init - Optional `ResponseInit`; its headers are merged in
 * @returns A `Response` carrying the serialized JSON
 *
 * @example
 * ```ts
 * import { json } from "@bunary/http";
 *
 * json({ message: "Hello" });
 * json({ id: 1 }, { status: 201, headers: { location: "/users/1" } });
 * ```
 */
export function json<T>(data: T, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), withContentType(init, JSON_CONTENT_TYPE));
}

/**
 * Build a plain-text `Response`.
 *
 * Sets `content-type: text/plain; charset=utf-8` unless `init` provides its own
 * content-type.
 *
 * @param body - The response body
 * @param init - Optional `ResponseInit`; its headers are merged in
 * @returns A `Response` carrying the text body
 *
 * @example
 * ```ts
 * import { text } from "@bunary/http";
 *
 * text("pong");
 * text("Not acceptable", { status: 406 });
 * ```
 */
export function text(body: string, init?: ResponseInit): Response {
	return new Response(body, withContentType(init, TEXT_CONTENT_TYPE));
}

/**
 * Build an HTML `Response`.
 *
 * Sets `content-type: text/html; charset=utf-8` unless `init` provides its own
 * content-type.
 *
 * @param body - The HTML markup
 * @param init - Optional `ResponseInit`; its headers are merged in
 * @returns A `Response` carrying the HTML body
 *
 * @example
 * ```ts
 * import { html } from "@bunary/http";
 *
 * html("<h1>Hello</h1>");
 * html("<p>Gone</p>", { status: 410 });
 * ```
 */
export function html(body: string, init?: ResponseInit): Response {
	return new Response(body, withContentType(init, HTML_CONTENT_TYPE));
}

/**
 * Build a redirect `Response` with an empty body and a `location` header.
 *
 * @param url - Target URL, absolute or relative
 * @param status - Redirect status code (default: `302`)
 * @returns A `Response` that redirects to `url`
 *
 * @example
 * ```ts
 * import { redirect } from "@bunary/http";
 *
 * redirect("/login");                          // 302
 * redirect("/moved", 301);                     // permanent
 * redirect("https://example.com/next", 307);   // preserves the method
 * ```
 */
export function redirect(url: string, status = 302): Response {
	return new Response(null, { status, headers: { location: url } });
}

/**
 * Build an empty `Response` carrying only a status code.
 *
 * The `code` argument always wins over a `status` in `init`, so `init` is only
 * useful for `statusText` and extra headers. The body is always empty, which
 * keeps bodyless codes such as `204`, `205` and `304` valid.
 *
 * @param code - HTTP status code
 * @param init - Optional `ResponseInit` for `statusText` and headers
 * @returns An empty `Response` with the given status
 *
 * @example
 * ```ts
 * import { status } from "@bunary/http";
 *
 * status(204);                                        // No Content
 * status(202, { headers: { "x-job": "queued" } });    // Accepted
 * ```
 */
export function status(code: number, init?: ResponseInit): Response {
	return new Response(null, { ...init, status: code });
}
