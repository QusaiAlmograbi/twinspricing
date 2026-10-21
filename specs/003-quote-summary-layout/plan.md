# Implementation Plan: Quote Summary Layout

**Branch**: `main` (planning only; no branch change authorized) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.10 and the feature specification in `specs/003-quote-summary-layout/spec.md`

## Summary

Reorganize the existing screen-only quote summary into three explicit responsive rows, followed by the existing full-width gold final total and the already accepted quote-management cards. The implementation boundary is a markup/CSS-only edit in `public/app.html`: retain every current element ID and handler, do not alter calculation or state code, and do not touch either print path.

The approved 1672×941 RTL reference image has now been inspected. It confirms equal proportional tracks—three in Row 1 and two in Rows 2/3—and supplies the card hierarchy, spacing, control grouping, gold accents, and final-bar treatment described below. The image is a responsive visual target, not a fixed-pixel template or authority to add absent data.

## Technical Context

**Language/Version**: Vanilla HTML/CSS/JavaScript served by Node.js 20

**Primary Dependencies**: Existing Express 4.x application; no new dependency

**Storage**: PostgreSQL production and SQLite local/test, both unchanged

**Testing**: Focused browser geometry/keyboard checks with a non-persisting synthetic fixture; source-diff protection for calculations/handlers/print/PDF; `node --check` on the extracted inline script; `git diff --check`. The broad Node API suite does not exercise this layout and is not repeated unless implementation crosses the markup/CSS boundary.

**Target Platform**: Current desktop web application with RTL primary direction and usable LTR/narrow layouts

**Project Type**: Legacy server-rendered web application with the main frontend in one HTML file

**Performance Goals**: No new runtime loop, observer, network request, or layout script; CSS-only responsive transition

**Constraints**: Planning documentation only in this phase; later implementation limited to `public/app.html`; preserve all IDs/bindings/actions, autosave/confirmation behavior, authorization, data/API contracts, quote-card behavior, and print output

**Scale/Scope**: Seven existing summary groups, one final-total bar, one existing quote-management section; no model, API, schema, or server-PDF change

## Constitution Check

*Pre-design and post-design gate: PASS.*

- **Stable Maintenance First**: One bounded screen-summary change; no unrelated refactor or framework work.
- **Repository Is the Source of Truth**: Findings below were re-established from `main` at `4d9f55d5be78ee0c8233f906454f0559ce668589`.
- **Analysis and Implementation Are Separate**: This artifact stops before implementation for advisor assessment; later implementation is assigned to OpenCode.
- **Smallest Safe Patch**: One runtime file in the implementation phase; no dependency, schema, API, authorization, or persistence change.
- **Mutation Safety**: No mutation handler changes. Existing save/delete/confirmation controls retain their IDs and bindings.
- **Regression Proof**: Focused layout, keyboard, calculation/binding, action, card-placement, and print-isolation checks cover the actual risk.
- **Preserve Stable Behavior**: Explicit source-diff gates prevent calculation, autosave, authorization, confirmation, card lifecycle, and print changes.

## Current-Source Findings

All findings are **source-proven at HEAD `4d9f55d…`** and **not runtime-verified in this planning phase**.

| Area | Current source evidence | Planning consequence |
|---|---|---|
| Overall layout | `.layout` is a column and `.sidebar` is full-width/static (`public/app.html:387-408`). | The summary is already below the pricing workspace; do not revisit Slice 1. |
| Summary container | `.summary-grid` currently uses one auto-fit grid for every group (`public/app.html:818-842`). | Replace the implicit placement with three explicit row containers so the approved row membership is stable. |
| Summary markup | The header, seven groups, final total, and quote-management sibling are static markup (`public/app.html:2950-3080`). | Reorder/wrap existing nodes only; preserve each element once. |
| Calculations | `renderTotals()` fills section totals, financial totals, cost/profit, final total, and payment amounts (`public/app.html:6676-6780`). | Do not edit formulas, output IDs, or render calls. |
| Dynamic payment controls | `renderPaymentTerms()` owns percentage/description inputs, amounts, delete/add actions, warning, dirty state, and focus (`public/app.html:6782-6861`). | Styling must tolerate dynamic rows; keep `#paymentTerms` and per-render bindings intact. |
| Static bindings | Summary inputs update the existing quote state and dirty/autosave path (`public/app.html:8529-8564`); action bindings are assigned by ID (`public/app.html:9777-9808`). | IDs and controls remain unique and unchanged; no rebinding work is needed. |
| Autosave indicator | `showAutoSaveIndicator()` writes status text/classes to `#autoSaveIndicator` (`public/app.html:4442-4459`). | Keep it in the actions group and allow long error text to wrap. |
| Quote management | `loadSavedList()` selects the role-dependent heading and renders the accepted cards (`public/app.html:9223+`); CSS already provides responsive cards and the centered `margin: 12px auto 0` toggle (`public/app.html:1171-1280`). | Preserve markup, rendering, collapse measurement, toggle semantics, and spacing; verify placement only. |
| Print isolation | Print CSS hides every direct body child except `#print-template` (`public/app.html:2471-2498`); the browser print renderer and separate template live at `public/app.html:9450+` and `10667+`. | Do not edit print code/styles. A source-diff check plus one print smoke check is sufficient. Server PDF remains untouched. |
| Existing narrow rule | The screen stylesheet already uses an `@media (max-width: 860px)` boundary (`public/app.html:2458-2465`). | Reuse that boundary for summary stacking unless runtime evidence shows it cannot contain the desktop tracks. |
| Existing known narrow overflow | Feature 002 documents pre-existing page-level overflow around 320px from unrelated topbar/table rules. | Acceptance is scoped to no overflow introduced by the summary; do not reopen §16.7 or claim whole-page screen-fit. |

## Approved Image Comparison Findings

The following observations are **image-proven from the supplied 1672×941 reference**. They do not constitute browser/runtime proof.

### Layout and proportions

- Row 1 occupies three near-equal fluid columns with consistent narrow gutters. The right/middle/left group placement matches the written approval exactly.
- Rows 2 and 3 each occupy two near-equal fluid columns. The reference does not support an asymmetric wide/narrow split.
- Cards in each row align to the same top and bottom edges. Implement this through grid stretching to natural row height, never reference-derived fixed heights.
- The final-total bar spans the full content width below Row 3. The image ends at that bar, so it provides no new visual direction for the already accepted quote cards below it.

### Card hierarchy and styling

- The page uses a clear summary header with title at inline start, all-items at the opposite edge, and a subtle full-width divider below.
- Each group is a complete surface card: subtle warm border, approximately 12px rounded corners, very restrained shadow, comfortable padding, and a bold high-contrast heading.
- Card-to-card horizontal and vertical spacing is consistent, visually around the application's existing 14–18px spacing scale.
- Gold is an accent rather than a blanket fill: heading/icon accents, emphasized values, the primary save button, and the final-total bar. Existing theme variables must translate this hierarchy for both themes.
- The final bar has a strong gold fill/tonal variation, rounded corners, high-contrast label, and a materially larger amount at the opposite inline edge.

### Existing-control treatment that can be adopted

- Style current section entries as compact bordered rows, but keep their existing code/name/amount content and empty state.
- Change only the section-card display heading from current `إجمالي الأقسام` to the approved reference wording `الأقسام المسعّرة`; `#sidebarSections` and its renderer stay unchanged.
- Place the current tax and discount controls side by side at desktop, with existing calculated breakdown rows beneath them and subtle separators.
- Style the current estimated-cost and profit-margin rows as two inset tiles. Their present values and formulas remain authoritative.
- Keep the existing duration and validity fields paired with generous control height.
- Align existing payment inputs/amount/delete actions as compact structured rows and retain the dashed full-width add-payment button.
- Preserve the existing 3-button then 2-button action grouping, with save as the filled primary action. Give `#autoSaveIndicator` its own full-width status line so it does not alter the button grid.
- Add the reference's gold line icons as dependency-free inline SVG attached to existing headings/values/labelled controls/buttons. Every icon is `aria-hidden`, non-focusable, and non-interactive; do not substitute platform-dependent emoji or create icon-only buttons.

### Reference/source conflicts that must not be implemented

| Reference-only element | Current source | Decision |
|---|---|---|
| Section-card heading says `الأقسام المسعّرة` | Current static heading says `إجمالي الأقسام` | Adopt the approved reference wording as the sole display-copy change; no renderer/binding change. |
| Subtitle under `ملخص العرض` | No summary subtitle or source copy | Do not add copy. Keep current header title and all-items control. |
| Section table header (`#`, name, subtotal) and bottom aggregate row | `#sidebarSections` renders code/name plus amount only; no separate aggregate row | Do not change `renderTotals()` or invent the aggregate/header output. Style current rows only. |
| Highlighted after-tax total inside the totals card | Current grand total appears in the dedicated full-width bar | Do not duplicate the metric inside the card. The full-width bar remains the sole grand-total presentation. |
| Payment table header and numbered rows | Dynamic payment rows have percentage, description, amount, delete, add, and warning only | Do not add numbering or header output and do not edit `renderPaymentTerms()`. |
| Input/card/button icons | Current summary lacks this coherent icon treatment | Add icons only as decorative markup on existing labelled elements; they add no semantics, IDs, focus stops, or handlers. |
| Quote-management styling | Not visible below the cropped final bar | Retain Feature 002 cards and toggle unchanged; the image cannot supersede their accepted design. |

## Control-to-Layout Mapping

Every existing summary group/control is accounted for. “Destination” uses inline-start/inline-end behavior for direction-aware placement; the physical right/middle/left statement is authoritative for RTL desktop.

| Existing group/control | Existing identity/content | Proposed destination | Preservation rule |
|---|---|---|---|
| Summary header | `ملخص العرض` | Above all rows | Text and styling role retained. |
| All items | `#allItemsBtn` | Summary header, unchanged | Existing overlay action/binding retained; not assigned to a content row by the approved design. |
| Section totals | `#sidebarSections`, dynamic `.sidebar-sec-row` | Row 1, RTL right / inline start | Empty state, section code/name, and computed total retained. |
| Totals / discount / tax | `#taxPct`, `#discountVal`, `#discountType`, `#totalsBreakdown` | Row 1, RTL middle | Values, min/step attributes, input/change handlers, formulas, and conditional discount line retained. |
| Cost / profit | `#totalsCostProfit` | Row 1, RTL left / inline end | Current estimated-cost and profit-margin outputs retained; do not invent profit amount or role behavior. |
| Duration / validity | `#executionDays`, `#validityDays` | Row 2, RTL right / inline start | Attributes, state updates, dirty/autosave behavior retained. |
| Payment terms | `#paymentTerms`; dynamic percentage/description inputs, amount, delete, `#addTermBtn`, warning | Row 2, RTL left / inline end | Dynamic rendering, focus after add, validation warning, calculated amounts, and bindings retained. |
| Price exclusions | `#priceExclusions` | Row 3, RTL right / inline start | Current text/value, resize behavior, state update, save/print data retained. |
| Quote actions | `#autoSaveIndicator`, `#saveQuoteBtn`, `#printBtn`, `#exportPdfBtn`, `#saveTemplateBtn`, `#loadTemplateBtn` | Row 3, RTL left / inline end | Existing order, bindings, status text, authorization/effects, and modal/print/PDF behavior retained. |
| Final total | `.summary-card--final`, `.grand-total`, `#grandTotalVal` | Full-width bar immediately after Row 3 | Gold styling and computed value retained. |
| Quote management heading | `.quote-management > h3`, `#savedListTitle` | Immediately below final total | Generic and role-dependent headings retained. |
| Quote cards | `#savedList`, existing `.quote-card` output | Below quote-management heading | Existing data, order, open/delete controls, empty state, and hidden-card keyboard rules retained. |
| Card expansion | `#quoteRowsToggle` | Centered below cards | Existing show-more/show-less behavior, `aria-expanded`, collapse measurement, and approximately 12px spacing retained. |

## Implementation Strategy (Smallest Coherent Boundary)

### 1. Static markup grouping and order

Inside the existing `.summary-grid`, add three non-semantic row wrappers and move the existing seven `.summary-card` elements into them:

1. primary row: section totals → totals/discount/tax → cost/profit;
2. secondary row: duration/validity → payment terms;
3. tertiary row: price exclusions → quote actions.

Keep the final-total section after those wrappers. Keep `.quote-management` as the next sibling after `.summary-grid`; do not move or rewrite it. Moving duration/validity before payment terms aligns DOM focus order with the approved RTL visual row.

### 2. Direction-aware responsive CSS

- Make `.summary-grid` the vertical row stack.
- Give the primary row three `minmax(0, 1fr)` tracks and the secondary/tertiary rows two `minmax(0, 1fr)` tracks. The reference confirms these equal proportions; use consistent 14–18px-scale gutters rather than fixed reference coordinates.
- Rely on inherited writing direction and DOM order rather than physical `left`/`right` offsets so RTL begins on the right and LTR begins on the left.
- At the existing `max-width: 860px` boundary, switch each row to one track, preserving DOM/keyboard order.
- Replace the current top-divider-only summary cards with complete theme-aware surface cards: subtle full border, approximately 12px radius, restrained shadow, comfortable padding, and stronger headings. Stretch cards within a row to natural equal row height without fixed heights.
- Restyle existing internal content only: compact section/breakdown/payment rows; side-by-side tax/discount settings; two inset cost/profit tiles; paired duration/validity fields; full-width exclusions; 3-plus-2 action button grids with save primary and autosave status on its own line.
- Add dependency-free gold line icons only to existing labelled headings, values, control wrappers, and buttons where shown by the reference. Use inline SVG with `aria-hidden="true"` and `focusable="false"`; do not add icon-only controls, IDs, handlers, external icon packages, or platform emoji.
- Style the final-total bar with the existing gold palette, subtle tonal variation if theme-safe, high contrast, rounded corners, and a prominent value opposite its label.
- Add only targeted containment rules needed by browser evidence: `min-width: 0`, safe wrapping for section labels/status text, non-shrinking amounts/actions where appropriate, and narrow payment/meta/action wrapping. Do not alter pricing-table width or global overflow.

### 3. Behavior and print isolation

No JavaScript change is planned. Every current ID remains unique and its node remains present. Do not edit `renderTotals`, `renderPaymentTerms`, static summary bindings, autosave, save/load/delete/confirmation code, `renderPrintTemplate`, `#print-template`, print CSS, or `routes/pdf.js`.

If implementation evidence shows a JavaScript or server change is required, stop and return for advisor review because that materially broadens the approved boundary.

## Keyboard Order Contract

For RTL desktop, focus proceeds in row-major DOM order: summary-header `#allItemsBtn`; Row 1 tax/discount controls; Row 2 duration, validity, then each payment row and add-payment; Row 3 exclusions then existing actions; quote-card actions and the expansion toggle afterward when visible. Non-interactive section/cost/final-total blocks do not add stops. At narrow widths the same order matches the single-column flow. In LTR the layout begins at the LTR inline start, so the same DOM order remains visually coherent.

## Verification Plan

Verification is focused because the patch is markup/CSS-only. Prefer a non-persisting synthetic in-page fixture or static browser harness; no application-data setup is required. Never mutate localhost:3000 or its data.

1. **Baseline/source boundary**: Reconfirm HEAD/status and the source findings. Record the unchanged calculation/render/binding and print/PDF source blocks before editing.
2. **Desktop geometry and reference comparison**: At the reference width, 1440px, and 1280px RTL, use bounding rectangles to prove the exact 3/2/2 equal-proportion rows, right/middle/left placement, consistent gutters, same-row stretch, and full-width final bar. Compare card shells, heading hierarchy, existing-control grouping, gold emphasis, and final-bar treatment with the image without expecting fixed pixels.
3. **Responsive geometry**: At 861px/860px to test the boundary, then 600px and 320px, prove one-column stacking at/below the boundary and `scrollWidth <= clientWidth` for the summary and each group. Do not fail this slice for unrelated pre-existing document overflow.
4. **LTR**: At 1440px and 600px with document direction set to LTR for the test, prove the inline flow mirrors, content remains contained, and no physical-offset assumption breaks placement.
5. **Long content**: Use long mixed-direction section names, multiple long payment descriptions, an over-100% warning, long exclusions, long autosave error text, large totals, and both role-dependent list headings; verify cards/rows grow beyond the reference proportions without clipping or overlap and same-row cards stretch naturally.
6. **Calculation/binding protection**: Diff-gate `renderTotals()`, `renderPaymentTerms()`, static summary handlers, autosave, action bindings, confirmation code, and PDF binding as unchanged. In a non-persisting harness, verify existing IDs remain unique and bound controls remain reachable; do not run save/delete persistence or dialog lifecycle scenarios for this layout slice.
7. **Keyboard**: Tab and Shift+Tab through the exact order above in RTL desktop, RTL narrow, and one LTR layout; verify collapsed quote-card controls remain unreachable and the existing toggle remains keyboard-operable.
8. **Cards/final placement**: Check empty, short, collapsed, and expanded card states. The final total remains above the cards; collapse still shows at most two complete rows; the toggle remains centered with approximately 12px spacing.
9. **Print isolation**: Confirm the runtime screen summary is hidden under print media and the existing `#print-template` is shown. Confirm `routes/pdf.js` and all print-render/style blocks are absent from the diff; no PDF generation or application-data test is required.
10. **Mechanical closeout**: Run `node --check` on a temporary extraction of the inline script, `git diff --check`, duplicate-ID checks for all mapped controls, and a cause-scoped diff review. Run `node --test test/*.test.js` only if implementation crosses into JavaScript/backend behavior; if not run, report 0 pass/0 fail/0 skipped and the risk rationale rather than reusing historical counts.

## Project Structure

### Documentation (this feature)

```text
specs/003-quote-summary-layout/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── tasks.md
└── checklists/
    └── requirements.md
```

No `data-model.md` is generated because no entity, field, validation, persistence, or state transition changes. No `contracts/` artifact is generated because no API, public interface, or external contract changes; the screen-layout contract is fully captured by the spec and mapping above.

### Source Code (implementation phase)

```text
public/
└── app.html          # only planned runtime edit: summary markup and screen CSS

routes/
└── pdf.js           # explicitly unchanged

test/                    # existing API tests unchanged; no layout coverage
```

**Structure Decision**: Keep the legacy single-file frontend architecture. Adding a component layer, stylesheet split, dependency, automated browser framework, or server change would exceed this maintenance slice.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Visual order differs from DOM order in one direction | Use row-major DOM order plus direction-aware grid auto-placement; verify bounding rectangles and real Tab order in RTL/LTR. |
| Long dynamic payment content overflows | Use `min-width: 0` and targeted narrow wrapping; test multiple long terms and the percentage warning. |
| Moving nodes breaks ID lookup/bindings | Preserve exactly one of every mapped ID; no handler rewrite; run duplicate-ID and interaction checks. |
| Final total/cards regress | Keep the final section and quote-management sibling structurally unchanged; verify all card states without reworking card logic. |
| Screen styles leak into print | Leave print selectors/template/render function untouched; diff-gate them and run one print smoke comparison. |
| Narrow acceptance accidentally reopens global screen-fit | Measure the summary container itself and document unrelated pre-existing page overflow separately. |
| Reference-only output is mistaken for approved application data | Keep the documented conflict table as a hard boundary; style current rows only and diff-gate both render functions. |
| Decorative icons become controls or accessibility noise | Inline, dependency-free SVG only; `aria-hidden`, non-focusable, no IDs/handlers, and no icon-only control. |
| Literal image dimensions harm responsiveness/themes | Treat equal proportions, hierarchy, and spacing as the target; use fluid tracks/current variables and natural content height rather than fixed pixels/light-only colors. |

## Complexity Tracking

No constitution violations. No new dependencies, data model, API, storage, authorization, behavior, or print architecture. The implementation target remains one file and one presentation reason.
