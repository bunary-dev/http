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
