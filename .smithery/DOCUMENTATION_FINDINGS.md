# Smithery Documentation Summary - Key Findings

## Critical Information from Smithery Docs

After reading the official Smithery documentation, here are the key findings that impact our implementation:

### 1. Configuration Passing Mechanism

**Smithery passes `configSchema` values as URL query parameters:**

```
GET /mcp?HEVY_API_KEY=user-value&other.nested=value
```

- Query parameters use **dot notation** for nested objects
- NOT passed as environment variables
- Parameters are included on **every request** to `/mcp`

### 2. Smithery SDK Available

Smithery provides `@smithery/sdk` npm package with helpful utilities:

```bash
npm install @smithery/sdk
```

**Key Function: `parseAndValidateConfig()`**

```typescript
import { parseAndValidateConfig } from "@smithery/sdk";
import { z } from "zod";

const configSchema = z.object({
  HEVY_API_KEY: z.string(),
});

// In Express handler
app.get('/mcp', (req, res) => {
  const result = parseAndValidateConfig(req, configSchema);

  if (result.error) {
    return res.status(result.value.status).json(result.value);
  }

  const config = result.value; // Parsed and validated
  const apiKey = config.HEVY_API_KEY;
});
```

**Benefits:**
- Handles dot notation parsing automatically
- Validates against Zod schema
- Provides proper error responses
- Skips reserved parameters (`api_key`, `profile`)

### 3. Environment Variables

Smithery sets these environment variables:

- `PORT=8081` - Your container MUST listen on this port
- Any values defined in `env` section of `smithery.yaml`

### 4. CORS Requirements

For browser-based clients, CORS must be configured:

```typescript
app.use(cors({
  origin: "*",  // Allow all origins for /mcp endpoint
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["*"],
  exposedHeaders: ["mcp-session-id", "mcp-protocol-version"],
  maxAge: 86400,
}));
```

**Required Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: *`
- `Access-Control-Expose-Headers: mcp-session-id, mcp-protocol-version`

### 5. Python Example (for reference)

The documentation includes a Python example showing:

```python
# Get port from environment variable
port = int(os.environ.get("PORT", 8080))

# Listen on 0.0.0.0 (required for Docker)
uvicorn.run(app, host="0.0.0.0", port=port)
```

## Impact on Our Implementation

### What Changes

1. **Install Smithery SDK** - Use `parseAndValidateConfig()` helper
2. **Parse Query Parameters** - Extract config on each request (not just initialize)
3. **CORS Middleware** - Add proper CORS configuration
4. **Port Binding** - Already correct (we use `PORT` env var)
5. **Host Binding** - Already correct (we use `0.0.0.0` in Docker)

### What Stays the Same

- Dockerfile configuration ✅
- Multi-stage build ✅
- Port environment variable usage ✅
- HTTP transport implementation ✅

### Updated Approach

Instead of complex session management, we can use a **simpler per-request approach**:

1. Parse query parameters on **every request** using Smithery SDK
2. Create/reuse client based on API key
3. Cache clients by API key (not session ID) for performance
4. This naturally supports multi-user scenarios

### Example Implementation Pattern

```typescript
import { parseAndValidateConfig } from "@smithery/sdk";

const configSchema = z.object({
  HEVY_API_KEY: z.string().min(1),
});

// Cache clients by API key for performance
const clients = new Map<string, HevyClient>();

app.post("/mcp", async (req, res) => {
  // Parse config from query params
  const result = parseAndValidateConfig(req, configSchema);

  if (result.error) {
    return res.status(result.value.status).json(result.value);
  }

  // Get API key from config or fallback to env
  const apiKey = result.value.HEVY_API_KEY || process.env.HEVY_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "HEVY_API_KEY required" });
  }

  // Get or create client for this API key
  let client = clients.get(apiKey);
  if (!client) {
    client = createClient(apiKey, baseUrl);
    clients.set(apiKey, client);
  }

  // Continue with request handling using client...
});
```

## Recommended Next Steps

1. ✅ Install `@smithery/sdk`
2. ✅ Add CORS middleware to HTTP server
3. ✅ Create config schema matching `smithery.yaml`
4. ✅ Use `parseAndValidateConfig()` in request handler
5. ✅ Implement client caching by API key
6. ✅ Test locally with Docker
7. ✅ Deploy to Smithery

## Testing Locally

```bash
# Build and run
docker build -t hevy-mcp .
docker run -p 8081:8081 \
  -e PORT=8081 \
  -e MCP_HTTP_PORT=8081 \
  -e MCP_HTTP_HOST=0.0.0.0 \
  hevy-mcp

# Test with query parameter
curl "http://localhost:8081/mcp?HEVY_API_KEY=your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

## References

- [Smithery Custom Container Docs](https://smithery.ai/docs/build/deployments/custom-container)
- [Smithery Session Config Docs](https://smithery.ai/docs/build/session-config)
- [Python FastMCP Cookbook](https://smithery.ai/docs/cookbooks/python_custom_container)
- [Smithery SDK on npm](https://www.npmjs.com/package/@smithery/sdk)
