import type { Env } from "../env";

export const handlePlan = async (_request: Request, _env: Env): Promise<Response> =>
  new Response("Not Implemented", { status: 501 });
