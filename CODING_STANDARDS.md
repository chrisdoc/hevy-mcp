# Coding Standards for hevy-mcp

Guidelines for reviewer agents and code authors. Reserved for architectural judgment calls that automated linters (`oxlint`, `oxfmt`, `tsc`) cannot deterministically enforce.

---

## 1. Test Meaning & Integrity

- **Tautological tests considered harmful:**
  - Never write tests that mirror the implementation or assert identity transforms.
  - Tests must assert observable domain behavior, boundary conditions, or external contract conformance.
  - Never test mocks against mocks. Mock at the external network/system boundary only.

## 2. Error Preservation & Resilience

- **Preserve structured domain errors:**
  - When catching or wrapping lower-level errors (e.g. from fetch or Worker adapters), preserve root causes and error tags (`status`, `retryAfter`, `errorType`).
  - Do not flatten domain errors into generic strings (`new Error("Request failed")`). Retain error shapes so resilience interpreters (e.g. rate limit retry policies) can act on them.

## 3. Data Sanitization & Observability Boundaries

- **Sanitize logged and reported payloads:**
  - Sanitize authorization headers (`Bearer ...`), API keys, and private user identifiers before exporting to logs, traces, or MCP tool responses.
  - Ensure error reporting payloads do not expose raw internal stack traces in user-facing client responses.

## 4. Separation of Mechanical vs Architectural Concerns

- **Mechanical standards belong to tooling:**
  - Code formatting, import sorting, syntax rules, and type completeness are enforced by `pnpm run check` (`oxlint` + `oxfmt` + `tsc`).
  - Reviewers should not spend attention on formatting; focus review exclusively on domain correctness, Effect runtime safety, and package boundaries.
