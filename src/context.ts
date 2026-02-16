import { BodyParseError } from "./errors.js";
import type { PathParams } from "./types/pathParams.js";
import type { RequestContext } from "./types/requestContext.js";

/**
 * Create a RequestContext for a given request and params.
 *
 * Centralises context construction so that body helpers (`json`, `text`,
 * `formData`) are available everywhere a `RequestContext` is built —
 * including 404/405 handler contexts.
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
				return (await request.formData()) as unknown as FormData;
			} catch (error) {
				throw new BodyParseError("Failed to parse form data", error);
			}
		},
	};
}
