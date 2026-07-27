import ResearchApp from "@/components/ResearchApp";
import LogoutButton from "@/components/LogoutButton";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <span className="text-lg font-bold">ES</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ES Research</h1>
            <p className="text-xs text-muted">
              Trade & quote research for E-mini S&P 500
            </p>
          </div>
        </div>
        <LogoutButton />
      </header>
      <ResearchApp />
    </main>
  );
}
