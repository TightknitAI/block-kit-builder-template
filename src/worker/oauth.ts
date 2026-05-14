/**
 * Slack OAuth helpers — bot install and user-token install share the
 * same flow, just different scope parameter names.
 */

export interface StoredBotInstallation {
  team_id: string;
  team_name: string | null;
  bot_token: string;
  bot_user_id: string | null;
  installed_at: number;
}

export interface StoredUserInstallation {
  team_id: string;
  user_id: string;
  user_token: string;
  scopes: string;
  installed_at: number;
}

interface SlackOAuthV2Response {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  bot_user_id?: string;
  team?: { id: string; name?: string };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
    token_type?: string;
  };
}

/** Build a Slack OAuth authorize URL. Pass `scope` for bot install or `userScope` for user-token install. */
export function startOAuth(opts: {
  clientId: string;
  scope?: string;
  userScope?: string;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", opts.clientId);
  if (opts.scope) url.searchParams.set("scope", opts.scope);
  if (opts.userScope) url.searchParams.set("user_scope", opts.userScope);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  return url.toString();
}

/** Generate a single-use OAuth state token and store it in KV with a 10-minute TTL. */
export async function generateOAuthState(kv: KVNamespace, kind: "bot" | "user"): Promise<string> {
  const state = crypto.randomUUID();
  await kv.put(`${kind}:${state}`, "1", { expirationTtl: 600 });
  return state;
}

/** Returns true once if the state exists. Deletes it after to make it single-use. */
export async function validateOAuthState(kv: KVNamespace, kind: "bot" | "user", state: string): Promise<boolean> {
  const key = `${kind}:${state}`;
  const value = await kv.get(key);
  if (!value) return false;
  await kv.delete(key);
  return true;
}

/** Exchange an authorization code for tokens via `oauth.v2.access`. */
export async function exchangeOAuthCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<SlackOAuthV2Response> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }),
  });
  return (await res.json()) as SlackOAuthV2Response;
}
