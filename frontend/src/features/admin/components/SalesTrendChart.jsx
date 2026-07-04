import React from "react";
import "./SalesTrendChart.css";

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatCompactCurrency(value) {
  const amount = toNumber(value);
  if (amount >= 100000000) return `${Math.round(amount / 100000000)}억`;
  if (amount >= 10000) return `${Math.round(amount / 10000)}만`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}천`;
  return `${Math.round(amount)}`;
}

function buildPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function SalesTrendChart({
  rows,
  grossKey = "gross",
  netKey = "net",
  labelKey = "label",
  grossLabel = "총매출",
  netLabel = "순매출",
  height = 300,
}) {
  const items = Array.isArray(rows) ? rows : [];
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [toNumber(item[grossKey]), toNumber(item[netKey])])
  );
  const width = Math.max(640, items.length * 72);
  const chartHeight = 210;
  const top = 18;
  const bottom = 42;
  const left = 44;
  const right = 20;
  const plotWidth = width - left - right;
  const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth;
  const y = (value) => top + chartHeight - (toNumber(value) / maxValue) * chartHeight;
  const x = (index) => left + (items.length > 1 ? step * index : plotWidth / 2);
  const netPoints = items.map((item, index) => ({ x: x(index), y: y(item[netKey]) }));

  if (!items.length) {
    return <p className="admin-empty-copy">집계할 매출 데이터가 없습니다.</p>;
  }

  return (
    <div className="sales-trend-chart" style={{ minHeight: height }}>
      <div className="sales-trend-chart__legend">
        <span className="gross">{grossLabel}</span>
        <span className="line">{netLabel}</span>
      </div>
      <div className="sales-trend-chart__svg-wrap">
        <svg
          className="sales-trend-chart__svg"
          viewBox={`0 0 ${width} ${top + chartHeight + bottom}`}
          role="img"
          aria-label={`${grossLabel}와 ${netLabel} 추세 차트`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const gridY = top + chartHeight * ratio;
            const value = maxValue * (1 - ratio);
            return (
              <g key={ratio}>
                <line x1={left} x2={width - right} y1={gridY} y2={gridY} className="sales-trend-chart__grid" />
                <text x={left - 8} y={gridY + 4} className="sales-trend-chart__axis" textAnchor="end">
                  {formatCompactCurrency(value)}
                </text>
              </g>
            );
          })}

          {items.map((item, index) => {
            const grossValue = toNumber(item[grossKey]);
            const barHeight = chartHeight - (y(grossValue) - top);
            const barWidth = Math.min(26, Math.max(14, step * 0.38));
            const barX = x(index) - barWidth / 2;
            const label = String(item[labelKey] || item.key || index + 1);
            return (
              <g key={`${label}-${index}`}>
                <rect
                  x={barX}
                  y={top + chartHeight - barHeight}
                  width={barWidth}
                  height={Math.max(1, barHeight)}
                  rx="5"
                  className="sales-trend-chart__gross-bar"
                >
                  <title>{`${label} ${grossLabel}: ${grossValue.toLocaleString("ko-KR")}원`}</title>
                </rect>
                <text x={x(index)} y={top + chartHeight + 24} className="sales-trend-chart__label" textAnchor="middle">
                  {label}
                </text>
                <text x={x(index)} y={top + chartHeight + 38} className="sales-trend-chart__sub" textAnchor="middle">
                  {formatCompactCurrency(item[netKey])}
                </text>
              </g>
            );
          })}

          <path d={buildPath(netPoints)} className="sales-trend-chart__net-line" />
          {netPoints.map((point, index) => {
            const item = items[index];
            const label = String(item?.[labelKey] || item?.key || index + 1);
            const value = toNumber(item?.[netKey]);
            return (
              <circle key={`${label}-net-${index}`} cx={point.x} cy={point.y} r="4" className="sales-trend-chart__net-dot">
                <title>{`${label} ${netLabel}: ${value.toLocaleString("ko-KR")}원`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
