"use client";

import { useState } from "react";
import Explorer from "./Explorer";
import StrategyLab from "./StrategyLab";

type Tab = "explore" | "backtest";

export default function ResearchApp() {
  const [tab, setTab] = useState<Tab>("explore");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        <TabButton active={tab === "explore"} onClick={() => setTab("explore")}>
          Explore
        </TabButton>
        <TabButton active={tab === "backtest"} onClick={() => setTab("backtest")}>
          Backtest
        </TabButton>
      </div>
      {tab === "explore" ? <Explorer /> : <StrategyLab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-accent text-white"
          : "text-muted hover:text-foreground hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
