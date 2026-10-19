/**
 * The query string flattened to a plain object, as handed to a route's `query`
 * schema.
 *
 * A key that appears once is a `string`; a repeated key (`?tag=a&tag=b`) is a
 * `string[]` of its values in order.
 */
export type QueryParams = Record<string, string | string[]>;
