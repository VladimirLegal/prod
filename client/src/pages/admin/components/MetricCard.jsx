import React from 'react';

function MetricCard({ title, value, trend, icon: Icon, accent = 'bg-blue-100 text-blue-600' }) {
  return (
    <div className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        {trend && <p className="text-xs text-gray-500">{trend}</p>}
      </div>
      {Icon && (
        <span className={`rounded-full p-3 ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
      )}
    </div>
  );
}

export default MetricCard;