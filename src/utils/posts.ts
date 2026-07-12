import { getCollection, type CollectionEntry } from "astro:content";
import { projectFromId, slugFromId } from "./slugs";

export type BlogPost = CollectionEntry<"blog"> & {
  project: string;
  slug: string;
  href: string;
};

export type BlogPostFilters = {
  project?: string;
  type?: BlogPost["data"]["type"];
  tags?: string[];
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

export function filterPosts(posts: BlogPost[], filters: BlogPostFilters): BlogPost[] {
  return posts.filter((post) => {
    if (filters.project && post.project !== filters.project) {
      return false;
    }

    if (filters.type && post.data.type !== filters.type) {
      return false;
    }

    if (filters.tags?.length && !filters.tags.every((tag) => post.data.tags.includes(tag))) {
      return false;
    }

    return true;
  });
}

export function filterPostsByType(posts: BlogPost[], type: BlogPost["data"]["type"]): BlogPost[] {
  return filterPosts(posts, { type });
}

export function filterPostsByProject(posts: BlogPost[], project: string): BlogPost[] {
  return filterPosts(posts, { project });
}

export function getRelatedPosts(posts: BlogPost[], post: BlogPost): BlogPost[] {
  if (post.data.relatedPosts.length === 0) return [];

  const postByReference = new Map(posts.map((candidate) => [`${candidate.project}/${candidate.slug}`, candidate]));
  const seen = new Set<string>();

  return post.data.relatedPosts.flatMap((reference) => {
    const relatedPost = postByReference.get(reference);
    if (!relatedPost || relatedPost.href === post.href || seen.has(reference)) return [];
    seen.add(reference);
    return [relatedPost];
  });
}
