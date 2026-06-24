export const SITE_CONFIG = {
  name: "RDinkar Blog",
  description: "A personal blog with thoughts on technology, frontend development, and software engineering.",
  // Strip any trailing slash so URLs built as `${url}/blog/...` never produce
  // a double slash (which breaks sitemap/canonical consistency and indexing).
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  author: "Rahul Dinkar",
  links: {
    portfolio: "https://rdinkar.github.io/portfolio/",
    twitter: "",
    github: "",
    linkedin: "",
  },
} as const;
