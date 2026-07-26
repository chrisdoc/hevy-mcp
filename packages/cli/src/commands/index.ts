import type { HevyClient } from "@hevy-mcp/hevy-client";
import {
	UsageError,
	iso,
	option,
	positiveInt,
	requiredId,
	type CliArgs,
} from "../arguments.js";
import { normalize, pageEnvelope } from "../output/normalize.js";

type Body = Record<string, unknown>;
function body(value: unknown): Body {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Body)
		: {};
}
function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
function list(data: Body, source: string, output: string, page: number): Body {
	const count = data.page_count;
	if (
		typeof count !== "number" ||
		!Number.isInteger(count) ||
		count < 0 ||
		(data.page !== undefined && data.page !== page)
	)
		throw new Error("The API returned invalid pagination metadata");
	if (count > 0 && page > count)
		throw new UsageError("Requested page exceeds the API page count");
	return pageEnvelope(
		data,
		output,
		Array.isArray(data[source]) ? data[source] : [],
	);
}

export async function execute(
	args: CliArgs,
	client: HevyClient,
	now = () => new Date(),
): Promise<unknown> {
	const command = args.command;
	const sub = args.subcommand;
	const page = positiveInt(args, "page", 1);
	const pageSize = positiveInt(args, "page-size", 5, 10);
	if (command === "user" && !sub)
		return { user: normalize(await client.getUserInfo()) };
	if (command === "workouts") {
		if (sub === "list")
			return list(
				body(await client.getWorkouts({ page, pageSize })),
				"workouts",
				"workouts",
				page,
			);
		if (sub === "get")
			return {
				workout: normalize(
					await client.getWorkout(
						requiredId(args.positionals[0], "Workout ID"),
					),
				),
			};
		if (sub === "count")
			return { count: body(await client.getWorkoutCount()).workout_count ?? 0 };
		if (sub === "events")
			return {
				...list(
					body(
						await client.getWorkoutEvents({
							page,
							pageSize,
							since: iso(option(args, "since"), "--since"),
						}),
					),
					"events",
					"events",
					page,
				),
				since: option(args, "since") ?? "1970-01-01T00:00:00Z",
			};
	}
	if (command === "routines") {
		if (sub === "list")
			return list(
				body(await client.getRoutines({ page, pageSize })),
				"routines",
				"routines",
				page,
			);
		if (sub === "get")
			return {
				routine: normalize(
					await client.getRoutineById(
						requiredId(args.positionals[0], "Routine ID"),
					),
				),
			};
	}
	if (command === "exercises") {
		if (sub === "get")
			return {
				exercise: normalize(
					await client.getExerciseTemplate(
						requiredId(args.positionals[0], "Exercise ID"),
					),
				),
			};
		if (sub === "history") {
			const start = iso(option(args, "start-date"), "--start-date");
			const end = iso(option(args, "end-date"), "--end-date");
			return {
				exerciseTemplateId: requiredId(args.positionals[0], "Exercise ID"),
				history: normalize(
					(
						await client.getExerciseHistory(args.positionals[0], {
							start_date: start,
							end_date: end,
						})
					).exercise_history ?? [],
				),
			};
		}
		if (sub === "search") {
			const query = requiredId(
				args.positionals[0],
				"Search query",
			).toLocaleLowerCase();
			const matches: unknown[] = [];
			let pagesScanned = 0;
			let pageCount = 1;
			while (pagesScanned < pageCount) {
				const result = body(
					await client.getExerciseTemplates({
						page: pagesScanned + 1,
						pageSize: 100,
					}),
				);
				pageCount = result.page_count as number;
				if (
					!Number.isInteger(pageCount) ||
					pageCount < 0 ||
					(pageCount > 0 && pageCount < pagesScanned + 1)
				)
					throw new Error("The API returned invalid pagination metadata");
				pagesScanned += 1;
				if (pageCount === 0) break;
				for (const item of Array.isArray(result.exercise_templates)
					? result.exercise_templates
					: [])
					if (text(body(item).title).toLocaleLowerCase().includes(query))
						matches.push(normalize(item));
			}
			return { query, matches, pagesScanned, complete: true };
		}
	}
	if (command === "measurements") {
		if (sub === "list")
			return list(
				body(await client.getBodyMeasurements({ page, pageSize })),
				"body_measurements",
				"measurements",
				page,
			);
		if (sub === "get") {
			const date = requiredId(args.positionals[0], "Measurement date");
			iso(date, "Measurement date", true);
			return { measurement: normalize(await client.getBodyMeasurement(date)) };
		}
	}
	if (command === "summary") {
		const weeks = positiveInt(args, "weeks", 1);
		const to = now();
		const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
		let pageNumber = 1;
		let pageCount = 1;
		let pagesScanned = 0;
		const workouts: Body[] = [];
		while (pageNumber <= pageCount) {
			const result = body(
				await client.getWorkouts({ page: pageNumber, pageSize: 10 }),
			);
			pageCount = result.page_count as number;
			if (
				!Number.isInteger(pageCount) ||
				pageCount < 0 ||
				(pageCount > 0 && pageCount < pageNumber)
			)
				throw new Error("The API returned invalid pagination metadata");
			pagesScanned += 1;
			if (pageCount === 0) break;
			const items = Array.isArray(result.workouts)
				? result.workouts.map(body)
				: [];
			for (const workout of items) {
				const timestamp = Date.parse(text(workout.start_time));
				if (Number.isNaN(timestamp))
					throw new Error(
						"The API returned a workout with an invalid timestamp",
					);
				if (timestamp >= from.getTime() && timestamp <= to.getTime())
					workouts.push(workout);
			}
			const oldest = items.at(-1)?.start_time;
			if (oldest && Date.parse(text(oldest)) < from.getTime()) break;
			pageNumber += 1;
		}
		let exerciseCount = 0,
			setCount = 0,
			totalVolumeKg = 0,
			totalDurationSeconds = 0;
		for (const workout of workouts) {
			const start = Date.parse(text(workout.start_time));
			const end = Date.parse(text(workout.end_time));
			if (!Number.isNaN(start) && !Number.isNaN(end))
				totalDurationSeconds += Math.max(0, (end - start) / 1000);
			const exercises = array(workout.exercises);
			exerciseCount += exercises.length;
			for (const exercise of exercises)
				for (const set of array(body(exercise).sets)) {
					setCount += 1;
					const item = body(set);
					if (
						typeof item.weight_kg === "number" &&
						typeof item.reps === "number"
					)
						totalVolumeKg += item.weight_kg * item.reps;
				}
		}
		return {
			weeks,
			from: from.toISOString(),
			to: to.toISOString(),
			workoutCount: workouts.length,
			totalDurationSeconds,
			exerciseCount,
			setCount,
			totalVolumeKg,
			pagesScanned,
			complete: pageNumber > pageCount || pagesScanned === pageCount,
		};
	}
	throw new UsageError("Unknown command; run hevy --help");
}
