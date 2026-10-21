# Feature Specification: Quote Summary Layout

**Feature Directory**: `003-quote-summary-layout`

**Working Branch**: `main` (planning only; no branch creation or switch authorized)

**Created**: 2026-10-21

**Status**: Draft — planning complete, awaiting advisor assessment and separate implementation approval

**Input**: Approved quote-summary redesign in `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.10, while preserving the completed quote-management-card behavior in §16.9.

## Scope Boundary

Reorganize and style the existing on-screen quote-summary groups only. The feature is one coherent presentation slice: the desktop row arrangement, narrow-screen stacking, LTR usability, behavior preservation, and final-total/card placement must ship together.

The approved 1672×941 RTL reference image is now available and has been inspected. Its proportional layout and visual hierarchy are part of this plan, adapted through the application's existing theme variables and controls rather than copied as fixed pixels or new functionality.

### Approved Reference Comparison

| Reference finding | Feature 003 decision |
|---|---|
| Row 1 uses three visually equal cards; Rows 2 and 3 use two visually equal cards. | Use three equal fluid tracks, then two equal fluid tracks; retain the approved group placement and direction-aware flow. |
| Cards use full subtle borders, rounded corners, surface fill, restrained shadow, generous padding, strong headings, and consistent gutters. | Replace the current top-divider-only summary treatment with this card hierarchy using existing color/spacing/typography variables. |
| Cards within a row have matching visible height even when one has less content. | Stretch cards to the natural height of the tallest card in that summary row; never use fixed heights that clip long content. This does not alter item-row-height scope. |
| Section and financial/payment content is presented as compact structured rows; cost and profit are two inset value tiles; duration controls are paired; action buttons form a 3-plus-2 grid with save primary. | Restyle the application's existing rows and controls to the same hierarchy without changing their values, control labels, order, or handlers. Keep the autosave indicator as a full-width status line so it does not displace action buttons. |
| The section card heading is `الأقسام المسعّرة`; current source says `إجمالي الأقسام`. | Adopt the approved reference heading as a display-only text change; keep the current section rows, empty state, calculations, and binding. |
| Gold line icons accompany the title, card headings, values, inputs, and labelled buttons. | Add decorative icons only to existing labelled elements, with no dependency, focus stop, accessible-name change, or behavior; no new icon-only control is created. |
| A strong full-width gold final-total bar closes the visible summary. | Preserve the current final-total label/value and make the bar visually match the reference; quote-management cards still follow below even though they are outside the image crop. |
| The reference also shows a summary subtitle, section table headers and aggregate row, an in-card after-tax total, and payment headers/sequence numbers. | These are absent from current source and are not added. They would introduce copy, duplicate/new metrics, or renderer output beyond the approved preservation boundary. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Use the reorganized quote summary without behavior loss (Priority: P1)

As a quote editor, I can scan and edit the summary in a predictable three-row arrangement on RTL desktop, use the same summary on narrow or LTR screens, and continue using every existing calculation and action exactly as before.

**Why this priority**: The row layout is the approved redesign, while behavior and print preservation are mandatory safety conditions for the deployed legacy application. These concerns are inseparable and should be reviewed and released as one bounded slice.

**Independent Test**: With a non-persisting synthetic fixture, compare the summary with the approved reference and inspect RTL desktop, RTL narrow, LTR desktop, and LTR narrow layouts; verify keyboard traversal and final-total/card ordering; then use source comparison to confirm calculations, handlers, autosave, confirmation, and print/PDF paths remain outside the patch.

**Acceptance Scenarios**:

1. **Given** the quote editor at a desktop width in RTL, **when** the summary is displayed, **then** Row 1 contains section totals at the right, totals/discount/tax in the middle, and cost/profit at the left.
2. **Given** the same desktop layout, **when** the next two rows are inspected, **then** Row 2 contains execution duration/validity at the right and payment terms at the left, and Row 3 contains price exclusions at the right and quote actions at the left.
3. **Given** the three summary rows, **when** the user moves downward, **then** one full-width gold final-total bar appears next, followed immediately by the existing quote-management cards and their existing centered expansion toggle.
4. **Given** a narrow viewport, **when** the summary cannot safely retain its desktop columns, **then** the groups stack in logical reading and keyboard order without clipping, overlap, or summary-caused horizontal overflow.
5. **Given** an LTR document direction, **when** the same desktop and narrow layouts are used, **then** the groups flow from the LTR inline start and every control remains visible and operable.
6. **Given** long section names, many or long payment terms, long exclusions, a large monetary total, or a long role-dependent saved-quote heading, **when** content grows, **then** its group grows or wraps without obscuring content or controls.
7. **Given** the implementation diff, **when** calculation, state, validation, dirty/autosave, and persistence source is compared with the baseline, **then** those blocks are unchanged and the existing summary control identities remain available.
8. **Given** the implementation diff, **when** save, print, PDF, template, all-items, quote-management, authorization, and confirmation bindings are compared with the baseline, **then** those handlers and lifecycle paths are unchanged without replaying unrelated persistence or dialog scenarios.
9. **Given** browser printing or server PDF export, **when** output is produced, **then** the existing print/PDF content and geometry are not changed by this screen-summary slice.
10. **Given** the approved reference and an RTL desktop viewport, **when** the summary is compared visually, **then** its proportional tracks, card shells, spacing, heading hierarchy, structured existing controls, cost/profit tiles, action hierarchy, and gold final-total bar follow the reference without adding its source-incompatible content.

### Edge Cases

- A new quote has no priced sections and displays the existing empty section-total state.
- Section names contain long unbroken or mixed-direction text.
- Payment terms are empty, numerous, contain long descriptions, or exceed 100% and show the existing warning.
- The autosave indicator displays saving, success, or long error text inside the actions group.
- The current user receives either the team or personal saved-quote heading; the list may be empty, fit within two rows, or require expansion.
- Monetary values are large enough to wrap unless the label/value layout protects them.
- The viewport crosses the responsive boundary while quote cards are collapsed or expanded.
- The document direction changes between RTL and LTR without duplicating or reordering controls through script.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The existing summary heading and all-items control MUST remain at the top of the summary and retain their current behavior.
- **FR-002**: RTL desktop Row 1 MUST place section totals right, totals/discount/tax middle, and cost/profit left.
- **FR-003**: RTL desktop Row 2 MUST place execution duration/validity right and payment terms left.
- **FR-004**: RTL desktop Row 3 MUST place price exclusions right and quote actions left.
- **FR-005**: The existing gold final-total bar MUST span the summary width immediately below Row 3.
- **FR-006**: The completed quote-management section MUST remain immediately below the final total, outside the summary rows, with its accepted two-complete-row collapse and centered toggle spacing unchanged.
- **FR-007**: Narrow layouts MUST stack the groups into a single usable flow in the same logical row order.
- **FR-008**: LTR layouts MUST mirror the logical inline flow without relying on hard-coded right/left offsets and without reducing control usability.
- **FR-009**: The focusable control order MUST follow the visible row-major order for the active direction, with hidden quote cards remaining excluded from keyboard navigation.
- **FR-010**: All existing values, calculations, permissions, state updates, bindings, actions, save/autosave behavior, validation, confirmation behavior, and quote-card refresh behavior MUST be preserved.
- **FR-011**: Long or numerous content MUST wrap or expand without clipping meaningful content, overlapping controls, or creating horizontal overflow attributable to the summary.
- **FR-012**: Existing browser-print and server-PDF output MUST remain unchanged; screen-only summary layout MUST remain isolated from print rendering.
- **FR-013**: The redesign MUST reproduce the reference's visual hierarchy through the application's current theme system: full bordered/rounded cards with restrained shadow and padding, strong headings, consistent gutters, compact structured existing rows, two inset cost/profit tiles, paired duration controls, a 3-plus-2 action-button arrangement with save primary, and a prominent full-width gold final-total bar. The existing section card heading MUST change to the approved display label `الأقسام المسعّرة` without changing its content or binding.
- **FR-014**: No button, metric, field, action, copy block, or data point absent from the current application may be introduced. In particular, the reference-only subtitle, section headers/aggregate, duplicate in-card after-tax total, and payment headers/sequence numbers MUST remain absent unless separately approved.
- **FR-015**: The implementation MUST NOT change section/room/item ordering, ordering-code behavior or typography, table screen-fit width, unified sizing, item-row heights, print geometry, schema, APIs, authorization, or persistence contracts.
- **FR-016**: Cards within each summary row MUST stretch to the natural height of that row's tallest card while all content remains visible; no fixed card height may be used.
- **FR-017**: Reference iconography MUST be added as dependency-free, non-focusable, `aria-hidden` decoration attached only to existing labelled headings, values, input wrappers, or buttons. It MUST NOT create an icon-only control, duplicate accessible text, or change any binding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At representative desktop widths of 1440px and 1280px in RTL, all seven summary groups occupy exactly the three approved rows and physical sides, followed by one full-width final-total bar.
- **SC-002**: At the responsive boundary and representative narrow widths of 600px and 320px, each summary group is a single-column block whose content and controls remain within the summary container; the summary introduces no additional horizontal overflow.
- **SC-003**: At 1440px and 600px in LTR, all groups remain visible, ordered from the LTR inline start, and usable without collision or unreachable controls.
- **SC-004**: Source comparison confirms the section-total, subtotal, discount, tax, cost/profit, payment-amount, and final-total calculation/render blocks are unchanged; synthetic displayed values remain in their original identified destinations.
- **SC-005**: Keyboard traversal reaches every visible summary control once in visible row-major order, never reaches collapsed quote-card controls, and retains the existing keyboard behavior of actions and confirmations.
- **SC-006**: Long-content fixtures show all meaningful text and controls without overlap or clipping in both directions at desktop and narrow widths.
- **SC-007**: The final-total bar remains above the quote-management section in empty, short, collapsed, and expanded quote-list states; the existing expansion control remains centered approximately 12px below the cards.
- **SC-008**: Source comparison shows no changes to calculation, persistence, authorization, confirmation, browser-print-template, or server-PDF code, and print-media inspection shows the existing print template rather than the screen summary.
- **SC-009**: At the reference width and at 1440px RTL, visual comparison confirms near-equal 3/2/2 proportions, consistent full card shells/gutters, stronger heading hierarchy, decorative gold line icons on existing labelled elements, reference-aligned existing-control grouping, row-height alignment without clipping, and a full-width high-contrast gold final-total bar.

## Assumptions

- The existing 860px responsive boundary is the default narrow-screen transition unless implementation evidence shows a smaller safe change is required.
- The approved reference confirms near-equal proportional tracks: equal fluid shares are the faithful responsive implementation, not a substitute assumption or fixed-pixel copy.
- The all-items control remains in the summary header because the approved row list does not assign it to a content row.
- Current source is authoritative for available controls: the existing PDF action and current cost/profit outputs remain; no reference-only action or profit metric is added.
- The reference's light surface is translated through existing theme variables so the current light/dark theme behavior is preserved.
- Existing quote-management card behavior is accepted and is verified only for placement/regression, not redesigned or re-reviewed.

## Non-Goals

- Literal fixed-pixel reproduction of the 1672×941 reference or hard-coded light-only colors.
- Reference-only subtitle, table headers, section aggregate row, duplicate in-card grand total, payment numbering, or any other new renderer output.
- Any change to pricing formulas, saved data, APIs, database behavior, roles, or permissions.
- Any change to browser-print or server-PDF layout/content.
- Any work listed as out of scope in `PRICING_TOOL_ENHANCEMENT_SPEC.md` §16.10.
