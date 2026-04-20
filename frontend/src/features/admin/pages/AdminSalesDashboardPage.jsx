import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../../../shared/components/SiteHeader.jsx";
import { apiRequest } from "../../../shared/api/client.js";
import { useAppStore } from "../../../shared/store/AppContext.jsx";

const SALES_PERIOD_OPTIONS = [
  { value: "day", label: "일별" },
  { value: "week", label: "주간" },
  { value: "month", label: "월간" },
  { value: "year", label: "연간" },
];
const PERIOD_VISIBLE_COUNT = {
  day: 7,
  week: 5,
  month: 12,
  year: 10,
};
const PERIOD_UNIT_LABEL = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.0";
  return parsed.toFixed(1);
}

function normalizeAgeGroupLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "미분류";

  const compact = text.replace(/\s+/g, "");
  if (compact.includes("10")) return "10대 이하";
  if (compact.includes("20")) return "20대";
  if (compact.includes("30")) return "30대";
  if (compact.includes("40")) return "40대";
  if (compact.includes("50")) return "50대";
  if (
    compact.includes("60") ||
    compact.includes("70") ||
    compact.includes("80") ||
    compact.includes("90")
  ) {
    return "60대 이상";
  }

  if (/^[가-힣]+대$/.test(compact)) return compact;
  return "미분류";
}

export function AdminSalesDashboardPage() {
  const store = useAppStore();
  const today = useMemo(() => new Date(), []);
  const defaultStartDate = useMemo(() => {
    const copy = new Date(today);
    copy.setDate(copy.getDate() - 29);
    return toDateInputValue(copy);
  }, [today]);
  const defaultEndDate = useMemo(() => toDateInputValue(today), [today]);

  const [period, setPeriod] = useState("month");
  const [dateRange, setDateRange] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });
  const [appliedDateRange, setAppliedDateRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [videoSearchKeyword, setVideoSearchKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadSalesDashboard() {
      try {
        setLoading(true);
        setErrorMessage("");

        const query = new URLSearchParams();
        query.set("period", period);

        if (appliedDateRange.startDate && appliedDateRange.endDate) {
          query.set("startDate", appliedDateRange.startDate);
          query.set("endDate", appliedDateRange.endDate);
        }

        const result = await apiRequest(`/admin/dashboard/sales?${query.toString()}`);
        if (!mounted) return;
        setDashboard(result || null);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "매출 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSalesDashboard();

    return () => {
      mounted = false;
    };
  }, [period, appliedDateRange.startDate, appliedDateRange.endDate]);

  const summary = dashboard?.summary || {
    lifetimeRevenue: 0,
    lifetimeGrossRevenue: 0,
    lifetimeNetRevenue: 0,
    lifetimeRefundRevenue: 0,
    lifetimeOrderCount: 0,
    periodRevenue: 0,
    periodGrossRevenue: 0,
    periodNetRevenue: 0,
    periodRefundRevenue: 0,
    periodOrderCount: 0,
    averageOrderAmount: 0,
  };

  const resolvedRange = dashboard?.range || { startDate: "", endDate: "", isCustomRange: false };
  const series = Array.isArray(dashboard?.series) ? dashboard.series : [];
  const videoSales = Array.isArray(dashboard?.videoSales) ? dashboard.videoSales : [];
  const ageGroupSales = Array.isArray(dashboard?.ageGroupSales) ? dashboard.ageGroupSales : [];
  const chartSeries = useMemo(
    () => {
      const visibleCount = PERIOD_VISIBLE_COUNT[period] || series.length;
      return series.slice(-visibleCount);
    },
    [period, series]
  );

  const periodLabel =
    SALES_PERIOD_OPTIONS.find((option) => option.value === period)?.label || "월간";
  const defaultRangeDescription = useMemo(() => {
    if (period === "day") return "최근 7일";
    if (period === "week") return "최근 5주";
    if (period === "month") return "해당 연도 1월~12월";
    return "최근 10년";
  }, [period]);

  const maxRevenue = useMemo(
    () =>
      Math.max(
        1,
        ...chartSeries.map((item) =>
          Math.max(toAmount(item.grossRevenue || item.totalRevenue), toAmount(item.netRevenue))
        )
      ),
    [chartSeries]
  );

  const topRevenueVideos = useMemo(() => videoSales.slice(0, 3), [videoSales]);
  const topSaleCountVideos = useMemo(
    () =>
      [...videoSales]
        .sort((a, b) => {
          const saleDiff = toAmount(b.saleCount) - toAmount(a.saleCount);
          if (saleDiff !== 0) return saleDiff;
          return toAmount(b.netRevenue || b.revenue) - toAmount(a.netRevenue || a.revenue);
        })
        .slice(0, 3),
    [videoSales]
  );
  const topAgeGroups = useMemo(() => {
    if (ageGroupSales.length) {
      return ageGroupSales.slice(0, 3).map((item) => ({
        ...item,
        ageGroup: normalizeAgeGroupLabel(item?.ageGroup),
      }));
    }
    const fallbackOrders = toAmount(summary.periodOrderCount);
    const fallbackRevenue = toAmount(summary.periodNetRevenue || summary.periodRevenue);
    if (fallbackOrders <= 0 && fallbackRevenue <= 0) return [];
    return [
      {
        ageGroup: "미분류",
        orderCount: fallbackOrders,
        netRevenue: fallbackRevenue,
        revenue: fallbackRevenue,
      },
    ];
  }, [ageGroupSales, summary.periodNetRevenue, summary.periodOrderCount, summary.periodRevenue]);
  const topMixVideos = useMemo(() => videoSales.slice(0, 5), [videoSales]);
  const filteredVideoSales = useMemo(() => {
    const keyword = String(videoSearchKeyword || "").trim().toLowerCase();
    if (!keyword) return videoSales;

    return videoSales.filter((item) => {
      const searchableText = [
        item?.title,
        item?.instructor,
        item?.productId,
        item?.videoId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [videoSales, videoSearchKeyword]);

  const periodGross = toAmount(summary.periodGrossRevenue || summary.periodRevenue);
  const periodNet = toAmount(summary.periodNetRevenue);
  const periodRefund = toAmount(summary.periodRefundRevenue);
  const periodOrders = toAmount(summary.periodOrderCount);

  const lineDots = useMemo(
    () =>
      chartSeries.map((item, index) => {
        const value = toAmount(item.netRevenue);
        const y = 100 - (value / maxRevenue) * 100;
        const x =
          chartSeries.length > 0 ? ((index + 0.5) * 100) / chartSeries.length : 50;
        return {
          key: item.key,
          x,
          y: Math.max(4, Math.min(96, y)),
          value,
        };
      }),
    [chartSeries, maxRevenue]
  );

  const linePoints = useMemo(
    () => lineDots.map((dot) => `${dot.x},${dot.y}`).join(" "),
    [lineDots]
  );

  const lastSeries = chartSeries.length ? chartSeries[chartSeries.length - 1] : null;
  const prevSeries = chartSeries.length > 1 ? chartSeries[chartSeries.length - 2] : null;
  const lastNet = toAmount(lastSeries?.netRevenue);
  const prevNet = toAmount(prevSeries?.netRevenue);
  const netGrowthRate = prevNet > 0 ? ((lastNet - prevNet) / prevNet) * 100 : 0;

  const refundRate = periodGross > 0 ? (periodRefund / periodGross) * 100 : 0;
  const topVideo = topRevenueVideos[0] || null;

  const totalVideoNet = topMixVideos.reduce(
    (sum, item) => sum + toAmount(item.netRevenue || item.revenue),
    0
  );
  const mixItems = topMixVideos.map((item) => {
    const netRevenue = toAmount(item.netRevenue || item.revenue);
    return {
      ...item,
      netRevenue,
      share: totalVideoNet > 0 ? (netRevenue / totalVideoNet) * 100 : 0,
    };
  });

  const kpiCards = [
    {
      label: "선택 기간 총매출",
      value: store.formatCurrency(periodGross),
      hint: `${periodOrders}건 주문 기준`,
      tone: "gold",
    },
    {
      label: "선택 기간 순매출",
      value: store.formatCurrency(periodNet),
      hint: `전 구간 대비 ${toPercent(netGrowthRate)}%`,
      tone: netGrowthRate >= 0 ? "up" : "down",
    },
    {
      label: "환불/취소 금액",
      value: store.formatCurrency(periodRefund),
      hint: `환불률 ${toPercent(refundRate)}%`,
      tone: "neutral",
    },
    {
      label: "평균 객단가",
      value: store.formatCurrency(toAmount(summary.averageOrderAmount)),
      hint: `${periodLabel} 평균`,
      tone: "neutral",
    },
    {
      label: "주문 건수",
      value: `${periodOrders}건`,
      hint: `총 ${toAmount(summary.lifetimeOrderCount)}건 누적`,
      tone: "neutral",
    },
    {
      label: "최고 매출 강의",
      value: topVideo ? topVideo.title : "데이터 없음",
      hint: topVideo
        ? `${store.formatCurrency(toAmount(topVideo.netRevenue || topVideo.revenue))}`
        : "-",
      tone: "neutral",
    },
  ];

  return (
    <div className="site-shell">
      <SiteHeader subpage />

      <main className="dashboard-page admin-dashboard-page admin-sales-page">
        <section className="admin-dashboard-switch">
          <Link className="admin-dashboard-switch-link active" to="/admin">
            매출 대시보드
          </Link>
          <Link className="admin-dashboard-switch-link" to="/admin/members">
            회원 관리
          </Link>
        </section>

        <section className="dashboard-card admin-sales-hero-card">
          <p className="section-kicker">관리자 대시보드</p>
          <h1>매출 현황 보고서</h1>
          <div className="admin-sales-hero-meta">
            <span>
              조회 기간: {resolvedRange.isCustomRange && resolvedRange.startDate && resolvedRange.endDate
                ? `${resolvedRange.startDate} ~ ${resolvedRange.endDate}`
                : `기본 구간 (${defaultRangeDescription})`}
            </span>
            <span>집계 단위: {periodLabel}</span>
            <span>
              갱신 시각: {dashboard?.generatedAt ? new Date(dashboard.generatedAt).toLocaleString("ko-KR") : "-"}
            </span>
          </div>
        </section>

        <section className="dashboard-card admin-sales-filter-panel">
          <div className="admin-members-toolbar">
            <h2>조건 필터</h2>
            <div className="admin-sales-toolbar-right">
              <div className="admin-sales-period-tabs">
                {SALES_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`admin-sales-period-tab${period === option.value ? " active" : ""}`}
                    onClick={() => setPeriod(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="admin-sales-date-range">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(event) =>
                    setDateRange((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
                <span>~</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(event) =>
                    setDateRange((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="admin-sales-range-button"
                  onClick={() => {
                    if (!dateRange.startDate || !dateRange.endDate) {
                      setErrorMessage("시작일과 종료일을 모두 선택해 주세요.");
                      return;
                    }
                    if (dateRange.startDate > dateRange.endDate) {
                      setErrorMessage("시작일이 종료일보다 늦을 수 없습니다.");
                      return;
                    }
                    setErrorMessage("");
                    setAppliedDateRange({
                      startDate: dateRange.startDate,
                      endDate: dateRange.endDate,
                    });
                  }}
                >
                  기간 적용
                </button>
                <button
                  type="button"
                  className="admin-sales-range-button secondary"
                  onClick={() => {
                    setErrorMessage("");
                    setDateRange({
                      startDate: defaultStartDate,
                      endDate: defaultEndDate,
                    });
                    setAppliedDateRange({ startDate: "", endDate: "" });
                  }}
                >
                  기간 초기화
                </button>
              </div>
              <p className="admin-sales-range-copy">
                기간 초기화 시 현재 집계 단위의 기본 구간({defaultRangeDescription})으로 조회됩니다.
              </p>
            </div>
          </div>
          {errorMessage ? <p className="admin-empty-copy error">{errorMessage}</p> : null}
        </section>

        {loading ? <p className="admin-empty-copy">매출 데이터를 불러오는 중입니다...</p> : null}

        {!loading && !errorMessage ? (
          <>
            <section className="admin-sales-kpi-grid">
              {kpiCards.map((card) => (
                <article key={card.label} className={`dashboard-card admin-sales-kpi-card ${card.tone}`}>
                  <p>{card.label}</p>
                  <strong>{card.value}</strong>
                  <span>{card.hint}</span>
                </article>
              ))}
            </section>

            <section className="admin-sales-primary-grid">
              <section className="dashboard-card admin-sales-chart-panel">
                <div className="admin-members-toolbar">
                  <h2>
                    {periodLabel} 매출 추이
                    {chartSeries.length
                      ? ` (최근 ${chartSeries.length}${PERIOD_UNIT_LABEL[period] || "개"})`
                      : ""}
                  </h2>
                  <div className="admin-sales-chart-legend">
                    <span className="gross">총매출 막대</span>
                    <span className="line">순매출 꺾은선</span>
                  </div>
                </div>

                <div className="admin-sales-chart">
                  {chartSeries.length ? (
                    <div className="admin-sales-chart-plot">
                      <div
                        className="admin-sales-chart-strip"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(1, chartSeries.length)}, minmax(0, 1fr))`,
                        }}
                      >
                        <svg
                          className="admin-sales-line-overlay"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <polyline points={linePoints} />
                        </svg>

                        {chartSeries.map((item) => (
                          <article key={item.key} className="admin-sales-chart-item">
                            <div className="admin-sales-chart-bars single">
                              <div
                                className="admin-sales-chart-bar gross"
                                style={{
                                  height: `${Math.max(
                                    6,
                                    Math.round(
                                      (toAmount(item.grossRevenue || item.totalRevenue) / maxRevenue) * 100
                                    )
                                  )}%`,
                                }}
                                title={`총매출 ${store.formatCurrency(
                                  toAmount(item.grossRevenue || item.totalRevenue)
                                )}`}
                              />
                            </div>
                            <span>{item.label}</span>
                            <small>{toAmount(item.orderCount)}건</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="admin-empty-copy">집계할 매출 데이터가 없습니다.</p>
                  )}
                </div>
              </section>

              <section className="dashboard-card admin-sales-rank-panel">
                <div className="admin-sales-rank-stack">
                  <section className="admin-sales-rank-section">
                    <div className="admin-members-toolbar">
                      <h2>Top 3 강의 매출</h2>
                      <span className="admin-range-caption">순매출 기준</span>
                    </div>

                    {topRevenueVideos.length ? (
                      <div className="admin-sales-rank-list">
                        {topRevenueVideos.map((item, index) => {
                          const netRevenue = toAmount(item.netRevenue || item.revenue);
                          const percentage =
                            topRevenueVideos.length &&
                            toAmount(topRevenueVideos[0]?.netRevenue || topRevenueVideos[0]?.revenue) > 0
                              ? (netRevenue /
                                  toAmount(topRevenueVideos[0]?.netRevenue || topRevenueVideos[0]?.revenue)) *
                                100
                              : 0;

                          return (
                            <article key={`revenue-${item.productId || item.videoId}`} className="admin-sales-rank-item">
                              <div className="admin-sales-rank-head">
                                <strong>
                                  {index + 1}. {item.title || item.productId}
                                </strong>
                                <span>{store.formatCurrency(netRevenue)}</span>
                              </div>
                              <div className="admin-sales-rank-bar-track">
                                <div
                                  className="admin-sales-rank-bar"
                                  style={{ width: `${Math.max(6, Math.round(percentage))}%` }}
                                />
                              </div>
                              <small>
                                주문 {toAmount(item.orderCount)}건 · 판매수량 {toAmount(item.saleCount)}건
                              </small>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="admin-empty-copy">영상 매출 데이터가 없습니다.</p>
                    )}
                  </section>

                  <section className="admin-sales-rank-section">
                    <div className="admin-members-toolbar">
                      <h2>판매건수 Top 3</h2>
                      <span className="admin-range-caption">판매수량 기준</span>
                    </div>
                    {topSaleCountVideos.length ? (
                      <div className="admin-sales-rank-list">
                        {topSaleCountVideos.map((item, index) => {
                          const saleCount = toAmount(item.saleCount);
                          const percentage =
                            topSaleCountVideos.length && toAmount(topSaleCountVideos[0]?.saleCount) > 0
                              ? (saleCount / toAmount(topSaleCountVideos[0]?.saleCount)) * 100
                              : 0;

                          return (
                            <article key={`count-${item.productId || item.videoId}`} className="admin-sales-rank-item">
                              <div className="admin-sales-rank-head">
                                <strong>
                                  {index + 1}. {item.title || item.productId}
                                </strong>
                                <span>{saleCount}건</span>
                              </div>
                              <div className="admin-sales-rank-bar-track">
                                <div
                                  className="admin-sales-rank-bar sale"
                                  style={{ width: `${Math.max(6, Math.round(percentage))}%` }}
                                />
                              </div>
                              <small>순매출 {store.formatCurrency(toAmount(item.netRevenue || item.revenue))}</small>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="admin-empty-copy">판매건수 데이터가 없습니다.</p>
                    )}
                  </section>

                  <section className="admin-sales-rank-section">
                    <div className="admin-members-toolbar">
                      <h2>연령대별 매출 Top 3</h2>
                      <span className="admin-range-caption">순매출 기준</span>
                    </div>
                    {topAgeGroups.length ? (
                      <div className="admin-sales-rank-list">
                        {topAgeGroups.map((item, index) => {
                          const netRevenue = toAmount(item.netRevenue || item.revenue);
                          const ageGroupLabel = normalizeAgeGroupLabel(item?.ageGroup);
                          const percentage =
                            topAgeGroups.length &&
                            toAmount(topAgeGroups[0]?.netRevenue || topAgeGroups[0]?.revenue) > 0
                              ? (netRevenue / toAmount(topAgeGroups[0]?.netRevenue || topAgeGroups[0]?.revenue)) * 100
                              : 0;

                          return (
                            <article key={`age-${ageGroupLabel || index}`} className="admin-sales-rank-item">
                              <div className="admin-sales-rank-head">
                                <strong>
                                  {index + 1}. {ageGroupLabel}
                                </strong>
                                <span>{store.formatCurrency(netRevenue)}</span>
                              </div>
                              <div className="admin-sales-rank-bar-track">
                                <div
                                  className="admin-sales-rank-bar age"
                                  style={{ width: `${Math.max(6, Math.round(percentage))}%` }}
                                />
                              </div>
                              <small>주문 {toAmount(item.orderCount)}건</small>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="admin-empty-copy">연령대 데이터가 없습니다.</p>
                    )}
                  </section>
                </div>
              </section>
            </section>

            <section className="admin-sales-secondary-grid">
              <section className="dashboard-card admin-sales-mix-panel">
                <div className="admin-members-toolbar">
                  <h2>매출 구성 비중</h2>
                  <span className="admin-range-caption">Top 5 순매출 합산</span>
                </div>

                {mixItems.length ? (
                  <div className="admin-sales-mix-list">
                    {mixItems.map((item) => (
                      <article key={item.productId || item.videoId} className="admin-sales-mix-item">
                        <div className="admin-sales-mix-head">
                          <strong>{item.title || item.productId}</strong>
                          <span>{toPercent(item.share)}%</span>
                        </div>
                        <div className="admin-sales-mix-track">
                          <div
                            className="admin-sales-mix-bar"
                            style={{ width: `${Math.max(2, Math.round(item.share))}%` }}
                          />
                        </div>
                        <small>{store.formatCurrency(toAmount(item.netRevenue || item.revenue))}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty-copy">매출 구성 데이터가 없습니다.</p>
                )}
              </section>

              <section className="dashboard-card admin-sales-video-panel">
                <div className="admin-members-toolbar">
                  <h2>영상별 상세 매출</h2>
                  <div className="admin-sales-video-toolbar-right">
                    <input
                      type="search"
                      value={videoSearchKeyword}
                      onChange={(event) => setVideoSearchKeyword(event.target.value)}
                      placeholder="강의명 / 강사 / ID 검색"
                      aria-label="영상별 상세 매출 검색"
                    />
                    <span className="admin-range-caption">
                      {periodLabel} 기준 · {filteredVideoSales.length}/{videoSales.length}개
                    </span>
                  </div>
                </div>

                {videoSales.length ? (
                  filteredVideoSales.length ? (
                    <div className="admin-sales-video-table-wrap">
                      <table className="admin-sales-video-table">
                        <thead>
                          <tr>
                            <th>강의명</th>
                            <th>강사</th>
                            <th>판매수량</th>
                            <th>주문건수</th>
                            <th>총매출</th>
                            <th>순매출</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVideoSales.map((item) => (
                            <tr key={item.productId || item.videoId}>
                              <td>{item.title || item.productId}</td>
                              <td>{item.instructor || "-"}</td>
                              <td>{toAmount(item.saleCount)}건</td>
                              <td>{toAmount(item.orderCount)}건</td>
                              <td>{store.formatCurrency(toAmount(item.grossRevenue))}</td>
                              <td>{store.formatCurrency(toAmount(item.netRevenue || item.revenue))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="admin-empty-copy">검색 조건에 맞는 영상 매출이 없습니다.</p>
                  )
                ) : (
                  <p className="admin-empty-copy">선택한 기간에 영상 매출 데이터가 없습니다.</p>
                )}
              </section>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
