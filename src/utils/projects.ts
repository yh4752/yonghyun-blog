import { projects } from "../data/projects";

export function getFeaturedProjects() {
  return projects.filter((project) => project.featured);
}
