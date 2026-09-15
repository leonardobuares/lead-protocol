# AGENTS.md — Pointer for AI Agents

> This file acts as a universal pointer for agents like Cursor, Windsurf, Antigravity, and Codex.

This repository operates under the **Lead Protocol**. All operational instructions, project context, and state definitions are stored in the `.agents/` directory.

Before taking any action, read the rules and the current state in this order:

1. `.agents/CORE_RULES.md` — index + essential contracts
2. `.agents/PROJECT_RULES.md` — identify the scopes listed in `§J8 Active modules`
2a. **Setup gate:** if `.agents/PROJECT_RULES.md` is missing or still pristine (`§J1` Name or `§J8` substrate/modules still contain `[...]` placeholders) and no repo-root `.lead-protocol-source` sentinel exists, run the first-run setup interview defined in `.agents/PROTOCOL_RULES.md §P10` and write the answers before serving any request, even if the user asked for something else first. Reply `later` or `skip` defers for this session only; non-interactive environments warn without writing configuration. Preserve existing values and clarify required answers per §P10.
3. For each scope listed in `§J8 Active modules` (in declaration order): `.agents/modules/<scope>.md`
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map; resolve your own `<agent>` slug here (needed to form the per-pair handoff path)
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness
6. `.agents/local/<actor>/<agent>/handoff.md` — state of THIS `(actor, agent)` pair

Before answering a project question, consult relevant `INDEX.md` entries on demand, then read canonical sources. If the map is absent, use `PROJECT_RULES.md §J6` and the independent search recipes in `PROTOCOL_RULES.md §P-Access`; absence never blocks legacy boot. Do not load the full map or its targets at boot.

`PROTOCOL_RULES.md` is read on demand, not in the baseline — `CORE_RULES.md` points to it. See `PROTOCOL_RULES.md §P-Access` for the full load contract.

Do not bypass the protocol. Your work must be logged in your pair's `handoff.md` and, when applicable, in `.agents/decisions.jsonl` and `.agents/JOURNAL.md` at the end of your session.
