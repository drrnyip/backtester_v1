"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { EquityPoint } from "@/lib/types";

export default function EquityChart({ equityCurve }: { equityCurve: EquityPoint[] }) {
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
      timeScale: { borderColor: "#232c40", timeVisible: true, secondsVisible: false },
      autoSize: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#6366f1",
      topColor: "rgba(99,102,241,0.35)",
      bottomColor: "rgba(99,102,241,0.02)",
      lineWidth: 2,
    });

    const seen = new Set<number>();
    const data = equityCurve
      .filter((p) => {
        if (seen.has(p.time)) return false;
        seen.add(p.time);
        return true;
      })
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.equity }));
    series.setData(data);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [equityCurve]);

  return <div ref={containerRef} className="h-[260px] w-full" />;
}
