# 개인정보 처리방침 / Privacy Policy

**최종 수정일 / Last Updated:** 2026-07-30

## 한국어

b3rys translate는 웹페이지와 YouTube 자막을 사용자가 고른 언어로 번역합니다. 이 포크는 로컬 MLX 모델만 사용합니다. 번역 텍스트, API 키, 계정 정보, 사용량 정보는 어떤 클라우드 LLM 제공자나 개발자 서버에도 전송하지 않습니다.

로컬에 저장되는 데이터는 모델 선택과 버튼 설정, 그리고 7일 후 만료되는 번역 캐시(최대 4,000개)입니다. 모델 가중치는 사용자가 별도 내려받아 `.local-models/`에 보관하며 Git에 포함되지 않습니다. `storage`, `activeTab`, `nativeMessaging`, 페이지 접근 권한은 설정·캐시 저장, 현재 페이지의 텍스트 읽기, 그리고 macOS의 로컬 호스트와 통신하는 데만 사용됩니다.

확장을 제거하면 Chrome 저장 데이터가 삭제됩니다. 모델 파일은 사용자가 별도로 관리합니다.

## English

b3rys translate translates web pages and YouTube subtitles using local MLX models only. This fork sends no translation text, API keys, account data, or usage data to a cloud LLM provider or developer-operated server.

The extension stores only the selected model, button settings, and a translation cache (up to 4,000 entries, expiring after seven days). Model weights are separately downloaded into `.local-models/` and are never committed. `storage`, `activeTab`, `nativeMessaging`, and page access are used solely for settings/cache, reading the current page, and communicating with the local macOS host.

Uninstalling removes Chrome storage. Model files remain under the user's control.
