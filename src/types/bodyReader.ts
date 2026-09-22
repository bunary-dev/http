/**
 * Lazy readers for the request body, exposed as `ctx.body`.
 *
 * Each method is a thin wrapper around the matching `Request` method with
 * error handling: `json()` and `formData()` throw {@link BodyParseError}
 * instead of a raw `SyntaxError`/`TypeError`.
 *
 * Per the Fetch API a request body can only be consumed once, so calling two of
 * these methods (or the same one twice) on the same request throws. Share the
 * parsed value through `ctx.locals` instead.
 *
 * @example
 * ```ts
 * router.post("/users", async (ctx) => {
 *   const user = await ctx.body.json<{ name: string }>();
 *   return ctx.json({ id: 1, name: user.name }, { status: 201 });
 * });
 * ```
 */
export interface BodyReader {
	/**
	 * Parse the request body as JSON.
	 *
	 * @typeParam T — Expected shape of the parsed JSON body
	 * @returns The parsed JSON body
	 * @throws {BodyParseError} If the body cannot be parsed as JSON
	 *
	 * @example
	 * ```ts
	 * router.post("/users", async (ctx) => {
	 *   const body = await ctx.body.json<{ name: string }>();
	 *   return { id: 1, name: body.name };
	 * });
	 * ```
	 */
	json: <T = unknown>() => Promise<T>;

	/**
	 * Read the request body as a string.
	 *
	 * @returns The request body as text
	 *
	 * @example
	 * ```ts
	 * router.post("/echo", async (ctx) => {
	 *   const payload = await ctx.body.text();
	 *   return { echo: payload };
	 * });
	 * ```
	 */
	text: () => Promise<string>;

	/**
	 * Parse the request body as `FormData`.
	 *
	 * @returns The parsed `FormData`
	 * @throws {BodyParseError} If the body cannot be parsed as form data
	 *
	 * @example
	 * ```ts
	 * router.post("/upload", async (ctx) => {
	 *   const form = await ctx.body.formData();
	 *   return { name: form.get("name") };
	 * });
	 * ```
	 */
	formData: () => ReturnType<Request["formData"]>;
}
