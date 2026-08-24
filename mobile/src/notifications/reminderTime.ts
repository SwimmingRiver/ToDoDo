export const getReminderTrigger = (dueAt: string | null, now: Date): Date | null => {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (due.getTime() <= now.getTime()) return null;
  return due;
};
