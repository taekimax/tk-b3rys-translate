# Local MLX engines plan

- Date: 2026-07-29, revised 2026-07-30
- Planning baseline: `d94740d` (`main`, b3rys translate `0.5.15`)
- Fork: `taekimax/b3rys-translate`
- Planning branch: `feat/local-mlx-engines-plan`

## Outcome

Replace the cloud-LLM engine layer with six fully local MLX 4-bit models:

- `gemma4-e4b-q4` — Gemma 4 E4B
- `gemma4-12b-q4` — Gemma 4 12B
- `translategemma-4b-it-q4` — TranslateGemma 4B IT
- `translategemma-12b-it-q4` — TranslateGemma 12B IT
- `hy-mt2-1.8b-q4` — Hy-MT2 1.8B
- `hy-mt2-7b-q4` — Hy-MT2 7B

The extension will keep its existing page, selection, and YouTube UI. Translation
text will go from the MV3 background service worker to a narrowly registered
macOS native-messaging host and its local MLX runtime. It will not go to a remote
model API. Gemini, OpenAI, Anthropic, and Upstage engines, endpoints, API-key UI
and storage, remote retry logic, provider pricing, and cost-limit accounting will
be removed in the same atomic cutover that makes the local runtime functional.

This document is a plan only. The 2026-07-30 request authorizes local model asset
preparation and this scope revision, but not extension/native-host implementation,
app replacement, Chrome Web Store upload, or changes to Kindle Helper.

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

### Local runtime and model assets

- Installed app: `/Applications/Kindle Helper.app`, version `0.1.0` build `29`.
- Its deep/strict code-signature verification passes.
- Installed worker:
  `/Applications/Kindle Helper.app/Contents/Helpers/KindleHelperLLMWorker`.
- The worker already supports Gemma 4 E4B and both Hy-MT2 sizes, keeps at most
  one model resident, validates model locations, uses bounded JSON messages,
  reports token and memory metrics, and unloads on shutdown/EOF.
- The installed worker does not catalog Gemma 4 12B or either TranslateGemma
  model. Requiring Kindle Helper would therefore leave half of the requested
  catalog unavailable. The fork should own its native runtime while reusing the
  proven bounded protocol, one-model residency, cancellation, path-validation,
  Hunyuan model registration, and output-validation patterns.
- The worker protocol is newline-framed JSON. Chrome native messaging instead
  uses 32-bit native-endian length-prefixed JSON, so the project-owned host must
  implement Chrome framing directly.
- Development assets are stored under the Git-excluded `.local-models/`
  directory. Existing Kindle Helper assets are APFS-cloned so the originals are
  untouched; missing 12B assets come from immutable Hugging Face revisions.

| Local ID                   | MLX repository                             | Pinned revision                            |
| -------------------------- | ------------------------------------------ | ------------------------------------------ |
| `gemma4-e4b-q4`            | `mlx-community/gemma-4-e4b-it-4bit`        | `475b9088d29754a3379866cf5aeb6b41acd313c2` |
| `gemma4-12b-q4`            | `mlx-community/gemma-4-12B-it-4bit`        | `73bcf09092aa277861d5a191b989b666f7f32e8f` |
| `translategemma-4b-it-q4`  | `mlx-community/translategemma-4b-it-4bit`  | `5788ec08c047f3f2e17808101b8d9566ac930d58` |
| `translategemma-12b-it-q4` | `mlx-community/translategemma-12b-it-4bit` | `f3dcfd54df14672fbcf0731086fb47a797a943ae` |
| `hy-mt2-1.8b-q4`           | `mlx-community/Hy-MT2-1.8B-4bit`           | `e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912` |
| `hy-mt2-7b-q4`             | `mlx-community/Hy-MT2-7B-4bit`             | `9b7204bdb161490a8ce49ce607c1310cc3fd03ad` |

All six configs declare affine 4-bit quantization with group size 64.

- Gemma 4 E4B uses `gemma4`; Gemma 4 12B uses `gemma4_unified`. The pinned
  `mlx-swift-lm` 3.31.4 code already recognizes both and strips unused
  vision/audio weights for text-only loading. Current `mlx-lm` 0.31.3 does not
  load `gemma4_unified`, despite the repository page's MLX-LM server example;
  `mlx-vlm` 0.6.8 loaded the local 12B bundle and produced `안녕하세요.` in a
  bounded smoke with roughly 7.2 GiB peak memory footprint.
- TranslateGemma 4B and 12B use the supported `gemma3` text architecture, but
  require their translation-specific single-content prompt and output policy.
  The community README's plain-string example does not satisfy the bundled
  template. With one structured item containing `type`, `source_lang_code`,
  `target_lang_code`, and `text`, plus `<end_of_turn>` token 106 in the EOS set,
  both local bundles produced clean `안녕하세요.` smokes. The 4B run used
  roughly 2.9 GiB peak footprint and the 12B run roughly 7.1 GiB.
- Hy-MT2 uses `hunyuan_v1_dense`, which is not registered by upstream
  `mlx-swift-lm` 3.31.4. Reuse the explicit registration and model port already
  proven in Kindle Helper after a source/license review.
- The prior bounded Kindle corpus run accepted Gemma 4 E4B 149/149, Hy-MT2 1.8B
  13/13, and Hy-MT2 7B 13/13 under its automated validators. TranslateGemma 12B
  accepted 11/33 with 22 truncations; TranslateGemma 4B accepted 0/148 because
  of English-heavy/truncated output. These are engineering signals, not human
  translation-quality approval. The corrected one-line smokes explain a likely
  prompt/EOS defect in the old run but do not replace it; keep both
  TranslateGemma models experimental until a corrected corpus run passes.

The weights must never be included in the extension bundle, Git history, or a
Web Store upload. A release needs a separately reviewed installer/downloader and
license acceptance flow. TranslateGemma's documented input limit is 2K tokens;
the larger value in its converted config must not override the model contract.

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
- `chrome.runtime.connectNative()` provides a long-lived port, so the native
  host can keep one selected model warm across batches.
- The existing content-script-to-service-worker boundary remains unchanged.
- Chrome limits host-to-extension messages to 1 MiB; retain the proven 256 KiB
  response bound so every response fits.

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
b3rys native-messaging host
  Chrome framing, origin/shape validation, model discovery,
  strict prompts/output validation, one-model residency
          |
          v
Pinned model under an allowlisted local model store
```

### Native host

Add a Swift executable under a new `native-host/` directory. It owns Chrome
framing and the MLX runtime, but must not contain model weights. Pin the same
MLX Swift package family already validated by Kindle Helper; register the
`hunyuan_v1_dense` architecture before loading Hy-MT2.

Responsibilities:

1. Read and write Chrome's 32-bit length-prefixed UTF-8 JSON safely.
2. Accept only a versioned allowlisted protocol; reject unknown keys, oversized
   messages, bad model IDs, bad modes, and invalid item counts.
3. Resolve model directories internally. The extension and content scripts
   never supply an arbitrary filesystem path.
4. Require the exact repository revision, asset byte counts, and SHA-256 hashes
   from a project-owned manifest before a model can become ready.
5. Load at most one model container and correlate every response by request ID.
6. Serialize generation. A model switch unloads the old model before the new
   one loads; two model containers must never coexist.
7. On cancellation of the active request, cancel generation, unload if needed,
   and drop queued requests for that translation scope.
8. Write diagnostics only to `stderr`; `stdout` is protocol-only.
9. On native-port EOF or explicit shutdown, release the model.

The first implementation must not depend on an installed Kindle Helper build.
Before copying any worker code, review its license/provenance and copy only the
minimum model/runtime policies needed by this fork.

### Extension protocol

Use an abstract protocol rather than exposing the Kindle worker schema directly:

- `hello`: protocol version, host version/identity, available model
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

Replace the provider catalog with one `local-mlx` engine and the six exact model
IDs. Remove assumptions and code paths for API keys, key-issuance URLs, token
pricing, provider cost limits, and provider-specific retries.

Suggested capabilities:

```ts
type EngineCapabilities = {
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
- maps native errors to actionable UI states such as host missing, host
  invalid, model missing/invalid, memory pressure, timeout, cancellation, and
  invalid output.

There is no remote fallback. A local failure must return a stable local error and
preserve the source text.

### 3. Background routing, telemetry, and cache

- Delete provider endpoint constants and prevent translation code from issuing
  network `fetch` requests.
- Remove API-key checks/storage/migrations and cost-limit enforcement/UI.
- Replace provider usage/cost statistics with local token, timing, and memory
  metrics. Do not describe local work as `$0.00` provider billing.
- Remove obsolete stored provider credentials during the migration, with a
  regression test proving they are no longer readable through extension UI or
  runtime messages.
- Keep model ID in the cache prefix; the existing cache isolation already does
  the right thing.
- Keep the global safety rate limit, but add a separate small bounded local
  queue so six page workers plus YouTube cannot create an unbounded backlog.

### 4. Concurrency and cancellation

Local generation is serialized.

- Before a page pipeline starts, resolve engine capabilities and use
  `maxConcurrency: 1` for every local model.
- Add a translation-scope ID to batch messages.
- When `cancelTranslation()` runs, send `CANCEL_TRANSLATION_SCOPE` to the
  background. The background drops queued local batches and tells the native
  host to stop the active scope.
- Give YouTube a scope tied to its existing `AbortSignal`; seeking, navigation,
  turning subtitles off, or stopping the controller must clear queued local
  work.
- Preserve all existing generation checks before DOM state changes.

### 5. Prompt and output policy

Use a pinned, structured request and strict response decoder per model family.

First release:

- Send plain source text to local models, not model-controlled HTML.
- Return plain translated text and let the existing injection sanitizer run.
- This intentionally trades formatting in the translated copy for a smaller,
  safer first slice. The original page remains unchanged.

Follow-up, only after the core path passes:

- deterministically replace allowed inline tags/attributes with protected
  placeholders;
- require the exact placeholder multiset/order in the response;
- restore markup outside the model;
- fail closed to plain text or an explicit error when validation fails.

Never trust a normal model stop reason by itself. Require the native host's strict
JSON shape, slot identity, nonempty output, size/control-token checks, and exact
request correlation.

### 6. Mode support

- Page and subtitle translation: required for all admitted models.
- Selected sentence: required for all admitted models.
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

Replace the provider/API-key/cost controls with a local-runtime status panel:

- show host/model/revision state and a `Check local runtime` action;
- explain that page text stays on this Mac for that engine;
- explain cold-load latency and memory use;
- provide setup instructions when the native host is missing;
- do not offer a remote key link, cost limit warning, provider price tooltip, or
  cloud-engine selector.

### 8. Manifest, installer, privacy, and identity

- Add `nativeMessaging`.
- Add no loopback host permission.
- Add a macOS installer/uninstaller for the native host and user-level manifest
  under Chrome's documented `NativeMessagingHosts` directory.
- Make uninstall recoverable and scoped to exact installed files.
- Preserve `LICENSE` and `NOTICE`.
- Do not bundle model weights. Document Hy-MT2's Apache-2.0 model license and
  Gemma's separate model terms.
- Remove provider host permissions and endpoint disclosures.
- Update `PRIVACY.md` to state that translation text is processed locally and
  add a test that no translation request reaches a network endpoint.

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

### Phase 1 — native host and installer

1. Implement framing and strict request validation.
2. Implement pinned model discovery, integrity verification, and model-family
   registration.
3. Implement in-process MLX lifecycle, serialization, cancellation, and
   shutdown.
4. Add native-host unit/integration tests using a fake model runtime.
5. Install only into a test-specific user path and verify exact files/manifest.

Stop before touching Chrome if host framing, path restrictions, or teardown
tests fail.

### Phase 2 — extension engine and settings

1. Add engine capabilities and local model catalog entries.
2. Add the native client and background local queue.
3. Remove all cloud engines, endpoints, API-key storage/UI, provider usage/cost
   accounting, and remote host permissions in the same cutover.
4. Add model-aware concurrency and scope cancellation.
5. Add popup runtime status and storage migration.
6. Add unit tests for every touched branch.

Stop if the local engine is not functional after the cloud routes are removed,
or if credential-removal/storage migrations regress.

### Phase 3 — bounded end-to-end validation

1. Build and load the fork as an unpacked extension with its stable ID.
2. Test missing-host and missing-model flows before installing the host.
3. Test cold and warm translation with each model on:
   - a fixture page with plain paragraphs;
   - a fixture page with allowed inline markup;
   - sentence and single-word selection;
   - manual and ASR YouTube subtitle fixtures.
4. Test cancellation: toggle off, navigate, seek, abort YouTube, reload the
   extension, crash the native host, and switch models.
5. Confirm no remote translation API request can occur for any model.
6. Confirm only one model is resident and memory is released after idle shutdown.

This is development evidence, not Chrome Web Store or general-user proof.

### Phase 4 — optional markup preservation

Implement and validate protected inline-markup round-tripping. Keep it separate
from the initial local-engine slice so formatting work cannot obscure the core
privacy, routing, and lifecycle proof.

### Phase 5 — release decision

Only after explicit approval:

- perform the repository release checklist and real Chrome acceptance pass;
- decide whether the native host remains a developer option or warrants a
  signed/notarized companion installer;
- update store disclosures and publish a distinct fork listing.

## Verification matrix

### Automated

- Existing relevant behavior tests remain green; provider-specific tests are
  replaced by local-only routing and no-network tests.
- New model catalog/capability/storage/telemetry/cache tests.
- Native-client correlation, queue, timeout, disconnect, and cancellation tests.
- Chrome framing tests with split reads, combined messages, Unicode byte lengths,
  oversized input/output, EOF, and stdout contamination.
- Native-host model-path allowlist and revision mismatch tests.
- Plain-text output and protected-markup validation tests.
- `npm run test -- --run`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- bounded Swift build/test job count for the native host.

### Real runtime

- Signed native-host verification.
- All six exact installed revisions pass local catalog/integrity checks; each
  admitted runtime model passes a bounded `hello`/self-test.
- Cold/warm latency, input/output tokens, active/cache/peak memory, and
  cancellation time are recorded.
- A long page proves bounded backlog and viewport-first progress.
- Model switching proves no simultaneous residency.
- Network observation proves translation requests cannot reach remote model
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
