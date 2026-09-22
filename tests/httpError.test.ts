import { describe, expect, test } from "bun:test";
import {
	abort,
	BadRequestError,
	ConflictError,
	ForbiddenError,
	HttpError,
	InternalServerError,
	isHttpError,
	MethodNotAllowedError,
	NotFoundError,
	TooManyRequestsError,
	UnauthorizedError,
	UnprocessableError,
} from "../src/index.js";

describe("HttpError", () => {
	test("carries status, message and name", () => {
		const error = new HttpError(418, "I refuse to brew");

		expect(error).toBeInstanceOf(Error);
		expect(error.status).toBe(418);
		expect(error.message).toBe("I refuse to brew");
		expect(error.name).toBe("HttpError");
	});

	test("falls back to the standard reason phrase as the message", () => {
		expect(new HttpError(503).message).toBe("Service Unavailable");
	});

	test("falls back to a status-class phrase for unknown codes", () => {
		expect(new HttpError(499).message).toBe("Client Error");
		expect(new HttpError(599).message).toBe("Server Error");
		expect(new HttpError(299).message).toBe("Error");
	});

	test("keeps optional headers, details and cause", () => {
		const cause = new Error("root cause");
		const error = new HttpError(429, "Slow down", {
			headers: { "Retry-After": "30" },
			details: { limit: 100 },
			cause,
		});

		expect(error.headers).toEqual({ "Retry-After": "30" });
		expect(error.details).toEqual({ limit: 100 });
		expect(error.cause).toBe(cause);
	});

	test("leaves headers and details undefined when not supplied", () => {
		const error = new HttpError(400);

		expect(error.headers).toBeUndefined();
		expect(error.details).toBeUndefined();
	});

	test("is catchable as an HttpError", () => {
		expect(() => {
			throw new HttpError(400, "nope");
		}).toThrow(HttpError);
	});
});

describe("status subclasses", () => {
	const cases: ReadonlyArray<[new (message?: string) => HttpError, number, string]> = [
		[BadRequestError, 400, "BadRequestError"],
		[UnauthorizedError, 401, "UnauthorizedError"],
		[ForbiddenError, 403, "ForbiddenError"],
		[NotFoundError, 404, "NotFoundError"],
		[MethodNotAllowedError, 405, "MethodNotAllowedError"],
		[ConflictError, 409, "ConflictError"],
		[UnprocessableError, 422, "UnprocessableError"],
		[TooManyRequestsError, 429, "TooManyRequestsError"],
		[InternalServerError, 500, "InternalServerError"],
	];

	for (const [Ctor, status, name] of cases) {
		test(`${name} is a ${status} HttpError`, () => {
			const error = new Ctor();

			expect(error).toBeInstanceOf(HttpError);
			expect(error).toBeInstanceOf(Ctor);
			expect(error.status).toBe(status);
			expect(error.name).toBe(name);
			expect(error.message.length).toBeGreaterThan(0);
		});

		test(`${name} accepts a custom message and options`, () => {
			const error = new Ctor("custom");

			expect(error.message).toBe("custom");
		});
	}

	test("subclass options are forwarded to HttpError", () => {
		const error = new TooManyRequestsError("Slow down", {
			headers: { "Retry-After": "60" },
			details: ["rate limited"],
		});

		expect(error.status).toBe(429);
		expect(error.headers).toEqual({ "Retry-After": "60" });
		expect(error.details).toEqual(["rate limited"]);
	});
});

describe("abort", () => {
	test("throws the matching subclass for a known status", () => {
		expect(() => abort(404)).toThrow(NotFoundError);
		expect(() => abort(422, "bad payload")).toThrow(UnprocessableError);
	});

	test("throws a generic HttpError for an unmapped status", () => {
		let thrown: unknown;
		try {
			abort(418, "teapot");
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(HttpError);
		expect(thrown).not.toBeInstanceOf(BadRequestError);
		expect((thrown as HttpError).status).toBe(418);
		expect((thrown as HttpError).name).toBe("HttpError");
		expect((thrown as HttpError).message).toBe("teapot");
	});

	test("forwards message, headers and details", () => {
		let thrown: unknown;
		try {
			abort(401, "Token expired", {
				headers: { "WWW-Authenticate": "Bearer" },
				details: { reason: "expired" },
			});
		} catch (error) {
			thrown = error;
		}

		const error = thrown as UnauthorizedError;
		expect(error).toBeInstanceOf(UnauthorizedError);
		expect(error.message).toBe("Token expired");
		expect(error.headers).toEqual({ "WWW-Authenticate": "Bearer" });
		expect(error.details).toEqual({ reason: "expired" });
	});

	test("uses the reason phrase when no message is given", () => {
		expect(() => abort(403)).toThrow("Forbidden");
	});
});

describe("isHttpError", () => {
	test("accepts HttpError and its subclasses", () => {
		expect(isHttpError(new HttpError(400))).toBe(true);
		expect(isHttpError(new ConflictError())).toBe(true);
	});

	test("rejects everything else", () => {
		expect(isHttpError(new Error("plain"))).toBe(false);
		expect(isHttpError({ status: 400 })).toBe(false);
		expect(isHttpError(null)).toBe(false);
		expect(isHttpError("400")).toBe(false);
	});

	test("narrows the type for the caller", () => {
		const error: unknown = new NotFoundError("gone");

		if (isHttpError(error)) {
			expect(error.status).toBe(404);
		} else {
			throw new Error("guard should have matched");
		}
	});
});
