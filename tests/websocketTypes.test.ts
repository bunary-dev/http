import { describe, expect, test } from "bun:test";
import { createRouter } from "../src/index.js";

describe("router.ws() types", () => {
	test("ws.data carries typed params, locals and upgrade data", () => {
		const router = createRouter<{ user: string }>();
		router.ws<{ room: string }, { joinedAt: number }>(
			"/rooms/:room",
			{
				message(ws) {
					const room: string = ws.data.params.room;
					const user: string = ws.data.locals.user;
					const joinedAt: number = ws.data.joinedAt;
					// @ts-expect-error — not part of ws.data
					ws.data.missing;
					ws.send(`${room}${user}${joinedAt}`);
				},
			},
			{ upgrade: (ctx) => ({ joinedAt: ctx.params.room.length }) },
		);
		router.group("/g", (g) => {
			g.ws<{ id: string }>("/:id", {
				open(ws) {
					const id: string = ws.data.params.id;
					ws.send(id);
				},
			});
		});
		expect(router.getRoutes()).toHaveLength(2);
	});
});

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Assert two types are identical. */
function expectExact<A, B>(_proof: Equals<A, B> extends true ? true : never): void {}

interface Room {
	name: string;
}

const findRoom = async (id: string | undefined): Promise<Room | null> => (id ? { name: id } : null);

describe("router.ws() bind types (#159)", () => {
	test("ws.data.bound is typed like ctx.bound in every handler", () => {
		const router = createRouter<{ user: string }>();
		router.ws(
			"/chat/:room",
			{ bind: { room: findRoom } },
			{
				open(ws) {
					expectExact<typeof ws.data.bound, { room: Room }>(true);
					const user: string = ws.data.locals.user;
					const room: string | undefined = ws.data.params.room;
					ws.send(`${user}${room}`);
				},
				message(ws) {
					const name: string = ws.data.bound.room.name;
					// @ts-expect-error — not a binding
					ws.data.bound.other;
					ws.send(name);
				},
				close(ws) {
					expectExact<typeof ws.data.bound, { room: Room }>(true);
				},
			},
		);
		router.group("/g", (g) => {
			g.ws(
				"/chat/:room",
				{ bind: { room: findRoom } },
				{
					open(ws) {
						expectExact<typeof ws.data.bound, { room: Room }>(true);
					},
				},
			);
		});
		expect(router.getRoutes()).toHaveLength(2);
	});

	test("inline resolvers infer ws.data.bound, and upgrade() sees ctx.bound", () => {
		const router = createRouter();
		router.ws(
			"/chat/:room",
			{
				bind: {
					room: (id) => {
						expectExact<typeof id, string | undefined>(true);
						return id?.length;
					},
				},
				upgrade: (ctx) => {
					expectExact<typeof ctx.bound, { room: number }>(true);
					return { joinedAt: ctx.bound.room };
				},
			},
			{
				open(ws) {
					expectExact<typeof ws.data.bound, { room: number }>(true);
					const joinedAt: number = ws.data.joinedAt;
					ws.send(`${joinedAt}`);
				},
			},
		);
		expect(router.getRoutes()).toHaveLength(1);
	});

	test("ws routes without bind have no ws.data.bound", () => {
		const router = createRouter();
		router.ws("/chat/:room", {
			open(ws) {
				// @ts-expect-error — no bind, no bound
				ws.data.bound;
			},
		});
		router.ws(
			"/chat2/:room",
			{
				open(ws) {
					// @ts-expect-error — no bind, no bound
					ws.data.bound;
				},
			},
			{ upgrade: () => ({}) },
		);
		expect(router.getRoutes()).toHaveLength(2);
	});
});
