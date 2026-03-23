import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties
} from "react";

import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType, SetOptionOpts } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

interface EChartPanelProps {
  className?: string;
  option: EChartsCoreOption;
  setOptionConfig?: SetOptionOpts;
  style?: CSSProperties;
}

export interface EChartPanelHandle {
  getImageDataUrl: (input?: {
    pixelRatio?: number;
    backgroundColor?: string;
    type?: "png" | "jpeg";
  }) => string | null;
}

export const EChartPanel = forwardRef<EChartPanelHandle, EChartPanelProps>(({
  className,
  option,
  setOptionConfig,
  style
}, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      getImageDataUrl: (input) =>
        chartRef.current?.getDataURL({
          type: input?.type ?? "png",
          pixelRatio: input?.pixelRatio ?? 2,
          backgroundColor: input?.backgroundColor ?? "#ffffff"
        }) ?? null
    }),
    []
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart =
      chartRef.current ?? echarts.getInstanceByDom(container) ?? echarts.init(container);
    chartRef.current = chart;
    chart.setOption(option, {
      notMerge: true,
      lazyUpdate: true,
      ...setOptionConfig
    });

    const handleResize = () => {
      chart.resize();
    };

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            handleResize();
          })
        : null;

    resizeObserver?.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [option, setOptionConfig]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    []
  );

  return <div className={className} ref={containerRef} style={style} />;
});

EChartPanel.displayName = "EChartPanel";
