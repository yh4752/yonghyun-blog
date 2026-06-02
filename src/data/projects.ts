import rawProjects from "./projects.json";

export type ProjectStatus = "active" | "paused" | "complete";

export type Project = {
  slug: string;
  name: string;
  description: string;
  stack: string[];
  status: ProjectStatus;
  featured: boolean;
  repositoryUrl: string | null;
  demoUrl: string | null;
};

export const projects = rawProjects as Project[];
