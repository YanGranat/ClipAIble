# Third-party source

Each runtime ZIP is paired with a source ZIP whose name ends in `-sources.zip`.
The source ZIP contains the extension source, vendored libraries, package lock,
build scripts and the source kits below. Extract the source ZIP into an empty
directory to rebuild the extension. Both archives contain the same license
notices.

The Piper/eSpeak phonemizer source kit contains the source archives, local
patch, CMake target and pinned build inputs for `lib/piper-wasm`. Its
`artifacts.json` records the SHA-256 checksums of the matching runtime files.

On Windows x64, use Python 3.12 or newer and a Node.js version matching
the `engines` field in `package.json`:

```sh
npm ci
python third_party/sources/piper-phonemize/build.py --output-dir lib/piper-wasm
python third_party/sources/piper-tts-web/build.py --output-dir node_modules/@mintplex-labs/piper-tts-web/dist
npm run build
```

The phonemizer recipe downloads pinned toolchains into `temporary_files` and
does not install system tools. Without `--output-dir`, its three runtime files
remain in `temporary_files/piper-source-build/output`.

The Piper TTS Web kit supplies the preferred TypeScript source, its frozen
Yarn lock, the published npm archive and the Yarn package manager. Its recipe
uses a separate directory under `temporary_files` and verifies the generated
SDK files against `artifacts.json`. The local TypeScript library declaration
includes ES2022 for the existing `Array.at` calls; the JavaScript target remains
ES2020. The extension build applies the phonemizer adapter in `build-piper.js`
and creates the worker and offscreen bundles from the same runtime source.

The `liberation-fonts/liberation-fonts-1.07.4.tar.gz` archive contains the
editable SFD sources, FontForge scripts, Makefile and license texts for the
unmodified Liberation Sans 1.07.4 fonts used by PDF.js. Extract the archive and
run `make` with FontForge installed. Its SHA-256 checksum is
`ad98b7498dc2992f7f0868f79b65ce4a720a3acdb63ab3f1f1cb6881117a5406`.

See [THIRD_PARTY_NOTICES.txt](../../THIRD_PARTY_NOTICES.txt) for the component
licenses and source locations.
