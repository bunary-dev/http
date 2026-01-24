# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
