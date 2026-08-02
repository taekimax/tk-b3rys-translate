# web-translate

웹페이지의 원문을 유지하면서 문단 아래에 번역을 표시하는 macOS용 Chrome 확장 프로그램입니다. YouTube 이중자막과 텍스트 선택 번역도 지원하며, 번역은 로컬 MLX 모델로 처리됩니다.

`web-translate` is a macOS Chrome extension that keeps the original web-page text and inserts translations below it paragraph by paragraph. It also supports YouTube dual subtitles and selection translation, powered by local MLX models.

This project is a derivative work based on [b3rys translate](https://github.com/b3rys/b3rys-translate). The upstream project is credited in [NOTICE](NOTICE), and its applicable license terms are preserved.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-vanilla-3178c6.svg)

📋 [TODO](TODO.md) · [기여 가이드 / Contributing](CONTRIBUTING.md)

## 기능 / Features

### 한국어

- 원문을 유지하는 문단 단위 번역: 병행 표시와 대치 표시를 전환할 수 있습니다.
- 10개 타겟 언어, 소스 언어 자동 감지, 언어별 번역 캐시.
- YouTube 원문 + 번역 이중자막, rolling 번역, 표시 모드 순환.
- 텍스트 선택 번역: 단어는 예문과 발음 듣기, 문장은 번역과 복사를 제공합니다.
- Hy-MT2 1.8B/7B Q4 및 약관 확인 후 다운로드하는 TranslateGemma 4B/12B Q4.
- Hy-MT2 7B Q4를 기본 모델로 사용합니다.
- API 키나 원격 LLM 서비스 없이 이 Mac에서만 추론합니다.
- MutationObserver 기반 동적 페이지와 SPA 콘텐츠 처리, LRU 번역 캐시.
- 팝업에서 한국어/English UI를 선택할 수 있으며 기본값은 한국어입니다.

### English

- Paragraph translation that preserves the source text, with parallel and replace modes.
- Ten target languages, source-language detection, and per-language translation caches.
- YouTube original + translated subtitles with rolling translation and display-mode cycling.
- Selection translation: word definitions include examples and pronunciation; sentence results can be copied.
- Hy-MT2 1.8B/7B Q4 and TranslateGemma 4B/12B Q4, downloaded after the applicable terms are reviewed.
- Hy-MT2 7B Q4 is the default model.
- Fully local inference on this Mac: no API key or remote LLM endpoint is required.
- MutationObserver support for dynamic pages and SPAs, plus an LRU translation cache.
- The popup UI can be switched between Korean and English; Korean is the default.

Screenshots / 스크린샷:

<img src="docs/web-translate.png" width="600" alt="Web-page translation / 웹페이지 번역" />

<img src="docs/word-translate.png" width="400" alt="Selection translation / 선택 번역" />

![YouTube dual subtitles / YouTube 이중자막](docs/youtube-translate.jpeg)

## 설치 / Installation

### A. Claude Code skill / Claude Code 스킬

Claude Code users can install the personal `/webtranslate` skill and receive guided instructions for loading the extension and configuring the native host:

Claude Code 사용자는 개인 `/webtranslate` 스킬을 설치하면 확장 프로그램 로드와 native host 설정 안내를 받을 수 있습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/taekimax/tk-b3rys-translate/main/install-skill.sh | bash
```

Then run:

```text
/reload-skills
/webtranslate
```

The skill source is [skills/webtranslate](skills/webtranslate/), and the installer is [install-skill.sh](install-skill.sh). This is optional; manual installation is described below.

스킬 소스는 [skills/webtranslate](skills/webtranslate/), 설치 스크립트는 [install-skill.sh](install-skill.sh)입니다. 스킬을 사용하지 않아도 아래 수동 설치가 가능합니다.

### B. Manual installation / 수동 설치

#### 1. Build / 빌드

```bash
git clone https://github.com/taekimax/tk-b3rys-translate.git
cd tk-b3rys-translate
npm install
npm run build
```

The unpacked extension is written to `dist/chrome-mv3`.

압축해제된 확장 프로그램은 `dist/chrome-mv3`에 생성됩니다.

#### 2. Load in Chrome / Chrome에 로드

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/chrome-mv3` folder itself—the folder containing `manifest.json`.
5. Pin **web-translate** from the puzzle-piece menu if desired.

6. `chrome://extensions`를 엽니다.
7. **개발자 모드**를 켭니다.
8. **압축해제된 확장 프로그램을 로드합니다**를 클릭합니다.
9. `manifest.json`이 들어 있는 `dist/chrome-mv3` 폴더 자체를 선택합니다.
10. 필요하면 퍼즐 메뉴에서 **web-translate**를 툴바에 고정합니다.

Keep the loaded folder in place. After rebuilding, click the extension’s reload button and refresh the target page.

로드한 폴더를 옮기거나 삭제하지 마세요. 다시 빌드한 뒤에는 확장 프로그램 카드의 새로고침 버튼을 누르고 대상 페이지도 새로고침합니다.

#### 3. Install the native host / native host 설치

The public build uses its own stable extension key and ID:

공개 빌드는 upstream 확장 ID와 분리된 고정 공개 키와 ID를 사용합니다.

```text
pocbdkddmkkipegbinejlhjopmgimbdl
```

Install and verify the host:

```bash
cd native-host
./install-host.sh pocbdkddmkkipegbinejlhjopmgimbdl
./verify-host.sh pocbdkddmkkipegbinejlhjopmgimbdl
```

The installer builds the native host and MLX Metal kernel, registers the Chrome native-messaging manifest, and stores models outside the repository at:

설치 스크립트는 native host와 MLX Metal kernel을 빌드하고 Chrome native-messaging manifest를 등록합니다. 모델은 저장소 밖의 다음 경로에 저장됩니다.

```text
~/Library/Application Support/web-translate/models/
```

The extension ZIP does not contain model weights. Select a model in the popup; if it is missing, the popup asks for confirmation, and the download starts only after you click **Start download**. TranslateGemma downloads additionally require reviewing and accepting the Google Gemma Terms of Use and use restrictions.

확장 프로그램 ZIP에는 모델 가중치가 들어 있지 않습니다. 팝업에서 모델을 선택하면 파일이 없을 때 다운로드 확인 안내가 표시되며, **다운로드 시작**을 눌러야 다운로드가 시작됩니다. TranslateGemma는 Google Gemma Terms of Use와 사용 제한을 확인하고 동의해야 다운로드할 수 있습니다.

#### Optional offline Hy-MT2 bundle / 선택적 Hy-MT2 오프라인 번들

If a verified model is present in `.local-models`, create the separate model bundle with:

검증된 모델 파일을 `.local-models`에 둔 뒤 별도 모델 번들을 만들 수 있습니다.

```bash
npm run package:hy-mt2-7b
```

This creates `dist/web-translate-<version>-hy-mt2-7b-q4.tar.zst`. Install it with:

이 명령은 `dist/web-translate-<version>-hy-mt2-7b-q4.tar.zst`를 생성합니다. 다음처럼 설치합니다.

```bash
./install-host.sh pocbdkddmkkipegbinejlhjopmgimbdl \
  ../dist/web-translate-0.6.0-hy-mt2-7b-q4.tar.zst
```

The approximately 3.95 GiB model bundle is distributed separately from the small Chrome extension ZIP.

약 3.95 GiB의 모델 번들은 작은 Chrome 확장 프로그램 ZIP과 별도로 배포합니다.

### C. Standalone private macOS preview / 독립 실행형 macOS private preview

For a recipient who should not install developer tools, build the full offline Apple Silicon disk image:

개발 도구를 설치하지 않는 사용자를 위해 Apple Silicon용 전체 오프라인 디스크 이미지를 만들 수 있습니다.

```bash
npm run package:standalone:macos
```

This creates `dist/web-translate-<version>-macos-arm64.dmg`. It contains the expanded Chrome extension, a prebuilt native MLX host, `mlx.metallib`, the pinned Hy-MT2 7B model, checksums, licenses, and a bilingual `START-HERE.html` guide. Recipients do not need Xcode, Swift, CMake, Homebrew, Node, Python, `zstd`, or a network connection.

이 명령은 `dist/web-translate-<version>-macos-arm64.dmg`를 만듭니다. 확장 프로그램, prebuilt native MLX host, `mlx.metallib`, 고정된 Hy-MT2 7B 모델, 체크섬, 라이선스와 한영 설치 안내를 포함합니다. 사용자는 Xcode, Swift, CMake, Homebrew, Node, Python, `zstd` 또는 네트워크를 설치할 필요가 없습니다.

This is currently an unsigned private preview. After mounting the DMG, users run `Install.command`, then manually open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `~/Library/Application Support/web-translate/extension`. The extension ID must be `pocbdkddmkkipegbinejlhjopmgimbdl`. If macOS blocks an unsigned file, use only the file-specific approval in **System Settings → Privacy & Security**; never disable Gatekeeper globally. A signed/notarized installer is a later release step.

현재는 서명되지 않은 private preview입니다. DMG를 마운트한 뒤 `Install.command`를 실행하고, Chrome에서 `chrome://extensions`를 열어 개발자 모드를 켠 다음 **압축해제된 확장 프로그램을 로드합니다**를 선택하고 `~/Library/Application Support/web-translate/extension`을 지정합니다. 확장 프로그램 ID는 `pocbdkddmkkipegbinejlhjopmgimbdl`이어야 합니다. macOS가 서명되지 않은 파일을 차단하면 **시스템 설정 → 개인정보 보호 및 보안**에서 해당 파일만 허용하고, Gatekeeper 전체 해제는 하지 마세요. 서명 및 notarization은 이후 릴리스 단계입니다.

The package is for Apple Silicon Macs running macOS 14 or newer. See [docs/standalone-distribution.md](docs/standalone-distribution.md) for the maintainer workflow and [standalone/UNINSTALL.md](standalone/UNINSTALL.md) for removal guidance.

이 패키지는 macOS 14 이상 Apple Silicon Mac용입니다. 제작자 절차는 [docs/standalone-distribution.md](docs/standalone-distribution.md), 제거 방법은 [standalone/UNINSTALL.md](standalone/UNINSTALL.md)를 참고하세요.

## 사용법 / Usage

### Web pages / 웹페이지

- Click the black-and-white floating button near the lower-right edge of the page.
- Click it again to remove translations.
- Turn on **Auto / 자동** in the popup to translate new pages automatically; it is off by default.

- 페이지 우하단의 흑백 플로팅 버튼을 클릭해 번역을 시작합니다.
- 다시 클릭하면 번역을 제거합니다.
- 팝업에서 **Auto / 자동**을 켜면 새 페이지도 자동 번역합니다. 기본값은 꺼짐입니다.

### Selection translation / 선택 번역

Select text on a page and click the translation trigger. Single-word selections show examples and pronunciation; longer selections show a translation popup and copy button.

페이지에서 텍스트를 선택한 뒤 번역 트리거를 클릭합니다. 단어 선택은 예문과 발음 듣기를, 문장 선택은 번역 팝업과 복사 버튼을 제공합니다.

### YouTube subtitles / YouTube 자막

Click the **A가** button in the YouTube player controls. The button cycles through original + translation, original only, translation only, and off. If the source subtitles already match the target language, only the original subtitles are shown.

YouTube 플레이어 컨트롤의 **A가** 버튼을 클릭합니다. 원문+번역, 원문만, 번역만, 끄기 순서로 표시 모드를 전환합니다. 원문 자막이 타겟 언어와 같으면 원문만 표시합니다.

### Models / 모델

Supported models are Hy-MT2 1.8B/7B Q4 and TranslateGemma 4B/12B Q4. The older Gemma 4 models are not supported. Model revisions, sources, and license notes are recorded in [docs/model-licenses.md](docs/model-licenses.md).

지원 모델은 Hy-MT2 1.8B/7B Q4와 TranslateGemma 4B/12B Q4입니다. 이전 Gemma 4 모델은 지원하지 않습니다. 모델 revision, 출처, 라이선스 정보는 [docs/model-licenses.md](docs/model-licenses.md)에 기록되어 있습니다.

## 개발 / Development

```bash
npm run dev          # development build / 개발 모드
npm run build        # production build / 프로덕션 빌드
npm run test         # test suite / 전체 테스트
npm run typecheck    # TypeScript checks / 타입 체크
npm run lint         # ESLint
npm run format       # Prettier
npm run zip          # release ZIP / 배포 ZIP
```

After changing code, run `npm run build`, reload the extension in `chrome://extensions`, and refresh the target page.

코드를 수정한 뒤 `npm run build`를 실행하고 `chrome://extensions`에서 확장 프로그램을 새로고침한 다음 대상 페이지를 새로고침합니다.

### 기술 스택 / Stack

- [WXT](https://wxt.dev/) + Manifest V3
- TypeScript, vanilla DOM APIs
- Vitest + happy-dom
- macOS native messaging + MLX

Architecture and safety notes are in [docs/pipeline.md](docs/pipeline.md), [docs/ui-guide.md](docs/ui-guide.md), and [docs/safety.md](docs/safety.md).

## 기여 / Contributing

Bug reports, feature proposals, documentation fixes, and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

버그 리포트, 기능 제안, 문서 수정, PR을 환영합니다. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요.

## 라이선스, 출처, 배포 / License, attribution, and distribution

The application source is distributed under the [Apache License 2.0](LICENSE). The project includes the required [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) files. Redistribution should preserve those files, credit the original **b3rys translate** project, and identify modifications made in this project.

앱 소스는 [Apache License 2.0](LICENSE)으로 배포합니다. 필요한 [NOTICE](NOTICE)와 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 함께 제공합니다. 재배포 시 해당 문서를 유지하고 원 프로젝트인 **b3rys translate**를 표시하며 이 프로젝트의 변경 사항도 밝혀야 합니다.

TranslateGemma model weights and derivatives are subject to the Google Gemma Terms of Use and use restrictions in addition to the application license. Model-specific information is maintained in [docs/model-licenses.md](docs/model-licenses.md). Model weights are kept out of the Chrome extension ZIP and are downloaded or distributed as a separate bundle.

TranslateGemma 모델 가중치와 파생물에는 앱 라이선스와 별도로 Google Gemma Terms of Use 및 사용 제한이 적용됩니다. 모델별 정보는 [docs/model-licenses.md](docs/model-licenses.md)에 관리합니다. 모델 가중치는 Chrome 확장 프로그램 ZIP에 넣지 않고 별도 다운로드 또는 번들로 배포합니다.

This documentation describes source distribution and Chrome Developer Mode installation. A general consumer macOS release requires a separate Chrome Web Store and native-messaging release review.

이 문서는 소스 배포와 Chrome 개발자 모드 설치를 설명합니다. 일반 사용자 대상 macOS 배포에는 Chrome Web Store와 native-messaging에 대한 별도 릴리스 검토가 필요합니다.
