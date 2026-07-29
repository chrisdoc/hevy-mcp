# MCP tool token cost tracking

The repository measures the static token cost of the tool definitions returned
by MCP `tools/list`. Advisory tool-count and average-size targets remain
visible, while the total catalog budget is an enforced release-safety gate.

## Local usage

Run the human-readable report:

```bash
npm run measure:tokens
```

Write JSON and Markdown, optionally comparing against a previous result:

```bash
npm run measure:tokens -- \
  --output /tmp/token-cost.json \
  --baseline token-cost-baseline.json \
  --markdown /tmp/token-cost.md
```

Use `npm run measure:tokens -- --help` for the full option list. Unknown
options and missing option values are rejected with a nonzero exit status.
Output files are created with owner-only permissions and are never overwritten.
Choose fresh paths or remove obsolete output files before rerunning the command.

## Measurement semantics

- The total encodes the complete JSON-serialized `{ tools }` result from the
  public MCP `Client.listTools()` API. It therefore includes every advertised
  field, including input/output schemas, annotations, and execution metadata.
- Each per-tool value encodes one complete tool object independently. Shared
  envelope punctuation and separators are only present in the total, so the
  per-tool values need not sum exactly to it.
- Results use `o200k_base` from `tiktoken`. This is a stable comparison proxy,
  not a promise of the exact count used by every model or MCP client.
- JSON is deterministic, camelCase, and schema-versioned. It deliberately has
  no timestamp so an unchanged tool set produces an unchanged result.

## Baseline and targets

`token-cost-baseline.json` is the committed schema-version-2 baseline for the
current 26-tool catalog. It is also the fallback for pull-request bases that
predate the measurement script. Once the base revision has the script and
package wiring, CI measures that exact base SHA instead.

The compact baseline is **7,938 total tokens**, averaging **305.31 tokens per
tool** with `o200k_base`.

The project tracks these targets:

- no more than 20 tools (advisory);
- fewer than 600 average tokens per tool (advisory);
- no more than 8,900 total catalog tokens (enforced when `--enforce-budget` is
  passed).

## GitHub Actions behavior

The token-cost workflow runs for pull requests targeting `main`, pushes to
`main`, and manual dispatches. It writes the Markdown report to the Actions job
summary and uploads the current JSON, comparison JSON, and Markdown report in
an artifact named for the head SHA.

Pull requests compare against the exact base revision when that revision has
token-measurement support. Dependency installation or measurement failures on
an eligible base fail the workflow instead of silently dropping the comparison.
Only bases that predate the measurement script and package wiring use the
committed launch baseline as a fallback.

For same-repository pull requests, a separate least-privilege job creates or
updates one hidden-marker comment. Fork pull requests still measure, summarize,
and upload artifacts, but skip comments because their workflow token does not
receive pull-request write access.
