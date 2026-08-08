import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { GetV1Workouts200 } from "@hevy-mcp/hevy-client/types";
import { getWorkoutsCapabilityDescriptor } from "@hevy-mcp/core";

export const deterministicWorkout = {
	id: "workout-1",
	title: "Contract fixture",
	start_time: "2025-01-01T10:00:00Z",
	end_time: "2025-01-01T10:30:00Z",
	exercises: [],
} satisfies NonNullable<GetV1Workouts200["workouts"]>[number];

/** Minimal generated-client result consumed by the production get-workouts tool. */
export const deterministicGetWorkoutsResult: GetV1Workouts200 = {
	page: 1,
	workouts: [deterministicWorkout],
	page_count: 1,
};

/** Valid structured output, parsed with the production capability schema. */
export const validGetWorkoutsOutput =
	getWorkoutsCapabilityDescriptor.outputSchema.parse({
		workouts: [
			{
				id: "workout-1",
				title: "Contract fixture",
				start_time: "2025-01-01T10:00:00Z",
				end_time: "2025-01-01T10:30:00Z",
				duration: "0h 30m 0s",
				exercise_count: 0,
				set_count: 0,
			},
		],
		page: 1,
		page_count: 1,
		has_next_page: false,
	});

/** Deterministic client shared by every adapter case in the initial matrix. */
export function createDeterministicHevyClient(): HevyClient {
	const getWorkouts: HevyClient["getWorkouts"] = (params) =>
		Promise.resolve().then(() => {
			if (params?.page !== 1 || params.pageSize !== 5) {
				throw new Error(
					"Contract fixture received unexpected pagination input",
				);
			}
			return deterministicGetWorkoutsResult;
		});
	const getUserInfo: HevyClient["getUserInfo"] = () =>
		Promise.resolve({ data: { id: "contract-user" } });
	return { getWorkouts, getUserInfo } as unknown as HevyClient;
}
