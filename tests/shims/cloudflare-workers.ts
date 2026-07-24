// Minimal Node.js stand-in for the `cloudflare:workers` runtime module so
// unit tests can import Worker code that depends on
// @cloudflare/workers-oauth-provider. The library only uses this export for
// `instanceof` checks on class-based handlers, which the tests do not use.
export class WorkerEntrypoint {}
