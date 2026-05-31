import { getCollection, type CollectionEntry } from "astro:content";
import { projectFromId, slugFromId } from "./slugs";

export type BlogPost = CollectionEntry<"blog"> & {
  project: string;
  slug: string;
  href: string;
};

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog");
  return posts
    .filter((post) => post.data.draft === false)
    .map((post) => {
      const project = post.data.project || projectFromId(post.id);
      const slug = post.data.slug ?? slugFromId(post.id);
      return {
        ...post,
        project,
        slug,
        href: `/blog/${project}/${slug}`,
      };
    })
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function filterPostsByType(posts: BlogPost[], type: BlogPost["data"]["type"]): BlogPost[] {
  return posts.filter((post) => post.data.type === type);
}

export function filterPostsByProject(posts: BlogPost[], project: string): BlogPost[] {
  return posts.filter((post) => post.project === project);
}
