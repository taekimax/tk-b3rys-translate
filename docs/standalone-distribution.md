# Standalone macOS distribution / 독립 실행형 macOS 배포

This document describes the private-preview distribution, not a Chrome Web
Store release. The package is deliberately unsigned until Developer ID
signing and notarization are performed.

이 문서는 Chrome Web Store 배포가 아닌 private preview 배포 절차입니다.
Developer ID 서명과 notarization을 하기 전까지 패키지는 의도적으로 서명하지
않습니다.

## Artifact

Run:

```bash
npm run package:standalone:macos
```

The output is:

```text
dist/web-translate-<version>-macos-arm64.dmg
```

The disk image is a full offline package for Apple Silicon and macOS 14 or
newer. It contains:

- an expanded `payload/extension/` directory;
- a prebuilt `payload/native-host/<version>/` containing the arm64 host,
  `mlx.metallib`, and discovered Swift resource bundles;
- the exact pinned Hy-MT2 7B model under `payload/models/`;
- `LICENSES/`, `SHA256SUMS`, and `distribution-manifest.json`;
- `START-HERE.html`, `README.txt`, `Install.command`, and `UNINSTALL.md`.

The model and generated native binaries remain ignored release outputs. Do not
commit the DMG, model weights, or native build directory.

## Builder requirements

The recipient requirements are intentionally empty, but the release builder
still needs the local development toolchain:

- Apple Silicon macOS 14 or newer;
- Node/npm for the extension build and packaging script;
- Xcode Metal tools, Swift, and CMake for the prebuilt native host;
- the pinned model under `.local-models/hy-mt2-7b-q4/`.

`native-host/build-release.sh` builds in a temporary neutral scratch directory,
prefix-maps the repository path, copies the required resource bundles, audits
dynamic-library paths, and collects license files from the exact SwiftPM
checkout graph. The recipient never runs this script.

## Recipient flow

The package intentionally leaves Chrome's final extension approval manual:

1. Mount the DMG and read `START-HERE.html`.
2. Run `Install.command`.
3. Open `chrome://extensions` in Google Chrome.
4. Enable **Developer mode**.
5. Choose **Load unpacked**, press `Cmd-Shift-G`, and select:
   `~/Library/Application Support/web-translate/extension`.
6. Confirm the extension ID is:
   `pocbdkddmkkipegbinejlhjopmgimbdl`.
7. Open the popup and confirm Hy-MT2 7B is ready.
8. Run one translation with the network disabled.

`Install.command` is per-user and does not use `sudo`, Xcode, Swift, CMake,
Homebrew, Node, Python, `zstd`, or network access. It verifies `SHA256SUMS`,
rejects symbolic links, stages files under the user's Application Support
directory, and writes the native-messaging manifest last.

The extension/native-host identity must remain fixed:

```text
Extension ID: pocbdkddmkkipegbinejlhjopmgimbdl
Native host:  com.webtranslate.translate.local_mlx
```

## Unsigned preview boundary

Do not instruct recipients to disable Gatekeeper globally. A downloaded
unsigned DMG or host may require a file-specific approval under **System
Settings → Privacy & Security**. This flow must be tested on a freshly
downloaded/quarantined DMG before distribution. If the approval path is not
repeatable on the target macOS versions, stop and wait for Developer ID signing
and notarization.

## Verification

The packaging command runs the static verifier automatically. The focused
checks are also available as:

```bash
npm run verify:standalone -- dist/<standalone-staging-directory>
zsh -n standalone/Install.command
```

Before sharing the DMG, additionally verify on a clean Apple Silicon user or
Mac without developer tools:

- the installer completes without network access;
- Chrome launches the registered native host;
- Hy-MT2 7B reports ready and translates a representative paragraph offline;
- restarting Chrome and rerunning the installer are safe;
- managed Chrome policy does not block Developer mode, unpacked extensions, or
  native messaging.

## Later signing gate

Signing is intentionally not performed by the current packaging command. A
later release should sign the host and any installer wrapper with the approved
Developer ID identity, submit the final artifact to Apple notarization, staple
the result, validate with `codesign`/`spctl`, and repeat the quarantined
clean-machine matrix. Never place signing credentials in this repository or
inside the DMG.
