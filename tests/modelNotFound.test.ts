import { describe, expect, test } from "bun:test";
import { createRouter, type ProblemDetails, problemResponse } from "../src/index.js";

const PROBLEM_CONTENT_TYPE = "application/problem+json; charset=utf-8";
const MESSAGE = 'No row in "users" with primary key 5';

/** A structural stand-in for `@bunary/orm`'s `ModelNotFoundError`; orm is not imported. */
function modelNotFound(message = MESSAGE): Error {
	const error = new Error(message);
	error.name = "ModelNotFoundError";
	return error;
}

function routerThrowing(error: unknown, options: Parameters<typeof createRouter>[0] = {}) {
	const router = createRouter(options);
	router.get("/users/:id", () => {
		throw error;
	});
	return router;
}

describe("ModelNotFoundError mapping (#157)", () => {
	test("answers 404 problem+json with detail in debug mode", async () => {
		const response = await routerThrowing(modelNotFound(), { debug: true }).fetch(
			new Request("http://localhost/users/5"),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
		expect(await response.json()).toEqual({
			type: "about:blank",
			title: "Not Found",
			status: 404,
			detail: MESSAGE,
			instance: "/users/5",
		});
	});

	test("omits detail when debug is off so table names never leak", async () => {
		const response = await routerThrowing(modelNotFound(), { debug: false }).fetch(
			new Request("http://localhost/users/5"),
		);

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
		expect(await response.json()).toEqual({
			type: "about:blank",
			title: "Not Found",
			status: 404,
			instance: "/users/5",
		});
	});

	test("matches a subclass with name ModelNotFoundError", async () => {
		class ModelNotFoundError extends Error {
			override readonly name = "ModelNotFoundError";
		}
		const response = problemResponse(new ModelNotFoundError(MESSAGE));

		expect(response.status).toBe(404);
		expect(((await response.json()) as ProblemDetails).detail).toBeUndefined();
	});

	test("a custom onError still wins", async () => {
		const response = await routerThrowing(modelNotFound(), {
			debug: true,
			onError: () => new Response("custom", { status: 418 }),
		}).fetch(new Request("http://localhost/users/5"));

		expect(response.status).toBe(418);
		expect(await response.text()).toBe("custom");
	});

	test("any other Error is still a 500", async () => {
		const response = await routerThrowing(new Error(MESSAGE), { debug: true }).fetch(
			new Request("http://localhost/users/5"),
		);

		expect(response.status).toBe(500);
		expect(((await response.json()) as ProblemDetails).title).toBe("Internal Server Error");
	});

	test("a non-Error object named ModelNotFoundError is still a 500", () => {
		const response = problemResponse({ name: "ModelNotFoundError", message: MESSAGE });

		expect(response.status).toBe(500);
	});
});
