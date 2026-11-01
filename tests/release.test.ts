import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("0.4.0 release baseline", () => {
	test("package version is 0.4.0", () => {
		expect(pkg.version).toBe("0.4.0");
	});

	test("@bunary/core is an optional ^0.4.0 peer", () => {
		expect(pkg.peerDependencies["@bunary/core"]).toBe("^0.4.0");
		expect(pkg.peerDependenciesMeta["@bunary/core"].optional).toBe(true);
	});

	test("@bunary/core devDependency comes from npm, not a vendored tarball", () => {
		expect(pkg.devDependencies["@bunary/core"]).toBe("^0.4.0");
		expect(existsSync(join(root, "vendor"))).toBe(false);
	});

	test("installed @bunary/core is 0.4.x", () => {
		const core = JSON.parse(read("node_modules/@bunary/core/package.json"));
		expect(core.version).toMatch(/^0\.4\./);
	});

	test("docs install the 0.4 line and never call a 1.0.0-rc current", () => {
		for (const file of ["README.md", "docs/index.md"]) {
			const text = read(file);
			expect(text).toContain("bun add @bunary/http@^0.4.0");
			expect(text).not.toContain("1.0.0-rc");
		}
	});

	test("CHANGELOG has a dated 0.4.0 heading directly below [Unreleased]", () => {
		const headings = read("CHANGELOG.md").match(/^## .*$/gm) ?? [];
		expect(headings[0]).toBe("## [Unreleased]");
		expect(headings[1]).toMatch(/^## \[0\.4\.0\] - \d{4}-\d{2}-\d{2}$/);
		expect(headings.filter((h) => h.startsWith("## [0.4.0]"))).toHaveLength(1);
	});
});
