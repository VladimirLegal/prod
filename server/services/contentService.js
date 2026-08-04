const CONTENT_API_URL = (process.env.CONTENT_API_URL || 'http://localhost:1337').replace(
  /\/+$/,
  ''
);
const REQUEST_TIMEOUT_MS = 5000;

class ContentServiceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ContentServiceError';
  }
}

function addFields(params, fields) {
  fields.forEach((field, index) => params.append(`fields[${index}]`, field));
}

function addPopulate(params, relations) {
  relations.forEach((relation, index) => params.append(`populate[${index}]`, relation));
}

/**
 * Strapi может возвращать media URL в виде /uploads/file.png.
 * Преобразуем только адреса media-файлов в абсолютные.
 * Обычные ссылки сайта, например /property-type/rent, не затрагиваем.
 */
function normalizeMediaUrls(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeMediaUrls);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const normalized = {};

  Object.entries(value).forEach(([key, nestedValue]) => {
    normalized[key] = normalizeMediaUrls(nestedValue);
  });

  const isMediaObject =
    typeof normalized.url === 'string' &&
    (normalized.mime ||
      normalized.ext ||
      normalized.provider ||
      normalized.formats ||
      normalized.hash);

  if (isMediaObject && normalized.url.startsWith('/')) {
    normalized.url = `${CONTENT_API_URL}${normalized.url}`;
  }

  return normalized;
}

async function requestArticles(params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${CONTENT_API_URL}/api/articles?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new ContentServiceError(`Content API responded with ${response.status}`);
    }

    const payload = await response.json();
    const articles = Array.isArray(payload?.data) ? payload.data : [];

    return articles.map(normalizeMediaUrls);
  } catch (error) {
    if (error instanceof ContentServiceError) throw error;

    throw new ContentServiceError('Content API request failed', {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getArticles() {
  const params = new URLSearchParams({ status: 'published' });

  addFields(params, [
    'title',
    'slug',
    'publicationType',
    'excerpt',
    'featured',
    'publishedAt',
    'updatedAt',
  ]);

  addPopulate(params, ['category', 'author', 'cover']);

  params.append('sort[0]', 'featured:desc');
  params.append('sort[1]', 'publishedAt:desc');

  return requestArticles(params);
}

async function getArticleBySlug(slug) {
  const params = new URLSearchParams({ status: 'published' });

  addFields(params, [
    'title',
    'slug',
    'publicationType',
    'excerpt',
    'content',
    'featured',
    'publishedAt',
    'updatedAt',
  ]);

  params.append('populate[cover]', 'true');
  params.append('populate[category]', 'true');
  params.append('populate[author]', 'true');
  params.append('populate[seo]', 'true');
  params.append('populate[relatedService]', 'true');
  params.append('populate[legalSources]', 'true');

  // Текстовый компонент Dynamic Zone.
  params.append(
    'populate[sections][on][article.text-section][fields][0]',
    'content'
  );

  // Графический компонент Dynamic Zone с вложенным media-файлом.
  params.append(
    'populate[sections][on][article.image-section][populate][image]',
    'true'
  );

  params.append('filters[slug][$eq]', slug);
  params.append('pagination[pageSize]', '1');

  const articles = await requestArticles(params);
  return articles[0] || null;
}

module.exports = {
  ContentServiceError,
  getArticles,
  getArticleBySlug,
};
