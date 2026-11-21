import { CalendarNotConnectedError, CalendarRevokedError } from "./errors.js";
const readErrorCode = async (res) => {
    const body = (await res.json().catch(() => ({})));
    return body.error;
};
export const parseOAuthStartResponse = async (res) => {
    if (!res.ok)
        throw new Error("OAuth 시작 실패");
    const data = (await res.json());
    return data.authUrl;
};
export const parseSyncResponse = async (res) => {
    if (res.status === 401) {
        if ((await readErrorCode(res)) === "revoked")
            throw new CalendarRevokedError();
        throw new Error(`동기화 실패: ${res.status}`);
    }
    if (res.status === 409) {
        if ((await readErrorCode(res)) === "not_connected")
            throw new CalendarNotConnectedError();
        throw new Error(`동기화 실패: ${res.status}`);
    }
    if (!res.ok)
        throw new Error(`동기화 실패: ${res.status}`);
    const data = (await res.json());
    return data.results;
};
export const parseEventsResponse = async (res) => {
    if (res.status === 401) {
        if ((await readErrorCode(res)) === "revoked")
            throw new CalendarRevokedError();
        throw new Error("이벤트 조회 실패: 401");
    }
    if (!res.ok)
        throw new Error("이벤트 조회 실패");
    const data = (await res.json());
    return data.events;
};
export const parseDisconnectResponse = async (res) => {
    if (!res.ok)
        throw new Error("연동 해제 실패");
    const data = (await res.json().catch(() => ({})));
    return { deletedGoogleEventIds: data.deletedGoogleEventIds ?? [] };
};
