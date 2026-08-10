const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL || 'https://legal-portal.pro'
).replace(/\/+$/, '');

function relationValue(value) {
  return value?.data?.attributes || value?.data || value?.attributes || value || {};
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanCanonical(value, fallback) {
  const candidate = value || fallback;

  try {
    const url = new URL(candidate, PUBLIC_SITE_URL);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

function formatArticleDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function renderInline(node) {
  if (!node) return '';

  if (node.type === 'link') {
    const rawUrl = node.url || '';
    const href = escapeHtml(rawUrl);
    const children = (node.children || []).map(renderInline).join('');
    const external = /^https?:\/\//i.test(rawUrl);

    return `<a href="${href}" class="text-blue-600 underline hover:text-blue-800"${
      external ? ' target="_blank" rel="noopener noreferrer"' : ''
    }>${children}</a>`;
  }

  if (Array.isArray(node.children)) {
    return node.children.map(renderInline).join('');
  }

  let content = escapeHtml(node.text || '');

  if (node.code) {
    content = `<code class="rounded bg-gray-100 px-1 py-0.5 text-sm">${content}</code>`;
  }
  if (node.bold) content = `<strong>${content}</strong>`;
  if (node.italic) content = `<em>${content}</em>`;
  if (node.underline) content = `<u>${content}</u>`;
  if (node.strikethrough) content = `<s>${content}</s>`;

  return content;
}

function renderListItem(item) {
  const content = (item.children || [])
    .map((child) => {
      if (child.type === 'list') return renderBlock(child);
      return renderInline(child);
    })
    .join('');

  return `<li class="pl-1">${content}</li>`;
}

function renderBlock(block) {
  if (!block) return '';

  switch (block.type) {
    case 'paragraph':
      return `<p class="my-4 min-h-[0.25rem] text-left leading-7 text-gray-700 md:text-justify">${(
        block.children || []
      )
        .map(renderInline)
        .join('')}</p>`;

    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(block.level) || 2));
      const sizes = {
        2: 'text-2xl',
        3: 'text-xl',
        4: 'text-lg',
      };

      return `<h${level} class="mb-3 mt-8 font-bold text-gray-900 ${
        sizes[level]
      }">${(block.children || []).map(renderInline).join('')}</h${level}>`;
    }

    case 'list': {
      const tag = block.format === 'ordered' ? 'ol' : 'ul';
      const listClass = tag === 'ol' ? 'list-decimal' : 'list-disc';

      return `<${tag} class="my-4 space-y-2 pl-6 text-gray-700 ${listClass}">${(
        block.children || []
      )
        .map(renderListItem)
        .join('')}</${tag}>`;
    }

    case 'quote':
      return `<blockquote class="my-6 border-l-4 border-blue-500 bg-blue-50 px-5 py-3 italic text-gray-700">${(
        block.children || []
      )
        .map(renderInline)
        .join('')}</blockquote>`;

    case 'code':
      return `<pre class="my-6 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>${escapeHtml(
        block.code || block.text || ''
      )}</code></pre>`;

    case 'image': {
      const image = relationValue(block.image || block);
      if (!image.url) return '';

      const alt = image.alternativeText || image.caption || '';
      const caption = image.caption
        ? `<figcaption class="mt-2 text-center text-sm text-gray-500">${escapeHtml(
            image.caption
          )}</figcaption>`
        : '';

      return `
        <figure class="my-7">
          <img
            src="${escapeHtml(image.url)}"
            alt="${escapeHtml(alt)}"
            class="mx-auto max-h-[560px] rounded-lg object-contain"
          />
          ${caption}
        </figure>
      `;
    }

    default:
      return '';
  }
}

function renderBlocks(content) {
  if (!Array.isArray(content)) return '';
  return content.map(renderBlock).join('');
}

function renderSections(article) {
  const sectionsValue = article.sections?.data || article.sections;
  const sections = Array.isArray(sectionsValue) ? sectionsValue : [];

  if (sections.length === 0) {
    return renderBlocks(article.content);
  }

  return sections
    .map((section) => {
      const item = relationValue(section);

      if (item.__component === 'article.text-section') {
        return renderBlocks(item.content);
      }

      if (item.__component === 'article.image-section') {
        const image = relationValue(item.image);

        if (!image.url) return '';

        const alt =
          item.alternativeText ||
          image.alternativeText ||
          item.caption ||
          article.title ||
          '';

        return `
          <figure class="my-8">
            <a
              href="${escapeHtml(image.url)}"
              target="_blank"
              rel="noopener noreferrer"
              class="block cursor-zoom-in"
              aria-label="${escapeHtml(
                `${alt}. Открыть изображение в полном размере`
              )}"
            >
              <img
                src="${escapeHtml(image.url)}"
                alt="${escapeHtml(alt)}"
                class="h-auto w-full rounded-xl border border-gray-200 object-contain shadow-sm"
                loading="lazy"
              />
            </a>
            ${
              item.caption
                ? `<figcaption class="mt-3 text-left text-sm leading-6 text-gray-500">${escapeHtml(
                    item.caption
                  )}</figcaption>`
                : ''
            }
          </figure>
        `;
      }

      return '';
    })
    .join('');
}

function replaceOrInsert(html, pattern, replacement) {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }

  return html.replace('</head>', `${replacement}</head>`);
}

function buildJsonLd(article, canonical, description, imageUrl) {
  const author = relationValue(article.author);
  const authorName = author.name || author.fullName || author.displayName;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    mainEntityOfPage: canonical,
    url: canonical,
    datePublished: article.publishedAt || undefined,
    dateModified: article.updatedAt || article.publishedAt || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    author: authorName
      ? {
          '@type': 'Person',
          name: authorName,
        }
      : undefined,
    publisher: {
      '@type': 'Organization',
      name: 'Legal Portal',
      url: PUBLIC_SITE_URL,
    },
  };

  return JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function injectHeadMeta(indexHtml, {
  title,
  description,
  canonical,
  noIndex,
  imageUrl,
  jsonLd,
}) {
  let html = indexHtml;

  html = replaceOrInsert(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+name=["']robots["'][^>]*>/i,
    `<meta name="robots" content="${noIndex ? 'noindex, nofollow' : 'index, follow'}" />`
  );

  html = replaceOrInsert(
    html,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapeHtml(title)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:type["'][^>]*>/i,
    '<meta property="og:type" content="article" />'
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`
  );

  if (imageUrl) {
    html = replaceOrInsert(
      html,
      /<meta\s+property=["']og:image["'][^>]*>/i,
      `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`
    );
  }

  html = html.replace(
    '</head>',
    `<script type="application/ld+json">${jsonLd}</script></head>`
  );

  return html;
}

function renderArticlePage(indexHtml, rawArticle) {
  const article = relationValue(rawArticle);
  const seo = relationValue(article.seo);
  const author = relationValue(article.author);
  const cover = relationValue(article.cover);
  const shareImage = relationValue(seo.shareImage);
  const category = relationValue(article.category);

  const title = seo.metaTitle || article.title || 'Legal Portal';
  const description = seo.metaDescription || article.excerpt || '';
  const fallbackCanonical = `${PUBLIC_SITE_URL}/articles/${encodeURIComponent(
    article.slug || ''
  )}`;
  const canonical = cleanCanonical(seo.canonicalUrl, fallbackCanonical);
  const imageUrl = shareImage.url || cover.url || '';

  const authorName =
    author.name || author.fullName || author.displayName || '';

  const articleBody = renderSections(article);
  const categoryName = category.name || category.title || '';
  const publishedDate = formatArticleDate(article.publishedAt);
  const articleMeta = [authorName, publishedDate].filter(Boolean).join(' · ');
  const coverAlt =
    cover.alternativeText || article.title || '';

  const body = `
    <div class="max-w-6xl mx-auto px-4 py-8">
      <main>
        <article class="mx-auto max-w-[800px]">
          <a
            href="/articles"
            class="text-blue-600 hover:underline"
          >← Все статьи</a>

          ${
            categoryName
              ? `<div class="mt-8 text-sm font-medium uppercase tracking-wide text-blue-700">${escapeHtml(
                  categoryName
                )}</div>`
              : ''
          }

          <h1 class="mt-3 text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
            ${escapeHtml(article.title || '')}
          </h1>

          ${
            article.excerpt
              ? `<p class="mt-5 text-xl leading-8 text-gray-600">${escapeHtml(
                  article.excerpt
                )}</p>`
              : ''
          }

          ${
            articleMeta
              ? `<div class="mt-5 text-sm text-gray-500">${escapeHtml(
                  articleMeta
                )}</div>`
              : ''
          }

          ${
            cover.url
              ? `<img
                  src="${escapeHtml(cover.url)}"
                  alt="${escapeHtml(coverAlt)}"
                  class="mt-8 max-h-[520px] w-full rounded-2xl object-cover"
                />`
              : ''
          }

          <div class="mt-8">
            ${articleBody}
          </div>
        </article>
      </main>
    </div>
  `;

  const jsonLd = buildJsonLd(
    article,
    canonical,
    description,
    imageUrl
  );

  let html = injectHeadMeta(indexHtml, {
    title,
    description,
    canonical,
    noIndex: Boolean(seo.noIndex),
    imageUrl,
    jsonLd,
  });

  html = html.replace(
    /<div\s+id=["']root["']\s*><\/div>/i,
    `<div id="root">${body}</div>`
  );

  return html;
}

function renderArticlesPage(indexHtml, rawArticles) {
  const articles = Array.isArray(rawArticles)
    ? rawArticles.map(relationValue)
    : [];

  const title = 'Статьи и материалы — Legal Portal';
  const description =
    'Практические материалы о недвижимости, юридических документах и развитии Legal Portal.';
  const canonical = `${PUBLIC_SITE_URL}/articles`;

  const links = articles
    .map((article) => {
      const slug = encodeURIComponent(article.slug || '');

      return `
        <article>
          <h2>
            <a href="/articles/${slug}">
              ${escapeHtml(article.title || '')}
            </a>
          </h2>
          ${
            article.excerpt
              ? `<p>${escapeHtml(article.excerpt)}</p>`
              : ''
          }
        </article>
      `;
    })
    .join('');

  const body = `
    <main>
      <h1>Статьи и материалы</h1>
      <p>${escapeHtml(description)}</p>
      ${links}
    </main>
  `;

  let html = indexHtml;

  html = replaceOrInsert(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapeHtml(description)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+name=["']robots["'][^>]*>/i,
    '<meta name="robots" content="index, follow" />'
  );

  html = replaceOrInsert(
    html,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${canonical}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapeHtml(title)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapeHtml(description)}" />`
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:type["'][^>]*>/i,
    '<meta property="og:type" content="website" />'
  );

  html = replaceOrInsert(
    html,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${canonical}" />`
  );

  html = html.replace(
    /<div\s+id=["']root["']\s*><\/div>/i,
    `<div id="root">${body}</div>`
  );

  return html;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderSitemap(rawArticles) {
  const articles = Array.isArray(rawArticles)
    ? rawArticles.map(relationValue)
    : [];

  const urls = [
    {
      loc: PUBLIC_SITE_URL,
    },
    {
      loc: `${PUBLIC_SITE_URL}/articles`,
    },
    ...articles
      .filter((article) => {
        const seo = relationValue(article.seo);
        return article.slug && !seo.noIndex;
      })
      .map((article) => ({
        loc: `${PUBLIC_SITE_URL}/articles/${encodeURIComponent(article.slug)}`,
        lastmod: article.updatedAt || article.publishedAt || '',
      })),
  ];

  const entries = urls
    .map(({ loc, lastmod }) => {
      const lastmodXml = lastmod
        ? `<lastmod>${escapeXml(new Date(lastmod).toISOString())}</lastmod>`
        : '';

      return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmodXml}
  </url>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}
</urlset>
`;
}

module.exports = {
  renderArticlePage,
  renderArticlesPage,
  renderSitemap,
};
