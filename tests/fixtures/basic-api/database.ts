/**
 * A fake database provider for the `basic-api` fixture.
 *
 * Stands in for the one thing every consumer app has that `@bunary/http` knows
 * nothing about: a service bound to a token in `register` and opened in an
 * async `boot`, which handlers then read through `ctx.app`.
 */
import { type Application, createToken, type Provider } from "@bunary/core";

/** A user row, as this fixture's fake store holds it. */
export interface UserRecord {
	readonly id: number;
	readonly name: string;
}

/** The connection bound under {@link DatabaseToken}. */
export interface FakeConnection {
	/** The URL the connection was opened against. */
	readonly url: string;
	/** `true` once the provider's async `boot` has run. */
	readonly open: boolean;
	/** Look a user up by id. */
	findUser(id: number): UserRecord | undefined;
	/** Insert a user and return it. */
	insertUser(name: string): UserRecord;
	/** How many users the store holds. */
	count(): number;
}

/** Container token the fake connection is bound under. */
export const DatabaseToken = createToken<FakeConnection>("db.connection");

/** Create the (not yet opened) connection. */
function createConnection(url: string): FakeConnection & { open: boolean } {
	const users = new Map<number, UserRecord>([[1, { id: 1, name: "Ada" }]]);
	let nextId = 2;

	return {
		url,
		open: false,
		findUser: (id) => users.get(id),
		insertUser(name) {
			const record = { id: nextId++, name };
			users.set(record.id, record);
			return record;
		},
		count: () => users.size,
	};
}

/**
 * The provider: binds the connection in `register`, opens it in an async
 * `boot`, exactly as core documents the two hooks.
 */
export function databaseProvider(url: string): Provider {
	const connection = createConnection(url);

	return {
		name: "database",
		register(app: Application): void {
			app.set(DatabaseToken, connection);
		},
		async boot(app: Application): Promise<void> {
			// Pretend to dial the server; core awaits this before the app is booted.
			await Promise.resolve();
			(app.get(DatabaseToken) as { open: boolean }).open = true;
		},
	};
}
