/**
 * Unit tests for toResponse() — the handler-return-to-Response converter.
 *
 * Covers valid HandlerResponse types (Response, object, string, number,
 * null, undefined) plus edge values (empty string, zero, NaN, Infinity).
 * Also exercises unsupported types (boolean, bigint, symbol) that bypass
 * the TypeScript type and fall through to the JSON/object branch.
 *
 * @see {@link ../src/response.ts}
 */
import { describe, expect, test } from "bun:test";
import { toResponse } from "../src/response.js";

describe("toResponse()", () => {
	describe("Response passthrough", () => {
		test("returns Response instance unchanged", () => {
			const original = new Response("body", { status: 201 });
			const result = toResponse(original);
			expect(result).toBe(original);
		});
	});

	describe("null / undefined → 204", () => {
		test("returns 204 for null", async () => {
			const res = toResponse(null);
			expect(res.status).toBe(204);
			expect(await res.text()).toBe("");
		});

		test("returns 204 for undefined", async () => {
			const res = toResponse(undefined);
			expect(res.status).toBe(204);
			expect(await res.text()).toBe("");
		});
	});

	describe("string → text/plain", () => {
		test("converts string to text response", async () => {
			const res = toResponse("hello");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("hello");
		});

		test("handles empty string", async () => {
			const res = toResponse("");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("");
		});

		test("handles unicode string", async () => {
			const res = toResponse("こんにちは");
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("こんにちは");
		});
	});

	describe("number → text/plain", () => {
		test("converts positive number to text", async () => {
			const res = toResponse(42);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("42");
		});

		test("converts zero to text", async () => {
			const res = toResponse(0);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("0");
		});

		test("converts negative number to text", async () => {
			const res = toResponse(-1);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("-1");
		});

		test("converts float to text", async () => {
			const res = toResponse(3.14);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("3.14");
		});

		test("converts NaN to text", async () => {
			const res = toResponse(Number.NaN);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("NaN");
		});

		test("converts Infinity to text", async () => {
			const res = toResponse(Number.POSITIVE_INFINITY);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("Infinity");
		});
	});

	describe("object / array → JSON", () => {
		test("serializes plain objects", async () => {
			const res = toResponse({ key: "value" });
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.json()).toEqual({ key: "value" });
		});

		test("serializes arrays", async () => {
			const res = toResponse([1, 2, 3]);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.json()).toEqual([1, 2, 3]);
		});

		test("serializes empty object", async () => {
			const res = toResponse({});
			expect(await res.json()).toEqual({});
		});

		test("serializes empty array", async () => {
			const res = toResponse([]);
			expect(await res.json()).toEqual([]);
		});

		test("serializes nested objects", async () => {
			const data = { user: { name: "Test", tags: ["a"] } };
			const res = toResponse(data);
			expect(await res.json()).toEqual(data);
		});

		test("serializes boolean as JSON (via object fallthrough)", async () => {
			// booleans are not string/number/null/undefined/Response
			// so they fall through to JSON.stringify
			const res = toResponse(true as unknown as object);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.text()).toBe("true");
		});
	});
});
