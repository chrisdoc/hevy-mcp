import type { HevyClient } from "@hevy-mcp/hevy-client";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "./main.js";

const streams = () => {
	let out = "";
	let err = "";
	return {
		streams: {
			stdout: (text: string) => {
				out += text;
			},
			stderr: (text: string) => {
				err += text;
			},
		},
		get out() {
			return out;
		},
		get err() {
			return err;
		},
	};
};

describe("CLI process contract", () => {
	it("prints help and version without credentials", async () => {
		const io = streams();
		expect(
			await runCli({ argv: ["--help"], env: {}, streams: io.streams }),
		).toBe(0);
		expect(io.out).toContain("workouts");
		expect(io.err).toBe("");
		const outBeforeVersion = io.out;
		expect(
			await runCli({ argv: ["--version"], env: {}, streams: io.streams }),
		).toBe(0);
		expect(io.out.slice(outBeforeVersion.length)).toBe("0.0.0\n");
	});

	it("keeps missing credentials on stderr", async () => {
		const io = streams();
		const code = await runCli({ argv: ["user"], env: {}, streams: io.streams });
		expect(code).toBe(2);
		expect(io.out).toBe("");
		expect(io.err).toContain("HEVY_API_KEY");
	});

	it("returns a concise semantic error without calling the API", async () => {
		const io = streams();
		const getWorkouts = vi.fn();
		const code = await runCli({
			argv: ["workouts", "list", "--page", "0"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => ({ getWorkouts }) as unknown as HevyClient,
		});
		expect(code).toBe(2);
		expect(io.out).toBe("");
		expect(io.err).toBe("--page must be a positive integer\n");
		expect(io.err).not.toContain("ZodError");
		expect(getWorkouts).not.toHaveBeenCalled();
	});

	it("passes coerced API-shaped values to the client", async () => {
		const io = streams();
		const getWorkouts = vi.fn().mockResolvedValue({
			page: 2,
			page_count: 2,
			workouts: [],
		});
		const code = await runCli({
			argv: ["workouts", "list", "--page", "2", "--page-size", "10"],
			env: { HEVY_API_KEY: "key" },
			streams: io.streams,
			clientFactory: () => ({ getWorkouts }) as unknown as HevyClient,
		});
		expect(code).toBe(0);
		expect(getWorkouts).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
		expect(io.err).toBe("");
	});
});
