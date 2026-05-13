# Notes: Ruffle, Flash, bios.swf, service workers

Findings collected while building this player and getting various Flash games
(EZPlatformer, Neopets pterattack, Neopets Dubloon Disaster) to run under
Ruffle on a third-party origin.

## Ruffle on a third-party origin

- Ruffle's web build fetches every SWF the game references via `fetch()`, so
  any cross-origin dep needs CORS headers. Many Neopets / Flash CDNs return
  200 but no `Access-Control-Allow-Origin`, which fails silently mid-frame
  and can leave a black canvas with no obvious console error tied to the SWF.
- Ruffle's letterbox / fit doesn't suit Flixel-style games that set
  `Stage.scaleMode = NO_SCALE` and handle their own zoom. The cleanest fix
  is to size the underlying `<canvas>` to the SWF's native pixels and apply
  a CSS `transform: scale()` for visual fitting (rather than letting Ruffle
  scale). See `fitPlayer()` in `src/main.js`.
- Player options worth setting for embedding:
  `autoplay: 'on'`, `unmuteOverlay: 'hidden'`, `contextMenu: 'off'`,
  `letterbox: 'off'`.
- The Ruffle canvas lives in a shadow DOM
  (`player.shadowRoot.querySelector('canvas')`) — pointer dispatch and
  screenshots need to target it directly. The outer `<ruffle-player>`
  element doesn't receive pointer events meaningfully.

## Neopets `bios.swf` and the include wrappers

- `swf.neopets.com/games/utilities/flash_bios/bios.swf` is still served (200)
  but without CORS, so Ruffle can't load it. Its only meaningful action at
  runtime is `_parent._parent.play()` to advance the host game past its
  byte-loaded gate.
- `np6_include_v1.swf` and `include_movie.swf` are now 503 — the games
  expect them to install a global `include` object with helpers
  (`reset`, `NeoStatus`, `evar`, `ScoringSystem`, `translator.addTextField`,
  `gameMsg`, …).
- A 71-byte stub bios is enough to unblock the loader; a richer `include`
  stub is needed for gameplay to function (otherwise
  `new _level100.include.NeoStatus()` throws and score/enemy code never
  runs).
- Distributing the real bios / include is a copyright problem; hand-built
  stubs are the right approach. They live in `demos/neopets-*-stub.swf`.
- Dubloon Disaster's text rendering needs the include stub to also stamp
  `setHtmlText` / `setText` helpers on text fields, force
  `embedFonts = false`, and pre-populate the `IDS_*` / `ttext_*` string
  table. The skip-intro screen and death message render with the current
  stub; the main menu buttons and in-game text are still partly blank —
  open issue, likely needs a different translator hook than
  `addTextField`.

## SWF stub construction

- JPEXS ffdec's `-importScript` against an extracted
  `scripts/frame_1/DoAction.as` is a reliable hand-build path. Resulting
  stubs are small (332 B for bios, ~6 KB for include).
- Stubs need an `__resolve` fallback on the target object if you don't want
  to enumerate every property the host might poke.
- Header layout matters: uncompressed FWS, FrameSize RECT, single DoAction
  tag is enough to satisfy the byte-loaded gate the host game polls.

## Service Worker as a CORS / availability shim

- A SW with `event.respondWith(fetch(localStub))` is a clean way to swap
  dead / CORS-blocked third-party SWF deps without proxying through a
  third party. The regexes match the absolute upstream URLs
  (`//swf.neopets.com/...`) because Ruffle requests them by absolute URL.
- Gotchas:
  - `cache: 'force-cache'` cost a debug cycle when iterating on stubs —
    staleness made it look like fixes weren't landing. Leave caching
    default during stub development.
  - The SW only takes over after a reload-with-clients-claim; tests must
    reload the page before asserting on patched behaviour.
  - Scope matters: `self.registration.scope` +
    `new URL(rel, scope).pathname` keeps the patch list portable across
    hosting paths.
- The current patch table is in `sw.js`.

## Demo / build pipeline (EZPlatformer)

- Apache Flex 4.16.1 binary tarball still mirrors at `archive.apache.org`.
  Adobe's `playerglobal.swc` distribution is dead; nexussays/playerglobal
  on GitHub archives every version as a raw binary commit and works as a
  drop-in. Full recipe in `demos/BUILD.md`.
- `target-player=11.1` + `swf-version=14` is the floor for Flixel-era
  games; `-static-link-runtime-shared-libraries=true` avoids RSL fetches
  at runtime.
- MIT redistribution: ship `license.txt` alongside the SWF
  (`demos/ezplatformer.LICENSE.txt`).
