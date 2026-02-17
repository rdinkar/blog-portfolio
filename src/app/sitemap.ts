import { MetadataRoute } from "next";
import { getAllBlogPosts } from "@/lib/mdx";
import { SITE_CONFIG } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllBlogPosts();

  const blogUrls = posts.map((post) => ({
    url: `${SITE_CONFIG.url}/blog/${post.slug}`,
    lastModified: new Date(post.frontmatter.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: SITE_CONFIG.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...blogUrls,
  ];
}
