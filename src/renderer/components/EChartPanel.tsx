import { useEffect, useRef, type CSSProperties } from "react";

import * as echarts from "echarts";
import type { EChartsOption, EChartsType, SetOptionOpts } from "echarts";

interface EChartPanelProps {
  className?: string;
  option: EChartsOption;
  setOptionConfig?: SetOptionOpts;
  style?: CSSProperties;
}

export const EChartPanel = ({
  className,
  option,
  setOptionConfig,
  style
}: EChartPanelProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

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
};
