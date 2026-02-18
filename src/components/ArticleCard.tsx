import Link from "next/link";
import Image from "next/image";
import type { BlogPost } from "@/lib/mdx";

interface ArticleCardProps {
  post: BlogPost;
}

export function ArticleCard({ post }: ArticleCardProps) {
  const { slug, frontmatter, readingTime } = post;
  const postUrl = `/blog/${slug}`;

  return (
    <article className="group">
      <Link
        href={postUrl}
        className="flex w-full flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-[#242424] group-hover:text-[#757575] transition-colors mb-2">
            {frontmatter.title}
          </h2>
          <p className="text-[#757575] text-sm line-clamp-2 mb-3">
            {frontmatter.description}
          </p>
          <div className="flex items-center gap-3 text-sm text-[#757575]">
            <time dateTime={frontmatter.date}>
              {new Date(frontmatter.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{readingTime}</span>
            <span>·</span>
            <span>{frontmatter.author}</span>
          </div>
        </div>
        {frontmatter.image && (
          <div className="relative w-full sm:w-28 sm:h-[84px] sm:flex-shrink-0 rounded-md overflow-hidden bg-[#f6f6f6] aspect-video sm:aspect-[4/3]">
            <Image
              src={frontmatter.image}
              alt={frontmatter.title}
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, 112px"
            />
          </div>
        )}
      </Link>
    </article>
  );
}
