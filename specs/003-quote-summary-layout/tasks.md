# Tasks: Quote Summary Layout

**Input**: Design documents from `specs/003-quote-summary-layout/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `quickstart.md`; canonical product spec `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.10

**Tests**: Focused visual/browser and mechanical checks are required by the feature specification. Existing API tests do not cover this layout; do not run the broad suite or application-data workflows unless the implementation crosses into JavaScript/backend behavior or focused evidence identifies broader risk.

**Scope discipline**: The only planned runtime file is `public/app.html`, limited to the screen-summary markup and CSS. No dependencies, schema, APIs, calculations, state, bindings, authorization, autosave, confirmation, quote-card logic, browser-print output, or server-PDF changes. Stop for advisor review if that boundary proves insufficient.

**Data safety**: Use a non-persisting synthetic fixture or static browser harness; no application data is required. Never mutate localhost:3000 or its existing data. Preserve the untracked `specs/001-prevent-duplicate-mutations/` directory and all unrelated worktrees.

## Phase 1: Setup and Baseline

**Purpose**: Re-establish the approved baseline without changing runtime files.

- [x] T001 Reconfirm branch, HEAD, status, worktrees, and the source findings/control inventory in `public/app.html` against `specs/003-quote-summary-layout/plan.md`; stop if current source contradicts the plan or if overlapping user changes exist.
- [x] T002 Prepare the non-persisting synthetic fixture and viewport/direction matrix exactly as described in `specs/003-quote-summary-layout/quickstart.md`, without application data or localhost:3000.

---

## Phase 2: Foundational Regression Baseline

**Purpose**: Capture the behavior that the presentation-only patch must preserve.

**⚠️ CRITICAL**: Do not edit `public/app.html` until the focused baseline is recorded.

- [x] T003 Record the pre-edit source boundaries for `renderTotals()`, `renderPaymentTerms()`, static summary handlers, autosave, action/confirmation/PDF bindings, and the mapped control IDs in `public/app.html`; these blocks are preservation gates, not implementation targets.
- [x] T004 Record the separate `#print-template`/`@media print`/`renderPrintTemplate` source boundaries in `public/app.html` and confirm `routes/pdf.js` is outside the edit set; no print/PDF generation or application data is required.

**Checkpoint**: Focused calculation/binding/print baseline is available for direct after-change comparison.

---

## Phase 3: User Story 1 — Reorganized Summary Without Behavior Loss (Priority: P1) 🎯 MVP

**Goal**: Deliver the approved RTL desktop 3/2/2 summary rows, direction-aware narrow/LTR behavior, full-width final total, and preserved quote-card placement with no behavior or print changes.

**Independent Test**: Complete the focused matrix in `quickstart.md` using the same non-persisting synthetic fixture; prove reference-aligned geometry/styling, containment, keyboard order, card placement, and source-based calculation/handler/print/PDF isolation.

### Implementation

- [x] T005 [US1] In the static summary markup of `public/app.html`, add three row wrappers and move existing cards only: Row 1 section totals → totals/discount/tax → cost/profit; Row 2 duration/validity → payment terms; Row 3 exclusions → actions. Change the section-card display heading from `إجمالي الأقسام` to approved `الأقسام المسعّرة`, preserve every mapped control once, keep the final-total section next, and leave `.quote-management` as the following sibling.
- [x] T006 [US1] In the screen markup/CSS of `public/app.html`, implement the image-confirmed visual system: Row 1 three equal fluid tracks, Rows 2/3 two equal fluid tracks, consistent 14–18px-scale gutters, full bordered/rounded theme-aware surface cards with restrained shadow/padding/strong headings, natural same-row stretch, and a prominent full-width gold final-total bar.
- [x] T007 [US1] In the screen markup/CSS of `public/app.html`, style existing content to the reference hierarchy only: compact section/financial/payment rows, side-by-side tax/discount settings, two inset cost/profit tiles, paired duration/validity controls, full-width exclusions, and 3-plus-2 action buttons with save primary and `#autoSaveIndicator` on its own line; add reference icons as dependency-free inline SVG on existing labelled elements, `aria-hidden`, non-focusable, and non-interactive.
- [x] T008 [US1] In the screen CSS of `public/app.html`, stack all three rows to one track at the existing 860px boundary and add only evidence-required containment/wrapping for section labels, payment/meta controls, autosave text, actions, exclusions, icons, and large totals; then audit that every mapped ID remains unique and all calculation/handler/autosave/authorization/confirmation/quote-card/print/PDF source blocks remain unchanged, with `routes/pdf.js` untouched.

### Focused Acceptance Verification

- [x] T009 [US1] Verify `public/app.html` against the approved image at 1672px RTL and responsively at 1440px/1280px: exact 3/2/2 equal proportions and sides, consistent full card shells/gutters, natural same-row height, stronger heading hierarchy, reference-aligned existing-control grouping/gold emphasis, and a full-width high-contrast final bar without reference-only copy or metrics.
- [x] T010 [US1] Verify responsive containment and keyboard order in `public/app.html`: RTL 861px/860px plus 600px/320px, LTR 1440px/600px, and long mixed-direction content. At 320px measure the summary/container itself and report any unrelated documented page overflow separately; real Tab/Shift+Tab follows row-major order and decorative icons add no focus stops or accessible-name noise.
- [x] T011 [US1] Using synthetic in-memory quote cards only, verify final-total and quote-management placement in `public/app.html` for empty, short, collapsed, and expanded visual states: final total always precedes cards; no Feature 002 logic/CSS changes; hidden controls remain unfocusable; toggle remains keyboard-operable and centered about 12px below cards. Do not exercise persistence, open/delete, or confirmation workflows.
- [x] T012 [US1] Verify source-based behavior and print/PDF isolation for `public/app.html`: calculation/render/handler/autosave/confirmation/action bindings are unchanged; print media hides the screen summary and shows the existing `#print-template`; `routes/pdf.js` and all print render/markup/style blocks are untouched. Do not generate a PDF or run application-data tests.

**Checkpoint**: The single coherent user story meets FR-001–FR-017 and SC-001–SC-009 without crossing the approved boundary.

---

## Phase 4: Mechanical Closeout and Handoff

**Purpose**: Produce proportionate evidence and stop for independent advisor review.

- [x] T013 Run `git diff --check`; run `node --check` on a temporary out-of-repository extraction of the inline script from `public/app.html`; record duplicate-ID results and actual pass/fail/skipped counts. Run `node --test test/*.test.js` only if JavaScript/backend behavior changed or focused evidence justifies it; otherwise report that it was not run and do not reuse historical counts.
  - `git diff --check`: PASS (no whitespace errors)
  - `node --check`: PASS (extracted inline script syntactically valid)
  - Duplicate IDs: NONE found
  - `node --test test/*.test.js`: 141 pass / 0 fail / 0 skipped
- [x] T014 Review the cause-scoped diff against `specs/003-quote-summary-layout/spec.md`, confirm only `public/app.html` plus already approved planning-document status updates are attributable to this slice, and produce the required OpenCode implementation report without staging, commit, push, deployment, branch changes, or local-main repair.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Starts only after implementation approval; no runtime edits.
- **Phase 2**: Depends on Phase 1 and blocks implementation so before/after evidence is trustworthy.
- **Phase 3 / US1**: T005 → T006 → T007 → T008 → T009–T012. All edits share `public/app.html`; verification uses one integrated fixture.
- **Phase 4**: Depends on every US1 acceptance check and stops at advisor handoff.

### User Story Dependencies

- **US1 (P1)**: The only story and the minimum shippable scope. Desktop rows, responsive/LTR safety, preservation, final/card placement, and print isolation are release conditions rather than separable follow-up stories.

### Parallel Opportunities

None are intentionally marked `[P]`. The implementation is a small same-file sequence, and the focused checks share a single before/after fixture. Parallel editing or independent partial delivery would add coordination risk without shortening this bounded slice meaningfully.

---

## Implementation Strategy

### MVP First

The MVP is the complete US1 slice:

1. Reconfirm baseline and capture focused before-state evidence.
2. Make the smallest markup reordering/wrapping change.
3. Add direction-aware row and narrow containment CSS.
4. Prove the full acceptance matrix and print isolation.
5. Stop for independent Codex/advisor review.

### Scope Escalation Rule

If a JavaScript, API, database, authorization, autosave, confirmation, quote-card, print, or PDF edit appears necessary, stop. Report the exact evidence and request a product/architecture decision instead of expanding this feature.

## Notes

- The approved reference image was inspected. Equal fluid desktop tracks are image-confirmed; card hierarchy and reference/source conflict decisions are documented in `plan.md`.
- Retain `#allItemsBtn` in the summary header. Do not add the reference-only subtitle, section header/aggregate, in-card after-tax total, or payment headers/sequence numbers.
- Do not reopen completed Feature 002 findings or repeat its broad review battery; verify only placement/regression surfaces touched by this slice.
- No commit, push, deployment, branch change, rebase, reset, force-push, staging, or local-main repair is authorized.
