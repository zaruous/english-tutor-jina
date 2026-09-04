# 코드 리뷰 — 데스크탑 좌측 사이드바 내비게이션 결함 (2026-08-30)

- 리뷰어: **Codex CLI** (`D:git	mpcoworks` 의 `codex-live-chat.js` 세션, 모델 CLI 기본값). 요청서: coworks `prompts/jina-sidebar-review-2026-08-30.md`, 대화 로그: coworks `codex-live-chat.md`
- 신고: 데스크탑에서 왼쪽 메뉴를 클릭하면 화면이 바뀌지 않고 레이아웃이 깨진다.

## 재현 결과 (Playwright MCP, 2026-08-30)

| 확인 | 결과 |
|---|---|
| 대시보드 좌측 사이드바 `Jina와 대화` 클릭 | 무반응 — 대시보드 그대로 |
| 상단 탭으로 회화/학습/단어장/통계 이동 | 페이지마다 좌측 영역이 다른 것(세션 목록 280px · 없음 · 자체 탭 240px)으로 바뀜 |
| 1440px / 1100px | 대시보드 정상 |
| 900px | 대시보드 카드 텍스트가 세로로 깨짐(고정 240px 사이드바 + 접히지 않는 `1.4fr 1fr` / `1fr 1fr 1fr` 그리드), 회화 채팅 영역 ~280px |

원인: `DashboardDesktop({ theme })`가 셸이 넘긴 `onNavigate`를 버려 사이드바·히어로·오늘의 학습·첨삭·추천 카드의 이동 버튼이 전부 무반응(`onNavigate && …` 가드가 조용히 삼킴). `NavItem`엔 `onClick`이 없고 `대시보드`는 `active` 하드코딩. 사이드바가 대시보드 페이지 내부에만 있어 다른 페이지에서 사라짐.

## Codex 리뷰 원문

## 결론 — 권장안

원인 분석은 맞습니다. 직접적인 무반응 원인은 두 가지입니다.

1. `NavItem`에 클릭 처리 자체가 없습니다.
2. `DashboardDesktop({ theme })`가 `onNavigate`를 버려 카드 내부 이동 버튼도 무반응입니다.

다만 “레이아웃이 깨진다”는 현상은 클릭 결과가 아니라 페이지별로 좌측 영역의 역할과 폭이 달라지는 구조적 불일치일 가능성이 큽니다. 발췌 코드만으로 별도의 CSS 파손을 확정할 수는 없지만, 대시보드의 고정 다단 그리드도 좁은 데스크탑에서 실제 오버플로를 만들 수 있습니다.

권장안은 **(A) 공통 데스크탑 사이드바를 `main.jsx`의 앱 셸로 올리는 것**입니다. 단, 기존 `TopNav`와 사이드바가 같은 페이지 이동을 중복 제공하면 안 됩니다.

- 공통 사이드바: 데스크탑의 1차 내비게이션
- `TopNav`: 설정·계정·상태 같은 유틸리티 헤더로 축소
- 회화 세션 목록, 단어장 탭, 통계 탭: 각 페이지의 2차 내비게이션으로 유지

단기 핫픽스가 필요하면 먼저 (B)를 적용할 수 있지만, 페이지 전환 후 공통 사이드바가 사라지는 문제는 해결하지 못합니다.

## 근거

### 확인된 결함

- `Sidebar`의 모든 `NavItem`에는 `onClick`이 없습니다. 현재 사이드바는 시각적으로만 버튼입니다.
- 대시보드의 `active`가 항상 `true`이므로 현재 페이지를 반영하지 않습니다.
- `DashboardDesktop`은 `onNavigate`를 구조분해하지 않고 모든 하위 카드에도 전달하지 않습니다.
- 따라서 `HeroCard`, `TodayPlan`, `CorrectionsCard`, `RecommendCard` 등의 가드가 예외를 숨기면서 클릭을 조용히 무시합니다.
- `RecommendCard`의 “전체 보기”는 발췌 범위상 `onClick` 자체가 없어 별도로 연결해야 합니다.
- `ProgressDesktop`의 사이드 항목은 `<div>`이고 `active: true`가 하드코딩되어 있습니다. 실제 탭 전환을 의도했다면 또 다른 독립 결함입니다.

### 추가로 의심되는 레이아웃 원인

대시보드는 좌측 240px 사이드바가 있지만 다른 페이지는 0px, 240px 또는 280px짜리 서로 다른 `<aside>`를 사용합니다. 페이지 이동 때 콘텐츠 시작점과 가용 폭이 급변하므로 사용자에게 레이아웃 파손처럼 보일 수 있습니다.

또한 대시보드에는 다음 고정 그리드가 있습니다.

- `1.4fr 1fr`
- `1fr 1fr 1fr`

공통 사이드바와 페이지별 보조 사이드바를 동시에 표시하면 최대 520px가 먼저 소비됩니다. 좁은 노트북 화면에서 카드의 내부 최소 폭 때문에 그리드가 넘칠 수 있습니다. `minmax(0, ...)`, 반응형 단수 전환과 보조 사이드바 축소가 필요합니다.

## 방안 비교

### A. 공통 사이드바를 앱 셸로 이동

장점:

- 어느 페이지에서도 동일한 위치와 방식으로 이동할 수 있습니다.
- `active`를 `JinaApp.page` 하나에서 정확하게 계산할 수 있습니다.
- 모바일 `AppMobileNav`와 같은 내비게이션 모델을 사용하게 됩니다.
- 페이지 컴포넌트가 전역 이동 UI를 중복 구현하지 않게 됩니다.

주의점:

- 기존 `TopNav`와 기능이 중복됩니다.
- 회화 280px, 단어장·통계 240px 보조 사이드바와 함께 표시하면 폭이 부족할 수 있습니다.
- 기존 `Sidebar`는 `useDashboard()`에 의존합니다. 현재 Provider 바깥으로 그대로 이동하면 캔버스 또는 앱 셸에서 fallback 데이터가 표시될 수 있습니다.
- `.jina-root` 바깥으로 이동하면 버튼 리셋이 적용되지 않아 UA 기본 버튼 스타일이 나타날 가능성이 있습니다. 모바일 탭에 이미 같은 문제를 방어한 주석이 있습니다.

권장 구현은 기존 `Sidebar`를 그대로 옮기기보다 전역 이동만 담당하는 `AppDesktopSidebar`로 분리하는 것입니다. 사용자/목표 정보가 꼭 필요하다면 사이드바까지 `DashboardProvider` 안에 배치합니다.

### B. 대시보드 내부에서만 연결

장점:

- 수정량과 회귀 범위가 작습니다.
- `canvas.html`의 대시보드 아트보드 구조가 유지됩니다.
- Provider 위치를 바꿀 필요가 없습니다.

단점:

- 다른 페이지로 이동하는 순간 공통 사이드바가 사라집니다.
- 페이지별 좌측 레이아웃 불일치가 그대로입니다.
- `TopNav`와 대시보드 사이드바가 계속 중복됩니다.

따라서 B는 긴급 핫픽스로만 적합합니다.

## 구체적 변경 목록

### `src/main.jsx`

- 데스크탑 콘텐츠 영역에 `AppDesktopSidebar`와 현재 페이지를 나란히 배치합니다.
- `page`, `onNavigate={setPage}`, `theme`를 사이드바에 전달합니다.
- 사이드바가 `useDashboard()`를 사용한다면 `DashboardProvider` 내부에 놓습니다.
- `TopNav`의 페이지 탭은 제거하거나 유틸리티 헤더로 축소합니다. 당장 유지한다면 `aria-current="page"`를 추가합니다.
- 알 수 없는 `page`가 대시보드로 렌더링될 때 state는 그대로 남는 문제가 있으므로, 허용된 ID만 `setPage`에 전달하는 `navigate()` 함수도 고려합니다.

### `src/screens/dashboard-desktop.jsx`

- 최소 수정 시:

```jsx
function DashboardDesktop({ theme, onNavigate }) {
  // ...
  <Sidebar theme={theme} page="dashboard" onNavigate={onNavigate} />
  <HeroCard theme={theme} onNavigate={onNavigate} />
  <TodayPlan theme={theme} onNavigate={onNavigate} />
  <RecommendCard theme={theme} onNavigate={onNavigate} />
  <CorrectionsCard theme={theme} onNavigate={onNavigate} />
}
```

- `NavItem`에 `pageId`, `onNavigate`, `disabled`를 추가합니다.
- `active`는 `page === pageId`로 계산하고 하드코딩을 제거합니다.
- 모든 버튼에 `type="button"`을 명시합니다.
- 현재 항목에는 `aria-current="page"`를 적용합니다.
- 공통 셸 전환 시 `Sidebar`를 이 파일에서 제거하되, 캔버스 호환이 필요하면 `showAppSidebar = true` 같은 명시적 옵션으로 기존 아트보드를 보존할 수 있습니다.
- 다단 그리드는 `minmax(0, …)`를 사용하고 좁은 폭에서는 2열/1열로 낮춥니다.

### 공통 내비게이션 파일

`src/shared/app-nav.jsx` 또는 새 `src/shared/app-desktop-sidebar.jsx`에 모바일과 공유하는 페이지 정의를 둡니다. `APP_PAGES`가 `main.jsx` 지역 상수로만 남아 있으면 사이드바와 목록이 다시 어긋날 가능성이 큽니다.

전역 컴포넌트 방식이므로 `index.html`에서 `main.jsx`보다 먼저 로드하고 `window.AppDesktopSidebar`로 노출해야 합니다.

### 회화·단어장·통계 화면

- 기존 `<aside>`는 “세션/페이지 내부 탭”을 위한 2차 내비게이션으로 유지합니다.
- `aria-label`로 역할을 구분합니다.

```jsx
<aside aria-label="주요 메뉴">...</aside>
<aside aria-label="회화 세션">...</aside>
```

- 공통 사이드바는 약 216~240px, 보조 사이드바는 240~280px로 두되 좁은 화면에서는 보조 사이드바를 접을 수 있게 합니다.
- 단어장과 통계의 Jina 로고는 전역 사이드바와 중복되므로 제거하는 편이 좋습니다.
- `ProgressDesktop`의 탭이 실제 기능이라면 `<div>`를 `<button>`으로 바꾸고 로컬 탭 state로 active를 계산합니다.

### 미구현 메뉴

**비활성 버튼 + “준비 중” 라벨**을 권장합니다. 예정 기능을 보여주면서도 잘못된 페이지로 이동시키지 않습니다.

- `disabled` 또는 `aria-disabled="true"` 적용
- 낮은 대비와 `cursor: not-allowed`
- 텍스트로 보이는 “준비 중” 배지 제공
- 가장 가까운 페이지로 임의 매핑하지 않기

스피킹을 회화로 보내는 식의 매핑은 사용자가 선택한 기능과 실제 도착지가 달라 혼란을 키웁니다. 출시 계획이 전혀 없다면 숨기는 편이 낫습니다.

## 회귀 체크리스트

- 대시보드 사이드바의 5개 구현 메뉴가 올바른 `page`로 이동하는지
- 카드의 회화·학습 이동 버튼이 작동하는지
- 현재 메뉴만 `aria-current="page"`를 갖는지
- Enter/Space로 메뉴를 실행할 수 있는지
- 미구현 메뉴가 포커스·클릭 시 잘못 이동하지 않는지
- 회화에서 공통 사이드바와 세션 사이드바가 동시에 표시돼도 채팅 영역이 넘치지 않는지
- 1024px·1280px·1440px 폭에서 대시보드 그리드가 가로로 넘치지 않는지
- 단어장·통계의 보조 내비게이션이 공통 내비게이션처럼 보이지 않는지
- `canvas.html`에서 `DashboardDesktop`을 Provider 없이 렌더해도 예외가 없는지
- 새 전역 컴포넌트의 스크립트 로드 순서가 올바른지
- `.jina-root` 밖의 새 사이드바 버튼에 기본 회색 버튼 스타일이 나타나지 않는지
- Playwright의 광범위한 `header button`·`aside button` 셀렉터가 새 버튼 수/순서 때문에 오작동하지 않는지

E2E는 가능한 한 `header button`이나 `aside button:nth-child(...)` 대신 `getByRole('button', { name: '단어장' })` 또는 안정적인 `data-testid`로 변경하는 것이 안전합니다.

## 적용한 수정 (권장안 A)

- `src/shared/app-nav.jsx`: 페이지 단일 소스 `APP_PAGES`(soon/mobile 플래그, group) · `AppDesktopSidebar`(모든 페이지 공통 1차 내비, `aria-current`, 준비 중 항목은 `disabled`+배지, 1300px 미만은 72px 아이콘 레일) · `useMediaQuery` 훅 · `AppMobileNav`도 `APP_PAGES` 소비
- `src/main.jsx`: 셸에 `AppDesktopSidebar` 배치, `TopNav`는 현재 페이지 제목 + 사용자 칩 + 설정만(페이지 탭 제거), `navigate()`가 허용 id만 라우팅
- `src/screens/dashboard-desktop.jsx`: `onNavigate`를 모든 카드에 전달, 내부 `Sidebar`는 캔버스 아트보드 전용(`withSidebar`)으로만 렌더하되 클릭은 동작, 2단 그리드는 ≤1000px에서 1단 + `minmax(0, …)`, 통계 스트립은 `auto-fit`
- `src/screens/conversation-desktop.jsx` / `lesson.jsx`: 죽어 있던 ← 버튼을 대시보드로 연결, `<aside aria-label>`로 1차/2차 내비 구분
- `src/app.jsx`: 캔버스 대시보드 아트보드는 `withSidebar`로 기존 룩 유지
- E2E: `header button` → `aside[aria-label="주요 메뉴"] button`, 회화의 `aside.first()` → `aside[aria-label="회화 세션"]`, 대시보드 스위트에 사이드바 이동·aria-current·준비 중 비활성 검증 추가

### 검증

- Playwright E2E 6종 **147/147** (dashboard 28 · vocab 16 · conversation 14 · lesson 20 · progress 29 · auth 40). 회화·단어장은 `AI_PROVIDER=claude` 인스턴스(3103/3104, `E2E_BASE`/`E2E_API`)에서 실행 — 3003/3004에 떠 있던 사용자 서버는 `.env`가 ollama라 AI 호출이 503이었다(내비 변경과 무관).
- 수정 중 잡은 회귀 1건: TopNav 제목을 `<h1>`로 넣었더니 페이지 자체 `h1`보다 앞에 와서 `h1.first()` 단정이 깨짐 → heading 아닌 라벨(`div`)로 변경.
- MCP 캡처: 1440px 대시보드/회화(공통 사이드바 + 페이지 보조 사이드바 공존), 1100px 아이콘 레일.

### 추가 수정 — HeroCard 찌부러짐 (사용자 지정 XPath `/html/body/div/div/div/div/div/div/div/div[1]`)

- 증상: 대시보드 첫 카드(HeroCard)가 높이 58px 로 잘려 아바타 반쪽과 시각 칩만 보이고 인사 문구·CTA 가 안 보임(내용은 188px). 내비 수정 전 캡처에도 있던 기존 버그.
- 원인: 부모가 `display:flex; flex-direction:column; overflow:auto` 인데 HeroCard 만 `overflow:hidden`(오브 장식 클리핑용) → flex 아이템의 자동 최소 높이(`min-height:auto`)가 0 으로 바뀌어 다른 카드 대신 이 카드만 `flex-shrink` 로 눌림.
- 수정: `flexShrink: 0` — `HeroCard`, `DashSkel`(스켈레톤), 모바일 인사 카드(`mobile.jsx`), 회화 우측 점수 카드(같은 패턴 방어). 수정 후 246px, `h1` 완전 노출.

미적용(후속): `ProgressDesktop` 자체 사이드 항목이 `<div>`+`active` 하드코딩(실제 탭 전환 의도라면 별도 작업), `RecommendCard` "전체 보기" 목적지 없음, 회화 화면의 보조 사이드바/피드백 패널 접힘.
