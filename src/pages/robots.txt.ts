import { site } from "../data/site";

export function GET(context: { site?: URL }) {
  const siteUrl = context.site ?? new URL(site.siteUrl);
  const sitemapUrl = new URL("/sitemap-index.xml", siteUrl).toString();
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
