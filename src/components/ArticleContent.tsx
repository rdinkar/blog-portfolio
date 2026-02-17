import type { ReactNode } from "react";

interface ArticleContentProps {
  children: ReactNode;
}

const articleStyles =
  "leading-relaxed text-[#242424] [&>h1]:text-3xl [&>h1]:font-bold [&>h1]:mt-8 [&>h1]:mb-4 [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-8 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-bold [&>h3]:mt-6 [&>h3]:mb-3 [&>p]:mb-4 [&>p]:leading-relaxed [&>blockquote]:border-l-4 [&>blockquote]:border-[#242424] [&>blockquote]:pl-6 [&>blockquote]:my-6 [&>blockquote]:italic [&>blockquote]:text-[#757575] [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>pre]:bg-[#f6f6f6] [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:mb-4 [&>img]:max-w-full [&>img]:h-auto [&>img]:rounded-lg [&>img]:my-4";

export function ArticleContent({ children }: ArticleContentProps) {
  return (
    <div className={`prose prose-lg max-w-[680px] mx-auto article-body ${articleStyles}`}>
      {children}
    </div>
  );
}
