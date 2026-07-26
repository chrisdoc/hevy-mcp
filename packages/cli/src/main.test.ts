import { describe, expect, it } from "vitest";
import { runCli } from "./main.js";

describe("CLI process contract", () => {
	it("prints help and version without credentials", async () => {
		let out = "";
		let err = "";
		const streams = {
			stdout: (text: string) => {
				out += text;
			},
			stderr: (text: string) => {
				err += text;
			},
		};
		expect(await runCli({ argv: ["--help"], env: {}, streams })).toBe(0);
		expect(out).toContain("workouts");
		expect(err).toBe("");
		out = "";
		expect(
			await runCli({ argv: ["--version"], env: {}, version: "1.2.3", streams }),
		).toBe(0);
		expect(out).toBe("1.2.3\n");
	});
	it("keeps missing credentials on stderr", async () => {
		let out = "";
		let err = "";
		const code = await runCli({
			argv: ["user"],
			env: {},
			streams: {
				stdout: (text) => {
					out += text;
				},
				stderr: (text) => {
					err += text;
				},
			},
		});
		expect(code).toBe(2);
		expect(out).toBe("");
		expect(err).toContain("HEVY_API_KEY");
	});
});
