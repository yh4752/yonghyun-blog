import rss from "@astrojs/rss";
import { site } from "../data/site";
import { getPublishedPosts } from "../utils/posts";

export async function GET(context: { site?: URL }) {
  const posts = await getPublishedPosts();

  return rss({
    title: site.siteName,
    description: site.description,
    site: context.site ?? new URL(site.siteUrl),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: post.href,
      categories: post.data.tags,
    })),
    customData: `<language>${site.language}</language>`,
  });
}
