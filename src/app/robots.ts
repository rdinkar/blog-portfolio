import { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  };
}
