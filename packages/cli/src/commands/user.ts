import { runOperationWithoutInput, type CommandContext } from "./context.js";

export async function executeUser({
	operations,
	execution,
}: CommandContext): Promise<unknown> {
	return {
		user: {
			data: await runOperationWithoutInput(
				operations.user?.get,
				"user.get",
				execution,
			),
		},
	};
}
