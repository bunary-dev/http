import { BodyParseError } from "./errors.js";
import {
	html as htmlResponse,
	json as jsonResponse,
	redirect as redirectResponse,
	status as statusResponse,
	text as textResponse,
} from "./helpers.js";
import type { BodyReader } from "./types/bodyReader.js";
import type { PathParams } from "./types/pathParams.js";
import type { RequestContext } from "./types/requestContext.js";

/**
 * Build the lazy body readers exposed as `ctx.body`.
 *
 * @internal
 */
function createBodyReader(request: Request): BodyReader {
	return {
		json: async <T = unknown>(): Promise<T> => {
			try {
				return (await request.json()) as T;
			} catch (error) {
				throw new BodyParseError("Failed to parse JSON body", error);
			}
		},
		text: () => request.text(),
		formData: async () => {
			try {
				return await request.formData();
			} catch (error) {
				throw new BodyParseError("Failed to parse form data", error);
			}
		},
	};
}

/**
 * Create a RequestContext for a given request and params.
 *
 * Centralises context construction so that the body readers (`ctx.body.*`) and
 * the response helpers (`ctx.json`, `ctx.text`, `ctx.html`, `ctx.redirect`,
 * `ctx.status`) are available everywhere a `RequestContext` is built —
 * including the 404/405/error handler contexts.
 *
 * @internal
 */
export function createRequestContext(
	request: Request,
	params: PathParams,
	query: URLSearchParams,
): RequestContext {
	return {
		request,
		params,
		query,
		locals: {},
		body: createBodyReader(request),
		json: jsonResponse,
		text: textResponse,
		html: htmlResponse,
		redirect: redirectResponse,
		status: statusResponse,
	};
}
