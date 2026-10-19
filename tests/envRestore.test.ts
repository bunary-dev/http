import { describe, expect, test } from "bun:test";
import { restoreEnv } from "./support/env.js";

describe("restoreEnv", () => {
	test("unsets the variable when the original was undefined", () => {
		Bun.env.BUNARY_TEST_ENV = "set";
		restoreEnv("BUNARY_TEST_ENV", undefined);
		expect("BUNARY_TEST_ENV" in Bun.env).toBe(false);
		expect(Bun.env.BUNARY_TEST_ENV).toBeUndefined();
	});

	test("restores a defined original", () => {
		Bun.env.BUNARY_TEST_ENV = "changed";
		restoreEnv("BUNARY_TEST_ENV", "orig");
		expect(Bun.env.BUNARY_TEST_ENV).toBe("orig");
		restoreEnv("BUNARY_TEST_ENV", undefined);
	});
});
