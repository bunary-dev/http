/**
 * Route model binding on `router.ws()` routes (#159), against a real server.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { abort, type BunaryServer, createRouter, type Middleware } from "../src/index.js";

let running: BunaryServer | undefined;

afterEach(() => {
	running?.server.stop(true);
	running = undefined;
});

interface Room {
	name: string;
}

const rooms: Record<string, Room> = { lobby: { name: "Lobby" } };
const findRoom = (id: string | undefined): Room | undefined => (id ? rooms[id] : undefined);

const UPGRADE_HEADERS = {
	Connection: "Upgrade",
	Upgrade: "websocket",
	"Sec-WebSocket-Version": "13",
	"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
};

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

describe("router.ws() with bind", () => {
	test("a bound room is on ws.data.bound in open and message", async () => {
		const router = createRouter();
		router.ws(
			"/chat/:room",
			{ bind: { room: findRoom } },
			{
				open(ws) {
					ws.send(`open:${ws.data.bound.room.name}:${ws.data.params.room}`);
				},
				message(ws, message) {
					ws.send(`${ws.data.bound.room.name}: ${message}`);
				},
			},
		);
		running = router.listen({ port: 0 });

		const ws = new WebSocket(`ws://localhost:${running.port}/chat/lobby`);
		expect(await nextMessage(ws)).toBe("open:Lobby:lobby");
		const reply = nextMessage(ws);
		ws.send("hi");
		expect(await reply).toBe("Lobby: hi");
		ws.close();
	});

	test("a bound value is on ws.data.bound in close", async () => {
		const router = createRouter();
		const closed = Promise.withResolvers<string>();
		router.ws(
			"/chat/:room",
			{ bind: { room: findRoom } },
			{ close: (ws) => closed.resolve(ws.data.bound.room.name) },
		);
		running = router.listen({ port: 0 });

		const ws = await connect(`ws://localhost:${running.port}/chat/lobby`);
		ws.close();
		expect(await closed.promise).toBe("Lobby");
	});

	test("a missing binding answers a 404 problem and no socket opens", async () => {
		let opened = false;
		const router = createRouter();
		router.ws(
			"/chat/:room",
			{ bind: { room: findRoom } },
			{
				open() {
					opened = true;
				},
			},
		);
		running = router.listen({ port: 0 });

		const res = await fetch(`http://localhost:${running.port}/chat/nowhere`, {
			headers: UPGRADE_HEADERS,
		});
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("application/problem+json");
		const body = (await res.json()) as { detail?: string };
		expect(body.detail).toBe("room not found");

		await expect(connect(`ws://localhost:${running.port}/chat/nowhere`)).rejects.toThrow();
		expect(opened).toBe(false);
	});

	test("a throwing resolver rejects the upgrade with its own status", async () => {
		let opened = false;
		const router = createRouter();
		router.ws(
			"/chat/:room",
			{
				bind: {
					room: () => {
						abort(410);
					},
				},
			},
			{
				open() {
					opened = true;
				},
			},
		);
		running = router.listen({ port: 0 });

		const res = await fetch(`http://localhost:${running.port}/chat/lobby`, {
			headers: UPGRADE_HEADERS,
		});
		expect(res.status).toBe(410);
		await expect(connect(`ws://localhost:${running.port}/chat/lobby`)).rejects.toThrow();
		expect(opened).toBe(false);
	});

	test("middleware rejects before any resolver runs", async () => {
		let calls = 0;
		const requireToken: Middleware = async (ctx, next) => {
			if (ctx.query.get("token") !== "secret") {
				return new Response("Unauthorized", { status: 401 });
			}
			return await next();
		};
		const router = createRouter();
		router.group({ prefix: "/secure", middleware: [requireToken] }, (g) => {
			g.ws(
				"/chat/:room",
				{
					bind: {
						room: (id) => {
							calls++;
							return findRoom(id);
						},
					},
				},
				{ open: (ws) => ws.send(ws.data.bound.room.name) },
			);
		});
		running = router.listen({ port: 0 });

		const rejected = await fetch(`http://localhost:${running.port}/secure/chat/lobby`, {
			headers: UPGRADE_HEADERS,
		});
		expect(rejected.status).toBe(401);
		expect(calls).toBe(0);

		const ws = new WebSocket(`ws://localhost:${running.port}/secure/chat/lobby?token=secret`);
		expect(await nextMessage(ws)).toBe("Lobby");
		expect(calls).toBe(1);
		ws.close();
	});

	test("bindings resolve in path order, and upgrade() and headers still apply", async () => {
		const order: string[] = [];
		const router = createRouter();
		router.ws(
			"/orgs/:org/chat/:room",
			{
				bind: {
					room: (id, ctx) => {
						order.push(`room after ${(ctx.bound.org as { id: string }).id}`);
						return findRoom(id);
					},
					org: (id) => {
						order.push("org");
						return { id: id ?? "" };
					},
				},
				upgrade: (ctx) => ({ label: `${ctx.bound.org.id}/${ctx.bound.room.name}` }),
				headers: { "X-Room": "yes" },
			},
			{ open: (ws) => ws.send(`${ws.data.label}|${order.join(",")}`) },
		);
		running = router.listen({ port: 0 });

		const ws = new WebSocket(`ws://localhost:${running.port}/orgs/acme/chat/lobby`);
		expect(await nextMessage(ws)).toBe("acme/Lobby|org,room after acme");
		ws.close();
	});

	test("a bind key with no matching param throws at registration", () => {
		const router = createRouter();
		expect(() => router.ws("/chat/:room", { bind: { rom: findRoom } }, {})).toThrow(
			'bind key "rom" has no ":rom" in "/chat/:room"',
		);
		expect(() =>
			router.group("/g", (g) => {
				g.ws("/chat/:room", { bind: { rom: findRoom } }, {});
			}),
		).toThrow('bind key "rom" has no ":rom" in "/g/chat/:room"');
	});

	test("ws routes without bind have no ws.data.bound", async () => {
		const router = createRouter();
		router.ws("/chat/:room", {
			open: (ws) => ws.send(JSON.stringify(Object.keys(ws.data).sort())),
		});
		running = router.listen({ port: 0 });

		const ws = new WebSocket(`ws://localhost:${running.port}/chat/lobby`);
		expect(JSON.parse(await nextMessage(ws))).toEqual(["locals", "params"]);
		ws.close();
	});
});
