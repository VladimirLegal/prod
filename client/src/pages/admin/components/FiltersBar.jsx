import React from 'react';

function FiltersBar({ children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

export default FiltersBar;