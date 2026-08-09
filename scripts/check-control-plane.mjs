import { validateControlPlane } from "./repository-control-plane.mjs";
import { validateWorkflowProjections } from "./workflow-projections.mjs";

const controlPlane = validateControlPlane();
validateWorkflowProjections(controlPlane.lanes, {
	rootDir: controlPlane.rootDir,
	workflows: {
		"pull-request-ci": {
			path: ".github/workflows/build-and-test.yml",
			aggregate: "pull-request-ci",
			jobs: ["build", "package-performance"],
		},
		release: {
			path: ".github/workflows/release.yml",
			aggregate: "release",
			jobs: ["release"],
			rejectContinueOnError: true,
		},
	},
});

console.log(
	[
		"Repository control-plane models are valid.",
		`workspaces=${controlPlane.topology.workspaces.length}`,
		`artifacts=${controlPlane.provenance.candidates.length} candidates/${controlPlane.provenance.outputs.length} outputs`,
		`lanes=${controlPlane.lanes.lanes.length}`,
	].join(" "),
);
