---
name: hevy-workouts
description: Use when the user asks to inspect, summarize, plan, log, or update Hevy workouts, routines, exercises, or body measurements.
---

# Hevy workout workflows

Use the Hevy MCP connector for the user's authenticated Hevy account.

## MCP server connection

This plugin registers the remote MCP server as `hevy` through the repository's
`.mcp.json` file:

```json
{
	"mcpServers": {
		"hevy": {
			"type": "http",
			"url": "https://mcp.hevy-mcp.dev/mcp",
			"oauth": true
		}
	}
}
```

When the plugin is installed, connect or authorize the `hevy` server in Claude's
connector settings. The authorization page asks the user for their Hevy API
key. Never put an API key in this skill, plugin files, or a conversation. If the
server is unavailable, ask the user to complete the connector authorization
instead of attempting to start a different server.

Use the tools and resources exposed by the `hevy` server for Hevy requests. Do
not call the Hevy API directly or invent an alternative authentication path.

## Analysis and retrieval

- Prefer `get-training-summary` for a high-level trend across workouts and body measurements.
- Use focused list and detail tools when the user asks about a particular workout, routine, exercise, or date.
- State the date range and distinguish observations from recommendations.
- Cite the workout or measurement evidence used in a summary when practical.

## Mutations

- Treat create and update tools as state-changing operations.
- Before changing Hevy data, summarize the proposed change and confirm it with the user unless the user has already given an unambiguous instruction to make that exact change.
- Never invent completed set results, workout times, body measurements, or other missing values. Ask the user for missing values.
- Explain that create operations can produce duplicates if retried and that update operations replace existing values.

## Health context

Workout and body-measurement data is personal information. Describe trends without diagnosing medical conditions, and recommend a qualified professional for medical advice.
