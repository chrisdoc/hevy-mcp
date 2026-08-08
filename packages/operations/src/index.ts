import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	type RoutinesGetOperation,
	type RoutinesListOperation,
} from "./routines.js";
import {
	createWorkoutsListOperation,
	type WorkoutsListOperation,
} from "./workouts.js";

export {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	isRoutinesGetNotFound,
	isRoutinesListEndOfList,
	routinesGetDescriptor,
	routinesListDescriptor,
	type RoutinesGetAdapter,
	type RoutinesGetDescriptor,
	type RoutinesGetInput,
	type RoutinesGetOperation,
	type RoutinesGetOutput,
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
		readonly get: RoutinesGetOperation;
		readonly list: RoutinesListOperation;
	};
	readonly workouts: {
		readonly list: WorkoutsListOperation;
	};
}

export function createOperations(client: HevyClient): HevyOperations {
	return {
		routines: {
			get: createRoutinesGetOperation(client),
			list: createRoutinesListOperation(client),
		},
		workouts: {
			list: createWorkoutsListOperation(client),
		},
	};
}
