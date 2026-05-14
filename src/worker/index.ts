import { Hono, type Context } from "hono";
import { SlackHonoApp } from "slack-hono";
import { SlackAPIClient } from "slack-web-api-client";
import { validateBlockKit } from "@tightknitai/slack-block-kit-validator";
import {
  exchangeOAuthCode,
  generateOAuthState,
  startOAuth,
  validateOAuthState,
  type StoredBotInstallation,
  type StoredUserInstallation,
} from "./oauth";
import { getCookie, setCookie } from "./cookies";

type Bindings = {
  ASSETS: Fetcher;
  SLACK_INSTALLATIONS: KVNamespace;
  SLACK_USER_INSTALLATIONS: KVNamespace;
  SLACK_OAUTH_STATE: KVNamespace;
  SLACK_SIGNING_SECRET: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  SLACK_BOT_SCOPES: string;
  SLACK_USER_SCOPES: string;
};

type AppEnv = { Bindings: Bindings };

const TEAM_COOKIE = "bkb_team_id";
const USER_COOKIE = "bkb_user_id";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Slack events (mounted via slack-hono). The template doesn't register any
// listeners by default — add slash commands, events, or actions here as
// you extend the app.
// ---------------------------------------------------------------------------

app.all("/slack/events", async (c) => {
  const slack = new SlackHonoApp({
    env: {
      SLACK_SIGNING_SECRET: c.env.SLACK_SIGNING_SECRET,
      // Use the first installed workspace's bot token for any listeners
      // that need to reply. Listeners that handle multi-workspace traffic
      // should swap in a dynamic authorize() instead.
      SLACK_BOT_TOKEN: "",
    },
  });
  return await slack.run(c.req.raw, c.executionCtx);
});

// ---------------------------------------------------------------------------
// Bot OAuth — installs the app into a workspace, stores bot token in KV,
// sets a cookie identifying the workspace so the SPA can call /api/* with
// the right context.
// ---------------------------------------------------------------------------

app.get("/slack/install", async (c) => {
  const state = await generateOAuthState(c.env.SLACK_OAUTH_STATE, "bot");
  const redirectUri = `${new URL(c.req.url).origin}/slack/oauth_redirect`;
  return c.redirect(
    startOAuth({
      clientId: c.env.SLACK_CLIENT_ID,
      scope: c.env.SLACK_BOT_SCOPES,
      state,
      redirectUri,
    }),
  );
});

app.get("/slack/oauth_redirect", async (c) => {
  const { code, state } = c.req.query();
  if (!code || !state) return c.text("Missing code or state", 400);

  const stateValid = await validateOAuthState(c.env.SLACK_OAUTH_STATE, "bot", state);
  if (!stateValid) return c.text("Invalid OAuth state", 400);

  const redirectUri = `${new URL(c.req.url).origin}/slack/oauth_redirect`;
  const tokenResponse = await exchangeOAuthCode({
    code,
    clientId: c.env.SLACK_CLIENT_ID,
    clientSecret: c.env.SLACK_CLIENT_SECRET,
    redirectUri,
  });

  if (!tokenResponse.ok || !tokenResponse.access_token || !tokenResponse.team?.id) {
    return c.text(`OAuth failed: ${tokenResponse.error ?? "unknown"}`, 400);
  }

  const installation: StoredBotInstallation = {
    team_id: tokenResponse.team.id,
    team_name: tokenResponse.team.name ?? null,
    bot_token: tokenResponse.access_token,
    bot_user_id: tokenResponse.bot_user_id ?? null,
    installed_at: Date.now(),
  };
  await c.env.SLACK_INSTALLATIONS.put(tokenResponse.team.id, JSON.stringify(installation));

  // Identify the workspace + installer for subsequent SPA calls
  setCookie(c, TEAM_COOKIE, tokenResponse.team.id);
  if (tokenResponse.authed_user?.id) {
    setCookie(c, USER_COOKIE, tokenResponse.authed_user.id);
  }

  return c.redirect("/?installed=1");
});

// ---------------------------------------------------------------------------
// User-token OAuth — separate flow because user scopes are distinct from bot
// scopes. Lets the builder's "send as me" toggle post as the signed-in user.
// ---------------------------------------------------------------------------

app.get("/slack/user-install", async (c) => {
  const state = await generateOAuthState(c.env.SLACK_OAUTH_STATE, "user");
  const redirectUri = `${new URL(c.req.url).origin}/slack/user-oauth-redirect`;
  return c.redirect(
    startOAuth({
      clientId: c.env.SLACK_CLIENT_ID,
      userScope: c.env.SLACK_USER_SCOPES,
      state,
      redirectUri,
    }),
  );
});

app.get("/slack/user-oauth-redirect", async (c) => {
  const { code, state } = c.req.query();
  if (!code || !state) return c.text("Missing code or state", 400);

  const stateValid = await validateOAuthState(c.env.SLACK_OAUTH_STATE, "user", state);
  if (!stateValid) return c.text("Invalid OAuth state", 400);

  const redirectUri = `${new URL(c.req.url).origin}/slack/user-oauth-redirect`;
  const tokenResponse = await exchangeOAuthCode({
    code,
    clientId: c.env.SLACK_CLIENT_ID,
    clientSecret: c.env.SLACK_CLIENT_SECRET,
    redirectUri,
  });

  const teamId = tokenResponse.team?.id;
  const userId = tokenResponse.authed_user?.id;
  const userToken = tokenResponse.authed_user?.access_token;
  if (!tokenResponse.ok || !teamId || !userId || !userToken) {
    return c.text(`User OAuth failed: ${tokenResponse.error ?? "unknown"}`, 400);
  }

  const installation: StoredUserInstallation = {
    team_id: teamId,
    user_id: userId,
    user_token: userToken,
    scopes: tokenResponse.authed_user?.scope ?? "",
    installed_at: Date.now(),
  };
  await c.env.SLACK_USER_INSTALLATIONS.put(`${teamId}:${userId}`, JSON.stringify(installation));

  setCookie(c, TEAM_COOKIE, teamId);
  setCookie(c, USER_COOKIE, userId);

  return c.redirect("/?user_installed=1");
});

// ---------------------------------------------------------------------------
// SPA-facing JSON API. Reads workspace context from the cookie set during
// bot OAuth.
// ---------------------------------------------------------------------------

const requireBotInstall = async (
  c: Context<AppEnv>,
): Promise<StoredBotInstallation | Response> => {
  const teamId = getCookie(c, TEAM_COOKIE);
  if (!teamId) {
    return c.json({ ok: false, error: "Not installed yet — visit /slack/install" }, 401);
  }
  const raw = await c.env.SLACK_INSTALLATIONS.get(teamId);
  if (!raw) {
    return c.json({ ok: false, error: "Installation not found" }, 404);
  }
  return JSON.parse(raw) as StoredBotInstallation;
};

app.get("/api/slack/channels", async (c) => {
  const install = await requireBotInstall(c);
  if (install instanceof Response) return install;

  const client = new SlackAPIClient(install.bot_token);
  const channels: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({
      types: ["public_channel", "private_channel"],
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of res.channels ?? []) {
      if (ch.id && ch.name) channels.push({ id: ch.id, name: ch.name });
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  channels.sort((a, b) => a.name.localeCompare(b.name));
  return c.json(channels);
});

app.get("/api/slack/me/can-send-as-user", async (c) => {
  const teamId = getCookie(c, TEAM_COOKIE);
  const userId = getCookie(c, USER_COOKIE);
  const origin = new URL(c.req.url).origin;
  const oauthUrl = `${origin}/slack/user-install`;

  if (!teamId || !userId) {
    return c.json({ canSendAsUser: false, oauthUrl });
  }
  const raw = await c.env.SLACK_USER_INSTALLATIONS.get(`${teamId}:${userId}`);
  if (!raw) {
    return c.json({ canSendAsUser: false, oauthUrl });
  }
  return c.json({ canSendAsUser: true });
});

interface SendBody {
  channelId: string;
  blocks: unknown[];
  sendAsUser: boolean;
}

app.post("/api/slack/messages/send", async (c) => {
  const install = await requireBotInstall(c);
  if (install instanceof Response) return install;

  const body = (await c.req.json()) as Partial<SendBody>;
  if (!body.channelId || !Array.isArray(body.blocks)) {
    return c.json({ ok: false, error: "channelId and blocks are required" }, 400);
  }

  const validation = validateBlockKit(body.blocks, { surface: "message" });
  if (!validation.valid) {
    return c.json({ ok: false, error: `Invalid blocks: ${validation.errors.join("; ")}` }, 400);
  }

  let token = install.bot_token;
  if (body.sendAsUser) {
    const userId = getCookie(c, USER_COOKIE);
    if (!userId) {
      return c.json({ ok: false, error: "Not signed in as user" }, 401);
    }
    const raw = await c.env.SLACK_USER_INSTALLATIONS.get(`${install.team_id}:${userId}`);
    if (!raw) {
      return c.json({ ok: false, error: "User token not found — install user OAuth first" }, 401);
    }
    const userInstall = JSON.parse(raw) as StoredUserInstallation;
    token = userInstall.user_token;
  }

  const client = new SlackAPIClient(token);
  try {
    await client.chat.postMessage({
      channel: body.channelId,
      blocks: body.blocks as never,
      text: "(Block Kit message — your client must support blocks to render this)",
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

// ---------------------------------------------------------------------------
// Everything else — defer to the static-assets binding (the React SPA).
// `not_found_handling: "single-page-application"` in wrangler.jsonc makes
// the assets binding serve index.html for any unmatched route.
// ---------------------------------------------------------------------------

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
