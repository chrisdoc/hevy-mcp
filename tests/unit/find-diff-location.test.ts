import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const findDiffLocation =
	require("../../.cm/plugins/filters/findDiffLocation/index.js") as (
		source: unknown,
		pattern: RegExp | string,
		includePath?: RegExp | string,
		excludePath?: RegExp | string,
	) => string;

function find(
	files: unknown[],
	pattern: RegExp | string,
	includePath?: RegExp | string,
	excludePath?: RegExp | string,
) {
	return JSON.parse(
		findDiffLocation({ diff: { files } }, pattern, includePath, excludePath),
	);
}

describe("findDiffLocation", () => {
	it("returns the first added match across multiple files and hunks", () => {
		const result = find(
			[
				{
					new_file: "src/first.ts",
					diff: "@@ -1,2 +1,2 @@\n-old\n+safe\n context",
				},
				{
					new_file: "src/second.ts",
					diff: [
						"@@ -2,2 +2,2 @@",
						" unchanged",
						"+safe",
						"@@ -20,2 +30,3 @@",
						" context",
						"+const value = input as unknown;",
						"+after",
					].join("\n"),
				},
			],
			/\bas\s+(?:any|unknown)\b/,
		);

		expect(result).toEqual({
			found: true,
			file_name: "src/second.ts",
			start_line: 31,
		});
	});

	it("accounts for context and removed lines without advancing new lines", () => {
		const result = find(
			[
				{
					new_file: "src/example.ts",
					diff: [
						"@@ -10,5 +20,6 @@",
						" context",
						"-console.log('removed')",
						"\\ No newline at end of file",
						"-another removed line",
						"+replacement",
						"+console.log('added')",
					].join("\n"),
				},
			],
			/console\.log/,
		);

		expect(result.start_line).toBe(22);
	});

	it("does not advance for deleted source lines beginning with --", () => {
		const result = find(
			[
				{
					new_file: "src/decrement.ts",
					diff: [
						"--- a/src/decrement.ts",
						"+++ b/src/decrement.ts",
						"@@ -10,3 +10,3 @@",
						" context",
						"---value",
						"+replacement",
						"+console.log('added')",
					].join("\n"),
				},
			],
			/console\.log/,
		);

		expect(result).toEqual({
			found: true,
			file_name: "src/decrement.ts",
			start_line: 12,
		});
	});

	it("matches added source lines beginning with ++", () => {
		const result = find(
			[
				{
					new_file: "src/increment.ts",
					diff: [
						"--- a/src/increment.ts",
						"+++ b/src/increment.ts",
						"@@ -4 +4 @@",
						"+++(value as any)",
					].join("\n"),
				},
			],
			/\bas\s+(?:any|unknown)\b/,
		);

		expect(result).toEqual({
			found: true,
			file_name: "src/increment.ts",
			start_line: 4,
		});
	});

	it("accepts hunk headers with section context", () => {
		const result = find(
			[
				{
					new_file: "src/section.ts",
					diff: [
						"@@ -10,2 +20,2 @@ export function run() {",
						" context",
						"+console.log('added')",
					].join("\n"),
				},
			],
			/console\.log/,
		);

		expect(result).toEqual({
			found: true,
			file_name: "src/section.ts",
			start_line: 21,
		});
	});

	it("supports omitted hunk counts and Windows line endings", () => {
		const result = find(
			[
				{
					new_file: "src/windows.ts",
					diff: "@@ -7 +9 @@\r\n-old\r\n+console.log('added')\r\n",
				},
			],
			/console\.log/,
		);

		expect(result.start_line).toBe(9);
	});

	it("ignores nonmatches and matches that only occur on deleted lines", () => {
		const result = find(
			[
				{
					new_file: "src/example.ts",
					diff: "@@ -1,2 +1,2 @@\n-console.log('deleted')\n+safe()",
				},
			],
			/console\.log/,
		);

		expect(result).toEqual({
			found: false,
			file_name: "",
			start_line: 0,
		});
	});

	it("applies path inclusion and exclusion patterns", () => {
		const files = [
			{
				new_file: "docs/example.ts",
				diff: "@@ -0,0 +1 @@\n+console.log('docs')",
			},
			{
				new_file: "src/generated/client.ts",
				diff: "@@ -0,0 +1 @@\n+console.log('generated')",
			},
			{
				new_file: "src/example.test.ts",
				diff: "@@ -0,0 +1 @@\n+console.log('test')",
			},
			{
				new_file: "src/fixtures/example.ts",
				diff: "@@ -0,0 +1 @@\n+console.log('fixture')",
			},
			{
				new_file: "src/tools/example.ts",
				diff: "@@ -0,0 +4 @@\n+console.log('source')",
			},
		];

		const result = find(
			files,
			/console\.log/,
			/^src\/.*\.tsx?$/,
			/(?:^src\/generated\/|(?:^|\/)(?:__fixtures__|fixtures?)\/|(?:\.test|\.spec)\.tsx?$)/,
		);

		expect(result).toEqual({
			found: true,
			file_name: "src/tools/example.ts",
			start_line: 4,
		});
	});

	it.each([
		[null, /match/],
		[{}, /match/],
		[{ diff: { files: "invalid" } }, /match/],
		[{ diff: { files: [] } }, "["],
	])(
		"returns a safe nonmatch for invalid source or regex",
		(source, pattern) => {
			expect(JSON.parse(findDiffLocation(source, pattern))).toEqual({
				found: false,
				file_name: "",
				start_line: 0,
			});
		},
	);

	it("returns a safe nonmatch for invalid path regexes", () => {
		const files = [
			{
				new_file: "src/example.ts",
				diff: "@@ -0,0 +1 @@\n+console.log('source')",
			},
		];

		expect(find(files, /console\.log/, "[")).toEqual({
			found: false,
			file_name: "",
			start_line: 0,
		});
	});
});

describe("gitStream inline comment configuration", () => {
	const config = readFileSync(".cm/gitstream.cm", "utf8");

	it("preserves expression result types before gitStream renders the template", () => {
		expect(config).toContain("approve_on_LGTM: {{ calc.safe_changes }}");
		expect(config).toContain("- {{ diff_location.unsafe_assertion.found }}");
		expect(config).toContain(
			"start_line: {{ diff_location.unsafe_assertion.start_line }}",
		);
		expect(config).toContain("unsafe_assertion: {{ source | findDiffLocation(");
		expect(config).not.toMatch(/^\s*-\s+"{{.+}}"\s*$/m);
		expect(config).not.toMatch(/^\s*start_line:\s+"{{.+}}"\s*$/m);
	});

	it("keeps interpolated string action arguments quoted", () => {
		expect(config).toContain(
			'file_path: "{{ diff_location.unsafe_assertion.file_name }}"',
		);
		expect(config).toContain(
			'file_path: "{{ diff_location.console_log.file_name }}"',
		);
		expect(config).not.toMatch(/^\s+file_name:/m);
	});
});
