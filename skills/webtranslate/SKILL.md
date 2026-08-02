---
name: webtranslate
description: web-translate Chrome 확장을 설치하고 로컬 MLX native host와 Hy-MT2 모델을 설정하는 방법을 안내한다. 사용자가 `/webtranslate`을 실행하거나 번역 확장 설치·사용법을 요청하면 사용.
allowed-tools: Bash, Read, WebFetch
---

# web-translate 설치 및 사용 가이드 (`/webtranslate`)

이 스킬은 `web-translate`의 소스 또는 GitHub Release를 받아 Chrome에 로드하고,
macOS 로컬 MLX host와 기본 Hy-MT2 7B Q4 모델을 설정하는 과정을 안내한다.
번역은 로컬 host에서 처리되며 외부 LLM API 키가 필요하지 않다.

## 보안 원칙

- API 키를 요청하거나 채팅으로 받지 않는다. 이 앱은 API 키를 사용하지 않는다.
- `chrome://extensions` 조작은 사용자가 직접 하도록 단계별로 안내한다.
- 사용자가 지정한 GitHub 저장소 또는 프로젝트의 공식 Release만 사용한다.
- 설치 스크립트에 extension ID를 전달하기 전에 Chrome에서 현재 로드된 확장 ID를 사용자가 확인하도록 한다.
- 모델 약관, 라이선스, 다운로드 출처를 숨기지 않는다. Gemma 4는 지원하지 않으며, TranslateGemma는 약관 확인 후에만 다운로드한다.

## 시작 전 확인

1. 사용자가 GitHub URL을 주면 그 저장소를 사용한다. URL이 없으면 현재 프로젝트 저장소를 물어보거나 사용자가 지정한 저장소를 사용한다.
2. macOS와 Chrome/Chromium 계열 브라우저가 있는지 확인한다.

```bash
ls "/Applications/Google Chrome.app" 2>/dev/null && echo "Chrome OK" || echo "Chromium 계열 브라우저를 확인하세요"
command -v gh >/dev/null && echo "gh OK" || echo "curl 사용"
```

## Phase 1 — Release 또는 소스 받기

Release가 있으면 최신 Chrome zip을 고정된 설치 폴더에 풀고 `manifest.json`이 실제로 있는 폴더를 찾는다.

```bash
DEST="$HOME/web-translate"
mkdir -p "$DEST"
gh release download --repo <owner/repo> --pattern "*chrome*.zip" --dir "$DEST" --clobber
ZIP=$(ls "$DEST"/*chrome*.zip | head -1)
unzip -o "$ZIP" -d "$DEST/extension"
find "$DEST/extension" -maxdepth 2 -name manifest.json -print
```

Release가 없으면 소스 폴백을 사용한다.

```bash
git clone https://github.com/<owner>/<repo>.git "$HOME/web-translate-src"
cd "$HOME/web-translate-src"
npm install
npm run build
find dist -maxdepth 2 -name manifest.json -print
```

## Phase 2 — Chrome에 로드

`chrome://extensions`는 사용자가 직접 조작한다.

1. `chrome://extensions`를 연다.
2. 개발자 모드를 켠다.
3. **압축해제된 확장 프로그램을 로드합니다**를 클릭한다.
4. `manifest.json`이 들어 있는 `dist/chrome-mv3` 또는 Release 폴더를 선택한다.
5. 카드 이름이 **web-translate**인지 확인한다.
6. 카드의 **ID**를 복사한다. 이 ID는 native host의 허용 origin에 사용한다.

압축해제된 확장은 폴더를 옮기거나 삭제하면 깨질 수 있다. 코드 업데이트 후에는 같은 카드의 새로고침을 누르고 대상 웹페이지도 새로고침한다.

## Phase 3 — native host 설치

앱이 로드된 macOS에서 다음을 실행한다.

```bash
cd native-host
./install-host.sh <chrome-extension-id>
./verify-host.sh <chrome-extension-id>
```

오프라인 Hy-MT2 7B 번들을 받은 경우에는 설치 명령의 두 번째 인자로 전달하면
native host 모델 저장소에 함께 설치된다.

```bash
./install-host.sh <chrome-extension-id> /path/to/web-translate-0.6.0-hy-mt2-7b-q4.tar.zst
```

설치 스크립트는 Swift, Xcode Metal toolchain, CMake를 확인하고 `web-translate-local-mlx-host`와 `mlx.metallib`를 빌드한다. 설치 경로는 `~/Library/Application Support/web-translate/native-host/`이며 모델은 `~/Library/Application Support/web-translate/models/`에 저장된다.

기존 b3rys translate 설치에서 업그레이드하는 경우 기존 모델 디렉터리와 Chrome 저장값을 한 번만 읽어오는 호환 경로가 있다. 그래도 native host를 새 extension ID로 다시 설치하고, 설치 후 `verify-host.sh`가 성공하는지 확인한다.

## Phase 4 — 모델 다운로드와 사용

팝업에서 `Hy-MT2 7B (Q4)`를 기본으로 확인한다. 모델 파일이 없으면 모델을 선택한 뒤 native host가 고정된 Hugging Face revision에서 자동으로 다운로드한다. TranslateGemma를 선택하면 Google Gemma Terms of Use와 사용 제한을 확인하고 동의한 뒤 자동 다운로드가 시작된다. 번역 텍스트는 외부 LLM 서비스로 전송되지 않는다.

공개 모델 카탈로그:

- Hy-MT2 7B Q4 — 기본 모델, Apache-2.0, 약 3.95 GiB
- Hy-MT2 1.8B Q4 — Apache-2.0, 약 0.95 GiB
- TranslateGemma 4B Q4 — Gemma Terms of Use, 약 2.18 GiB
- TranslateGemma 12B Q4 — Gemma Terms of Use, 약 6.21 GiB

각 모델의 source revision과 라이선스 링크는 팝업의 모델 정보 표와 저장소의 `docs/model-licenses.md`에서 확인한다. Hy-MT2 7B 오프라인 번들은 저장소 루트의 `.local-models`에서 `npm run package:hy-mt2-7b`로 만들 수 있다.

## Phase 5 — 기능 확인

- 웹페이지: 우측 하단 플로팅 버튼을 눌러 원문 아래 번역이 나타나는지 확인한다.
- 선택 번역: 텍스트를 드래그해 번역 팝업이 나타나는지 확인한다.
- YouTube: 플레이어 컨트롤의 `A가` 버튼을 눌러 원문+번역 자막을 확인한다.

문제가 있으면 먼저 host 설치 ID, `verify-host.sh` 결과, Chrome 확장 새로고침 여부, 선택 모델 파일 상태를 확인한다. API 키나 비용 설정을 찾지 않는다.

## 업데이트와 제거

- 업데이트: 새 Release를 풀거나 소스를 다시 빌드하고 Chrome 확장을 새로고침한다. native host 파일을 바꿨다면 `install-host.sh`와 `verify-host.sh`를 다시 실행한다.
- 제거: Chrome 확장 제거 후 native host 설치 디렉터리와 `NativeMessagingHosts/com.webtranslate.translate.local_mlx.json`을 사용자가 확인해 제거한다. 모델 파일은 별도로 남을 수 있다.
