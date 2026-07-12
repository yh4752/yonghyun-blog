export const site = {
  siteName: "Yonghyun Blog",
  description:
    "설계 판단, 기술 선택, 디버깅, 검색/RAG 개발 과정을 기록하는 포트폴리오 기술 블로그",
  language: "ko",
  author: {
    name: "Yonghyun Kim",
    url: "/about",
    sameAs: ["https://github.com/yh4752", "https://www.linkedin.com/in/yh4752/"],
  },
  siteUrl: import.meta.env.PUBLIC_SITE_URL ?? "https://yonghyun-blog.vercel.app",
  defaultOgImage: "/og-default.svg",
};
