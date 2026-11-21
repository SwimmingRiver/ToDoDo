import type { DisconnectResult, GoogleCalendarEvent, SyncTodoResult } from "./types.js";
export declare const parseOAuthStartResponse: (res: Response) => Promise<string>;
export declare const parseSyncResponse: (res: Response) => Promise<SyncTodoResult[]>;
export declare const parseEventsResponse: (res: Response) => Promise<GoogleCalendarEvent[]>;
export declare const parseDisconnectResponse: (res: Response) => Promise<DisconnectResult>;
