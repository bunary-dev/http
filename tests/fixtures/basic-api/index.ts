/**
 * `basic-api` — a fixture consumer of `@bunary/http` mounted on a
 * `@bunary/core` Application.
 *
 * Not a user-facing example: it imports `../../../src/*` so `tests/consumer.test.ts`
 * exercises the working tree. A consumer writes `@bunary/http` and
 * `@bunary/http/provider` instead.
 */
export { type BasicApi, createBasicApi } from "./app.js";
export { apiEnv, basicApiConfig, httpConfig } from "./config.js";
export { DatabaseToken, type FakeConnection, type UserRecord } from "./database.js";
export { type ApiLocals, createApiRouter } from "./routes.js";
