import { execFileSync } from "node:child_process";

try {
	execFileSync("mise", ["exec", "hk", "--", "hk", "install", "--mise"], {
		stdio: "inherit",
	});
} catch (error) {
	if (error?.code === "ENOENT") {
		console.warn(
			"mise is not installed; skipping hk hook installation. See CONTRIBUTING.md.",
		);
	} else {
		console.warn("hk hook installation failed; continuing npm install.");
	}
}
