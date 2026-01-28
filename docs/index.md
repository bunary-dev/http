# @bunary/http

A lightweight, type-safe HTTP framework built exclusively for [Bun](https://bun.sh).

Part of the [Bunary](https://github.com/bunary-dev) ecosystem — a Bun-first backend platform inspired by Laravel.

## Installation

```bash
bun add @bunary/http
```

## Quickstart

```ts
import { createApp } from "@bunary/http";

const app = createApp();

app.get("/hello", () => ({ message: "Hello, Bun!" }));

app.listen({ port: 3000 });
```

## Notes

- This package depends on `@bunary/core`, but you only need to install `@bunary/http` (dependencies install transitively).

## Requirements

- Bun ≥ 1.0.0

