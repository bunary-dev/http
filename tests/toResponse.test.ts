/**
 * Unit tests for toResponse() — the handler-return-to-Response converter.
 *
 * Coverage gaps from integration tests: boolean, bigint, symbol,
 * empty string, zero, negative numbers, NaN, Infinity.
 *
 * @see {@link ../src/response.ts}
 */
import { describe, expect, it } from "bun:test";
import { toResponse } from "../src/response.js";

describe("toResponse()", () => {
	describe("Response passthrough", () => {
		it("returns Response instance unchanged", () => {
			const original = new Response("body", { status: 201 });
			const result = toResponse(original);
			expect(result).toBe(original);
		});
	});

	describe("null / undefined → 204", () => {
		it("returns 204 for null", async () => {
			const res = toResponse(null);
			expect(res.status).toBe(204);
			expect(await res.text()).toBe("");
		});

		it("returns 204 for undefined", async () => {
			const res = toResponse(undefined);
			expect(res.status).toBe(204);
			expect(await res.text()).toBe("");
		});
	});

	describe("string → text/plain", () => {
		it("converts string to text response", async () => {
			const res = toResponse("hello");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("hello");
		});

		it("handles empty string", async () => {
			const res = toResponse("");
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("");
		});

		it("handles unicode string", async () => {
			const res = toResponse("こんにちは");
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("こんにちは");
		});
	});

	describe("number → text/plain", () => {
		it("converts positive number to text", async () => {
			const res = toResponse(42);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain;charset=utf-8");
			expect(await res.text()).toBe("42");
		});

		it("converts zero to text", async () => {
			const res = toResponse(0);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("0");
		});

		it("converts negative number to text", async () => {
			const res = toResponse(-1);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("-1");
		});

		it("converts float to text", async () => {
			const res = toResponse(3.14);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("3.14");
		});

		it("converts NaN to text", async () => {
			const res = toResponse(Number.NaN);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("NaN");
		});

		it("converts Infinity to text", async () => {
			const res = toResponse(Number.POSITIVE_INFINITY);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("Infinity");
		});
	});

	describe("object / array → JSON", () => {
		it("serializes plain objects", async () => {
			const res = toResponse({ key: "value" });
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.json()).toEqual({ key: "value" });
		});

		it("serializes arrays", async () => {
			const res = toResponse([1, 2, 3]);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.json()).toEqual([1, 2, 3]);
		});

		it("serializes empty object", async () => {
			const res = toResponse({});
			expect(await res.json()).toEqual({});
		});

		it("serializes empty array", async () => {
			const res = toResponse([]);
			expect(await res.json()).toEqual([]);
		});

		it("serializes nested objects", async () => {
			const data = { user: { name: "Test", tags: ["a"] } };
			const res = toResponse(data);
			expect(await res.json()).toEqual(data);
		});

		it("serializes boolean as JSON (via object fallthrough)", async () => {
			// booleans are not string/number/null/undefined/Response
			// so they fall through to JSON.stringify
			const res = toResponse(true as unknown as object);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.text()).toBe("true");
		});
	});
});
