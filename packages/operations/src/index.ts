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
	createBodyMeasurementsListOperation,
	type BodyMeasurementsListOperation,
} from "./body-measurements.js";
import {
	createWorkoutsEventsOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	type WorkoutsEventsOperation,
	type WorkoutsGetOperation,
	type WorkoutsListOperation,
} from "./workouts.js";

export {
	createRoutinesGetOperation,
	createRoutinesListOperation,
	routinesGetDescriptor,
	routinesListDescriptor,
} from "./routines.js";
export type {
	RoutinesGetAdapter,
	RoutinesGetDescriptor,
	RoutinesGetInput,
	RoutinesGetOperation,
	RoutinesGetOutput,
	RoutinesListAdapter,
	RoutinesListDescriptor,
	RoutinesListInput,
	RoutinesListOperation,
	RoutinesListOutput,
} from "./routines.js";
export {
	createBodyMeasurementsListOperation,
	bodyMeasurementsListDescriptor,
} from "./body-measurements.js";
export type {
	BodyMeasurementsListAdapter,
	BodyMeasurementsListDescriptor,
	BodyMeasurementsListInput,
	BodyMeasurementsListOperation,
	BodyMeasurementsListOutput,
} from "./body-measurements.js";
export {
	createWorkoutsEventsOperation,
	createWorkoutsGetOperation,
	createWorkoutsListOperation,
	workoutsEventsDescriptor,
	workoutsGetDescriptor,
	workoutsListDescriptor,
} from "./workouts.js";
export type {
	WorkoutsEventsAdapter,
	WorkoutsEventsDescriptor,
	WorkoutsEventsInput,
	WorkoutsEventsOperation,
	WorkoutsEventsOutput,
	WorkoutsGetAdapter,
	WorkoutsGetDescriptor,
	WorkoutsGetInput,
	WorkoutsGetOperation,
	WorkoutsGetOutput,
	WorkoutsListAdapter,
	WorkoutsListDescriptor,
	WorkoutsListInput,
	WorkoutsListOperation,
	WorkoutsListOutput,
} from "./workouts.js";
export { PaginationMismatchError } from "./operation-errors.js";
export type {
	ExpectedReadError,
	ReadCollectionEndpoint,
	ReadEndpoint,
	ReadMemberEndpoint,
	ReadOperationError,
} from "./operation-errors.js";

export interface HevyOperations {
	readonly routines: {
		readonly get: RoutinesGetOperation;
		readonly list: RoutinesListOperation;
	};
	readonly workouts: {
		readonly events?: WorkoutsEventsOperation;
		readonly get: WorkoutsGetOperation;
		readonly list: WorkoutsListOperation;
	};
	readonly bodyMeasurements?: {
		readonly list: BodyMeasurementsListOperation;
	};
}

type ExistingRequestEffectClient = Pick<
	HevyRequestEffectClient,
	| "getBodyMeasurements"
	| "getWorkoutEvents"
	| "getWorkouts"
	| "getWorkout"
	| "getRoutines"
	| "getRoutineById"
>;

export function createOperations(client: HevyClient): HevyOperations {
	let requestEffectClient: HevyRequestEffectClient | undefined;
	const getRequestEffectClientOnce = (): HevyRequestEffectClient => {
		requestEffectClient ??= getRequestEffectClient(client);
		return requestEffectClient;
	};
	const lazyRequestEffectClient: ExistingRequestEffectClient = {
		getBodyMeasurements: (...args) =>
			getRequestEffectClientOnce().getBodyMeasurements(...args),
		getWorkoutEvents: (...args) =>
			getRequestEffectClientOnce().getWorkoutEvents(...args),
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
			events: createWorkoutsEventsOperation(lazyRequestEffectClient),
			get: createWorkoutsGetOperation(lazyRequestEffectClient),
			list: createWorkoutsListOperation(lazyRequestEffectClient),
		},
		bodyMeasurements: {
			list: createBodyMeasurementsListOperation(lazyRequestEffectClient),
		},
	};
}
