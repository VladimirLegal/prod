import React from 'react';
import { coverUrl, relationValue } from './ArticleCard';
import BlocksRenderer from './BlocksRenderer';

function getSectionKey(section, index) {
  const item = relationValue(section);

  return item.id || `${item.__component || 'section'}-${index}`;
}

function TextSection({ section }) {
  const item = relationValue(section);

  return <BlocksRenderer content={item.content} />;
}

function ImageSection({ section }) {
  const item = relationValue(section);
  const media = relationValue(item.image);
  const imageUrl = coverUrl(item.image);

  if (!imageUrl) return null;

  const alternativeText =
    item.alternativeText ||
    media.alternativeText ||
    item.caption ||
    'Иллюстрация к статье';

  return (
    <figure className="my-8">
      <a
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-zoom-in"
        aria-label={`${alternativeText}. Открыть изображение в полном размере`}
      >
        <img
          src={imageUrl}
          alt={alternativeText}
          className="h-auto w-full rounded-xl border border-gray-200 object-contain shadow-sm"
          loading="lazy"
        />
      </a>

      {item.caption && (
        <figcaption className="mt-3 text-left text-sm leading-6 text-gray-500">
          {item.caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function ArticleSectionsRenderer({ sections }) {
  if (!Array.isArray(sections)) return null;

  return (
    <div>
      {sections.map((section, index) => {
        const item = relationValue(section);
        const key = getSectionKey(section, index);

        switch (item.__component) {
          case 'article.text-section':
            return <TextSection key={key} section={section} />;

          case 'article.image-section':
            return <ImageSection key={key} section={section} />;

          default:
            return null;
        }
      })}
    </div>
  );
}