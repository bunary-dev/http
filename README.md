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

For createRouter options, route groups, middleware, named routes, and types, see [docs/index.md](./docs/index.md).

## License

MIT
