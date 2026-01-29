# @bunary/http

Lightweight, type-safe HTTP framework for [Bun](https://bun.sh). Routes, middleware, groups, named routes, constraints. Full reference: [docs/index.md](./docs/index.md).

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

For createApp options, route groups, middleware, named routes, and types, see [docs/index.md](./docs/index.md).

## License

MIT
