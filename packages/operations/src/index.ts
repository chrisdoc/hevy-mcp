import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	createWorkoutsListOperation,
	type WorkoutsListOperation,
} from "./workouts.js";

export {
	createWorkoutsListOperation,
	isWorkoutsListEndOfList,
	workoutsListDescriptor,
	type WorkoutsListAdapter,
	type WorkoutsListDescriptor,
	type WorkoutsListInput,
	type WorkoutsListOperation,
	type WorkoutsListOutput,
} from "./workouts.js";

export interface HevyOperations {
	readonly workouts: {
		readonly list: WorkoutsListOperation;
	};
}

export function createOperations(client: HevyClient): HevyOperations {
	return {
		workouts: {
			list: createWorkoutsListOperation(client),
		},
	};
}
