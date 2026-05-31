import { projects } from "../data/projects";
import { site } from "../data/site";
import { getPublishedPosts } from "../utils/posts";

function url(pathname: string) {
  return new URL(pathname, site.siteUrl).toString();
}

function entry(location: string) {
  return `  <url><loc>${location}</loc></url>`;
}

export async function GET() {
  const posts = await getPublishedPosts();
  const staticRoutes = ["/", "/about", "/projects", "/blog", "/blog/dev-log", "/blog/deep-dive"];
  const urls = [
    ...staticRoutes.map((route) => url(route)),
    ...projects.map((project) => url(`/projects/${project.slug}`)),
    ...posts.map((post) => url(post.href)),
  ];

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(entry).join("\n")}
</urlset>
`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
