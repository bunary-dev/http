# Changelog

All notable changes to `@bunary/http` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-01-27

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
