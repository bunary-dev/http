# @bunary/http

A lightweight, type-safe HTTP framework built exclusively for [Bun](https://bun.sh).

Part of the [Bunary](https://github.com/bunary-dev) ecosystem - a Bun-first backend platform inspired by Laravel.

## Documentation

Canonical documentation for this package lives in [`docs/index.md`](./docs/index.md).

## Features

- 🚀 **Bun-native** - Uses `Bun.serve()` directly, no Node.js compatibility layer
- 📦 **Zero dependencies** - Only depends on `@bunary/core`
- 🔒 **Type-safe** - Full TypeScript support with strict types
- ⚡ **Fast** - Minimal overhead, direct routing
- 🧩 **Simple API** - Chainable route registration with automatic JSON serialization
- 📂 **Route Groups** - Organize routes with shared prefixes, middleware, and name prefixes
- 🏷️ **Named Routes** - URL generation with route names
- ✅ **Route Constraints** - Validate parameters with regex patterns
- ❓ **Optional Parameters** - Flexible routes with optional path segments

## Installation

```bash
bun add @bunary/http
```

## Quick Start

```typescript
import { createApp } from '@bunary/http';

const app = createApp();

app.get('/hello', () => ({ message: 'Hello, Bun!' }));

app.listen({ port: 3000 });
```

## API

### `createApp()`

Creates a new Bunary application instance.

```typescript
import { createApp } from '@bunary/http';

const app = createApp();
```

### Route Registration

Register routes using chainable HTTP method helpers:

```typescript
app
  .get('/users', () => ({ users: [] }))
  .post('/users', async (ctx) => {
    const body = await ctx.request.json();
    return { id: 1, ...body };
  })
  .put('/users/:id', (ctx) => {
    return { id: ctx.params.id, updated: true };
  })
  .delete('/users/:id', (ctx) => {
    return { deleted: ctx.params.id };
  })
  .patch('/users/:id', (ctx) => {
    return { patched: ctx.params.id };
  });
```

### Path Parameters

Path parameters are extracted automatically:

```typescript
app.get('/users/:id', (ctx) => {
  return { userId: ctx.params.id };
});

app.get('/posts/:postId/comments/:commentId', (ctx) => {
  const { postId, commentId } = ctx.params;
  return { postId, commentId };
});
```

### Query Parameters

Query parameters are accessed via `URLSearchParams` API:

```typescript
app.get('/search', (ctx) => {
  const q = ctx.query.get('q');
  const page = ctx.query.get('page');
  const limit = ctx.query.get('limit');
  return { query: q, page, limit };
});
```

For multi-value query parameters (e.g., `?tag=a&tag=b`), use `getAll()`:

```typescript
app.get('/filter', (ctx) => {
  const tags = ctx.query.getAll('tag');
  return { tags };
});
```

### Request Context

Route handlers receive a `RequestContext` object:

```typescript
interface RequestContext {
  request: Request;  // Original Bun Request object
  params: Record<string, string>;  // Path parameters
  query: URLSearchParams;  // Query parameters (use .get() and .getAll())
}
```

### Response Handling

Handlers can return various types - they're automatically serialized:

```typescript
// Objects/Arrays → JSON with Content-Type: application/json
app.get('/json', () => ({ data: 'value' }));

// Strings → text/plain
app.get('/text', () => 'Hello, world!');

// Response objects passed through unchanged
app.get('/custom', () => new Response('Custom', { status: 201 }));

// null/undefined → 204 No Content
app.get('/empty', () => null);
```

### Starting the Server

Both object and positional forms are supported:

```typescript
// Object form (recommended)
const server = app.listen({ port: 3000, hostname: 'localhost' });

// Positional form
const server = app.listen(3000, 'localhost');

console.log(`Server running on ${server.hostname}:${server.port}`);

// Stop the server when done
server.stop();
```

### Testing Without Server

Use `app.fetch()` to test handlers directly:

```typescript
const app = createApp();
app.get('/hello', () => ({ message: 'hi' }));

const response = await app.fetch(new Request('http://localhost/hello'));
const data = await response.json();
// { message: 'hi' }
```

## Middleware

Add middleware to handle cross-cutting concerns like logging, authentication, and error handling.

### Basic Middleware

```typescript
// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  const result = await next();
  console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname} - ${Date.now() - start}ms`);
  return result;
});
```

### Middleware Chain

Middleware executes in registration order. Each middleware can:
- Run code before calling `next()`
- Call `next()` to continue the chain
- Run code after `next()` returns
- Return early without calling `next()`

```typescript
app
  .use(async (ctx, next) => {
    console.log('First - before');
    const result = await next();
    console.log('First - after');
    return result;
  })
  .use(async (ctx, next) => {
    console.log('Second - before');
    const result = await next();
    console.log('Second - after');
    return result;
  });

// Output order: First-before, Second-before, handler, Second-after, First-after
```

### Error Handling Middleware

```typescript
app.use(async (ctx, next) => {
  try {
    return await next();
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

### Auth Middleware (Example)

```typescript
app.use(async (ctx, next) => {
  const token = ctx.request.headers.get('Authorization');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  // Validate token...
  return await next();
});
```

## Route Groups

Group routes together with shared prefixes, middleware, and name prefixes.

### Basic Groups

```typescript
// Simple prefix
app.group('/api', (router) => {
  router.get('/users', () => ({ users: [] }));     // /api/users
  router.get('/posts', () => ({ posts: [] }));     // /api/posts
});
```

### Groups with Options

```typescript
// Auth middleware for protected routes
const authMiddleware = async (ctx, next) => {
  const token = ctx.request.headers.get('Authorization');
  if (!token) return new Response('Unauthorized', { status: 401 });
  return await next();
};

app.group({
  prefix: '/admin',
  middleware: [authMiddleware],
  name: 'admin.'
}, (router) => {
  router.get('/dashboard', () => ({})).name('dashboard');  // name: admin.dashboard
  router.get('/users', () => ({})).name('users');          // name: admin.users
});
```

### Nested Groups

```typescript
app.group('/api', (api) => {
  api.group('/v1', (v1) => {
    v1.get('/users', () => ({}));  // /api/v1/users
  });
  api.group('/v2', (v2) => {
    v2.get('/users', () => ({}));  // /api/v2/users
  });
});
```

## Named Routes

Assign names to routes for URL generation.

### Naming Routes

```typescript
app.get('/users/:id', (ctx) => ({})).name('users.show');
app.get('/posts/:slug', (ctx) => ({})).name('posts.show');
```

### Generating URLs

```typescript
// Basic URL generation
const url = app.route('users.show', { id: 42 });
// "/users/42"

// With query string
const searchUrl = app.route('users.show', { id: 42, tab: 'profile' });
// "/users/42?tab=profile"

// Check if route exists
if (app.hasRoute('users.show')) {
  // ...
}

// List all routes
const routes = app.getRoutes();
// [{ name: 'users.show', method: 'GET', path: '/users/:id' }, ...]
```

## Route Constraints

Add regex constraints to validate route parameters.

### Basic Constraints

```typescript
// Only match if :id is numeric
app.get('/users/:id', (ctx) => ({}))
  .where('id', /^\d+$/);

// Using string pattern
app.get('/posts/:slug', (ctx) => ({}))
  .where('slug', '^[a-z0-9-]+$');

// Multiple constraints
app.get('/users/:id/posts/:postId', (ctx) => ({}))
  .where({ id: /^\d+$/, postId: /^\d+$/ });
```

### Helper Methods

```typescript
// whereNumber - digits only
app.get('/users/:id', () => ({})).whereNumber('id');

// whereAlpha - letters only (a-zA-Z)
app.get('/categories/:name', () => ({})).whereAlpha('name');

// whereAlphaNumeric - letters and digits
app.get('/codes/:code', () => ({})).whereAlphaNumeric('code');

// whereUuid - UUID format
app.get('/items/:uuid', () => ({})).whereUuid('uuid');

// whereUlid - ULID format
app.get('/records/:ulid', () => ({})).whereUlid('ulid');

// whereIn - specific allowed values
app.get('/status/:status', () => ({})).whereIn('status', ['active', 'pending', 'archived']);
```

### Chaining Constraints

```typescript
app.get('/users/:id/posts/:slug', (ctx) => ({}))
  .whereNumber('id')
  .whereAlpha('slug')
  .name('users.posts');
```

## Optional Parameters

Use `?` to mark route parameters as optional.

```typescript
// :id is optional
app.get('/users/:id?', (ctx) => {
  if (ctx.params.id) {
    return { user: ctx.params.id };
  }
  return { users: [] };
});

// Multiple optional params
app.get('/archive/:year?/:month?', (ctx) => {
  const { year, month } = ctx.params;
  // year and month may be undefined
  return { year, month };
});

// Constraints work with optional params
app.get('/posts/:id?', (ctx) => ({})).whereNumber('id');
```

## Error Handling

Uncaught errors in handlers return a 500 response with the error message:

```typescript
app.get('/error', () => {
  throw new Error('Something went wrong');
});

// Returns: 500 Internal Server Error
// Body: { error: "Something went wrong" }
```

## Types

All types are exported for TypeScript users:

```typescript
import type { 
  BunaryApp, 
  BunaryServer,
  RequestContext, 
  RouteHandler,
  Middleware,
  RouteBuilder,
  GroupOptions,
  GroupRouter,
  GroupCallback,
  RouteInfo
} from '@bunary/http';
```

## Requirements

- Bun ≥ 1.0.0

## License

MIT
