import React from 'react';
import { Link } from 'react-router-dom';

export function relationValue(value) {
  return value?.data?.attributes || value?.data || value?.attributes || value || {};
}

export function coverUrl(cover) {
  const value = relationValue(cover);
  const url = value.url;
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${(process.env.REACT_APP_CONTENT_API_URL || 'https://cms.legal-portal.pro').replace(/\/$/, '')}${url}`;
}

export function formatArticleDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default function ArticleCard({ article, featured = false }) {
  const item = relationValue(article);
  const category = relationValue(item.category);
  const author = relationValue(item.author);
  const image = coverUrl(item.cover);

  return (
    <article className={`flex h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${featured ? 'md:grid md:grid-cols-2' : 'flex-col'}`}>
      {image ? (
        <img src={image} alt={relationValue(item.cover).alternativeText || item.title || ''} className={`w-full object-cover ${featured ? 'h-64 md:h-full' : 'h-52'}`} />
      ) : (
        <div className={`flex items-center justify-center bg-gradient-to-br from-blue-700 to-sky-500 font-bold tracking-wide text-white ${featured ? 'h-64 md:h-full' : 'h-52'}`}>Legal Portal</div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-blue-700">
          {item.featured && <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">Рекомендуем</span>}
          {(category.name || category.title) && <span>{category.name || category.title}</span>}
        </div>
        <h2 className={`${featured ? 'text-2xl md:text-3xl' : 'text-xl'} font-bold text-gray-900`}>{item.title}</h2>
        {item.excerpt && <p className="mt-3 leading-6 text-gray-600">{item.excerpt}</p>}
        <div className="mt-auto pt-5 text-sm text-gray-500">
          {[author.name || author.fullName || author.displayName, formatArticleDate(item.publishedAt)].filter(Boolean).join(' · ')}
        </div>
        <Link to={`/articles/${item.slug}`} className="mt-5 inline-flex w-fit rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700">Читать статью</Link>
      </div>
    </article>
  );
}
