---
name: medium-to-blog
description: Extracts a Medium article from a given URL and converts it to the project's blog MDX format in content/blog. Use when the user provides a Medium link to import, wants to "import" or "extract" a Medium post into the blog, or says "convert this Medium article" to content/blog format.
---

# Medium to Blog Import

Import a Medium post into `content/blog` as MDX with the correct frontmatter and body format.

## When to use

- User provides a Medium URL (e.g. `https://medium.com/@username/post-title-12charhex`) and wants it as a blog post.
- User says "import this blog", "extract from Medium", or "convert this Medium article" into the site's blog.

## Getting the content (verify full access before converting)

**Always use the Browser MCP** (cursor-ide-browser) to load the article—do not use `mcp_web_fetch`. Navigate to the Medium URL in the browser, then get the page content from the snapshot (or run the extraction script in the page if the Browser supports it).

**Do not convert until you have confirmed access to the full article.** Never create a blog post from partial or truncated content. If you only have a preview, do not write any file—ask the user to log in and try again.

1. **Load with Browser and check**  
   - Use **Browser**: `browser_navigate` to the exact Medium article URL.
   - Get the page content (e.g. `browser_snapshot` to inspect structure and text). If the Browser MCP supports running script in the page (e.g. `evaluate_script` or equivalent), run the extraction script below and use the returned `{ title, imageUrl, parts }` to build the MDX.
   - Inspect what you got:
     - **Full content**: Multiple sections, multiple headings, substantial body text, article reads to the end (not cut off by "Written by …" / footer after a short preview). → Proceed to convert.
     - **Truncated / preview only**: Content is cut short (e.g. one or two sections then "Written by …", or "Member-only story" / "Not a member?" with no full body). → Do **not** convert. Do **not** create a partial post.

2. **If you do not have full content**  
   - **Ask the user**: Say you need the full article. Ask them to **log in to Medium** in the same Browser tab so the full post is visible, then tell you when they’re done.
   - **After they confirm they’re logged in**: Navigate to the article URL again (or refresh), get the content again, and only convert if you now have the full article.
   - **Never create a post from partial content.** If full content still cannot be obtained, stop and tell the user—do not write an MDX file with only a preview.

## Slug and output file

- **Slug**: From the Medium path. Pattern `medium.com/@handle/slug-XXXXXXXXXXXX` → slug is the path segment **without** the trailing 12-character hex.  
  Example: `.../ai-in-frontend-code-reviews-what-to-automate-and-what-never-to-delegate-b9c82bfe9b64` → slug `ai-in-frontend-code-reviews-what-to-automate-and-what-never-to-delegate`.
- **Output path**: `content/blog/{slug}.mdx`.

## Frontmatter (required)

Use this structure. Infer or default where needed.

```yaml
---
title: "Exactly as on Medium (or from meta)"
description: "One short sentence summarizing the post (first paragraph or meta)."
date: "YYYY-MM-DD"
author: "Rahul Dinkar"
published: true
image: "absolute URL to hero image or empty string"
tags:
  - tag1
  - tag2
---
```

- **date**: From the article. When the article shows relative time ("X hours ago", "X days ago", "X weeks ago", etc.), use **current date** as the reference and compute the calendar date from that; then format as `YYYY-MM-DD`. For explicit dates (e.g. "Feb, 2026") use that. Fallback: today's date.
- **image**: Prefer Medium CDN hero (e.g. `https://miro.medium.com/v2/resize:fit:2000/...`). If none, use `""`.
- **tags**: 3–6 lowercase tags from topic (e.g. `code-review`, `ai`, `frontend`, `react`).

## Body format

- First line after frontmatter: optional hero image in markdown, e.g. `![Title](imageUrl)` only if `image` is set.
- Then the article as markdown:
  - Headings: `#`, `##`, `###`, `####` for h1–h4.
  - Paragraphs: blank line between.
  - Lists: `-` or `1.` with proper nesting.
  - Code: fenced blocks with language, e.g. ` ```javascript `.
  - Inline code: `` `code` ``.
  - Images: `![alt](url)`.
- **Skip** Medium UI and author CTAs: "Member-only story", "Sign in", "Sign up", "Listen", "Share", "Written by …", "No responses yet", "Not a member?", "Read for free here", footer links, duplicate nav text. **Do not include** the author follow/support CTA, e.g. "If you found this article helpful, I'd really appreciate your support—follow for more in-depth articles about React, frontend development, and software engineering best practices." Omit any similar follow-for-more or support paragraphs at the end of the post.

## Extraction script (when running script in the page is supported)

If the Browser (or Chrome DevTools) supports running script in the loaded page (e.g. `evaluate_script`), use this to get structured content from the full article:

```javascript
(function() {
  const article = document.querySelector('article');
  if (!article) return JSON.stringify({ error: 'No article' });
  const titleEl = article.querySelector('h1');
  const title = titleEl ? titleEl.innerText.trim() : '';
  const imgs = article.querySelectorAll('img[src*="miro.medium"]');
  let imageUrl = '';
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (src.includes('resize:fit') && !src.includes('64:64')) { imageUrl = src; break; }
  }
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    const tag = node.tagName && node.tagName.toLowerCase();
    const skip = node.getAttribute('data-medium-editor-element') || node.querySelector('[data-medium-editor-element]');
    if (skip && tag !== 'pre') return;
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const t = node.innerText.trim();
      if (t && !/^(Member-only|Sign in|Share|Listen|Written by|Not a member|Read for free|More from)/i.test(t))
        parts.push({ type: tag, value: t });
      return;
    }
    if (tag === 'p') {
      const t = node.innerText.trim();
      if (t) parts.push({ type: 'p', value: t });
      return;
    }
    if (tag === 'img' && node.getAttribute('src')) {
      parts.push({ type: 'img', value: node.getAttribute('src') });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.querySelectorAll(':scope > li')).map(li => li.innerText.trim()).filter(Boolean);
      if (items.length) parts.push({ type: tag, value: items });
      return;
    }
    if (tag === 'pre') {
      const code = node.querySelector('code');
      parts.push({ type: 'code', value: code ? code.innerText : node.innerText });
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(article);
  return JSON.stringify({ title, imageUrl, parts });
})();
```

Then convert `parts` to markdown:

- `h1`–`h4`: `#`–`####` + value.
- `p`: value + double newline.
- `img`: `![](` + value + `)`.
- `ul`: each item `- ` + item.
- `ol`: each item `1. ` + item (or use `-`).
- `code`: ` ```language\n` + value + `\n``` ` (infer language from context or use `text`).

## After writing the file

- Ensure the file is valid MDX (matching frontmatter, no broken links if you touched them).
- Only write the file when you have confirmed full content; never write a post from partial content.
