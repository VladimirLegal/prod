import React from 'react';

const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444'];

function normalizeValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function SimplePieChart({ data = [], size = 160, strokeWidth = 24, centerLabel, centerSubLabel, emptyLabel = 'Нет данных' }) {
  const entries = data
    .map((item, index) => ({
      ...item,
      value: normalizeValue(item.value),
      color: item.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    }))
    .filter((item) => item.value > 0);

  const total = entries.reduce((acc, item) => acc + item.value, 0);

  if (!total) {
    return (
      <div className="grid h-full place-items-center text-sm text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let dashOffset = 0;

  return (
    <div className="relative mx-auto" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {entries.map((entry) => {
            const length = (entry.value / total) * circumference;
            const element = (
              <circle
                key={entry.name}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={entry.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-dashOffset}
                strokeLinecap="round"
              />
            );
            dashOffset += length;
            return element;
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-semibold text-gray-700">{centerLabel ?? total}</span>
        {centerSubLabel ? <span className="text-xs text-gray-400">{centerSubLabel}</span> : null}
      </div>
    </div>
  );
}

export default SimplePieChart;