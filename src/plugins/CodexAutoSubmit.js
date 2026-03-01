const CDP = require("chrome-remote-interface");

const PORT = 9222;
const INTERVAL_MS = 1200;
let noVscodeDebugPortLogged = false;

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

  const buttons = [...document.querySelectorAll('button')];
  // Prefer main submit action first (Submit/Otpravit), then confirmation (Yes/Da).
  const confirmLabels = ['yes', '\u0434\u0430 (\u0432 \u044d\u0442\u043e\u0439 \u0437\u043e\u043d\u0435!)'];
  const submitLabels = ['submit', '\u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c'];

  const submitBtn = buttons.find((b) =>
    startsWithAny(normalize(b.innerText), submitLabels),
  );

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
    noVscodeDebugPortLogged = false;
  } catch (e) {
    if (!noVscodeDebugPortLogged) {
      console.log(
        `[INFO] VS Code instance was not found on port ${PORT}. ` +
          `Start VS Code with: code --remote-debugging-port=${PORT} ` +
          `or use the button in this app.`,
      );
      noVscodeDebugPortLogged = true;
    }
    return;
  }

  const webviews = targets.filter(TARGET_FILTER);
  if (!webviews.length) return;

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

      // if events did not arrive for any reason, still try without contextId
      if (contexts.length === 0) {
        const { result, exceptionDetails } = await Runtime.evaluate({
          expression: CLICK_EXPR,
          returnByValue: true,
          awaitPromise: true,
        });

        if (exceptionDetails) {
          await client.close();
          continue;
        }

        const val = result?.value;
        if (val && val.ok) {
          console.log("[OK] clicked", val);
          await client.close();
          return;
        }
        if (val && val.ok === false) {
          console.log("[SKIP] not clicked", val);
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

          if (exceptionDetails) continue;

          const val = result?.value;
          if (val && val.ok) {
            console.log("[OK] clicked", val);
            await client.close();
            return;
          }
          if (val && val.ok === false) {
            console.log("[SKIP] not clicked", val);
          }
        } catch (e) {
          // ignore noisy eval errors; keep logs only for real clicks
        }
      }

      await client.close();
    } catch (e) {
      if (client) {
        try {
          await client.close();
        } catch {}
      }
      // ignore noisy connection errors; keep logs only for real clicks
    }
  }
}

setInterval(runOnce, INTERVAL_MS);
