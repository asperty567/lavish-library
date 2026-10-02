# Lavish Library design contract

## 1. Atmosphere & Identity
Preserve the Library's existing warm dark canvas, rose actions, serif card
titles, and layered review cards. This is a targeted Trash repair, not a redesign.

## 2. Color
Existing `globals.css` tokens: ink `#f2ece7`, muted `#aaa09d`, line `#393237`,
paper `#171519`, wine `#b66071`, wine-dark `#8f4054`. Confirmation uses the
existing overlay token `#1e1f24`; primary buttons use ink on wine-dark for contrast.
Errors use ink, not a coloured border.

## 3. Typography
Existing titles use Newsreader/Georgia; body and controls use Geist/system sans.
Confirmation body and buttons use a 14px size and 1.5 line height. No new fonts.

## 4. Spacing & Layout
The existing shell uses a 244px sidebar and document scrolling; cards use a
three-column grid, two below 1080px, one below 760px.
New confirmation tokens: gap 8px, padding 16px, radius 9px, control height 44px.
The panel stays inside its card, or immediately after the bulk toolbar.
Buttons wrap with readable labels rather than overrunning their container.

## 5. Components
Existing primitives: Icon, artifact card, status, history chip, toolbar button.
Shared TrashConfirmation: group containing the question, preservation note,
primary confirm, quiet Cancel, and local error. States: pending, working, error.
Cancel receives initial focus; Escape cancels; dismissal returns focus to Trash.
During requests both buttons are disabled and the primary label reports progress.
Errors use `role=alert` next to the originating Trash button or confirm button.

## 6. Motion & Interaction
No new animation. Confirmation is explicit, never ends reviews on first click.
Cancel performs no API mutation. Existing card transitions remain unchanged.
The user sees failure in place and success as the card leaving the Library.

## 7. Depth & Surface
Preserve existing mixed tonal surfaces, neutral borders and card shadows.
Confirmation uses overlay background and no accent edge; primary action is solid.

## 8. Accessibility Constraints & Accepted Debt
New controls are keyboard accessible, have visible focus, and 44px minimum height.
Errors remain in their action context and do not depend on colour.
Existing tiny card metadata, glyph icons, and legacy colour overrides are outside
this repair; no broad redesign or dev-tool dependency installation is included.
