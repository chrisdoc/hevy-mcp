---
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

fix(core): preserve operation domain errors in failure channel instead of converting them to unhandled defects. Domain errors from `@hevy-mcp/operations` (`WorkoutPrivacyError`, `WorkoutPayloadError`, `PaginationMismatchError`, `EmptyMeasurementUpdateError`, `TrainingSummaryValidationError`, `TrainingSummaryDataError`) are now included in `CoreToolError` and recognized by `isCoreToolError`, allowing tool error handlers to surface typed domain messages. In `runBoundedExecution`, unexpected defects are logged and re-thrown with their message rather than generic failure text.
