"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import type { Bar, Trade } from "@/lib/types";

export default function PriceChart({ bars, trades }: { bars: Bar[]; trades: Trade[] }) {
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784",
      downColor: "#ea3943",
      borderVisible: false,
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });

    // Dedupe by timestamp (ascending) for the charting library.
    const seen = new Set<number>();
    const candles = bars
      .filter((b) => {
        if (seen.has(b.time)) return false;
        seen.add(b.time);
        return true;
      })
      .map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
    series.setData(candles);

    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      const long = t.side === "long";
      markers.push({
        time: t.entryTime as UTCTimestamp,
        position: long ? "belowBar" : "aboveBar",
        color: long ? "#16c784" : "#ea3943",
        shape: long ? "arrowUp" : "arrowDown",
        text: long ? "Buy" : "Sell",
      });
      markers.push({
        time: t.exitTime as UTCTimestamp,
        position: long ? "aboveBar" : "belowBar",
        color: "#8a94a7",
        shape: long ? "arrowDown" : "arrowUp",
        text: "Exit",
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(series, markers);

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [bars, trades]);

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
