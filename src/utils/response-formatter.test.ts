import { describe, expect, it } from "vitest";
import { createJsonResponse, createTextResponse, createEmptyResponse } from "./response-formatter";

describe("Response Formatter", () => {
  describe("createJsonResponse", () => {
    it("should format JSON data with default pretty printing", () => {
      const testData = { name: "Test", value: 123, nested: { key: "value" } };
      const response = createJsonResponse(testData);

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(testData, null, 2),
          },
        ],
      });
    });

    it("should format JSON data without pretty printing when specified", () => {
      const testData = { name: "Test", value: 123 };
      const response = createJsonResponse(testData, { pretty: false });

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(testData),
          },
        ],
      });
    });

    it("should use custom indentation when specified", () => {
      const testData = { name: "Test", value: 123 };
      const response = createJsonResponse(testData, { pretty: true, indent: 4 });

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(testData, null, 4),
          },
        ],
      });
    });

    it("should handle arrays correctly", () => {
      const testArray = [1, 2, 3, { name: "Test" }];
      const response = createJsonResponse(testArray);

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify(testArray, null, 2),
          },
        ],
      });
    });

    it("should handle null and undefined values", () => {
      expect(createJsonResponse(null).content[0].text).toBe("null");
      // JSON.stringify(undefined) returns undefined, not a string
      // So we need to check that the text is undefined
      expect(createJsonResponse(undefined).content[0].text).toBe(undefined);
    });
  });

  describe("createTextResponse", () => {
    it("should create a text response with the provided message", () => {
      const message = "This is a test message";
      const response = createTextResponse(message);

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      });
    });

    it("should handle empty strings", () => {
      const response = createTextResponse("");

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: "",
          },
        ],
      });
    });
  });

  describe("createEmptyResponse", () => {
    it("should create an empty response with default message", () => {
      const response = createEmptyResponse();

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: "No data found",
          },
        ],
      });
    });

    it("should create an empty response with custom message", () => {
      const customMessage = "Custom empty message";
      const response = createEmptyResponse(customMessage);

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: customMessage,
          },
        ],
      });
    });
  });
});
