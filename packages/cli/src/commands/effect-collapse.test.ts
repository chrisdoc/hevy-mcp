import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const collapseBoundaryFiles = ["context.ts", "measurements.ts"];
const commandFiles = readdirSync(new URL(".", import.meta.url)).filter(
	(path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
);
const commandSource = collapseBoundaryFiles
	.map((path) => readFileSync(new URL(`./${path}`, import.meta.url), "utf8"))
	.join("\n");
const otherCommandFiles = commandFiles.filter(
	(path) => !collapseBoundaryFiles.includes(path),
);

function assertExecuteAdapter(source: string): void {
	expect(source.match(/Effect\.runPromise/g)).toHaveLength(1);
	expect(source.match(/\bcollapse(?:<[^>]+>)?\(/g)).toHaveLength(4);
	expect(source).not.toMatch(/Effect\.(catch|catchIf|map|tryPromise|promise)/);
	expect(source).not.toMatch(/while\s*\(/);
}

describe("CLI Effect collapse", () => {
	it("keeps one collapse helper at the Effect-to-Promise command boundary", () => {
		assertExecuteAdapter(commandSource);
	});

	it("keeps other command modules from collapsing Effects directly", () => {
		for (const path of otherCommandFiles) {
			const source = readFileSync(
				new URL(`./${path}`, import.meta.url),
				"utf8",
			);
			expect(source).not.toMatch(/Effect\.runPromise|\bcollapse(?:<[^>]+>)?\(/);
			expect(source).not.toMatch(
				/Effect\.(catch|catchIf|map|tryPromise|promise)/,
			);
			expect(source).not.toMatch(/while\s*\(/);
		}
	});
});
