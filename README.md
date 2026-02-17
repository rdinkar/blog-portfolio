# Personal Blog

A Medium-inspired personal blog built with Next.js, MDX, and Tailwind CSS.

## Features

- **Medium-inspired design** - Clean typography, readable layout, serif body text
- **Mobile responsive** - Hamburger menu, touch-friendly, fluid typography
- **SEO optimized** - Metadata, sitemap, robots.txt, JSON-LD, RSS feed
- **Subscribe to blog** - Email collection via Supabase (export for Medium upload)
- **Medium import ready** - Publish on your blog first, then paste URL into Medium's import tool

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SITE_URL` - Your site URL (e.g., `https://yourblog.com`)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (for subscribe feature)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

### Supabase Setup (Subscribe Feature)

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in `supabase-schema.sql` in the Supabase SQL editor
3. Add your project URL and anon key to `.env.local`

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Writing Posts

Add MDX files to `content/blog/` with frontmatter:

```yaml
---
title: "Your Post Title"
description: "A brief description for SEO and previews"
date: "2025-02-06"
author: "Your Name"
published: true
tags:
  - tag1
  - tag2
image: "/path/to/og-image.jpg"  # optional
---

Your content in Markdown or MDX...
```

## Importing to Medium

1. Publish your post on your blog
2. Go to Medium → Profile → Stories → Import a story
3. Paste your blog post URL (e.g., `https://yourblog.com/blog/your-slug`)
4. Medium imports with canonical URL for SEO

Use the "Copy URL for Medium import" button on each post for convenience.

## Project Structure

```
├── content/blog/       # MDX blog posts
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── (blog)/     # Blog layout and pages
│   │   ├── api/        # API routes (subscribe)
│   │   ├── sitemap.ts
│   │   ├── robots.ts
│   │   └── feed.xml/   # RSS feed
│   ├── components/
│   └── lib/
└── supabase-schema.sql
```

## Deployment

Deploy to [Vercel](https://vercel.com) for the best experience. Set environment variables in the Vercel dashboard.

## Customization

Edit `src/lib/site.ts` to update:
- Site name and description
- Author name
- Social links
