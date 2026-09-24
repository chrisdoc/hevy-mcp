# entire-graph — instructions for coding agents

Use the local `entire graph` code graph to narrow exploration without trading
away correctness. Graph output is evidence, not an oracle; verify it against
source in the current checkout.

## Choose the discovery path

If the task names an exact file, read it directly, using focused line ranges
when useful. Read-only documentation tasks do not require graph setup.

For code discovery, prefer a graph search when `entire` and its graph are
available:

    entire graph search --repo . --profile full --query "<the task or bug in one sentence>"

Open the relevant results with a file-read tool, inspect enough surrounding
behavior to justify the change, and make the smallest complete edit. If the
graph is unavailable, stale, unsupported, or inconclusive, use targeted text
search and focused source reads instead. Do not let optional graph tooling
block the task or treat missing graph results as proof that code is absent.

## Verification rules

1. Read focused source around results. Widen the check when aliases, generated
   code, dynamic dispatch, or related implementations could matter.
2. Use graph follow-ups only when they answer a real question. For impact or
   callers, prefer:

       entire graph impact --repo . --symbol X

3. Make the smallest complete edit and check sibling sites or contracts when
   the task implies them.
4. Verify before stopping. Run the most focused relevant test, build, or
   reproduction during iteration, then follow the full validation requirements
   in `AGENTS.md` and `CONTRIBUTING.md` before a PR. If execution is unavailable,
   perform a bounded source-level verification and state the limit.
5. Prefer precise queries and line ranges, but never trade correctness for
   fewer turns.
6. Feature-detect before relying on semantic relations:

       entire graph capabilities --json

## Reference

    locate  ->  entire graph search --repo . --profile full --query "..."
    impact  ->  entire graph impact --repo . --symbol X   (one shot: callers, callees, type consumers, data flow, co-change, siblings)
    callers ->  entire graph neighbors --repo . --symbol X --relation CALLS --direction in
    change  ->  entire graph diff --base A --head B --json
    detect  ->  entire graph capabilities --json   (inventory-only languages have no relations)
    stats   ->  entire graph stats --repo .        (human-facing token-savings report; not part of your workflow — do not run it unless asked)
