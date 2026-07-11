import { z } from "zod";

export const FIXTURE_RESULT_PREFIX = "HEVY_PERFORMANCE_FIXTURE_RESULT=";

export const fixtureModeSchema = z.enum([
	"startup",
	"tools-list",
	"representative-read",
	"concurrent-reads",
	"sequential-reads",
]);

export const fixtureResultSchema = z.object({
	version: z.literal(1),
	mode: fixtureModeSchema,
	expectedRequestCount: z.number().int().positive(),
	observedRequestCount: z.number().int().nonnegative(),
	startupRequestCount: z.number().int().nonnegative(),
	scenarioRequestCount: z.number().int().nonnegative(),
	pendingMocks: z.array(z.string()),
	unexpectedRequests: z.array(z.string()),
	blockedFetchRequests: z.array(z.string()),
	setupFailure: z.string().nullable(),
	cleanupFailure: z.string().nullable(),
	verified: z.boolean(),
});

export type FixtureMode = z.infer<typeof fixtureModeSchema>;
export type FixtureResult = z.infer<typeof fixtureResultSchema>;

export function parseFixtureResult(stderr: string, expectedMode: FixtureMode) {
	const markers = stderr
		.split(/\r?\n/u)
		.filter((line) => line.startsWith(FIXTURE_RESULT_PREFIX));
	if (markers.length !== 1) {
		throw new Error(
			`expected exactly one child fixture result marker, found ${markers.length}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(markers[0]!.slice(FIXTURE_RESULT_PREFIX.length));
	} catch (error) {
		throw new Error("child fixture result marker contained malformed JSON", {
			cause: error,
		});
	}

	const result = fixtureResultSchema.parse(parsed);
	if (result.mode !== expectedMode) {
		throw new Error(
			`child fixture mode mismatch: expected ${expectedMode}, received ${result.mode}`,
		);
	}
	return result;
}
