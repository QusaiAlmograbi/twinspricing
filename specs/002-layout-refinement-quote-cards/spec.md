# Feature Specification: Layout Refinement & Quote Management Cards

**Feature Branch**: `002-layout-refinement-quote-cards`

**Created**: 2026-10-20

**Status**: Draft — planning only, awaiting implementation approval

**Input**: Approved product decisions in the canonical product spec `PRICING_TOOL_ENHANCEMENT_SPEC.md` (repo root, updated attachment), specifically **§16.5 Header alignment and settings location** and **§16.9 Quote management cards below final total** (which supersedes §2.2.H placement).

## Scope Note (important)

Slice 1 (full-width workspace with bottom summary) and Slice 2 (field settings with wrapping) are already implemented, reviewed, committed, and integrated at HEAD `35fa356` on `origin/main`. This feature does NOT repeat them and does NOT remove the retained `.sidebar` element/class blindly — the sidebar remains as the static full-width summary container (source-proven: `public/app.html:392–408`, `.main { width: 100% }`, `.sidebar { width: 100%; position: static }`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Aligned outer edges of topbar, project header, and pricing container (Priority: P1)

**Why** : §16.5 — align the outer left/right edges and available widths of the top bar, quote/project header, and pricing container, preserving normal page gutters. Currently source-proven misalignment: `.topbar`, `header.project-header`, and `nav.sections-nav` are capped at `max-width: 1300px` (`public/app.html:65–72`) while the pricing content (`.layout` → `main.main` → `#mainPanel`) spans the full `.app` width minus 16px padding (`public/app.html:56–62`).

**Independent Test**: Load the pricing tool in a browser; compare the computed left/right x-edges of topbar, project header, and pricing container; they must coincide.

**Acceptance Scenarios**:

1. **Given** the pricing tool open at typical desktop widths (e.g., 1280px–1920px), **When** the page loads, **Then** the left and right edges of the topbar, project header, and pricing container align without misalignment, with normal page gutters preserved.
2. **Given** a narrower viewport, **Then** alignment holds at the available width; the aligned header/cards add no page overflow at any supported width. (Pre-existing full-page document overflow at very narrow widths is acknowledged in Review Corrections #7 — out of scope; §16.7 is approved for later planning and is not implemented in this slice.)

### User Story 2 — Four header fields distributed across the full header container width (Priority: P1)

**Why**: §16.5 — distribute reference number, client name, project location, and project name across the full header container width; wrap responsively when required.

**Independent Test**: Verify the four fields (`#referenceNo`, `#clientName`, `#siteLocation`, `#projectName`) distribute across the entire aligned header width and wrap correctly on narrower viewports.

**Acceptance Scenarios**:

1. **Given** the aligned header from US1, **Then** the four fields occupy the full header container width (no fixed narrow column, no forced equal-count per row). **A new desktop 2×2 layout MUST NOT be imposed**; responsive wrapping is the approved behavior.
2. **Given** viewports down to narrow desktop/tablet widths, **Then** the header fields themselves wrap responsively and remain fully functional (independent review confirmed the fields fit without clipping at ~320px; a pre-existing page-level overflow from unrelated rules is noted in Review Corrections #7).
3. The existing full-width `عنوان العرض` field (`#quoteTitle`) is preserved full width; it sits directly below the four-field grid (NOT in the same grid container — see Review Corrections) and the eyebrow/title/`+ جديد` row is preserved as-is.

### User Story 3 — Settings gear inside the pricing container; direct adjacency of section navigation (Priority: P1)

**Why**: §16.5 — place the settings gear inside a top corner of the pricing container, not in a separate external row; keep section tabs and `+ قسم جديد` directly above the pricing container without an intervening settings toolbar; preserve settings access when no section exists inside the pricing workspace; avoid duplicate IDs/bindings during rerenders.

Current source-proven state: the gear lives in `.workspace-tools`, a separate toolbar row between `#sectionsNav` and `#mainPanel` (`public/app.html:2811–2823`, CSS `public/app.html:828–860`). `+ قسم جديد` is already rendered by JS inside `#sectionsNav` (`public/app.html:4492–4497`).

**Independent Test**: Verify the gear renders in the top corner of the pricing container, nothing is placed between section nav and the pricing container, and the gear opens the settings modal in both empty-state and populated quotes.

**Acceptance Scenarios**:

1. **Given** a populated quote, **Then** the gear is inside the top corner of the pricing container of the pricing workspace.
2. **Given** no section exists (empty state), **Then** settings remain accessible from an appropriate position inside the pricing workspace (the empty-state panel is rendered inside `#mainPanel`, source-proven `public/app.html:4907`), and the gear still opens the existing `#fieldSettingsModal`.
3. **Given** any state, **Then** section tabs and `+ قسم جديد` sit directly above the pricing container with no intervening settings toolbar row.
4. **Given** re-renders (`renderMainPanel` replaces `#mainPanel` inner content, source-proven `public/app.html:4907`, `5066–5091`), **Then** no duplicate gear IDs/bindings appear and exactly one working `#fieldSettingsBtn` exists.
5. Field settings behavior HTML: the gear must keep the modal bindings of the existing `#fieldSettingsBtn`, and the field settings modal and any field settings persistence selectors remain unchanged.

### User Story 4 — Quote management cards below the final total (Priority: P1)

**Why**: §16.9 — move `إدارة العروض` into its own full-width section BELOW the final total, outside the financial-summary grid. Adding or expanding saved quotes must not push the final total or financial/action blocks downward. Supersedes earlier placement of team/saved quotes inside the financial-summary grid.

Current source-proven state: `إدارة العروض` is a `.summary-card` inside `.summary-grid` immediately BEFORE the final-total card `summary-card--final` (`public/app.html:2929–2939`); the saved list is rendered as full-width rows by `loadSavedList()` (`public/app.html:8905–8950+`) with role-dependent heading `#savedListTitle` (`كل عروض الفريق` when owner/admin, else `عروضي المحفوظة`), rows `.saved-item` carrying `data-id`, name (+ reference + designer where present), Arabic date, amount, and `فتح` / `حذف` buttons. Refresh after save/delete/open/template-load is source-proven at `public/app.html:7242` (template load), `8805` (after save), `8944` (after delete), `10003` (init).

**Independent Test**: With several saved quotes, verify the management section appears below the final total; expanding the list does not move the final total; every quote's existing data exists and existing actions work.

**Acceptance Scenarios**:

1. **Given** saved quotes exist, **Then** `إدارة العروض` renders as its own full-width section below the final-total card, outside the financial-summary grid, and the final total stays in place.
2. **Given** the list is promoted to cards, **Then** each quote appears as a bordered card showing the existing name, owner where currently applicable (`designer_name` when shown in current list behavior), date, and amount, plus the existing `فتح` and `حذف` controls — no new data or actions are introduced.
3. **Given** any viewport, cards have consistent responsive widths and content-driven heights, laid out horizontally wrapping to further rows without horizontal scrolling on the page.
4. **Given** more cards than two complete rows at the current viewport width (counted from the actual column count), the collapsed state shows at most TWO complete rows; `عرض المزيد` reveals the remaining cards below the total and changes to `عرض أقل`, which restores two rows.
5. **Given** all cards fit within two rows at a given width, no toggle appears.
6. **Given** the rendered update cycle changes the hidden cards or the viewport changes the card column count, then hidden cards and their actions must not remain keyboard-focusable (not reachable by Tab), and the expanding/collapsing control uses accessible semantics (`aria-expanded`).
7. **Given** a collapsed viewport change, **Then** the collapsed row count recalculates on responsive column changes; **no hard-coded desktop-only item count** and no fixed-height clipping that cuts a card halfway.
8. **Given** save/delete of quotes, the existing refresh behavior continues to work (`loadSavedList()` after save/delete/template-load) and the bindings are preserved. Opening a saved quote loads the correct quote into the editor and does NOT need a list refresh (it makes no redundant network request for the list). Delete restores a usable focus destination (surviving card action, visible toggle, or the management heading) after a successful confirm, and cancellation restores focus to the originating Delete button. Expansion state is retained sensibly across refreshes. Quote persistence, authorization, and ordering behavior are unchanged.

---

### Edge Cases

- RTL (Arabic) must remain correct in the aligned header, container corner gear, and card grid (existing `dir` conventions).
- No horizontal page scrolling is INTRODUCED by the card layout or header distribution at any supported width. The approved current table overflow behavior (§10.3; table-area horizontal scroll when column widths exceed the container) is PRESERVED — the §16.7 screen-fit direction is approved for later planning, outside this slice, and NOT implemented here. Pre-existing page overflow at very narrow widths (unrelated topbar/summary-grid rules; see Review Corrections #7) is not addressed here.
- Very long names / many quotes: cards use content-driven heights; the page grows vertically; the final total remains above the list when expanded.
- Empty team list still shows the existing empty state (currently `ما في عروض محفوظة بعد.`, source-proven `public/app.html:8915`).
- If viewport becomes very narrow, header fields wrap; cards fall to fewer columns per row; the collapsed two-row rule uses the actual column count, not a fixed number.

## Requirements *(mandatory)*

- **FR-1**: Topbar, project header, and pricing container must share aligned outer left/right edges and available widths at supported widths, preserving normal page gutters (§16.5).
- **FR-2**: The four header fields must distribute across the full header container width with responsive wrapping; no new imposed fixed desktop pattern (§16.5). Existing global fields (`#quoteTitle`, eyebrow, `#pageTitle`, `#newQuoteBtn`) keep their roles.
- **FR-3**: The settings gear must be inside the pricing workspace for the pricing container's top corner; the standalone gear toolbar row must no longer separate section navigation from the pricing container (§16.5).
- **FR-4**: Section tabs and `+ قسم جديد` must sit directly above the pricing container (§16.5).
- **FR-5**: Settings access must be preserved in empty state, with no duplicate IDs or duplicated bindings across `renderAll` re-renders (§16.5).
- **FR-6**: Quote management must occupy its own full-width section below the final total, outside the financial-summary grid; expanding it must not move the final total or financial/action blocks (§16.9).
- **FR-7**: Quote cards: bordered, consistent responsive widths, content-driven heights, horizontal wrap, no horizontal page scroll. Data and actions are the existing ones (name/owner where currently applicable/date/amount + open/delete). Existing role-dependent heading behavior is retained (§16.9).
- **FR-8**: Collapsed state shows at most two complete rows based on the actual column count at the current viewport width, recalculated on responsive changes; expansion via `عرض المزيد` / `عرض أقل` appears only when needed, is keyboard-operable, and uses accessible expanded-state semantics; hidden cards are not keyboard-focusable (§16.9).
- **FR-9**: Existing refresh behavior after save/delete/template-load (opening a quote only loads its content — no list refresh) and the existing empty state are preserved (§16.9). Closed dialogs are removed from keyboard/accessibility visibility; confirmed delete re-focuses a usable destination; cancel restores the originating button (Review Corrections).

## Success Criteria *(mandatory)*

- **SC-1**: Computed left/right edges of topbar, project header, and pricing container coincide at tested widths.
- **SC-2**: The four header fields span the full aligned header width and wrap gracefully at narrower widths.
- **SC-3**: Gear is in the pricing container corner; nothing between section nav and container; settings open in empty and populated states.
- **SC-4**: Quote management sits below the final total; expanding does not displace the final total or financial/action blocks.
- **SC-5**: Bordered cards wrap responsively; collapsed state shows at most two complete rows at each tested width; no card is clipped mid-height.
- **SC-6**: `عرض المزيد` / `عرض أقل` appears only when needed, works by keyboard, and toggles correctly; hidden cards are not Tab-focusable.
- **SC-7**: Save/delete refresh verified using disposable fixtures on the local dev server; open loads the correct quote without a list refresh; behavior identical (Review Corrections wording).
- **SC-8**: Final total remains above the list when expanded.

## Review Corrections (2026-10-20, approved repair round)

After independent review of the implementation, four findings and one additional approved adjustment were corrected:

1. **Header field distribution (§16.5)**: the full-span `#quoteTitle` label inside the same `auto-fit` grid kept the unused tail tracks alive (fields occupied 4 of 5–6 tracks at 1440/1280px; clip at 375px). Correction: `#quoteTitle` moved OUT of `.project-fields` into its own full-width label below the grid (`.project-title-field`), so `auto-fit` collapses empty tracks and the four fields fill the desktop row; `minmax(min(200px,100%),1fr)` + `min-width:0`; the forced narrow `1fr 1fr` media rule removed. IDs/values/bindings/RTL-LTR/styling preserved.
2. **Stale collapsed capacity (§16.9)**: hidden-card `display:none` state left over from the previous width polluted the row measurement (14 quotes: widening 600→1440 showed 8 instead of 10). Correction: `refreshQuoteRowUI()` synchronously clears prior hidden state before measuring, recomputes actual columns, and reapplies hiding in one pass (no flash, expansion and keyboard-safe hiding preserved).
3. **Delete focus (§16.9, shared dialog)**: after confirmed delete, focus stayed in the closed confirmation modal. Correction: the closed `.modal-overlay` is removed from keyboard/accessibility visibility (`visibility:hidden` until open); `openConfirm` remembers the opener and restores it on cancel/backdrop/OK-error; the confirmed quote delete awaits the successful `loadSavedList()` refresh and focuses the card occupying the deleted position (first/middle/last/only and collapsed lists handled), else the visible toggle, else `#savedListTitle` (programmatic focus target). Other callers of the shared dialog were inspected (room delete, section delete, template delete) and only received the generic stranded-focus restore. (Revised by Review Corrections 2 #5 below — these callers now carry explicit success-focus providers.)
4. **Documentation wording**: opening a saved quote is read-only for the list — spec/plan/tasks corrected so open must load the correct quote (no list refresh); save/delete must refresh the list.

**Additional approved UI adjustment**: the `عرض المزيد` / `عرض أقل` toggle is centered horizontally below the quote-card grid with ~12px vertical spacing (direction-neutral `display:block; margin:12px auto 0`, with an explicit `[hidden]{display:none}` companion so the hidden attribute keeps working). Behavior and accessibility semantics unchanged.

## Review Corrections 2 (2026-10-20, targeted dialog repair round)

After the targeted independent re-review of the confirmation dialog, four findings were corrected:

5. **Success focus for shared destructive callers (room / section / template delete)**: these callers remove/rerender their opener during the confirmed mutation, so keyboard focus could remain on the hidden `#confirmOk`. Correction: each caller passes a small explicit `getSuccessFocus` provider to `openConfirm`; `confirmOk` applies it only after the callback resolves WITHOUT error and only when focus is stranded (never overriding a caller-set valid focus target): room delete → surviving room row's `✎`/`✕` control clamped to the deleted index, else `#addRoomBtn`; section delete → `#sectionsNav .add-section-btn` (always-present visible control in the same nav, since section tabs are divs without tabindex); template delete → the surviving `.saved-item` row's `تحميل`/`حذف` control clamped to the deleted row index, else `#templateModalTitle` (`tabindex="-1"`). Failing mutations (callback rejects) never receive the success target — they fall back to the remembered opener; cancellation/backdrop errors restore the opener as before. The quote-specific success focus is unchanged.
6. **Confirmation dialog semantics**: `#confirmModal` now has `role="dialog"` + `aria-modal="true"`, labelled by `#confirmTitle` and described by `#confirmMessage`. Opening moves focus inside (to `إلغاء`/Cancel). Tab and Shift+Tab are constrained to the dialog's own controls; Escape cancels (backdrop cancellation preserved). The keydown listener is bound ONCE (no per-open cleanup). The dialog is `inert` + `aria-hidden="true"` synchronously when closed — initial state and every close path (cancel button, backdrop, Escape, OK success/error) — with focus moved/restored BEFORE the dialog is made inert/hidden, and the attributes removed synchronously before opening/focusing. The CSS fade remains separate from semantic visibility. No other modal was refactored.
7. **Documentation (overflow wording)**: independent re-review confirmed the header fields FIT at ~320px, but the page-level document overflow reported earlier (clientWidth 305 vs scrollWidth 327 at 320px) is pre-existing and caused by unrelated topbar/summary-grid rules — corrected the wording so the accepted claims are limited to header/card containment; the pre-existing very-narrow page overflow stays out of scope (§16.7 is approved for later planning, outside this slice, and not implemented; T018 remains unchecked; independent re-review pending).

## Review Corrections 3 (2026-10-20, awaited-mutation lifecycle round)

From the same review chat (findings against the AWAITED destructive paths, round 2 re-review):

8. **Immediate close before awaited work**: the OK handler previously kept the dialog open, focused, and non-inert until the awaited destructive callback resolved — an open-state accessibility exposure during pending I/O with focus stranded on `#confirmOk`. Correction: the OK handler captures the callback, both focus providers, the opener, and an invocation token, then moves focus to a valid external destination and closes + semantically hides (`inert` + `aria-hidden`) SYNCHRONOUSLY before awaiting the callback; the AX-tree excludes the dialog while the request is pending (reproduced `TAG=v_pre_R3`, then fixed — R1a–f).
9. **Supersede safety + operation identity**: an older (superseded) completion could hide (`inert`/`aria-hidden`) a newer confirmation and steal its focus; a same-operation re-entry (reopen the same quote/room/section/template, confirm again) could issue a SECOND identical DELETE request. Correction: `openConfirm` mints a monotonic token and the completion acts only if it is still the newest invocation; `runDestructiveOp(key, fn)` guards persisted rooms and sections with explicit typed positive server IDs (`room:<id>` / `section:<id>`), unsaved rooms and sections with object identity, templates with `template:<id>`, and quotes with `quote:<id>`. Re-entry never re-issues the deletion, and the guard releases on success AND failure so failed mutations are retriable (R2a–f, R3a–d, R4a–f).
10. **Failure focus contract + fallback chain**: new `getFailureFocus` provider alongside `getSuccessFocus`; destinations are validated (`focusConfirmDestination`: connected, focusable, outside the confirm modal — focus actually moves) and applied from a fallback chain (`focusConfirmFallbackChain`: explicit provider(s) → opener → `#savedListTitle`; never BODY, never inside the dialog). The quote-delete focus logic was refactored from self-focusing `focusAfterQuoteDelete` into `quoteDeleteFocusTarget(...)` returning an element for the providers (R5a–e: disconnect-opener cancel/backdrop falls back to `#savedListTitle` rather than BODY).
11. **Docs**: §16.7 wording relabeled everywhere ("APPROVED for later planning; NOT implemented in this slice"); T029/T031 corrected; Phase 8 (T033–T037) added; T018 + T032 remain unchecked with independent re-review pending.

## Assumptions

- Implemented Slice 1 layout (stacked full-width summary) and Slice 2 settings are kept unchanged elsewhere.
- The `.sidebar` element remains as the summary container; only the quote management card moves out of `.summary-grid`.
- No backend/API changes; no schema changes; no new dependencies; pricing table column widths and overflow behavior unchanged (§16.7: approved for later planning, not implemented in this slice).
- RTL document conventions remain.

## Non-Goals (explicitly deferred)

- Unified settings with individual overrides (§16.2).
- Quote-wide equal row heights and centered content (§16.3).
- Printing geometry (§16.4).
- Quote ordering-code presentation (§16.6).
- Relative screen-fit width policy (§16.7) — approved for later planning; NOT implemented in this slice; current table overflow behavior preserved.

(End of spec)
