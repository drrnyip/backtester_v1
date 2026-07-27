"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SpreadPoint } from "@/lib/data/types";

export default function SpreadChart({ spreads }: { spreads: SpreadPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart: IChartApi = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a94a7",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "#1b2233" },
        horzLines: { color: "#1b2233" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#232c40" },
      timeScale: { borderColor: "#232c40", timeVisible: true, secondsVisible: true },
      autoSize: true,
    });

    const mid = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      title: "Mid",
    });
    const spread = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceScaleId: "spread",
      title: "Spread",
    });
    chart.priceScale("spread").applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    const seen = new Set<number>();
    const midData: { time: UTCTimestamp; value: number }[] = [];
    const spreadData: { time: UTCTimestamp; value: number }[] = [];
    for (const p of spreads) {
      if (seen.has(p.time)) continue;
      seen.add(p.time);
      midData.push({ time: p.time as UTCTimestamp, value: p.mid });
      spreadData.push({ time: p.time as UTCTimestamp, value: p.spread });
    }
    mid.setData(midData);
    spread.setData(spreadData);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [spreads]);

  return <div ref={containerRef} className="h-[220px] w-full" />;
}
