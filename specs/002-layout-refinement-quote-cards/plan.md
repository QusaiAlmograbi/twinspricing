# Implementation Plan: Layout Refinement & Quote Management Cards

**Branch**: `002-layout-refinement-quote-cards` | **Date**: 2026-10-20 | **Spec**: `specs/002-layout-refinement-quote-cards/spec.md`

**Input**: Spec for this feature; canonical product spec `PRICING_TOOL_ENHANCEMENT_SPEC.md` §§16.5, 16.9; constitution `.specify/memory/constitution.md`; runtime source inspected at HEAD `35fa356` (source-proven line references below).

## Summary

Apply two approved refinements on top of the already-integrated Slice 1/Slice 2 layout, without repeating them:

1. **§16.5** — align the outer edges/available widths of topbar, project header, and pricing container; distribute the four header fields across the full header width (responsive wrap, no imposed 2×2); move the settings gear inside the pricing container's top corner and remove the intervening standalone gear toolbar; keep section tabs + `+ قسم جديد` directly above the container; preserve empty-state settings access with no duplicate IDs on rerender.
2. **§16.9** — move `إدارة العروض` below the final total, outside the financial-summary grid; render saved quotes as responsive bordered cards (existing data/actions/order), collapsed to at most two complete rows with `عرض المزيد`/`عرض أقل`, keyboard-safe hidden cards, refresh behavior preserved.

## Technical Context

**Language/Version**: JavaScript ES2020 inline in `public/app.html` (single-file SPA), CSS in the same file
**Primary Dependencies**: None (vanilla JS/CSS; no new dependencies)
**Storage**: N/A — no server-side changes; saved-quote handling flows unchanged
**Testing**: Focused browser checks on the local dev server (disposable fixtures only) + `node --test test/*.test.js` regression gate + `node --check` on extracted inline script
**Target Platform**: Desktop browsers, RTL Arabic, local dev server on localhost:3000 (preserved)
**Project Type**: Legacy single-file SPA; smallest safe maintenance patch (Constitution §IV)

## Constitution Check (`.specify/memory/constitution.md`)

- **I. Stable Maintenance First** ✅ narrow scope; two approved decisions only (§16.5, §16.9).
- **II. Repository Is the Source of Truth** ✅ plan cites source-proven line numbers from current HEAD, not prior reports.
- **III. Analysis/Implementation separate** ✅ this plan is the agreed scope; OpenCode implements after approval.
- **IV. Smallest Safe Patch** ✅ CSS/markup-only moves; renderer changes limited to quote-card markup in `loadSavedList()` and the gear placement strategy; no unrelated refactor.
- **V. Mutation Safety** ✅ no mutation flow changes; existing in-flight protections untouched; open/delete bindings preserved verbatim.
- **VI. Regression Proof** ✅ browser checks for refresh after save/open/delete with disposable fixtures; card-collapsed/expanded keyboard checks.
- **VII. Preserve Stable Behavior** ✅ authorization (role-dependent heading/list scope), ordering, persistence, table overflow (§16.7: approved for later planning, not implemented) untouched.

## Current-State Audit (source-proven, HEAD `35fa356`

| Item | Current implementation | Target (approved) | Gap |
|---|---|---|---|
| Topbar / project header / sections-nav width | `max-width: 1300px` cap (`public/app.html:65–72`) | Aligned edges with pricing container | `.layout` content spans full `.app` width minus 16px padding (`56–62`) → header/nav edges do not meet container edges |
| Project fields | `.project-fields` grid `repeat(auto-fit, minmax(200px,1fr))` (`194–197`), `#quoteTitle` spans full row (`2789–2800`) | Distribute 4 fields across full aligned width; wrap responsively; no imposed 2×2 | Four fields already auto-wrap; alignment bound available width is the actual change (US1) — **review correction**: `#quoteTitle` must sit OUTSIDE this grid or its full-row span keeps unused `auto-fit` tracks alive (fields stuck at 4-of-6 tracks); corrected during the repair round |
| Settings gear | `#fieldSettingsBtn` in `.workspace-tools` row above `#mainPanel` (`2811–2823`; CSS `828–860`), an intervening external row | Gear inside top corner of the pricing container; no intervening toolbar | Move gear; remove `.workspace-tools` as an intervening row |
| Empty-state settings access | `workspace-tools` row is static in markup, so currently always present | Empty-state access inside the pricing workspace | Must survive `renderMainPanel` innerHTML replacement (`4907`, `5066–5091`) without duplicate IDs — see strategy below |
| `+ قسم جديد` | Rendered by JS inside `#sectionsNav` (`4492–4497`) | Directly above container (same) | Satisfied once the intervening row is gone |
| Quote management | `.summary-card` (heading `إدارة العروض`) INSIDE `.summary-grid`, before `summary-card--final` (`2929–2939`) | Own full-width section BELOW final total, outside the grid | Move section; redesign list rows → cards |
| Saved list rendering | `loadSavedList()` full-width rows `.saved-item` with `data-id`, name/ref/designer, ar-JO date, amount, `فتح`/`حذف` (`8905–8950+`); role heading `#savedListTitle` (`8910–8912`); empty `.empty-note` (`8915`) | Bordered responsive cards, ≤2 complete rows collapsed… | Rework markup/CSS + collapsed/expanded logic; keep IDs/bindings |
| Refresh | `loadSavedList()` at template-load `7242`, post-save `8805`, post-delete `8944`, init `10003` | Preserve | No change to call sites; logic must tolerate card DOM — **review correction**: `open` (فتح → `loadQuote`) loads the correct quote into the editor and intentionally does NOT refresh the list; only save/delete/template-load/init refresh |

## Implementation Strategy (smallest safe patch)

### A. Alignment (US1/US2)
1. Compute the common content width once: the pricing container's effective content width (`.app` padding gutters) and apply the SAME outer edges to `.topbar`, `.project-header`, `.sections-nav` (replace/adapt the `1300px` cap block at `65–72`). Keep normal page gutters; keep `margin: 0 auto` centering behavior on equal effective widths so edges coincide.
2. `.project-fields` remains `auto-fit`-based so the four fields distribute across the now-full aligned width and wrap responsively (no new fixed 2×2). **Review correction (repair round)**: keep `#quoteTitle` OUT of this grid container (own full-width label `.project-title-field` below it) so `auto-fit` collapses unused tracks and the four fields fill the desktop row; use `minmax(min(200px,100%),1fr)` and `min-width:0` to survive narrow widths; remove the forced `1fr 1fr` narrow media rule. Verify nothing regresses for `#quoteTitle` full-width behavior.

### B. Gear & adjacency (US3)
3. Restrain to ONE permanent strategy that survives `renderMainPanel` innerHTML replacement: keep `#fieldSettingsBtn` OUTSIDE `#mainPanel`, but remove it from the external `.workspace-tools` row and position it INSIDE the top corner of the pricing workspace using a static `position: relative` wrapper spanning the container with the button absolutely positioned in the corner, OR re-parent it into the panel content on each render — choose at implementation time and keep exactly one element + one binding. Empty state: because the empty-state panel also renders inside `#mainPanel` (`4907`), the corner placement covers the empty state too; if the placement still needs a distinct empty-state position, mount the same single button element at the empty-state anchor — never duplicate the ID.
4. Delete the `.workspace-tools` separation (button markup moves; `2811–2823`), restoring direct adjacency of `#sectionsNav` → pricing container. Keep `+ قسم جديد` logic untouched (`4492–4497`). Ensure the corner gear does not obscure section header content (padding/offset adjustments in the existing spacing idiom).

### C. Quote management cards (US4)
5. In the static markup, relocate the `إدارة العروض` block (`2929–2939`) out of `.summary-grid`, below `summary-card--final`, as its own full-width section. Preserve `#savedListTitle` + `#savedList` IDs so the render/refresh logic continuity is straightforward.
6. Rework `loadSavedList()` to emit bordered cards (`.quote-card`) instead of `.saved-item` rows, keeping: `data-id`, name + reference + designer where currently shown, Arabic date, amount, `فتح` / `حذف` buttons, same handlers/toasts/confirmation, role-dependent heading, empty state. Do not alter ordering, authorization, or persistence.
7. Add collapsed/expanded rendering:
   - Compute cards-per-row from the actual laid-out geometry (not hard-coded count) after render; collapsed cap = 2 complete rows using that computed count; recalc on responsive changes (e.g., `ResizeObserver` on the grid or `resize` listener re-running a `refreshQuoteRows()` helper).
   - Hidden overflow cards: rendered into the DOM but not keyboard-focusable (e.g., wrapper with `hidden`/`display:none`, which removes from tab order; or `inert` on the hidden wrapper) — never rely on fixed-height clipping.
   - Toggle button rendered ONLY when cards exceed the collapsed capacity; `aria-expanded` + `aria-controls` on the toggle; `عرض المزيد` ⇄ `عرض أقل`; focus placement sane on toggle; expansion state retained across `loadSavedList()` refreshes within sensible session handling (e.g., module-level flag reset when a different list length makes it invalid).
8. CSS: card grid (responsive `repeat(auto-fill, minmax(...))` in the existing spacing/variable idiom), bordered cards with content-driven heights, no page horizontal scroll; print template untouched (§16.4 deferred).

### D. Verification hooks
- All new DOM is RTL-safe; "no page horizontal overflow" in this slice means the card area and header distribution add none (table behavior per §10.3 preserved; pre-existing very-narrow page overflow acknowledged in `spec.md` Review Corrections #7 and out of scope).
- No changes to `server.js`, `db.js`, APIs, or tests.

## Review Corrections (2026-10-20 repair round)

Approved findings corrections folded into the implementation (details in `spec.md` § Review Corrections and `tasks.md` Phase 6):

- `refreshQuoteRowUI()` clears stale `display:none` card state synchronously before measuring (stale capacity bug at width changes), then reapplies in the same pass.
- Shared confirmation dialog: closed overlays get removed from keyboard/a11y visibility; opener focus is remembered and restored on cancel/backdrop/error; confirmed quote delete awaits the successful list refresh and focuses a surviving card action / visible toggle / heading.
- The `عرض المزيد`/`عرض أقل` toggle is centered below the card grid with ~12px spacing (`display:block; margin:12px auto 0` + `[hidden]{display:none}` companion).

## Review Corrections 2 (2026-10-20 targeted dialog repair round)

Folded under plan §D after the targeted independent re-review (details in `spec.md` § Review Corrections 2, `tasks.md` Phase 7):

- Room/section/template destructive callers pass an explicit `getSuccessFocus` provider to `openConfirm`; `confirmOk` applies it on success only (surviving room-row control / sections-nav add button / surviving template-row control → `#templateModalTitle`), failing mutations fall back to the remembered opener, cancellation keeps opener restore. Quote-delete success focus unchanged.
- `#confirmModal` gains dialog semantics (`role="dialog"`, `aria-modal`, labelled/described), initial focus on Cancel, one-time Tab/Shift+Tab containment + Escape cancellation (backdrop preserved), and synchronous `inert` + `aria-hidden="true"` on every close path (focus moved/restored before hiding) with the attributes cleared before opening. No broader modal refactor.
- The "zero page horizontal overflow" wording applies to header/card containment only; the reported very-narrow document overflow (clientWidth 305 vs scrollWidth 327 at 320px) is pre-existing from unrelated topbar/summary-grid rules and stays out of scope (§16.7 is approved for later planning, outside this slice, and not implemented; T018 unchecked).

## Review Corrections 3 (2026-10-20 awaited-mutation lifecycle round)

Folded under plan §D after the round-2 re-review found defects in the AWAITED destructive paths (details in `spec.md` § Review Corrections 3, `tasks.md` Phase 8):

- OK handler closes + semantically hides the dialog SYNCHRONOUSLY ("immediate close") before awaiting the destructive callback; focus is moved to a validated external destination first, so pending I/O never leaves the dialog open/focused/non-inert.
- Invocation tokens make superseded (older) completions inert: they never close, hide, reset, or steal focus from a newer confirmation; `runDestructiveOp(key, fn)` gives every destructive call a stable operation identity (typed positive server IDs for persisted rooms/sections, object identity for unsaved rooms/sections, `template:<id>`, `quote:<id>`) and drops re-entry duplicates, releasing on success AND failure.
- Focus destinations come from `getSuccessFocus`/`getFailureFocus` providers resolved through a validated fallback chain (providers → opener → `#savedListTitle`; never BODY); quote-delete focus refactored into `quoteDeleteFocusTarget(...)` returning an element.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gear lost on re-render (innerHTML wipe) | Single element strategy per §B; explicit re-mount in render path; browser check for exactly one `#fieldSettingsBtn` after renders |
| Duplicate IDs/bindings | Only one button node; bindings attached once |
| Moving quote mgmt breaks save/open/delete refresh | Keep `#savedList`/`#savedListTitle` IDs; keep handler code; browser checks with disposable fixture quote |
| Hard-coded row count breaks on resize | Compute from measured geometry; `resize`/`ResizeObserver` recalc; browser checks at ≥3 widths |
| Keyboard focusability of hidden cards | Use removal-from-render (hidden wrapper) rather than CSS-only clipping; Tab-order check |
| Header realignment changes unrelated pages | `.topbar`/`.project-header`/`.sections-nav` alignment only affects the pricing page; verify other pages untouched (`grep` scope + quick visual) |

## Complexity Tracking

No constitution violations. No new dependencies. No schema/API changes.

(End of plan)
