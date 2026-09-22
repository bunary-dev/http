# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- `listen()` passes `development` and `error` through to `Bun.serve`, so Bun's development error page and a last-resort error handler are reachable without dropping to `Bun.serve` by hand (#68)

### Changed

- **BREAKING:** global middleware registered with `router.use()` now wraps **every** response the router produces — matched routes, 404, 405, the OPTIONS auto-response and error responses alike — so `cors()`, logging and tracing always run (#65)
  - The pipeline is now `global middleware → error boundary → dispatcher`. Global middleware therefore receives a `Response` from `next()` rather than the handler's raw return value, and a handler that throws reaches it as a 500 response instead of a thrown error. Group and route middleware are unchanged: they run inside the boundary and still see raw handler return values and thrown errors
  - Migration: a global middleware that spreads `await next()` (`{ ...result }`) or wraps it in `try`/`catch` should read the `Response` instead, or move to group middleware. An error thrown by a global middleware itself still reaches `onError`
- **BREAKING:** `Access-Control-Allow-Methods` on a preflight now advertises the methods the matched path actually serves instead of a fixed list; an explicit `cors({ methods })` still wins, and `cors()` composed outside a router keeps the previous default list (#66)
- **BREAKING:** `Allow` on OPTIONS and 405 responses now also names `OPTIONS`, and `HEAD` wherever a `GET` route exists, since the router serves both without them being registered. The `onMethodNotAllowed` callback still receives the registered methods only (#68)
- **BREAKING:** the root route `/` no longer matches `//`, which previously slipped past prefix-based checks in a fronting proxy. Non-root routes keep their optional trailing slash (#68)
- A CORS preflight for a path with no routes now falls through to the 404 handler (carrying CORS headers) rather than answering 204, so the caller sees the real status (#66)
- `normalizeHeadMethod()` removed from `src/handlers/head.ts` — dead since `resolveRoute()` took over the HEAD→GET fallback, and it cost two extra route-table scans (#68)

- **BREAKING:** the request-body readers moved from the context root onto `ctx.body` so that `ctx.json(data)` can be the response helper, matching Hono and Elysia (#76)
  - Migration: `await ctx.json()` → `await ctx.body.json()`; `await ctx.text()` → `await ctx.body.text()`; `await ctx.formData()` → `await ctx.body.formData()`. Generics and `BodyParseError` behaviour are unchanged, and `ctx.request` still exposes the underlying Web `Request` for streaming, `arrayBuffer()` and `blob()`. TypeScript catches every un-migrated call site: the new `ctx.json(data)` and `ctx.text(body)` require an argument, and `ctx.formData` no longer exists on the context

- **BREAKING:** `createApp()` is now `createRouter()`, the `BunaryApp` type is now `Router`, and `AppOptions` is now `RouterOptions` — no aliases are kept, since `@bunary/core` owns `createApp()` (#74)
  - Migration: `import { createApp } from "@bunary/http"` → `import { createRouter } from "@bunary/http"`; every other member (`get`/`post`/`put`/`patch`/`delete`, `use`, `group`, `route`, `hasRoute`, `getRoutes`, `listen`, `fetch`) is unchanged

### Fixed

- 404, 405 and 500 responses carry CORS headers again; previously a browser reported a CORS failure instead of the real status because `cors()` never ran for them (#65)
- `Vary: Origin` is now sent when an origin is **rejected**, not only when it is allowed — without it a shared cache could serve the no-CORS variant to an allowed origin, and vice versa (#66)
- `Vary` is appended rather than overwritten, so an upstream `Vary: Accept-Encoding` survives; preflight responses also vary on `Access-Control-Request-Method` and `Access-Control-Request-Headers`, and a name already present is not repeated (#66)
- A preflight now takes its group middleware from the route matching `Access-Control-Request-Method`; it previously used whichever route was registered first at that path, so a preflight for `POST /x` could pick up (or miss) middleware belonging to `GET /x` in another group (#66)
- HEAD responses set `Content-Length` to the length of the discarded body (RFC 9110), and HEAD 404/405 responses no longer carry a body (#68)
- `ctx.params` values are documented as being decoded after matching, so `%2F` yields a `/` inside a single-segment parameter — handlers doing file lookups must validate or constrain them (#68)

## [0.4.0] - 2026-09-21

### Changed

- **Requires Bun ≥ 1.4.0** (`engines.bun`); `.bun-version` pins 1.4.2 for CI and contributors (#71)
- Toolchain: `@types/bun` replaces `bun-types`, `typescript` ^7 and `@biomejs/biome` 2.5.1 pinned as devDependencies; `bun.lock` committed (#71)
- `tsconfig.json` aligned with Bun 1.4 `bun init` defaults (`module: Preserve`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`) (#71)
- CI: Bun version read from `.bun-version`, plus a non-required `bun latest` canary job; build job verifies the publish tarball with `bun pm pack --dry-run`; `actions/checkout@v7` (#71)
- Lint/format now cover `tests/` and call `tsc`/`biome` directly instead of `bunx`; per-file coverage threshold (35% lines / 45% functions — below the standard 90%, kept low because `src/handlers/head.ts` and `src/routes/find.ts` currently have thin coverage; Bun enforces the threshold per file, not just in aggregate) enforced via `bunfig.toml` (#71)

### Fixed

- `exports["."]` now lists `types` before `import` so TypeScript resolves the declarations; added `default` condition and `./package.json` subpath (#67)
- Added `publishConfig.access: public` and `sideEffects: false` (#71)
- Added missing `LICENSE` file (MIT) to the repo and the published tarball (#71)

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
