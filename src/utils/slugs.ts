export function slugFromId(id: string): string {
  const withoutExtension = id.replace(/\.(md|mdx)$/i, "");
  const parts = withoutExtension.split("/");
  return parts[parts.length - 1] ?? withoutExtension;
}

export function projectFromId(id: string): string {
  return id.split("/")[0] ?? "";
}
