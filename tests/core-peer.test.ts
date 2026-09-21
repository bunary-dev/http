import { describe, expect, test } from "bun:test";
import { createApp, createToken } from "@bunary/core";

describe("@bunary/core peer resolution", () => {
	test("createToken resolves and is callable", () => {
		expect(typeof createToken).toBe("function");
		const token = createToken<string>("test-token");
		expect(token).toBeDefined();
		expect(String(token)).toBe("Token(test-token)");
	});

	test("createApp resolves and is callable", () => {
		expect(typeof createApp).toBe("function");
		const app = createApp({ config: { app: { name: "http-peer-test" } } });
		expect(app).toBeDefined();
		expect(app.booted).toBe(false);
	});
});
