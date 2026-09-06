import { z } from "zod";
import { HevyOperationsService } from "../effect-services.js";
import { trainingSummaryResponse } from "../utils/response-contracts.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";
import type { ToolRuntime } from "./tool-runtime.js";

const trainingSummarySchema = {
	weeks: z.coerce.number().int().min(1).max(12).default(4),
} as const;

type TrainingSummaryParams = InferToolParams<typeof trainingSummarySchema>;

export const workflowToolDefinitions = [
	{
		name: "get-training-summary",
		feature: "workflows" as const,
		operation: "get" as const,
		description:
			"Read-only. Summarizes workouts and body-measurement trends for the last 1–12 weeks, including compact session and scan evidence.",
		inputSchema: trainingSummarySchema,
		outputSchema: trainingSummaryResponse.outputSchema,
		annotations: readOnlyAnnotations("Get Training Summary"),
		kind: "read" as const,
		responseContract: trainingSummaryResponse,
		execute: (runtime: ToolRuntime, args: TrainingSummaryParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).workflows?.trainingSummary,
					"workflows.trainingSummary",
				),
				{ weeks: args.weeks },
				runtime.execution,
			),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];
