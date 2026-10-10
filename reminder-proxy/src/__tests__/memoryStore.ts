import type { HistoryItem, MetaKey, ReminderStore } from "../store";
import type { ScheduleEntry } from "../schedule";

export class MemoryReminderStore implements ReminderStore {
  tokens = new Map<string, { platform: string; updatedAt: number }>();
  schedule = new Map<string, ScheduleEntry>();
  sent = new Map<string, number>(); // `${todoId}:${fireAt}` → dueAtMs
  meta = new Map<MetaKey, string>();
  history = new Map<string, HistoryItem>(); // `${todoId}:${fireAt}`

  listTokens() {
    return [...this.tokens.keys()];
  }
  upsertToken(token: string, platform: string, now: number) {
    this.tokens.set(token, { platform, updatedAt: now });
  }
  deleteToken(token: string) {
    this.tokens.delete(token);
  }
  replaceSchedule(entries: ScheduleEntry[]) {
    this.schedule = new Map(entries.map((e) => [e.todoId, e]));
  }
  dueEntries(now: number) {
    return [...this.schedule.values()].filter((e) => e.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt);
  }
  deleteEntry(todoId: string) {
    this.schedule.delete(todoId);
  }
  nextFireAt() {
    const times = [...this.schedule.values()].map((e) => e.fireAt);
    return times.length ? Math.min(...times) : null;
  }
  isSent(todoId: string, fireAt: number) {
    return this.sent.has(`${todoId}:${fireAt}`);
  }
  markSent(todoId: string, fireAt: number, dueAtMs: number) {
    this.sent.set(`${todoId}:${fireAt}`, dueAtMs);
  }
  pruneSent(beforeDueAtMs: number) {
    for (const [k, due] of this.sent) if (due < beforeDueAtMs) this.sent.delete(k);
  }
  addHistory(item: HistoryItem, fireAt: number) {
    const key = `${item.todoId}:${fireAt}`;
    if (!this.history.has(key)) this.history.set(key, item);
  }
  listHistory(sinceSentAt: number, limit: number) {
    return [...this.history.values()]
      .filter((h) => h.sentAt >= sinceSentAt)
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, limit);
  }
  pruneHistory(beforeSentAt: number, keep: number) {
    const kept = this.listHistory(beforeSentAt, keep);
    this.history = new Map(
      [...this.history].filter(([, h]) => kept.includes(h)),
    );
  }
  getMeta(key: MetaKey) {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: MetaKey, value: string) {
    this.meta.set(key, value);
  }
  clearAll() {
    this.tokens.clear();
    this.schedule.clear();
    this.sent.clear();
    this.meta.clear();
    this.history.clear();
  }
}
