import { addDaysToKey, addMonthsToMonthKey, diffDaysBetweenKeys, toDateKey, toDateKeyFromISO, toMonthKey, } from "./date";
import { isKeyInRange } from "./filter";
export const resolveTrendGranularity = (period) => {
    if (period === "last90Days")
        return "week";
    if (period === "all")
        return "month";
    return "day";
};
const shortDayLabel = (key) => {
    const [, month, day] = key.split("-");
    return `${Number(month)}/${Number(day)}`;
};
const monthLabel = (monthKey) => {
    const [year, month] = monthKey.split("-");
    return `${year}.${Number(month)}`;
};
const doneDateKeys = (todos) => todos
    .filter((todo) => todo.status === "done" && !!todo.doneAt)
    .map((todo) => toDateKeyFromISO(todo.doneAt));
/**
 * 완료 추이 버킷. 완료 날짜(doneAt)를 기준으로 센다.
 * - day: 범위의 날마다 1개.
 * - week: 범위 시작일부터 7일 단위(일요일 정렬 X — 정렬하면 90일이 13개/14개로
 *   흔들려서 시작일 기준으로 고정). 마지막 버킷은 범위 끝에서 잘린다.
 * - month: 범위가 없으면(all) 첫 완료월 ~ now의 달. 완료 0건이면 빈 배열.
 * 빈 버킷은 0으로 채운다.
 */
export const bucketCompletions = (todos, range, granularity, now = new Date()) => {
    const keys = doneDateKeys(todos);
    const todayKey = toDateKey(now);
    if (granularity === "month") {
        const startMonth = range ? toMonthKey(range.startKey) : keys.length === 0 ? null : toMonthKey([...keys].sort()[0]);
        if (startMonth === null)
            return [];
        const endMonth = toMonthKey(range?.endKey ?? todayKey);
        const countByMonth = new Map();
        keys.forEach((key) => {
            const m = toMonthKey(key);
            countByMonth.set(m, (countByMonth.get(m) ?? 0) + 1);
        });
        const buckets = [];
        for (let m = startMonth; m <= endMonth; m = addMonthsToMonthKey(m, 1)) {
            buckets.push({ key: m, label: monthLabel(m), count: countByMonth.get(m) ?? 0 });
        }
        return buckets;
    }
    const effective = range ?? (keys.length === 0 ? null : { startKey: [...keys].sort()[0], endKey: todayKey });
    if (effective === null)
        return [];
    const inRange = keys.filter((key) => isKeyInRange(key, effective));
    const totalDays = diffDaysBetweenKeys(effective.startKey, effective.endKey) + 1;
    const bucketSize = granularity === "week" ? 7 : 1;
    const bucketCount = Math.ceil(totalDays / bucketSize);
    const counts = new Array(bucketCount).fill(0);
    inRange.forEach((key) => {
        const index = Math.floor(diffDaysBetweenKeys(effective.startKey, key) / bucketSize);
        counts[index] += 1;
    });
    return counts.map((count, i) => {
        const key = addDaysToKey(effective.startKey, i * bucketSize);
        return { key, label: shortDayLabel(key), count };
    });
};
