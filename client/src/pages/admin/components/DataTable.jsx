import React from 'react';
import { ArrowDown, ArrowUp } from '../icons';

function SortIcon({ direction }) {
  if (!direction) return null;
  return direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function DataTable({ columns, data, sortKey, sortDirection, onSort, renderEmpty }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => {
              const isSorted = column.key === sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort && onSort(column.key)}
                      className="flex items-center gap-1 text-gray-700 hover:text-blue-600"
                    >
                      {column.label}
                      {isSorted && <SortIcon direction={sortDirection} />}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white text-sm text-gray-700">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-gray-400">
                {renderEmpty || 'Нет данных'}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={item.id || JSON.stringify(item)} className="hover:bg-gray-50">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 align-top">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;