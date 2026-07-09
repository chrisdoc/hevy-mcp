export default {
	extends: ["@commitlint/config-conventional"],
	// Ignore merge commits created by Mergify when batching PRs in the queue
	// (e.g. "Merge of #431", "Merge of #425"). These are internal bookkeeping
	// commits and are not authored by contributors.
	ignores: [(msg) => /^Merge of #\d+/.test(msg)],
};
