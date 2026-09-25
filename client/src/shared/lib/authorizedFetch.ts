import { auth } from "@/shared/lib/firebase";

/** Worker(calendar-proxy, ai-proxy)에 Firebase ID 토큰을 붙여 요청한다. */
export const authorizedFetch = async (
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
    },
  });
};
