import axios from "axios";
import * as api from "../generated/client/api";

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

	// Return an object with all the API methods
	return {
		// Workouts
		getWorkouts: (params?: Parameters<typeof api.getV1Workouts>[0]) =>
			api.getV1Workouts(params, { axios: axiosInstance }),
		getWorkout: (workoutId: string) =>
			api.getV1WorkoutsWorkoutid(
				{ workoutid: workoutId },
				{ axios: axiosInstance },
			),
		createWorkout: (data: Parameters<typeof api.postV1Workouts>[0]) =>
			api.postV1Workouts(data, { axios: axiosInstance }),
		updateWorkout: (
			workoutId: string,
			data: Parameters<typeof api.putV1WorkoutsWorkoutid>[0],
		) =>
			api.putV1WorkoutsWorkoutid(
				{ ...data, workoutid: workoutId },
				{ axios: axiosInstance },
			),
		getWorkoutCount: () => api.getV1WorkoutsCount({}, { axios: axiosInstance }),
		getWorkoutEvents: (
			params?: Parameters<typeof api.getV1WorkoutsEvents>[0],
		) => api.getV1WorkoutsEvents(params, { axios: axiosInstance }),

		// Routines
		getRoutines: (params?: Parameters<typeof api.getV1Routines>[0]) =>
			api.getV1Routines(params, { axios: axiosInstance }),
		createRoutine: (data: Parameters<typeof api.postV1Routines>[0]) =>
			api.postV1Routines(data, { axios: axiosInstance }),
		updateRoutine: (
			routineId: string,
			data: Parameters<typeof api.putV1RoutinesRoutineid>[0],
		) =>
			api.putV1RoutinesRoutineid(
				{ ...data, routineid: routineId },
				{ axios: axiosInstance },
			),

		// Exercise Templates
		getExerciseTemplates: (
			params?: Parameters<typeof api.getV1ExerciseTemplates>[0],
		) => api.getV1ExerciseTemplates(params, { axios: axiosInstance }),
		getExerciseTemplate: (templateId: string) =>
			api.getV1ExerciseTemplatesExercisetemplateid(
				{ exercisetemplateid: templateId },
				{ axios: axiosInstance },
			),

		// Routine Folders
		getRoutineFolders: (
			params?: Parameters<typeof api.getV1RoutineFolders>[0],
		) => api.getV1RoutineFolders(params, { axios: axiosInstance }),
		createRoutineFolder: (
			data: Parameters<typeof api.postV1RoutineFolders>[0],
		) => api.postV1RoutineFolders(data, { axios: axiosInstance }),
		getRoutineFolder: (folderId: string) =>
			api.getV1RoutineFoldersFolderid(
				{ folderid: folderId },
				{ axios: axiosInstance },
			),
	};
}
