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

For createRouter options, route groups, middleware, named routes, and types, see [docs/index.md](./docs/index.md).

## License

MIT
