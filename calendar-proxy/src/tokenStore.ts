export interface CalendarTokenRecord {
  refreshToken: string;
}

const tokenKey = (uid: string): string => `token:${uid}`;

export const getTokenRecord = async (
  kv: KVNamespace,
  uid: string,
): Promise<CalendarTokenRecord | null> => {
  const raw = await kv.get(tokenKey(uid));
  return raw ? (JSON.parse(raw) as CalendarTokenRecord) : null;
};

export const setTokenRecord = async (
  kv: KVNamespace,
  uid: string,
  record: CalendarTokenRecord,
): Promise<void> => {
  await kv.put(tokenKey(uid), JSON.stringify(record));
};

export const deleteTokenRecord = async (kv: KVNamespace, uid: string): Promise<void> => {
  await kv.delete(tokenKey(uid));
};
