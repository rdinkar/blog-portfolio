import Link from "next/link";
import type { BlogPost } from "@/lib/mdx";

interface BlogPostNavProps {
  prev: BlogPost | null;
  next: BlogPost | null;
}

export function BlogPostNav({ prev, next }: BlogPostNavProps) {
  if (!prev && !next) return null;

  return (
    <nav
      className="mt-12 pt-8 border-t border-[#e5e5e5] grid grid-cols-1 sm:grid-cols-2 gap-6"
      aria-label="Previous and next posts"
    >
      <div className="min-w-0">
        {prev ? (
          <Link
            href={`/blog/${prev.slug}`}
            className="group block text-[#242424] hover:text-[#757575] transition-colors"
          >
            <span className="text-sm text-[#757575] block mb-1">Previous</span>
            <span className="font-medium line-clamp-2 group-hover:underline">
              {prev.frontmatter.title}
            </span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 sm:text-right">
        {next ? (
          <Link
            href={`/blog/${next.slug}`}
            className="group block text-[#242424] hover:text-[#757575] transition-colors sm:ml-auto"
          >
            <span className="text-sm text-[#757575] block mb-1">Next</span>
            <span className="font-medium line-clamp-2 group-hover:underline">
              {next.frontmatter.title}
            </span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </nav>
  );
}
