# Building the EZPlatformer demo SWF

`demos/ezplatformer.swf` is compiled from upstream MIT-licensed source. The
upstream Apache Flex SDK and Adobe's `playerglobal.swc` host are both
unmaintained as of 2026, so the path-of-least-resistance build pipeline
documented here pulls binaries from mirrors that still serve them.

## Inputs

- **Game source**: <https://github.com/AdamAtomic/EZPlatformer> (MIT, Adam
  'Atomic' Saltsman, 2009). Just four AS3 files under `src/`.
- **Engine source**: <https://github.com/AdamAtomic/flixel> (MIT). EZPlatformer
  imports `org.flixel.*`; the Flixel repo is added as a second source path
  during compilation rather than vendored.
- **Compiler**: Apache Flex SDK 4.16.1 binary distribution. Mirrored at
  <https://archive.apache.org/dist/flex/4.16.1/binaries/apache-flex-sdk-4.16.1-bin.tar.gz>.
- **`playerglobal.swc`**: required by `mxmlc` but no longer downloadable from
  Adobe. Pulled from <https://github.com/nexussays/playerglobal> (which
  archives every released version as a raw binary commit). Version 11.1 is
  enough for EZPlatformer.

## Build steps

Tested under Ubuntu 24.04 with `openjdk 21`. Adjust paths as needed.

```sh
# 1. Apache Flex SDK
mkdir -p /tmp/flex
curl -L https://archive.apache.org/dist/flex/4.16.1/binaries/apache-flex-sdk-4.16.1-bin.tar.gz \
  | tar -xz -C /tmp/flex --strip-components=1

# 2. playerglobal 11.1
mkdir -p /tmp/flex/frameworks/libs/player/11.1
curl -L -o /tmp/flex/frameworks/libs/player/11.1/playerglobal.swc \
  https://raw.githubusercontent.com/nexussays/playerglobal/master/11.1/playerglobal.swc

# 3. Game and engine source
git clone --depth 1 https://github.com/AdamAtomic/EZPlatformer.git /tmp/EZPlatformer
git clone --depth 1 https://github.com/AdamAtomic/flixel.git       /tmp/flixel

# 4. Compile
cd /tmp/EZPlatformer
PLAYERGLOBAL_HOME=/tmp/flex/frameworks/libs/player \
  /tmp/flex/bin/mxmlc src/EZPlatformer.as \
  -source-path src -source-path /tmp/flixel \
  -output EZPlatformer.swf \
  -default-size 640 480 -default-background-color 0x000000 \
  -target-player=11.1 -swf-version=14 \
  -static-link-runtime-shared-libraries=true
```

Result: `EZPlatformer.swf`, ~68 KB. Copy into `demos/ezplatformer.swf` and
ship `EZPlatformer/license.txt` alongside as `demos/ezplatformer.LICENSE.txt`
to satisfy the MIT redistribution clause.

## Notes

- Apache Flex installer's interactive bootstrap (`install.xml`) used to fetch
  `playerglobal.swc` automatically; that endpoint is dead. The nexussays
  mirror is a third-party archive — verify the SWC starts with `PK` (it's a
  zip) before trusting it.
- `target-player=11.1` is the floor that EZPlatformer's API surface needs.
  Bumping it requires a higher-numbered `playerglobal.swc` from the same
  mirror (`11.2`, `12.0`, … `30.0` are all there).
- `swf-version=14` keeps the output compatible with the Flash 11.1 runtime.
- Stage size is fixed at 640×480 by the `[SWF(width=..., height=...)]`
  metadata on the main class. The FlxGame ctor `super(320, 240, PlayState, 2)`
  runs Flixel internally at 320×240 with a 2× display zoom.
