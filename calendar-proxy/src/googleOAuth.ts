const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export const exchangeCodeForTokens = async (
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`토큰 교환 실패: ${res.status}`);
  return (await res.json()) as GoogleTokenResponse;
};

export const refreshAccessToken = async (
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    if (res.status === 400 && errBody.includes("invalid_grant")) {
      throw new Error("invalid_grant");
    }
    throw new Error(`토큰 갱신 실패: ${res.status}`);
  }
  return (await res.json()) as GoogleTokenResponse;
};
