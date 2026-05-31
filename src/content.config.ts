import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postTypeSchema = z.enum([
  "dev-log",
  "deep-dive",
  "debugging",
  "architecture",
  "performance",
  "research",
]);

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    type: postTypeSchema,
    project: z.string().min(1),
    tags: z.array(z.string()).min(1),
    summary: z.string().min(1),
    draft: z.boolean().default(true),
    slug: z.string().optional(),
    featured: z.boolean().default(false),
    canonicalProjectPath: z.string().optional(),
    sourceRepository: z.url().optional(),
    relatedPosts: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
