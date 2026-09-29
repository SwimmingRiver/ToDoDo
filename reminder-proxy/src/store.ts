import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";
import type { ScheduleEntry } from "./schedule";

export type MetaKey = "uid" | "refreshPending" | "windowEnd";

/** DO SQLite가 동기 API라 저장소도 동기다. 테스트는 memoryStore로 같은 계약을 쓴다. */
export interface ReminderStore {
  listTokens(): string[];
  upsertToken(token: string, platform: string, now: number): void;
  deleteToken(token: string): void;
  replaceSchedule(entries: ScheduleEntry[]): void;
  dueEntries(now: number): ScheduleEntry[];
  deleteEntry(todoId: string): void;
  nextFireAt(): number | null;
  isSent(todoId: string, fireAt: number): boolean;
  markSent(todoId: string, fireAt: number, dueAtMs: number): void;
  pruneSent(beforeDueAtMs: number): void;
  getMeta(key: MetaKey): string | null;
  setMeta(key: MetaKey, value: string): void;
}

type ScheduleRow = { todoId: string; fireAt: number; dueAt: string; offsetMinutes: number };

export class SqliteReminderStore implements ReminderStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, platform TEXT NOT NULL, updatedAt INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS schedule (todoId TEXT PRIMARY KEY, fireAt INTEGER NOT NULL, dueAt TEXT NOT NULL, offsetMinutes INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS sent (todoId TEXT NOT NULL, fireAt INTEGER NOT NULL, dueAtMs INTEGER NOT NULL, PRIMARY KEY (todoId, fireAt))",
    );
    sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  listTokens(): string[] {
    return this.sql.exec<{ token: string }>("SELECT token FROM tokens").toArray().map((r) => r.token);
  }

  upsertToken(token: string, platform: string, now: number): void {
    this.sql.exec(
      "INSERT INTO tokens (token, platform, updatedAt) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, updatedAt = excluded.updatedAt",
      token,
      platform,
      now,
    );
  }

  deleteToken(token: string): void {
    this.sql.exec("DELETE FROM tokens WHERE token = ?", token);
  }

  replaceSchedule(entries: ScheduleEntry[]): void {
    this.sql.exec("DELETE FROM schedule");
    for (const e of entries) {
      this.sql.exec(
        "INSERT INTO schedule (todoId, fireAt, dueAt, offsetMinutes) VALUES (?, ?, ?, ?)",
        e.todoId,
        e.fireAt,
        e.dueAt,
        e.offsetMinutes,
      );
    }
  }

  dueEntries(now: number): ScheduleEntry[] {
    return this.sql
      .exec<ScheduleRow>(
        "SELECT todoId, fireAt, dueAt, offsetMinutes FROM schedule WHERE fireAt <= ? ORDER BY fireAt",
        now,
      )
      .toArray()
      .map((r) => ({ ...r, offsetMinutes: r.offsetMinutes as ReminderOffsetMinutes }));
  }

  deleteEntry(todoId: string): void {
    this.sql.exec("DELETE FROM schedule WHERE todoId = ?", todoId);
  }

  nextFireAt(): number | null {
    const row = this.sql.exec<{ next: number | null }>("SELECT MIN(fireAt) AS next FROM schedule").one();
    return row.next ?? null;
  }

  isSent(todoId: string, fireAt: number): boolean {
    return (
      this.sql.exec("SELECT 1 AS hit FROM sent WHERE todoId = ? AND fireAt = ?", todoId, fireAt).toArray().length > 0
    );
  }

  markSent(todoId: string, fireAt: number, dueAtMs: number): void {
    this.sql.exec("INSERT OR IGNORE INTO sent (todoId, fireAt, dueAtMs) VALUES (?, ?, ?)", todoId, fireAt, dueAtMs);
  }

  pruneSent(beforeDueAtMs: number): void {
    this.sql.exec("DELETE FROM sent WHERE dueAtMs < ?", beforeDueAtMs);
  }

  getMeta(key: MetaKey): string | null {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray();
    return rows[0]?.value ?? null;
  }

  setMeta(key: MetaKey, value: string): void {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
}
