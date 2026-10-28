# Round Corners — a Decky plugin

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

See [CHANGELOG.md](CHANGELOG.md) for the version history.

## References

- [Decky template](https://github.com/SteamDeckHomebrew/decky-plugin-template):
  the official plugin build format and API.
- [Decky PluginWrapper](https://github.com/SteamDeckHomebrew/decky-loader/blob/main/backend/decky_loader/plugin/plugin.py):
  plugins without `main.py` are supported as passive and start no backend process.
