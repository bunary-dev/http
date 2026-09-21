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
- 🔀 **CORS** - Built-in CORS middleware with configurable origins, methods, headers, and credentials

## Installation

```bash
bun add @bunary/http
```

## Quick Start

```typescript
import { createRouter } from '@bunary/http';

const router = createRouter();

router.get('/hello', () => ({ message: 'Hello, Bun!' }));

router.listen({ port: 3000 });
```

## API

### `createRouter(options?)`

Creates a new Bunary router instance.

```typescript
import { createRouter } from '@bunary/http';

// Without basePath
const router = createRouter();

// With basePath (prefixes all routes)
const apiRouter = createRouter({ basePath: '/api' });
apiRouter.get('/users', () => ({})); // Matches /api/users
```

**Options:**
- `basePath` - Optional base path prefix for all routes (useful when mounting behind a reverse proxy)
  - Automatically normalized (leading slash added, trailing slash removed)
  - Composes with route groups: `basePath + group prefix + route path`
  - Included in `router.route()` URL generation
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
const router = createRouter({
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

Pass a type parameter to `createRouter()` to get type-safe `ctx.locals`:

```typescript
interface AppLocals {
  user: { id: number; name: string };
  requestId: string;
}

const router = createRouter<AppLocals>();

router.use(async (ctx, next) => {
  ctx.locals.user = await getUser(ctx.request);  // typed
  ctx.locals.requestId = crypto.randomUUID();     // typed
  return next();
});

router.get('/me', (ctx) => ({
  name: ctx.locals.user.name,       // typed as string
  requestId: ctx.locals.requestId,  // typed as string
}));
```

The generic defaults to `Record<string, unknown>`, so existing code is fully backward-compatible.

### Route Registration

Register routes using chainable HTTP method helpers:

```typescript
router
  .get('/users', () => ({ users: [] }))
  .post('/users', async (ctx) => {
    const body = await ctx.json();
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
router.get('/users/:id', (ctx) => {
  return { userId: ctx.params.id };
});

router.get('/posts/:postId/comments/:commentId', (ctx) => {
  const { postId, commentId } = ctx.params;
  return { postId, commentId };
});
```

#### Typed Parameters

Pass a type parameter to any route method for typed `ctx.params`:

```typescript
router.get<{ id: string }>('/users/:id', (ctx) => {
  ctx.params.id;  // string (not string | undefined)
  return { userId: ctx.params.id };
});

router.get<{ org: string; repo: string }>('/orgs/:org/repos/:repo', (ctx) => {
  ctx.params.org;   // string
  ctx.params.repo;  // string
  return { org: ctx.params.org, repo: ctx.params.repo };
});

// Optional params
router.get<{ format?: string }>('/data/:format?', (ctx) => {
  return { format: ctx.params.format ?? 'json' };
});
```

Values remain strings at runtime — no automatic coercion. The generic only narrows the TypeScript type.

When no type parameter is provided, `ctx.params` defaults to `Record<string, string | undefined>`.

#### URL Encoding and Unicode

Path parameters are automatically decoded from their URL-encoded form:

```typescript
router.get('/users/:name', (ctx) => {
  return { name: ctx.params.name };
});

// GET /users/hello%20world → { name: "hello world" }
// GET /users/caf%C3%A9     → { name: "café" }
// GET /users/日本語         → { name: "日本語" }
```

Encoded slashes (`%2F`) are captured within a single segment and decoded:

```typescript
router.get('/files/:path', (ctx) => {
  return { path: ctx.params.path };
});

// GET /files/dir%2Ffile.txt → { path: "dir/file.txt" }
```

> **Note:** Route constraints (`.where()`) are checked against the **decoded** parameter value.

### Query Parameters

Query parameters are accessed via `URLSearchParams` API:

```typescript
router.get('/search', (ctx) => {
  const q = ctx.query.get('q');
  const page = ctx.query.get('page');
  const limit = ctx.query.get('limit');
  return { query: q, page, limit };
});
```

For multi-value query parameters (e.g., `?tag=a&tag=b`), use `getAll()`:

```typescript
router.get('/filter', (ctx) => {
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
  locals: TLocals;   // Per-request storage (narrowed by createRouter generic)

  // Body parsing helpers
  json<T = unknown>(): Promise<T>;     // Parse JSON body (throws BodyParseError)
  text(): Promise<string>;             // Get body as string
  formData(): Promise<FormData>;       // Parse form data (throws BodyParseError)
}
```

#### Body Parsing Helpers

`ctx.json()`, `ctx.text()`, and `ctx.formData()` are thin wrappers around the underlying `Request` methods with improved error handling:

```typescript
// Parse JSON with type inference
router.post('/users', async (ctx) => {
  const body = await ctx.json<{ name: string; email: string }>();
  return { id: 1, name: body.name, email: body.email };
});

// Get raw text body
router.post('/webhooks', async (ctx) => {
  const payload = await ctx.text();
  return { received: payload.length };
});

// Parse form data
router.post('/upload', async (ctx) => {
  const form = await ctx.formData();
  const name = form.get('name');
  return { name };
});
```

Malformed bodies throw `BodyParseError`, which you can catch for custom error responses:

```typescript
import { BodyParseError } from '@bunary/http';

router.post('/users', async (ctx) => {
  try {
    return await ctx.json();
  } catch (error) {
    if (error instanceof BodyParseError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw error;
  }
});
```

> The original `ctx.request` is still available for advanced use cases (e.g. streaming, `arrayBuffer()`, `blob()`).
> Note: per the Fetch API, the request body can only be consumed once. If middleware calls `ctx.json()`, `ctx.text()`, or `ctx.formData()`, the downstream handler cannot read the body again; instead, share the parsed data via `ctx.locals` or work with a cloned request if you need to access the body in multiple places.

`TLocals` is set once via `createRouter<TLocals>()` and flows to all handlers and middleware.
`TParams` is set per-route via `router.get<TParams>()` and only affects that handler's `ctx.params`.

Both default to their untyped forms for full backward compatibility.

### HTTP Method Handling

#### HEAD Requests

HEAD requests are automatically handled for GET routes. They return the same status code and headers as the corresponding GET request, but with an empty body:

```typescript
router.get('/users', () => ({ users: [] }));

// HEAD /users returns 200 with empty body
// Preserves all headers from GET handler
```

#### OPTIONS Requests

OPTIONS requests return `204 No Content` with an `Allow` header listing all permitted methods for the path:

```typescript
router.get('/users', () => ({}));
router.post('/users', () => ({}));
router.delete('/users', () => ({}));

// OPTIONS /users returns:
// Status: 204
// Allow: DELETE, GET, POST
```

If no route matches the path, OPTIONS returns `404`.

#### Method Not Allowed (405)

When a path exists but the requested method is not allowed, the response includes an `Allow` header:

```typescript
router.get('/users', () => ({}));
router.post('/users', () => ({}));

// PUT /users returns:
// Status: 405 Method Not Allowed
// Allow: GET, POST
```

### Response Handling

Handlers can return various types - they're automatically serialized:

```typescript
// Objects/Arrays → JSON with Content-Type: application/json
router.get('/json', () => ({ data: 'value' }));

// Strings → text/plain
router.get('/text', () => 'Hello, world!');

// Response objects passed through unchanged
router.get('/custom', () => new Response('Custom', { status: 201 }));

// null/undefined → 204 No Content
router.get('/empty', () => null);
```

### Starting the Server

Both object and positional forms are supported:

```typescript
// Object form (recommended)
const server = router.listen({ port: 3000, hostname: 'localhost' });

// Positional form
const server = router.listen(3000, 'localhost');

console.log(`Server running on ${server.hostname}:${server.port}`);

// Stop the server when done
server.stop();
```

### Testing Without Server

Use `router.fetch()` to test handlers directly:

```typescript
const router = createRouter();
router.get('/hello', () => ({ message: 'hi' }));

const response = await router.fetch(new Request('http://localhost/hello'));
const data = await response.json();
// { message: 'hi' }
```

## Middleware

Add middleware to handle cross-cutting concerns like logging, authentication, and error handling.

### Basic Middleware

```typescript
// Logging middleware
router.use(async (ctx, next) => {
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
router
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
router.use(async (ctx, next) => {
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
router.use(async (ctx, next) => {
  const token = ctx.request.headers.get('Authorization');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  // Validate token...
  return await next();
});
```

### CORS Middleware

Built-in CORS middleware handles preflight `OPTIONS` requests and adds the appropriate headers to actual responses.

```typescript
import { createRouter, cors } from '@bunary/http';

const router = createRouter();

// Allow any origin (default)
router.use(cors());
```

#### Configuration

```typescript
router.use(cors({
  origin: 'https://myapp.com',             // string, string[], or "*" (default)
  methods: ['GET', 'POST'],                 // default: GET, HEAD, PUT, POST, DELETE, PATCH
  allowHeaders: ['Content-Type', 'X-Token'], // default: reflects Access-Control-Request-Headers
  exposeHeaders: ['X-Request-Id'],          // headers the browser may read from the response
  credentials: true,                        // include Access-Control-Allow-Credentials
  maxAge: 86400,                            // preflight cache duration in seconds
}));
```

#### Multiple Origins

```typescript
router.use(cors({
  origin: ['https://app1.com', 'https://app2.com'],
  credentials: true,
}));
```

When `origin` is a string or array (not `"*"`), a `Vary: Origin` header is included automatically so caches distinguish responses per origin.

#### Per-Group CORS

Apply CORS to specific route groups instead of globally:

```typescript
router.group({ prefix: '/api', middleware: [cors()] }, (api) => {
  api.get('/users', () => ({ users: [] }));
});
```

## Route Groups

Group routes together with shared prefixes, middleware, and name prefixes.

### Basic Groups

```typescript
// Simple prefix
router.group('/api', (api) => {
  api.get('/users', () => ({ users: [] }));     // /api/users
  api.get('/posts', () => ({ posts: [] }));     // /api/posts
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

router.group({
  prefix: '/admin',
  middleware: [authMiddleware],
  name: 'admin.'
}, (admin) => {
  admin.get('/dashboard', () => ({})).name('dashboard');  // name: admin.dashboard
  admin.get('/users', () => ({})).name('users');          // name: admin.users
});
```

### Nested Groups

```typescript
router.group('/api', (api) => {
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
router.get('/users/:id', (ctx) => ({})).name('users.show');
router.get('/posts/:slug', (ctx) => ({})).name('posts.show');
```

### Generating URLs

```typescript
// Basic URL generation
const url = router.route('users.show', { id: 42 });
// "/users/42"

// With query string
const searchUrl = router.route('users.show', { id: 42, tab: 'profile' });
// "/users/42?tab=profile"

// Check if route exists
if (router.hasRoute('users.show')) {
  // ...
}

// List all routes
const routes = router.getRoutes();
// [{ name: 'users.show', method: 'GET', path: '/users/:id' }, ...]
```

## Route Constraints

Add regex constraints to validate route parameters.

### Basic Constraints

```typescript
// Only match if :id is numeric
router.get('/users/:id', (ctx) => ({}))
  .where('id', /^\d+$/);

// Using string pattern
router.get('/posts/:slug', (ctx) => ({}))
  .where('slug', '^[a-z0-9-]+$');

// Multiple constraints
router.get('/users/:id/posts/:postId', (ctx) => ({}))
  .where({ id: /^\d+$/, postId: /^\d+$/ });
```

### Helper Methods

```typescript
// whereNumber - digits only
router.get('/users/:id', () => ({})).whereNumber('id');

// whereAlpha - letters only (a-zA-Z)
router.get('/categories/:name', () => ({})).whereAlpha('name');

// whereAlphaNumeric - letters and digits
router.get('/codes/:code', () => ({})).whereAlphaNumeric('code');

// whereUuid - UUID format
router.get('/items/:uuid', () => ({})).whereUuid('uuid');

// whereUlid - ULID format
router.get('/records/:ulid', () => ({})).whereUlid('ulid');

// whereIn - specific allowed values
router.get('/status/:status', () => ({})).whereIn('status', ['active', 'pending', 'archived']);
```

### Chaining Constraints

```typescript
router.get('/users/:id/posts/:slug', (ctx) => ({}))
  .whereNumber('id')
  .whereAlpha('slug')
  .name('users.posts');
```

## Optional Parameters

Use `?` to mark route parameters as optional.

```typescript
// :id is optional
router.get('/users/:id?', (ctx) => {
  if (ctx.params.id) {
    return { user: ctx.params.id };
  }
  return { users: [] };
});

// Multiple optional params
router.get('/archive/:year?/:month?', (ctx) => {
  const { year, month } = ctx.params;
  // year and month may be undefined
  return { year, month };
});

// Constraints work with optional params
router.get('/posts/:id?', (ctx) => ({})).whereNumber('id');
```

## Wildcard Routes

End a route path with `/*` or `/**` to create a catch-all route. The remaining path is captured as `ctx.params["*"]`.

```typescript
// SPA fallback — serves index.html for any unmatched path
router.get('/*', (ctx) => {
  return new Response(Bun.file('public/index.html'));
});

// Static file serving (with path traversal protection)
router.get('/assets/*', (ctx) => {
  const filePath = ctx.params['*'];
  if (!filePath) return new Response('Not Found', { status: 404 });

  const resolved = Bun.resolveSync(`public/${filePath}`, process.cwd());
  const root = Bun.resolveSync('public', process.cwd());
  if (!resolved.startsWith(root)) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(Bun.file(resolved));
});

// GET /assets/css/style.css → ctx.params["*"] = "css/style.css"
// GET /assets/js/router.js     → ctx.params["*"] = "js/router.js"
// GET /assets               → ctx.params["*"] = undefined
```

`/*` and `/**` behave identically — `/**` is a visual convention to signal deep matching.

### Wildcards with Named Parameters

Combine named parameters and a trailing wildcard:

```typescript
router.get('/users/:id/*', (ctx) => {
  const { id } = ctx.params;
  const remaining = ctx.params['*'];
  return { id, path: remaining };
});

// GET /users/42/docs/readme.md → { id: "42", path: "docs/readme.md" }
```

### Wildcards in Groups

Wildcard routes compose with group prefixes and `basePath`:

```typescript
router.group('/api', (api) => {
  api.get('/proxy/*', async (ctx) => {
    const target = ctx.params['*'];
    return fetch(`https://backend.example.com/${target}`);
  });
});

// GET /api/proxy/v2/users → target = "v2/users"
```

### Route Priority

Routes match in registration order (first match wins). Register specific routes before wildcard catch-alls:

```typescript
router.get('/assets/manifest.json', (ctx) => ({ type: 'manifest' }));
router.get('/assets/*', (ctx) => {
  return new Response(Bun.file(`public/${ctx.params['*']}`));
});

// GET /assets/manifest.json → hits the specific route
// GET /assets/style.css     → hits the wildcard
```

### Wildcard URL Generation

Named wildcard routes support URL generation via `router.route()`. Pass the `"*"` param for the remaining path:

```typescript
router.get('/assets/*', () => ({})).name('assets');

router.route('assets', { '*': 'css/style.css' }); // → "/assets/css/style.css"
router.route('assets');                            // → "/assets"
```

> **Note:** The wildcard must appear at the end of the path. A `*` in the middle of a path (e.g., `/*/foo`) throws an error.

## Error Handling

Uncaught errors in handlers return a 500 response. The default error handler is environment-aware:

- **Production** (`NODE_ENV=production`): Returns a generic `"Internal Server Error"` message to avoid leaking sensitive details like database errors, file paths, or stack traces.
- **Development/Test** (any other `NODE_ENV`): Returns the full `error.message` for easier debugging.

For full control, use a custom `onError` handler:

```typescript
createRouter({
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
  Router, 
  BunaryServer,
  RequestContext, 
  RouteHandler,
  Middleware,
  RouteBuilder,
  GroupOptions,
  GroupRouter,
  GroupCallback,
  RouteInfo,
  CorsOptions,
} from '@bunary/http';
```

## Requirements

- Bun ≥ 1.4.0

## License

MIT