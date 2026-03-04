import type {
	CreateCustomExerciseRequestBody,
	GetV1ExerciseHistoryExercisetemplateidResponses,
	GetV1ExerciseTemplatesExercisetemplateidResponses,
	GetV1ExerciseTemplatesResponses,
	GetV1RoutineFoldersFolderidResponses,
	GetV1RoutineFoldersResponses,
	GetV1RoutinesResponses,
	GetV1RoutinesRoutineidResponses,
	GetV1WorkoutsCountResponses,
	GetV1WorkoutsEventsResponses,
	GetV1WorkoutsResponses,
	GetV1WorkoutsWorkoutidResponses,
	PostRoutineFolderRequestBody,
	PostRoutinesRequestBody,
	PostV1ExerciseTemplatesResponses,
	PostV1RoutineFoldersResponses,
	PostV1RoutinesResponses,
	PostV1WorkoutsResponses,
	PostWorkoutsRequestBody,
	PutRoutinesRequestBody,
	PutV1RoutinesRoutineidResponses,
	PutV1WorkoutsWorkoutidResponses,
} from "hevy-api-client";
import {
	createConfig,
	createClient as createHevyApiClient,
	getV1ExerciseHistoryExercisetemplateid,
	getV1ExerciseTemplates,
	getV1ExerciseTemplatesExercisetemplateid,
	getV1RoutineFolders,
	getV1RoutineFoldersFolderid,
	getV1Routines,
	getV1RoutinesRoutineid,
	getV1Workouts,
	getV1WorkoutsCount,
	getV1WorkoutsEvents,
	getV1WorkoutsWorkoutid,
	postV1ExerciseTemplates,
	postV1RoutineFolders,
	postV1Routines,
	postV1Workouts,
	putV1RoutinesRoutineid,
	putV1WorkoutsWorkoutid,
} from "hevy-api-client";

const DEFAULT_HEVY_API_BASE_URL = "https://api.hevyapp.com";

export function createClient(
	apiKey: string,
	baseUrl = DEFAULT_HEVY_API_BASE_URL,
) {
	const client = createHevyApiClient(
		createConfig({
			baseURL: baseUrl,
			throwOnError: true,
		}),
	);

	const headers = { "api-key": apiKey } as const;

	return {
		getWorkouts: async (query?: {
			page?: number;
			pageSize?: number;
		}): Promise<GetV1WorkoutsResponses[200]> => {
			const response = await getV1Workouts({
				client,
				headers,
				query,
				throwOnError: true,
			});
			return response.data as GetV1WorkoutsResponses[200];
		},

		getWorkout: async (
			workoutId: string,
		): Promise<GetV1WorkoutsWorkoutidResponses[200]> => {
			const response = await getV1WorkoutsWorkoutid({
				client,
				headers,
				path: { workoutId },
				throwOnError: true,
			});
			return response.data as GetV1WorkoutsWorkoutidResponses[200];
		},

		createWorkout: async (
			body: PostWorkoutsRequestBody,
		): Promise<PostV1WorkoutsResponses[201]> => {
			const response = await postV1Workouts({
				client,
				headers,
				body,
				throwOnError: true,
			});
			return response.data as PostV1WorkoutsResponses[201];
		},

		updateWorkout: async (
			workoutId: string,
			body: PostWorkoutsRequestBody,
		): Promise<PutV1WorkoutsWorkoutidResponses[200]> => {
			const response = await putV1WorkoutsWorkoutid({
				client,
				headers,
				path: { workoutId },
				body,
				throwOnError: true,
			});
			return response.data as PutV1WorkoutsWorkoutidResponses[200];
		},

		getWorkoutCount: async (): Promise<GetV1WorkoutsCountResponses[200]> => {
			const response = await getV1WorkoutsCount({
				client,
				headers,
				throwOnError: true,
			});
			return response.data as GetV1WorkoutsCountResponses[200];
		},

		getWorkoutEvents: async (query?: {
			page?: number;
			pageSize?: number;
			since?: string;
		}): Promise<GetV1WorkoutsEventsResponses[200]> => {
			const response = await getV1WorkoutsEvents({
				client,
				headers,
				query,
				throwOnError: true,
			});
			return response.data as GetV1WorkoutsEventsResponses[200];
		},

		getRoutines: async (query?: {
			page?: number;
			pageSize?: number;
		}): Promise<GetV1RoutinesResponses[200]> => {
			const response = await getV1Routines({
				client,
				headers,
				query,
				throwOnError: true,
			});
			return response.data as GetV1RoutinesResponses[200];
		},

		getRoutineById: async (
			routineId: string,
		): Promise<GetV1RoutinesRoutineidResponses[200]> => {
			const response = await getV1RoutinesRoutineid({
				client,
				headers,
				path: { routineId },
				throwOnError: true,
			});
			return response.data as GetV1RoutinesRoutineidResponses[200];
		},

		createRoutine: async (
			body: PostRoutinesRequestBody,
		): Promise<PostV1RoutinesResponses[201]> => {
			const response = await postV1Routines({
				client,
				headers,
				body,
				throwOnError: true,
			});
			return response.data as PostV1RoutinesResponses[201];
		},

		updateRoutine: async (
			routineId: string,
			body: PutRoutinesRequestBody,
		): Promise<PutV1RoutinesRoutineidResponses[200]> => {
			const response = await putV1RoutinesRoutineid({
				client,
				headers,
				path: { routineId },
				body,
				throwOnError: true,
			});
			return response.data as PutV1RoutinesRoutineidResponses[200];
		},

		getExerciseTemplates: async (query?: {
			page?: number;
			pageSize?: number;
		}): Promise<GetV1ExerciseTemplatesResponses[200]> => {
			const response = await getV1ExerciseTemplates({
				client,
				headers,
				query,
				throwOnError: true,
			});
			return response.data as GetV1ExerciseTemplatesResponses[200];
		},

		getExerciseTemplate: async (
			exerciseTemplateId: string,
		): Promise<GetV1ExerciseTemplatesExercisetemplateidResponses[200]> => {
			const response = await getV1ExerciseTemplatesExercisetemplateid({
				client,
				headers,
				path: { exerciseTemplateId },
				throwOnError: true,
			});
			return response.data as GetV1ExerciseTemplatesExercisetemplateidResponses[200];
		},

		getExerciseHistory: async (
			exerciseTemplateId: string,
			query?: { start_date?: string; end_date?: string },
		): Promise<GetV1ExerciseHistoryExercisetemplateidResponses[200]> => {
			const response = await getV1ExerciseHistoryExercisetemplateid({
				client,
				headers,
				path: { exerciseTemplateId },
				query,
				throwOnError: true,
			});
			return response.data as GetV1ExerciseHistoryExercisetemplateidResponses[200];
		},

		createExerciseTemplate: async (
			body: CreateCustomExerciseRequestBody,
		): Promise<PostV1ExerciseTemplatesResponses[200]> => {
			const response = await postV1ExerciseTemplates({
				client,
				headers,
				body,
				throwOnError: true,
			});
			return response.data as PostV1ExerciseTemplatesResponses[200];
		},

		getRoutineFolders: async (query?: {
			page?: number;
			pageSize?: number;
		}): Promise<GetV1RoutineFoldersResponses[200]> => {
			const response = await getV1RoutineFolders({
				client,
				headers,
				query,
				throwOnError: true,
			});
			return response.data as GetV1RoutineFoldersResponses[200];
		},

		getRoutineFolder: async (
			folderId: string,
		): Promise<GetV1RoutineFoldersFolderidResponses[200]> => {
			const response = await getV1RoutineFoldersFolderid({
				client,
				headers,
				path: { folderId },
				throwOnError: true,
			});
			return response.data as GetV1RoutineFoldersFolderidResponses[200];
		},

		createRoutineFolder: async (
			body: PostRoutineFolderRequestBody,
		): Promise<PostV1RoutineFoldersResponses[201]> => {
			const response = await postV1RoutineFolders({
				client,
				headers,
				body,
				throwOnError: true,
			});
			return response.data as PostV1RoutineFoldersResponses[201];
		},
	};
}

export type HevyClient = ReturnType<typeof createClient>;
