import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	type RoutinesGetOperation,
	type RoutinesListOperation,
} from "./routines.js";
import {
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	type WorkoutsGetOperation,
	type WorkoutsListOperation,
} from "./workouts.js";

export { routinesGetDescriptor, routinesListDescriptor } from "./routines.js";
export { workoutsGetDescriptor, workoutsListDescriptor } from "./workouts.js";

export interface HevyOperations {
	readonly routines: {
		readonly get: RoutinesGetOperation;
		readonly list: RoutinesListOperation;
	};
	readonly workouts: {
		readonly get: WorkoutsGetOperation;
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
			get: createWorkoutsGetOperation(client),
			list: createWorkoutsListOperation(client),
		},
	};
}
