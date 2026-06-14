import { useMemo, type RefObject } from "react";

import type { EChartsOption } from "echarts";

import { EChartPanel, type EChartPanelHandle } from "../../components/EChartPanel";
import {
  DashboardExportActionGroup,
  type DashboardExportFormat
} from "./DashboardControlPanel";

type DashboardBusinessCategory = "substitute" | "overtime" | "legalHoliday";

interface DashboardMetricCardData {
  label: string;
  value: string;
  changeText: string;
  changeTone: "" | "is-up" | "is-down";
  tone: "time" | "money";
}

interface DashboardMonthlyTrendItem {
  label: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
}

interface DashboardSiteAllowanceItem {
  siteName: string;
  overtimeAmount: number;
  substituteAmount: number;
  legalHolidayAmount: number;
  totalAmount: number;
}

interface DashboardRatioItem {
  category: DashboardBusinessCategory;
  label: string;
  amount: number;
}

const categoryAllowanceLabels: Record<DashboardBusinessCategory, string> = {
  substitute: "대체수당",
  overtime: "연장수당",
  legalHoliday: "법정공휴일수당"
};

const categoryColors: Record<DashboardBusinessCategory, string> = {
  overtime: "#2f79c4",
  substitute: "#3da765",
  legalHoliday: "#e39a2d"
};

const currencyFormatter = new Intl.NumberFormat("ko-KR");
const chartFontFamily = "\"Pretendard Variable\", \"Pretendard\", \"Noto Sans KR\", sans-serif";
const formatCurrency = (amount: number) => `${currencyFormatter.format(Math.round(amount))}원`;
const formatNumberValue = (amount: number) => currencyFormatter.format(Math.round(amount));
const formatPercentText = (ratio: number) => `${Number((ratio * 100).toFixed(1))}%`;
const formatManUnitAxisValue = (amount: number) =>
  `${currencyFormatter.format(Math.round(amount / 10_000))}만`;

export const DashboardMetricCard = ({ metric }: { metric: DashboardMetricCardData }) => (
  <article
    className={
      metric.tone === "time"
        ? "dashboard-v2-metric-card dashboard-v2-metric-card--time"
        : "dashboard-v2-metric-card dashboard-v2-metric-card--money"
    }
  >
    <div className="dashboard-v2-metric-band">{metric.label}</div>
    <div className="dashboard-v2-metric-body">
      <strong>{metric.value}</strong>
      <span
        className={
          metric.changeTone
            ? `dashboard-v2-metric-change ${metric.changeTone}`
            : "dashboard-v2-metric-change"
        }
      >
        {metric.changeText}
      </span>
    </div>
  </article>
);

export const DashboardTrendChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  title,
  onExport
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardMonthlyTrendItem[];
  title: string;
  onExport: (format: DashboardExportFormat) => void;
}) => {
  const option = useMemo<EChartsOption>(() => {
    const labels = items.map((item) => item.label);
    const seriesDefinition = [
      {
        color: categoryColors.overtime,
        lineType: "solid" as const,
        name: categoryAllowanceLabels.overtime,
        values: items.map((item) => item.overtimeAmount)
      },
      {
        color: categoryColors.substitute,
        lineType: "dashed" as const,
        name: categoryAllowanceLabels.substitute,
        values: items.map((item) => item.substituteAmount)
      },
      {
        color: categoryColors.legalHoliday,
        lineType: "dotted" as const,
        name: categoryAllowanceLabels.legalHoliday,
        values: items.map((item) => item.legalHolidayAmount)
      }
    ];

    return {
      animationDuration: 420,
      color: seriesDefinition.map((series) => series.color),
      grid: {
        top: 54,
        right: 6,
        bottom: 12,
        left: 6,
        containLabel: true
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        icon: "roundRect",
        textStyle: {
          color: "#526175",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700
        }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 28, 69, 0.96)",
        borderWidth: 0,
        padding: [10, 12],
        textStyle: {
          color: "#ffffff",
          fontFamily: chartFontFamily,
          fontSize: 12
        },
        axisPointer: {
          type: "line",
          lineStyle: {
            color: "rgba(62, 86, 182, 0.22)",
            width: 1
          }
        },
        formatter: (params) => {
          const itemsBySeries = Array.isArray(params) ? params : [params];
          const axisEntry = itemsBySeries[0] as
            | { axisValue?: string | number; name?: string }
            | undefined;
          const header = String(axisEntry?.axisValue ?? axisEntry?.name ?? "");
          const rows = itemsBySeries
            .map((entry) => {
              const value =
                typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);

              return [
                "<div style=\"display:flex;justify-content:space-between;gap:16px;min-width:184px;\">",
                `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:999px;background:${entry.color};display:inline-block;"></span>${entry.seriesName}</span>`,
                `<strong>${formatCurrency(value)}</strong>`,
                "</div>"
              ].join("");
            })
            .join("");

          return `<div style="display:grid;gap:6px;"><strong>${header}</strong>${rows}</div>`;
        }
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: {
          lineStyle: {
            color: "#d6dde9"
          }
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: "#586578",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700,
          margin: 12
        }
      },
      yAxis: {
        type: "value",
        min: 0,
        splitNumber: 4,
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisLabel: {
          color: "#5b687b",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700,
          formatter: (value: number) => formatManUnitAxisValue(value)
        },
        splitLine: {
          lineStyle: {
            color: "#e3e9f2"
          }
        }
      },
      series: seriesDefinition.map((series) => ({
        type: "line",
        name: series.name,
        data: series.values,
        smooth: 0.28,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: true,
        lineStyle: {
          color: series.color,
          type: series.lineType,
          width: 2.2
        },
        itemStyle: {
          color: series.color,
          borderColor: "#ffffff",
          borderWidth: 2
        },
        emphasis: {
          focus: "series",
          lineStyle: {
            width: 3
          }
        }
      }))
    };
  }, [items]);

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>{title}</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 만원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel={title}
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--trend"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};

export const DashboardSiteChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  onExport
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardSiteAllowanceItem[];
  onExport: (format: DashboardExportFormat) => void;
}) => {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 420,
      color: [categoryColors.overtime, categoryColors.substitute, categoryColors.legalHoliday],
      grid: {
        top: 54,
        left: 0,
        right: 76,
        bottom: 4,
        containLabel: true
      },
      legend: {
        top: 0,
        left: 0,
        data: [
          categoryAllowanceLabels.overtime,
          categoryAllowanceLabels.substitute,
          categoryAllowanceLabels.legalHoliday
        ],
        itemWidth: 10,
        itemHeight: 10,
        icon: "roundRect",
        textStyle: {
          color: "#526175",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700
        }
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: {
            color: "rgba(62, 86, 182, 0.08)"
          }
        },
        backgroundColor: "rgba(15, 28, 69, 0.96)",
        borderWidth: 0,
        padding: [10, 12],
        textStyle: {
          color: "#ffffff",
          fontFamily: chartFontFamily,
          fontSize: 12
        },
        formatter: (params) => {
          const itemsBySeries = Array.isArray(params) ? params : [params];
          const dataIndex = itemsBySeries[0]?.dataIndex ?? 0;
          const record = items[dataIndex];
          const rows = itemsBySeries
            .map((entry) => {
              const value =
                typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
              const totalAmount = record?.totalAmount ?? 0;
              const ratioText =
                totalAmount > 0 && value > 0 ? formatPercentText(value / totalAmount) : "0%";

              return [
                "<div style=\"display:flex;justify-content:space-between;gap:16px;min-width:188px;\">",
                `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:999px;background:${entry.color};display:inline-block;"></span>${entry.seriesName}</span>`,
                `<strong>${formatCurrency(value)} · ${ratioText}</strong>`,
                "</div>"
              ].join("");
            })
            .join("");

          return [
            "<div style=\"display:grid;gap:6px;\">",
            `<strong>${record?.siteName ?? ""}</strong>`,
            rows,
            `<div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid rgba(255,255,255,0.12);padding-top:6px;"><span>합계</span><strong>${formatCurrency(record?.totalAmount ?? 0)}</strong></div>`,
            "</div>"
          ].join("");
        }
      },
      xAxis: {
        type: "value",
        axisLabel: {
          show: false
        },
        axisTick: {
          show: false
        },
        axisLine: {
          show: false
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: "category",
        data: items.map((item) => item.siteName),
        axisTick: {
          show: false
        },
        axisLine: {
          show: false
        },
        axisLabel: {
          color: "#1f3047",
          fontFamily: chartFontFamily,
          fontSize: 13,
          fontWeight: 700
        }
      },
      series: [
        {
          name: categoryAllowanceLabels.overtime,
          type: "bar",
          stack: "total",
          barWidth: 16,
          data: items.map((item) => item.overtimeAmount),
          itemStyle: {
            borderRadius: [6, 0, 0, 6]
          },
          label: {
            show: true,
            position: "inside",
            color: "rgba(255,255,255,0.92)",
            fontFamily: chartFontFamily,
            fontSize: 11,
            fontWeight: 800,
            formatter: (params) => {
              const record = items[params.dataIndex];
              const totalAmount = record?.totalAmount ?? 0;
              const value =
                typeof params.value === "number" ? params.value : Number(params.value ?? 0);

              if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
                return "";
              }

              return formatPercentText(value / totalAmount);
            }
          }
        },
        {
          name: categoryAllowanceLabels.substitute,
          type: "bar",
          stack: "total",
          barWidth: 16,
          data: items.map((item) => item.substituteAmount),
          label: {
            show: true,
            position: "inside",
            color: "rgba(255,255,255,0.92)",
            fontFamily: chartFontFamily,
            fontSize: 11,
            fontWeight: 800,
            formatter: (params) => {
              const record = items[params.dataIndex];
              const totalAmount = record?.totalAmount ?? 0;
              const value =
                typeof params.value === "number" ? params.value : Number(params.value ?? 0);

              if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
                return "";
              }

              return formatPercentText(value / totalAmount);
            }
          }
        },
        {
          name: categoryAllowanceLabels.legalHoliday,
          type: "bar",
          stack: "total",
          barWidth: 16,
          data: items.map((item) => item.legalHolidayAmount),
          itemStyle: {
            borderRadius: [0, 6, 6, 0]
          },
          label: {
            show: true,
            position: "inside",
            color: "rgba(255,255,255,0.92)",
            fontFamily: chartFontFamily,
            fontSize: 11,
            fontWeight: 800,
            formatter: (params) => {
              const record = items[params.dataIndex];
              const totalAmount = record?.totalAmount ?? 0;
              const value =
                typeof params.value === "number" ? params.value : Number(params.value ?? 0);

              if (totalAmount <= 0 || value <= 0 || value / totalAmount < 0.18) {
                return "";
              }

              return formatPercentText(value / totalAmount);
            }
          }
        },
        {
          name: "__total_label__",
          type: "bar",
          silent: true,
          barGap: "-100%",
          barWidth: 16,
          z: 5,
          tooltip: {
            show: false
          },
          itemStyle: {
            color: "rgba(0,0,0,0)"
          },
          data: items.map((item) => item.totalAmount),
          label: {
            show: true,
            position: "right",
            distance: 12,
            color: "#5b697d",
            fontFamily: chartFontFamily,
            fontSize: 12,
            fontWeight: 800,
            formatter: (params) => formatNumberValue(items[params.dataIndex]?.totalAmount ?? 0)
          }
        }
      ]
    }),
    [items]
  );

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>근무지별 수당 현황</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: 원</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="근무지별 수당 현황"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--site"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};

export const DashboardRatioChart = ({
  chartRef,
  exportingFormat,
  isExportDisabled,
  items,
  onExport,
  totalAmount
}: {
  chartRef: RefObject<EChartPanelHandle | null>;
  exportingFormat: DashboardExportFormat | null;
  isExportDisabled?: boolean;
  items: DashboardRatioItem[];
  onExport: (format: DashboardExportFormat) => void;
  totalAmount: number;
}) => {
  const option = useMemo<EChartsOption>(
    () => ({
      animationDuration: 420,
      color: items.map((item) => categoryColors[item.category]),
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 28, 69, 0.96)",
        borderWidth: 0,
        padding: [10, 12],
        textStyle: {
          color: "#ffffff",
          fontFamily: chartFontFamily,
          fontSize: 12
        },
        formatter: (params) => {
          const entry = Array.isArray(params) ? params[0] : params;
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          const percent = typeof entry.percent === "number" ? entry.percent : 0;

          return `<div style="display:grid;gap:4px;"><strong>${entry.name}</strong><span>${formatCurrency(value)} (${Number(percent.toFixed(1))}%)</span></div>`;
        }
      },
      legend: {
        bottom: 0,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        icon: "roundRect",
        textStyle: {
          color: "#405064",
          fontFamily: chartFontFamily,
          fontSize: 12,
          fontWeight: 700
        }
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "35%",
          style: {
            text: formatCurrency(totalAmount),
            fill: "#142235",
            font: `800 17px ${chartFontFamily}`,
            textAlign: "center"
          }
        },
        {
          type: "text",
          left: "center",
          top: "48.5%",
          style: {
            text: "총 지급수당",
            fill: "#69778a",
            font: `700 10px ${chartFontFamily}`,
            textAlign: "center"
          }
        }
      ],
      series: [
        {
          type: "pie",
          radius: ["46%", "75%"],
          center: ["50%", "42%"],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: "inside",
            color: "#ffffff",
            fontFamily: chartFontFamily,
            fontSize: 12,
            fontWeight: 800,
            formatter: (params) => {
              const percent = typeof params.percent === "number" ? params.percent : 0;

              return percent >= 8 ? `${Number(percent.toFixed(1))}%` : "";
            }
          },
          labelLine: {
            show: false
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 18,
              shadowColor: "rgba(24, 41, 62, 0.18)"
            }
          },
          data: items.map((item) => ({
            name: item.label,
            value: item.amount
          }))
        }
      ]
    }),
    [items, totalAmount]
  );

  return (
    <>
      <div className="dashboard-v2-card-header">
        <h3>전사 수당 유형 비율</h3>
        <div className="dashboard-v2-card-actions">
          <span className="dashboard-v2-unit-note">단위: %</span>
          <DashboardExportActionGroup
            disabled={isExportDisabled}
            exportTargetLabel="전사 수당 유형 비율"
            exportingFormat={exportingFormat}
            onExport={onExport}
          />
        </div>
      </div>
      <div className="dashboard-v2-chart-stage">
        <EChartPanel
          className="dashboard-echart-panel dashboard-echart-panel--ratio"
          option={option}
          ref={chartRef}
        />
      </div>
    </>
  );
};
