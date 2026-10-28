# Round Corners - a Decky plugin

Rounds the corners of the Steam Deck screen in Gaming Mode, with adjustable
corner size and curvature.

## Installing on Steam Deck

1. Download the ZIP from the [latest release](https://github.com/Vivoxti/DeckyRoundCorners/releases/latest)
   and copy it to the Deck, for example to Downloads.
2. In Gaming Mode, open Decky → Settings → General and turn on Developer mode.
3. Open Developer → Install Plugin from ZIP File and choose the archive.
4. Open Round Corners, turn on Enable rounded corners and adjust Corner radius.
5. Close the Decky menu and check the effect in a game.

## Limitations

- The maximum radius keeps the corners within Steam's header and footer, so
  menus and the Store, which Steam draws above the corners, never cut into them.
- The plugin uses an internal Steam hook that may change in a Steam update.
  If the hook is not found, the panel shows a message and the effect stays off.

## How it works

- Four small static images over Steam's interface, all drawn from one
  antialiased texture (14 KiB at radius 60). It is regenerated only
  when you change the size or shape.
- No backend, no per-frame code, no polling. Touch and buttons pass through
  the corners.
- Corners stay visible over games through Steam's Notification composition
  mode, which is released when the effect is turned off.

## Performance

Measured on a Steam Deck with corners on and off:

- Light game: power draw, GPU, CPU, Steam and Gamescope load unchanged
  (difference within the ±0.06 W measurement noise).
- Heavy game: same FPS.

## References

- [Decky template](https://github.com/SteamDeckHomebrew/decky-plugin-template):
  the official plugin build format and API.
