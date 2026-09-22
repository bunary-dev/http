# @bunary/http

Lightweight, type-safe HTTP framework for [Bun](https://bun.sh). Routes, middleware, groups, named routes, constraints, response helpers. Full reference: [docs/index.md](./docs/index.md).

Requires Bun ≥ 1.4.0.

## Installation

```bash
bun add @bunary/http
```

## Quick Start

```typescript
import { createRouter } from '@bunary/http';

const router = createRouter();
router.get('/hello', () => ({ message: 'Hello, Bun!' }));
router.post('/users', async (ctx) => {
  const user = await ctx.body.json<{ name: string }>();
  return ctx.json({ id: 1, name: user.name }, { status: 201 });
});
router.listen({ port: 3000 });
```

Response helpers (`json`, `text`, `html`, `redirect`, `status`) are on `ctx` and
exported standalone; the request body is read through `ctx.body.json()`,
`ctx.body.text()` and `ctx.body.formData()`.

## Cookies

`ctx.cookies` reads the incoming `Cookie` header and queues `Set-Cookie`
headers for the response — appended onto whatever `Response` the router
ultimately returns, including 404/405 and error responses.

```typescript
router.get('/login', (ctx) => {
  ctx.cookies.set('session', 'abc123', { httpOnly: true, path: '/' });
  return ctx.json({ ok: true });
});

router.get('/logout', (ctx) => {
  ctx.cookies.delete('session');
  return ctx.json({ ok: true });
});

router.get('/whoami', (ctx) => ctx.json({ session: ctx.cookies.get('session') }));
```

## Validation

An options object between the path and the handler validates `params`, `query`
and `body` with any [Standard Schema](https://standardschema.dev) validator (zod,
valibot, arktype, …) or a plain function:

```typescript
import { z } from 'zod';

router.post(
  '/users/:id',
  { params: z.object({ id: z.coerce.number() }), body: z.object({ name: z.string() }) },
  (ctx) => ctx.json({ id: ctx.params.id, name: ctx.body.name }), // number, string
);
```

A validated slot replaces its context value, so `ctx.body` *is* the validated
body; without a `body` schema it stays the `BodyReader`. A rejected schema
becomes a `422` problem document listing every issue. Validation needs
`@bunary/core` (`bun add @bunary/core`), which is an optional peer imported only
when a route declares schemas.

## Using with @bunary/core

```typescript
import { createApp } from '@bunary/core';
import { createRouter } from '@bunary/http';
import { httpProvider, serve } from '@bunary/http/provider';

const router = createRouter();
router.get('/', (ctx) => ctx.json({ app: ctx.app?.config.get('app.name') }));

const app = await createApp({
  config: { app: { name: 'my-api' }, http: { port: 3000 } },
  providers: [httpProvider(router)],
}).boot();

serve(app);
```

`@bunary/core` is an optional peer dependency, and the integration is published
on the `@bunary/http/provider` subpath only — importing the main barrel never
resolves it, so a standalone install keeps working. (Route validation reaches
for the same optional peer, but lazily, only when a route declares schemas.)

For createRouter options, route groups, middleware, named routes, and types, see [docs/index.md](./docs/index.md).

## License

MIT
