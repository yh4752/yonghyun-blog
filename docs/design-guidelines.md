# 디자인 가이드라인

## 디자인 목표

목표는 "AI가 만든 템플릿 같은 사이트"가 아니라, 기술 글을 오래 읽고 싶게 만드는 감각적인 개인 아카이브다.

## 전체 인상

- 조용하지만 세련된 editorial technical blog.
- 개발자 포트폴리오지만 SaaS 랜딩 페이지처럼 보이지 않게 한다.
- AI, RAG, 검색 인프라를 다루더라도 과한 미래지향 그래픽이나 네온 효과를 쓰지 않는다.
- 첫 화면은 "기술 스택 나열"보다 "어떤 문제를 어떻게 생각하는 개발자인가"를 먼저 보여준다.
- 채용 담당자가 모바일로 열었을 때도 첫인상이 깔끔해야 한다.

## 타이포그래피 시스템

타이포그래피를 핵심 디자인 요소로 둔다. 이미지, 색상, 그래픽이 없어도 읽기 좋은 글 구조를 먼저 만든다.

폰트 선택:

- 본문 한국어: [Pretendard](https://github.com/orioncactus/pretendard)
- 본문 영문 fallback: Geist Sans
- 코드, 메타데이터, 날짜, 태그: [Geist Mono](https://vercel.com/font)

한국어 본문 타이포그래피 수치:

- 본문 폰트 크기: 16-18px. 모바일에서는 16px를 기본값으로 둔다.
- 행간: 1.75-1.85. 한국어는 라틴 문자보다 행간을 더 넓게 잡아야 읽기 편하다.
- 자간: 0. 음수 letter-spacing은 쓰지 않는다.
- 한 줄 최대 너비: 본문 컬럼은 약 680-720px로 제한한다.
- 단락 간격: 1em.

웨이트 시스템:

- 본문: 400
- 소제목, 강조: 600
- 대제목: 700
- 세 단계 이상 섞지 않는다. 계층은 크기와 여백으로 만든다.

## 다크 / 라이트 모드

둘 다 지원한다. 시스템 설정을 기본으로 따르되, 사용자가 수동으로 전환할 수 있게 한다.

다크 모드 원칙:

- 배경은 순수 검정(`#000`)이 아닌 어두운 회색(`#0f172a`, `#111`, `#18181b` 수준)을 사용한다.
- 본문 글자색은 순수 흰색(`#fff`)이 아닌 오프화이트(`#e2e8f0`, `#f1f5f9`)를 사용한다.
- WCAG AA 기준인 4.5:1 이상 명암비를 지키되, 과도한 대비로 장시간 읽기 피로를 만들지 않는다.
- 본문에 400, 강조에 600을 유지하고 300 이하 얇은 웨이트는 쓰지 않는다.
- 코드 블록 배경은 본문 배경보다 1-2단계 밝게 잡는다.

라이트 모드 원칙:

- 배경은 순수 흰색(`#fff`) 또는 매우 연한 회색(`#fafafa`)을 기본으로 한다.
- 글자는 순수 검정보다 부드러운 `#111827` 또는 `#1a1a1a`를 사용한다.
- 코드 블록 배경은 본문 배경보다 1-2단계 어둡게 잡는다.

구현 원칙:

- CSS custom properties로 모든 색상 토큰을 정의한다.
- `[data-theme="dark"]`와 `prefers-color-scheme`을 함께 고려한다.
- 모드 전환 시 `transition: background-color 0.2s, color 0.2s`를 적용한다.
- 시스템 설정을 기본값으로 쓰고, 사용자 토글 값은 `localStorage`에 저장한다.

## 컬러 시스템

- 기본 팔레트: 흰색, 먹색, 회색 계열 4-6단계.
- Accent color: 단 하나만 사용한다.
- Accent color는 링크, 현재 페이지 인디케이터, 코드 하이라이트 등에 제한적으로 사용한다.
- 프로젝트별 accent는 해당 프로젝트 페이지 안에서만 사용하고, 사이트 전체 팔레트에는 영향을 주지 않는다.
- 색상은 의미를 전달해야 한다. 장식 목적의 색상 사용은 피한다.
- HSL 기반으로 정의하면 다크 / 라이트 모드 전환이 쉽다.

## 초기 디자인 토큰

v1에서는 아래 토큰을 기준으로 구현한다. 실제 색상은 CSS custom properties로 정의한다.

```css
:root {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-code-bg: #f3f4f6;
  --color-accent: #2563eb;
}

[data-theme="dark"] {
  --color-bg: #111111;
  --color-surface: #18181b;
  --color-text: #f1f5f9;
  --color-muted: #a1a1aa;
  --color-border: #27272a;
  --color-code-bg: #1f2937;
  --color-accent: #60a5fa;
}
```

폰트는 v1에서 다음으로 고정한다.

- 본문 한국어: Pretendard
- 영문 fallback: Geist Sans
- 코드 / 메타데이터: Geist Mono

v1에서 구현할 디자인 범위:

- light/dark mode
- 상단 sticky nav
- editorial home layout
- 프로젝트 case study layout
- 글 목록 layout
- 글 상세 typography
- 코드 블록 styling
- 모바일 레이아웃
- 기본 접근성 처리

v1에서 미룰 디자인 범위:

- 자동 OG 이미지 생성
- 고급 페이지 전환 animation
- 정적 검색 UI
- 프로젝트별 accent color 확장
- 복잡한 diagram component

## 스타일링 구현 방식

v1에서는 Tailwind를 사용하지 않는다.

구현 기준:

- Global CSS
- CSS custom properties
- Astro component-scoped `<style>`

파일 역할:

- `src/styles/tokens.css`: 색상, spacing, typography token
- `src/styles/global.css`: reset, body, link, theme, 기본 레이아웃
- `src/styles/prose.css`: Markdown/MDX 본문 typography
- 각 `.astro` 컴포넌트: 컴포넌트 고유 레이아웃과 상태 스타일

Tailwind는 v1 이후 UI 복잡도가 높아졌을 때 다시 검토한다.

## 레이아웃 & 네비게이션 UX

전체 레이아웃:

- 홈은 좌우 split hero보다 글과 프로젝트가 바로 보이는 editorial index에 가깝게 만든다.
- 첫 화면은 짧은 자기소개 문장 2-3줄, 현재 집중 중인 프로젝트, 추천 글 2-3개 순서로 구성한다.
- 프로젝트 페이지는 case study 구조를 따른다: 문제 정의, 나의 역할, 아키텍처, 스택, 주요 의사결정, 트레이드오프, 결과, 관련 글.
- 딥다이브 목록은 제목, 한 줄 요약, 태그, 날짜, 관련 프로젝트를 보여준다.
- 개발 로그 목록은 날짜순 피드로 만든다. 날짜가 왼쪽에, 제목이 오른쪽에 오는 타임라인 형태를 우선 검토한다.

네비게이션:

- 상단 고정 nav는 로고 또는 이름, Projects, Blog, About으로 구성한다.
- 주요 링크는 4개 이하로 유지한다.
- 현재 페이지는 단순한 밑줄이나 색상 변화로 명확히 표시한다.
- 스크롤 시 nav가 사라지지 않도록 `position: sticky; top: 0`을 사용한다.
- nav 배경은 스크롤 시 약간의 blur(`backdrop-filter: blur(12px)`)를 추가해 콘텐츠와 분리한다.
- 모바일에서는 hamburger 메뉴를 만들지 않고, 상단 nav의 3개 링크를 간결하게 유지한다.

글 상세 페이지:

- 본문 컬럼 폭은 680-720px로 제한하고 좌우 여백으로 중앙 정렬한다.
- TOC는 데스크탑에서는 우측 sticky 패널, 모바일에서는 본문 상단 collapsible 섹션으로 제공한다.
- 상단에 1-2px 읽기 진행 표시를 둔다.
- 뒤로 가기 시 스크롤 위치를 복원한다.
- 이전 글 / 다음 글 링크는 글 하단에 배치한다. 같은 프로젝트 내 글끼리 연결한다.
- 공유 버튼은 최소화한다. 글 제목 옆에 복사 링크 하나면 충분하다.

## 글 읽기 경험

기술 블로그의 핵심 UX는 코드 블록이다.

코드 블록:

- 신택스 하이라이팅은 Shiki를 사용한다.
- 빌드 타임에 하이라이팅해 런타임 오버헤드를 줄인다.
- 다크 / 라이트 테마를 각각 지정한다.
- 코드 블록 상단에 파일명 레이블을 표시한다.
- 복사 버튼은 우측 상단에 항상 표시한다.
- 긴 코드는 줄 번호를 표시한다.
- 가로 스크롤은 코드 블록 내부에서만 발생하게 한다.

이미지 & 다이어그램:

- 이미지에는 alt 텍스트를 항상 작성한다.
- 장식용 이미지는 `alt=""`로 둔다.
- 다이어그램은 Mermaid를 우선 사용하고, Mermaid로 표현하기 어려운 경우에만 SVG를 사용한다.
- 이미지는 Astro의 image optimization을 사용한다.
- WebP, lazy loading, srcset을 기본으로 고려한다.

텍스트 콘텐츠:

- 인용구는 왼쪽 border와 배경색으로 구분한다.
- info, warning, tip callout을 MDX 컴포넌트로 제공한다.
- 긴 글에는 중간 소제목을 충분히 둔다.
- 외부 링크는 새 탭에서 열고, 외부 링크 아이콘을 작게 표시한다.

## 모바일 UX

채용 담당자의 상당수가 모바일로 먼저 확인할 수 있으므로 모바일 퍼스트로 설계한다.

- 터치 타겟은 최소 44x44px.
- 글 목록은 모바일에서 카드보다 세로 리스트를 우선한다.
- 코드 블록은 모바일에서 13-14px로 줄이고 가로 스크롤을 허용한다.
- TOC는 모바일에서 본문 상단 드롭다운으로 제공한다.
- 모바일 nav는 hamburger 메뉴 없이 상단 nav의 3개 링크를 그대로 노출한다.

## 접근성

접근성은 포트폴리오 신뢰도에 직결된다.

- 모든 이미지에 alt 텍스트를 둔다.
- 색상만으로 정보를 전달하지 않는다.
- 키보드 네비게이션이 가능해야 한다.
- focus ring이 명확하게 보여야 한다.
- WCAG AA 기준인 명암비 4.5:1 이상을 지킨다.
- 시맨틱 HTML을 사용한다: `<article>`, `<nav>`, `<main>`, `<header>`.
- `Skip to main content` 링크를 페이지 최상단에 숨김 처리로 추가한다.
- `prefers-reduced-motion` 미디어 쿼리를 지원한다.

## 성능

성능은 포트폴리오 첫인상의 일부다.

- 폰트는 `font-display: swap`과 preload를 사용한다.
- Pretendard는 버전이 고정된 subset stylesheet를 사용한다.
- Geist Sans와 Geist Mono는 `geist@1.7.1` tarball의 woff2 asset을 `public/fonts/geist/`로 추출해 self-host한다.
- 이미지는 WebP, 적절한 srcset, lazy loading을 사용한다.
- Astro의 정적 생성(SSG)을 최대한 활용한다.
- JS를 최소화하고, 인터랙션이 필요한 컴포넌트에만 `client:*` 지시어를 사용한다.
- LCP 2.5초 이하를 목표로 한다.
- v1에서는 PageSpeed Insights로 Core Web Vitals를 수동 확인한다.
- Vercel Analytics는 analytics를 도입하는 단계에서 다시 검토한다.

## OG 이미지 & SEO

공유될 때 인상이 좋아야 한다.

- v1에서는 기본 OG metadata와 고정 기본 이미지를 사용한다.
- 자동 OG 이미지 생성은 v1.2 이후 검토한다.
- 자동 OG 이미지를 도입하면 글 제목, 날짜, 프로젝트명, 사이트 브랜딩을 포함한다.
- `<title>`, `<meta description>`, `canonical URL`, `og:*`, `twitter:*` 태그를 모든 페이지에 설정한다.
- RSS feed는 v1.2에서 제공한다.

## 피해야 할 것

시각 요소:

- 보라색/파란색 그라디언트 hero.
- 유리 느낌의 glass card 남발.
- 떠다니는 gradient blob, orb, bokeh 배경.
- "AI-powered" 느낌의 추상 회로/뇌/로봇 이미지.
- 모든 섹션이 카드처럼 떠 있는 랜딩 페이지식 구성.
- 기술 스택 로고를 과하게 나열하는 첫 화면.
- 의미 없는 타이핑 애니메이션과 과한 motion.

UX 안티패턴:

- 클릭하지 않으면 아무것도 볼 수 없는 splash screen.
- 스크롤을 강제하는 full-page section 레이아웃.
- hover로만 드러나는 핵심 정보.
- 글 목록에서 제목만 보이고 요약이 없는 구조.
- 읽는 도중 팝업, 뉴스레터 구독 유도, 쿠키 배너 남발.
- 모바일에서 14px 미만 본문 폰트.
- 링크와 일반 텍스트가 구분이 안 되는 디자인.

## 디자인 레퍼런스

복제 대상이 아니라 감각의 기준으로 사용한다.

Editorial / text-first 방향:

- [leerob.com](https://leerob.com) — 극단적인 텍스트 퍼스트. 자기소개와 추천 글만으로 구성되어 군더더기가 없다.
- [Brittany Chiang](https://brittanychiang.com) — sticky 사이드바 네비게이션, 다크 테마, 접근성 참고.

포트폴리오 구조 / case study:

- [Portfolio Gallery](https://www.portfoliogallery.dev/) — 다양한 스타일과 레이아웃 비교.
- [itzkashan.dev](https://itzkashan.dev/projects/portfolio) — 섹션 구조와 콘텐츠 데이터 분리 방식 참고.

타이포그래피 / 디자인 감각:

- [Pretendard 공식](https://github.com/orioncactus/pretendard) — 한국어 폰트 선택의 이유와 사용법.
- [KevDoy](https://kevdoy.com/) — 단순한 레이아웃에서 typography와 여백이 어떻게 디자인을 완성하는지 참고.
