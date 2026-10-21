# Research: Quote Summary Layout

**Date**: 2026-10-21

## Decision 1: Explicit row wrappers

**Decision**: Group the seven existing summary cards into three row wrappers, leaving the final-total section after them and quote management as the following sibling.

**Rationale**: The current auto-fit grid cannot guarantee the approved 3/2/2 membership across desktop widths. Wrappers make row membership and narrow stacking explicit while preserving every existing node.

**Alternatives considered**: Per-card grid coordinates or `nth-child` placement were rejected because they couple layout to child positions and make direction/responsive behavior harder to review.

## Decision 2: DOM order follows logical inline order

**Decision**: Order each row from inline start to inline end and inherit document direction.

**Rationale**: In RTL this yields the approved right-to-left sequence; in LTR it yields a usable mirrored sequence. The DOM and Tab sequence remain aligned.

**Alternatives considered**: CSS `order`, hard-coded left/right placement, or script-based reordering were rejected because they risk visual/keyboard divergence or duplicate behavior.

## Decision 3: Reuse the existing responsive boundary and visual system

**Decision**: Use three equal fluid tracks for Row 1 and two equal fluid tracks for Rows 2/3, then stack at the existing 860px boundary, subject to focused browser evidence. Translate the reference card hierarchy through current theme variables.

**Rationale**: The inspected 1672×941 reference shows near-equal tracks in all three rows, complete bordered/rounded surface cards, consistent gutters, and a full-width gold final bar. Fluid equal shares reproduce those proportions without freezing the reference's pixel dimensions.

**Alternatives considered**: Asymmetric tracks are contradicted by the reference. New container-query infrastructure, fixed image pixels/heights, hard-coded light colors, or a new design system were rejected as unnecessary scope expansion.

## Decision 4: No behavioral or print code changes

**Decision**: Restrict implementation to screen markup/CSS in `public/app.html`.

**Rationale**: All existing render and action code resolves controls by stable IDs, and browser printing uses a separate body-level template. The approved change needs no formula, state, event, API, or server-PDF edit.

**Alternatives considered**: Re-rendering the summary through JavaScript or modifying print/PDF output were rejected because they add risk and contradict scope.

## Decision 5: Focused verification instead of broad API regression

**Decision**: Use geometry, reference comparison, direction, long-content, real keyboard, synthetic card-placement, and print-isolation checks without application data. Protect calculations, handlers, autosave, confirmation, and print/PDF code by source comparison. Do not repeat the broad Node API suite unless implementation crosses into behavior.

**Rationale**: Existing tests do not exercise this static layout; browser evidence is the direct proof. This also avoids reopening the completed Feature 002 review battery.

**Alternatives considered**: Re-running all API tests by default was rejected as low-signal for a markup/CSS-only patch.

## Decision 6: Adopt visual decoration without adopting new output

**Decision**: Adopt the reference's complete card shells, stronger headings, compact structured current rows, two inset cost/profit tiles, paired duration fields, action-button hierarchy, gold emphasis, and decorative line-icon treatment. Icons must be dependency-free inline SVG, `aria-hidden`, non-focusable, and attached only to existing labelled elements.

**Rationale**: These are presentation details within the approved styling boundary and require no new behavior. The current top-divider-only card treatment materially misses the approved hierarchy.

**Alternatives considered**: Keeping current card styling would ignore the now-available approved image. Platform emoji were rejected because their rendering is inconsistent and would not match the reference's line-icon language.

## Decision 7: Reject reference-only copy and renderer output

**Decision**: Do not add the reference subtitle, section table header/aggregate, duplicate after-tax total inside the totals card, or payment headers/sequence numbers.

**Rationale**: These elements do not exist in current source. Adding them would introduce copy, duplicate/new metrics, or changes to `renderTotals()`/`renderPaymentTerms()`, conflicting with the accepted presentation-only boundary.

**Alternatives considered**: Treating the image as authority to add data was rejected because the product instruction explicitly preserves current controls, metrics, calculations, and handlers.

## Unresolved Items

None. The visual-reference blocker is resolved. The inspected image confirms the proportional tracks and visual treatment; all observed reference/source mismatches have an explicit preserve-or-exclude decision above.
