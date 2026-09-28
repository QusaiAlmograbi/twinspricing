# TWiNS Legacy Maintenance Constitution

## Core Principles

### I. Stable Maintenance First

This repository is a completed and deployed legacy TWiNS application.

Changes must be narrowly scoped, backward compatible, easy to review, easy to revert, and limited to the approved maintenance objective.

Do not perform unrelated refactors, architectural rewrites, framework migrations, or cleanup inside a maintenance patch.

### II. Repository Is the Source of Truth

Agent reports, prior chats, specs, and assumptions are secondary.

Before any change:
- inspect the actual repository state,
- inspect Git status and diff,
- inspect the relevant source code,
- re-establish the current baseline.

If documentation conflicts with the repository, the repository wins.

### III. Analysis and Implementation Are Separate

Codex is used primarily for:
- read-only investigation,
- planning,
- security/reliability review,
- independent final review.

OpenCode is used for:
- implementation,
- tests,
- focused corrections,
- controlled staging,
- commits only after explicit approval.

Do not allow multiple modifying agents to write to the same working tree concurrently.

### IV. Smallest Safe Patch

Prefer the smallest change that solves the proven problem.

A maintenance patch should:
- change only required files,
- preserve existing API and UI behavior unless explicitly required,
- avoid new dependencies unless justified,
- avoid schema changes unless unavoidable.

### V. Mutation Safety

User-triggered mutation actions must be protected against accidental duplicate execution when repeated input could create, clone, update, revoke, or delete data more than once.

Where justified, use:
- immediate disabled/loading UI state,
- handler-level in-flight protection,
- action/resource-scoped locking instead of unnecessary global locking.

A visually disabled button alone is not sufficient when the underlying handler can still execute more than once.

### VI. Regression Proof

Every bug fix should include practical regression proof for the actual failure mode.

For mutation safety:
- prove rapid repeated activation does not create duplicate unintended records or requests,
- prove destructive actions cannot execute twice,
- prove failed actions allow retry where appropriate,
- prove unrelated controls remain usable.

Do not treat a green test as proof for behavior it did not exercise.

### VII. Preserve Stable Behavior

Do not silently change:
- authorization,
- role semantics,
- database schema,
- API response shapes,
- pricing behavior,
- deployment configuration,
- unrelated UI behavior.

Unrelated findings must be documented as deferred.

## Development Workflow

For each maintenance change:

1. Read-only investigation and inventory.
2. Agree on exact scope and behavior.
3. Create or update the feature specification.
4. Implement with OpenCode.
5. Run focused and related regression verification.
6. Perform independent Codex review.
7. Fix blockers only.
8. Re-review when required.
9. Create one coherent commit after approval.
10. Do not push or tag without explicit approval.

## Git Safety

- Inspect the working tree before work.
- Do not overwrite or discard unknown changes.
- Do not use `git add .` or `git add -A` for controlled commits.
- Stage approved files explicitly.
- One commit should represent one coherent maintenance reason.
- No stage, commit, push, or tag unless the current task explicitly allows it.

## Governance

This constitution governs Spec Kit work in this legacy repository.

If a feature specification, task plan, or agent instruction conflicts with these principles, stop and resolve the conflict before implementation.

The goal is not to modernize this legacy repository.

The goal is to keep the deployed application stable while applying small, evidence-based maintenance improvements.

**Version**: 1.0.0
