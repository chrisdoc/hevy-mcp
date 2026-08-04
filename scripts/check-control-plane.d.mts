interface HistoricalExecutionEntry {
	lane: string;
	command: string;
	source: { path: string; line: number };
}

interface HistoricalEvidenceBaseline {
	before: {
		validationExecutionLines: {
			sourceRevision: string;
			testPr: HistoricalExecutionEntry[];
			pullRequestWorkflow: HistoricalExecutionEntry[];
			releaseWorkflow: HistoricalExecutionEntry[];
			counts: Record<string, number>;
		};
	};
}

export function validateHistoricalEvidence(
	baseline: HistoricalEvidenceBaseline,
): {
	testPrMembers: number;
	pullRequestWorkflow: number;
	releaseWorkflow: number;
	total: number;
};

export function validateHistoricalExecutionTotals(
	actual: Record<string, number>,
	expected: Record<string, number>,
): void;
