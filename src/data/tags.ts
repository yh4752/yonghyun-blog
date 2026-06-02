import rawAllowedTags from "./tags.json";

const [firstTag, ...remainingTags] = rawAllowedTags;

if (!firstTag) {
  throw new Error("tags.json must include at least one tag.");
}

export const allowedTags = [firstTag, ...remainingTags] as const;

export type AllowedTag = (typeof allowedTags)[number];
