# TWiNS Interior Pricing App

## Stack
- Node.js 20
- Express 4.x
- Vanilla HTML/CSS/JavaScript frontend
- Main frontend file: public/app.html
- PostgreSQL is production database
- SQLite is local/test database
- Shared DB abstraction is in db.js

## Engineering Method

Use incremental development:

problem
→ inspect actual source
→ understand current architecture/data flow
→ implement smallest approved slice
→ verify
→ stop

Do not perform speculative refactors.

Inspect current source before trusting previous reports.

If the requested fix premise is disproven by current code:
STOP and report the evidence instead of implementing a redundant change.

## Responsibility Split

Codex is primarily used for:
- deep engineering analysis
- audits
- data/state-flow tracing
- independent post-implementation reviews

OpenCode is primarily used for:
- approved implementation
- focused fixes/features
- implementation verification

Do not redo a Codex analysis unless current implementation evidence contradicts it.

## Evidence Rules

Every technical claim must distinguish between:

- runtime-proven
- source-proven
- not runtime-verified

Never fabricate:
- PostgreSQL/Neon runtime behavior
- browser behavior
- test results
- production behavior
- EXPLAIN/query plans

If runtime verification is unavailable, say so explicitly.

## Scope Discipline

Implement ONLY the approved scope.

Do not silently:
- add dependencies
- change schema
- add indexes
- refactor unrelated architecture
- alter auth/authorization
- change API contracts
- redesign UI
- change autosave behavior

unless explicitly part of the approved task.

If implementation requires materially broader architecture changes:
STOP and report why.

## Working Tree Safety

The repository can contain uncommitted changes from previous approved work.

Never:
- reset unrelated work
- revert unrelated work
- assume the complete git diff belongs to the current task

Attribute only changes actually caused by the current slice.

## Git Rules

NEVER commit unless explicitly approved by the user.

NEVER push unless explicitly approved by the user.

Do not create commits merely because implementation is complete.

## Testing

Canonical scoped suite:

node --test test/*.test.js

Report actual:
- pass
- fail
- skipped

Do not use historical numbers as current evidence.

Run node --check on modified JavaScript files where appropriate.

Focused tests may be run before the full scoped suite.

If a test cannot safely run, explicitly report the limitation.

## PostgreSQL / SQLite

Preserve SQLite/PostgreSQL behavior parity.

Do not claim PostgreSQL runtime verification if no PostgreSQL runtime is available.

## FIX / Hardening Discipline

Do not create a new FIX number just to continue a sequence.

A new engineering fix requires concrete evidence of a real defect or justified improvement.

Closed findings must not be reopened without new evidence.

Do not confuse theoretical possibilities with actionable defects.

## Report Identity

Every OpenCode implementation report MUST begin with:

Performed by: OpenCode
Mode: Build — Implementation

Every final report should include:

- Scope
- Files changed
- Exact implementation
- Tests actually run
- Exact test counts
- Runtime limitations
- Diff scope
- Commit status
- Push status

Never say COMPLETE when a known blocking defect remains.