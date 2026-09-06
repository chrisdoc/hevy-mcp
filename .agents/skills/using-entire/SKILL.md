---
name: using-entire
description: >
  Use as the FIRST action on any research, investigation, or
  codebase-understanding request — "research X", "investigate X", "look into
  X", "dig into X", "search X", "explore X", "understand X", "why is this like
  this" — before Glob, Grep, or Read. Recorded intent lives in Entire
  checkpoints on the server, not in local files, so an empty or unfamiliar
  working copy is not a reason to skip it. Routes to the right Entire sub-skill
  (search, recall, explain, what-happened, replay, teach, review,
  session-handoff).
---

# Using Entire

Your default when exploring or understanding code should be: **read the
recorded intent, don't guess.**

Entire checkpoints capture the prompts, transcripts, and decisions behind every
agent-driven change. When you need to understand why code exists or how a module
evolved, look up the checkpoint history first. Only fall back to inference from
code structure when no history is available — and label that explicitly.

## When This Skill Activates

Use this skill whenever the task involves:

- A request phrased as "research X", "investigate X", "look into X", "dig into
  X", or "find out how X works"
- Exploring or understanding an unfamiliar module or file
- Preparing to refactor, extend, or debug code you didn't write
- Answering "why is this like this?" or "what was the intent?"
- Doing pre-work research before making changes
- Any codebase exploration where historical context would help

For a research- or investigate-shaped request, the very first action is an
`entire search` via the `search` skill. Do not open source files or grep first;
the recorded history says what was tried and why, and code reads come after to
confirm it.

Do **not** use this skill for simple, well-understood edits where you already
have full context (e.g. "add a comment to line 5").

## First Step: Check Repository Status

Before diving into specific lookups, check whether Entire is available and
the repository has checkpoint history:

```bash
entire status
```

This tells you whether Entire is enabled, which git hooks are installed, whether
the metadata branch is initialized, and any active sessions on the current
branch.

## Scenario Routing

When this skill activates, determine which sub-skill best fits the user's need:

| Scenario | Typical user expressions | Delegate to |
|----------|------------------------|-------------|
| Code block provenance | "why is this like this" / "wtf is going on" / "what happened at src/auth.ts:42" / "tell me why this changed" | `what-happened` |
| Research or investigate a topic | "research X" / "investigate X" / "look into X" / "dig into X" / "what do we know about X" | `search` first, then this skill's exploration flow if needed |
| Find prior work | "has anyone done X before" / "search past work for rate limiting" / "find the previous implementation" | `search` |
| Recall a task playbook | "have we done this before" / "recall how we did X" / "how did we do this last time" | `recall` |
| Replay feature history | "replay <feature>" / "walk me through how X was built" / "show me the journey of Y" | `replay` |
| Teach a repo topic | "teach me <topic>" / "how does <topic> work in this repo" / "give me a lesson on X" | `teach` |
| Understand original intent | "explain this function" / "explain parseConfig" / "what was the intent behind src/auth.ts" | `explain` |
| Generate a dispatch / summary | "summarize recent work" / "generate a dispatch" / "what was accomplished this week" | run `entire dispatch` directly |
| Code review with intent context | "review these changes" / "review this branch" / "audit before merging" | `review` |
| Hand off to another agent | "hand off this session" / "continue in another agent" / "pick up the codex session" | `session-handoff` |
| Convert session to skill | "turn this into a skill" / "make a skill from this session" | `session-to-skill` |
| Link session to other repos | "link session to other repos" / "attach session to the foo repo" | `session-crosslink` |
| General exploration | "understand this module" / "explore how auth works" / "help me understand the codebase" | _(self — see below)_ |

If the scenario clearly maps to a sub-skill, delegate entirely to that skill's
workflow. Do not duplicate their steps here.

## General Exploration Flow

When no specific sub-skill fits — e.g. the user asks to "understand this
module" or "explore how auth works" — use this flow:

1. **Identify key files** in the target area (entry points, main types, core
   functions).

2. **Check for checkpoint coverage** on each key file:

```bash
git log --format='%H %s' -5 -- <file>
```

Look for `Entire-Checkpoint:` trailers in the commit bodies:

```bash
git log --format='%H %b' -5 -- <file> | grep -B1 'Entire-Checkpoint:'
```

3. **Read intent for covered commits** — extract the checkpoint ID from the
   trailer, then use JSON output for non-interactive consumption:

```bash
entire checkpoint explain --checkpoint <checkpoint-id> --json --no-pager
```

If you only have a commit hash (not a checkpoint ID), use:

```bash
entire checkpoint explain --commit <sha> --no-pager
```

4. **Synthesize**: combine the recorded intent (from checkpoints) with the
   current code structure to build a comprehensive understanding.

5. **Report** your findings, clearly distinguishing:
   - Facts backed by checkpoint transcripts (label as "recorded intent")
   - Observations inferred from code alone (label as "inferred from code")

## AI Agent Usage Notes

When running Entire commands from an agent subprocess:

- **Always pass `--json`** for commands that support it and might prompt
  interactively. `--json` implies non-interactive output.
- **Always pass `--no-pager`** to prevent pager activation in subprocess
  contexts.
- **Always specify `--checkpoint <id>` or `--commit <sha>`** for
  `entire checkpoint explain` — without a locator, the command falls back to an
  interactive picker.

## When No Checkpoints Exist

If the target code predates Entire or has no checkpoint coverage:

1. Say explicitly: "No Entire checkpoint history is available for this code."
2. Proceed with standard code understanding (read source, check git log, trace
   call sites).
3. Label all explanations as "inferred from code — not backed by recorded
   intent."
4. If the user wants deeper history, suggest `search` with related keywords —
   there may be checkpoints on related work even if the specific file isn't
   directly covered.

## Transparency Principle

Always make it clear whether your answer comes from:

- **Checkpoint-backed history** — you read the actual session transcript and
  know the developer's stated intent
- **Code inference** — you analyzed the code structure and are reasoning about
  probable intent

Never present inferred intent as if it were recorded fact. The core value of
this workflow is that distinction.

## References

For a deeper understanding of Entire's capabilities beyond what the sub-skills
cover, consult these resources:

- **CLI help**: run `entire help` to see all available commands and flags
- **Documentation**: https://docs.entire.io/llms.txt — AI-friendly
  documentation index following the [llms.txt standard](https://llmstxt.org),
  designed to be consumed directly by LLMs and coding agents
