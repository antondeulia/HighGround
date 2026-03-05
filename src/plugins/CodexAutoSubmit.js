const CDP = require("chrome-remote-interface");

const PORT = 9222;
const INTERVAL_MS = 1200;

const TARGET_FILTER = (t) =>
  typeof t.url === "string" &&
  t.url.includes("vscode-webview://") &&
  t.url.includes("extensionId=openai.chatgpt") &&
  t.url.includes("purpose=webviewView");

const CLICK_EXPR = `
(() => {
  const normalize = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const startsWithAny = (text, labels) =>
    labels.some((label) => text === label || text.startsWith(label + ' '));
  const hasAny = (text, labels) => labels.some((label) => text.includes(label));

  const buttons = [...document.querySelectorAll('button')];
  // Prefer main submit action first (Submit/Otpravit), then confirmation (Yes/Da).
  const confirmLabels = ['yes', '\u0434\u0430 (\u0432 \u044d\u0442\u043e\u0439 \u0437\u043e\u043d\u0435!)'];
  const submitLabels = ['submit', '\u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c'];

  const submitBtn =
    buttons.find((b) => startsWithAny(normalize(b.innerText), submitLabels)) ||
    buttons.find((b) => hasAny(normalize(b.innerText), submitLabels));

  const confirmBtn = buttons.find((b) =>
    startsWithAny(normalize(b.innerText), confirmLabels),
  );

  const btn = submitBtn || confirmBtn;

  if (!btn) return {ok:false, reason:'no_submit_or_confirm_button'};

  const text = (btn.innerText || '').trim();
  const disabled = !!btn.disabled || btn.getAttribute('aria-disabled') === 'true';
  if (disabled) return {ok:false, reason:'button_disabled', text};

  btn.click();
  return {ok:true, reason:'clicked', text};
})()
`;

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!res.ok) throw new Error(`Cannot list targets: ${res.status}`);
  return res.json();
}

async function runOnce() {
  let targets;
  try {
    targets = await listTargets();
  } catch (e) {
    console.log(
      `[CDP] cannot reach port ${PORT}. Did you start VS Code with --remote-debugging-port=${PORT}?`,
    );
    return;
  }

  const webviews = targets.filter(TARGET_FILTER);
  if (!webviews.length) {
    console.log(
      "[CDP] no openai.chatgpt webview targets (open Codex panel first)",
    );
    return;
  }

  for (const t of webviews) {
    let client;
    try {
      client = await CDP({ port: PORT, target: t.id });
      const { Runtime } = client;

      const contexts = [];
      Runtime.executionContextCreated(({ context }) => {
        contexts.push(context);
      });

      await Runtime.enable();

      // wait a bit to collect contexts
      await new Promise((r) => setTimeout(r, 200));

      console.log(
        `\n[CDP] target=${t.id.slice(0, 6)} contexts=${contexts.length}`,
      );

      // if events did not arrive for any reason, still try without contextId
      if (contexts.length === 0) {
        const { result, exceptionDetails } = await Runtime.evaluate({
          expression: CLICK_EXPR,
          returnByValue: true,
          awaitPromise: true,
        });

        if (exceptionDetails) {
          console.log(
            "  default ctx EXC:",
            exceptionDetails.text || "exception",
          );
        } else {
          console.log("  default ctx ->", result?.value);
        }

        await client.close();
        continue;
      }

      for (const c of contexts) {
        try {
          const { result, exceptionDetails } = await Runtime.evaluate({
            expression: CLICK_EXPR,
            contextId: c.id,
            returnByValue: true,
            awaitPromise: true,
          });

          if (exceptionDetails) {
            console.log(
              `  ctx=${c.id} (${c.origin || "no-origin"}) EXC: ${exceptionDetails.text || "exception"}`,
            );
            continue;
          }

          const val = result?.value;
          console.log(`  ctx=${c.id} (${c.origin || "no-origin"}) ->`, val);

          if (val && val.ok) {
            console.log("[OK] clicked");
            await client.close();
            return;
          }
        } catch (e) {
          console.log(`  ctx=${c.id} eval error: ${e.message}`);
        }
      }

      await client.close();
    } catch (e) {
      if (client) {
        try {
          await client.close();
        } catch {}
      }
      console.log("[CDP] connect error:", e.message);
    }
  }
}

console.log("Codex AutoSubmit CDP debug started. Ctrl+C to stop.");
setInterval(runOnce, INTERVAL_MS);
