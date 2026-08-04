import {
	validateBaseline,
	validateControlPlane,
} from "./repository-control-plane.mjs";
import { validateWorkflowProjections } from "./workflow-projections.mjs";
import { checkRenderedValidationLaneTables } from "./render-validation-lanes.mjs";

const controlPlane = validateControlPlane();
validateBaseline(controlPlane.rootDir, controlPlane);
validateWorkflowProjections(controlPlane.lanes, {
	rootDir: controlPlane.rootDir,
	workflows: {
		"pull-request-ci": {
			path: ".github/workflows/build-and-test.yml",
			aggregate: "pull-request-ci",
			jobs: ["build"],
		},
		release: {
			path: ".github/workflows/release.yml",
			aggregate: "release",
			jobs: ["release"],
		},
	},
});
await checkRenderedValidationLaneTables(controlPlane.rootDir);

console.log(
	[
		"Repository control-plane models are valid.",
		`workspaces=${controlPlane.topology.workspaces.length}`,
		`artifacts=${controlPlane.provenance.candidates.length} candidates/${controlPlane.provenance.outputs.length} outputs`,
		`lanes=${controlPlane.lanes.lanes.length}`,
	].join(" "),
);
