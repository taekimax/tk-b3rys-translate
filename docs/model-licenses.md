# Model license ledger

The app pins exact MLX-community revisions instead of following a moving
`main` branch. Model weights are separate from the Chrome extension artifact.
The native host can download them after the user selects a model; the release
process can also publish an offline Hy-MT2 7B bundle.

## Supported public catalog

| App ID                     | MLX repository                                                                                              | Revision                                   | Approx. size | License/copyright                                                                                                 | Download rule                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -----------: | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `hy-mt2-1.8b-q4`           | [mlx-community/Hy-MT2-1.8B-4bit](https://huggingface.co/mlx-community/Hy-MT2-1.8B-4bit)                     | `e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912` |     0.95 GiB | Apache-2.0; Tencent Hunyuan; [license](https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/LICENSE.txt)          | automatic after selection          |
| `hy-mt2-7b-q4`             | [mlx-community/Hy-MT2-7B-4bit](https://huggingface.co/mlx-community/Hy-MT2-7B-4bit)                         | `9b7204bdb161490a8ce49ce607c1310cc3fd03ad` |     3.95 GiB | Apache-2.0; Tencent Hunyuan; [license](https://huggingface.co/tencent/Hy-MT2-7B/blob/main/LICENSE.txt)            | automatic after selection; default |
| `translategemma-4b-it-q4`  | [mlx-community/translategemma-4b-it-4bit](https://huggingface.co/mlx-community/translategemma-4b-it-4bit)   | `5788ec08c047f3f2e17808101b8d9566ac930d58` |     2.18 GiB | Google Gemma Terms of Use; [exact artifact card](https://huggingface.co/mlx-community/translategemma-4b-it-4bit)  | terms acceptance, then automatic   |
| `translategemma-12b-it-q4` | [mlx-community/translategemma-12b-it-4bit](https://huggingface.co/mlx-community/translategemma-12b-it-4bit) | `f3dcfd54df14672fbcf0731086fb47a797a943ae` |     6.21 GiB | Google Gemma Terms of Use; [exact artifact card](https://huggingface.co/mlx-community/translategemma-12b-it-4bit) | terms acceptance, then automatic   |

TranslateGemma's exact MLX cards identify the Google TranslateGemma base and
the MLX conversion. They are enabled only with the Google terms gate because
the [Gemma Terms of Use](https://ai.google.dev/gemma/terms) require recipients
to receive the agreement, use restrictions, and required notice. The app
records acceptance of the pinned terms revision `gemma-terms-2026-04-01` and
the native host writes `GEMMA_TERMS_NOTICE.txt` beside the downloaded model.

Required notice:

> Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms

## Removed from support

Gemma 4 E4B and Gemma 4 12B are not supported model IDs in this distribution.
They are not selectable, downloadable, or accepted by the native host.

## Bundle rule

`npm run package:hy-mt2-7b` creates a separate
`web-translate-<version>-hy-mt2-7b-q4.tar.zst` offline bundle when the pinned
model is present under `.local-models`. It includes the model's `LICENSE.txt`,
the app's license/notice ledger, and the exact revision directory. It must not
be inserted into the Chrome extension ZIP or uploaded as an extension resource.

`npm run package:standalone:macos` may place the expanded exact revision inside
the private-preview macOS DMG beside the extension and prebuilt native host.
That DMG is a separate macOS distribution artifact, not a Chrome extension
resource. Its `LICENSES/` directory and `SHA256SUMS` must remain with any
redistribution.

Do not add another model merely because its upstream base is openly licensed.
Record its exact MLX artifact, revision, base model, converter, copyright,
license text, and any gated/custom terms first.
