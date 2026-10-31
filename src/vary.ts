/**
 * Shared `Vary` header handling.
 */

/**
 * Append cache-key header names to `Vary` without dropping what is already
 * there, and without repeating a name the response already lists.
 *
 * Overwriting `Vary` is how a CORS layer silently breaks an upstream
 * `Vary: Accept-Encoding`; repeating a name bloats the header for no gain.
 */
export function appendVary(headers: Headers, names: string[]): void {
	const present = new Set(
		(headers.get("Vary") ?? "")
			.split(",")
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean),
	);
	for (const name of names) {
		if (present.has(name.toLowerCase())) continue;
		present.add(name.toLowerCase());
		headers.append("Vary", name);
	}
}
