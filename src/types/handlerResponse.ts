/**
 * Return type for route handlers.
 * - Objects/arrays are automatically serialized to JSON.
 * - Response objects are passed through unchanged.
 * - Primitives (string, number) are converted to text responses.
 */
export type HandlerResponse = Response | object | string | number | null | undefined;
