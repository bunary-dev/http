# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-02

### Added

- Route model binding: a route's options object takes `bind: { key: resolver }` alongside `params`/`query`/`body`, and the handler reads each resolved value from a new `ctx.bound`, typed as the resolver's awaited result without `null`/`undefined`. A resolver gets the validated param (the raw decoded string without a `params` schema) and the request context with the bindings resolved so far; bindings run after group middleware and validation, one at a time in path order, so a child can scope its lookup to its parent. `null`/`undefined` answers a `404` problem with `detail: "<key> not found"` (never the requested value) without calling the handler; a resolver that throws (e.g. `abort(410)`) takes the normal error path. A `bind` key with no matching `:key` in the full path throws at registration. Routes without `bind` keep their types and behaviour. New types `RouteBindings`, `BindResolver`, `BindingContext`, `BoundOf`, `BoundContext` and `RouteRegistration` (#158)

## [0.5.0] - 2026-11-02

### Added

- The default error mapper turns `@bunary/orm`'s `ModelNotFoundError` (e.g. from `findOrFail()`) into a `404` RFC 9457 problem instead of a `500`. It is matched by shape (an `Error` named `ModelNotFoundError`), so orm is not a dependency; the error message is sent as `detail` only in debug mode, and a custom `onError` still overrides it (#157)

## [0.4.0] - 2026-11-01

Baseline release: every `@bunary/*` package moves to 0.4.0 together. This is the first npm release since 0.3.0, so it carries everything below that was previously tagged as `1.0.0-rc.1` and as an earlier, unpublished `0.4.0`. Works standalone or mounted on a `@bunary/core` 0.4.0 Application: `@bunary/core` is an optional peer at `^0.4.0`, and the dev dependency now comes from npm instead of a vendored tarball (#151)

### Breaking

- Global middleware registered with `router.use()` now wraps **every** response the router produces — matched routes, 404, 405, the OPTIONS auto-response and error responses alike — so `cors()`, logging and tracing always run (#65)
  - The pipeline is now `global middleware → error boundary → dispatcher`. Global middleware therefore receives a `Response` from `next()` rather than the handler's raw return value, and a handler that throws reaches it as a 500 response instead of a thrown error. Group and route middleware are unchanged: they run inside the boundary and still see raw handler return values and thrown errors
  - Migration: a global middleware that spreads `await next()` (`{ ...result }`) or wraps it in `try`/`catch` should read the `Response` instead, or move to group middleware. An error thrown by a global middleware itself still reaches `onError`
- `Access-Control-Allow-Methods` on a preflight now advertises the methods the matched path actually serves instead of a fixed list; an explicit `cors({ methods })` still wins, and `cors()` composed outside a router keeps the previous default list (#66)
- `Allow` on OPTIONS and 405 responses now also names `OPTIONS`, and `HEAD` wherever a `GET` route exists, since the router serves both without them being registered. The `onMethodNotAllowed` callback still receives the registered methods only (#68)
- The root route `/` no longer matches `//`, which previously slipped past prefix-based checks in a fronting proxy. Non-root routes keep their optional trailing slash (#68)
- Every built-in error response is now an RFC 9457 problem document — `content-type: application/problem+json; charset=utf-8` with a body of `{ type, title, status, detail?, instance?, errors? }` — replacing the old `{ "error": "..." }` JSON for the default 404, 405 and 500 responses (#77)
  - Migration: read `body.detail` (or `body.title`) instead of `body.error`, and match `application/problem+json` rather than `application/json` when asserting on error responses. An uncaught `BodyParseError` is now a 400 instead of a 500. A custom `onNotFound`, `onMethodNotAllowed` or `onError` still overrides the default entirely, and the 405 `Allow` header is unchanged
  - An unexpected error's message appears as `detail` only when the environment is explicitly `development` or `test`, or the router's `debug` option is on; otherwise only `title` and `status` are sent (see Security)
- The request-body readers moved from the context root onto `ctx.body` so that `ctx.json(data)` can be the response helper, matching Hono and Elysia (#76)
  - Migration: `await ctx.json()` → `await ctx.body.json()`; `await ctx.text()` → `await ctx.body.text()`; `await ctx.formData()` → `await ctx.body.formData()`. Generics and `BodyParseError` behaviour are unchanged, and `ctx.request` still exposes the underlying Web `Request` for streaming, `arrayBuffer()` and `blob()`. TypeScript catches every un-migrated call site: the new `ctx.json(data)` and `ctx.text(body)` require an argument, and `ctx.formData` no longer exists on the context
- `createApp()` is now `createRouter()`, the `BunaryApp` type is now `Router`, and `AppOptions` is now `RouterOptions` — no aliases are kept, since `@bunary/core` owns `createApp()` (#74)
  - Migration: `import { createApp } from "@bunary/http"` → `import { createRouter } from "@bunary/http"`; every other member (`get`/`post`/`put`/`patch`/`delete`, `use`, `group`, `route`, `hasRoute`, `getRoutes`, `listen`, `fetch`) is unchanged
- **Requires Bun ≥ 1.4.0** (`engines.bun`); `.bun-version` pins 1.4.2 for CI and contributors (#71)
- `cors()` throws when `credentials: true` is combined with a wildcard origin, and the default 500 response hides `error.message` unless the environment is explicitly `development` or `test`; see Security (#104, #121)

### Added

- `router.ws(path, handlers, options?)` WebSocket routes, also on groups: `{ open?, message?, close?, drain? }` receive Bun's `ServerWebSocket` with `ws.data` typed as `{ params, locals }` plus whatever the `upgrade(ctx)` option returns; a `headers` option sets headers on the `101`. Params, constraints, groups and global/group middleware run before the upgrade, so middleware can reject with e.g. 401; a request without `Upgrade: websocket` gets 426 Upgrade Required. `listen()` now passes a `websocket` handler to `Bun.serve`, and `router.websocket` is exposed for your own `Bun.serve({ fetch: router.fetch, websocket: router.websocket })`. New types `WebSocketHandlers`, `WebSocketData`, `WebSocketRouteOptions` and `RouterWebSocketHandler` (#128)
- `Resource` abstract class for Accept-header content negotiation: a handler returns a `Resource` whose `toJSON()` is always served as `application/json` and whose `formats` map (media type → converter, e.g. `"application/ld+json": () => this.toJsonLd()`) opts into more formats. The router honours q-values, order, `*/*` and `type/*`, sets the chosen `Content-Type`, appends `Vary: Accept`, and answers a 406 problem response listing the available media types when nothing is acceptable. Optional `status` and `headers` fields set the response status and extra headers. `toResponse(result, request?)` takes the request as an optional second argument to negotiate a `Resource` in group middleware. Handlers returning plain objects, strings, numbers or `Response`s are unchanged (#37)
- `toResponse(result)` is exported from the package entry: it converts a handler return value (`Response`, object, array, string, number, `null`/`undefined`) into a `Response`. A group middleware's `next()` resolves to the handler's raw return value (unlike global middleware, which gets a `Response`); this is now documented, with `toResponse(await next())` as the way to add a header. Group `next()` behaviour is unchanged (#98)
- `sse(ctx, handler, { keepAlive?, headers? })` Server-Sent Events helper: returns a `ReadableStream`-backed `Response` with `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache` and `Connection: keep-alive`. The handler gets `send({ data, event?, id?, retry? })` (non-string data JSON-encoded, multi-line data split into several `data:` lines), `comment(text)`, `close()`, `closed` and a `signal` that fires on client disconnect. `keepAlive` sends `: ping` comments, and the timer is cleared on close or abort (#127)
- `serveStatic(root, options?)` route handler for serving a directory from a wildcard route (`router.get("/assets/*", serveStatic("./public"))`): `Content-Type`, `Content-Length`, `Last-Modified` and weak `ETag` headers, 304 for `If-None-Match` / `If-Modified-Since`, header-only `HEAD`, optional `index` file, `dotfiles: "allow"` and `maxAge` (`Cache-Control: public, max-age=N`). Missing files, directories, dotfiles, `..` / encoded / absolute / NUL-byte paths and symlinks resolving outside `root` are 404; no new dependency (#126)
- `rateLimit({ limit, windowMs, key?, trustProxy?, store? })` middleware: fixed-window, in-memory request limiting keyed by client IP by default (first `X-Forwarded-For` hop only with `trustProxy: true`, else the socket address). Over the limit it answers a 429 problem response with `Retry-After`; every response gets `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. A `RateLimitStore` interface lets a shared store replace the in-memory one. `router.fetch()` accepts the server as an optional second argument, as `Bun.serve` passes it, to expose the socket address (#125)
- `AnyContext<TLocals>` type export: a request context with any `params` / `query` / `body` shapes, so one helper can take the context of both a validated and an unvalidated route (`ValidatedContext` is not assignable to `RequestContext`). Types only, no runtime change (#97)
- `listen()` passes `maxRequestBodySize`, `idleTimeout` and `tls` through to `Bun.serve`, only when supplied (#121)
- `maxBodySize` router option: `ctx.body.json()`, `.text()` and `.formData()` throw an `HttpError` with status 413 for bodies larger than the limit, checked against `Content-Length` and while streaming (#121)
- `debug` router option to decide explicitly whether the default 500 handler includes `error.message` as `detail` (#121)
- `ctx.cookies` cookie jar backed by the `cookie` package (the package's first runtime dependency): `get(name)` and `getAll()` read the incoming `Cookie` header lazily, `set(name, value, options?)` and `delete(name, options?)` queue `Set-Cookie` header values (`delete()` forces `Max-Age=0` and an epoch `Expires`) (#79)
  - Queued cookies are appended onto whatever `Response` the router ultimately returns — matched routes, plain-object returns via `toResponse()`, 404/405, and error responses alike — from one point in `createRouter.ts`, after global middleware has produced the final response; an immutable `Response` (e.g. `Response.redirect()`) is cloned with the extra headers
  - `CookieJar` and `createCookieJar` are exported from the barrel, along with `CookieSerializeOptions` (a re-export of `cookie`'s `SerializeOptions`)
  - No signing or encryption — that belongs to a future security package
- `httpProvider(router)`, `serve(app, overrides?)`, `RouterToken` and the `HttpConfig` type, mounting a router on a `@bunary/core` Application (#80)
  - Published on the new `@bunary/http/provider` subpath export. `@bunary/core` is an optional peer, so the integration is deliberately **not** re-exported from the main barrel: a runtime re-export would make every standalone `import "@bunary/http"` resolve the peer. Only the `HttpConfig` type is re-exported from the barrel (types are erased)
  - `register()` binds the router under `RouterToken`, validates the `http` config namespace (`port` an integer in `0..65535`, `hostname` a string, `cors` an object) with a core `BunaryError`, and exposes the Application to handlers. It never listens
  - `serve(app, overrides?)` reads `RouterToken` and `config.http`, calls `router.listen()` and returns its handle unchanged; `overrides` win over the config, and it throws core's `MissingBindingError` when the provider was never registered
- `BunaryConfig.http` module augmentation adding an optional `{ port?, hostname?, cors? }` namespace — every key optional, since the augmentation is program-wide (#80)
- `ctx.app`, the `@bunary/core` Application the router is mounted on, or `undefined` for a standalone router. Set by `httpProvider()`, or manually via the new `createRouter({ app })` option (#80)
- Response helpers `json(data, init?)`, `text(body, init?)`, `html(body, init?)`, `redirect(url, status = 302)` and `status(code, init?)`, exported standalone from the barrel and available on the request context as `ctx.json()`, `ctx.text()`, `ctx.html()`, `ctx.redirect()` and `ctx.status()` (#76)
  - Each returns a plain Web `Response` with the right content-type (`application/json; charset=utf-8`, `text/plain; charset=utf-8`, `text/html; charset=utf-8`); `init` is a standard `ResponseInit` whose headers are merged in, and an explicit `content-type` in `init` wins
  - `status()` always returns an empty body and the `code` argument wins over a `status` in `init`, so bodyless codes (`204`, `205`, `304`) stay valid
- `BodyReader` type, exported from the barrel, describing `ctx.body` (#76)
- Plain `Response` / string / object / `null` handler returns keep working unchanged through `toResponse()` (#76)
- `HttpError` and the status subclasses `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `MethodNotAllowedError` (405), `ConflictError` (409), `UnprocessableError` (422), `TooManyRequestsError` (429) and `InternalServerError` (500), all exported from the barrel (#77)
  - Each carries `status`, `message`, and optional `headers`, `details` and `cause`; the message defaults to the status' standard reason phrase
- `abort(status, message?, options?)`, which throws the matching subclass for a known status and a generic `HttpError` for any other, and returns `never` so the code after it narrows as unreachable (#77)
- `isHttpError(error)` type guard (#77)
- `problemResponse(error, { debug?, instance? })`, the router's default error mapper, exported for reuse inside a custom `onError` (#77)
  - `HttpError` → its own status and headers, with `details` as `errors`; a `@bunary/core` `ValidationError` → 422 with its `issues` as `errors` (matched structurally, so core stays an optional peer); `BodyParseError` → 400; anything else → 500, whose `detail` appears only when `debug` is on
- `problem(status, detail?, options?)` builder and the `ProblemDetails`, `ProblemOptions` and `ProblemResponseOptions` types (#77)
- Route-level validation: every route method takes an optional `{ params?, query?, body? }` options object between the path and the handler, on both the router and group routers (#78)
  - Each slot accepts a `SchemaLike` — a [Standard Schema](https://standardschema.dev) object (zod, valibot, arktype, ...) or a plain function that returns the parsed value and throws on bad input
  - A validated slot **replaces** its context value with the schema's output: with a `body` schema `ctx.body` *is* the validated body rather than a `BodyReader` wrapping it; unvalidated slots keep `PathParams`, `URLSearchParams` and the `BodyReader` as before
  - `ctx.params`, `ctx.query` and `ctx.body` are typed from the schemas' output types, inferred from `StandardSchemaV1.InferOutput` or a plain function's return type
  - `params` receives the matched path parameters; `query` receives the search params as an object, with a repeated key as an array (see Fixed, #106); `body` is parsed by `content-type` — `application/json` via `ctx.body.json()`, `application/x-www-form-urlencoded` and `multipart/form-data` via `ctx.body.formData()` flattened to a plain object, and anything else (including a bodyless request) validates `undefined`
  - Validation runs inside the route pipeline after route and group middleware, so middleware still sees the raw context. A rejected schema throws `@bunary/core`'s `ValidationError`, which the default mapper turns into a 422 problem document with every issue in `errors`; a body that cannot be parsed at all stays a `BodyParseError` → 400
  - `@bunary/core` remains an optional peer: `validateWith` is reached through a dynamic `import("@bunary/core")` that only runs for a route declaring schemas, and nothing in the bundled entry point imports core statically
  - New exported types `RouteSchema`, `RouteSchemas`, `InferSchemaOutput`, `ParamsOf`, `QueryOf`, `BodyOf`, `ValidatedContext`, `ValidatedRouteHandler`, `StandardSchemaLike` and `QueryParams`
  - The existing two-argument `(path, handler)` form and the per-route `TParams` generic are unchanged
- `listen()` passes `development` and `error` through to `Bun.serve`, so Bun's development error page and a last-resort error handler are reachable without dropping to `Bun.serve` by hand (#68)

### Changed

- Route matching consults an index keyed by each route's first static path segment instead of testing every route, so apps with many routes under different prefixes resolve faster (about 4.8x at 100 routes, 24x at 500 in `bench/routes.ts`). Matching results, first-match-wins order, 405 `Allow` and `HEAD`/`OPTIONS` behaviour are unchanged (#12)
- A CORS preflight for a path with no routes now falls through to the 404 handler (carrying CORS headers) rather than answering 204, so the caller sees the real status (#66)
- `normalizeHeadMethod()` removed from `src/handlers/head.ts` — dead since `resolveRoute()` took over the HEAD→GET fallback, and it cost two extra route-table scans (#68)
- Toolchain: `@types/bun` replaces `bun-types`, `typescript` ^7 and `@biomejs/biome` 2.5.1 pinned as devDependencies; `bun.lock` committed (#71)
- `tsconfig.json` aligned with Bun 1.4 `bun init` defaults (`module: Preserve`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`) (#71)
- CI: Bun version read from `.bun-version`, plus a non-required `bun latest` canary job; build job verifies the publish tarball with `bun pm pack --dry-run`; `actions/checkout@v7` (#71)
- Lint/format now cover `tests/` and call `tsc`/`biome` directly instead of `bunx`; per-file coverage threshold (35% lines / 45% functions — below the standard 90%, kept low because `src/handlers/head.ts` and `src/routes/find.ts` currently have thin coverage; Bun enforces the threshold per file, not just in aggregate) enforced via `bunfig.toml` (#71)

### Fixed

- A router mounted on a `@bunary/core` Application no longer exposes `error.message` in default 500 responses just because core's environment fell back to `development` (no `config.app.env`, `APP_ENV` or `NODE_ENV` set). With the router's `debug` option unset, a core-mounted router now follows core's resolved `app.debug` (`config.app.debug`, `APP_DEBUG`, `DEBUG`, default `false`) instead of `app.env`; an explicit `app.env: "development"` without `app.debug: true` no longer shows detail. The router's `debug` option still wins, and standalone routers are unchanged (#131)
- `cors()` with a configured origin (string or array) or `credentials: true` now adds `Vary: Origin` to responses for requests that send no `Origin` header, appended to any existing `Vary`. Previously a shared cache could store that no-CORS response and serve it to later cross-origin requests, which then failed CORS. The wildcard default without credentials is unchanged (#120)
- A throwing `onError` is called exactly once per request instead of twice (the second time with its own error); the router falls back to the generic 500 problem response, which global middleware still sees. The `listen()` `error` option docs no longer claim a throwing `onError` escapes the router (#119)
- `HEAD` on a `GET` route that returns a slow or never-ending stream (SSE, long-poll) no longer hangs until 64 KiB is produced: the body is measured for at most 50 ms, then cancelled and the response sent without `Content-Length`. Small finite bodies still get `Content-Length` (#117)
- Route `query` validation no longer drops repeated keys: `?tag=a&tag=b` reaches the schema as `{ tag: ["a", "b"] }`; a key seen once stays a string. `QueryParams` is now `Record<string, string | string[]>` (#106)
- Route `body` validation no longer drops repeated form fields: an `application/x-www-form-urlencoded` or `multipart/form-data` body with `tag=a&tag=b` reaches the schema as `{ tag: ["a", "b"] }`, matching `query`; a field seen once stays a single value (#118)
- Route `body` validation parses any `application/*+json` content type (e.g. `application/vnd.api+json`) as JSON instead of validating `undefined` (#118)
- Typed locals declared as an `interface` now compose with `router.use(cors())` and `httpProvider(router)`: `cors()` and `httpProvider()` are generic over the router's locals type. Types only, no runtime change (#96)
- 404, 405 and 500 responses carry CORS headers again; previously a browser reported a CORS failure instead of the real status because `cors()` never ran for them (#65)
- `Vary: Origin` is now sent when an origin is **rejected**, not only when it is allowed — without it a shared cache could serve the no-CORS variant to an allowed origin, and vice versa (#66)
- `Vary` is appended rather than overwritten, so an upstream `Vary: Accept-Encoding` survives; preflight responses also vary on `Access-Control-Request-Method` and `Access-Control-Request-Headers`, and a name already present is not repeated (#66)
- A preflight now takes its group middleware from the route matching `Access-Control-Request-Method`; it previously used whichever route was registered first at that path, so a preflight for `POST /x` could pick up (or miss) middleware belonging to `GET /x` in another group (#66)
- HEAD responses set `Content-Length` to the length of the discarded body (RFC 9110), and HEAD 404/405 responses no longer carry a body (#68)
- `ctx.params` values are documented as being decoded after matching, so `%2F` yields a `/` inside a single-segment parameter — handlers doing file lookups must validate or constrain them (#68)
- `exports["."]` now lists `types` before `import` so TypeScript resolves the declarations; added `default` condition and `./package.json` subpath (#67)
- Added `publishConfig.access: public` and `sideEffects: false` (#71)
- Added missing `LICENSE` file (MIT) to the repo and the published tarball (#71)

### Security

- `cors()` now throws when `credentials: true` is combined with a wildcard origin (`"*"`, `["*"]` or the default), which reflected any `Origin` with credentials. Pass `allowWildcardCredentials: true` to opt in. `["*"]` is now handled like `"*"` (#104)
- The default error handler no longer includes `error.message` in 500 responses unless the environment is explicitly `development` or `test` (or `debug: true` is set). Previously anything other than `production`, including no `APP_ENV`/`NODE_ENV` at all, exposed raw error messages (#121)

## [0.3.0] - 2026-02-17

### Added

- Built-in CORS middleware via `cors()` factory (#47)
  - `cors()` with no arguments allows all origins (default `Access-Control-Allow-Origin: *`)
  - Configurable `origin` (string, string array, or `"*"`), `methods`, `allowHeaders`, `exposeHeaders`, `credentials`, `maxAge`
  - Handles preflight `OPTIONS` requests automatically — returns 204 with CORS headers
  - Reflects `Access-Control-Request-Headers` by default, or uses explicit `allowHeaders`
  - Adds `Vary: Origin` when origin is not `"*"` for correct cache behavior
  - Works as global middleware (`app.use(cors())`) or per-group (`middleware: [cors()]`)
  - `CorsOptions` type exported for TypeScript consumers

- Body parsing helpers on `RequestContext` — `ctx.json()`, `ctx.text()`, `ctx.formData()` (#51)
  - `ctx.json<T>()` — parse JSON body with type inference, throws `BodyParseError` on malformed input
  - `ctx.text()` — get request body as string
  - `ctx.formData()` — parse multipart/URL-encoded form data, throws `BodyParseError` on malformed input
  - `BodyParseError` class exported for catch-based error handling in handlers
  - Thin wrappers around `Request` methods — no parsing framework, no validation, zero new dependencies

## [0.2.0] - 2026-02-15

### Added

- Typed `ctx.locals` via `createApp<TLocals>()` generic (#43)
  - `RequestContext<TLocals, TParams>` now accepts two type parameters with backward-compatible defaults
  - `createApp<{ user: User }>()` propagates `TLocals` to all handlers, middleware, groups, and options callbacks
  - `Middleware<TLocals>`, `BunaryApp<TLocals>`, `GroupRouter<TLocals>`, `GroupOptions<TLocals>`, `AppOptions<TLocals>` all generic
  - Fully backward-compatible — omitting the generic keeps the existing `Record<string, unknown>` behaviour

- Typed route parameters via per-route `<TParams>` generic (#50)
  - `app.get<{ id: string }>("/users/:id", handler)` narrows `ctx.params` to `{ id: string }` inside the handler
  - Works on all HTTP methods: `get`, `post`, `put`, `patch`, `delete`
  - Works inside route groups: `router.get<{ id: string }>(...)`
  - Values remain strings at runtime — the generic only narrows the TypeScript type
  - Default `PathParams` (`Record<string, string | undefined>`) preserved when no generic is provided

## [0.1.3] - 2026-02-15

### Fixed

- Path parameters are now decoded with `decodeURIComponent` (#52)
  - `hello%20world` → `"hello world"`, `caf%C3%A9` → `"café"`, emoji and CJK characters decoded correctly
  - Malformed percent-sequences (e.g., `%ZZ`) gracefully return raw value
  - Route constraints now check against decoded values
- `joinPaths("/", "/users")` no longer returns `"//users"` (#49)

### Added

- 83 new unit tests for utility functions and URL encoding behaviour (#49, #52)
  - Direct unit tests for `compilePath()`, `extractParams()`, `checkConstraints()`, `normalizePrefix()`, `joinPaths()`, `toResponse()`
  - Full coverage of URL-encoded paths, unicode, double-encoding, and encoded slashes

## [0.1.2] - 2026-02-15

### Changed

- Single-pass route resolution replaces multiple scans of the route table (#42, #48)
  - HEAD requests now resolve in one pass instead of three separate `findRoute()` calls
  - 405 responses reuse allowed-methods collected during matching instead of a second full scan
  - New internal `resolveRoute()` function combines matching, HEAD→GET fallback, and method collection
  - No public API changes — purely internal performance improvement

## [0.1.1] - 2026-02-15

### Fixed

- Default error handler no longer leaks `error.message` in production (#44)
  - Returns generic `"Internal Server Error"` when `NODE_ENV=production`
  - Full error message still shown in development and test modes

### Removed

- Removed internal `Route` type from public exports — use `RouteInfo` for route metadata (#45)

## [0.1.0] - 2026-01-31

### Added

- First minor release — API stable for development use until 1.0.0

## [0.0.11] - 2026-01-29

### Removed

- Removed unused `@bunary/core` dependency (chore #21)
  - Package now has zero runtime dependencies
  - Updated README and documentation to reflect this change

## [0.0.10] - 2026-01-29

### Added

- Configurable error handlers in `createApp()` options (feature #20)
  - `onNotFound` - Custom handler for 404 Not Found responses
  - `onMethodNotAllowed` - Custom handler for 405 Method Not Allowed responses
  - `onError` - Custom handler for 500 Internal Server Error responses
  - All handlers receive `RequestContext` and can return `Response` or `HandlerResponse`
  - Default behavior unchanged when handlers are not provided
  - `Allow` header automatically added to 405 responses if custom handler doesn't set it

## [0.0.9] - 2026-01-29

### Fixed

- Proper HEAD and OPTIONS request handling (bug #16)
  - HEAD requests to GET routes now return 200 with empty body (preserves headers and status)
  - OPTIONS requests return 204 with `Allow` header listing permitted methods
  - 405 Method Not Allowed responses now include `Allow` header
  - Route constraints are respected when determining allowed methods

## [0.0.8] - 2026-01-29

### Added

- `createApp({ basePath })` option to prefix all routes (feature #18)
  - Base path is automatically normalized (leading slash added, trailing slash removed)
  - Composes correctly with route groups: `basePath + group prefix + route path`
  - Included in `app.route()` URL generation for named routes
  - Useful when mounting the app behind a reverse proxy

## [0.0.7] - 2026-01-29

### Added

- `app.listen({ port, hostname })` overload (feature #19)
  - Object form: `app.listen({ port: 3000, hostname: 'localhost' })`
  - Existing positional form still works: `app.listen(3000, 'localhost')`
  - Exported `ListenOptions` type for options object

## [0.0.6] - 2026-01-29

### Fixed

- Aligned query parameter API with actual implementation (bug #17)
  - Removed misleading `QueryParams` type export that didn't match runtime `URLSearchParams`
  - Updated README examples to use `ctx.query.get()` and `ctx.query.getAll()` instead of destructuring
  - Fixed `RequestContext` interface documentation to show `query: URLSearchParams`

### Removed

- `QueryParams` type export (was inconsistent with actual `URLSearchParams` runtime type)

## [0.0.5] - 2026-01-28

### Added

- `RequestContext.locals` for per-request middleware state (isolated between concurrent requests)

## [0.0.4] - 2026-01-26

### Added

- Optional route parameters using `:param?` syntax
  - Routes can match with or without optional parameters
  - Optional params are `undefined` in `ctx.params` when not provided
  - Supports multiple optional parameters in a single route
  - Works with route constraints
- Comprehensive test suite for optional parameters

## [0.0.3] - 2026-01-26

### Added

- Route Groups with `app.group()` method
  - Prefix routes with shared path prefix
  - Apply middleware to groups of routes
  - Add name prefixes for named routes in groups
  - Support nested groups
- Named Routes with `.name()` method
  - Assign names to routes for URL generation
  - Generate URLs with `app.route(name, params)`
  - Check route existence with `app.hasRoute(name)`
  - List all routes with `app.getRoutes()`
  - Support query string parameters in URL generation
- Route Constraints with `.where()` method
  - Validate route parameters with regex patterns
  - Helper methods: `whereNumber()`, `whereAlpha()`, `whereAlphaNumeric()`, `whereUuid()`, `whereUlid()`, `whereIn()`
  - Support string or RegExp patterns
  - Multiple constraints per route
  - Constraints work with optional parameters
- Comprehensive test suites for groups, named routes, and constraints

## [0.0.2] - 2026-01-24

### Added

- Comprehensive middleware test suite (19 tests)
- Middleware documentation in README with examples:
  - Basic logging middleware
  - Error handling middleware
  - Authentication middleware pattern
  - Middleware chain execution order

### Verified

- Middleware pipeline executes in registration order (FR-016)
- `app.use(middleware)` adds middleware to pipeline (FR-015)
- Middleware can call `next()` for chain continuation
- Middleware can return early without calling `next()`
- Middleware can catch and handle errors from `next()`
- Middleware errors return 500 response

## [0.0.1] - 2026-01-24

### Added

- Initial release of `@bunary/http`
- `createApp()` factory function for creating Bunary applications
- HTTP method helpers: `get()`, `post()`, `put()`, `delete()`, `patch()`
- Path parameter extraction (`:param` syntax)
- Query parameter parsing via `ctx.query`
- Automatic JSON serialization for objects and arrays
- String responses returned as `text/plain`
- `null`/`undefined` returns converted to 204 No Content
- Response objects passed through unchanged
- `404 Not Found` for unregistered routes
- `405 Method Not Allowed` for wrong HTTP methods
- Error handling with 500 responses for uncaught exceptions
- `listen()` method for starting the Bun server
- `fetch()` method for testing without starting a server
- Full TypeScript type definitions with JSDoc documentation
- Exported types: `BunaryApp`, `BunaryServer`, `RequestContext`, `RouteHandler`, `Middleware`
