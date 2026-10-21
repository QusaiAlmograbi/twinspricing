# Focused Validation Guide: Quote Summary Layout

This guide validates the acceptance contract in [spec.md](spec.md). It is for the later OpenCode implementation phase; no runtime verification was performed during planning.

## Safety Prerequisites

- Confirm the implementation starts from the advisor-approved commit and record `git status --short --branch` plus `git rev-parse HEAD`.
- Use a non-persisting synthetic browser fixture or static harness; this layout verification does not require application data.
- Do not use or mutate localhost:3000 or its existing data.
- Preserve the pre-existing untracked `specs/001-prevent-duplicate-mutations/` directory and unrelated worktrees.

## Synthetic Fixture

Populate the existing summary nodes in-memory with representative section rows, financial rows, two cost/profit outputs, three payment terms, duration/validity, long exclusions, autosave status text, a large final total, and synthetic quote-card elements. Do not save, delete, open, or otherwise persist a quote. Source comparison, not live persistence testing, protects formulas and handlers.

## Layout Matrix

| Direction | Width | Required result |
|---|---:|---|
| RTL | 1672px | Proportions, card shells, gutters, heading hierarchy, current-control grouping, gold emphasis, and final bar align with the approved reference. |
| RTL | 1440px, 1280px | Exact 3/2/2 rows and approved physical sides; full-width final total; cards below. |
| RTL | 861px / 860px | Desktop-to-stacked boundary changes without overlap or lost controls. |
| RTL | 600px, 320px | Single-column logical flow; summary and children do not exceed their container. |
| LTR | 1440px | Logical inline flow mirrors and remains usable. |
| LTR | 600px | Single-column flow and controls remain usable. |

For geometry, compare `getBoundingClientRect()` row tops and inline positions. For narrow containment, compare each summary group and the summary container's `scrollWidth`/`clientWidth`; do not attribute unrelated pre-existing document overflow to this slice.

## Visual, Containment, and Keyboard Checks

1. Traverse forward and backward using real Tab/Shift+Tab events; confirm the order documented in `plan.md` and visible focus.
2. Compare full card borders/radii/surfaces/shadows, row gutters, stronger headings, compact current rows, cost/profit tiles, paired duration controls, action hierarchy, and the full gold final bar with the reference.
3. Confirm any added icons are attached only to existing labelled elements, use dependency-free inline SVG, and are `aria-hidden`, non-focusable, and non-interactive.
4. Inject long mixed-direction section names, payment descriptions, an over-100% warning, exclusions, autosave error text, large totals, and both saved-list headings; verify natural growth and no clipping.
5. Inject enough synthetic quote cards to inspect collapsed/expanded placement. Hidden controls must be unreachable; the toggle remains centered about 12px below cards. Do not retest saved-quote persistence or deletion.
6. Diff-gate calculations, handlers, autosave, confirmation code, and print/PDF paths. Do not invoke save/delete or unrelated dialog lifecycle scenarios.

## Print Isolation

Confirm print media hides the screen application, including the reorganized summary, and shows the existing `#print-template`. Confirm the implementation diff does not touch `renderPrintTemplate`, `#print-template` markup/styles, `@media print`, or `routes/pdf.js`. PDF generation and application-data setup are unnecessary for this presentation-only check.

## Mechanical Commands

Run from the repository root after implementation:

```sh
git diff --check
git diff -- public/app.html
```

Extract the inline JavaScript to a temporary file outside the repository and run `node --check` on it. Confirm each mapped control ID occurs once at runtime. The broad `node --test test/*.test.js` suite is conditional: run it only if JavaScript/backend behavior changes or focused evidence indicates broader risk, and report the actual pass/fail/skipped counts.
