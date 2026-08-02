# Remove web-translate / web-translate 제거

The standalone installer is per-user. Chrome itself is not modified except for
the native-messaging manifest and the manually loaded extension entry.

## Manual removal

1. In `chrome://extensions`, remove the manually loaded `web-translate` extension.
2. Remove the installed application data after confirming the paths:

```text
~/Library/Application Support/web-translate/extension
~/Library/Application Support/web-translate/native-host/
~/Library/Application Support/web-translate/models/
~/Library/Application Support/web-translate/licenses/
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.webtranslate.translate.local_mlx.json
```

Keep the model directory if you may reinstall later. Do not delete a broader
`Application Support` directory.

## Recovery

The installer keeps a previous extension directory as
`web-translate/extension.previous-<timestamp>` when replacing a different
extension build. Remove that exact directory only after confirming it is no
longer needed. A model with the same pinned revision but different contents is
never overwritten automatically; reinstall only after resolving the mismatch.
