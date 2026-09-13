---
name: twins-build
description: Use when implementing an already-approved engineering slice in the TWiNS Interior Pricing App. Loaded for approved implementation work — smallest safe change, verification, and reporting. Not for analysis/audits, which belong to Codex.
---

# Purpose

Use this skill for approved implementation only.

The analysis/business decision should already exist.

OpenCode's job is to implement the smallest safe change and verify it.

# Before Editing

Always inspect:
- current source
- relevant nearby code
- existing helpers
- existing tests
- git status

Confirm the approved premise still matches current code.

If the premise is wrong:
STOP instead of implementing.

# Implementation Priority

Prefer:

existing architecture
→ existing helper
→ minimal extension

over:

new abstraction
→ refactor
→ redesign

Do not perform opportunistic cleanup.

# Critical Architecture Rules

Preserve:
- PostgreSQL / SQLite parity
- existing API contracts
- existing authorization rules
- existing frontend state semantics
- existing autosave semantics
- existing database model

unless explicitly changed by the approved task.

# Regression Tests

For a real bug fix:
add focused regression coverage where practical.

A test should prove the real failure mode, not only a helper boolean if that cannot prove the user-visible/data-integrity behavior.

# Verification

After implementation:

1. Syntax-check modified JS.
2. Run focused relevant tests.
3. Run:

node --test test/*.test.js

4. Run:

git diff --check
git status --short

5. Inspect relevant diffs and untracked files directly.

# Git

Never commit.
Never push.

Wait for explicit approval.

# Final Report

Every report must begin:

Performed by: OpenCode
Mode: Build — Implementation

Use sections:

A. Implementation
B. Files Changed
C. Tests / Verification
D. Diff Scope
E. Runtime Limitations
F. Final Verdict

Final verdict must be one of:

- COMPLETE
- COMPLETE WITH DOCUMENTED LIMITATION
- STILL NEEDS WORK

End by explicitly stating:

Commit: NOT PERFORMED
Push: NOT PERFORMED