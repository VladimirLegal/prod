const META_SELECTORS = [
  ['meta[name="description"]', 'content'],
  ['meta[name="robots"]', 'content'],
  ['link[rel="canonical"]', 'href'],
  ['meta[property="og:title"]', 'content'],
  ['meta[property="og:description"]', 'content'],
  ['meta[property="og:type"]', 'content'],
  ['meta[property="og:url"]', 'content'],
  ['meta[property="og:image"]', 'content'],
];

function ensureElement(selector) {
  let element = document.head.querySelector(selector);
  if (element) return { element, created: false };

  const isLink = selector.startsWith('link');
  element = document.createElement(isLink ? 'link' : 'meta');
  const match = selector.match(/\[(.+?)="(.+?)"\]/);
  if (match) element.setAttribute(match[1], match[2]);
  document.head.appendChild(element);
  return { element, created: true };
}

export function setPageMeta(meta = {}) {
  const previousTitle = document.title;
  const previous = META_SELECTORS.map(([selector, attribute]) => {
    const existing = document.head.querySelector(selector);
    return { selector, attribute, existed: Boolean(existing), value: existing?.getAttribute(attribute) };
  });

  const values = {
    'meta[name="description"]': meta.description,
    'meta[name="robots"]': meta.noIndex ? 'noindex, nofollow' : 'index, follow',
    'link[rel="canonical"]': meta.canonical,
    'meta[property="og:title"]': meta.title,
    'meta[property="og:description"]': meta.description,
    'meta[property="og:type"]': meta.type || 'website',
    'meta[property="og:url"]': meta.canonical,
    'meta[property="og:image"]': meta.image,
  };

  if (meta.title) document.title = meta.title;
  META_SELECTORS.forEach(([selector, attribute]) => {
    const value = values[selector];
    if (!value) return;
    ensureElement(selector).element.setAttribute(attribute, value);
  });

  return () => {
    document.title = previousTitle;
    previous.forEach(({ selector, attribute, existed, value }) => {
      const element = document.head.querySelector(selector);
      if (!element) return;
      if (!existed) element.remove();
      else if (value === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, value);
    });
  };
}
