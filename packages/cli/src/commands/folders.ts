import { routineFolderInputSchema } from "@hevy-mcp/operations/schemas";
import { requireMutationConfirmation } from "../arguments.js";
import { loadMutationInput } from "../input.js";
import { mutationData, runOperation, type CommandContext } from "./context.js";

export async function executeFolderCreate({
	args,
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		routineFolderInputSchema,
		readDataSource,
	);
	return {
		routine_folder: await runOperation(
			operations.folders?.create,
			"folders.create",
			input,
			execution,
		),
	};
}
