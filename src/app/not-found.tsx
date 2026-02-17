import Link from "next/link";
import { SITE_CONFIG } from "@/lib/site";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#e5e5e5]">
        <nav className="max-w-[1200px] mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-xl font-semibold text-[#242424] hover:text-[#757575] transition-colors"
          >
            {SITE_CONFIG.name}
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-bold text-[#242424] mb-2">404</h1>
        <p className="text-[#757575] mb-6">This page could not be found.</p>
        <Link
          href="/"
          className="text-[#242424] underline hover:text-[#757575] transition-colors min-h-[44px] flex items-center"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
