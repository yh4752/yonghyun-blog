export const postTypes = [
  "dev-log",
  "deep-dive",
  "debugging",
  "architecture",
  "performance",
  "research",
] as const;

export type PostType = (typeof postTypes)[number];

export type PostTypePage = {
  type: PostType;
  path: `/blog/${string}`;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  summary: string;
};

export const postTypePages = [
  {
    type: "dev-log",
    path: "/blog/dev-log",
    title: "개발 로그",
    description: "매일의 구현 흐름과 다음 단계를 정리한 개발 로그",
    eyebrow: "Development Log",
    heading: "개발 로그",
    summary: "하루 단위로 무엇을 만들었고 어떤 판단을 남겼는지 정리합니다.",
  },
  {
    type: "deep-dive",
    path: "/blog/deep-dive",
    title: "기술 딥다이브",
    description: "스택 선택과 설계 판단을 깊게 정리한 글",
    eyebrow: "Deep Dive Archive",
    heading: "기술 딥다이브",
    summary: "왜 그 스택과 모델을 선택했는지, 무엇을 검증했는지 기록합니다.",
  },
] as const satisfies readonly PostTypePage[];
