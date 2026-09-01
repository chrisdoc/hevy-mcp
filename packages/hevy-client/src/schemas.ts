import { z } from "zod";
import { getV1BodyMeasurementsDatePathDateSchema } from "./generated/client/schemas/getV1BodyMeasurementsDateSchema.js";
import {
	getV1BodyMeasurementsQueryPageSchema,
	getV1BodyMeasurementsQueryPageSizeSchema,
} from "./generated/client/schemas/getV1BodyMeasurementsSchema.js";
import {
	getV1ExerciseHistoryExercisetemplateidPathExerciseTemplateIdSchema,
	getV1ExerciseHistoryExercisetemplateidQueryEndDateSchema,
	getV1ExerciseHistoryExercisetemplateidQueryStartDateSchema,
} from "./generated/client/schemas/getV1ExerciseHistoryExercisetemplateidSchema.js";
import { getV1ExerciseTemplatesExercisetemplateidPathExerciseTemplateIdSchema } from "./generated/client/schemas/getV1ExerciseTemplatesExercisetemplateidSchema.js";
import {
	getV1RoutinesQueryPageSchema,
	getV1RoutinesQueryPageSizeSchema,
} from "./generated/client/schemas/getV1RoutinesSchema.js";
import { getV1RoutinesRoutineidPathRoutineIdSchema } from "./generated/client/schemas/getV1RoutinesRoutineidSchema.js";
import {
	getV1WorkoutsEventsQueryPageSchema,
	getV1WorkoutsEventsQueryPageSizeSchema,
	getV1WorkoutsEventsQuerySinceSchema,
} from "./generated/client/schemas/getV1WorkoutsEventsSchema.js";
import {
	getV1WorkoutsQueryPageSchema,
	getV1WorkoutsQueryPageSizeSchema,
} from "./generated/client/schemas/getV1WorkoutsSchema.js";
import { getV1WorkoutsWorkoutidPathWorkoutIdSchema } from "./generated/client/schemas/getV1WorkoutsWorkoutidSchema.js";

export { userInfoSchema } from "./generated/client/schemas/userInfoSchema.js";
export { bodyMeasurementSchema } from "./generated/client/schemas/bodyMeasurementSchema.js";
export { postRoutinesRequestSetSchema } from "./generated/client/schemas/postRoutinesRequestSetSchema.js";
export { postWorkoutsRequestSetSchema } from "./generated/client/schemas/postWorkoutsRequestSetSchema.js";

export const getV1BodyMeasurementsDatePathParamsSchema = z.object({
	date: getV1BodyMeasurementsDatePathDateSchema,
});
export const getV1BodyMeasurementsQueryParamsSchema = z.object({
	page: getV1BodyMeasurementsQueryPageSchema,
	pageSize: getV1BodyMeasurementsQueryPageSizeSchema,
});
export const getV1ExerciseHistoryExercisetemplateidPathParamsSchema = z.object({
	exerciseTemplateId:
		getV1ExerciseHistoryExercisetemplateidPathExerciseTemplateIdSchema,
});
export const getV1ExerciseHistoryExercisetemplateidQueryParamsSchema = z.object(
	{
		start_date: getV1ExerciseHistoryExercisetemplateidQueryStartDateSchema,
		end_date: getV1ExerciseHistoryExercisetemplateidQueryEndDateSchema,
	},
);
export const getV1ExerciseTemplatesExercisetemplateidPathParamsSchema =
	z.object({
		exerciseTemplateId:
			getV1ExerciseTemplatesExercisetemplateidPathExerciseTemplateIdSchema,
	});
export const getV1RoutinesQueryParamsSchema = z.object({
	page: getV1RoutinesQueryPageSchema,
	pageSize: getV1RoutinesQueryPageSizeSchema,
});
export const getV1RoutinesRoutineidPathParamsSchema = z.object({
	routineId: getV1RoutinesRoutineidPathRoutineIdSchema,
});
export const getV1WorkoutsEventsQueryParamsSchema = z.object({
	since: getV1WorkoutsEventsQuerySinceSchema,
	page: getV1WorkoutsEventsQueryPageSchema,
	pageSize: getV1WorkoutsEventsQueryPageSizeSchema,
});
export const getV1WorkoutsQueryParamsSchema = z.object({
	page: getV1WorkoutsQueryPageSchema,
	pageSize: getV1WorkoutsQueryPageSizeSchema,
});
export const getV1WorkoutsWorkoutidPathParamsSchema = z.object({
	workoutId: getV1WorkoutsWorkoutidPathWorkoutIdSchema,
});
