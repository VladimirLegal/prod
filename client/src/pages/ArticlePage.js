import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BlocksRenderer from '../components/articles/BlocksRenderer';
import ArticleSectionsRenderer from '../components/articles/ArticleSectionsRenderer';
import { coverUrl, formatArticleDate, relationValue } from '../components/articles/ArticleCard';
import { getArticleBySlug } from '../services/contentApi';
import { setPageMeta } from '../utils/pageMeta';

function getCleanCanonical(value, fallback) {
  try {
    const url = new URL(value || fallback, window.location.origin);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

function NamedLink({ value }) {
  const item = relationValue(value);
  const label = item.name || item.title || item.label;
  if (!label) return null;
  return item.url ? <a href={item.url} className="font-medium text-blue-600 hover:underline">{label}</a> : <span>{label}</span>;
}

export default function ArticlePage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, article: null, notFound: false, error: false });

  useEffect(() => {
    let active = true;
    setState({ loading: true, article: null, notFound: false, error: false });
    getArticleBySlug(slug)
      .then((result) => active && setState({ loading: false, article: result.article, notFound: !result.found, error: false }))
      .catch(() => active && setState({ loading: false, article: null, notFound: false, error: true }));
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!state.article) return undefined;
    const article = relationValue(state.article);
    const seo = relationValue(article.seo);
    const seoImage =
      coverUrl(seo.shareImage) ||
      coverUrl(article.cover);
    return setPageMeta({
      title: seo.metaTitle || article.title,
      description: seo.metaDescription || article.excerpt,
      canonical: getCleanCanonical(
        seo.canonicalUrl,
        `${window.location.origin}/articles/${encodeURIComponent(article.slug)}`
      ),
      noIndex: Boolean(seo.noIndex),
      type: 'article',
      image: seoImage,
    });
  }, [state.article]);

  if (state.loading) return <main className="py-16 text-center text-gray-600">Загружаем материал…</main>;
  if (state.notFound) return <main className="py-16 text-center"><h1 className="text-3xl font-bold">Материал не найден</h1><Link to="/articles" className="mt-5 inline-block text-blue-600 hover:underline">Вернуться ко всем статьям</Link></main>;
  if (state.error) return <main className="py-16 text-center text-gray-700">Материал временно недоступен. Попробуйте открыть страницу позднее.</main>;

  const article = relationValue(state.article);
  const category = relationValue(article.category);
  const author = relationValue(article.author);
  const image = coverUrl(article.cover);
  const sourcesValue = article.legalSources?.data || article.legalSources;
  const sources = Array.isArray(sourcesValue) ? sourcesValue : [];

  const sectionsValue = article.sections?.data || article.sections;
  const sections = Array.isArray(sectionsValue) ? sectionsValue : [];

  return (
    <main>
      <article className="mx-auto max-w-[800px]">
        <Link to="/articles" className="text-blue-600 hover:underline">← Все статьи</Link>
        {(category.name || category.title) && <div className="mt-8 text-sm font-medium uppercase tracking-wide text-blue-700">{category.name || category.title}</div>}
        <h1 className="mt-3 text-3xl font-bold leading-tight text-gray-900 md:text-5xl">{article.title}</h1>
        {article.excerpt && <p className="mt-5 text-xl leading-8 text-gray-600">{article.excerpt}</p>}
        <div className="mt-5 text-sm text-gray-500">{[author.name || author.fullName || author.displayName, formatArticleDate(article.publishedAt)].filter(Boolean).join(' · ')}</div>
        {image && <img src={image} alt={relationValue(article.cover).alternativeText || article.title || ''} className="mt-8 max-h-[520px] w-full rounded-2xl object-cover" />}
        <div className="mt-8">
          {sections.length > 0 ? (
            <ArticleSectionsRenderer sections={sections} />
          ) : (
            <BlocksRenderer content={article.content} />
          )}
        </div>

        {sources.length > 0 && <section className="mt-10 border-t pt-7"><h2 className="text-xl font-bold">Правовые источники</h2><ul className="mt-3 list-disc space-y-2 pl-5">{sources.map((source, index) => <li key={relationValue(source).id || index}><NamedLink value={source} /></li>)}</ul></section>}
        {(relationValue(article.relatedService).name || relationValue(article.relatedService).title) && <section className="mt-8 rounded-xl bg-blue-50 p-6"><h2 className="text-lg font-bold">Связанная услуга</h2><div className="mt-2"><NamedLink value={article.relatedService} /></div></section>}
        {(author.name || author.fullName || author.displayName) && (
          <section className="mt-8 rounded-xl border p-6">
            <h2 className="text-lg font-bold">Об авторе</h2>

            <p className="mt-2 font-medium">
              {author.name || author.fullName || author.displayName}
            </p>

            {Array.isArray(author.bio) ? (
              <div className="mt-2 text-gray-600">
                <BlocksRenderer content={author.bio} />
              </div>
            ) : (
              author.bio && <p className="mt-2 text-gray-600">{author.bio}</p>
            )}
          </section>
        )}
      </article>
    </main>
  );
}
