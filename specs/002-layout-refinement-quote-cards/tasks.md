# Tasks: Layout Refinement & Quote Management Cards

**Input**: Design documents from `specs/002-layout-refinement-quote-cards/`

**Prerequisites**: `spec.md`, `plan.md`; canonical spec `PRICING_TOOL_ENHANCEMENT_SPEC.md` §§16.5, 16.9

**Scope discipline**: Single file `public/app.html`. No backend/API/schema changes. No new dependencies. Do not repeat completed Slice 1/Slice 2 work; do not remove the retained `.sidebar` container; do not alter table overflow behavior (§16.7: approved for later planning, not implemented in this slice).

**Data safety**: Any behavioral check that saves/deletes quotes uses DISPOSABLE FIXTURES only (isolated server on a bound localhost port + disposable `DATABASE_PATH`, or in-page synthetic fixtures). The localhost:3000 dev server and its dev data are never mutated by tests.

---

## Phase 0: Baseline (read-only)

- [x] **T001** Confirm working-tree and Git state (`git status --short --branch`, `git rev-parse HEAD`; baseline HEAD `35fa356…`, 0/0 vs `origin/main`); record screenshot(s) of current header vs container edge misalignment and current quote list rendering at 1440px and 900px.
- [x] **T002** Mechanical audit of the source points listed in `plan.md` (current-state audit table) still true at implementation start (files may have drifted).

## Phase 1: Header/container alignment (US1, US2) — §16.5

- [x] **T003** In `public/app.html` CSS: replace the `max-width: 1300px` block for `.topbar`, `.project-header`, `.sections-nav` (`65–72`) with the shared content width used by the pricing container (`.app` gutters, `56–62`), so outer left/right edges and available widths align at typical desktop widths while preserving normal page gutters and centering.
- [x] **T004** Distribute the four fields across the aligned full container width with responsive wrapping; DO NOT impose a fixed desktop 2×2; keep `#quoteTitle` full-width behavior and the eyebrow/title/`+ جديد` row. **Review correction (repair round, T021)**: `#quoteTitle` moved out of the `.project-fields` grid (own `.project-title-field` label) so `auto-fit` collapses unused tracks; `minmax(min(200px,100%),1fr)`, `min-width:0`; forced narrow `1fr 1fr` rule removed.
- [x] **T005** Browser check — alignment: at 1440px and 900px, computed left/right x-edges of topbar, project header, and pricing container coincide; no page horizontal overflow introduced.

## Phase 2: Gear inside pricing container; section nav adjacency (US3) — §16.5

- [x] **T006** Move `#fieldSettingsBtn` out of the external `.workspace-tools` row (`2811–2823`; CSS `828–860`) into the top corner of the pricing workspace using the single element strategy from `plan.md` §B (must survive `renderMainPanel` innerHTML replacement at `4907` / `5066–5091` with exactly one button and no duplicate bindings).
- [x] **T007** Remove the intervening gear row so `#sectionsNav` (tabs + `+ قسم جديد`, `4492–4497`) sits directly above the pricing container; adjust corner placement offsets in the existing spacing idiom so nothing is obscured.
- [x] **T008** Browser checks — gear: (a) exactly one `#fieldSettingsBtn` in the DOM after render and after a rerender hop; (b) settings modal opens in populated quote; (c) settings modal opens in empty state (no section); (d) nothing sits between section nav and the container.

## Phase 3: Quote management below final total as cards (US4) — §16.9

- [x] **T009** In static markup: relocate the `إدارة العروض` block (`2929–2939`) out of `.summary-grid` into its own full-width section placed immediately below `summary-card--final`; preserve `#savedListTitle` and `#savedList` IDs.
- [x] **T010** Rework `loadSavedList()` (`8905–8950+`) to render bordered cards keeping the existing `data-id`, name + reference + designer where currently shown, ar-JO date, amount, and `فتح`/`حذف` bindings, role-dependent heading, empty state, and refresh call sites (`7242`, `8805`, `8944`, `10003`) untouched. **Correction**: delete call site now awaits the successful refresh (T023).
- [x] **T011** Implement collapsed/expanded behavior per `plan.md` §C.7: measured cards-per-row → ≤2 complete collapsed rows (no hard-coded count); toggle rendered only when needed; `عرض المزيد`/`عرض أقل` with `aria-expanded`/`aria-controls`; hidden cards not keyboard-focusable (hidden wrapper/inert — no fixed-height clipping); recalculation on responsive column changes; sensible expansion-state retention across refreshes.
- [x] **T012** CSS for the card grid in the existing spacing/variable idiom: consistent responsive widths, content-driven heights, horizontal wrap, no page horizontal scroll; RTL correct.

## Phase 4: Focused browser verification (manual, disposable fixtures)

- [x] **T013** Alignment & layout: SC-1/SC-2 checks at 1440px, 1280px, 900px (RTL): edges coincide, four fields distributed/wrapping; the card area and header add no page horizontal overflow. (Repair round: header containment re-verified at 1440/1280/900/600/500-exact and 320-narrow mechanics; per Review Corrections #7 a pre-existing page-level document overflow at ~320px from unrelated topbar/summary-grid rules is acknowledged and out of scope.)
- [x] **T014** Empty state: new/empty quote → gear opens settings from inside the pricing workspace; empty team/personal list shows preserved empty state.
- [x] **T015** Responsive two-row collapse: with a disposable fixture set of ~6–14 quotes, verify at 3+ widths that collapsed count = actual 2 complete rows, no card is clipped mid-height, toggle appears/omits correctly, `عرض أقل` restores 2 rows, final total stays above list when expanded (SC-4/SC-5/SC-6/SC-8).
- [x] **T016** Keyboard behavior: Tab order never reaches hidden-card controls when collapsed; toggle is keyboard-operable; focus remains visible/sane on toggle (SC-6).
- [x] **T017** Save/open/delete with REAL isolated app server (bound localhost:3199) + disposable `DATABASE_PATH`: register/login → save a disposable quote → appears in `GET /quotes` list (cards) → open loads the correct quote (UI `loadQuote` makes only the quote GET — no list request) → save issues the PUT → delete removes it and the refreshed list is empty. Confirmed disposable DB only; dev DB untouched. (Wording corrected by **T024**.)
- [x] **T018** Regressions: field settings (Slice 2) still functional; section tabs/`+ قسم جديد` intact; financial/action blocks unaffected; other pages (`/`, `/price-list`, `/profile`) visually verified at 1440px and 900px — **6/6 exact PNG matches** against isolated HEAD baseline; table overflow behavior unchanged (§16.7 not implemented). Final browser harness (15/15 passed) and focused delete/autosave regression (28/28 passed) green.

## Phase 5: Mechanical verification & reporting

- [x] **T019** `node --check` on the extracted inline script; `node --test --test-concurrency=1 test/*.test.js` (serialized: disposable `DATABASE_PATH`, `DATABASE_URL` unset) → 141/141 pass, 0 fail, 0 skipped (repair round re-run; the parallel default run shares one disposable DB across worker processes and produced 16 environment failures — not code defects).
- [x] **T020** Confirm no fixture quotes in the dev data; confirm `git diff` contains ONLY `public/app.html` + this feature's docs and only current-slice causes; produce the OpenCode implementation report (no commit/push without explicit approval).

## Phase 6: Repair round (review findings, 2026-10-20)

- [x] **T021** Finding 1 — header field distribution: `#quoteTitle` out of the grid; `minmax(min(200px,100%),1fr)`; `min-width:0` on labels/inputs; forced narrow rule removed. Reproduced first (unused tracks: 458.7px gap at 1440, 243.2px at 1280; min-content overflow mechanism at narrow) and verified after (15/15 checks × 1440/1280/900/600/500-exact; 320-narrow mechanics — the header fields fit; the PAGE-level overflow reported at 320px is pre-existing and unrelated, see spec Review Corrections #7).
- [x] **T022** Finding 2 — stale collapsed capacity: synchronous stale-state clear before measuring inside `refreshQuoteRowUI()`; reapply in same pass. Reproduced first (widen 600→1440: 8 visible instead of 10 at n=14; stale at n=9–12; rows [5,3]); verified after for n=9,10,11,12,14 collapsed + n=14 expanded, one resize refresh per direction, complete rows everywhere.
- [x] **T023** Finding 3 — delete focus: closed `.modal-overlay` visibility-hidden; opener remembered and restored on cancel/backdrop/OK-error; confirmed delete awaits successful refresh then focuses surviving card action → visible toggle → `#savedListTitle` (first/middle/last/only + collapsed handled); failing delete keeps the origin button. Shared-dialog other callers inspected (room/section/template delete) — in that round they only got the generic stranded-focus restore (revised in Phase 7, T027–T029). Reproduced first (focus stuck in closed modal, `visibility:visible` when closed, no cancel restore, no usable error focus); verified after (n=3 and n=9, cancel/generic/error paths).
- [x] **T024** Finding 4 — docs: spec/plan/tasks corrected so opening a saved quote only loads the correct quote (no list refresh, no redundant list request); save/delete must refresh. Task statuses updated for verified work only.
- [x] **T025** Additional approved adjustment — `عرض المزيد`/`عرض أقل` toggle centered below the card grid with ~12px spacing, RTL/LTR (verified: Δcenter ≤ 1px, gap ≈ 12px both directions; behavior/aria unchanged).
- [x] **T026** Verification battery: syntax check, `git diff --check`, serialized regression suite, real isolated server e2e (login → save → list → open → save → delete → list), RTL/LTR screenshot evidence, fixture cleanup.

## Phase 7: Targeted dialog repair round (review findings 2, 2026-10-20)

- [x] **T027** Finding R1 — success focus for shared destructive callers: explicit `getSuccessFocus` providers on the room (surviving `✎`/`✕` of the clamped surviving room row → `#addRoomBtn`), section (`#sectionsNav .add-section-btn`), and template (surviving row's `تحميل`/`حذف` → `#templateModalTitle`) callers; `confirmOk` applies the provider only when the callback resolves without error AND focus is stranded (never overrides a caller-set valid focus target); failing mutations fall back to the remembered opener. Quote-specific success focus preserved.
- [x] **T028** Finding R2 — confirmation dialog semantics: `role="dialog"` + `aria-modal="true"` + labelled (`#confirmTitle`) + described (`#confirmMessage`); opening focuses Cancel; one-time keydown listener: Tab/Shift+Tab cycle the dialog's controls, Escape cancels (backdrop cancel preserved); no per-open listener cleanup needed (bound once, state resets per open).
- [x] **T029** Finding R3 — immediate closed-state accessibility: `inert` + `aria-hidden="true"` set synchronously on every close path (initial state, cancel, backdrop, Escape, OK success/error) with focus moved/restored BEFORE hiding; both removed synchronously before opening/focusing; CSS fade kept separate (visibility timeline unchanged).
- [x] **T030** Finding R4 — docs: correct generic room/section/template restoration claims (spec Review Corrections 2 #5; plan §Review Corrections 2); replace the universal no-page-overflow/320px wording with header/card containment + acknowledged pre-existing document overflow (clientWidth 305 vs scrollWidth 327 at 320px from topbar/summary-grid rules — NOT this slice; §16.7 approved for later planning but not implemented; unrelated layout unchanged).
- [x] **T031** Reproduction + verification battery (real isolated server, disposable SQLite, REAL browser keyboard events via CDP-driven Chrome — click/Tab/Shift+Tab/Enter/Escape, not focus()-only fixtures): before-fix reproduction of all findings (open leaves focus on opener; Tab walks the page; Escape does nothing; no inert/aria-hidden; success leaves focus on hidden `#confirmOk`); after-fix the battery grew with the rounds — **60/60 mid-round-2** (`TAG=v_post4`), then **65/65 at round-2 end** (`TAG=v_post6`) after adding TE (template error path) + K (quote-delete regression) blocks; **94/94 at round-3 end** (`TAG=v_post_R3`) after adding L (async-lifecycle) scenarios. Exact command from the `fix04` temp workspace: `TAG=v_post_R3 node verify.js`; per-run JSON evidence in `fix04/reports/verify-*.json` (harness artifacts live outside the commit scope).
- [x] **T032** Independent re-review of this targeted repair round — **COMPLETE** (Codex review returned APPROVE with no blocking findings). Final typed-key and live room/item reconciliation corrections approved.

---

## Phase 8 — Round 3: awaited-mutation lifecycle (findings from re-review round 2 → T032 predecessor)

Round 2's T032 re-review surfaced new defects against the AWAITED destructive paths: the OK handler held the dialog open/focused/inert-free until the awaited callback resolved (open-state exposure during pending I/O, focus stuck on the hidden-relevant `#confirmOk`); an older (superseded) completion could hide/steal focus from a newer confirmation; a same-operation re-entry could issue duplicate DELETE requests; a failed mutation leaked the completion (cb rethrow) without a failure focus contract; a disconnected opener left focus on BODY.

- [x] **T033** Immediate close before awaited work: OK handler captures cb/focus-resolvers/opener/token, moves focus to a valid external destination, then synchronously closes + semantically hides (`inert`+`aria-hidden`) BEFORE awaiting the destructive callback; AX-tree excludes the dialog while the request is pending (R1a–f).
- [x] **T034** Invocation tokens + stable operation identities: monotonic `confirmInvocationId`; a superseded (older) completion acts on nothing (never closes/hides/resets/focuses a newer confirmation); `runDestructiveOp(map-key, fn)` guards room (`destructiveOpKey("room", entity)`), section (`destructiveOpKey("section", entity)`), template (`template:<id>`), quote (`quote:<id>`) so a re-entry cannot re-issue the deletion (exactly one request); guards release on success AND failure. Persisted entities use positive server IDs with explicit namespace; unsaved entities use object identity (including temporary negative room IDs). Implementation corrected and focused implementation verification performed (28/28 passed); independent re-review complete (T032).
- [x] **T035** Focus contract formalized: `getSuccessFocus`/`getFailureFocus` providers on `openConfirm`; `focusConfirmDestination` validates (connected, focusable, outside confirm modal) and verifies focus actually moved; `focusConfirmFallbackChain` (explicit providers → opener → `#savedListTitle`, never BODY, never inside the dialog); quote-delete success/failure destination refactored into `quoteDeleteFocusTarget(...)` returning an element for the providers. Verified via focused checks.
- [x] **T036** Docs: §16.7 relabeled everywhere ("APPROVED for later planning; outside this slice; NOT implemented"); persisted/unsaved operation identities aligned with the typed-ID implementation; T029/T031 and Phase 8 wording updated. Implementation documentation check complete; independent review remains T032.
- [x] **T037** Reproduction + focused verification for the guard defects (promise sharing, typed persisted IDs, unsaved object identity, and live room/item reconciliation): isolated server + disposable SQLite + trusted keyboard events. **28/28 checks passed** (A: namespace separation, B: key stability/reload/unsaved identity, C: delayed room DELETE + reload + re-entry, D: quote-switching edit preservation). Independent reproduction/review complete (T032).

---

## Dependencies & Execution Order

T001–T002 → T003–T005 (alignment) → T006–T008 (gear) → T009–T012 (cards) → T013–T018 (browser verification) → T019–T020 (mechanical + report) → T021–T026 (repair round after independent review) → T027–T031 (targeted dialog repair round 2) → T032 (independent re-review, **APPROVE**) → T033–T037 (round 3: awaited-mutation lifecycle, from the same review chat).

Alignment must precede gear placement (edge geometry depends on Phase 1); gear removal precedes card work (dividing DOM moves); all browser checks run on the resulting integrated state.

## Notes

- All edits sequential in `public/app.html`; keep the smallest safe patch per Constitution §IV.
- Deferred and out of scope everywhere: §16.2 unified settings, §16.3 equal heights/centering, §16.4 print geometry, §16.6 code typography, §16.7 screen-fit policy (approved for later planning; NOT implemented in this slice — current overflow behavior preserved).
- No commit, push, deployment, or local-main repair without explicit user approval; localhost:3000 preserved.

(End of tasks)
