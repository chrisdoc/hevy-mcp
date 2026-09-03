import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	getRequestEffectClient,
	type HevyRequestEffectClient,
} from "@hevy-mcp/hevy-client/internal";
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

type ExistingRequestEffectClient = Pick<
	HevyRequestEffectClient,
	"getWorkouts" | "getWorkout" | "getRoutines" | "getRoutineById"
>;

export function createOperations(client: HevyClient): HevyOperations {
	let requestEffectClient: HevyRequestEffectClient | undefined;
	const getRequestEffectClientOnce = (): HevyRequestEffectClient => {
		requestEffectClient ??= getRequestEffectClient(client);
		return requestEffectClient;
	};
	const lazyRequestEffectClient: ExistingRequestEffectClient = {
		getWorkouts: (...args) => getRequestEffectClientOnce().getWorkouts(...args),
		getWorkout: (...args) => getRequestEffectClientOnce().getWorkout(...args),
		getRoutines: (...args) => getRequestEffectClientOnce().getRoutines(...args),
		getRoutineById: (...args) =>
			getRequestEffectClientOnce().getRoutineById(...args),
	};
	return {
		routines: {
			get: createRoutinesGetOperation(lazyRequestEffectClient),
			list: createRoutinesListOperation(lazyRequestEffectClient),
		},
		workouts: {
			get: createWorkoutsGetOperation(lazyRequestEffectClient),
			list: createWorkoutsListOperation(lazyRequestEffectClient),
		},
	};
}
