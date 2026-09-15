# PROTOCOL_RULES.md — Lead Protocol framework rules (generic)

> Version: 2.2.0 | Updated: 2026-09-15
> Scope: Substrate-agnostic kernel. Opt-in modules live in `modules/` and are activated via `PROJECT_RULES.md §J8`.
> This file contains no project-specific content — that lives in `PROJECT_RULES.md`.

---

## §P1 — Versioning

| File type | Format | Example | When to bump |
|---|---|---|---|
| Agent operation files (`CORE_RULES.md`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`) | `X.Y.Z` | `2.0.0` | Patch (Z) for clarifications/text fixes; Minor (Y) for new sections/rules; Major (X) for structural rewrites |
| Module files (`modules/*.md`) | `X.Y.Z` | `1.0.0` | Same rules as agent operation files. Each module versions independently from the kernel. |

Projects that adopt Lead Protocol may use any versioning scheme for their own product releases — the Lead Protocol versioning rules apply only to the agent operation files and module files listed above.

Meta-repos that develop the protocol itself see `modules/meta-repo.md §M-meta-1`.

## §P2 — Authority hierarchy (framework tier)

1. `PROTOCOL_RULES.md` (framework kernel)
2. Active modules listed in `PROJECT_RULES.md §J8` (in declaration order)
3. `local/<actor>/<agent>/handoff.md` (current state for this actor × agent pair — may temporarily override stale rules if the project owner defines a temporary directive)
4. `PROJECT_RULES.md` (business context)
5. `README.md` (public surface — kept synced to the kernel per the active substrate module if any; kernel wins on conflict)
6. Project reference files (brand, product, channel, etc.)
7. Official platform policies
8. General best practices

A module cannot contradict the kernel — it can only add rules specific to a substrate, scope, or role. Where a module cites a kernel anchor, the qualifier `PROTOCOL_RULES §Px` makes the cross-file reference explicit.

The kernel (`PROTOCOL_RULES.md`) is canonical. When `CORE_RULES.md` and the kernel disagree, the kernel wins — `CORE_RULES.md` is an index into this file and cannot introduce new authority. See `§P-Access` for the CORE/PROTOCOL division rationale.

Meta-repos maintaining two copies of the framework see `modules/meta-repo.md §M-meta-2`.

## §P3 — State model and multi-agent coordination

### Three-layer state model *(v2.0.0+)*

Lead Protocol state is partitioned into three layers with distinct owners and lifecycles. Every file under `.agents/` belongs to exactly one layer.

| Layer | Owner | Lifecycle | Shared across contributors? | Canonical location |
|---|---|---|---|---|
| **Framework** | Upstream Lead Protocol release | Changes with framework version | Yes — ships in the release ZIP, identical for every project | `.agents/CORE_RULES.md`, `.agents/PROTOCOL_RULES.md`, `.agents/modules/`, `.agents/schemas/`, `.agents/scripts/` |
| **Project** | The consuming project | Changes with project evolution | Yes — versioned with the project repo | `.agents/PROJECT_RULES.md`, `.agents/JOURNAL.md`, `.agents/LESSONS.md`, `.agents/decisions.jsonl`, `.agents/AGENTS_MAP.md`, `.agents/checkpoints/`, `.agents/sessions/` |
| **Actor × Agent** | One human operator running one AI agent | Changes every session | No — isolated per `(actor, agent)` pair, never committed | `.agents/local/<actor>/<agent>/handoff.md`, `.agents/local/<actor>/<agent>/tasks/TASK.md`, `.agents/local/<actor>/<agent>/activity.log`, `.agents/local/<actor>/<agent>/lessons.md` |

### Why the volatile unit is `(actor, agent)`, not `actor` alone

The primary use case the protocol exists to serve is **multi-agent interchange on the same machine, same user, same project** — e.g., Marco running Claude Code, Codex, Gemini, and Cursor on the same codebase. Keying volatile state only by the human actor would put all four agents on the same `handoff.md` and destroy the very interchange the protocol promises. The smallest unit of concurrency in practice is the pair, not the user.

Two agents operated by the same actor have independent `handoff.md`, `tasks/TASK.md`, `activity.log`, and personal `lessons.md`. Cross-agent coordination happens through the **shared project layer** — specifically, checkpoints in `.agents/checkpoints/` — never by overwriting a peer's volatile state.

### Identifying the pair `(actor, agent)`

**`<actor>`** — the human operator. Resolution by precedence:

1. `LEAD_PROTOCOL_ACTOR_ID` (environment variable) — first-class override. Primary use: CI pipelines, DevContainers, Codespaces.
2. `.agents/local/WHOAMI.txt` — persistent per-project override. Nomads who want continuity across machines drop the `@host` suffix by writing just the user here.
3. Ephemeral-environment detection — if `CI`, `GITHUB_ACTIONS`, `CODESPACES`, or `DEVCONTAINER` is set, fall back to `<user>@ephemeral` to avoid writing to a hostname that will not exist tomorrow.
4. Default — `<user>@<host>` derived from `$USERNAME`/`$USER` plus `$COMPUTERNAME`/`hostname`.

**`<agent>`** — the AI agent in runtime. Resolution by precedence (no circularity — no source below depends on already knowing `<agent>`):

1. `LEAD_PROTOCOL_AGENT_ID` (environment variable) — explicit override. Recommended in every master prompt where the IDE vendor is known. Canonical when present.
2. `.agents/AGENTS_MAP.md` — project-level shared map of tool signatures to agent slugs. The agent reads its own tool signature (User-Agent, process name, or IDE-exposed tool name) and looks up the slug.
3. Direct self-identification — if the tool signature is not mapped but the agent has a confident self-reported name (e.g., Claude Code exposing its own identifier), use it directly, and **propose** adding the missing mapping to `AGENTS_MAP.md` via an explicit message to the user. The agent never edits `AGENTS_MAP.md` on its own; see *`AGENTS_MAP.md` governance* below.
4. Fallback — `unknown-agent-<timestamp>` under `local/<actor>/`, with `agent_identity: unresolved` flagged in the handoff.

**Bootstrap invariant:** `<agent>` resolution never reads from `local/<actor>/<agent>/` — that path only exists *after* `<agent>` is known. Every source in the precedence chain lives in a deterministic location that does not depend on the pair path.

**Fallback is intentionally unstable.** Every unresolved session from the same tool creates a new `unknown-agent-<timestamp>/` folder, fragmenting continuity. This is deliberate — the fragmentation is a social signal that pushes the user to normalize identity via environment variable or a new `AGENTS_MAP.md` entry. Fallback is a safety valve, not an operating mode.

### `AGENTS_MAP.md` governance *(v2.0.0+)*

`.agents/AGENTS_MAP.md` is shared project state, versioned with the project repo, **and maintainer-managed**:

- The agent never edits `AGENTS_MAP.md` autonomously. When direct self-identification succeeds but the tool signature is not mapped, the agent proposes the addition to the user (`"detected unmapped signature 'X'; add 'X = <slug>' to AGENTS_MAP.md?"`) and waits for explicit confirmation. The human or maintainer commits the change through the normal project channel (git commit, OneDrive sync, etc.).
- Rationale: autonomous mutation of shared versioned state creates silent conflicts and opaque audit trails. Orchestration of agents operates on **explicit commands**, not on inferred state.
- Interaction with the fallback: if the user ignores the proposal, the agent keeps operating under `unknown-agent-<timestamp>/` for every new session. The accumulating folders are the signal — no other nag is needed.

Not to be confused with the repository-root `AGENTS.md`, which is a universal pointer file for agents (Cursor, Claude Code, Antigravity, etc.) and serves a different purpose — hence the `_MAP` suffix on this file.

### Resolved path

Once `<actor>` and `<agent>` are resolved, volatile state for this session lives under:

```
.agents/local/<actor>/<agent>/handoff.md
.agents/local/<actor>/<agent>/tasks/TASK.md
.agents/local/<actor>/<agent>/activity.log
.agents/local/<actor>/<agent>/lessons.md
```

`.agents/local/` is always gitignored (see the template `.gitignore`). It never travels between contributors.

### Append-at-tail rule (bounded concurrency)

Every shared project-layer file that grows over time — `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, and each actor's personal `activity.log` — is **append-only at the end of the file**. Prepending (adding at the top) requires reading and rewriting the full file, increasing the risk of overwriting concurrent changes on a synced folder (OneDrive, Google Drive). Appending reduces that risk across supported substrates (git, cloud-sync, local-only), but provides no locking, atomic-entry, or lossless concurrency guarantee.

Consequences:

- `JOURNAL.md` reads oldest-first, newest-last. Agents consult recent entries via `tail -n N` or the functional equivalent, not `head`. There is no top-of-file index to drift.
- `LESSONS.md` has no top-of-file table of contents. Queries go through `grep` over inline tags (`grep -A 10 "tags:.*rate-limit" LESSONS.md`).
- `decisions.jsonl` is JSON Lines, one object per line (see *Decisions log* below), not a JSON array — a JSON array cannot be appended to atomically.

#### Integrity invariants *(v2.1.1+)*

The append-at-tail rule implies three invariants that every writer must uphold, on every substrate:

1. **Correction is a new entry, never a rewrite.** An erroneous past entry is corrected by appending a new entry that references it and states the correction (in `decisions.jsonl`, a new line whose rationale points at the entry it supersedes; in `JOURNAL.md` / `LESSONS.md`, a new dated entry). Rewriting or deleting past content silently invalidates what other agents already read, and rewrites race against concurrent appends.
2. **Every append ends with a newline.** The file must always end with a final newline. Without it, the next append glues onto the last line; in `decisions.jsonl` that produces two JSON objects on one line, which is structurally invalid JSONL.
3. **Structural corruption blocks new appends.** Unresolved merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), glued JSONL lines, and a duplicated top-of-file header are structural corruption. On finding any of them, fix the structure first (minimal repair, preserving both sides' entries) and log the repair in `decisions.jsonl` before appending anything else. Never build on corrupted state (see *Recovery mode*).

Enforcement: `scripts/validate_state.py` and the CLI's `lead-protocol validate` run in a plain local directory without Git. They detect conflict markers outside valid Markdown fences, missing final newlines in the three shared append-only logs, duplicated H1 headers outside fences in `JOURNAL.md` / `LESSONS.md`, and malformed or schema-invalid JSONL. JSONL never uses Markdown fence skipping. Mutable sessions and handoffs receive conflict-marker checks, not the append-only newline or H1 checks. These are structural checks: they cannot prove that history was never rewritten, recover semantic entry boundaries, or provide locking. Substrate-specific merge guidance belongs in the optional substrate module.

### Handoff schema (`local/<actor>/<agent>/handoff.md`) — strict, always overwritten

```markdown
# handoff.md — Current operational state
> Version: X.Y | Updated: YYYY-MM-DD

**Last Agent:** [Agent signature]
**Timestamp:** YYYY-MM-DD HH:MM
**Status:** STABLE | BLOCKED | IN_PROGRESS
**Last Action:** <1 sentence>
**Pending Step:** <what's next or "None">
**Blockers/Context:** <errors, files, warnings, or "None">
**Open Threads:** <unrelated pending items, or "None">

**Session close checklist (self-verified):**
- [ ] `activity.log` contains an entry for this session
- [ ] `decisions.jsonl` appended (if any decision was made)
- [ ] `local/<actor>/<agent>/lessons.md` appended (if a personal lesson emerged)
- [ ] `LESSONS.md` appended (if a project-level lesson emerged)
- [ ] `JOURNAL.md` appended (if the session produced a structurally significant delivery)
- [ ] Commit(s) follow `[Agent] <type>: <summary>` convention
- [ ] Version bumps applied to any rules file whose content changed
- [ ] `active_sessions.md` row for this session removed (if registry is in use)
```

Schema is immutable — no agent may add sections, tables, or free paragraphs. Timestamp must include HH:MM. The session close checklist is **part of the schema** and contains exactly the eight persisted items above; each box is self-verified by the agent before closing. Unchecked boxes signal incomplete close to the next agent.

Branch ordering is a workflow verification, not a ninth persisted handoff field. When an active substrate requires feature branches and pull requests, verify the current branch, commits, and PR head/base directly through that substrate as described in its module (for git, see `modules/git-substrate.md §M-git-6`).

Each pair `(actor, agent)` has its own `handoff.md` — agents operated by the same actor never compete for writes on the same file. When the owner wants to hand context from one agent to another, the path is **publishing a checkpoint in `.agents/checkpoints/`**, not overwriting the peer's handoff.

Projects that distribute pristine handoff templates (placeholder-populated, not yet in use) see `modules/meta-repo.md §M-meta-4`.

### Takeover rule

| Condition | Behavior |
|---|---|
| Timestamp **< 30 min ago** AND no peer session live in `active_sessions.md` for the same `(actor, agent)` pair | Do not proceed. Assume prior agent is still active. |
| Timestamp **< 30 min ago** AND a different pair is live in `active_sessions.md` | Two pairs are legitimately concurrent. Do NOT take over — see *Concurrent sessions* below. |
| Timestamp **≥ 30 min ago** | Assume interrupted. Record takeover in `decisions.jsonl` with rationale `"Takeover: previous session assumed interrupted (>30min)"`. Run recovery mode before proceeding. |
| Timestamp **< 30 min** + explicit human override | Proceed. Rationale: `"Forced takeover: human override"`. |

Takeover is scoped to the `(actor, agent)` pair's own `handoff.md`. A peer pair's recent activity never triggers a takeover of your own handoff.

### Recovery mode

Before continuing a prior `Pending Step`:

1. Read the last entry in `.agents/decisions.jsonl` (tail the file; `decisions.jsonl` is append-only).
2. Spot-check files listed in `files_affected`.
3. If state is inconsistent (missing headers, version conflicts, half-written content): fix or revert first — never build on corrupted state.
4. Log the recovery action in `decisions.jsonl`.

Meta-repos with two `decisions.jsonl` files (IDE vs. template) see `modules/meta-repo.md §M-meta-3`.

### Decisions log (`.agents/decisions.jsonl`) — append-only, immutable

`decisions.jsonl` is **JSON Lines** — one JSON object per line, no enclosing array, no comma between entries. The canonical schema for a single entry is `schemas/decisions.entry.schema.json` (introduced in v2.0.0). The pre-v2 array-form `decisions.schema.json` is removed, not kept as a legacy alias, so there is no ambiguity about which schema is authoritative.

```jsonl
{"timestamp":"2026-04-21T15:30:00","agent":"[Claude Code / claude-opus-4-7]","decision":"Short imperative","rationale":"Why","files_affected":["path/to/file.md"],"status":"completed"}
{"timestamp":"2026-04-21T16:05:00","agent":"[Codex / GPT-5.4]","decision":"...","rationale":"...","files_affected":[],"status":"completed"}
```

Why JSONL, not a JSON array:

1. **Small append.** Adding a decision writes one line at the end — no read, parse, re-serialize, rewrite. Atomicity depends on the substrate and writer; concurrent writes or synchronization can still corrupt or lose records. Validate structure before continuing.
2. **Cheap line-by-line query.** Agents grep or filter line-by-line without loading the full file — consistent with the demand-load contract in `§P-Access`.
3. **Scales past the point a JSON array becomes an anti-pattern.** A 200-entry JSON array is unreadable without tooling; 200 JSONL lines are trivially filterable.

Never edit past entries. To correct an erroneous entry, append a new corrective entry whose rationale references the entry it supersedes (see *Integrity invariants* above). If the file is corrupted (a line is not valid JSON), the recovery agent fixes the structure before appending new entries.

### Commit convention

```
[Agent] <type>: <short summary>
```

Where `[Agent]` is `[Claude]`, `[Cursor]`, `[Codex]`, etc., and `<type>` is `feat|fix|refactor|docs|ops|chore`. This convention is substrate-neutral — it applies whether the underlying system is git, a cloud-sync folder, or any other change-tracked substrate. Substrate-specific workflows (branching, pull requests, CI) live in substrate modules such as `modules/git-substrate.md`.

### Session close ritual *(v1.5.0+, updated in v2.0.0)*

A **"non-trivial session"** is one where any of the following occurred:

- A change was committed (by the active substrate's commit mechanism)
- A review/approval artifact was opened, updated, or merged (when a substrate module defines one)
- A file outside `.agents/local/<actor>/<agent>/` was modified
- A product, strategy, or architectural decision was made
- A user-facing deliverable was shipped

At the end of a non-trivial session, the agent **must** update every applicable artifact below **and** check the corresponding box in the `handoff.md` session close checklist:

| Artifact | Mandatory trigger | Skip if |
|---|---|---|
| `local/<actor>/<agent>/handoff.md` | Always | Never skipped |
| `local/<actor>/<agent>/activity.log` | Any session activity worth remembering locally | Pure read-only Q&A that produced nothing reusable |
| `.agents/decisions.jsonl` | A decision was made, a file was created/renamed/deleted, or a version was bumped | No decisions and no file state changed |
| `local/<actor>/<agent>/lessons.md` | A **personal** lesson emerged (about how this actor × agent pair works) | No personal lesson emerged |
| `.agents/LESSONS.md` | A **project-level** lesson emerged (applies to any actor working here) | No project-level lesson emerged |
| `.agents/JOURNAL.md` | The session produced a **structurally significant delivery** (see promotion rule below) | Routine activity, small fixes, exploration |
| `.agents/sessions/active_sessions.md` | Registry is in use and this session has an open row | Registry not in use, or no open row |

Before closing, verify affected `INDEX.md` and folder navigation pointers were maintained in the same session for file/folder create/remove/rename/move and section/anchor changes. This is a quality check, not a ninth persisted handoff checklist item.

**JOURNAL promotion — procedural, not heuristic.** At session close, the agent asks the user exactly one procedural question: *"Did this session produce a structurally significant delivery? If yes, promote to JOURNAL."* The user replies with one word. No background detection, no heuristic guessing — orchestration of agents operates on **explicit commands**, never on state inference. The criterion for a "yes" is the six-month test: *if a new contributor arriving in six months would still benefit from seeing this entry, it belongs in JOURNAL; otherwise it belongs only in the actor's personal `activity.log`*.

### Execution evidence — session closeouts

`execution_evidence` is **optional globally** for compatibility. For implementation/code/UI/infrastructure
completion, the normative rule is: an implementation task **must not be marked complete solely because files were changed**.
Record the validation actually executed and its results, or explicitly record why validation could not be
performed using `not_run` or `blocked` with a nonblank `reason`. A closed session or `STABLE` handoff is not a
claim that every implementation task passed. Preserve failed checks and limitations for the next agent.
Planning and read-only sessions may omit evidence; docs changes that claim implementation completion follow
the same rule. Empty evidence, empty checks, and legacy omission remain structurally valid but provide **no
proof of task completion**. Do not use them to satisfy the implementation-completion rule.

The portable object is defined by `schemas/execution-evidence.schema.json` (Draft 2020-12). It is attached as
`execution_evidence` in a close-receipt JSON object, or in a checkpoint's reserved `## Execution Evidence`
section containing one fenced `json` envelope with that key. It is **not a new handoff field**; the immutable
handoff stays unchanged. Put explicit checkpoint/receipt references in the existing `Blockers/Context` or
`Pending Step` field. When closing, publish the relevant receipt evidence or its durable references in a shared
checkpoint so the next agent can discover it even when the ignored pair directory is unavailable. Private
chat, an ignored local receipt, or a machine-local log path alone is not sufficient cross-machine evidence.
Do not copy secrets into artifacts; preserve reproducible references accessible to the intended reviewer.

Each command check requires `command` and `result`. Status meanings:

- `passed`: the stated check ran and met its stated expectations.
- `failed`: it ran and did not meet expectations; describe the failure (reason recommended).
- `not_run`: no execution was attempted; a nonblank reason is required.
- `blocked`: a concrete obstacle prevented execution; a nonblank reason is required.

The same reason requirement applies to browser results. `browser_validation` is optional when inapplicable.
If present, both `performed` and `result` are required: `performed:false` permits only `not_run` or `blocked`
with a reason (for example, "No browser flow in this CLI-only change"); `performed:true` permits `passed`
or `failed`. Absence or `performed:false` never means a browser check passed.

Record exact commands, per-check `cwd` or shared `environment.cwd`, runtime/platform and package-manager
versions, branch and commit identifying the tested tree (identify dirty-tree changes in `unresolved`), and
CI run URLs. `checks[].artifact` can point to logs or reports; `browser_validation.evidence` can point to
screenshots or recordings. Use durable artifact paths/URLs with sufficient provenance to reproduce the result.
The schema validates structure, **not execution truth**: it does not execute commands, inspect links, certify
artifacts, infer applicability, or decide completion. The legacy receipt's `validation` fields concern state
format/checklist checks only and do not mean implementation tests passed.

CLI support: `checkpoint --evidence evidence.json` and `session close --evidence evidence.json` accept the
object itself (without an outer `execution_evidence` key), validate against the project's schema before state
writes, and reject malformed JSON, invalid schema or evidence. Checkpoint body files may instead contain the
canonical section; do not also supply `--evidence`. JSON is rendered deterministically with markup characters
escaped and without a duplicate human table. All existing identity, transaction and close-checklist guards
still apply. Without evidence the old output shapes and schema-free omission behavior remain compatible.
The TS evidence parser reads the canonical checkpoint section and optional close-receipt field. The existing
CLI `validate` command and Python `validate_state.py` still validate handoffs/decisions only; they do not scan
checkpoints or attest receipt evidence. Use the dedicated evidence library or a Draft 2020-12 validator for
portable evidence validation. Missing or broken evidence schemas fail when evidence is supplied.

**Illustrative closeout receipt excerpt — not executed mission evidence.** The four check outcomes below
are examples, not a completed implementation. A real CLI close receipt also retains its existing session,
pair and state-validation fields. Extract `execution_evidence` for the CLI's input file.

```json
{
  "execution_evidence": {
    "git": {
      "branch": "example/billing-retry",
      "commit": "abc1234",
      "files_changed": 8
    },
    "environment": {
      "runtime": "Node.js 22.0.0 on Linux",
      "package_manager": "npm 10.0.0",
      "cwd": "/workspace/billing",
      "ci_run": "https://example.invalid/ci/runs/123"
    },
    "checks": [
      {
        "command": "npm run typecheck",
        "cwd": "/workspace/billing",
        "result": "passed",
        "artifact": "https://example.invalid/artifacts/typecheck.log"
      },
      {
        "command": "npm test",
        "result": "failed",
        "reason": "Two retry assertions failed",
        "artifact": "https://example.invalid/artifacts/tests.log"
      },
      {
        "command": "npm run e2e",
        "result": "not_run",
        "reason": "External sandbox is unavailable"
      },
      {
        "command": "npm run integration",
        "result": "blocked",
        "reason": "Sandbox credentials have not been provisioned"
      }
    ],
    "browser_validation": {
      "performed": true,
      "flow": "Login → billing → retry payment",
      "result": "failed",
      "reason": "Retry banner did not appear",
      "evidence": "https://example.invalid/artifacts/retry.png"
    },
    "unresolved": [
      "Fix retry assertions and banner; run sandbox validation before claiming implementation completion."
    ]
  }
}
```

### Branch ordering rule *(v2.0.1+)*

Session close is the **final operational step on the feature branch**. Complete all session-close artifacts that belong to a pull request before opening or merging that pull request.

**Why this order matters:** if session-close state is written on the default branch after merge, protected-branch settings may block the write or force a follow-up PR for state files only. This creates unnecessary review overhead and an audit gap where the handoff describes work that is not yet in the branch history.

**Implementation rule:** verify branch ordering from the substrate itself — current branch, included commits, and pull-request head/base — before opening or merging the pull request. Do not encode this proof as a ninth handoff checklist property. A workflow spanning multiple pull requests may keep its session active between them; its final close state must still be committed on the final feature branch before that branch's pull request is opened.

This rule is substrate-neutral. Git-specific enforcement and rationale live in the active substrate module (see `modules/git-substrate.md §M-git-6`).

**Verification step (mandatory before closing):**

Before the final response of the session, the agent verifies that each *applicable* artifact carries today's date. The implementation is substrate-agnostic — shell grep, file tooling with date filtering, or a direct read-and-check — whichever is cheapest in the active environment. If an applicable artifact does not carry today's date, the update was skipped — fix before closing.

**Personal vs project-level lessons — decision rule:**

- `local/<actor>/<agent>/lessons.md` captures lessons **about how this specific pair operates**: this agent's tool-failure modes with this actor's workflow, recovery protocols specific to the IDE, format drift noticed by this agent, cross-agent coordination patterns. Example: *"Marco tends to forget to run migrations before testing — remind next session"*.
- `.agents/LESSONS.md` captures lessons **about the project or domain**: any actor working on this project needs to know this. Systemic mistakes, decision criteria, recurring bug patterns, process fixes. Example: *"External API Z rate-limits aggressively in staging (5 req/s vs 50 req/s in prod); set a 30s timeout"*.

When in doubt, a lesson is project-level if removing the specific pair would still leave the lesson valid. If the lesson is about *how this agent or this actor works*, it is personal.

### Concurrent sessions and mid-session checkpoints *(v1.6.0+, updated in v2.0.0)*

Real-world tooling (multiple IDEs, multiple agents, multiple terminals rooted at the same repo) routinely runs more than one session live at a time — indeed, this is the primary use case for the protocol. Two mechanisms keep concurrent sessions legible without breaking any schema.

**Active sessions registry** — `.agents/sessions/active_sessions.md`

A flat markdown table, one row per live session. The agent appends its row on session start and removes the row on session close (session close checklist item).

Schema — immutable columns:

```markdown
# active_sessions.md — Sessions currently live
> Append row on session start. Remove row on session close.
> Stale rows (>24h with no checkpoint update) may be removed by any next agent with a decisions.jsonl log.

| Session ID | Agent | Started | Topic | Last checkpoint |
|---|---|---|---|---|
| 2026-04-21-1310-claude | [Claude Code / claude-opus-4-7] | 2026-04-21 13:10 | <1-line topic> | <checkpoint filename or —> |
```

**Session ID format:** `YYYY-MM-DD-HHMM-<agent-short>`. The `<agent-short>` suffix (`claude`, `gemini`, `cursor`, `codex`, etc.) prevents ID collision when two agents boot in the same minute.

**Effect on takeover rule:** when `active_sessions.md` exists and holds a row for a peer session whose Started timestamp is within the last 30 minutes OR whose Last checkpoint is within the last 30 minutes, the current agent MUST NOT take over the peer's own pair state. Concurrent sessions are legitimate — append a new row for the current session instead. Takeover of your own handoff, gated by the 30-minute rule, continues to apply.

**Mid-session checkpoints** — `.agents/checkpoints/YYYY-MM-DDTHHMMSS_<agent>_<title-slug>.md`

A checkpoint is a pre-execution snapshot written voluntarily by the agent at the owner's request (or proactively when the agent is about to take an action that would benefit from a second opinion). Checkpoints are ephemeral working notes — authoritative state lives in `handoff.md`, `decisions.jsonl`, and project files.

Checkpoints remain at the **project layer**, shared, not inside `local/`. The whole point of a checkpoint is that any peer agent in the repository can find and read it; moving checkpoints into per-pair private space would defeat the multi-agent consultation pattern that justifies the protocol in the first place.

**Unique name convention:** `YYYY-MM-DDTHHMMSS_<agent>_<title-slug>.md`. Timestamp at second precision plus the `<agent>` slug guarantee uniqueness even when two agents checkpoint the same topic on the same day. The title slug is a human-readable affix; uniqueness comes from timestamp plus agent, not from the slug.

Template — content must be self-contained so a peer agent reads it without the conversation transcript:

```markdown
# Checkpoint — <topic>
> Session: <session-id from active_sessions.md>
> Timestamp: YYYY-MM-DD HH:MM
> Author: [Agent signature]

## Open question
<what is being decided, in one sentence>

## Data gathered
<bullet list of sources consulted + key findings, with inline citations to repo files>

## Current recommendation
<what the agent is about to execute, in concrete terms — files, commits, decisions>

## What specifically needs second-opinion
<the exact part where contrarian input would be most valuable>
```

**Illustrative checkpoint evidence — not executed mission evidence.** After a checkpoint's narrative,
append the following reserved section. These mixed results preserve incomplete validation honestly. Reference
the checkpoint from the active registry, then from existing handoff context at close; do not rely on chat.

## Execution Evidence

```json
{
  "execution_evidence": {
    "git": {
      "branch": "example/billing-retry",
      "commit": "abc1234",
      "files_changed": 8
    },
    "environment": {
      "runtime": "Node.js 22.0.0 on Linux",
      "package_manager": "npm 10.0.0",
      "cwd": "/workspace/billing",
      "ci_run": "https://example.invalid/ci/runs/123"
    },
    "checks": [
      {
        "command": "npm run typecheck",
        "cwd": "/workspace/billing",
        "result": "passed",
        "artifact": "https://example.invalid/artifacts/typecheck.log"
      },
      {
        "command": "npm test",
        "result": "failed",
        "reason": "Two retry assertions failed",
        "artifact": "https://example.invalid/artifacts/tests.log"
      },
      {
        "command": "npm run e2e",
        "result": "not_run",
        "reason": "External sandbox is unavailable"
      },
      {
        "command": "npm run integration",
        "result": "blocked",
        "reason": "Sandbox credentials have not been provisioned"
      }
    ],
    "browser_validation": {
      "performed": false,
      "result": "not_run",
      "reason": "No browser flow applies to this CLI checkpoint",
      "evidence": "https://example.invalid/artifacts/previous-retry.png"
    },
    "unresolved": [
      "The screenshot reference is a previous-run artifact, not proof of a browser run at this checkpoint.",
      "Fix failing tests; sandbox checks remain unavailable."
    ]
  }
}
```

**Usage pattern:** when the owner asks for a second opinion from a peer agent, the current agent writes the checkpoint and updates the `Last checkpoint` column of its row in `active_sessions.md`. The owner opens the peer agent in another window; the peer agent boots per `§P5`, sees the fresh checkpoint referenced in `active_sessions.md`, reads it, and responds with contrarian input. No copy-paste required.

**Retention:** no automatic retention policy. Checkpoints accumulate as an audit trail. If `.agents/checkpoints/` grows beyond practical limits, the project may adopt a retention rule in `PROJECT_RULES.md §J8`.

**Scope limits:**

- The registry is advisory, not a lock. It does not prevent two agents from editing the same file concurrently — resolve conflicts per the active substrate module.
- Checkpoints do not replace `handoff.md`. They coexist: checkpoint = live snapshot of an in-progress decision; handoff = authoritative state at session close for one pair.
- Neither the registry nor checkpoints are required when only one agent ever operates on the repo. Single-pair projects may leave `active_sessions.md` empty and never write a checkpoint.

## §P-Access — Load-on-demand access protocol *(v2.0.0+)*

Every session that boots an agent pays a token cost proportional to what it reads. Real-world Lead Protocol usage involves many sessions per day per project. A naive "read everything to be safe" policy multiplies that cost by the size of the historical record and makes the protocol unviable at scale. `§P-Access` specifies what the agent reads up front, what it reads on demand, and how to keep baseline cost bounded.

### Division of authority between CORE and PROTOCOL

For the baseline to stay light without creating a split-brain of governance, the two framework files divide responsibilities by **level of detail**, not by authority:

- **`CORE_RULES.md`** — what the agent **must know to operate correctly at every session start**. Protocol index, essential contracts (three-layer state model, `(actor, agent)` identification, append-at-tail, checkpoints as shared coordination), pointers to the detailed sections in this file. Size budget: **under 5k tokens**. Mandatory in the baseline load.
- **`PROTOCOL_RULES.md`** — detail, schemas, recovery procedures, edge cases, threat model, cross-repo semantics. Consulted **on demand**, when the agent hits a situation whose handling CORE points here for.

**Governance invariant:** `CORE` does not repeat `PROTOCOL` — it references. If the agent finds a conflict between `CORE` and `PROTOCOL`, `PROTOCOL` wins (see `§P2`). The split is editorial, not authoritative.

### Baseline load (every session, budget ~5–8k tokens)

Read order matters: the `(actor, agent)` pair must be resolved *before* the pair-specific handoff path can be formed. That forces `AGENTS_MAP.md` to precede the handoff in the boot sequence.

1. `.agents/CORE_RULES.md` — index plus essential contracts.
2. `.agents/PROJECT_RULES.md` — project identity.
2a. Run the `§P10` setup gate before loading modules, unless its source exemption or session-only deferral/non-interactive path applies.
3. `.agents/modules/<scope>.md` — for each scope listed in `§J8 Active modules` (in declaration order).
4. `.agents/AGENTS_MAP.md` — tool-signature → agent-slug map. Required to resolve `<agent>` before the handoff path can be formed.
5. `.agents/sessions/active_sessions.md` — concurrent-session awareness, needed before any write to the pair's handoff.
6. `.agents/local/<actor>/<agent>/handoff.md` — state of this pair. Only accessible once `<agent>` is resolved.
7. Listing (not reading) of `.agents/checkpoints/` — the agent knows which checkpoints exist and reads individual files on demand when they become relevant.

### Project knowledge discovery

Root `INDEX.md` is a project-owned, pointer-only topic/question → canonical file → section/anchor or record locator map. It complements `PROJECT_RULES.md §J6` (the compact protocol file inventory); it does not duplicate facts, decisions or history and never overrides source authority. Before answering a project question, consult relevant entries on demand, then read canonical sources. Do not load the entire map or all targets at boot.

If INDEX is absent, fall back to §J6 and the independent search recipes below. Legacy projects still boot normally. A missing or stale entry is not proof of absence. Search relevant current, older and archived records before saying a topic was never discussed; a recent tail alone is insufficient. Use literal terms, bounded output pages with continuation, then retrieve the complete relevant entry. Report files/ranges searched and any incomplete, truncated or inaccessible evidence; never turn those limitations into an absolute absence claim.

Optional folder `INDEX.md` files or README navigation sections may be registered in root INDEX. Pointer-only applies to navigation, not substantive README content. Keep actual actor-local/private topic rows out of shared maps; authorized portable external pointers still follow §P6 and §P7. No crawler, completeness guarantee or new lock system is implied.

Update affected root/folder pointers in the same session when relevant files/folders are created, removed, renamed or moved, or referenced section/anchor names change. Coordinate shared edits through the existing substrate; do not reindex unaffected content.

### On-demand load contract (substrate-agnostic)

The protocol prescribes **behavior** ("do not process more than is necessary to answer the current question"), not tooling. The agent picks the cheapest implementation available in its environment. A refined implementation (native offset reads) costs fewer tokens; a minimal implementation (load whole file, filter in-prompt) still satisfies the contract — it pays more, but semantics are identical. Whatever the substrate, the following access pattern applies:

| Artifact | Pattern |
|---|---|
| `JOURNAL.md`, `local/<actor>/<agent>/activity.log` | Read the **last N lines** (files are append-at-tail, recent entries at the end). Implementation: offset-from-end read, `tail -n`, or equivalent. |
| `LESSONS.md` | **Grep on inline tags** (e.g., `grep -A 10 "tags:.*rate-limit" LESSONS.md`). There is no manual top-of-file index. Sequential tail reading only when no specific tag is known. |
| `decisions.jsonl` | Filter by topic / actor / date. Implementation: line-level grep, `jq`, or in-memory filter. |
| `PROTOCOL_RULES.md` | Only when invoked explicitly by reference from `CORE_RULES.md`. Not loaded up front. |
| `.agents/checkpoints/<file>.md` | Read on demand by specific filename (typically listed in `active_sessions.md → Last checkpoint` or recommended by the owner). Never load the whole directory preemptively. |

**Absolute rule:** never load a historical file in full without a specific justification tied to the current question. *"My tooling has no offset read"* is not a justification — it is an implementation limitation to work around via shell (`tail`, `grep`) or in-memory filter. If the agent cannot do better than a full load, it pays the cost explicitly once and does not let that pattern become the default.

### Portable bounded search recipes

These Python 3 examples run unchanged from POSIX or PowerShell Python sessions;
no shell interpolation, regex query syntax, crawler or service is needed. Supply
an explicit relevant file list from §J6 or your source inventory, including older
and archived logs when present. Missing INDEX is not a prerequisite. Search is
case-sensitive and literal; try relevant spelling variants deliberately.

<!-- knowledge-search-python -->
```python
from pathlib import Path
from itertools import islice
import re


def search_page(paths, term, offset=0, limit=20):
    if offset < 0 or not 1 <= limit <= 100 or not term:
        raise ValueError("Use a nonempty literal, nonnegative offset, limit 1..100")

    def matches():
        for name in paths:
            with Path(name).open(encoding="utf-8") as source:
                for number, line in enumerate(source, 1):
                    if term in line:
                        yield {"path": str(name), "line": number,
                               "preview": line[:200], "clipped": len(line) > 200}

    page = list(islice(matches(), offset, offset + limit + 1))
    return {"hits": page[:limit],
            "next": offset + limit if len(page) > limit else None}


def entry_page(path, line, offset=0, limit=2000):
    # JSONL: one physical line is a complete record. Markdown: entries begin
    # with column-zero "## " outside fences; nested headings stay inside.
    if offset < 0 or not 1 <= limit <= 8000:
        raise ValueError("Use a nonnegative offset and limit 1..8000")
    path = Path(path)
    # Match search_page physical lines; Unicode separators are record content.
    with path.open(encoding="utf-8") as source:
        lines = source.readlines()
    if not 1 <= line <= len(lines):
        raise ValueError("Line is outside the source")
    start, end = line - 1, line
    if path.suffix != ".jsonl":
        boundaries = [0]
        fence = None
        for index, text in enumerate(lines):
            if fence is not None:
                marker, length = fence
                if re.fullmatch(r" {0,3}" + re.escape(marker) + "{" + str(length)
                                + r",}[ \t]*", text.rstrip("\r\n")):
                    fence = None
                continue
            opening = re.match(r" {0,3}(`{3,}|~{3,})(.*)$", text.rstrip("\r\n"))
            if opening and not (opening[1][0] == "`" and "`" in opening[2]):
                fence = (opening[1][0], len(opening[1]))
            elif text.startswith("## "):
                boundaries.append(index)
        if fence is not None:
            raise ValueError("Unterminated fence: inspect explicit source ranges; "
                             "entry completeness is unknown")
        start = max(index for index in boundaries if index <= line - 1)
        end = next((index for index in boundaries if index > line - 1), len(lines))
    record = "".join(lines[start:end])
    return {"text": record[offset:offset + limit],
            "next": offset + limit if offset + limit < len(record) else None}
```

For example, after evaluating the block, use
`search_page([".agents/JOURNAL.md", ".agents/decisions.jsonl"], "literal[topic]")`.
Add explicitly selected archive files if they exist; never silently omit an
expected inaccessible source. Pass the returned `next` offset for each following
page until it is `None`. A clipped preview is only a locator, not full evidence.
Use `entry_page(hit["path"], hit["line"])` and its continuation offsets to retrieve
all chunks of the relevant entry before drawing conclusions. Keep the file list
and contents stable while paging; restart if sources change.

The entry example supports JSONL physical-line records and a narrow Markdown log
convention: entry delimiters are exactly column-zero `## ` (two hashes and an
ASCII space); preamble text before the first delimiter is a separate range.
Nested headings remain in the entry. Top-level backtick and tilde fences use at
least three identical markers, with zero to three leading ASCII spaces. A closer
uses the same marker, at least the opener's length, and only spaces/tabs after it;
mismatched, shorter, four-space-indented or text-suffixed runs do not close it.
Backtick opener info text cannot contain a backtick; tilde info text can.
Fenced heading hits resolve to the enclosing entry, including hits after closing.
Any unclosed fence anywhere in the selected file raises `ValueError` before
returning a chunk, even for an earlier entry: completeness is unknown, not proven.

This is not a general Markdown parser: indented/tab-separated/Setext headings,
block-quote/list container fences, and HTML block semantics are unsupported.
Use this recipe only when the source follows the convention above; it does not
validate those unsupported structures. For other formats or an unclosed fence,
inspect surrounding boundaries and retrieve explicit source ranges using your
environment's offset reader, reporting uncertainty about entry completeness. The
example reads the selected file internally to locate boundaries but emits only a
bounded chunk. Filesystem/decoding errors propagate: report that coverage as
inaccessible, not zero matches. Zero matches means only this literal was absent
from the supplied readable files, not that the topic was never discussed.

### File-size targets

- `JOURNAL.md` active file: **< ~500 lines**. Move older entries into `archive/JOURNAL-<year>.md` when exceeded.
- `LESSONS.md` active file: **< ~300 lines**. Move older entries into `archive/LESSONS-<year>.md` when exceeded.
- `activity.log`: no hard limit — the agent reads only the last N lines. Monthly rotation into `activity_YYYY-MM.log` is optional.

### Where to find more

Detailed schemas for the state files listed above live in `.agents/schemas/` (when the project ships that directory). Substrate-specific access additions — e.g., a meta-repo's dual-copy layout or a git-substrate's PR-triggered validation — live in the corresponding module files under `.agents/modules/`.

## §P-Threat — Threat model *(v2.0.0+)*

The protocol is narrow about what it guarantees. Overselling guarantees is how agents and humans misplace trust.

### The protocol guarantees

- **Isolation of session state per `(actor, agent)` pair.** `handoff.md`, `TASK.md`, `activity.log`, and personal `lessons.md` of a pair are never overwritten by another pair — even on the same machine, even for the same human actor.
- **No leak of personal state through a shared git repository** when the template's `.gitignore` (which excludes `.agents/local/`) is respected.
- **Best-effort append-at-tail safety for shared files.** `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, and activity logs are appended only at the end. This minimizes the concurrent-write window and prevents structural corruption (truncated arrays, overwritten headers). Individual lines may be lost if two writes coincide on the exact same instant in a synced folder, but the file remains valid and readable.

### The protocol does NOT guarantee

- **Zero line loss under simultaneous writes on a cloud-sync folder.** OneDrive, Google Drive, and similar substrates can drop one of two lines written in the same instant. Mitigations: unique names for per-file artifacts (checkpoints never collide), social coordination for shared append-only files, and the actor's own `activity.log` as a personal fallback trace.
- **Confidentiality between actors who voluntarily share a folder.** A OneDrive folder shared between Marco and João is technically visible to both; the protocol isolates state at the file level (no overwrite) but not at the content level (no hidden files from a folder sibling). That is IT hygiene, not protocol design.
- **Encryption of state files.**
- **Granular per-file access control.**
- **Read auditing.**
- **Distributed locking or automatic conflict resolution.**

### Deployment recommendations from the threat model

- **One actor, many agents** (primary product use case): any substrate works well — OneDrive, standalone folder, GitHub.
- **Many actors, active simultaneous development**: GitHub is the recommended substrate. OneDrive is feasible with social coordination on append-only files.
- **Strict isolation between actors required** (confidentiality, compliance): use separate Git repositories or enforce access at the IT layer. Lead Protocol does not implement this level of isolation.

## §P4 — Generic quality checklist

Before closing any significant action:

- [ ] Affected `INDEX.md` and folder navigation pointers updated in the same session for file/folder create/remove/rename/move and section/anchor changes

- [ ] Persona/agent signature present in every recorded change and in `handoff.md`
- [ ] `local/<actor>/<agent>/handoff.md` overwritten with current state (Status, Timestamp HH:MM, Last Action, Pending Step, session close checklist)
- [ ] `.agents/decisions.jsonl` appended with rationale and files_affected (if applicable per `§P3` session close ritual)
- [ ] `local/<actor>/<agent>/activity.log` appended with one line per logical action (if applicable per `§P3` session close ritual)
- [ ] If a new **personal** pattern/bug learned → append to `local/<actor>/<agent>/lessons.md`
- [ ] If a new **project-level** pattern/bug learned → append to `.agents/LESSONS.md`
- [ ] JOURNAL promotion question asked; if user says yes → append to `.agents/JOURNAL.md`
- [ ] Commit record follows `[Agent] <type>: <summary>` convention (`§P3`)
- [ ] Version bumps applied to any rules file or module whose content changed
- [ ] Session close checklist in `handoff.md` fully verified (today-date verification per `§P3`)
- [ ] If `.agents/sessions/active_sessions.md` is in use, the row for this session has been removed
- [ ] Any additional checks required by an active module have been satisfied

## §P5 — Operational model (generic)

- Every agent reads, on session start, in order: `CORE_RULES.md` → `PROJECT_RULES.md` → `§P10` setup gate → each active module → `AGENTS_MAP.md` → `sessions/active_sessions.md` → `local/<actor>/<agent>/handoff.md`. See `§P-Access` for the full baseline load.
- The active Session Protocol level (1/2/3), the active substrate, and the list of active modules are declared in `PROJECT_RULES.md §J8`.
- Edits to framework files (`PROTOCOL_RULES.md` kernel, any module file) only happen via methodology upgrade — never ad-hoc.
- Edits to business files (`PROJECT_RULES.md`, project reference docs) happen per project rules in `§J8`.
- `.agents/AGENTS_MAP.md` is maintainer-managed. Agents propose additions; humans commit them. See `§P3` *`AGENTS_MAP.md` governance*.
- Language: operational files (`CORE_RULES`, `PROTOCOL_RULES`, `PROJECT_RULES`, module files, `handoff`, `decisions.jsonl`, `JOURNAL`, `LESSONS`, `activity.log`, `AGENTS_MAP`, `active_sessions`, checkpoints) are always EN-US.
- Additional module-specific boot steps may apply — see each active module's header.

## §P6 — Cross-repository references

When a project references resources in other repositories (personal context, external specs, sibling repos):

1. **Portable identifiers** — Always use `org/repo` (e.g., `acme/private-context`). Never use local machine paths (e.g., `C:\Dados\...` or `/home/user/...`). Local paths break on other machines and are not traceable.
2. **Pointer, not copy** — When information exists in a canonical repo, other locations must contain only pointers (`§J6` with repo reference). Never duplicate full content. If duplicated, reduce the copy to a summary + pointer.
3. **Deduplication** — Before recording information in more than one location (local memory, repo A, repo B), check: does this information already have a canonical home? If yes, pointer. If no, elect a home and point the rest.
4. **Reference format in `§J6`** — For external repos, use format: `Repo 'org/repo' (private|public) — path/to/file.md`. Include visibility flag so agents know if authentication is required.

## §P7 — Private vs shared context separation

**Problem:** Context relevant to an AI agent may be sensitive enough that it must not leak into repos shared more widely. This applies in two analogous tiers:

- **Personal tier:** an individual owner's context (identity, finances, strategic goals, private decisions) that must not leak into repos shared with a team.
- **Organizational tier:** a company's confidential context (financials, strategic plans not yet public, compensation, privileged legal matters) that must not leak into repos shared beyond the director/C-level circle.

**Rule:** isolate sensitive context in a dedicated private repo, and reference it by name from the less-private repos that consume it. The pattern is the same in both tiers — only the audience and the repo name differ.

| Context tier | Canonical private repo | Consumers |
|---|---|---|
| Personal | `owner/private-context` (owner-only) | Owner's personal project repos |
| Organizational | `org/business-vault` (directors/C-level only) | Team-shared company repos |

Both tiers are **optional** — projects without sensitive context at the corresponding tier simply don't have a `private-context` or `business-vault` repo. The rules below apply wherever the pattern is used.

**Rules:**

1. **Private context repo** lives separately from any repo shared with a wider audience. Owner-level private context lives in a personal private repo (e.g., `owner/private-context`); organizational-level confidential context lives in a directors-only repo (e.g., `org/business-vault`).
2. **Consuming repos** (team-shared project repos, documentation repos) reference the private repo only by name in `§J6`, with explicit rule: `"Never copy content from this repo into [consuming repo] or any repo with a wider audience."`
3. **Harness local memory** (e.g., `~/.claude/projects/*/memory/`) may contain a lightweight summary + pointer to the private repo. Never the full content — avoid duplication and drift.
4. **The private repo** must follow the full Lead Protocol (`.agents/`, `PROTOCOL_RULES.md`, `PROJECT_RULES.md`, `handoff.md`, `decisions.jsonl`) like any other project.
5. **Content that belongs in the personal private repo (`private-context`):** owner's identity, personal strategic goals, permanent personal decisions, personal lessons learned, personal digital presence, family/health/financial context.
6. **Content that belongs in the organizational private repo (`business-vault`):** company financials, strategic plans not yet public, personnel and compensation, legal matters under privilege.
7. **Content that belongs in the team-shared repo:** methodology, system architecture, runbooks, product technical decisions, team operational context.
8. **Opt-in activation:** projects without sensitive context at a given tier do not need to create a corresponding private repo. The rule activates only when such context exists and needs a home.

## §P9 — Modules architecture *(v1.9.0+)*

The kernel above is substrate-agnostic and role-agnostic. Substrate-specific and role-specific rules live in opt-in module files under `.agents/modules/`. This section defines the module contract.

### File layout

- `.agents/modules/<scope>.md` — one file per module; `<scope>` is lowercase kebab-case.
- `.agents/modules/README.md` — one-paragraph index listing available modules.
- Each module file carries its own `> Version: X.Y.Z` header and bumps per `§P1` independently of the kernel.

### Anchor convention

Sections inside a module use anchors of the form `§M-<scope>-N`. Examples: `§M-git-1`, `§M-meta-3`. The `§M-` prefix disambiguates module anchors from kernel `§P` anchors and project `§J` anchors.

### Activation

A project declares its active substrate and active modules in `PROJECT_RULES.md §J8`:

```markdown
- **Active substrate:** git+github | git | local | cloud-sync | other
- **Active modules:** <comma-separated scope names, or `none`>
```

A module is in effect if and only if its scope appears in `Active modules`. Activation order determines precedence between modules (earlier entries win conflicts between modules). The kernel always outranks any module.

### Boot

Agents read active modules after `PROJECT_RULES.md` and its `§P10` setup gate, and before `AGENTS_MAP.md` / `sessions/active_sessions.md` / `handoff.md`, in the order listed in `§J8 Active modules`. See `§P-Access` for the full baseline load sequence.

### Authoring rules

- A module cannot contradict the kernel. It can only add substrate-specific or role-specific rules.
- When a module cites a kernel anchor, use the fully qualified form `PROTOCOL_RULES §Px` to mark the module→kernel crossing explicitly.
- A module may depend on another module only if it declares the dependency in its header.
- Module CI/tooling (if any) must include a top-of-file comment identifying the module it enforces, so consumer repos that do not list the module know not to copy the tooling.

## §P10 — First-run setup interview *(v2.2.0+)*

Lead Protocol ships `PROJECT_RULES.md` as a pristine template: `[Project Name]`, bracketed `[e.g., ...]` examples, and an unconfigured `§J8`. Whether a project was scaffolded by copying the release files or by the bundled CLI, the template is identical and must be configured before the protocol can operate correctly, because without a real `§J8 Active modules` the agent cannot even finish its baseline boot (step 3 loads the modules named there). Consumers frequently skip this step and let agents run against the raw template. This section makes configuration a hard, self-clearing boot gate.

### Pristine detection

After reading `PROJECT_RULES.md` (baseline boot step 2), the project is **unconfigured** when ANY of these holds:

- `PROJECT_RULES.md` is absent.
- The `§J1` **Name** value still contains a `[...]` placeholder (for example, `[Project Name]`).
- The `§J8` **Active substrate** or **Active modules** value still contains a `[...]` placeholder.

Detection is purely textual (a `[` inside the field value), as chosen for this instruction-only gate. This section does not add runtime enforcement to the CLI. There is no separate marker file; the filled fields are the marker.

### Framework-source carve-out

If a sentinel file named `.lead-protocol-source` exists at the repository root, the gate is disabled. This marks the Lead Protocol framework's own development and distribution source, where `PROJECT_RULES.md` remains unconfigured by design. The sentinel lives outside `.agents/`. Consumers use CLI init/update or the documented preservation-safe copy flow from sanitized consumer templates. A manual copy includes `.agents/`, `AGENTS.md`, and `CLAUDE.md`, plus the optional `INDEX.md` when supplied by those templates; never copy the sentinel or raw source history. The npm package and CLI init/update template paths exclude the sentinel.

### The gate (interactive environments)

When a project is unconfigured and not carved out, the agent MUST, before performing any other requested work:

1. Pause the user's request and state that the project is not yet configured.
2. Run the setup interview (below).
3. Write the answers into `PROJECT_RULES.md`.
4. Resume the user's original request.

The user may defer for the current session by replying `later` or `skip`. The agent then performs the requested work but operates under an explicit "project unconfigured" caveat, and the gate re-fires at the start of every subsequent session. Deferral is never persisted: there is no "don't ask again". This mirrors the `§P3` AGENTS_MAP fallback, where an unresolved state recurs as a social signal rather than being silently suppressed.

### Non-interactive environments

If the environment is non-interactive (any of `CI`, `GITHUB_ACTIONS`, `CODESPACES`, `DEVCONTAINER` is set, or no interactive input channel exists, the same signals `§P3` uses for `<actor>` ephemeral detection), the agent skips the interview, emits a single warning that `PROJECT_RULES.md` is unconfigured, proceeds with the task, and persists no configured state. The setup gate writes nothing in this path. The next interactive session is gated normally.

### Interview content

The interview gathers the minimum needed for identity and operation. Ask only for missing placeholder values; preserve every existing non-placeholder value unless the user specifically asks to change it. This includes the title, agent table, language rules, modules, and branch convention; derived defaults never override them. Unknown or ambiguous required answers must be clarified with the user rather than guessed. If they cannot be resolved, keep setup incomplete and offer the session-only deferral above. Soft placeholder fields are defaulted with a `refine later` note rather than asked:

| # | Question | Writes to |
|---|---|---|
| 1 | Project name | `§J1` Name and the document title line |
| 2 | Type and one-line purpose | `§J1` Type, Purpose |
| 3 | Primary stack | `§J1` Stack |
| 4 | Substrate (`git+github` / `git` / `local` / `cloud-sync` / `other`) | `§J8` Active substrate; auto-derives `§J8` Active modules (`git` or `git+github` gives `git-substrate`; otherwise `none`) and a default branch convention |
| 5 | Primary language for source and docs | `§J4` (source/docs row). AI operational files stay EN-US regardless, per `§P5` |
| 6 | Which agents operate here | `§J2` table (defaults: the current agent as lead, Humans as reviewer) |

After the interview the agent:

- Fills every bracketed field it has an answer for. Sets only soft placeholder fields (`§J3` tone, `§J5` extra checks, `§J1` Consumers) to sensible defaults annotated `<!-- refine later -->`. It never leaves a `[...]` placeholder in Name or `§J8`.
- Updates the metadata date to today when setup changes are written; existing project values remain protected as above.
- Proposes any new agent-signature rows for `AGENTS_MAP.md` to the user for confirmation, but does NOT write `AGENTS_MAP.md` itself (`§P3`: AGENTS_MAP is maintainer-managed).

### Idempotency

Once Name and `§J8` carry values without the literal `[`, pristine detection returns false. It is checked again each session and re-fires if a critical placeholder is reintroduced. No flag, no marker, nothing to drift.
