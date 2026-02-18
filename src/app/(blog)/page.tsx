import { ArticleCard } from "@/components/ArticleCard";
import { getAllBlogPosts } from "@/lib/mdx";

export default function HomePage() {
  const posts = getAllBlogPosts();

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-[680px] mx-auto">
        <h1 className="text-4xl font-bold text-[#242424] mb-4">All Stories</h1>
        <p className="text-lg text-[#757575] mb-12">
          Thoughts on technology, frontend development, and software
          engineering.
        </p>

        <div>
          {posts.map((post, index) => (
            <div
              key={post.slug}
              className={
                index === 0
                  ? "pb-12"
                  : "border-t border-[#e5e5e5] pt-12 pb-12"
              }
            >
              <ArticleCard post={post} />
            </div>
          ))}
        </div>

        {posts.length === 0 && (
          <p className="text-[#757575]">No posts yet. Check back soon!</p>
        )}
      </div>
    </div>
  );
}
