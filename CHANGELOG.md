# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
