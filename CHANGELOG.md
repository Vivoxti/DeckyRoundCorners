# Changelog

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
