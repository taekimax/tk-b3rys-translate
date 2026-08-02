# Third-party notices

This file is part of the source and extension-artifact compliance bundle for
`web-translate`. The root [LICENSE](LICENSE), [NOTICE](NOTICE),
[PRIVACY.md](PRIVACY.md), and [model license ledger](docs/model-licenses.md)
must remain available in every redistribution.

## Software dependencies

| Component          | Version                     | License    | Upstream terms                                                                            |
| ------------------ | --------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| WXT                | 0.20.13                     | MIT        | [wxt.dev](https://wxt.dev/)                                                               |
| Vite               | transitive build dependency | MIT        | [vitejs.dev](https://vitejs.dev/)                                                         |
| MLX Swift          | 0.31.6                      | MIT        | [LICENSE](https://raw.githubusercontent.com/ml-explore/mlx-swift/0.31.6/LICENSE)          |
| MLX Swift LM       | 3.31.4                      | MIT        | [LICENSE](https://raw.githubusercontent.com/ml-explore/mlx-swift-lm/3.31.4/LICENSE)       |
| swift-transformers | 1.3.3                       | Apache-2.0 | [LICENSE](https://raw.githubusercontent.com/huggingface/swift-transformers/1.3.3/LICENSE) |
| swift-huggingface  | 0.9.0                       | Apache-2.0 | [LICENSE](https://raw.githubusercontent.com/huggingface/swift-huggingface/0.9.0/LICENSE)  |

The npm packages are development/build dependencies; the extension artifact
does not ship `node_modules`. A prebuilt native host has a larger resolved
dependency graph. Before publishing one, generate and ship the full license
texts and notices for the exact Swift package graph and Metal library inputs.

## Fonts

The design references DM Mono, Outfit, Geist Mono, and Noto Sans KR through
Google Fonts. The extension uses system fallbacks and does not bundle font
files. A bundle that adds font files must carry the applicable font notices.

## Models

The Chrome extension artifact does not contain model weights. The public
catalog exposes the Hy-MT2 Q4 conversions and terms-gated TranslateGemma Q4
conversions listed in [docs/model-licenses.md](docs/model-licenses.md).

Hy-MT2 is distributed under Apache-2.0 by Tencent Hunyuan. TranslateGemma is
distributed under Google's Gemma Terms of Use, not Apache-2.0. The app presents
the terms before first download and writes the required
`GEMMA_TERMS_NOTICE.txt` into downloaded TranslateGemma directories. Users and
redistributors must retain the model license/terms notices and use restrictions.
