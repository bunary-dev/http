/**
 * Assemble the `basic-api` fixture: config + providers + router, exactly the
 * way a consumer's `bootstrap.ts` would.
 *
 * A consumer writes `import { httpProvider, serve } from "@bunary/http/provider"`;
 * this fixture imports `../../../src/provider.js` so the test exercises the
 * working tree. Importing it is also what augments core's `BunaryConfig` with
 * the `http` namespace used in `config.ts`.
 */
import { type Application, createApp, type EnvironmentType } from "@bunary/core";
import type { Router } from "../../../src/index.js";
// A consumer writes: import { httpProvider } from "@bunary/http/provider";
import { httpProvider } from "../../../src/provider.js";
import { apiEnv, basicApiConfig } from "./config.js";
import { databaseProvider } from "./database.js";
import { type ApiLocals, createApiRouter } from "./routes.js";

/** The router and the unbooted app it is mounted on. */
export interface BasicApi {
	/** The router, also reachable as `app.get(RouterToken)`. */
	readonly router: Router<ApiLocals>;
	/** The Application; call `.boot()` before serving it. */
	readonly app: Application;
}

/**
 * Build the fixture API.
 *
 * @param env - The environment name to configure the app with
 */
export function createBasicApi(env: EnvironmentType = "development"): BasicApi {
	const router = createApiRouter();
	const app = createApp({
		config: basicApiConfig(env),
		providers: [databaseProvider(apiEnv.BASIC_API_DATABASE_URL), httpProvider(router)],
	});

	return { router, app };
}
