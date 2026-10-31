import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { problem } from "./problem.js";
import type { RouteHandler } from "./types/index.js";

/**
 * Options for {@link serveStatic}.
 *
 * @example
 * ```ts
 * const options: ServeStaticOptions = { index: "index.html", maxAge: 3600 };
 * ```
 */
export interface ServeStaticOptions {
	/**
	 * File served when the request names a directory, e.g. `"index.html"`.
	 * Without it, directory requests are 404 (there is never a listing).
	 */
	index?: string;

	/**
	 * Whether paths with a segment starting with `.` (`.env`, `.git/…`,
	 * `.well-known/…`) are served. `"deny"` answers them with 404.
	 *
	 * @default "deny"
	 */
	dotfiles?: "allow" | "deny";

	/**
	 * Adds `Cache-Control: public, max-age=N` (seconds) to file and 304
	 * responses. Omitted when `undefined`.
	 */
	maxAge?: number;
}

/** Result of resolving a request path to a regular file inside the root. */
interface ResolvedFile {
	path: string;
	size: number;
	mtimeMs: number;
}

/**
 * Split the decoded wildcard value into path segments, or null when it must
 * be rejected: NUL bytes, backslashes, absolute paths and `.` / `..` segments.
 * Empty segments from trailing slashes are dropped.
 */
function toSegments(relative: string): string[] | null {
	if (relative.includes("\0") || relative.includes("\\")) return null;
	if (relative.startsWith("/")) return null;
	const segments = relative.split("/").filter((segment) => segment !== "");
	if (segments.some((segment) => segment === "." || segment === "..")) return null;
	return segments;
}

/** Whether `path` is `root` itself or lies below it. */
function isInside(root: string, path: string): boolean {
	return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Resolve `candidate` with symlinks followed and return it only when the real
 * path stays inside `root`; null when it is missing or escapes.
 */
async function realInside(root: string, candidate: string) {
	try {
		const real = await realpath(candidate);
		if (!isInside(root, real)) return null;
		return { real, stats: await stat(real) };
	} catch {
		return null;
	}
}

async function resolveFile(
	root: string,
	segments: string[],
	index: string | undefined,
): Promise<ResolvedFile | null> {
	let found = await realInside(root, resolve(root, ...segments));
	if (found?.stats.isDirectory()) {
		if (index === undefined) return null;
		found = await realInside(found.real, resolve(found.real, index));
	}
	if (!found?.stats.isFile()) return null;
	return { path: found.real, size: found.stats.size, mtimeMs: found.stats.mtimeMs };
}

/** Weak entity tags compare equal on their opaque part (RFC 9110 §8.8.3.2). */
function etagMatches(header: string, etag: string): boolean {
	if (header.trim() === "*") return true;
	const opaque = etag.slice(2);
	return header.split(",").some((tag) => {
		const value = tag.trim();
		return (value.startsWith("W/") ? value.slice(2) : value) === opaque;
	});
}

/**
 * Whether the request's conditional headers say the client copy is current.
 * `If-None-Match` takes precedence; `If-Modified-Since` is only consulted
 * when it is absent (RFC 9110 §13.1.3).
 */
function isNotModified(request: Request, etag: string, mtimeMs: number): boolean {
	const ifNoneMatch = request.headers.get("If-None-Match");
	if (ifNoneMatch !== null) return etagMatches(ifNoneMatch, etag);
	const ifModifiedSince = request.headers.get("If-Modified-Since");
	if (ifModifiedSince === null) return false;
	const since = Date.parse(ifModifiedSince);
	// HTTP dates have one-second resolution.
	return !Number.isNaN(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
}

/**
 * Serve files from a directory. Mount it on a wildcard route; the remaining
 * path (`ctx.params["*"]`) names the file relative to `root`.
 *
 * Responses carry `Content-Type` (from the file extension), `Content-Length`,
 * `Last-Modified` and a weak `ETag`; `If-None-Match` / `If-Modified-Since`
 * are answered with 304, and `HEAD` sends the headers without reading the
 * file. Missing files, directories (unless `index` is set), dotfiles (unless
 * `dotfiles: "allow"`), `..` / absolute / NUL-byte paths and any path whose
 * real location (symlinks resolved) lies outside `root` are all 404.
 *
 * @param root - Directory to serve, absolute or relative to the working directory
 * @param options - Index file, dotfile policy and `Cache-Control` max-age
 * @returns A route handler for `router.get("/prefix/*", …)`
 *
 * @example
 * ```ts
 * router.get("/assets/*", serveStatic("./public", { maxAge: 3600 }));
 * // GET /assets/css/site.css → ./public/css/site.css
 * ```
 */
export function serveStatic<TLocals extends object = Record<string, unknown>>(
	root: string,
	options: ServeStaticOptions = {},
): RouteHandler<TLocals> {
	const { index, dotfiles = "deny", maxAge } = options;
	const absoluteRoot = resolve(root);
	let realRoot: string | undefined;

	return async (ctx) => {
		const segments = toSegments(ctx.params["*"] ?? "");
		if (segments === null) return problem(404);
		if (dotfiles !== "allow" && segments.some((segment) => segment.startsWith("."))) {
			return problem(404);
		}

		if (realRoot === undefined) {
			try {
				realRoot = await realpath(absoluteRoot);
			} catch {
				return problem(404);
			}
		}

		const file = await resolveFile(realRoot, segments, index);
		if (file === null) return problem(404);

		const etag = `W/"${file.size.toString(16)}-${Math.floor(file.mtimeMs).toString(16)}"`;
		const headers = new Headers({
			ETag: etag,
			"Last-Modified": new Date(file.mtimeMs).toUTCString(),
		});
		if (maxAge !== undefined) headers.set("Cache-Control", `public, max-age=${maxAge}`);

		const method = ctx.request.method;
		if ((method === "GET" || method === "HEAD") && isNotModified(ctx.request, etag, file.mtimeMs)) {
			return new Response(null, { status: 304, headers });
		}

		const body = Bun.file(file.path);
		headers.set("Content-Type", body.type);
		headers.set("Content-Length", String(file.size));
		return new Response(method === "HEAD" ? null : body, { headers });
	};
}
