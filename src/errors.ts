/**
 * Error thrown when request body parsing fails.
 *
 * Thrown by `ctx.json()` and `ctx.formData()` when the request body
 * cannot be parsed. Handlers can catch this to return a custom 400 response.
 *
 * @example
 * ```ts
 * import { BodyParseError } from "@bunary/http";
 *
 * app.post("/users", async (ctx) => {
 *   try {
 *     const body = await ctx.json();
 *     return { received: body };
 *   } catch (error) {
 *     if (error instanceof BodyParseError) {
 *       return new Response(JSON.stringify({ error: error.message }), {
 *         status: 400,
 *         headers: { "Content-Type": "application/json" },
 *       });
 *     }
 *     throw error;
 *   }
 * });
 * ```
 */
export class BodyParseError extends Error {
	override readonly name = "BodyParseError";

	/** The underlying parse error, if available */
	readonly cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message);
		this.cause = cause;
	}
}
