type GiscusCommentsConfig = {
  provider: "giscus";
  enabled: boolean;
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  strict: boolean;
  reactionsEnabled: boolean;
  inputPosition: "top" | "bottom";
};

export const site = {
  siteName: "Yonghyun Blog",
  description:
    "설계 판단, 기술 선택, 디버깅, 검색/RAG 개발 과정을 기록하는 포트폴리오 기술 블로그",
  language: "ko",
  comments: {
    provider: "giscus",
    enabled: false,
    repo: "",
    repoId: "",
    category: "",
    categoryId: "",
    strict: false,
    reactionsEnabled: true,
    inputPosition: "bottom",
  } satisfies GiscusCommentsConfig,
  author: {
    name: "Yonghyun Kim",
    url: "/about",
    sameAs: ["https://github.com/yh4752", "https://www.linkedin.com/in/yh4752/"],
  },
  siteUrl: import.meta.env.PUBLIC_SITE_URL ?? "https://yonghyun-blog.vercel.app",
  defaultOgImage: "/og-default.svg",
};
