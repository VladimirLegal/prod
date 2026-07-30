async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function getArticles() {
  const response = await fetch('/api/content/articles', { headers: { Accept: 'application/json' } });
  const data = await readJson(response);
  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || 'content_service_unavailable');
  }
  return Array.isArray(data.articles) ? data.articles : [];
}

export async function getArticleBySlug(slug) {
  const response = await fetch(`/api/content/articles/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await readJson(response);

  if (response.status === 404) return { found: false, article: null };
  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || 'content_service_unavailable');
  }
  return { found: true, article: data.article };
}
