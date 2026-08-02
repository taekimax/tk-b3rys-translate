# UI 동작 가이드

> 각 UI 요소의 동작을 before/after 예시로 설명.
> 코드를 안 읽어도 결과물이 어떻게 보이는지 이해할 수 있도록.

---

## 1. 플로팅 번역 버튼 (FAB)

화면 우측 하단에 고정. Shadow DOM으로 CSS 격리.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  웹페이지 콘텐츠                                              │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                          ┌───────┐         │
│                                          │ A→가  │ ← FAB   │
│                                          │  ◕    │ ← 배터리 │
│                                          │ A+가  │ ← 모드   │
│                                          └───────┘         │
└─────────────────────────────────────────────────────────────┘
```

### FAB 상태 전이

```
                   클릭
    ┌──────────────────────────────────┐
    │                                  │
    │   ┌────────┐  클릭   ┌─────────┐ │  완료    ┌────────┐
    └──→│  idle  │───────→│ loading │─────────→│  done  │
        │ [A→가] │        │  [↻]    │          │  [✓]   │
        └────────┘        └─────────┘          └────────┘
           ↑    ↑           │    │                │
           │    │     취소   │    │  native 에러    │ 클릭
           │    └───────────┘    │                │ remove
           │                     ▼                │ All
           │               ┌─────────┐            │
           │  3초 자동복귀   │  error  │            │
           └───────────────│  [!]    │←───────────┘
             (일반 에러만)   └─────────┘
                                │
                         circuit breaker
                         에러는 자동복귀 ✗
                         FAB 클릭으로만 리셋

각 상태의 FAB 표시:
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│         │  │  ╭───╮  │  │         │  │         │
│  A→가   │  │  │ ↻ │  │  │   ✓    │  │   !    │
│         │  │  ╰───╯  │  │         │  │         │
│  idle   │  │ loading │  │  done   │  │  error  │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
  클릭→번역    클릭→취소     클릭→제거    클릭→재시작
```

### 모드 토글 (FAB 하단)

```
     ┌──────┐           ┌────┐
     │ A+가 │  ←─────→  │ 가  │
     │ 병행 │   클릭     │대치 │
     └──────┘           └────┘
       ↓                  ↓
  원문+번역 동시 표시    번역만 표시 (원문 숨김)
```

### 배터리 게이지

```
FAB 하단의 사용량 표시:

  ┌──────────────────┐
  │ ██████████░░░░░░ │  63% — 정상 (초록)
  └──────────────────┘

  ┌──────────────────┐
  │ █████████████░░░ │  85% — 경고 (노란색)
  └──────────────────┘

  ┌──────────────────┐
  │ █████████████████│  100% — 한도 초과 (빨간색)
  └──────────────────┘
```

---

## 2. 번역 모드

### Parallel (병행) 모드 — `A+가`

원문과 번역을 함께 표시. CSS: `[data-web-translate-original]` 보임.

```
Before                          After
┌────────────────────────┐      ┌────────────────────────┐
│ The quick brown fox    │      │ The quick brown fox    │
│ jumps over the lazy    │      │ jumps over the lazy    │
│ dog.                   │      │ dog.                   │
└────────────────────────┘      │ 빠른 갈색 여우가 게으른  │
                                │ 개를 뛰어넘는다.         │
                                └────────────────────────┘
```

DOM:

```html
<p>
  <span data-web-translate-original>The quick brown fox...</span>
  <!-- 표시 -->
  <span data-web-translate-translated class="web-translate-translation">빠른 갈색 여우가...</span>
</p>
```

### Replace (대치) 모드 — `가`

원문을 숨기고 번역만 표시. CSS: `body.web-translate-replace-mode [data-web-translate-original] { display: none }`.

```
Before                          After
┌────────────────────────┐      ┌────────────────────────┐
│ The quick brown fox    │      │ 빠른 갈색 여우가 게으른  │
│ jumps over the lazy    │      │ 개를 뛰어넘는다.         │
│ dog.                   │      └────────────────────────┘
└────────────────────────┘
```

DOM (동일 구조, CSS만 전환):

```html
<p>
  <span data-web-translate-original style="display:none">The quick brown fox...</span>
  <span data-web-translate-translated class="web-translate-translation" style="margin-top:0"
    >빠른 갈색 여우가...</span
  >
</p>
```

### 모드 전환 흐름

```
사용자 A+가/가 토글 클릭
  │
  ├─ body.classList.toggle('web-translate-replace-mode')
  │
  ├─ 병행 모드:
  │   body 에 클래스 없음
  │   [data-web-translate-original] → display: 보임
  │   [data-web-translate-translated] → margin-top: 4px (원문 아래)
  │
  └─ 대치 모드:
      body.web-translate-replace-mode
      [data-web-translate-original] → display: none
      [data-web-translate-translated] → margin-top: 0 (원문 자리를 대체)
```

---

## 3. 주입 경로별 Before/After

```
injectTranslation(element, translatedText)
  │
  │  LI 또는 A(LI 안) + ≤60자?
  ├─ YES ──→ 경로 1: 네비 인라인
  │
  │  siteRule.injectAsSibling + inline?
  ├─ YES ──→ 경로 2: 형제 삽입
  │
  │  siteRule.forceReplace?
  ├─ YES ──→ 경로 2.5: 강제 교체
  │
  └─ NO ───→ 경로 3: 블록 내부 (기본)
```

### 경로 1: 네비 메뉴 (LI ≤ 60자) — 인라인 삽입

GitHub 사이드바 같은 짧은 메뉴 아이템. 라벨 스팬 안에 번역 삽입.

```
Before                          After (parallel)
┌──────────────────┐            ┌──────────────────────────────┐
│ 🏠 Public profile│            │ 🏠 Public profile 공개 프로필  │
│ 👤 Account       │            │ 👤 Account 계정               │
│ ⚙️ Settings      │            │ ⚙️ Settings 설정              │
└──────────────────┘            └──────────────────────────────┘

After (replace)
┌──────────────────┐
│ 🏠 공개 프로필    │
│ 👤 계정          │
│ ⚙️ 설정          │
└──────────────────┘
```

DOM:

```html
<li>
  <a href="/settings/profile">
    <svg>...</svg>
    <span class="label">
      Public profile
      <span data-web-translate-translated class="web-translate-translation-inline"
        >공개 프로필</span
      >
    </span>
  </a>
</li>
```

### 경로 2: 형제 삽입 (Substack injectAsSibling)

인라인 컨테이너 뒤에 별도 span으로 삽입. 내부 삽입 시 레이아웃이 깨지는 사이트용.

```
Before                          After
┌──────────────────────┐        ┌──────────────────────┐
│ "Great article!"     │        │ "Great article!"     │
└──────────────────────┘        │ "좋은 글이네요!"       │
                                └──────────────────────┘

DOM 구조:
┌──────────────────────────────────────────────────────┐
│ <span data-web-translate-original>Great article!</span>      │
│ <span data-web-translate-translated>좋은 글이네요!</span>     │ ← 형제로 삽입
└──────────────────────────────────────────────────────┘
```

### 경로 2.5: forceReplace (Gmail)

Gmail 이메일 목록. `markOriginalContent()`로 원문 마킹 후 번역 추가.

```
Before                               After (parallel)
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ Meeting tomorrow at 3pm      │     │ Meeting tomorrow at 3pm      │
│ Hi, just a reminder...       │     │ 내일 오후 3시에 회의           │
└──────────────────────────────┘     │ Hi, just a reminder...       │
                                     │ 안녕하세요, 리마인더...        │
                                     └──────────────────────────────┘

After (replace)                      markOriginalContent 동작:
┌──────────────────────────────┐     ┌──────────────────────────┐
│ 내일 오후 3시에 회의           │     │ <span data-web-translate-original> │
│ 안녕하세요, 리마인더...        │     │   Meeting tomorrow...     │
└──────────────────────────────┘     │ </span>                   │
                                     │ <span data-web-translate-translated>│
                                     │   내일 오후 3시에 회의      │
                                     │ </span>                   │
                                     └──────────────────────────┘
```

### 경로 3: 일반 블록 (기본)

대부분의 웹페이지. `<p>`, `<h1>` 등 블록 요소 안에 삽입.

```
Before                               After (parallel)
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ <h2>Introduction</h2>          │   │ <h2>Introduction               │
│                                │   │ 소개</h2>                       │
│ <p>This framework provides     │   │                                │
│ a modular architecture for     │   │ <p>This framework provides     │
│ building web extensions.</p>   │   │ a modular architecture for     │
└────────────────────────────────┘   │ building web extensions.       │
                                     │ 이 프레임워크는 웹 확장 프로그램 │
                                     │ 을 위한 모듈식 아키텍처를        │
                                     │ 제공합니다.</p>                  │
                                     └────────────────────────────────┘
```

**짧은 텍스트 (≤ 60자)**: 인라인으로 옆에 표시

```
Before                          After
┌──────────────┐                ┌──────────────────────────┐
│ Read more    │                │ Read more 더 보기         │
└──────────────┘                └──────────────────────────┘
                                         ↑
                                class: web-translate-translation-inline
```

**제목 (H1-H6)**: 항상 블록으로 아래에 표시 (길이 무관)

```
Before                          After
┌──────────────┐                ┌──────────────┐
│ Summary      │                │ Summary      │
└──────────────┘                │ 요약          │
                                └──────────────┘
                                      ↑
                                class: web-translate-translation
```

---

## 4. markOriginalContent 상세

번역 주입 전에 원문을 마킹하는 핵심 함수. 모드 전환(병행/대치)을 가능하게 함.

```
Before markOriginalContent():
┌──────────────────────────────────────┐
│ <p>                                  │
│   "Hello "         ← 텍스트 노드      │
│   <a>world</a>    ← 인라인 요소       │
│   <img src="..">  ← 비텍스트 요소     │
│ </p>                                 │
└──────────────────────────────────────┘

After markOriginalContent():
┌──────────────────────────────────────────────────┐
│ <p>                                              │
│   <span data-web-translate-original>"Hello "</span>      │ ← 텍스트 노드 → span 래핑
│   <a data-web-translate-original>world</a>               │ ← 기존 요소에 속성 추가
│   <img src="..">                                 │ ← 비텍스트는 그대로
│ </p>                                             │
└──────────────────────────────────────────────────┘

After 번역 삽입:
┌──────────────────────────────────────────────────┐
│ <p>                                              │
│   <span data-web-translate-original>"Hello "</span>      │
│   <a data-web-translate-original>world</a>               │
│   <img src="..">                                 │
│   <span data-web-translate-translated>안녕 세계</span>    │ ← 번역문 추가
│ </p>                                             │
└──────────────────────────────────────────────────┘

병행 모드: [data-web-translate-original] 표시 + [data-web-translate-translated] 표시
대치 모드: [data-web-translate-original] 숨김 + [data-web-translate-translated] 표시
```

---

## 5. YouTube 이중자막 오버레이

YouTube 네이티브 자막을 숨기고 커스텀 오버레이로 대체.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                    (영상 화면)                         │
│                                                      │
│                                                      │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │  The quick brown fox jumps over the lazy dog │   │  ← 원문 (흰색, 큰 폰트)
│   │  빠른 갈색 여우가 게으른 개를 뛰어넘는다          │   │  ← 번역 (노란색 #fde68a)
│   └──────────────────────────────────────────────┘   │
│                                                      │
│  ▶  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🔊  ⚙  ⛶        │
└──────────────────────────────────────────────────────┘

위치: 영상 하단 8%
폰트: clamp(16px, 2.2vw, 36px) — 전체화면 시 자동 확대
각 줄: 원문/번역 각 1줄 표시 (overflow: hidden + ellipsis)
```

### 번역 상태별 표시

```
번역 완료:
┌──────────────────────────────────────────────┐
│  The quick brown fox jumps                   │  ← 원문
│  빠른 갈색 여우가 뛰어넘는다                     │  ← 번역 (opacity: 1)
└──────────────────────────────────────────────┘

번역 대기 중:
┌──────────────────────────────────────────────┐
│  The quick brown fox jumps                   │  ← 원문
│  ...                                         │  ← 로딩 (opacity: 0.5)
└──────────────────────────────────────────────┘

자막 없는 구간:
┌──────────────────────────────────────────────┐
│                 (오버레이 숨김)                 │
└──────────────────────────────────────────────┘
```

### Seek 동작 (깜빡임 방지)

```
시간축: ──────────────────────────────────────→

        cue A          cue B      cue C
원래:  ├─────────────┤├──────────┤├──────────┤

사용자 seek:
        ▼ 현재 위치      ────→ seek ────→ ▼ 새 위치
        cue A                              cue C

오버레이 동작:
  1. seeked 이벤트 감지
  2. isSeeking = true → 오버레이 숨김 (이전 자막 깜빡임 방지)
  3. 새 cue 감지 (timeupdate)
  4. isSeeking = false → 새 자막 표시
```

### YouTube 번역 파이프라인 (간략)

```
YouTube 자막 켜기
  │
  ├─ 네이티브 자막 감지 (MutationObserver)
  │
  ├─ cue 추출 + heuristic merge
  │   ┌────────────────────────────────────┐
  │   │ 병합 규칙:                          │
  │   │  MAX_CHARS: 70자 이내 병합          │
  │   │  MAX_TIME: 4초 이내 병합            │
  │   │  80자 초과: 후처리 분할              │
  │   │  20자 미만: 인접 cue에 흡수          │
  │   └────────────────────────────────────┘
  │
  ├─ rolling translation (이벤트 기반)
  │   ┌────────────────────────────────────┐
  │   │  현재 cue + 120초 look-ahead       │
  │   │                                    │
  │   │  우선 배치 (5개) → 빠른 응답        │
  │   │  나머지 (20개씩) → 백그라운드        │
  │   └────────────────────────────────────┘
  │
  └─ 오버레이 표시 (원문 + 번역)
```

---

## 6. 선택 번역 팝업

텍스트 드래그 → 트리거 버튼 → 팝업. Shadow DOM으로 CSS 격리.

### 전체 흐름

```
사용자 텍스트 드래그
  │
  ├─ mouseup 이벤트
  │
  ├─ 선택 영역 마지막 줄 오른쪽 끝에 트리거 버튼 표시
  │   ┌─────────────────────────────────┐
  │   │ selected text here        [번역] │ ← 트리거 버튼
  │   └─────────────────────────────────┘
  │
  ├─ 트리거 버튼 클릭
  │   │
  │   ├─ 공백 포함? (여러 단어)
  │   │   └─ 문장 모드
  │   │
  │   └─ 공백 없음? (단일 단어)
  │       └─ 단어 모드
  │
  └─ 팝업 position: absolute (스크롤 시 함께 이동)
```

### 문장 모드 (여러 단어)

```
선택: "The architecture provides modularity"

┌──────────────────────────────────────┐
│ 이 아키텍처는 모듈성을 제공합니다       │
│                                [복사] │
└──────────────────────────────────────┘
```

### 단어 모드 (공백 없는 단일 단어)

```
선택: "modularity"

┌──────────────────────────────────────┐
│ modularity → 모듈성                   │
│                                      │
│ 1. The system's modularity allows    │
│    시스템의 [모듈성]은 허용합니다       │
│ 2. We value modularity in design     │
│    우리는 설계의 [모듈성]을 중시합니다  │
└──────────────────────────────────────┘
      ↑ 예문 2개, 단어 하이라이트 [  ]
```

### FAB 연동

```
FAB on  → 선택 번역 활성
FAB off → 선택 번역 비활성 (트리거 버튼 표시 안 됨)

┌──────────┐     ┌──────────────────┐
│ FAB 표시  │ ──→ │ 선택 번역 활성    │
│ (on)     │     │ 드래그 시 버튼 표시│
└──────────┘     └──────────────────┘

┌──────────┐     ┌──────────────────┐
│ FAB 숨김  │ ──→ │ 선택 번역 비활성  │
│ (off)    │     │ 드래그 해도 무반응 │
└──────────┘     └──────────────────┘
```

---

## 7. 팝업 설정 페이지

```
┌────────────────────────────────┐
│  web-translate  ⚙ Settings  │
├────────────────────────────────┤
│                                │
│  로컬 MLX 모델:                 │
│  ┌──────────────────────────┐  │
│  │ ● Hy-MT2 7B (Q4)         │  │
│  │ ○ Hy-MT2 1.8B (Q4)       │  │
│  │ ○ TranslateGemma 4B (Q4) │  │
│  │ ○ TranslateGemma 12B(Q4) │  │
│  └──────────────────────────┘  │
│                                │
│  모델 상태: 준비됨             │
│  [모델 정보 · 라이선스]        │
│                                │
│  ┌────┐  번역 자동 시작         │
│  │ ✓  │  (새 페이지 방문 시)    │
│  └────┘                        │
│                                │
│  ┌────┐  플로팅 버튼 표시        │
│  │ ✓  │                        │
│  └────┘                        │
│                                │
│  번역은 이 Mac에서 처리됩니다. │
│  외부 LLM API를 사용하지 않음  │
│                                │
└────────────────────────────────┘
```

- 모델을 선택하면 파일이 없을 때 고정 revision 자동 다운로드를 시작함
- TranslateGemma는 Google Gemma Terms of Use와 사용 제한 확인 후 다운로드함
- 모델 정보 표에서 source revision과 license 링크를 확인
- 모델 파일과 번역 요청은 로컬 macOS native host에서 처리
