import type { LoggingMessageNotification } from "@modelcontextprotocol/server";

export type McpClientLogMessage = LoggingMessageNotification["params"];
export type McpClientLogger = (message: McpClientLogMessage) => void;
