// 제공자가 2개 이상 연결됐을 때만 안내 키를 만든다(중복 제거·정렬해 순서 무관).
export function linkedNoticeKey(providerIds: readonly string[]): string | null {
  const unique = [...new Set(providerIds)].sort();
  return unique.length >= 2 ? unique.join(",") : null;
}

// 안내를 이미 보여줬는지 기록하는 저장 키
export function linkedNoticeStorageKey(uid: string): string {
  return `tododo:linkedNotice:${uid}`;
}
