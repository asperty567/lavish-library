# Lavish Library design contract

## 1. Atmosphere & Identity
Andy approved the dark editorial report example on 4 October 2026. Carry that
direction through the Library: charcoal surfaces, warm light text, muted rose
accents, serif headings and quiet layered cards. Preserve Library functionality.
Reference: `lavish-report-design-example.html`, dark desktop/phone captures in
`/Users/admin/.omo/evidence/lavish-example/`.

## 2. Color
Shared approved tokens: canvas `#101114`, paper/card `#1a1b20`, ink `#ede8e0`,
muted `#b4acaa`, line `#3b353b`, rose/wine `#e5a0b1`, tinted summary `#30232b`,
soft `#22232a`, elevated `#202127`. Primary rose buttons use dark text
`#201217`, not white text; hover darkens the rose without losing contrast.
Secondary labels must remain readable, including metadata, statuses and counts.
Errors use readable text in their action context.
In `app/globals.css` these are `--canvas`, `--paper`, `--ink`, `--muted`, `--line`,
`--wine`, `--tint`, `--soft`, `--elevated` and `--on-wine` (`#201217`); `--wine-dark`
(`#d58aa0`) is the hover rose, `--ghost` (`#a39b9d`) the quietest readable text and
`--live` (`#e5a0b1`) retains the open/protected state token using the approved rose. Page and drawer backgrounds
use canvas; cards, previews and inputs use paper; summaries, notices, selected and
active states use tint; tables, chips and inline groups use soft or elevated.
Feedback status uses rose, not orange. Orange stays reserved for questions.

## 3. Typography
Existing titles use Newsreader/Georgia; body and controls use Geist/system sans.
Confirmation body and buttons use a 14px size and 1.5 line height. No new fonts.

## 4. Spacing & Layout
The existing shell uses a 244px sidebar and document scrolling; cards use a
three-column grid, two below 1080px, one below 760px.
New confirmation tokens: gap 8px, padding 16px, radius 9px, control height 44px.
The panel stays inside its card, or immediately after the bulk toolbar.
Buttons wrap with readable labels rather than overrunning their container.
Phone navigation uses two compact rows with all destinations available. Card
headings align left beside their checkboxes. Preview actions sit in the lower
corner instead of covering the preview with a full overlay.

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
Changing bulk selection invalidates its pending confirmation. Selection is
disabled while a confirmed request is in flight. If ending succeeds but moving
fails, retain the file's card and local error across a status-filter refresh;
show its true ended status, and keep the confirmation available for retry.

## 7. Depth & Surface
Surfaces are tonal: canvas, then paper cards, with warm `--line` borders and
black-based shadows only (no tinted light shadows). The topic evidence panel is a
tint card, not a solid rose block. Overlays use canvas at reduced opacity.
Confirmation uses overlay background and no accent edge; primary action is solid.

## 8. Accessibility Constraints & Accepted Debt
New controls are keyboard accessible, have visible focus (2px rose outline, all
buttons, links, inputs and selects), and 44px minimum height. Solid rose
actions use dark text. Reduced-motion removes card and drawer animation.
Errors remain in their action context and do not depend on colour.
Card metadata, status and history chips now use 10-12px text in muted colour.
Review status/date, history actions and source badges use 11px text. Some secondary
insights micro-labels remain small; no dev-tool dependency installation is included.
