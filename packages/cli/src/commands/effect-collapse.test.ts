import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandSource = readFileSync(
	new URL("./index.ts", import.meta.url),
	"utf8",
);

function assertExecuteAdapter(source: string): void {
	expect(source.match(/Effect\.runPromise/g)).toHaveLength(1);
	expect(source.match(/\bcollapse(?:<[^>]+>)?\(/g)).toHaveLength(4);
	expect(source).not.toMatch(/Effect\.(catch|catchIf|map|tryPromise|promise)/);
	expect(source).not.toMatch(/while\s*\(/);
}

describe("CLI Effect collapse", () => {
	it("keeps one collapse helper for every command execution path", () => {
		assertExecuteAdapter(commandSource);
	});
});
