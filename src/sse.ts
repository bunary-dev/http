/**
 * Server-Sent Events helper.
 *
 * `sse()` returns a streaming `text/event-stream` `Response` and hands the
 * handler a small writer that frames events per the WHATWG HTML spec
 * (§9.2 Server-sent events).
 */

/** Content-type for {@link sse} responses. */
const SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8";

/** Any line terminator the event-stream format recognises. */
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * One event written with {@link SseStream.send}.
 */
export interface SseEvent {
	/** Event payload. Strings are sent as-is; anything else is JSON-encoded. */
	data: unknown;
	/** Event type, dispatched to `addEventListener(event, …)` on the client. */
	event?: string;
	/** Event id, echoed back by the client as `Last-Event-ID` on reconnect. */
	id?: string;
	/** Reconnection delay in milliseconds the client should use. */
	retry?: number;
}

/**
 * The writer passed to an {@link sse} handler.
 */
export interface SseStream {
	/** Write one event. Ignored once the stream is closed. */
	send(event: SseEvent): void;
	/** Write a comment line (`: text`), ignored by clients. */
	comment(text: string): void;
	/** End the stream and stop the keep-alive timer. Safe to call twice. */
	close(): void;
	/** Fires when the client disconnects (or the response body is cancelled). */
	readonly signal: AbortSignal;
	/** Whether the stream has been closed, by `close()` or a disconnect. */
	readonly closed: boolean;
}

/**
 * Options for {@link sse}.
 */
export interface SseOptions {
	/**
	 * Send a `: ping` comment every `keepAlive` milliseconds so proxies do not
	 * drop an idle connection. Off by default.
	 */
	keepAlive?: number;
	/** Extra response headers, merged over the event-stream defaults. */
	headers?: ResponseInit["headers"];
}

/** Remove line breaks from a single-line field (`event`, `id`). */
function singleLine(value: string): string {
	return value.replace(/[\r\n]/g, "");
}

/** Serialize one event into its wire format, ending with a blank line. */
function frameEvent({ data, event, id, retry }: SseEvent): string {
	let out = "";
	if (event !== undefined) out += `event: ${singleLine(event)}\n`;
	if (id !== undefined) out += `id: ${singleLine(id)}\n`;
	if (retry !== undefined && Number.isFinite(retry))
		out += `retry: ${Math.max(0, Math.floor(retry))}\n`;
	const payload = typeof data === "string" ? data : JSON.stringify(data);
	for (const line of (payload ?? "").split(LINE_BREAK)) out += `data: ${line}\n`;
	return `${out}\n`;
}

/** Serialize a comment, one `: ` line per input line. */
function frameComment(text: string): string {
	return `${text
		.split(LINE_BREAK)
		.map((line) => `: ${line}\n`)
		.join("")}\n`;
}

/**
 * Build a Server-Sent Events `Response`.
 *
 * The response carries `Content-Type: text/event-stream`, `Cache-Control:
 * no-cache` and `Connection: keep-alive`, and is backed by a `ReadableStream`.
 * The handler runs after the response is created and may be async; the stream
 * stays open until it calls `close()`, the client disconnects, or the handler
 * throws.
 *
 * @param ctx - The request context (only `ctx.request` is used)
 * @param handler - Receives the {@link SseStream} writer
 * @param options - Optional keep-alive interval and extra headers
 * @returns A streaming `text/event-stream` response
 *
 * @example
 * ```ts
 * import { sse } from "@bunary/http";
 *
 * router.get("/clock", (ctx) =>
 *   sse(ctx, (stream) => {
 *     const timer = setInterval(() => stream.send({ event: "tick", data: { now: Date.now() } }), 1000);
 *     stream.signal.addEventListener("abort", () => clearInterval(timer));
 *   }, { keepAlive: 15_000 }),
 * );
 * ```
 */
export function sse(
	ctx: { request: Request },
	handler: (stream: SseStream) => void | Promise<void>,
	options: SseOptions = {},
): Response {
	const encoder = new TextEncoder();
	const aborter = new AbortController();
	const requestSignal = ctx.request.signal;
	let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let closed = false;

	const write = (chunk: string): void => {
		if (closed || !controller) return;
		controller.enqueue(encoder.encode(chunk));
	};

	const finish = (): boolean => {
		if (closed) return false;
		closed = true;
		clearInterval(timer);
		requestSignal.removeEventListener("abort", onDisconnect);
		return true;
	};

	const close = (): void => {
		if (!finish()) return;
		try {
			controller?.close();
		} catch {
			// Already closed or cancelled by the consumer.
		}
	};

	function onDisconnect(): void {
		close();
		aborter.abort(requestSignal.reason);
	}

	const stream: SseStream = {
		send: (event) => write(frameEvent(event)),
		comment: (text) => write(frameComment(text)),
		close,
		signal: aborter.signal,
		get closed() {
			return closed;
		},
	};

	const body = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			if (requestSignal.aborted) {
				onDisconnect();
				return;
			}
			requestSignal.addEventListener("abort", onDisconnect, { once: true });
			if (options.keepAlive !== undefined && options.keepAlive > 0) {
				timer = setInterval(() => write(": ping\n\n"), options.keepAlive);
			}
			queueMicrotask(() => {
				Promise.resolve()
					.then(() => handler(stream))
					.catch(() => close());
			});
		},
		cancel(reason) {
			finish();
			aborter.abort(reason);
		},
	});

	const headers = new Headers({
		"Content-Type": SSE_CONTENT_TYPE,
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	if (options.headers) {
		for (const [name, value] of new Headers(
			options.headers as ConstructorParameters<typeof Headers>[0],
		)) {
			headers.set(name, value);
		}
	}

	return new Response(body, { headers });
}
