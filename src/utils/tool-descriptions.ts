export interface ToolDescriptionParts {
	summary: string;
	aliases: readonly string[];
	useCase: string;
	importantNotes: string;
}

export function describeTool({
	summary,
	aliases,
	useCase,
	importantNotes,
}: ToolDescriptionParts): string {
	return [
		summary,
		`Aliases: ${aliases.join(", ")}.`,
		`<use_case>${useCase}</use_case>`,
		`<important_notes>${importantNotes}</important_notes>`,
	].join(" ");
}
