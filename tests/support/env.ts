/**
 * Restore an env var to a previously captured value. Assigning `undefined`
 * to `Bun.env.X` stores the string "undefined", so unset it instead.
 */
export function restoreEnv(name: string, original: string | undefined): void {
	if (original === undefined) {
		delete Bun.env[name];
	} else {
		Bun.env[name] = original;
	}
}
