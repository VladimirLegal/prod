import React from 'react';

function normalizeNumber(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return 0;
}

function SimpleLineChart({
  data = [],
  labelKey = 'label',
  valueKey = 'value',
  color = '#3b82f6',
  height = 220,
  emptyLabel = 'Нет данных',
}) {
  const values = data.map((item) => normalizeNumber(item[valueKey]));
  const maxValue = Math.max(...values, 1);
  const steps = Math.min(4, Math.max(data.length - 1, 1));

  if (!data.length) {
    return (
      <div className="grid h-full place-items-center text-sm text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  const points = data.map((item, index) => {
    const value = normalizeNumber(item[valueKey]);
    const xRatio = data.length > 1 ? index / (data.length - 1) : 0.5;
    const yRatio = value / maxValue;
    const x = 6 + xRatio * 88;
    const y = 88 - yRatio * 70;
    return `${x},${y}`;
  });

  const horizontalLines = Array.from({ length: steps + 1 }).map((_, index) => {
    const y = 88 - (index / steps) * 70;
    const value = Math.round((index / steps) * maxValue);
    return { y, value };
  });

  const verticalLines = data.map((item, index) => {
    const xRatio = data.length > 1 ? index / (data.length - 1) : 0.5;
    const x = 6 + xRatio * 88;
    return { x, label: item[labelKey] };
  });

  return (
    <div className="flex h-full flex-col">
      <div className="relative w-full" style={{ height }}>
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <rect x="6" y="18" width="88" height="70" fill="#f8fafc" />
          {horizontalLines.map((line) => (
            <g key={line.y}>
              <line x1="6" x2="94" y1={line.y} y2={line.y} stroke="#e2e8f0" strokeWidth="0.4" />
              <text x="2" y={line.y + 1.5} fontSize="3" fill="#94a3b8">
                {line.value}
              </text>
            </g>
          ))}
          {verticalLines.map((line) => (
            <line
              key={line.x}
              x1={line.x}
              x2={line.x}
              y1="18"
              y2="88"
              stroke="#e2e8f0"
              strokeWidth="0.3"
            />
          ))}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(' ')}
          />
          {points.map((point, index) => {
            const [x, y] = point.split(',');
            return <circle key={point} cx={x} cy={y} r="1.4" fill={color} />;
          })}
        </svg>
      </div>
      <div
        className="mt-2 grid gap-2 text-xs text-gray-500"
        style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
      >
        {data.map((item, index) => (
          <span key={`${item[labelKey]}-${index}`} className="text-center">
            {item[labelKey]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default SimpleLineChart;