import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { compileMDX } from "next-mdx-remote/rsc";
import type { MDXComponents } from "mdx/types";

export interface BlogPostFrontmatter {
  title: string;
  description: string;
  date: string;
  author: string;
  image?: string;
  tags?: string[];
  published: boolean;
}

export interface BlogPost {
  slug: string;
  frontmatter: BlogPostFrontmatter;
  readingTime: string;
  content?: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export function getBlogSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);
  const stats = readingTime(content);

  return {
    slug,
    frontmatter: data as BlogPostFrontmatter,
    readingTime: stats.text,
    content,
  };
}

export function getAllBlogPosts(): BlogPost[] {
  const slugs = getBlogSlugs();
  return slugs
    .map((slug) => getBlogPost(slug))
    .filter((post): post is BlogPost => post !== null)
    .filter((post) => post.frontmatter.published)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.date).getTime() -
        new Date(a.frontmatter.date).getTime()
    );
}

const mdxComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold mt-8 mb-4 text-[#242424]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-2xl font-bold mt-8 mb-4 text-[#242424]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-bold mt-6 mb-3 text-[#242424]">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-4 leading-relaxed text-[#242424]">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-[#242424] pl-6 my-6 italic text-[#757575]">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-6 mb-4 space-y-2 text-[#242424]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 mb-4 space-y-2 text-[#242424]">
      {children}
    </ol>
  ),
  pre: ({ children }) => (
    <pre className="bg-[#f6f6f6] p-4 rounded-lg overflow-x-auto mb-4 text-sm">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="bg-[#f6f6f6] px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[#242424] underline hover:text-[#757575] transition-colors"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="max-w-full h-auto rounded-lg my-4"
    />
  ),
};

export async function compileBlogPost(content: string) {
  const { content: compiledContent } = await compileMDX({
    source: content,
    options: {
      parseFrontmatter: false,
    },
    components: mdxComponents,
  });
  return compiledContent;
}

export { mdxComponents };
