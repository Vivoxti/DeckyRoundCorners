# Round Corners — a Decky plugin

Four black corners give the Steam Deck screen a rounded look in Gaming Mode.
The radius goes from 0 up to a limit that depends on Steam's UI scale:
60 pixels at the Deck's default scale. The default is 24.
The Corner shape slider changes the curve while keeping the same corner size:
−100 is a flatter arc, 0 is a circle, +100 is closer to a rectangle with
smoothed corners (a squircle). The default is 0.
The effect is off after installation: turn it on in the Round Corners panel.

## Installing on Steam Deck

1. Copy `RoundCorners-1.0.0.zip` to the Deck, for example to Downloads.
2. In Gaming Mode, open Decky → Settings → General and turn on Developer mode.
3. Open Developer → Install Plugin from ZIP File and choose the archive.
4. Open Round Corners, turn on Enable rounded corners and adjust Corner radius.
5. Close the Decky menu and check the effect in a game.

Menu names depend on the Decky version and language. Install the release ZIP,
not a source code archive. To remove the plugin, uninstall it in Decky as usual.
The toggle is enough to turn the effect off; a radius of 0 also hides the
corners and releases the overlay request.

## Limitations

- Corners are drawn in Steam's main interface (the SP window): on the home
  screen and over games. Steam draws the side menu, the Quick Access Menu and
  web pages (the Store) as separate native views above SP, so they cover the
  corners. The on-screen keyboard, notifications and loading screens are drawn
  above them too.
- So that menus and the Store never cover part of a corner, the radius is
  limited by the height of the header and the footer hint bar. Each is 40 CSS
  pixels tall, so the limit is `floor(40 × scale)` physical pixels: 60 at scale
  1.5, 40 at 1, 80 at 2. The bar height was measured at scale 1.5. The saved
  value is not clamped: only rendering and the slider are limited, so the
  previous radius comes back when the scale does.
- The radius is in pixels of a 1280-pixel-wide screen and scales with the
  width of the Steam window. It applies to the edges of the whole screen,
  including black bars around games with a different aspect ratio. On an
  external display the radius scales too; there is no automatic switch-off
  when a display is connected.
- The plugin uses an internal Steam hook that may change in a Steam update.
  If the hook is not found, the panel shows a message and the effect stays off.
- HDR and sleep/wake have not been tested separately.

## How it works and what it costs

The plugin adds four small static images to the SP window. They all use one
mirrored texture with a transparent background. Its alpha channel is computed
from the area of each pixel covered by the chosen curve, and its size snaps to
whole physical pixels at the CEF scale. The texture is only recreated when its
size or shape changes; at radius 60 it takes 14 KiB uncompressed.

There is no per-frame JavaScript, game state polling, animation, network
access, Python backend or separate process. Touch and controller input pass
through the corners. Settings are stored locally in Steam's UI storage.

To keep the corners visible after menus close, the plugin requests Steam's
Notification composition mode. Steam manages the request's lifetime; its hook
releases the request when the effect is turned off or the plugin unloads.
Global composition settings are never changed directly.

Measured on a Deck by alternating periods with and without corners (three
3-minute periods each after a 5-minute warm-up): in a light game, whole-Deck
power, APU power, GPU load and clock, CPU load, Steam and Gamescope did not
change beyond the spread between identical periods (±0.06 W). In a heavy game,
FPS was the same with and without corners.

## Building

Requires Node.js with npm. No development tools are needed on the Deck.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

`npm test` builds the plugin first. The output is `out/RoundCorners-1.0.0.zip`.
The version comes from `package.json`.

## Checking on a Deck

The scripts connect to the Deck's CEF debugger (`http://DECK_IP:8081`,
requires Developer mode in Decky).

Antialiasing, with the effect turned on:

```sh
node scripts/check-corners.mjs http://DECK_IP:8081
node scripts/check-corners.mjs http://DECK_IP:8081 --shapes
```

A white background appears for a few seconds during the check. Settings are
not written, and temporary elements are removed at the end. Screenshots and
measurements are saved to `out/corner-qa/`.

Power measurement over SSH with key login (`deck@DECK_IP`), on battery:

```sh
node scripts/perf-run.mjs deck@DECK_IP
```

The script alternates periods without and with corners and tells you when to
switch the effect. Data is saved to `out/perf/`; to recompute the comparison,
run `node scripts/perf-compare.mjs out/perf/<folder>`.

See [CHANGELOG.md](CHANGELOG.md) for the version history.

## References

- [Decky template](https://github.com/SteamDeckHomebrew/decky-plugin-template):
  the official plugin build format and API.
- [Decky PluginWrapper](https://github.com/SteamDeckHomebrew/decky-loader/blob/main/backend/decky_loader/plugin/plugin.py):
  plugins without `main.py` are supported as passive and start no backend process.
- [MagicBlack](https://github.com/steam3d/MagicBlackDecky): shows the Steam UI
  approach to a black overlay with Notification composition and input
  pass-through. This plugin has its own implementation of the corners and
  settings; no MagicBlack source is included.
- [Decky: installing from ZIP](https://github.com/SteamDeckHomebrew/decky-loader/issues/399).
