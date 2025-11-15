import React from 'react';
import { formatDateTime, formatRelativeTime } from '../../../utils/date';

function Timeline({ items = [] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-600">Последние события</h3>
      <ul className="space-y-3 text-sm text-gray-700">
        {items.length === 0 && <li className="text-gray-400">История пуста</li>}
        {items.map((item) => (
          <li key={`${item.ts}-${item.action}`} className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
            <div>
              <p className="font-medium text-gray-800">{item.action}</p>
              <p className="text-xs text-gray-500">
                {formatDateTime(item.ts)} · {formatRelativeTime(item.ts)}
              </p>
              {item.meta && (
                <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-500">
                  {JSON.stringify(item.meta, null, 2)}
                </pre>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Timeline;