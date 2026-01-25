/**
 * Path parameters extracted from route patterns (e.g., `/users/:id` → `{ id: "123" }`).
 * Optional parameters may be undefined when not provided.
 */
export type PathParams = Record<string, string | undefined>;
