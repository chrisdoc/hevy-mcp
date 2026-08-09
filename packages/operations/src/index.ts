import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	createRoutinesListOperation,
	type RoutinesListOperation,
} from "./routines.js";
import {
	createWorkoutsListOperation,
	type WorkoutsListOperation,
} from "./workouts.js";

export {
	createRoutinesListOperation,
	isRoutinesListEndOfList,
	routinesListDescriptor,
	type RoutinesListAdapter,
	type RoutinesListDescriptor,
	type RoutinesListInput,
	type RoutinesListOperation,
	type RoutinesListOutput,
} from "./routines.js";
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
	readonly routines: {
		readonly list: RoutinesListOperation;
	};
	readonly workouts: {
		readonly list: WorkoutsListOperation;
	};
}

export function createOperations(client: HevyClient): HevyOperations {
	return {
		routines: {
			list: createRoutinesListOperation(client),
		},
		workouts: {
			list: createWorkoutsListOperation(client),
		},
	};
}
