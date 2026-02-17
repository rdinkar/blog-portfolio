export const SITE_CONFIG = {
  name: "RDinkar Blog",
  description: "A personal blog with thoughts on technology, frontend development, and software engineering.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  author: "Rahul Dinkar",
  links: {
    portfolio: "https://rdinkar.github.io/portfolio/",
    twitter: "",
    github: "",
    linkedin: "",
  },
} as const;
