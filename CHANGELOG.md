# Changelog

## Unreleased

- Builds with pnpm, like the Decky plugin store: `pnpm-lock.yaml` replaces
  `package-lock.json` with the same dependency versions. `pnpm test` builds
  before testing without relying on a `pretest` script.
- `plugin.json` points the store to a 1280×800 image, `assets/splash.png`.

## 1.1.0

- 16:9 game toggle, saved per game. While a 16:9-only game is on screen, the
  corners move to its picture's edges, 40 pixels from the top and bottom on the
  Deck. They return to the screen corners in the frame Steam's menus, Quick
  Access or the library open, following Steam's composition state and focus
  without polling.
- Steam behaves as it does without the plugin. Steam's own interface already
  shows the corners, so Notification composition is requested only while a
  game is on screen with nothing over it, and only 0.4 s after Steam's
  interface has hidden. Holding it all the time, as before, caused two
  differences from stock Steam:
  - closing Quick Access flashed a black screen with an "Abort game" footer
    for up to a second;
  - side menus slid away instead of vanishing.
- Corners fade in and out over 0.4 s: when turned on or off, and when they
  return over a game after a menu closes. The fade is a CSS opacity
  transition that runs only during those changes.
- The top-left corner fades out while Steam's volume popin is shown, so the
  popin is no longer cut off under it. It fades over 0.22 s, as fast as the
  popin slides in, and returns over 0.4 s. A MutationObserver watches the
  class of the popin's single element.
- The composition request is named "Round Corners" in Steam's composition log.
- After a reload or update, Decky can keep showing the old instance's panel
  while it stays open in Quick Access. That panel now asks you to reopen
  Round Corners instead of changing settings the new instance doesn't see.

## 1.0.0

First release. Changes since 0.4.0:

- Removed the "Experimental" label and the debug status line from the panel;
  a message appears only on a compatibility or saving error.
- The source map `dist/index.js.map` now ships in the archive: the Decky build
  always references it from `index.js`.
- Removed one-off debugging scripts from earlier versions; `check-corners.mjs`
  checks only the current renderer.
- Power and load measured on a Deck: in a light game the difference with and
  without corners is within measurement noise (±0.06 W); in a heavy game FPS
  did not change.

## 0.4.0

Removed corners over menus and the Store: tracking Steam's native views,
finding menus in the React tree, and the separate corner views. After three
rounds of flicker fixes (0.3.2–0.3.4), corners stay only in Steam's main
interface and in games, and the radius is limited by the height of the header
and footer: `floor(40 × scale)` physical pixels, 60 at the Deck's scale of 1.5.
The limit comes from measurements on a Deck: the Store and QAM start 40 CSS
pixels from the top edge and end no closer than 40 from the bottom. The saved
value is not clamped, so the previous radius comes back with the scale.

## 0.3.4

Corner views over menus and the Store always cover the whole corner and never
change size: when they were resized, Steam could show an in-between frame with
a shifted image.

## 0.3.3

Corners over menus follow the MainMenu and QuickAccess animation: Steam moves
their native views with `SetBounds` calls every frame. Corners are raised
synchronously inside Steam's call, with no flicker in the first frame.

## 0.3.2

Corners on web page tabs (the Store): a small transparent Steam popup view is
created for the covered part of the corner.

## 0.3.1

Less unnecessary work: menu masks are not recreated when focus moves,
listeners of closed contexts are removed, settings are saved 400 ms after the
last change and immediately on unload. The version comes from `package.json`
at build time.

## 0.3.0

Masks over MainMenu and QuickAccess.

## 0.2.1

Fixed the icon size in the Decky plugin list.

## 0.2.0

Corner shape setting from −100 to +100: a superellipse with an exponent from
1.25 to 8; 0 keeps the original circle. Coverage of edge pixels is computed by
numerical integration.

## 0.1.2

Independent SVGs replaced by one mirrored texture with analytic pixel coverage.
On a Deck all four corners matched byte for byte; with SVGs, edge pixels
differed by up to 64 of 255.

## 0.1.1

The overlay is drawn in the visible GamepadUI window (`findSP()`) instead of
the document where the plugin's JavaScript runs.

## 0.1.0

First version: four black corners with an adjustable radius.
