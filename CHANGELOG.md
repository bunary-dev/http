# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
