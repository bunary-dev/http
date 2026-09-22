/**
 * Configuration and environment for the `basic-api` fixture consumer.
 *
 * A consumer writes `import type { HttpConfig } from "@bunary/http"`; this
 * fixture reaches into `../../../src/*` so the test exercises the working tree.
 */
import { defineConfig, defineEnv, type EnvironmentType } from "@bunary/core";
import { z } from "zod";
// A consumer writes: import type { HttpConfig } from "@bunary/http";
import type { HttpConfig } from "../../../src/index.js";

/**
 * The environment this API reads, validated once through core's `defineEnv`.
 *
 * Every key has a default so the fixture boots from a bare `Bun.env`; a real
 * consumer would leave `DATABASE_URL` required and let a bad `.env` fail here.
 */
export const apiEnv = defineEnv(
	z.object({
		BASIC_API_DATABASE_URL: z.string().default("memory://basic-api"),
		BASIC_API_LOG_LEVEL: z.enum(["debug", "info", "warn"]).default("info"),
	}),
);

/** The `http` namespace this fixture serves on: an ephemeral loopback port. */
export const httpConfig: HttpConfig = {
	port: 0,
	hostname: "127.0.0.1",
	cors: { origin: "*", exposeHeaders: ["x-request-id"] },
};

/**
 * Build the app config, with the environment name as the only knob.
 *
 * `http` type-checks because importing `@bunary/http/provider` anywhere in the
 * program augments core's `BunaryConfig` with the namespace.
 */
export function basicApiConfig(env: EnvironmentType = "development") {
	return defineConfig({
		app: { name: "basic-api", env, debug: env !== "production" },
		http: httpConfig,
	});
}
