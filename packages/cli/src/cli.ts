import { runCli } from "./main.js";

const exitCode = await runCli({ argv: process.argv.slice(2) });
if (exitCode !== 0) process.exitCode = exitCode;
