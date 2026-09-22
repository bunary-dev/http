/**
 * The query string flattened to a plain object, as handed to a route's `query`
 * schema (`Object.fromEntries(url.searchParams)`).
 *
 * A repeated key collapses to its **last** value — validate `ctx.query` through
 * `URLSearchParams` yourself if you need every value of a repeated key.
 */
export type QueryParams = Record<string, string>;
