import type { Env } from "./env";
import { handleRequest } from "./router";

export { ReminderScheduler } from "./scheduler";

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env),
};
