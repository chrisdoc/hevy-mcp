import { describe, expect, it, vi } from "vitest";
import { createClient } from "./hevyClient";

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
		});
	});
});
