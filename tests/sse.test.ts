import { describe, expect, test } from "bun:test";
import { createRouter, type SseStream, sse } from "../src/index.js";

const ctxFor = (init?: RequestInit) => ({ request: new Request("http://localhost/events", init) });

describe("sse()", () => {
	test("sets the event-stream headers", async () => {
		const res = sse(ctxFor(), (stream) => stream.close());
		expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
		expect(res.headers.get("Cache-Control")).toBe("no-cache");
		expect(res.headers.get("Connection")).toBe("keep-alive");
		expect(res.body).toBeInstanceOf(ReadableStream);
		expect(await res.text()).toBe("");
	});

	test("frames event, id, retry and data fields", async () => {
		const res = sse(ctxFor(), (stream) => {
			stream.send({ event: "update", id: "7", retry: 3000, data: "hello" });
			stream.close();
		});
		expect(await res.text()).toBe("event: update\nid: 7\nretry: 3000\ndata: hello\n\n");
	});

	test("splits multi-line data into multiple data: lines", async () => {
		const res = sse(ctxFor(), (stream) => {
			stream.send({ data: "one\ntwo\r\nthree\rfour" });
			stream.close();
		});
		expect(await res.text()).toBe("data: one\ndata: two\ndata: three\ndata: four\n\n");
	});

	test("JSON-encodes non-string data", async () => {
		const res = sse(ctxFor(), (stream) => {
			stream.send({ data: { a: 1, b: [true] } });
			stream.send({ data: 42 });
			stream.close();
		});
		expect(await res.text()).toBe('data: {"a":1,"b":[true]}\n\ndata: 42\n\n');
	});

	test("comment() writes a comment line, split per line", async () => {
		const res = sse(ctxFor(), (stream) => {
			stream.comment("hi\nthere");
			stream.close();
		});
		expect(await res.text()).toBe(": hi\n: there\n\n");
	});

	test("strips newlines from event and id", async () => {
		const res = sse(ctxFor(), (stream) => {
			stream.send({ event: "a\nb", id: "1\r2", data: "x" });
			stream.close();
		});
		expect(await res.text()).toBe("event: ab\nid: 12\ndata: x\n\n");
	});

	test("supports async handlers and close ends the stream", async () => {
		let captured: SseStream | undefined;
		const res = sse(ctxFor(), async (stream) => {
			captured = stream;
			await Bun.sleep(5);
			stream.send({ data: "late" });
			stream.close();
			// Writes after close are ignored.
			stream.send({ data: "ignored" });
		});
		expect(await res.text()).toBe("data: late\n\n");
		expect(captured?.closed).toBe(true);
	});

	test("a throwing handler closes the stream", async () => {
		const res = sse(ctxFor(), async (stream) => {
			stream.send({ data: "before" });
			throw new Error("boom");
		});
		expect(await res.text()).toBe("data: before\n\n");
	});

	test("client abort fires the signal and stops keep-alive", async () => {
		const controller = new AbortController();
		let stream: SseStream | undefined;
		const res = sse(
			ctxFor({ signal: controller.signal }),
			(s) => {
				stream = s;
			},
			{ keepAlive: 10 },
		);
		const reader = (res.body as ReadableStream<Uint8Array>).getReader();
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toBe(": ping\n\n");

		let fired = false;
		stream?.signal.addEventListener("abort", () => {
			fired = true;
		});
		controller.abort();
		expect(fired).toBe(true);
		expect(stream?.closed).toBe(true);

		const rest = await reader.read();
		expect(rest.done).toBe(true);
	});

	test("cancelling the body fires the signal and clears the keep-alive timer", async () => {
		let stream: SseStream | undefined;
		const res = sse(
			ctxFor(),
			(s) => {
				stream = s;
			},
			{ keepAlive: 5 },
		);
		await (res.body as ReadableStream<Uint8Array>).cancel();
		expect(stream?.signal.aborted).toBe(true);
		expect(stream?.closed).toBe(true);
		// A firing timer would throw enqueueing into a cancelled stream.
		await Bun.sleep(20);
	});

	test("keepAlive sends ping comments repeatedly until close", async () => {
		const res = sse(
			ctxFor(),
			async (stream) => {
				await Bun.sleep(35);
				stream.close();
			},
			{ keepAlive: 10 },
		);
		const body = await res.text();
		expect(body.split(": ping\n\n").length - 1).toBeGreaterThanOrEqual(2);
		expect(body.replaceAll(": ping\n\n", "")).toBe("");
	});

	test("merges extra headers", async () => {
		const res = sse(ctxFor(), (s) => s.close(), { headers: { "X-Accel-Buffering": "no" } });
		expect(res.headers.get("X-Accel-Buffering")).toBe("no");
		expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
	});

	test("works as a route handler", async () => {
		const app = createRouter();
		app.get("/events", (ctx) =>
			sse(ctx, (stream) => {
				stream.send({ event: "hello", data: { ok: true } });
				stream.close();
			}),
		);
		const res = await app.fetch(new Request("http://localhost/events"));
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
		expect(await res.text()).toBe('event: hello\ndata: {"ok":true}\n\n');
	});

	test("HEAD on an open SSE route returns promptly and stops the stream", async () => {
		const app = createRouter();
		let stream: SseStream | undefined;
		app.get("/events", (ctx) =>
			sse(
				ctx,
				(s) => {
					stream = s;
				},
				{ keepAlive: 1_000 },
			),
		);
		const started = performance.now();
		const res = await app.fetch(new Request("http://localhost/events", { method: "HEAD" }));
		expect(performance.now() - started).toBeLessThan(1_000);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
		expect(await res.text()).toBe("");
		expect(stream?.signal.aborted).toBe(true);
	});
});
