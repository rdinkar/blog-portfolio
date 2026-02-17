"use client";

import Link from "next/link";
import { useState } from "react";
import { SITE_CONFIG } from "@/lib/site";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-[#e5e5e5]">
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
        <Link
          href="/"
          className="text-xl font-semibold text-[#242424] hover:text-[#757575] transition-colors"
        >
          {SITE_CONFIG.name}
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/"
            className="text-[#242424] hover:text-[#757575] transition-colors"
          >
            Home
          </Link>
          <a
            href={SITE_CONFIG.links.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#242424] hover:text-[#757575] transition-colors"
          >
            Portfolio
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-[#242424] hover:bg-[#f6f6f6]"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#e5e5e5] px-4 py-4">
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              className="text-[#242424] hover:text-[#757575] py-2 min-h-[44px] flex items-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <a
              href={SITE_CONFIG.links.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#242424] hover:text-[#757575] py-2 min-h-[44px] flex items-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Portfolio
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
