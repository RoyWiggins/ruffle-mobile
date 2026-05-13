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

## Neopets levels and the bios/include handshake

Flash AS2 movies are stacked in numbered "levels". `_level0` is the host
game. Neopets games load a small `bios.swf` into a child clip during their
preloader; the bios in turn `loadMovieNum`s the much larger
`np6_include_v1.swf` into `_level100`. The include is the shared platform
layer (translator, scoring, analytics); the bios is the bootstrapper that
brings the include up, wires it onto `_level0`, and releases the host
preloader.

Distributing the real bios or include is a copyright problem; we ship
hand-built stubs in `demos/neopets-{bios,include}-stub.swf`. The service
worker (`sw.js`) intercepts the upstream URLs and serves the stubs.

### What the real bios does

Lifecycle (all on frame 1):

1. `init()` — branch on how it was loaded into `bLocal` true (child clip
   of `_level0`, the common case) vs false (loaded into a separate level
   by something else, very rare).
2. `waitForBios()` — poll own `bytesLoaded == bytesTotal`.
3. `endInit()` — `copyInProps()` from parent; bLocal path issues
   `loadMovieNum(includeURL, 100)`.
4. `waitforInclude()` — poll `_level100.bytesLoaded == bytesTotal`.
5. `postLoading()` — wire properties onto `_level0` and `_level100.include`.
6. `loadLocalGameTranslation()` — POST XML fetch, only if `translation==1`.
7. `waitForTranslation()` — poll `_level100.include.gameTranslationSuccess`.
8. Branded fade animation (`alphaUpChip` → `alphaDownBG`).
9. `finishBios()` — hide self, `_parent._parent.play()` to release host
   preloader.

Writes onto `_level0` / `_root`: `debug`, `game_lang`, `game_id`,
`offline = 1`, `game_isAdmin = 1`, `resetall = function(){ ...reset(); }`,
`resetvar`, `evar`, `bMeterSet` (if explicit meter position).

Writes onto `_level100.include`: `game_level = 0`, `game_id`, `game_lang`,
scoring-meter `_x/_y/_width/_height`, `scoresentframe`, `debug`, `offline`,
`minscorevalue`, `metervisible`, `customizedmeter`. Calls
`initScoringMeter()`, `setTranslatorTextFieldTarget(target)`,
`newGameTranslation()`, `reset()`.

URLs:

- `http://images.neopets.com/games/gaming_system/np6_include_v1.swf`
  (live include; still 200 with CORS as of 2026).
- Internal `//Neoserver/...` UNC path when `liveBios_boolean == false`
  (dev only; gone).

What our stub skips: fade animation, meter sizing math, translation XML
fetch (endpoint is dead anyway), the `bLocal=false` branch, the UNC
fallback. We keep: include load via `loadMovieNum`, the
`setTranslatorTextFieldTarget(_level0)` handshake, `resetall`/`evar`/
`resetvar` plumbing, and `_parent._parent.play()`.

### What the real include does

~47 KB shared platform SWF, a heavy facade — actual logic lives in
`__Packages/{core,np}/lang/Translator`, `np/projects/include/*`,
`np/utilities/Server`.

Public API on `_level100.include`:

- Constructors: `NeoStatus`, `ScoringSystem`, `evar`, `resetvar`,
  `passWord`, `userProfile`, `dictionary`, `CodeBaseObject`.
- Translator: `translator` (an `np.lang.Translator`),
  `setTranslatorTextFieldTarget(target)`, `newGameTranslation()`, flag
  `gameTranslationSuccess`. Note: `addTextField` lives on
  `translator`, not on `include` itself.
- Scoring: `_SCORE`, `_NEOPOINTS` (evars), `aAddParams`,
  `addScoreParameter`, `changeScoreTo`, `resetscore`, `sendscore`,
  `reset`, `customizedmeter`, `initScoringMeter`, `hidescoringmeter`,
  `setText1/2/3`, `showMsg`.
- Misc: `gameMsg`, `msg`, `showLogin`/`showSignup`/`showChallenge`
  (JS popup launchers).

Translator pipeline. `translator.addTextField(name, {target, htmlText,
font})` registers a `TranslatableTextFieldInstance`. `translate()` POSTs
`{lang, type_id, item_id}` to `FG_SCRIPT_BASE +
"transcontent/gettranslationxml.phtml"`. On success it walks XLIFF
`<body>` units, building `{ IDS_*: value }`, and writes each pair onto
the target (`_level0` by default). Then it refreshes every registered
TTF. **No fallback** when the XML fetch fails — `gameTranslationSuccess`
just never flips, and registered TTFs keep whatever `htmlText` the call
site passed in (which contains literal `"undefined"` if the host built
the string before strings were populated).

ScoringSystem. Thin facade exposing `Evar`, `NeoStatus`, `Dictionary`,
`FPS`, `Ratio`, `Browser.JavaScript.callFunction`, `CodeBase`. Methods:
`setScore`, `addParam`, `submitScore`, `reset`, `gameMsg`. `sendscore()`
computes `_NEOPOINTS = int(game_neopointratio * _SCORE)`, clipped to
`±game_capOnNeopoints`. Submits a long obfuscated POST body (hashed
`sh_g`/`sk_g`/`ssnhsh`/`ssnky`, framerate, challenge) to
`FG_SCRIPT_BASE + "high_scores/process_score.phtml"`. Response codes
0..18 map to localized messages via `showMsg(code, np)`.

NeoStatus. `sendtag(tagName)` → `loadVariables` of `FG_SCRIPT_BASE +
"neostatus.phtml?item_id=…&multiple=…&status=…"`. Built-in tag → status
table: "Game Started"=900, "Multiplayer Game Started N"=901–904,
"Game Finished"=1000, "Sent Score"=1001, "Reached Level N"=7001–7100,
plus 8010/8020/8030/8040 for sponsor events. With
`_level0.game_tracking == 1`, Game Started/Finished also hit
`track_plays.phtml`.

`gameMsg(arg1, arg2)`. The anti-cheat "cheatmonster" reporter. Decodes
an obfuscated char-code array to `"games/dgs/dgs_protocol.phtml"`,
appends `?id=…&subject=<game_id>&body=…`, `loadVariables(url, _level0,
"POST")`. The root version also opens a `cheatmonster.phtml` popup.
dubloon calls it mid-game to report suspicious play patterns.

Visible UI. Only a `scoringmeter` movieclip with `box`, `textbox1/2/3`,
`shadow`, `slider` sub-clips. Hidden by default; appears during score
submission. The "123" placeholder text we saw at decompile is just the
IDE's default content for the three text fields. Skinnable via
`customizedmeter.swf`.

URLs the include hits (all `FG_SCRIPT_BASE`-rooted unless noted):

- `transcontent/gettranslationxml.phtml` (translation XML).
- `high_scores/process_score.phtml` (score submit).
- `neostatus.phtml`, `track_plays.phtml`, `process_click.phtml`
  (analytics).
- `games/dgs/dgs_protocol.phtml` (cheat reports).
- `games/utilities/scoring_meters/*.swf` (meter skins, via
  `FG_GAME_BASE`).
- `games/utilities/flash_dictionary/flash_dictionary_en_v*.swf` (loaded
  into level 120).
- Hardcoded popups: `loginpage.phtml`, `signup_age.phtml`,
  `cheatmonster.phtml`, `nc_track.phtml`, etc.

What our stub skips: all four POST endpoints, the dictionary at level
120, the scoring-meter UI, JS-bridge popups, the
`Browser.JavaScript.callFunction` plumbing, `UserProfile`, `passWord`,
`dictionary`, `CodeBaseObject`. We expose just enough for call sites to
resolve: `evar`, `ScoringSystem` with nested `Evar`, `NeoStatus.sendTag`,
`translator.addTextField`/`setDefaultFont`,
`setTranslatorTextFieldTarget` that statically populates
`_level0.IDS_*`, `reset`, `gameMsg`, `newGameTranslation`,
`gameTranslationSuccess` / `preloaderTranslationSuccess` flags.

### Practical takeaways for the stubs

- `setTranslatorTextFieldTarget(_level0)` MUST be called before the host
  game's frame 5+ code references `_level0.IDS_*`, otherwise those
  substitutions evaluate to `"undefined"` and clobber default text. The
  bios stub does this between include-load and `_parent._parent.play()`.
- The SWFs ship with English text **baked into DefineEditText fields**
  (e.g. dubloon's "You play Dorak…" instructions paragraph,
  "skip intro", "play now!!!"). With the real bios, the dead XML
  endpoint left these defaults visible. Our stub's `addTextField` keeps
  whichever is longer between the baked text and the substituted
  string, so long paragraph defaults survive but short labels get
  filled in from our `IDS_*` table or `__resolve` fallback.
- `__resolve` on `_level0` (installed by the bios stub) synthesizes
  humanized strings (`IDS_foo_bar` → `"foo bar"`) for any name not in
  the enumerated table. Good for button labels, bad for prose.
- `_global.ScoringSystem.Evar` must be the same `evar` constructor as
  `_level100.include.evar` — dubloon does
  `new ScoringSystem.Evar(0)` after assigning the global from an
  instance.

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
