import { describe, expect, test } from "bun:test";
import { html, json, redirect, status, text } from "../src/index.js";

describe("Standalone response helpers", () => {
	describe("json()", () => {
		test("serializes data with a JSON content-type", async () => {
			const response = json({ message: "hello" });

			expect(response).toBeInstanceOf(Response);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
			expect(await response.json()).toEqual({ message: "hello" });
		});

		test("serializes arrays", async () => {
			const response = json([1, 2, 3]);

			expect(await response.json()).toEqual([1, 2, 3]);
		});

		test("serializes primitives", async () => {
			expect(await json(null).text()).toBe("null");
			expect(await json(42).text()).toBe("42");
			expect(await json("hi").text()).toBe('"hi"');
		});

		test("honours a status from init", async () => {
			const response = json({ id: 1 }, { status: 201 });

			expect(response.status).toBe(201);
			expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
		});

		test("merges extra headers from init", () => {
			const response = json({ ok: true }, { headers: { "x-request-id": "abc" } });

			expect(response.headers.get("x-request-id")).toBe("abc");
			expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
		});

		test("lets init override the content-type", () => {
			const response = json({ ok: true }, { headers: { "content-type": "application/ld+json" } });

			expect(response.headers.get("content-type")).toBe("application/ld+json");
		});

		test("accepts a Headers instance in init", () => {
			const headers = new Headers({ "x-trace": "t-1" });
			const response = json({ ok: true }, { headers });

			expect(response.headers.get("x-trace")).toBe("t-1");
			expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
		});

		test("accepts an entry-array in init", () => {
			const response = json({ ok: true }, { headers: [["x-trace", "t-2"]] });

			expect(response.headers.get("x-trace")).toBe("t-2");
		});

		test("honours statusText from init", () => {
			const response = json({ ok: true }, { status: 201, statusText: "Created" });

			expect(response.statusText).toBe("Created");
		});
	});

	describe("text()", () => {
		test("returns a text/plain response", async () => {
			const response = text("hello");

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
			expect(await response.text()).toBe("hello");
		});

		test("honours status and headers from init", async () => {
			const response = text("nope", { status: 400, headers: { "x-reason": "bad" } });

			expect(response.status).toBe(400);
			expect(response.headers.get("x-reason")).toBe("bad");
			expect(await response.text()).toBe("nope");
		});

		test("lets init override the content-type", () => {
			const response = text("a,b", { headers: { "content-type": "text/csv" } });

			expect(response.headers.get("content-type")).toBe("text/csv");
		});
	});

	describe("html()", () => {
		test("returns a text/html response", async () => {
			const response = html("<h1>Hi</h1>");

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
			expect(await response.text()).toBe("<h1>Hi</h1>");
		});

		test("honours status and headers from init", () => {
			const response = html("<p>gone</p>", { status: 410, headers: { "x-page": "gone" } });

			expect(response.status).toBe(410);
			expect(response.headers.get("x-page")).toBe("gone");
		});

		test("lets init override the content-type", () => {
			const response = html("<x/>", { headers: { "content-type": "application/xhtml+xml" } });

			expect(response.headers.get("content-type")).toBe("application/xhtml+xml");
		});
	});

	describe("redirect()", () => {
		test("defaults to 302 with a Location header", async () => {
			const response = redirect("/login");

			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toBe("/login");
			expect(await response.text()).toBe("");
		});

		test("accepts an explicit status", () => {
			expect(redirect("/here", 301).status).toBe(301);
			expect(redirect("/here", 307).status).toBe(307);
			expect(redirect("/here", 308).status).toBe(308);
		});

		test("accepts absolute URLs", () => {
			const response = redirect("https://example.com/next", 303);

			expect(response.status).toBe(303);
			expect(response.headers.get("location")).toBe("https://example.com/next");
		});
	});

	describe("status()", () => {
		test("returns an empty response with the given code", async () => {
			const response = status(204);

			expect(response.status).toBe(204);
			expect(await response.text()).toBe("");
		});

		test("carries headers from init", () => {
			const response = status(202, { headers: { "x-job": "queued" } });

			expect(response.status).toBe(202);
			expect(response.headers.get("x-job")).toBe("queued");
		});

		test("ignores a status in init in favour of the code argument", () => {
			const response = status(418, { status: 200 });

			expect(response.status).toBe(418);
		});

		test("honours statusText from init", () => {
			const response = status(404, { statusText: "Nope" });

			expect(response.status).toBe(404);
			expect(response.statusText).toBe("Nope");
		});

		test("works for bodyless status codes", () => {
			expect(status(304).status).toBe(304);
			expect(status(205).status).toBe(205);
		});
	});
});
