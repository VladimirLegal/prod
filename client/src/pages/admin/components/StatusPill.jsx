import React from 'react';

const COLOR_MAP = {
  role: {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    user: 'bg-gray-100 text-gray-700',
  },
  status: {
    active: 'bg-green-100 text-green-700',
    blocked: 'bg-red-100 text-red-700',
    deleted: 'bg-gray-200 text-gray-700',
    draft: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-emerald-100 text-emerald-700',
  },
  feedback: {
    new: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
  },
};

function humanize(value) {
  if (!value) return '';
  return value
    .toString()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusPill({ value, kind = 'status' }) {
  const normalized = value ? String(value).toLowerCase() : '';
  const palette = COLOR_MAP[kind] || {};
  const className = palette[normalized] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {humanize(value)}
    </span>
  );
}

export default StatusPill;