import type { Application } from "@bunary/core";
import { createCookieJar } from "./cookies.js";
import { BodyParseError } from "./errors.js";
import {
	html as htmlResponse,
	json as jsonResponse,
	redirect as redirectResponse,
	status as statusResponse,
	text as textResponse,
} from "./helpers.js";
import { HttpError } from "./httpError.js";
import type { BodyReader } from "./types/bodyReader.js";
import type { PathParams } from "./types/pathParams.js";
import type { RequestContext } from "./types/requestContext.js";

/** The 413 thrown when a body exceeds the router's `maxBodySize`. */
function bodyTooLarge(limit: number): HttpError {
	return new HttpError(413, `Request body exceeds the ${limit}-byte limit`);
}

/**
 * Read a request body into memory, refusing anything over `limit` bytes.
 *
 * A declared `Content-Length` over the limit is rejected before reading;
 * otherwise the stream is counted chunk by chunk and cancelled the moment it
 * passes the limit, so a body without (or lying about) `Content-Length` is
 * never buffered beyond it.
 *
 * @internal
 */
async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > limit) {
		throw bodyTooLarge(limit);
	}
	if (request.body === null) {
		return new Uint8Array(0);
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel();
			throw bodyTooLarge(limit);
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

/**
 * Build the lazy body readers exposed as `ctx.body`.
 *
 * With a `maxBodySize`, the body is read through {@link readLimited} and then
 * decoded, so every reader enforces the same limit (#121).
 *
 * @internal
 */
function createBodyReader(request: Request, maxBodySize?: number): BodyReader {
	const text = async (): Promise<string> =>
		maxBodySize === undefined
			? request.text()
			: new TextDecoder().decode(await readLimited(request, maxBodySize));

	return {
		json: async <T = unknown>(): Promise<T> => {
			if (maxBodySize === undefined) {
				try {
					return (await request.json()) as T;
				} catch (error) {
					throw new BodyParseError("Failed to parse JSON body", error);
				}
			}
			const raw = await text();
			try {
				return JSON.parse(raw) as T;
			} catch (error) {
				throw new BodyParseError("Failed to parse JSON body", error);
			}
		},
		text,
		formData: async () => {
			const source =
				maxBodySize === undefined
					? request
					: new Response(await readLimited(request, maxBodySize), {
							headers: { "content-type": request.headers.get("content-type") ?? "" },
						});
			try {
				return await source.formData();
			} catch (error) {
				throw new BodyParseError("Failed to parse form data", error);
			}
		},
	};
}

/**
 * Create a RequestContext for a given request and params.
 *
 * Centralises context construction so that the body readers (`ctx.body.*`),
 * the cookie jar (`ctx.cookies`), and the response helpers (`ctx.json`,
 * `ctx.text`, `ctx.html`, `ctx.redirect`, `ctx.status`) are available
 * everywhere a `RequestContext` is built — including the 404/405/error
 * handler contexts.
 *
 * @param app - The core `Application` this router is mounted on, or
 *   `undefined` for a standalone router.
 * @param maxBodySize - The router's `maxBodySize`, enforced by `ctx.body.*`.
 *
 * @internal
 */
export function createRequestContext(
	request: Request,
	params: PathParams,
	query: URLSearchParams,
	app?: Application,
	maxBodySize?: number,
): RequestContext {
	return {
		request,
		params,
		query,
		locals: {},
		app,
		body: createBodyReader(request, maxBodySize),
		cookies: createCookieJar(request),
		json: jsonResponse,
		text: textResponse,
		html: htmlResponse,
		redirect: redirectResponse,
		status: statusResponse,
	};
}
