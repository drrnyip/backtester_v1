import fs from "fs";
import path from "path";
import { SESSIONS_INDEX } from "./paths";
import type { SessionInfo, SessionsIndex } from "./types";

export function loadSessionsIndex(): SessionsIndex {
  if (!fs.existsSync(SESSIONS_INDEX)) {
    return { updatedAt: new Date(0).toISOString(), sessions: [] };
  }
  const raw = fs.readFileSync(SESSIONS_INDEX, "utf8");
  return JSON.parse(raw) as SessionsIndex;
}

export function saveSessionsIndex(index: SessionsIndex): void {
  fs.mkdirSync(path.dirname(SESSIONS_INDEX), { recursive: true });
  index.updatedAt = new Date().toISOString();
  index.sessions.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2) + "\n");
}

export function upsertSession(info: SessionInfo): SessionsIndex {
  const index = loadSessionsIndex();
  const i = index.sessions.findIndex((s) => s.date === info.date);
  if (i >= 0) index.sessions[i] = info;
  else index.sessions.push(info);
  saveSessionsIndex(index);
  return index;
}

export function getSession(date: string): SessionInfo | undefined {
  return loadSessionsIndex().sessions.find((s) => s.date === date);
}

export function listSessions(): SessionInfo[] {
  return loadSessionsIndex().sessions;
}
