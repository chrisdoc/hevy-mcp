import { runServer } from "./index.js";

void runServer().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
