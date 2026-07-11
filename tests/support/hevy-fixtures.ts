import type {
	BodyMeasurement,
	ExerciseTemplate,
	GetV1BodyMeasurements200,
	GetV1ExerciseTemplates200,
	GetV1RoutineFolders200,
	GetV1Routines200,
	GetV1UserInfo200,
	GetV1Workouts200,
	GetV1WorkoutsCount200,
	Routine,
	RoutineFolder,
	UserInfo,
	Workout,
} from "../../src/generated/client/types/index.js";

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}

	return value;
}

function immutableFixture<T extends object>(
	defaults: T,
	overrides: Partial<T> = {},
): T {
	return deepFreeze(structuredClone({ ...defaults, ...overrides }));
}

export function createWorkoutFixture(
	overrides: Partial<Workout> = {},
): Workout {
	return immutableFixture<Workout>(
		{
			id: "workout-1",
			title: "Mock Workout",
			description: "Upper body session",
			start_time: "2025-03-27T07:00:00Z",
			end_time: "2025-03-27T08:00:00Z",
			created_at: "2025-03-27T07:00:00Z",
			updated_at: "2025-03-27T08:00:00Z",
			exercises: [],
		},
		overrides,
	);
}

export function createRoutineFixture(
	overrides: Partial<Routine> = {},
): Routine {
	return immutableFixture<Routine>(
		{
			id: "routine-1",
			title: "Mock Push Day",
			folder_id: 10,
			created_at: "2025-03-26T19:00:00Z",
			updated_at: "2025-03-26T19:15:00Z",
			exercises: [],
		},
		overrides,
	);
}

export function createExerciseTemplateFixture(
	overrides: Partial<ExerciseTemplate> = {},
): ExerciseTemplate {
	return immutableFixture<ExerciseTemplate>(
		{
			id: "template-1",
			title: "Bench Press",
			type: "weight_reps",
			primary_muscle_group: "chest",
			secondary_muscle_groups: ["triceps"],
			is_custom: false,
		},
		overrides,
	);
}

export function createRoutineFolderFixture(
	overrides: Partial<RoutineFolder> = {},
): RoutineFolder {
	return immutableFixture<RoutineFolder>(
		{
			id: 10,
			title: "Mock Folder",
			created_at: "2025-03-26T09:00:00Z",
			updated_at: "2025-03-26T09:00:00Z",
		},
		overrides,
	);
}

export function createBodyMeasurementFixture(
	overrides: Partial<BodyMeasurement> = {},
): BodyMeasurement {
	return immutableFixture<BodyMeasurement>(
		{
			date: "2025-03-25",
			weight_kg: 80.5,
			fat_percent: 19.3,
		},
		overrides,
	);
}

export function createUserInfoFixture(
	overrides: Partial<UserInfo> = {},
): UserInfo {
	return immutableFixture<UserInfo>(
		{
			id: "user-1",
			name: "Mock User",
			url: "https://hevy.com/user/mock-user",
		},
		overrides,
	);
}

export function createWorkoutsResponse(
	workouts: Workout[] = [createWorkoutFixture()],
	overrides: Omit<Partial<GetV1Workouts200>, "workouts"> = {},
): GetV1Workouts200 {
	return immutableFixture<GetV1Workouts200>(
		{ page: 1, page_count: 1, workouts },
		overrides,
	);
}

export function createRoutinesResponse(
	routines: Routine[] = [createRoutineFixture()],
	overrides: Omit<Partial<GetV1Routines200>, "routines"> = {},
): GetV1Routines200 {
	return immutableFixture<GetV1Routines200>(
		{ page: 1, page_count: 1, routines },
		overrides,
	);
}

export function createExerciseTemplatesResponse(
	exerciseTemplates: ExerciseTemplate[] = [createExerciseTemplateFixture()],
	overrides: Omit<
		Partial<GetV1ExerciseTemplates200>,
		"exercise_templates"
	> = {},
): GetV1ExerciseTemplates200 {
	return immutableFixture<GetV1ExerciseTemplates200>(
		{
			page: 1,
			page_count: 1,
			exercise_templates: exerciseTemplates,
		},
		overrides,
	);
}

export function createRoutineFoldersResponse(
	routineFolders: RoutineFolder[] = [createRoutineFolderFixture()],
	overrides: Omit<Partial<GetV1RoutineFolders200>, "routine_folders"> = {},
): GetV1RoutineFolders200 {
	return immutableFixture<GetV1RoutineFolders200>(
		{ page: 1, page_count: 1, routine_folders: routineFolders },
		overrides,
	);
}

export function createBodyMeasurementsResponse(
	bodyMeasurements: BodyMeasurement[] = [createBodyMeasurementFixture()],
	overrides: Omit<Partial<GetV1BodyMeasurements200>, "body_measurements"> = {},
): GetV1BodyMeasurements200 {
	return immutableFixture<GetV1BodyMeasurements200>(
		{ page: 1, page_count: 1, body_measurements: bodyMeasurements },
		overrides,
	);
}

export function createUserInfoResponse(
	data: UserInfo = createUserInfoFixture(),
): GetV1UserInfo200 {
	return immutableFixture<GetV1UserInfo200>({ data });
}

export function createWorkoutCountResponse(count = 42): GetV1WorkoutsCount200 {
	return immutableFixture<GetV1WorkoutsCount200>({ workout_count: count });
}
