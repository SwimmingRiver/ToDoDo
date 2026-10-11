import type { ReminderOffsetMinutes } from "@tododo/core/dist/reminders/index.js";
import type { ScheduleEntry } from "./schedule";

export type MetaKey = "uid" | "refreshPending" | "windowEnd" | "lastSeenAt";

/** 벨 메뉴에 보여줄 발송 기록. 제목은 발송 시점 스냅샷이다(할 일이 지워지거나 바뀌어도 받은 그대로). */
export interface HistoryItem {
  todoId: string;
  title: string;
  offsetMinutes: ReminderOffsetMinutes;
  dueAt: string;
  sentAt: number;
}

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
  /** (todoId, fireAt)이 같으면 무시한다 — 같은 예약이 두 번 기록되지 않게. */
  addHistory(item: HistoryItem, fireAt: number): void;
  /** sentAt >= sinceSentAt인 기록을 최신순으로 최대 limit개. */
  listHistory(sinceSentAt: number, limit: number): HistoryItem[];
  /** sentAt < beforeSentAt을 지우고, 남은 것 중 최신 keep개만 남긴다. */
  pruneHistory(beforeSentAt: number, keep: number): void;
  getMeta(key: MetaKey): string | null;
  setMeta(key: MetaKey, value: string): void;
  /** 탈퇴: 모든 행을 지운다. 테이블은 남겨 같은 DO 인스턴스가 이후 요청을 받아도 SQL 오류가 나지 않게 한다. */
  clearAll(): void;
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
    // sent(중복 방지, 마감 하루 뒤 삭제)와 수명·필드가 달라 분리한다. 키를 같게 두어 중복 기록을 막는다.
    sql.exec(
      "CREATE TABLE IF NOT EXISTS history (todoId TEXT NOT NULL, fireAt INTEGER NOT NULL, title TEXT NOT NULL, offsetMinutes INTEGER NOT NULL, dueAt TEXT NOT NULL, sentAt INTEGER NOT NULL, PRIMARY KEY (todoId, fireAt))",
    );
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

  addHistory(item: HistoryItem, fireAt: number): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO history (todoId, fireAt, title, offsetMinutes, dueAt, sentAt) VALUES (?, ?, ?, ?, ?, ?)",
      item.todoId,
      fireAt,
      item.title,
      item.offsetMinutes,
      item.dueAt,
      item.sentAt,
    );
  }

  listHistory(sinceSentAt: number, limit: number): HistoryItem[] {
    return this.sql
      .exec<{ todoId: string; title: string; offsetMinutes: number; dueAt: string; sentAt: number }>(
        "SELECT todoId, title, offsetMinutes, dueAt, sentAt FROM history WHERE sentAt >= ? ORDER BY sentAt DESC LIMIT ?",
        sinceSentAt,
        limit,
      )
      .toArray()
      .map((r) => ({ ...r, offsetMinutes: r.offsetMinutes as ReminderOffsetMinutes }));
  }

  pruneHistory(beforeSentAt: number, keep: number): void {
    this.sql.exec("DELETE FROM history WHERE sentAt < ?", beforeSentAt);
    this.sql.exec(
      "DELETE FROM history WHERE rowid NOT IN (SELECT rowid FROM history ORDER BY sentAt DESC LIMIT ?)",
      keep,
    );
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

  clearAll(): void {
    for (const table of ["tokens", "schedule", "sent", "meta", "history"]) this.sql.exec(`DELETE FROM ${table}`);
  }
}
