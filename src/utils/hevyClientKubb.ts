import axios from "axios";
import type { AxiosInstance } from "axios";
import * as api from "../generated/client/api";
import type {
	GetV1ExerciseTemplatesQueryParams,
	GetV1RoutineFoldersQueryParams,
	GetV1RoutinesQueryParams,
	GetV1WorkoutsEventsQueryParams,
	GetV1WorkoutsQueryParams,
	PostV1RoutineFoldersMutationRequest,
	PostV1RoutinesMutationRequest,
	PostV1WorkoutsMutationRequest,
	PutV1RoutinesRoutineidMutationRequest,
	PutV1WorkoutsWorkoutidMutationRequest,
} from "../generated/client/types";

// Define a type that matches the expected client interface
type KubbClient = {
	<TData, TError = unknown, TVariables = unknown>(
		config: Record<string, unknown>,
	): Promise<unknown>;
	getConfig: () => Partial<Record<string, unknown>>;
	setConfig: (
		config: Record<string, unknown>,
	) => Partial<Record<string, unknown>>;
};

export function createClient(
	apiKey: string,
	baseUrl = "https://api.hevyapp.com",
) {
	// Create an axios instance with the API key
	const axiosInstance = axios.create({
		baseURL: baseUrl,
		headers: {
			"api-key": apiKey,
		},
	});

	// Create headers object with API key
	const headers = {
		"api-key": apiKey,
	};

	// Cast axios instance to the expected client type
	const client = axiosInstance as unknown as KubbClient;

	// Return an object with all the API methods
	return {
		// Workouts
		getWorkouts: (params?: GetV1WorkoutsQueryParams) =>
			api.getV1Workouts(headers, params, { client }),
		getWorkout: (workoutId: string) =>
			api.getV1WorkoutsWorkoutid(workoutId, headers, { client }),
		createWorkout: (data: PostV1WorkoutsMutationRequest) =>
			api.postV1Workouts(headers, data, { client }),
		updateWorkout: (
			workoutId: string,
			data: PutV1WorkoutsWorkoutidMutationRequest,
		) =>
			api.putV1WorkoutsWorkoutid(workoutId, headers, data, {
				client,
			}),
		getWorkoutCount: () => api.getV1WorkoutsCount(headers, { client }),
		getWorkoutEvents: (params?: GetV1WorkoutsEventsQueryParams) =>
			api.getV1WorkoutsEvents(headers, params, { client }),

		// Routines
		getRoutines: (params?: GetV1RoutinesQueryParams) =>
			api.getV1Routines(headers, params, { client }),
		createRoutine: (data: PostV1RoutinesMutationRequest) =>
			api.postV1Routines(headers, data, { client }),
		updateRoutine: (
			routineId: string,
			data: PutV1RoutinesRoutineidMutationRequest,
		) =>
			api.putV1RoutinesRoutineid(routineId, headers, data, {
				client,
			}),

		// Exercise Templates
		getExerciseTemplates: (params?: GetV1ExerciseTemplatesQueryParams) =>
			api.getV1ExerciseTemplates(headers, params, { client }),
		getExerciseTemplate: (templateId: string) =>
			api.getV1ExerciseTemplatesExercisetemplateid(templateId, headers, {
				client,
			}),

		// Routine Folders
		getRoutineFolders: (params?: GetV1RoutineFoldersQueryParams) =>
			api.getV1RoutineFolders(headers, params, { client }),
		createRoutineFolder: (data: PostV1RoutineFoldersMutationRequest) =>
			api.postV1RoutineFolders(headers, data, { client }),
		getRoutineFolder: (folderId: string) =>
			api.getV1RoutineFoldersFolderid(folderId, headers, {
				client,
			}),
	};
}
