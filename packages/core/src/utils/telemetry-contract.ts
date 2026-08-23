/**
 * Telemetry contract constants shared by the Node and Worker adapters.
 * The adapters own their platform crypto implementations; this module owns
 * the contract both must satisfy so it cannot drift between them.
 */

/** HMAC message context for the pseudonymous Sentry user hash. */
export const USER_HASH_CONTEXT = "hevy-mcp:sentry-user-id:v1";

/** Length of the truncated hex digest used as the user hash. */
export const USER_HASH_LENGTH = 10;

/** Shape every emitted or consumed user hash must satisfy. */
export const SAFE_USER_HASH_PATTERN = new RegExp(
	`^[0-9a-f]{${USER_HASH_LENGTH}}$`,
	"u",
);

/**
 * Argument keys telemetry may name. Both adapters project tool arguments
 * against this list; keys missing here are silently excluded everywhere.
 */
export const TELEMETRY_ARGUMENT_KEYS: readonly string[] = Object.freeze([
	"page",
	"page_size",
	"since",
	"workout_id",
	"routine_id",
	"folder_id",
	"exercise_template_id",
	"date",
	"start_date",
	"end_date",
	"updated_since",
	"include_custom",
	"limit",
	"offset",
	"refresh",
	"query",
	"primary_muscle_group",
]);
