import { describe, expect, it, vi } from "vitest";
import { createClient } from "./hevyClient";
import { createClient as createKubbClient } from "./hevyClientKubb.js";

// Mock the Kubb client
vi.mock("./hevyClientKubb.js", () => ({
	createClient: vi.fn().mockReturnValue({ mockedClient: true }),
}));

describe("hevyClient", () => {
	describe("createClient", () => {
		it("should create a client with the correct configuration", () => {
			// Arrange
			const apiKey = "test-api-key";
			const baseUrl = "https://api.hevy.com";

			// Reset mocks
			vi.clearAllMocks();

			// Act
			const client = createClient(apiKey, baseUrl);

			// Assert
			expect(client).toEqual({ mockedClient: true });
			expect(createKubbClient).toHaveBeenCalledWith(apiKey, baseUrl, {});
		});

		it("passes optional logging configuration to the Kubb client", () => {
			const logger = vi.fn();

			createClient("test-api-key", "https://api.hevy.com", { logger });

			expect(createKubbClient).toHaveBeenCalledWith(
				"test-api-key",
				"https://api.hevy.com",
				{ logger },
			);
		});
	});
});
