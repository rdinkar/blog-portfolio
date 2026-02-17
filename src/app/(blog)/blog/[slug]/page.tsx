import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  getBlogPost,
  getBlogSlugs,
  compileBlogPost,
} from "@/lib/mdx";
import { ArticleContent } from "@/components/ArticleContent";
import { SITE_CONFIG } from "@/lib/site";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getBlogSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post Not Found" };

  const { frontmatter } = post;
  const url = `${SITE_CONFIG.url}/blog/${slug}`;

  return {
    title: `${frontmatter.title} | ${SITE_CONFIG.name}`,
    description: frontmatter.description,
    authors: [{ name: frontmatter.author }],
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      type: "article",
      publishedTime: frontmatter.date,
      authors: [frontmatter.author],
      images: frontmatter.image ? [frontmatter.image] : undefined,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: frontmatter.title,
      description: frontmatter.description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post || !post.frontmatter.published) {
    notFound();
  }

  const { frontmatter, content, readingTime } = post;
  const compiledContent = await compileBlogPost(content!);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: frontmatter.title,
    description: frontmatter.description,
    datePublished: frontmatter.date,
    author: {
      "@type": "Person",
      name: frontmatter.author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_CONFIG.name,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_CONFIG.url}/blog/${slug}`,
    },
  };

  return (
    <article className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-[680px] mx-auto">
        <Link
          href="/"
          className="text-sm text-[#757575] hover:text-[#242424] mb-6 inline-block"
        >
          ← Back to home
        </Link>

        <header className="mb-8">
          <h1 className="text-4xl font-bold text-[#242424] mb-4">
            {frontmatter.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[#757575] text-sm">
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
        </header>

        {frontmatter.image && (
          <div className="relative w-full aspect-video mb-8 rounded-lg overflow-hidden">
            <Image
              src={frontmatter.image}
              alt={frontmatter.title}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 680px"
            />
          </div>
        )}

        <ArticleContent>{compiledContent}</ArticleContent>
      </div>
    </article>
  );
}
