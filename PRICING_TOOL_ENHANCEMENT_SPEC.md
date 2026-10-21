# TWiNS Pricing Tool Enhancement Spec

**File:** `PRICING_TOOL_ENHANCEMENT_SPEC.md`
**Status:** Approved product direction — implement incrementally
**Scope:** Legacy pricing tool UI + tightly related persistence/printing/catalog behavior
**Principle:** No large rewrite. Implement in small, independently reviewable slices.

---

## 1. Goal

Improve the current TWiNS pricing tool so it is easier to use, more flexible for managers, and safer to extend without changing unrelated business behavior.

The work should preserve the current pricing workflow and existing visual identity while improving:

- use of page width;
- quote-summary layout;
- field/column sizing;
- text wrapping and readability;
- item ordering;
- quote printing;
- margin persistence;
- saving manually entered items into the price list.

---

# 2. Locked Product Decisions

The following decisions are approved and should be treated as the product target unless explicitly changed later.

---

## 2.1 Pricing tool uses the full page width

The pricing workspace containing:

- sections;
- rooms/categories where applicable;
- item rows;
- item fields;
- images;
- pricing fields;

must use the available page width instead of losing a large side area to the quote summary.

### Acceptance

- The pricing table/workspace spans the available width of the page.
- The quote summary is no longer a permanent vertical sidebar beside the pricing table.
- Existing section/room/category behavior must remain intact.

---

## 2.2 Quote summary moves below the pricing tool

`ملخص العرض` becomes a wide horizontal section below the pricing tool.

It must not be a flat row where every single value is a separate column.

Related information must be grouped vertically inside clear blocks/cards, then the layout moves to the next group.

### Approved grouping direction

#### A. Section totals
Examples:

- section A total;
- section B total;
- additional section totals;
- overall sections total.

#### B. Totals / discount / taxes
Examples:

- items subtotal;
- discount value / percentage;
- subtotal after discount;
- tax;
- total after tax if applicable.

#### C. Cost and profit
Examples:

- estimated cost;
- profit margin;
- profit amount.

#### D. Payment terms
Keep the current payment-term rows grouped together.

#### E. Duration and validity

- execution duration;
- quote validity.

#### F. Price exclusions

Keep the existing `استثناءات الأسعار` content available in the summary area.

#### G. Quote actions

Existing quote actions remain grouped together, including the relevant current actions such as:

- save quote;
- printing;
- save template;
- load template.

The PDF action is handled separately in the printing section below.

#### H. Team quotes

Keep the existing `كل عروض الفريق` area in the horizontal summary, grouped as one block.

#### I. Final total

The final quote total remains visually prominent.

---

# 3. Field / Column Size Settings

## 3.1 Entry point

Field-size settings are **NOT** in the user profile.

Approved entry point:

> A settings icon / gear button in a corner of the pricing tool.

Clicking it opens `إعدادات الحقول`.

---

## 3.2 What the user can control

The user can manually adjust both:

- **width**
- **height**

for relevant pricing fields/columns.

At minimum support:

- item name (`البند`);
- description (`الوصف`);
- image (`الصورة`);
- unit (`الوحدة`);
- quantity (`الكمية`);
- sale price (`سعر البيع`);
- total (`الإجمالي`);
- notes (`الملاحظات`).

If additional visible columns are later included, they should follow the same mechanism instead of creating a separate sizing system.

---

## 3.3 Settings UI

The settings panel should provide clear controls for each supported field, for example:

- numeric width value;
- numeric height value;
- slider or equivalent control;
- reset to default;
- save/apply settings.

The exact control implementation may follow the existing TWiNS UI style.

---

## 3.4 Text behavior inside resized fields

Text must **never disappear simply because a field is narrow**.

Approved behavior:

- no silent clipping of meaningful content;
- no hiding the rest of the text behind ellipsis as the primary behavior;
- text wraps to additional lines when required;
- row/cell height grows enough to display the content;
- text remains visually centered inside the field/cell where appropriate.

Examples that must wrap correctly:

- long item names;
- long descriptions;
- long notes;
- units or textual values that exceed the available width.

---

## 3.5 Image field behavior

The image cell participates in the same sizing system.

When the image field/row height is increased:

- the thumbnail should become visibly larger within its cell;
- the image remains contained;
- it should not overlap neighboring fields;
- aspect ratio should be preserved;
- the row height should support both the image and wrapped text cleanly.

---

## 3.6 Persistence requirement

Field-size settings must not be merely temporary DOM changes.

They should persist after normal page rerender/reload.

**Technical persistence mechanism is intentionally left to the implementation plan** so the team can choose the smallest safe approach compatible with the current legacy architecture.

The UI entry point remains the pricing-tool settings icon regardless of the persistence mechanism.

---

# 4. Item Reordering

## 4.1 User behavior

Each item row gets a clear drag/reorder handle.

The user can move items:

- up;
- down;
- to another position within the same applicable ordering scope.

The interaction should be direct and understandable.

---

## 4.2 Reordering is real and persistent

Reordering is not only visual.

After reorder:

- the new order must be stored;
- refresh/reopen must preserve it;
- printing must use the stored order;
- any other view that depends on quote-item order must use the stored order.

---

## 4.3 Quote item code changes with ordering

Quote item codes such as:

- `A1.1`
- `A1.2`
- `A1.3`

are **ordering codes**, not catalog IDs.

When items are reordered, these codes must be recalculated to reflect the new order.

Example:

Before:

1. Item X → `A1.1`
2. Item Y → `A1.2`
3. Item Z → `A1.3`

After moving Z to the top:

1. Item Z → `A1.1`
2. Item X → `A1.2`
3. Item Y → `A1.3`

The stored order and displayed ordering code must stay consistent.

---

# 5. Catalog Code vs Quote Ordering Code

There are two distinct code concepts and they must not be mixed.

## 5.1 Price-list / catalog code

Example:

`WOD-001`

This is the item's stable code inside the price list/catalog.

It identifies the catalog item itself.

---

## 5.2 Quote ordering code

Example:

`A1.1`

This exists only to represent the item's position/order inside the quote/section.

It may change when the user reorders quote items.

---

## 5.3 Rule

- Catalog code is stable catalog identity.
- Quote code is quote ordering identity.
- Saving a manual quote item to the catalog must never treat `A1.1` as the permanent catalog code.

If a catalog code is required for the newly saved catalog item, it must use the catalog-code rules, not the quote-order code.

---

# 6. Manual Items and “Save to Price List”

## 6.1 Visibility rule

The action:

`حفظ في قائمة الأسعار`

appears **only** for an item that is not already in the price list.

For an item that already came from / is linked to the price list:

- do not show the save-to-price-list action as an active save action;
- do not allow accidental duplicate catalog creation.

---

## 6.2 Manual item visual appearance

A manual item should look like a normal item row.

Do **not**:

- show `(يدوي)` beside the item name;
- color the item name yellow merely because it is manual;
- visually separate it from normal items in a distracting way.

The save-to-price-list action is enough to indicate that it is not yet in the catalog.

---

## 6.3 Save-to-price-list flow

After the user manually enters an item in the pricing tool, they may press:

`حفظ في قائمة الأسعار`

This opens a modal using the **same design language and field structure already used by the current price-list “Add Item” modal**, rather than inventing a new unrelated form.

---

## 6.4 Modal content

The modal should be prefilled with the information already entered in the quote item.

At minimum:

- specialty (`التخصص`);
- section (`القسم`);
- catalog item code if applicable (`كود البند`);
- item name (`اسم البند`);
- description (`الوصف`);
- unit (`الوحدة`);
- base cost (`التكلفة الأساسية`);
- profit margin (`هامش الربح (%)`);
- calculated sale price display.

### Prefill rule

Values already entered on the quote item should appear automatically.

The user can review/edit the appropriate fields before saving.

---

## 6.5 Specialty and section selection

The user must choose where the new catalog item belongs.

Hierarchy:

`التخصص` → `القسم` → `البند`

The item cannot be saved outside a section.

The flow should allow:

- choosing an existing specialty;
- choosing an existing section inside that specialty;
- creating a new specialty if needed;
- creating a new section within the selected/new specialty if needed.

The exact creation UX should reuse current price-list patterns where practical.

---

## 6.6 Duplicate prevention

Before catalog creation, the system should check for an existing identical or clearly matching catalog item using the existing catalog identity rules available in the system.

The goal is to reduce accidental duplicate catalog items.

Do not automatically mutate an existing catalog item unless the user explicitly chooses such an action.

---

## 6.7 Quote item vs catalog item independence

After a quote item is saved to the price list:

- the quote item remains the quote snapshot;
- later quote-specific edits do not silently rewrite the catalog item;
- catalog editing remains an explicit price-list action.

---

# 7. Printing

## 7.1 PDF button

Hide the existing visible PDF button temporarily.

Do not remove PDF infrastructure unless a later technical task explicitly requires it.

---

## 7.2 Approved names

Use:

- `طباعة العرض`
- `طباعة داخلية`

---

## 7.3 Reuse the existing print system

Do **not** create a new print design/system for internal printing.

The second print action must reuse:

- the existing print layout;
- the existing print styling;
- the existing print behavior/components as much as technically possible.

The difference is the information that is included/excluded.

---

## 7.4 Customer print — `طباعة العرض`

This is the customer-facing print.

It must exclude internal information the customer should not see, including the relevant current internal values such as:

- profit margin;
- profit amount;
- internal cost information;
- canceled/hidden/internal-only items or fields that are intentionally excluded from customer output.

Existing customer-facing print styling remains the reference.

---

## 7.5 Internal print — `طباعة داخلية`

This is for manager/owner review.

Use the same print design but include the internal information needed by management, such as:

- internal costs;
- profit margin;
- profit amount;
- internal/canceled/hidden information that management needs for review.

No separate visual language is required.

---

# 8. Profit Margin Behavior

## 8.1 Default

Default profit margin for a new applicable item:

`35%`

This is a starting/default value only.

---

## 8.2 User changes

If the user changes the margin:

- calculations update using the changed margin;
- sale price updates according to existing pricing rules;
- the changed margin becomes the actual saved value for that quote item.

---

## 8.3 Persistence bug to fix

The current incorrect behavior:

1. user changes margin;
2. price recalculates;
3. quote is saved;
4. UI later shows `35%` again;
5. price remains based on the changed margin.

This is not acceptable.

Approved behavior:

- saved margin value remains visible after save/reload;
- displayed margin and saved price must remain logically consistent;
- `35%` returns only as the default for a new item that has not been given another saved margin.

---

# 9. Existing Quote Summary Capabilities to Preserve

Moving the summary below the pricing tool must not accidentally remove existing capabilities.

Preserve/reposition the relevant current controls and content, including where currently applicable:

- payment terms;
- execution duration;
- quote validity;
- price exclusions;
- save quote;
- print;
- save template;
- load template;
- team quote list;
- totals and financial summary.

The new layout is a reorganization, not a deletion of these capabilities.

---

# 10. UI/UX Rules

## 10.1 RTL

Arabic remains RTL throughout the pricing tool and new settings/modal flows.

## 10.2 Visual consistency

Reuse the current TWiNS:

- colors;
- border radius;
- spacing;
- buttons;
- modal design;
- typography;
- input styling.

Do not introduce a second design system.

## 10.3 Responsive safety

The full-width layout should remain usable on supported desktop sizes.

If the combined user-selected column widths exceed available width, the implementation plan must choose a predictable overflow behavior instead of crushing or hiding content.

## 10.4 No hidden text

Meaningful item data must remain discoverable/visible through wrapping and field sizing, not silent truncation.

---

# 11. Implementation Strategy

Do **not** implement all requirements in one large patch.

The approved strategy is incremental delivery.

This is safer for the current legacy architecture and lets each slice be independently reviewed and deployed.

---

## Slice 0 — Technical reconnaissance and baseline

Before feature changes:

- inspect current pricing table rendering;
- inspect quote-summary rendering;
- inspect item persistence model;
- inspect item code generation;
- inspect catalog linkage;
- inspect current print pipeline;
- identify existing tests;
- record current production behavior.

No redesign in this slice.

---

## Slice 1 — Full-width pricing layout + horizontal summary

UI-first slice:

- pricing workspace full width;
- quote summary moved below;
- group summary content correctly;
- preserve all current summary capabilities;
- no reorder/persistence/printing logic changes yet.

### Gate

Desktop RTL/LTR layout and regression verification.

---

## Slice 2 — Field width/height settings + wrapping

Implement:

- pricing-tool gear icon;
- settings panel;
- width adjustment;
- height adjustment;
- image cell sizing;
- centered content;
- multiline wrapping;
- persistence of user settings.

### Gate

Verify:

- narrow/wide columns;
- short/tall rows;
- long item name;
- long description;
- long notes;
- image row;
- reload persistence.

---

## Slice 3 — Persistent item reorder + ordering codes

Implement:

- drag handle;
- reorder interaction;
- persistent order;
- quote-code regeneration (`A1.1`, etc.);
- print/order consumers use the saved order.

### Gate

Verify:

- move up;
- move down;
- reload;
- save/reopen;
- code changes correctly;
- catalog code remains unchanged.

---

## Slice 4 — Printing modes

Implement:

- hide PDF UI button;
- rename normal action to `طباعة العرض`;
- add `طباعة داخلية`;
- reuse existing print pipeline/style;
- customer/internal field visibility rules.

### Gate

Compare both print modes against the same quote.

---

## Slice 5 — Margin persistence

Implement/fix:

- default 35%;
- changed margin persists;
- calculation and displayed value remain consistent after save/reload.

### Gate

Test multiple custom margins and quote reload.

---

## Slice 6 — Save manual item to price list

Implement:

- action appears only for non-catalog items;
- existing Add Item modal design reused;
- prefilled quote item data;
- specialty selection;
- section selection;
- optional creation of specialty/section;
- catalog-code handling independent from quote-order code;
- duplicate protection;
- save catalog linkage/state.

### Gate

Verify:

- existing specialty + existing section;
- new specialty;
- new section;
- manual item save;
- already-catalog item has no active save action;
- quote code does not become catalog code;
- later quote edits do not mutate catalog automatically.

---

## Slice 7 — Final integration / acceptance

Perform a cross-feature review:

- layout;
- field settings;
- wrapping;
- images;
- reordering;
- quote codes;
- catalog codes;
- printing;
- margin persistence;
- manual-item catalog save;
- quote summary.

Run canonical regression and browser acceptance.

---

# 12. Non-Goals

Unless a later approved task requires them, this work does not authorize:

- full rewrite of the legacy app;
- unrelated backend refactors;
- redesign of all dashboard pages;
- replacing the current pricing engine;
- replacing the entire print engine;
- automatic saving of every manual item to the catalog;
- automatic catalog updates when quote items are edited.

---

# 13. Important Technical Rule

Where the requested behavior is UI-only, keep the implementation UI-only.

Where persistence is required — for example:

- field sizing;
- item order;
- quote codes;
- margin values;
- catalog save;

use the smallest correct persistence change needed.

Do not hide persistence problems behind temporary DOM-only behavior.

---

# 14. Acceptance Summary

The feature set is complete only when all of the following are true:

- [ ] Pricing workspace uses full available width.
- [ ] Quote summary is below the pricing tool.
- [ ] Summary information is grouped logically.
- [ ] Settings gear exists in the pricing-tool corner.
- [ ] User can change field width.
- [ ] User can change field height.
- [ ] Image field visibly responds to sizing.
- [ ] Text wraps instead of disappearing.
- [ ] Text remains visually centered as intended.
- [ ] Item reorder is drag-and-drop.
- [ ] Reorder persists.
- [ ] Quote-order codes update after reorder.
- [ ] Catalog codes remain independent.
- [ ] PDF button is hidden from the UI.
- [ ] `طباعة العرض` uses customer-safe content.
- [ ] `طباعة داخلية` uses the same print design with management data included.
- [ ] New-item default margin is 35%.
- [ ] Changed margin persists after save/reload.
- [ ] `حفظ في قائمة الأسعار` appears only for non-catalog items.
- [ ] Save-to-price-list modal reuses the current add-item design.
- [ ] Existing quote item data is prefilled.
- [ ] Specialty is selectable/creatable.
- [ ] Section is selectable/creatable.
- [ ] Catalog item is saved inside a section.
- [ ] Quote ordering code is not used as catalog code.
- [ ] Existing catalog items are protected from accidental duplicate creation.
- [ ] Existing summary capabilities remain available.

---

# 15. Recommended Workflow

For every slice:

1. Read this spec and current source.
2. Confirm current production behavior from source/runtime.
3. Create the smallest technical plan for the slice.
4. Implement only that slice.
5. Run focused verification.
6. Run regression checks.
7. Perform independent Codex review.
8. Fix only approved blockers.
9. Commit the reviewed slice.
10. Integrate onto current production `main`.
11. Verify production deployment.
12. Move to the next slice.

This document is the product source of truth for the approved pricing-tool enhancement direction.


---

# 16. Consolidated Product Updates — 2026-10-19

This section records later user decisions and supersedes earlier conflicting wording only where explicitly stated. These requirements are queued, not implementation or acceptance evidence. Finish the current Slice 2 repair/review before starting the next bounded task. Do not mix these requests into an active repair.

## 16.1 Legacy investment boundary — approved

The currently deployed legacy application is temporary while a separately developed replacement is in progress. Make the smallest correct changes needed for stability and approved behavior. No framework migration, broad refactor, speculative abstraction, or architecture modernization is authorized here. Verification remains proportionate to actual risk.

## 16.2 Unified settings with individual overrides — approved

- Primary settings contain two numeric controls: unified width and unified minimum height. They are independent; one number does not set both dimensions.
- Move the existing per-field controls under a collapsible `إعدادات إضافية` area.
- Effective preference for each dimension is individual override, then unified value, then default.
- Editing one field affects only that field; other fields retain the unified preference.
- Clearing an override restores inheritance. Changing a unified value updates inheriting fields without erasing explicit overrides.
- Retain apply/cancel/reset and persistence. Preserve existing valid saved preferences when evolving the settings representation.
- Exact width units/fit behavior are subject to §16.7 (APPROVED for later planning; outside this slice; NOT implemented here); do not silently reinterpret existing saved pixel values.

## 16.3 Equal row heights and centered content — approved

- If any item requires more height because of content or an image, all item rows across the quote use a common height sufficient for the tallest item, not merely equal cells within that one row.
- Respect content, unified minimum, and field-specific minimums. A smaller field minimum cannot force clipping or make its row shorter than the common row height.
- Column widths remain consistent across item rows; different columns may retain individual width overrides.
- Center content horizontally and vertically. Multiline text is centered as a whole block, expanding above/below its center; do not leave a fixed empty area above wrapped text.
- Preserve editing, caret behavior, keyboard interactions, and full text visibility.
- Recompute from natural content after edits, removals, width changes, images, and viewport changes; allow heights to shrink when content needs less space. Do not create cumulative measurement growth.
- Include quote items hidden by editor room/category filters when determining the quote-wide requirement; avoid changing quote data solely to store measured geometry.

## 16.4 Printing geometry — approved goal, implementation plan required

- Apply the equal-row-height and centered-text goals to the existing browser print design, keeping consistent column widths across printed item rows.
- Measure print content at printable page width; do not copy screen pixel heights blindly into print.
- Preserve all content and existing customer-data visibility rules. Do not create a second print design or implement the later internal/customer mode slice prematurely.
- The plan must address oversized rows and pagination without clipping. Browser printing and the separate server PDF pipeline are distinct: identify scope explicitly and do not claim PDF parity without evidence.

## 16.5 Header alignment and settings location — approved

- Align the outer left/right edges and available widths of the top bar, quote/project header, and pricing container, preserving normal page gutters.
- Distribute reference number, client name, project location, and project name across the full header container width; wrap responsively when required.
- Place the settings gear inside a top corner of the pricing container, not in a separate external row.
- Keep section tabs and `+ قسم جديد` directly above the pricing container without an intervening settings toolbar.
- Preserve settings access when no section exists, using an appropriate empty-state position inside the pricing workspace. Avoid duplicate IDs/bindings during rerenders.
- Verify actual selectors in source; user-suggested names such as topbar, project-header, section-panel, and sections-nav are locators to confirm, not proof of structure.

## 16.6 Quote ordering-code presentation — approved

- Ordering code such as `A1.1` has a stable readable font size and compact dedicated column, independent of unified/per-field content sizing and row growth.
- It must not scale with enlarged item fields. Center it in the shared row height.
- Keep the complete code visible, including longer valid codes. Stable typography does not mean freezing its value: reordering may still change the code as specified in §4.
- Do not change code generation, catalog identity, or reorder behavior in a presentation-only task.

## 16.7 Screen-fit width without horizontal scrolling — APPROVED for later planning; outside this slice; NOT implemented in this update

User goal: maximum table width fits the available screen/container, with no horizontal scrolling. The current requirement for exact independent pixel widths can conflict with this goal when column widths exceed available space.

Approved direction for later planning (outside this slice and not implemented here):
- Fit the table to its container; treat requested widths as relative preferences/weights rather than unlimited fixed pixels.
- Reserve compact space for ordering code and essential controls; distribute remaining space among content columns while preserving readable numeric controls.
- Wrap textual content and grow row height; never reduce font size or hide values to force a fit.
- On viewports too narrow for readable numeric/control minima, use a simple stacked item presentation instead of clipping or horizontal scrolling.
- Explain effective sizing honestly; do not promise exact pixels and screen-fit simultaneously.
- Preserve/migrate existing pixel preferences explicitly when the later implementation is planned.

Do not implement this approved direction within the current slice. A later planning/implementation task must update §§3.2–3.3 and §10.3 so there is one coherent width contract.

## 16.8 Acceptance additions for the queued task

- [ ] Unified width and minimum-height controls, with additional per-field overrides.
- [ ] Inheritance, reset, cancel, and saved-preference compatibility verified.
- [ ] Quote-wide equal item-row heights and centered multiline text.
- [ ] Stable ordering-code typography independent of sizing settings.
- [ ] Header/container alignment and full-width header fields.
- [ ] Settings inside pricing container; section navigation directly above.
- [ ] Print geometry/pagination verified using existing print design.
- [x] Screen-fit direction approved for later planning; implementation remains outside this slice.

Unchanged feature requirements remain in force. This update does not mark any queued item implemented, reviewed, committed, or deployed.


## 16.9 Quote management cards below final total — approved

This decision supersedes §2.2.H and the earlier placement of team/saved quotes inside the financial-summary grid.

- Move `إدارة العروض` into its own full-width section BELOW the final total, outside the financial-summary grid. Adding or expanding saved quotes must not push the final total or financial/action blocks downward.
- Preserve the existing role-dependent team/personal quote heading, authorized list, ordering, and current open/delete actions. No new data or actions are introduced.
- Render each quote as a bordered card showing its existing name, owner where currently applicable, date, amount, and open/delete controls.
- Cards have consistent responsive widths and content-driven heights; they need not be literal squares. Lay them out horizontally and wrap to another row without horizontal scrolling.
- Initially show at most TWO complete rows of cards, based on the actual number of columns at the current viewport width.
- When additional cards exist, show `عرض المزيد`; expanding reveals the remaining cards below the total and changes the control to `عرض أقل`. Collapsing restores two rows.
- If all cards fit within two rows, omit the expansion control. Preserve a suitable empty state.
- Hidden cards and their actions must not remain keyboard-focusable. Use accessible expanded-state semantics on the toggle and preserve sensible focus when collapsing.
- Recalculate the collapsed card count on responsive column changes; do not hard-code a desktop-only item count or clip cards halfway using a fixed height.
- Preserve existing open/delete bindings and refresh behavior after save/delete. Retain expansion state sensibly during updates; do not alter quote persistence or authorization.

Acceptance additions:
- [ ] Quote management is below the final total and outside its grid.
- [ ] Bordered cards wrap responsively with existing data/actions preserved.
- [ ] Collapsed state shows at most two complete rows at each tested width.
- [ ] Show more / Show less appears only when needed and works by keyboard.
- [ ] Expanding many quotes leaves the final total above the list.
- [ ] Empty, short, and long lists plus save/open/delete refresh are verified.

Status: approved queued product work; not implemented or verified by this document update. The §16.7 screen-fit width policy is APPROVED for later planning and is NOT implemented in this update; current behavior is unchanged here.
