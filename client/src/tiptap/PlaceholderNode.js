// client/src/tiptap/PlaceholderNode.js
import { Node } from '@tiptap/core';

export const PlaceholderNode = Node.create({
  name: 'placeholderNode',
  group: 'inline',
  inline: true,
  atom: true,          // атомарный: курсор внутрь не ставится
  selectable: true,

  addAttributes() {
    return {
      key: { default: '' },
      value: { default: '' },  // отображаемое значение (текст)
      class: { default: 'ph-chip' },
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-ph]',
      getAttrs: el => {
        const key = el.getAttribute('data-ph') || '';
        const klass = el.getAttribute('class') || '';
        const value = el.textContent || '';
        return { key, class: klass || 'ph-chip', value };
      }
    }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { key, value } = node.attrs;
    const attrs = {
      ...HTMLAttributes,
      'data-ph': key,
      contenteditable: 'false',
    };
    // Гарантируем класс ph-chip
    attrs.class = (attrs.class || '').includes('ph-chip')
      ? attrs.class
      : ((attrs.class ? attrs.class + ' ' : '') + 'ph-chip');

    return ['span', attrs, value || ''];
  },
});
