web-translate __VERSION__ — standalone private preview
========================================================

This package is for Apple Silicon Macs running macOS 14 or newer. It contains
the unpacked Chrome extension, a prebuilt local MLX native host, the MLX Metal
kernel library, and the pinned Hy-MT2 7B model. Translation stays on this Mac.

UNSIGNED PREVIEW
----------------
This package is not Developer ID signed or notarized yet. Do not disable
Gatekeeper globally. If macOS blocks a file, use the file-specific approval in
System Settings > Privacy & Security. If that approval path is unavailable,
stop and contact the distributor.

INSTALL
-------
1. Run Install.command from this mounted disk image.
2. Open chrome://extensions in Chrome.
3. Turn on Developer mode.
4. Select Load unpacked.
5. Choose:
   ~/Library/Application Support/web-translate/extension
6. Confirm the extension ID:
   __EXTENSION_ID__
7. Reload web-translate and refresh the target page.
8. Open the popup and confirm Hy-MT2 7B is Ready.

Install.command is per-user and uses only macOS system utilities. It does not
need administrator privileges, Xcode, Swift, CMake, Homebrew, Node, Python,
zstd, or a network connection. It installs the native host manifest at:

~/Library/Application Support/Google/Chrome/NativeMessagingHosts/__HOST_NAME__.json

The current native host name and protocol are fixed at __HOST_NAME__. The
extension remains manually loaded because this is not a Chrome Web Store build.

LICENSES AND NOTICES
--------------------
Keep the LICENSES directory with any redistribution. The application retains
the Apache-2.0 license and b3rys translate attribution. Hy-MT2 7B and the
native MLX dependencies retain their applicable licenses and notices.

See START-HERE.html for the bilingual visual guide and UNINSTALL.md for
removal/recovery instructions.
