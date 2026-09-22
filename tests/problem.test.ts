import { describe, expect, test } from "bun:test";
import { ValidationError } from "@bunary/core";
import {
	BodyParseError,
	HttpError,
	NotFoundError,
	type ProblemDetails,
	problem,
	problemResponse,
	TooManyRequestsError,
} from "../src/index.js";

const PROBLEM_CONTENT_TYPE = "application/problem+json; charset=utf-8";

async function body(response: Response): Promise<ProblemDetails> {
	return (await response.json()) as ProblemDetails;
}

describe("problem", () => {
	test("builds an RFC 9457 body with the standard title", async () => {
		const response = problem(404, "No route matches GET /posts");

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
		expect(await body(response)).toEqual({
			type: "about:blank",
			title: "Not Found",
			status: 404,
			detail: "No route matches GET /posts",
		});
	});

	test("omits detail when it is missing, empty or equal to the title", async () => {
		expect(await body(problem(500))).toEqual({
			type: "about:blank",
			title: "Internal Server Error",
			status: 500,
		});
		expect(await body(problem(500, ""))).not.toHaveProperty("detail");
		expect(await body(problem(409, "Conflict"))).not.toHaveProperty("detail");
	});

	test("includes instance and errors when supplied", async () => {
		const response = problem(422, "Validation failed", {
			instance: "/users",
			errors: [{ path: "email", message: "Invalid email" }],
		});

		expect(await body(response)).toEqual({
			type: "about:blank",
			title: "Unprocessable Content",
			status: 422,
			detail: "Validation failed",
			instance: "/users",
			errors: [{ path: "email", message: "Invalid email" }],
		});
	});

	test("merges extra headers and keeps the problem content-type", () => {
		const response = problem(405, "PUT is not allowed", {
			headers: { Allow: "GET, POST" },
		});

		expect(response.headers.get("Allow")).toBe("GET, POST");
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
	});

	test("accepts custom type and title overrides", async () => {
		const response = problem(429, "Slow down", {
			type: "https://example.com/probs/rate-limit",
			title: "Rate limit exceeded",
		});

		const payload = await body(response);
		expect(payload.type).toBe("https://example.com/probs/rate-limit");
		expect(payload.title).toBe("Rate limit exceeded");
	});

	test("falls back to a status-class title for unknown codes", async () => {
		expect((await body(problem(499))).title).toBe("Client Error");
	});
});

describe("problemResponse", () => {
	test("maps an HttpError to its own status, headers and details", async () => {
		const response = problemResponse(
			new TooManyRequestsError("Slow down", {
				headers: { "Retry-After": "30" },
				details: { limit: 100 },
			}),
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("30");
		expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
		expect(await body(response)).toEqual({
			type: "about:blank",
			title: "Too Many Requests",
			status: 429,
			detail: "Slow down",
			errors: { limit: 100 },
		});
	});

	test("omits errors when an HttpError has no details", async () => {
		const payload = await body(problemResponse(new NotFoundError("User 7 does not exist")));

		expect(payload).toEqual({
			type: "about:blank",
			title: "Not Found",
			status: 404,
			detail: "User 7 does not exist",
		});
	});

	test("keeps an HttpError detail visible without debug", async () => {
		const payload = await body(
			problemResponse(new HttpError(403, "Admins only"), { debug: false }),
		);

		expect(payload.detail).toBe("Admins only");
	});

	test("maps a core ValidationError to 422 with its issues", async () => {
		const error = new ValidationError(
			[
				{ path: "email", message: "Invalid email" },
				{ path: "age", message: "Expected number" },
			],
			"Body",
		);

		const response = problemResponse(error);

		expect(response.status).toBe(422);
		const payload = await body(response);
		expect(payload.title).toBe("Unprocessable Content");
		expect(payload.errors).toEqual([
			{ path: "email", message: "Invalid email" },
			{ path: "age", message: "Expected number" },
		]);
		expect(payload.detail).toBe(error.message);
	});

	test("maps a duck-typed ValidationError without @bunary/core installed", async () => {
		class StandaloneValidationError extends Error {
			override readonly name = "ValidationError";
			readonly issues = [{ path: "name", message: "Required" }];
		}

		const response = problemResponse(new StandaloneValidationError("Body validation failed"));

		expect(response.status).toBe(422);
		expect((await body(response)).errors).toEqual([{ path: "name", message: "Required" }]);
	});

	test("does not treat a ValidationError without issues as 422", async () => {
		const impostor = new Error("nothing structured here");
		impostor.name = "ValidationError";

		expect(problemResponse(impostor).status).toBe(500);
	});

	test("maps a BodyParseError to 400", async () => {
		const response = problemResponse(new BodyParseError("Invalid JSON body"));

		expect(response.status).toBe(400);
		expect(await body(response)).toEqual({
			type: "about:blank",
			title: "Bad Request",
			status: 400,
			detail: "Invalid JSON body",
		});
	});

	test("maps an unknown error to 500 and hides the detail", async () => {
		const response = problemResponse(new Error("SQLITE_CANTOPEN: /var/app/prod.sqlite"));

		expect(response.status).toBe(500);
		expect(await body(response)).toEqual({
			type: "about:blank",
			title: "Internal Server Error",
			status: 500,
		});
	});

	test("reveals the detail of an unknown error in debug mode", async () => {
		const payload = await body(
			problemResponse(new Error("SQLITE_CANTOPEN: /var/app/prod.sqlite"), { debug: true }),
		);

		expect(payload.detail).toBe("SQLITE_CANTOPEN: /var/app/prod.sqlite");
	});

	test("stringifies non-Error throws in debug mode", async () => {
		expect((await body(problemResponse("secret string error", { debug: true }))).detail).toBe(
			"secret string error",
		);
		expect((await body(problemResponse("secret string error"))).detail).toBeUndefined();
	});

	test("adds instance to every branch when supplied", async () => {
		const instance = "/users/7";

		for (const error of [
			new NotFoundError(),
			new ValidationError([{ path: "a", message: "b" }]),
			new BodyParseError("broken"),
			new Error("boom"),
		]) {
			expect((await body(problemResponse(error, { instance }))).instance).toBe(instance);
		}
	});
});
