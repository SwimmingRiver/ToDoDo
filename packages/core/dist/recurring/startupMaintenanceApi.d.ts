import { type Firestore } from "firebase/firestore";
export type SweepName = "archived" | "overdue" | "extension";
export type StartupMaintenanceResult = {
    written: number;
    failedSweeps: SweepName[];
};
export type StartupMaintenanceOptions = {
    cutoffDays?: number;
    horizonEnd?: Date;
    /** 스윕이 실패해 삼켜질 때 호출된다. 로깅·Sentry는 호출부(웹/앱)가 주입한다. */
    onSweepError?: (error: unknown, sweep: SweepName) => void;
};
/**
 * 앱 진입 시 1회 실행되는 백그라운드 유지보수. 세 정책을 한 번의 읽기로 처리한다.
 *
 * 1. 30일 지난 완료 프로젝트를 archived 처리 (루트+자식 단위)
 * 2. 지난 미완료 반복 인스턴스를 overdueArchived 처리
 * 3. 무기한 반복 시리즈를 새 호라이즌까지 확장
 *
 * written은 실제로 쓴 문서 수다. 호출부는 이 값이 0보다 클 때만 캐시를 무효화한다.
 * 전체를 withRecurringSeriesLock으로 감싼다. 확장(3)은 읽고 판단한 뒤 쓰는 사이에 사용자의
 * editRecurringSeries가 끼어들면 stale 스냅샷 기준으로 커밋되기 때문이다.
 * 전체 읽기가 실패하면 reject한다.
 */
export declare const runStartupMaintenance: (db: Firestore, userId: string, options?: StartupMaintenanceOptions) => Promise<StartupMaintenanceResult>;
