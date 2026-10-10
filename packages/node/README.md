# hevy-mcp

Connect Claude, Cursor, Codex, or another [MCP](https://modelcontextprotocol.io/)
client to your [Hevy](https://www.hevyapp.com/) workouts, routines, exercises,
and body measurements. Read and analyze data, or create and update records
with client-side confirmation. A Hevy API key (Hevy PRO) is required.

[Full guide](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md) ·
[Tools and prompts](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#tools) ·
[Documentation](https://github.com/chrisdoc/hevy-mcp/blob/main/docs/index.md)

## Run locally with stdio

The published package currently requires **Node.js 20 or newer**; the
[`engines` field](https://github.com/chrisdoc/hevy-mcp/blob/main/packages/node/package.json)
is the compatibility source of truth.

Get an active key from [Hevy API settings](https://hevy.com/settings?developer).
Configure your MCP client to spawn the server and provide the key through its
child-process environment:

```json
{
	"mcpServers": {
		"hevy": {
			"command": "npx",
			"args": ["-y", "hevy-mcp"],
			"env": {
				"HEVY_API_KEY": "your-hevy-api-key"
			}
		}
	}
}
```

The equivalent launch command is `npx -y hevy-mcp` with `HEVY_API_KEY` in the
child-process environment.

Stdio is the default transport. Stdout is reserved for MCP JSON-RPC; diagnostics
go to stderr. Set `HEVY_MCP_DEBUG=1` for privacy-bounded debugging. Keep real
keys out of source control, URLs, logs, and screenshots, and protect any client
configuration containing a key.

See the maintained [local client examples](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#run-locally-instead)
for client-specific configuration and Docker usage. Reconnect your client after
changing its configuration. Try asking: “Summarize my training over the last
four weeks.” Review inputs before approving mutation tools; uncertain create
outcomes must not be blindly retried.

## Hosted alternative

No local process is needed when your client supports remote Streamable HTTP:

```text
https://mcp.hevy-mcp.dev/mcp
```

Direct authentication sends `Authorization: Bearer <HEVY_API_KEY>` on each MCP
request. The Worker caches successful key validation for 15 minutes under a
hashed key; the direct path does not persist the raw key. It forwards the key
to Hevy only as the upstream `api-key` header.

OAuth is a distinct, additive authentication path for clients that cannot send
a fixed header. When the Worker has an `OAUTH_KV` binding, its authorization
flow validates a Hevy key and stores it encrypted in an OAuth grant; clients
then send OAuth access tokens, not the Hevy key. Revoking or rotating the Hevy
key prevents subsequent upstream access but does not itself delete grants or
immediately clear cached validation.

See [hosted client configuration](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#connect-to-the-hosted-endpoint)
and [OAuth configuration](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#oauth-for-claudeai-and-other-remote-mcp-clients).
The Worker is stateless and does not expose legacy SSE or a `GET /mcp` stream.

## Local Streamable HTTP

Supply the Hevy key in the server process environment:

```bash
export HEVY_API_KEY=your-hevy-api-key
npx hevy-mcp --transport http --host 127.0.0.1 --port 3000
```

Clients connect to `http://127.0.0.1:3000/mcp`. Each initialized session owns its
own MCP server and catalog cache. `GET /health` is an unauthenticated liveness
probe, not a test of Hevy availability.

Non-loopback binds require `HEVY_MCP_HTTP_BEARER_TOKEN`, a **separate** endpoint
protection token that must not be the Hevy API key. Clients send this separate
token in their bearer header. Loopback binds do not enforce bearer
authentication. Publish Docker ports deliberately and do not expose an
unprotected shared account.

See [advanced configuration](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#advanced-configuration)
for HTTP limits and Docker commands, or [deployment modes](https://github.com/chrisdoc/hevy-mcp/blob/main/docs/deployment-modes.md)
for transport and authentication differences.

## Embed in a Node application

The package's public ESM entry point supports caller-owned server construction:

```javascript
import { createNodeMcpServer } from "hevy-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

const server = await createNodeMcpServer({ apiKey: process.env.HEVY_API_KEY });
await server.connect(new StdioServerTransport());
// Call await server.close() when your application shuts down.
```

Declare the MCP SDK as a direct dependency of an application importing its
transport. `createNodeMcpServer` requires an explicit non-empty key and returns
an unconnected server. It does not probe Hevy, read environment configuration,
initialize telemetry, or install process handlers. Your application owns the
transport and shutdown. Optional `maxGetRetries` and `feedbackRecorder`
configuration is documented in the [public API source](https://github.com/chrisdoc/hevy-mcp/blob/main/packages/node/src/index.ts).

To opt into the executable's process lifecycle instead:

```javascript
import { runStdioServer } from "hevy-mcp";

await runStdioServer(); // Reads HEVY_API_KEY from the process environment.
```

Imports alone remain side-effect-free; the runtime helper acquires startup,
telemetry, and signal-handling resources when called. Use the executable for
HTTP transport selection.

## Telemetry and privacy

The Node executable enables project telemetry by default. Set exactly
`HEVY_MCP_TELEMETRY=0` **before launch** to disable it. Raw API keys and workout
content are not exported; ordinary tool telemetry can include a deterministic
HMAC pseudonym derived from the key. `feedback` uses a separate unobserved path.

See [telemetry and privacy](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#local-node-telemetry-and-privacy)
for diagnostic-detail controls and collector behavior, and
[troubleshooting](https://github.com/chrisdoc/hevy-mcp/blob/main/README.md#troubleshooting)
for connection and authentication issues.

[MIT license](https://github.com/chrisdoc/hevy-mcp/blob/main/LICENSE) ·
[Report an issue](https://github.com/chrisdoc/hevy-mcp/issues)
