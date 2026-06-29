"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  return (
    <button
      onClick={logout}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
    >
      Sign out
    </button>
  );
}
