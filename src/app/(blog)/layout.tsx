import { Header } from "@/components/Header";
import { SubscribeForm } from "@/components/SubscribeForm";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[#e5e5e5] mt-16">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-[680px] mx-auto mb-8">
            <SubscribeForm />
          </div>
          <div className="text-center text-sm text-[#757575]">
            <p>© {new Date().getFullYear()} RDinkar Blog. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
