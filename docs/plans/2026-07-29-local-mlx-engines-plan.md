# Local MLX engines plan

- Date: 2026-07-29
- Planning baseline: `d94740d` (`main`, b3rys translate `0.5.15`)
- Fork: `taekimax/b3rys-translate`
- Planning branch: `feat/local-mlx-engines-plan`

## Outcome

Add two optional, fully local translation models to the extension:

- `hy-mt2-7b-q4` — Hy-MT2 7B, MLX 4-bit
- `gemma4-e4b-q4` — Gemma 4 E4B, MLX 4-bit

The extension will keep its existing page, selection, and YouTube UI. When a
local model is selected, translation text will go from the MV3 background
service worker to a narrowly registered macOS native-messaging host, then to the
existing signed Kindle Helper MLX worker. It will not go to a remote model API.

This document is a plan only. It does not authorize implementation, app
replacement, Chrome Web Store upload, model downloads, or changes to Kindle
Helper.

## Evidence reviewed

### Extension

- WXT `0.20.13`, TypeScript, Manifest V3, Vitest/happy-dom.
- Content scripts send `TRANSLATE_BATCH` messages to `entrypoints/background.ts`.
- The background selects a provider engine, handles cache/rate/cost accounting,
  and calls `TranslationEngine.translate(...)`.
- The model catalog is centralized in `utils/models.ts`; the popup is generated
  from it and stores provider-scoped model choices and API keys.
- Page translation can dispatch six batches concurrently. YouTube can enqueue a
  current-cue micro-batch plus multiple future batches.
- Cache identity already includes target language, request mode, and model ID.
- Rich page blocks may contain allowed inline HTML. Returned model text is
  sanitized before injection.
- Cancellation currently prevents stale DOM writes but does not cancel work
  already running in the background engine.
- The upstream Chrome Web Store item is version `0.5.6`, updated 2026-07-25,
  with extension ID `dgmmidkccokcnofpkbcnmiapkpbmdffe`. The fork cannot reuse
  that identity.

### Local runtime

- Installed app: `/Applications/Kindle Helper.app`, version `0.1.0` build `29`.
- Its deep/strict code-signature verification passes.
- Installed worker:
  `/Applications/Kindle Helper.app/Contents/Helpers/KindleHelperLLMWorker`.
- The worker already supports both target model IDs, keeps at most one model
  resident, validates model locations, uses bounded JSON messages, reports token
  and memory metrics, and unloads on shutdown/EOF.
- The worker protocol is newline-framed JSON. Chrome native messaging instead
  uses 32-bit native-endian length-prefixed JSON, so a small adapter is needed.
- Verified model installations currently exist under:
  - `~/Library/Application Support/KindleHelper/Models/hy-mt2-7b-q4/`
  - `~/Library/Application Support/KindleHelper/Models/gemma4-e4b-q4/`
- Active pinned revisions:
  - Hy-MT2 7B: `9b7204bdb161490a8ce49ce607c1310cc3fd03ad`
  - Gemma 4 E4B: `475b9088d29754a3379866cf5aeb6b41acd313c2`
- On-disk sizes are approximately 3.9 GiB and 4.8 GiB respectively. The weights
  must not be copied into the extension or committed to Git.

### Clean baseline

On a fresh clone, WXT must first generate `.wxt/tsconfig.json` (a build does
this). After that:

- `npm run test -- --run`: 371 passed
- `npm run typecheck`: passed
- `npm run lint`: passed with 8 pre-existing warnings, no errors
- `npm run build`: passed
- `npm audit`: 25 reported dependency vulnerabilities (4 moderate, 17 high,
  4 critical); this is pre-existing and should be triaged separately rather
  than silently changed during the local-engine feature.

## Decision: native messaging

Use Chrome native messaging rather than a localhost HTTP server.

Reasons:

- `allowed_origins` binds the host to an exact extension ID; there is no
  generally reachable loopback port.
- No CORS, private-network-access, bearer-token, or port-discovery surface is
  required.
- `chrome.runtime.connectNative()` provides a long-lived port, so the adapter
  and MLX worker can keep one selected model warm across batches.
- The existing content-script-to-service-worker boundary remains unchanged.
- Chrome limits host-to-extension messages to 1 MiB; the existing worker's
  256 KiB response bound already fits.

The extension will request the `nativeMessaging` permission. No localhost host
permission will be added.

## Proposed architecture

```text
Content scripts
  page / selection / YouTube
          |
          | TRANSLATE_BATCH / CANCEL_TRANSLATION_SCOPE
          v
MV3 background service worker
  cache, routing, queue, correlation, timeout
          |
          | chrome.runtime.connectNative()
          v
b3rys native-messaging adapter
  Chrome framing, origin/shape validation, model discovery
          |
          | newline JSON over a private child-process pipe
          v
Installed signed KindleHelperLLMWorker
          |
          v
Pinned model under KindleHelper/Models
```

### Native adapter

Add a small Foundation-only Swift executable under a new `native-host/`
directory. It must not contain model weights or a second MLX implementation.

Responsibilities:

1. Read and write Chrome's 32-bit length-prefixed UTF-8 JSON safely.
2. Accept only a versioned allowlisted protocol; reject unknown keys, oversized
   messages, bad model IDs, bad modes, and invalid item counts.
3. Resolve model directories internally. The extension and content scripts
   never supply an arbitrary filesystem path.
4. Require the expected active revision and verification receipt for each
   model, then rely on the worker's own directory/file validation as a second
   check.
5. Verify the installed helper exists and is executable. The installer and
   release verification should also require the Kindle Helper bundle's stable
   designated requirement and deep/strict signature.
6. Spawn one `KindleHelperLLMWorker`, translate Chrome framing to its newline
   protocol, and correlate every response by request ID.
7. Serialize generation. A model switch unloads the old model before the new
   one loads; two model containers must never coexist.
8. On cancellation of the active request, terminate the child worker and drop
   queued requests for that translation scope. Restart lazily for later work.
9. Write diagnostics only to `stderr`; `stdout` is protocol-only.
10. On native-port EOF or explicit shutdown, stop the child worker and release
    the model.

The first implementation is deliberately dependent on the installed Kindle
Helper build. A standalone distributable companion app is a later project,
because it would require independently packaging/signing the MLX runtime,
reviewing source provenance, and defining its own model installer.

### Extension protocol

Use an abstract protocol rather than exposing the Kindle worker schema directly:

- `hello`: protocol version, adapter version, helper identity, available model
  IDs/revisions, and readiness/error states.
- `translate`: request ID, translation-scope ID, model ID, mode, target
  language, ordered `{id, text}` items, and bounded subtitle context.
- `cancel_scope`: translation-scope ID.
- `shutdown`: explicit idle teardown for development/tests.
- Response: request ID, ordered translations, model/revision, input/output token
  counts, timing, and a stable error code.

Do not include page URLs, DOM nodes, browsing history, API keys, arbitrary
prompts, arbitrary paths, or arbitrary commands in this protocol.

## Extension changes

### 1. Model and engine metadata

Extend the catalog with a `local-mlx` engine and the two exact model IDs.
Replace assumptions that every engine:

- requires an API key,
- has a key-issuance URL,
- has nonzero token pricing, or
- supports every request mode.

Suggested capabilities:

```ts
type EngineCapabilities = {
  requiresApiKey: boolean;
  isLocal: boolean;
  billed: boolean;
  maxConcurrency: number;
  modes: readonly TranslationRequestMode[];
};
```

The user-facing label must be `Gemma 4 E4B Q4`, matching the installed manifest.
Do not call it a generic “Gemma 4 8B” checkpoint.

### 2. Local engine client

Add a `local-mlx` engine that:

- acquires/reuses one native port;
- performs `hello` before the first request;
- maintains request-ID-to-promise correlation;
- applies bounded queue length, per-request timeout, disconnect handling, and
  exactly one reconnect attempt for a crashed idle host;
- never retries a generation blindly after an ambiguous disconnect;
- maps native errors to actionable UI states such as host missing, helper
  invalid, model missing/invalid, memory pressure, timeout, cancellation, and
  invalid output.

Remote engines keep their existing retry behavior.

### 3. Background routing, cost, and cache

- Bypass API-key checks only for `local-mlx`.
- Bypass the remote dollar limit for local requests. Historical remote usage
  remains visible and must not be reset.
- Record local token/timing metrics separately with estimated API cost `$0`,
  or label them as local rather than presenting `$0.00/$0.00` as provider
  pricing.
- Keep model ID in the cache prefix; the existing cache isolation already does
  the right thing.
- Keep the global safety rate limit, but add a separate small bounded local
  queue so six page workers plus YouTube cannot create an unbounded backlog.

### 4. Concurrency and cancellation

Local generation is serialized.

- Before a page pipeline starts, resolve engine capabilities and use
  `maxConcurrency: 1` for local models while leaving remote models at the
  current concurrency.
- Add a translation-scope ID to batch messages.
- When `cancelTranslation()` runs, send `CANCEL_TRANSLATION_SCOPE` to the
  background. The background drops queued local batches and tells the native
  adapter to stop the active scope.
- Give YouTube a scope tied to its existing `AbortSignal`; seeking, navigation,
  turning subtitles off, or stopping the controller must clear queued local
  work.
- Preserve all existing generation checks before DOM state changes.

### 5. Prompt and output policy

Do not feed the remote provider prompt verbatim to the installed worker. Use the
worker's pinned, structured translation request and strict response decoder.

First release:

- Send plain source text to local models, not model-controlled HTML.
- Return plain translated text and let the existing injection sanitizer run.
- Remote engines retain the existing inline-HTML behavior.
- This intentionally trades formatting in the translated copy for a smaller,
  safer first slice. The original page remains unchanged.

Follow-up, only after the core path passes:

- deterministically replace allowed inline tags/attributes with protected
  placeholders;
- require the exact placeholder multiset/order in the response;
- restore markup outside the model;
- fail closed to plain text or an explicit error when validation fails.

Never trust a normal model stop reason by itself. Require the worker's strict
JSON shape, slot identity, nonempty output, size/control-token checks, and exact
request correlation.

### 6. Mode support

- Page and subtitle translation: required for both models.
- Selected sentence: required for both models.
- Selected single word: a plain translation is acceptable initially; the popup
  already tolerates missing definitions/examples.
- YouTube punctuation (`segment`): do not send to Hy-MT2 in the first slice.
  Use the existing deterministic cue merger when Hy-MT2 is selected. Admit a
  local model for punctuation only after an exact-word-preservation test passes.
- Source/target language: expose a local model only for language pairs validated
  by its model contract. Hy-MT2's published set covers the extension's current
  ten languages; the implementation still needs fixtures for every enabled
  direction.

### 7. Popup and onboarding

When a local model is selected:

- replace the API-key controls with a local-runtime status panel;
- show host/helper/model/revision state and a `Check local runtime` action;
- explain that page text stays on this Mac for that engine;
- explain cold-load latency and memory use;
- provide setup instructions when the native host is missing;
- do not offer a remote key link, cost limit warning, or provider price tooltip.

Changing back to a remote model must restore its existing saved API key without
altering it.

### 8. Manifest, installer, privacy, and identity

- Add `nativeMessaging`.
- Add no loopback host permission.
- Add a macOS installer/uninstaller for the adapter and user-level host manifest
  under Chrome's documented `NativeMessagingHosts` directory.
- Make uninstall recoverable and scoped to exact installed files.
- Preserve `LICENSE` and `NOTICE`.
- Do not bundle either model. Document Hy-MT2's Apache-2.0 model license and
  Gemma's separate model terms.
- Update `PRIVACY.md` to distinguish remote engines from local processing.

Native messaging requires an exact extension origin and does not allow a
wildcard. Before implementation testing:

1. Upload the fork build as an unpublished item in the owner's Chrome Developer
   Dashboard.
2. Obtain its public key and add the manifest `key` so unpacked builds keep that
   same ID.
3. Put only that fork extension origin in the native-host `allowed_origins`.

This account-bound upload is a later explicit owner gate. The upstream Web Store
ID must not be reused.

## Implementation sequence

### Phase 0 — gates and protocol fixtures

1. Confirm the fork's stable extension ID.
2. Freeze protocol v1 JSON fixtures and error codes.
3. Add fake-host fixtures for success, malformed data, disconnect, timeout,
   cancellation, model missing, and model switch.
4. Run bounded real-model prompt checks for page, subtitle, word, and punctuation
   behavior before admitting each capability.

Stop if a model cannot preserve current-passage identity, ordered slots, or
target-language output under the exact production request.

### Phase 1 — native adapter and installer

1. Implement framing and strict request validation.
2. Implement pinned model discovery and helper verification.
3. Implement child-worker lifecycle, serialization, cancellation, and shutdown.
4. Add adapter unit/integration tests using a fake child worker.
5. Install only into a test-specific user path and verify exact files/manifest.

Stop before touching Chrome if adapter framing, path restrictions, or teardown
tests fail.

### Phase 2 — extension engine and settings

1. Add engine capabilities and local model catalog entries.
2. Add the native client and background local queue.
3. Make API-key/cost behavior capability-aware.
4. Add model-aware concurrency and scope cancellation.
5. Add popup runtime status and storage migration.
6. Add unit tests for every touched branch.

Stop if remote-engine tests or existing storage migrations regress.

### Phase 3 — bounded end-to-end validation

1. Build and load the fork as an unpacked extension with its stable ID.
2. Test missing-host and missing-model flows before installing the host.
3. Test cold and warm translation with each model on:
   - a fixture page with plain paragraphs;
   - a fixture page with allowed inline markup;
   - sentence and single-word selection;
   - manual and ASR YouTube subtitle fixtures.
4. Test cancellation: toggle off, navigate, seek, abort YouTube, reload the
   extension, crash the adapter, and switch models.
5. Confirm no remote API request occurs for a local model.
6. Confirm only one model is resident and memory is released after idle shutdown.

This is development evidence, not Chrome Web Store or general-user proof.

### Phase 4 — optional markup preservation

Implement and validate protected inline-markup round-tripping. Keep it separate
from the initial local-engine slice so formatting work cannot obscure the core
privacy, routing, and lifecycle proof.

### Phase 5 — release decision

Only after explicit approval:

- perform the repository release checklist and real Chrome acceptance pass;
- decide whether the feature remains a Kindle Helper-dependent developer option
  or warrants a standalone signed/notarized companion installer;
- update store disclosures and publish a distinct fork listing.

## Verification matrix

### Automated

- Existing 371 tests remain green.
- New model catalog/capability/storage/cost/cache tests.
- Native-client correlation, queue, timeout, disconnect, and cancellation tests.
- Chrome framing tests with split reads, combined messages, Unicode byte lengths,
  oversized input/output, EOF, and stdout contamination.
- Adapter model-path allowlist and revision mismatch tests.
- Plain-text output and protected-markup validation tests.
- `npm run test -- --run`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- bounded Swift build/test job count for the native adapter.

### Real runtime

- Signed helper verification.
- Both exact installed revisions pass a local `hello`/self-test.
- Cold/warm latency, input/output tokens, active/cache/peak memory, and
  cancellation time are recorded.
- A long page proves bounded backlog and viewport-first progress.
- Model switching proves no simultaneous residency.
- Network observation proves local-engine requests do not reach remote model
  endpoints.
- Browser checks prove page, selection, and YouTube behavior without treating
  synthetic fixtures as general translation-quality approval.

## Open gates

1. Stable fork extension ID from the owner's Chrome Developer Dashboard.
2. Approval to install the native host manifest/binary into the user's Chrome
   profile.
3. Approval to implement extension/native-host code.
4. A bounded real-model capability run using the exact production protocol.
5. A product decision on plain translated text versus inline-markup parity for
   the first release.
6. Separate authorization for any Web Store upload/publication or standalone
   companion distribution.
