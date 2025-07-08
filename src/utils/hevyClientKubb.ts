import type {
	RequestConfig,
	ResponseConfig,
} from "@kubb/plugin-client/clients/axios";
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

// Define a proper client type that matches the Kubb client interface
type KubbClient = {
	<TData, _TError = unknown, TVariables = unknown>(
		config: RequestConfig<TVariables>,
	): Promise<ResponseConfig<TData>>;
	getConfig: () => Partial<RequestConfig<unknown>>;
	setConfig: (config: RequestConfig) => Partial<RequestConfig<unknown>>;
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

	// Return an object with all the API methods using ReturnType for automatic type inference
	return {
		// Workouts
		getWorkouts: (
			params?: GetV1WorkoutsQueryParams,
		): ReturnType<typeof api.getV1Workouts> =>
			api.getV1Workouts(headers, params, { client }),
		getWorkout: (
			workoutId: string,
		): ReturnType<typeof api.getV1WorkoutsWorkoutid> =>
			api.getV1WorkoutsWorkoutid(workoutId, headers, { client }),
		createWorkout: (
			data: PostV1WorkoutsMutationRequest,
		): ReturnType<typeof api.postV1Workouts> =>
			api.postV1Workouts(headers, data, { client }),
		updateWorkout: (
			workoutId: string,
			data: PutV1WorkoutsWorkoutidMutationRequest,
		): ReturnType<typeof api.putV1WorkoutsWorkoutid> =>
			api.putV1WorkoutsWorkoutid(workoutId, headers, data, {
				client,
			}),
		getWorkoutCount: (): ReturnType<typeof api.getV1WorkoutsCount> =>
			api.getV1WorkoutsCount(headers, { client }),
		getWorkoutEvents: (
			params?: GetV1WorkoutsEventsQueryParams,
		): ReturnType<typeof api.getV1WorkoutsEvents> =>
			api.getV1WorkoutsEvents(headers, params, { client }),

		// Routines
		getRoutines: (
			params?: GetV1RoutinesQueryParams,
		): ReturnType<typeof api.getV1Routines> =>
			api.getV1Routines(headers, params, { client }),
		getRoutineById: (
			routineId: string,
		): ReturnType<typeof api.getV1RoutinesRoutineid> =>
			api.getV1RoutinesRoutineid(routineId, headers, { client }),
		createRoutine: (
			data: PostV1RoutinesMutationRequest,
		): ReturnType<typeof api.postV1Routines> =>
			api.postV1Routines(headers, data, { client }),
		updateRoutine: (
			routineId: string,
			data: PutV1RoutinesRoutineidMutationRequest,
		): ReturnType<typeof api.putV1RoutinesRoutineid> =>
			api.putV1RoutinesRoutineid(routineId, headers, data, {
				client,
			}),

		// Exercise Templates
		getExerciseTemplates: (
			params?: GetV1ExerciseTemplatesQueryParams,
		): ReturnType<typeof api.getV1ExerciseTemplates> =>
			api.getV1ExerciseTemplates(headers, params, { client }),
		getExerciseTemplate: (
			templateId: string,
		): ReturnType<typeof api.getV1ExerciseTemplatesExercisetemplateid> =>
			api.getV1ExerciseTemplatesExercisetemplateid(templateId, headers, {
				client,
			}),

		// Routine Folders
		getRoutineFolders: (
			params?: GetV1RoutineFoldersQueryParams,
		): ReturnType<typeof api.getV1RoutineFolders> =>
			api.getV1RoutineFolders(headers, params, { client }),
		createRoutineFolder: (
			data: PostV1RoutineFoldersMutationRequest,
		): ReturnType<typeof api.postV1RoutineFolders> =>
			api.postV1RoutineFolders(headers, data, { client }),
		getRoutineFolder: (
			folderId: string,
		): ReturnType<typeof api.getV1RoutineFoldersFolderid> =>
			api.getV1RoutineFoldersFolderid(folderId, headers, {
				client,
			}),

		// Webhooks
		getWebhookSubscription: (): ReturnType<
			typeof api.getV1WebhookSubscription
		> => api.getV1WebhookSubscription(headers, { client }),
		createWebhookSubscription: (
			data: import("../generated/client/types").PostV1WebhookSubscriptionMutationRequest,
		): ReturnType<typeof api.postV1WebhookSubscription> =>
			api.postV1WebhookSubscription(headers, data, { client }),
		deleteWebhookSubscription: (): ReturnType<
			typeof api.deleteV1WebhookSubscription
		> => api.deleteV1WebhookSubscription(headers, { client }),
	};
}
