import { BlockKitBuilder } from "block-kit-builder";

/**
 * Sole screen: hands the builder three thin fetch wrappers that hit the
 * Worker's /api/* endpoints. The builder owns all UX state, drag and drop,
 * editors, validation, and the send dialog — the SPA is just an integration
 * shell.
 */
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Block Kit Builder Template</h1>
        <p>
          Drag blocks → preview → click <strong>Send</strong> to post the message into your Slack
          workspace. Visit <a href="/slack/install">/slack/install</a> first to install the app.
        </p>
      </header>
      <main className="app__main">
        <BlockKitBuilder
          workspaceName="Slack"
          loadChannels={async () => {
            const res = await fetch("/api/slack/channels", { credentials: "include" });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: res.statusText }));
              throw new Error((err as { error?: string }).error ?? "Failed to load channels");
            }
            return res.json();
          }}
          loadSendAsUserStatus={async () => {
            const res = await fetch("/api/slack/me/can-send-as-user", { credentials: "include" });
            return res.json();
          }}
          onSend={async ({ channelId, blocks, sendAsUser }) => {
            const res = await fetch("/api/slack/messages/send", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channelId, blocks, sendAsUser }),
            });
            return res.json();
          }}
        />
      </main>
    </div>
  );
}
