import React from 'react';
import { ArrowLeft, ArrowRight } from '../icons';

function Pagination({ total, limit, offset, onChange }) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const goTo = (page) => {
    const nextOffset = (page - 1) * limit;
    onChange?.(nextOffset);
  };

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
      <span>
        Страница {currentPage} из {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
          onClick={() => goTo(currentPage - 1)}
          disabled={!canPrev}
        >
          <ArrowLeft className="h-3 w-3" />
          Назад
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-gray-200 px-3 py-1 disabled:opacity-40"
          onClick={() => goTo(currentPage + 1)}
          disabled={!canNext}
        >
          Вперёд
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;