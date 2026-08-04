import React from 'react';

function renderText(node, key) {
  if (!node) return null;
  if (node.type === 'link') {
    const external = /^https?:\/\//i.test(node.url || '');
    return (
      <a
        key={key}
        href={node.url}
        className="text-blue-600 underline hover:text-blue-800"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {(node.children || []).map((child, index) => renderText(child, `${key}-${index}`))}
      </a>
    );
  }

  if (Array.isArray(node.children)) {
    return <React.Fragment key={key}>{node.children.map((child, index) => renderText(child, `${key}-${index}`))}</React.Fragment>;
  }

  let content = node.text || '';
  if (node.code) content = <code className="rounded bg-gray-100 px-1 py-0.5 text-sm">{content}</code>;
  if (node.bold) content = <strong>{content}</strong>;
  if (node.italic) content = <em>{content}</em>;
  if (node.underline) content = <u>{content}</u>;
  if (node.strikethrough) content = <s>{content}</s>;
  return <React.Fragment key={key}>{content}</React.Fragment>;
}

function childrenOf(block) {
  return (block.children || []).map((child, index) => renderText(child, index));
}

function renderListItem(item, key) {
  return (
    <li key={key} className="pl-1">
      {(item.children || []).map((child, index) => (
        child.type === 'list'
          ? renderBlock(child, `${key}-${index}`)
          : renderText(child, `${key}-${index}`)
      ))}
    </li>
  );
}

function renderBlock(block, key) {
  switch (block?.type) {
    case 'paragraph':
      return (
        <p
          key={key}
          className="my-4 min-h-[0.25rem] text-left leading-7 text-gray-700 md:text-justify"
        >
          {childrenOf(block)}
        </p>
      );
    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(block.level) || 2));
      const Heading = `h${level}`;
      const sizes = { 2: 'text-2xl', 3: 'text-xl', 4: 'text-lg' };
      return <Heading key={key} className={`mb-3 mt-8 font-bold text-gray-900 ${sizes[level]}`}>{childrenOf(block)}</Heading>;
    }
    case 'list': {
      const List = block.format === 'ordered' ? 'ol' : 'ul';
      return (
        <List key={key} className={`my-4 space-y-2 pl-6 text-gray-700 ${List === 'ol' ? 'list-decimal' : 'list-disc'}`}>
          {(block.children || []).map((item, index) => renderListItem(item, `${key}-${index}`))}
        </List>
      );
    }
    case 'quote':
      return <blockquote key={key} className="my-6 border-l-4 border-blue-500 bg-blue-50 px-5 py-3 italic text-gray-700">{childrenOf(block)}</blockquote>;
    case 'code':
      return <pre key={key} className="my-6 overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>{block.code || block.text || ''}</code></pre>;
    case 'image': {
      const image = block.image || block;
      const url = image.url;
      if (!url) return null;
      return (
        <figure key={key} className="my-7">
          <img src={url} alt={image.alternativeText || image.caption || ''} className="mx-auto max-h-[560px] rounded-lg object-contain" />
          {image.caption && <figcaption className="mt-2 text-center text-sm text-gray-500">{image.caption}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
  }
}

export default function BlocksRenderer({ content }) {
  if (!Array.isArray(content)) return null;
  return <div>{content.map((block, index) => renderBlock(block, index))}</div>;
}
