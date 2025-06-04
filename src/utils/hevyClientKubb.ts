import axios from "axios";
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

	// Return an object with all the API methods
	return {
		// Workouts
		getWorkouts: (params?: GetV1WorkoutsQueryParams) =>
			api.getV1Workouts(headers, params, { client: axiosInstance }),
		getWorkout: (workoutId: string) =>
			api.getV1WorkoutsWorkoutid(workoutId, headers, { client: axiosInstance }),
		createWorkout: (data: PostV1WorkoutsMutationRequest) =>
			api.postV1Workouts(headers, data, { client: axiosInstance }),
		updateWorkout: (
			workoutId: string,
			data: PutV1WorkoutsWorkoutidMutationRequest,
		) =>
			api.putV1WorkoutsWorkoutid(workoutId, headers, data, {
				client: axiosInstance,
			}),
		getWorkoutCount: () =>
			api.getV1WorkoutsCount(headers, undefined, { client: axiosInstance }),
		getWorkoutEvents: (params?: GetV1WorkoutsEventsQueryParams) =>
			api.getV1WorkoutsEvents(headers, params, { client: axiosInstance }),

		// Routines
		getRoutines: (params?: GetV1RoutinesQueryParams) =>
			api.getV1Routines(headers, params, { client: axiosInstance }),
		createRoutine: (data: PostV1RoutinesMutationRequest) =>
			api.postV1Routines(headers, data, { client: axiosInstance }),
		updateRoutine: (
			routineId: string,
			data: PutV1RoutinesRoutineidMutationRequest,
		) =>
			api.putV1RoutinesRoutineid(routineId, headers, data, {
				client: axiosInstance,
			}),

		// Exercise Templates
		getExerciseTemplates: (params?: GetV1ExerciseTemplatesQueryParams) =>
			api.getV1ExerciseTemplates(headers, params, { client: axiosInstance }),
		getExerciseTemplate: (templateId: string) =>
			api.getV1ExerciseTemplatesExercisetemplateid(templateId, headers, {
				client: axiosInstance,
			}),

		// Routine Folders
		getRoutineFolders: (params?: GetV1RoutineFoldersQueryParams) =>
			api.getV1RoutineFolders(headers, params, { client: axiosInstance }),
		createRoutineFolder: (data: PostV1RoutineFoldersMutationRequest) =>
			api.postV1RoutineFolders(headers, data, { client: axiosInstance }),
		getRoutineFolder: (folderId: string) =>
			api.getV1RoutineFoldersFolderid(folderId, headers, {
				client: axiosInstance,
			}),
	};
}
