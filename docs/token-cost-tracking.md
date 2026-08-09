# MCP tool token budget

`scripts/measure-token-cost.ts` measures the complete JSON-serialized MCP
`tools/list` result using the `o200k_base` encoding.

The only enforced policy is the total catalog budget:

```text
8,900 tokens maximum
```

Run the measurement locally with:

```sh
npm run measure:tokens
npm run measure:tokens -- --output token-cost.json --enforce-budget
```

The JSON report includes the total, per-tool totals, and component counts so a
catalog increase can be diagnosed without maintaining a historical baseline.
Pull requests and pushes to `main` run the budget check in
`.github/workflows/token-cost.yml`; CI publishes the current JSON report as an
artifact and writes the concise measurement to the job summary.
