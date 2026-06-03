export const DEFAULT_PROJECT_POSTS_PAGE_SIZE = 8;

export const projectPostPageSizes: Partial<Record<string, number>> = {};

export function getProjectPostsPageSize(project: string): number {
  return projectPostPageSizes[project] ?? DEFAULT_PROJECT_POSTS_PAGE_SIZE;
}
