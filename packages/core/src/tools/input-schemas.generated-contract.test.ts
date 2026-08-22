import { describe, expect, it } from "vitest";

import {
	postRoutinesRequestSetSchema,
	postWorkoutsRequestSetSchema,
} from "@hevy-mcp/hevy-client/schemas";
import { routineSetFields, workoutSetFields } from "./input-schemas.js";

/**
 * The MCP input schemas deliberately diverge from the generated client
 * schemas (coercion, defaults, stricter IDs) but their enum vocabularies are
 * pure copies. These tests pin the copies to the generated source so an
 * upstream enum change surfaces here instead of silently drifting.
 */

const ACCEPTED_RPE = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;
const REJECTED_RPE = [0, 5.5, 6.4, 11, "7", null];

describe("input schema enums match the generated client", () => {
	it("workout set RPE accepts exactly what the generated client accepts", () => {
		for (const value of ACCEPTED_RPE) {
			expect(workoutSetFields.rpe.safeParse(value).success).toBe(true);
			expect(
				postWorkoutsRequestSetSchema.shape.rpe.safeParse(value).success,
			).toBe(true);
		}
		for (const value of REJECTED_RPE) {
			expect(workoutSetFields.rpe.safeParse(value).success).toBe(
				postWorkoutsRequestSetSchema.shape.rpe.safeParse(value).success,
			);
		}
	});

	it("neither side accepts RPE for routine sets; keep pinned", () => {
		// Neither the generated client nor the MCP input contract accepts RPE
		// on routine sets today. If upstream adds it, this forces a conscious
		// decision to expose it through the tool surface rather than drift.
		expect("rpe" in postRoutinesRequestSetSchema.shape).toBe(false);
		expect("rpe" in routineSetFields).toBe(false);
	});

	it("set type vocabulary matches the generated client", () => {
		for (const value of ["warmup", "normal", "failure", "dropset"] as const) {
			expect(workoutSetFields.type.safeParse(value).success).toBe(true);
			expect(
				postWorkoutsRequestSetSchema.shape.type.safeParse(value).success,
			).toBe(true);
		}
		for (const value of ["intensity", "", "NORMAL"]) {
			expect(workoutSetFields.type.safeParse(value).success).toBe(false);
			expect(
				postWorkoutsRequestSetSchema.shape.type.safeParse(value).success,
			).toBe(false);
		}
	});
});
