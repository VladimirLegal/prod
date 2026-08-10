import React, { useEffect, useState } from 'react';
import ArticleCard, { relationValue } from '../components/articles/ArticleCard';
import { getArticles } from '../services/contentApi';
import { setPageMeta } from '../utils/pageMeta';

export default function ArticlesPage() {
  const [state, setState] = useState({ loading: true, articles: [], error: false });

  useEffect(() => setPageMeta({
    title: 'Статьи и материалы — Legal Portal',
    description: 'Практические материалы о недвижимости, юридических документах и развитии Legal Portal.',
    canonical: `${window.location.origin}/articles`,
  }), []);

  useEffect(() => {
    let active = true;
    getArticles()
      .then((articles) => active && setState({ loading: false, articles, error: false }))
      .catch(() => active && setState({ loading: false, articles: [], error: true }));
    return () => { active = false; };
  }, []);

  return (
    <main>
      <header className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">Статьи и материалы</h1>
        <p className="mt-4 text-lg leading-7 text-gray-600">Практические материалы о недвижимости, юридических документах и развитии Legal Portal.</p>
      </header>
      {state.loading && <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-600"><strong className="block text-gray-900">Загрузка</strong>Загружаем материалы…</div>}
      {!state.loading && state.error && <div className="rounded-xl bg-red-50 p-8 text-center text-red-800">Материалы временно недоступны. Попробуйте открыть страницу позднее.</div>}
      {!state.loading && !state.error && state.articles.length === 0 && <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-600">Материалы пока не опубликованы.</div>}
      {!state.loading && !state.error && state.articles.length > 0 && (() => {
        const featuredIndex = state.articles.findIndex((article) => relationValue(article).featured);
        const leadIndex = featuredIndex >= 0 ? featuredIndex : 0;
        const lead = state.articles[leadIndex];
        const rest = state.articles.filter((_, index) => index !== leadIndex);
        return (
          <div className="space-y-8">
            <ArticleCard article={lead} featured />
            {rest.length > 0 && <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{rest.map((article, index) => <ArticleCard key={relationValue(article).id || relationValue(article).slug || index} article={article} />)}</div>}
          </div>
        );
      })()}
    </main>
  );
}
