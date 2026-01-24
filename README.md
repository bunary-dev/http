# @bunary/http

A lightweight, type-safe HTTP framework built exclusively for [Bun](https://bun.sh).

Part of the [Bunary](https://github.com/bunary-dev) ecosystem - a Bun-first backend platform inspired by Laravel.

## Features

- 🚀 **Bun-native** - Uses `Bun.serve()` directly, no Node.js compatibility layer
- 📦 **Zero dependencies** - Only depends on `@bunary/core`
- 🔒 **Type-safe** - Full TypeScript support with strict types
- ⚡ **Fast** - Minimal overhead, direct routing
- 🧩 **Simple API** - Chainable route registration with automatic JSON serialization

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

Query parameters are parsed from the URL:

```typescript
app.get('/search', (ctx) => {
  const { q, page, limit } = ctx.query;
  return { query: q, page, limit };
});
```

### Request Context

Route handlers receive a `RequestContext` object:

```typescript
interface RequestContext {
  request: Request;  // Original Bun Request object
  params: Record<string, string>;  // Path parameters
  query: Record<string, string>;   // Query parameters
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

```typescript
const server = app.listen({ port: 3000, hostname: 'localhost' });

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

## Error Handling

Uncaught errors in handlers return a 500 response:

```typescript
app.get('/error', () => {
  throw new Error('Something went wrong');
});

// Returns: 500 Internal Server Error
// Body: { error: "Internal Server Error" }
```

## Types

All types are exported for TypeScript users:

```typescript
import type { 
  BunaryApp, 
  BunaryServer,
  RequestContext, 
  RouteHandler,
  Middleware 
} from '@bunary/http';
```

## Requirements

- Bun ≥ 1.0.0

## License

MIT
