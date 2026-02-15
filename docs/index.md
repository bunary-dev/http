# @bunary/http

A lightweight, type-safe HTTP framework built exclusively for [Bun](https://bun.sh).

Part of the [Bunary](https://github.com/bunary-dev) ecosystem: a Bun-first backend platform inspired by Laravel.

## Features

- 🚀 **Bun-native** - Uses `Bun.serve()` directly, no Node.js compatibility layer
- 📦 **Zero dependencies** - No runtime dependencies
- 🔒 **Type-safe** - Full TypeScript support with strict types
- ⚡ **Fast** - Minimal overhead, direct routing
- 🧩 **Simple API** - Chainable route registration with automatic JSON serialization
- 📂 **Route Groups** - Organize routes with shared prefixes, middleware, and name prefixes
- 🏷️ **Named Routes** - URL generation with route names
- ✅ **Route Constraints** - Validate parameters with regex patterns
- ❓ **Optional Parameters** - Flexible routes with optional path segments
- 🌐 **Wildcard Routes** - Catch-all `/*` and `/**` patterns for SPA fallbacks and proxies

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

### `createApp(options?)`

Creates a new Bunary application instance.

```typescript
import { createApp } from '@bunary/http';

// Without basePath
const app = createApp();

// With basePath (prefixes all routes)
const apiApp = createApp({ basePath: '/api' });
apiApp.get('/users', () => ({})); // Matches /api/users
```

**Options:**
- `basePath` - Optional base path prefix for all routes (useful when mounting behind a reverse proxy)
  - Automatically normalized (leading slash added, trailing slash removed)
  - Composes with route groups: `basePath + group prefix + route path`
  - Included in `app.route()` URL generation
- `onNotFound` - Custom handler for 404 Not Found responses
  - Called when no route matches the request path
  - Receives `RequestContext` (params empty, query available)
  - Can return `Response` or `HandlerResponse`
- `onMethodNotAllowed` - Custom handler for 405 Method Not Allowed responses
  - Called when a route matches the path but not the HTTP method
  - Receives `RequestContext` and array of allowed methods
  - Can return `Response` or `HandlerResponse`
  - `Allow` header is automatically added if not present
- `onError` - Custom handler for 500 Internal Server Error responses
  - Called when a route handler or middleware throws an error
  - Receives `RequestContext` and the error object
  - Can return `Response` or `HandlerResponse`
  - If not provided, the default handler hides error details in production

**Example with custom error handlers:**

```typescript
const app = createApp({
  basePath: '/api',
  onNotFound: (ctx) => {
    return new Response('Not Found', { status: 404 });
  },
  onMethodNotAllowed: (ctx, allowed) => {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  },
  onError: (ctx, error) => {
    console.error('Request error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
```

#### Typed Locals

Pass a type parameter to `createApp()` to get type-safe `ctx.locals`:

```typescript
interface AppLocals {
  user: { id: number; name: string };
  requestId: string;
}

const app = createApp<AppLocals>();

app.use(async (ctx, next) => {
  ctx.locals.user = await getUser(ctx.request);  // typed
  ctx.locals.requestId = crypto.randomUUID();     // typed
  return next();
});

app.get('/me', (ctx) => ({
  name: ctx.locals.user.name,       // typed as string
  requestId: ctx.locals.requestId,  // typed as string
}));
```

The generic defaults to `Record<string, unknown>`, so existing code is fully backward-compatible.

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

Path parameters are extracted automatically and decoded with `decodeURIComponent`:

```typescript
app.get('/users/:id', (ctx) => {
  return { userId: ctx.params.id };
});

app.get('/posts/:postId/comments/:commentId', (ctx) => {
  const { postId, commentId } = ctx.params;
  return { postId, commentId };
});
```

#### Typed Parameters

Pass a type parameter to any route method for typed `ctx.params`:

```typescript
app.get<{ id: string }>('/users/:id', (ctx) => {
  ctx.params.id;  // string (not string | undefined)
  return { userId: ctx.params.id };
});

app.get<{ org: string; repo: string }>('/orgs/:org/repos/:repo', (ctx) => {
  ctx.params.org;   // string
  ctx.params.repo;  // string
  return { org: ctx.params.org, repo: ctx.params.repo };
});

// Optional params
app.get<{ format?: string }>('/data/:format?', (ctx) => {
  return { format: ctx.params.format ?? 'json' };
});
```

Values remain strings at runtime — no automatic coercion. The generic only narrows the TypeScript type.

When no type parameter is provided, `ctx.params` defaults to `Record<string, string | undefined>`.

#### URL Encoding and Unicode

Path parameters are automatically decoded from their URL-encoded form:

```typescript
app.get('/users/:name', (ctx) => {
  return { name: ctx.params.name };
});

// GET /users/hello%20world → { name: "hello world" }
// GET /users/caf%C3%A9     → { name: "café" }
// GET /users/日本語         → { name: "日本語" }
```

Encoded slashes (`%2F`) are captured within a single segment and decoded:

```typescript
app.get('/files/:path', (ctx) => {
  return { path: ctx.params.path };
});

// GET /files/dir%2Ffile.txt → { path: "dir/file.txt" }
```

> **Note:** Route constraints (`.where()`) are checked against the **decoded** parameter value.

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

Route handlers receive a `RequestContext<TLocals, TParams>` object:

```typescript
interface RequestContext<
  TLocals extends object = Record<string, unknown>,
  TParams extends PathParams = PathParams,
> {
  request: Request;  // Original Bun Request object
  params: TParams;   // Path parameters (narrowed by route generic)
  query: URLSearchParams;  // Query parameters (use .get() and .getAll())
  locals: TLocals;   // Per-request storage (narrowed by createApp generic)
}
```

`TLocals` is set once via `createApp<TLocals>()` and flows to all handlers and middleware.
`TParams` is set per-route via `app.get<TParams>()` and only affects that handler's `ctx.params`.

Both default to their untyped forms for full backward compatibility.

### HTTP Method Handling

#### HEAD Requests

HEAD requests are automatically handled for GET routes. They return the same status code and headers as the corresponding GET request, but with an empty body:

```typescript
app.get('/users', () => ({ users: [] }));

// HEAD /users returns 200 with empty body
// Preserves all headers from GET handler
```

#### OPTIONS Requests

OPTIONS requests return `204 No Content` with an `Allow` header listing all permitted methods for the path:

```typescript
app.get('/users', () => ({}));
app.post('/users', () => ({}));
app.delete('/users', () => ({}));

// OPTIONS /users returns:
// Status: 204
// Allow: DELETE, GET, POST
```

If no route matches the path, OPTIONS returns `404`.

#### Method Not Allowed (405)

When a path exists but the requested method is not allowed, the response includes an `Allow` header:

```typescript
app.get('/users', () => ({}));
app.post('/users', () => ({}));

// PUT /users returns:
// Status: 405 Method Not Allowed
// Allow: GET, POST
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
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
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

## Wildcard Routes

End a route path with `/*` or `/**` to create a catch-all route. The remaining path is captured as `ctx.params["*"]`.

```typescript
// SPA fallback — serves index.html for any unmatched path
app.get('/*', (ctx) => {
  return new Response(Bun.file('public/index.html'));
});

// Static file serving
app.get('/assets/*', (ctx) => {
  const filePath = ctx.params['*'];
  if (!filePath) return new Response('Not Found', { status: 404 });
  return new Response(Bun.file(`public/${filePath}`));
});

// GET /assets/css/style.css → ctx.params["*"] = "css/style.css"
// GET /assets/js/app.js     → ctx.params["*"] = "js/app.js"
// GET /assets               → ctx.params["*"] = undefined
```

`/*` and `/**` behave identically — `/**` is a visual convention to signal deep matching.

### Wildcards with Named Parameters

Combine named parameters and a trailing wildcard:

```typescript
app.get('/users/:id/*', (ctx) => {
  const { id } = ctx.params;
  const remaining = ctx.params['*'];
  return { id, path: remaining };
});

// GET /users/42/docs/readme.md → { id: "42", path: "docs/readme.md" }
```

### Wildcards in Groups

Wildcard routes compose with group prefixes and `basePath`:

```typescript
app.group('/api', (router) => {
  router.get('/proxy/*', async (ctx) => {
    const target = ctx.params['*'];
    return fetch(`https://backend.example.com/${target}`);
  });
});

// GET /api/proxy/v2/users → target = "v2/users"
```

### Route Priority

Routes match in registration order (first match wins). Register specific routes before wildcard catch-alls:

```typescript
app.get('/assets/manifest.json', (ctx) => ({ type: 'manifest' }));
app.get('/assets/*', (ctx) => {
  return new Response(Bun.file(`public/${ctx.params['*']}`));
});

// GET /assets/manifest.json → hits the specific route
// GET /assets/style.css     → hits the wildcard
```

### Wildcard URL Generation

Named wildcard routes support URL generation via `app.route()`. Pass the `"*"` param for the remaining path:

```typescript
app.get('/assets/*', () => ({})).name('assets');

app.route('assets', { '*': 'css/style.css' }); // → "/assets/css/style.css"
app.route('assets');                            // → "/assets"
```

> **Note:** The wildcard must appear at the end of the path. A `*` in the middle of a path (e.g., `/*/foo`) throws an error.

## Error Handling

Uncaught errors in handlers return a 500 response. The default error handler is environment-aware:

- **Production** (`NODE_ENV=production`): Returns a generic `"Internal Server Error"` message to avoid leaking sensitive details like database errors, file paths, or stack traces.
- **Development/Test** (any other `NODE_ENV`): Returns the full `error.message` for easier debugging.

For full control, use a custom `onError` handler:

```typescript
createApp({
  onError: (ctx, error) => {
    console.error('Request error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
});
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