# Hevy MCP Privacy Policy

_Last updated: 2026-08-09_

This policy describes how the hosted Hevy MCP service at
`https://mcp.hevy-mcp.dev/mcp` handles information. The open-source software
can also be run locally; local deployments are controlled by the person who
runs them and do not send data to the hosted service unless configured to do so.

## Information processed

The hosted service processes the following information to provide MCP tools:

- A user's Hevy API key, supplied in an authorization header or through the
  OAuth authorization page.
- The user's Hevy data needed to answer a tool request, including workouts,
  routines, exercise templates, and body measurements.
- Operational request metadata such as the request path, client origin,
  authentication mode, response status, and duration.
- Hosted MCP activity spans may contain a short HMAC-based pseudonym derived
  from the API key and the Cloudflare colo that processed the request. The
  pseudonym is not the API key, and the colo is a regional edge proxy rather
  than exact user geography.

The service does not intentionally collect conversation history, prompts, tool
arguments, tool results, workout content, measurement values, raw client IP
addresses, or API keys in its operational telemetry.

## How information is used

Information is used only to authenticate the user with Hevy and perform the
requested MCP operation. The service does not sell personal information or use
workout data for advertising.

## Storage and retention

For direct bearer authentication, the hosted Worker validates the API key with
Hevy for each request and does not persist the key. Request data is processed
transiently to produce the MCP response.

For Claude and other OAuth clients, the OAuth layer stores the authorization
grant in encrypted Cloudflare KV storage so that the client can refresh its
access. OAuth access tokens expire after seven days and refresh tokens expire
after thirty days. Rotating the Hevy API key invalidates grants created with
that key.

Hosted activity spans containing `span.user.hash` or `span.cloudflare.colo` are
retained for 30 days and are accessible only to repository maintainers and the
on-call operator.

The hosted Worker uses request-scoped in-memory caches and does not maintain a
shared workout-data database. Cloudflare may process operational logs under
its own privacy terms and retention policies.

## Third parties

The service sends authenticated API requests to Hevy to fulfill user requests.
Claude or another MCP client receives the resulting data according to that
client's own policies. Cloudflare provides hosting and storage for the hosted
Worker and OAuth grants.

## User choices

Users can disconnect the MCP connector, revoke its authorization, or rotate
their Hevy API key. Users running the software locally can disable telemetry
and control all local storage and network configuration; see the repository
README for details.

## Contact

For privacy questions or deletion requests related to the hosted service,
open an issue at <https://github.com/chrisdoc/hevy-mcp/issues>.

## Changes

This policy may be updated when the service or its data practices change. The
latest version is maintained in the public repository.
