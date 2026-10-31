import { afterEach, describe, expect, test } from "bun:test";
import { type BunaryServer, createRouter, type Middleware } from "../src/index.js";

let running: BunaryServer | undefined;
let ownServer: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
	running?.server.stop(true);
	ownServer?.stop(true);
	running = undefined;
	ownServer = undefined;
});

/** Open a WebSocket and resolve once it is connected, or reject on failure. */
function connect(url: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		ws.onopen = () => resolve(ws);
		ws.onerror = () => reject(new Error("connection failed"));
	});
}

function nextMessage(ws: WebSocket): Promise<string> {
	return new Promise((resolve) => {
		ws.addEventListener("message", (e) => resolve(String(e.data)), { once: true });
	});
}

describe("router.ws()", () => {
	test("connects and echoes messages", async () => {
		const router = createRouter();
		router.ws("/echo", {
			message(ws, message) {
				ws.send(`echo: ${message}`);
			},
		});
		running = router.listen({ port: 0 });

		const ws = await connect(`ws://localhost:${running.port}/echo`);
		const reply = nextMessage(ws);
		ws.send("hello");
		expect(await reply).toBe("echo: hello");
		ws.close();
	});

	test("exposes route params, locals and upgrade data in ws.data", async () => {
		const router = createRouter<{ user: string }>();
		router.use(async (ctx, next) => {
			ctx.locals.user = "ada";
			return await next();
		});
		router.ws<{ room: string }, { joinedAt: number }>(
			"/rooms/:room",
			{
				open(ws) {
					ws.send(
						JSON.stringify({
							room: ws.data.params.room,
							user: ws.data.locals.user,
							joinedAt: ws.data.joinedAt,
						}),
					);
				},
			},
			{ upgrade: () => ({ joinedAt: 42 }) },
		);
		running = router.listen({ port: 0 });

		const ws = new WebSocket(`ws://localhost:${running.port}/rooms/lobby`);
		const msg = await nextMessage(ws);
		expect(JSON.parse(msg)).toEqual({ room: "lobby", user: "ada", joinedAt: 42 });
		ws.close();
	});

	test("route constraints apply to ws routes", async () => {
		const router = createRouter();
		router.ws("/items/:id", { open: (ws) => ws.send("ok") }).whereNumber("id");
		running = router.listen({ port: 0 });

		const res = await fetch(`http://localhost:${running.port}/items/abc`);
		expect(res.status).toBe(404);
		const ws = new WebSocket(`ws://localhost:${running.port}/items/7`);
		expect(await nextMessage(ws)).toBe("ok");
		ws.close();
	});

	test("group middleware can reject before the upgrade", async () => {
		const requireToken: Middleware = async (ctx, next) => {
			if (ctx.query.get("token") !== "secret") {
				return new Response("Unauthorized", { status: 401 });
			}
			return await next();
		};
		let opened = false;
		const router = createRouter();
		router.group({ prefix: "/secure", middleware: [requireToken] }, (g) => {
			g.ws("/feed", {
				open() {
					opened = true;
				},
			});
		});
		running = router.listen({ port: 0 });

		const rejected = await fetch(`http://localhost:${running.port}/secure/feed`, {
			headers: {
				Connection: "Upgrade",
				Upgrade: "websocket",
				"Sec-WebSocket-Version": "13",
				"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
			},
		});
		expect(rejected.status).toBe(401);
		await expect(connect(`ws://localhost:${running.port}/secure/feed`)).rejects.toThrow();
		expect(opened).toBe(false);

		const ws = await connect(`ws://localhost:${running.port}/secure/feed?token=secret`);
		expect(opened).toBe(true);
		ws.close();
	});

	test("global middleware can reject before the upgrade", async () => {
		const router = createRouter();
		router.use(async () => new Response("Unauthorized", { status: 401 }));
		router.ws("/ws", { open: (ws) => ws.send("nope") });
		running = router.listen({ port: 0 });

		await expect(connect(`ws://localhost:${running.port}/ws`)).rejects.toThrow();
	});

	test("a plain GET to a ws route is 426 Upgrade Required", async () => {
		const router = createRouter();
		router.ws("/ws", {});
		running = router.listen({ port: 0 });

		const res = await fetch(`http://localhost:${running.port}/ws`);
		expect(res.status).toBe(426);
		expect(res.headers.get("Upgrade")).toBe("websocket");
	});

	test("an upgrade request Bun cannot upgrade is 400", async () => {
		const router = createRouter();
		router.ws("/ws", {});
		running = router.listen({ port: 0 });

		const res = await fetch(`http://localhost:${running.port}/ws`, {
			headers: { Connection: "Upgrade", Upgrade: "websocket" },
		});
		expect(res.status).toBe(400);
	});

	test("an upgrade request via router.fetch without a server is 500", async () => {
		const router = createRouter();
		router.ws("/ws", {});
		const res = await router.fetch(
			new Request("http://localhost/ws", { headers: { Upgrade: "websocket" } }),
		);
		expect(res.status).toBe(500);
	});

	test("a plain GET via router.fetch is 426 without a server", async () => {
		const router = createRouter();
		router.ws("/ws", {});
		const res = await router.fetch(new Request("http://localhost/ws"));
		expect(res.status).toBe(426);
	});

	test("calls the close handler with code and reason", async () => {
		const router = createRouter();
		const closed = Promise.withResolvers<{ code: number; reason: string; room?: string }>();
		router.ws("/rooms/:room", {
			close(ws, code, reason) {
				closed.resolve({ code, reason, room: ws.data.params.room });
			},
		});
		running = router.listen({ port: 0 });

		const ws = await connect(`ws://localhost:${running.port}/rooms/a`);
		ws.close(4000, "bye");
		expect(await closed.promise).toEqual({ code: 4000, reason: "bye", room: "a" });
	});

	test("dispatches each connection to its own route's handlers", async () => {
		const router = createRouter();
		router.ws("/a", { message: (ws) => ws.send("from a") });
		router.ws("/b", { message: (ws) => ws.send("from b") });
		running = router.listen({ port: 0 });

		const a = await connect(`ws://localhost:${running.port}/a`);
		const b = await connect(`ws://localhost:${running.port}/b`);
		const replyA = nextMessage(a);
		const replyB = nextMessage(b);
		a.send("x");
		b.send("x");
		expect(await replyA).toBe("from a");
		expect(await replyB).toBe("from b");
		a.close();
		b.close();
	});

	test("router.websocket works with your own Bun.serve", async () => {
		const router = createRouter();
		router.ws("/echo", { message: (ws, m) => ws.send(`own: ${m}`) });
		ownServer = Bun.serve({ port: 0, fetch: router.fetch, websocket: router.websocket });

		const ws = await connect(`ws://localhost:${ownServer.port}/echo`);
		const reply = nextMessage(ws);
		ws.send("hi");
		expect(await reply).toBe("own: hi");
		ws.close();
	});

	test("ws routes appear as GET in getRoutes() and can be named", () => {
		const router = createRouter();
		router.ws("/chat/:room", {}).name("chat");
		expect(router.getRoutes()).toEqual([{ name: "chat", method: "GET", path: "/chat/:room" }]);
		expect(router.route("chat", { room: "x" })).toBe("/chat/x");
	});
});
