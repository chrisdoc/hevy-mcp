# Smithery Deployment Guide

## How Config Values Are Passed

When deploying to Smithery with a container runtime, configuration values from `configSchema` are handled as follows:

### Current Behavior (What Smithery Does)

1. **URL Query Parameters**: Smithery passes `configSchema` properties (like `HEVY_API_KEY`) as **URL query parameters** in the format:
   ```
   http://your-server:8081/mcp?HEVY_API_KEY=user_provided_key
   ```

2. **Environment Variables**: Smithery automatically sets:
   - `PORT=8081` - The port your container should listen on
   - Any variables defined in the `env` section of `smithery.yaml`

### What This Means for Your Code

**⚠️ CRITICAL ISSUE**: Your current code expects `HEVY_API_KEY` as an environment variable, but Smithery passes it as a URL parameter!

Looking at `src/index.ts`:
```typescript
// This line runs BEFORE the HTTP request is received
assertApiKey(cfg.apiKey); // ❌ Will fail - no env var yet!
```

The API key validation happens at **startup** (before any HTTP requests), but Smithery only provides the API key as a **query parameter on each request**.

## Solutions

You have two options:

### Option 1: Use Environment Variables (Simpler, Recommended for Smithery)

Modify `smithery.yaml` to pass the config as environment variables instead of query parameters:

```yaml
runtime: "container"
env:
  MCP_HTTP_PORT: "${PORT:-8081}"
  MCP_HTTP_HOST: "0.0.0.0"
  # Map the user-provided config to environment variables
  HEVY_API_KEY: "${HEVY_API_KEY}"
startCommand:
  type: "http"
  configSchema:
    type: object
    required:
      - HEVY_API_KEY
    properties:
      HEVY_API_KEY:
        type: string
        description: Your Hevy API key to authenticate with the Hevy Fitness API.
  exampleConfig:
    HEVY_API_KEY: "your-hevy-api-key-here"
build:
  dockerfile: "Dockerfile"
  dockerBuildPath: "."
```

**This assumes Smithery supports environment variable interpolation from `configSchema` values.** *(This needs verification)*

### Option 2: Parse Query Parameters from HTTP Requests (More Complex)

Modify your code to extract the API key from the first HTTP request's query parameters:

1. Start the HTTP server without validating the API key
2. Extract `HEVY_API_KEY` from query parameters in the `/mcp` POST handler
3. Dynamically create/configure the Hevy client per request or per session

This requires significant code changes to:
- Remove early API key validation
- Parse query parameters in `httpServer.ts`
- Store API key per session
- Create per-session Hevy clients

### Option 3: Hybrid Approach (Fallback)

Support both environment variables AND query parameters:

```typescript
// In httpServer.ts or config.ts
function getApiKey(req: express.Request, env: NodeJS.ProcessEnv): string {
  // Try query parameter first
  const queryApiKey = req.query.HEVY_API_KEY as string;
  if (queryApiKey) return queryApiKey;

  // Fallback to environment
  return env.HEVY_API_KEY || "";
}
```

## Current Configuration

Your `smithery.yaml` is set up to:
- ✅ Use container runtime with Docker
- ✅ Listen on PORT 8081 (Smithery's default)
- ✅ Bind to 0.0.0.0 (required for Docker networking)
- ⚠️ Pass HEVY_API_KEY as query parameter (but your code expects env var)

## Testing Locally

To test Smithery behavior locally:

```bash
# Build the Docker image
docker build -t hevy-mcp .

# Run with Smithery-style configuration (env vars)
docker run -p 8081:8081 \
  -e PORT=8081 \
  -e MCP_HTTP_PORT=8081 \
  -e MCP_HTTP_HOST=0.0.0.0 \
  -e HEVY_API_KEY=your_api_key_here \
  hevy-mcp
```

Then test with query parameters:
```bash
curl "http://localhost:8081/mcp?HEVY_API_KEY=your_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

## Recommendation

**Best approach**: Verify if Smithery supports `env` variable interpolation from `configSchema`. If yes, use Option 1. If no, implement Option 3 (hybrid approach) to support both deployment methods.
