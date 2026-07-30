import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkoutPageArgs } from "./test_hevy_mcp.mjs";

void test("builds snake_case workout pagination arguments", () => {
	assert.deepEqual(buildWorkoutPageArgs(3, 5), { page: 3, page_size: 5 });
});
