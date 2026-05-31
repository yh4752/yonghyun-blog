import rawAllowedTags from "./tags.json";

export const allowedTags = rawAllowedTags;

export type AllowedTag = (typeof allowedTags)[number];
