"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import styles from "./Workspace.module.css";

type PluginStatus = "running" | "stopped";
type PluginTab = "description" | "logs" | "settings";

interface PluginSetting {
  id: string;
  label: string;
  type: "toggle" | "text";
  value: boolean | string;
}

interface PluginLogEntry {
  timestamp: string;
  line: string;
}

interface PluginItem {
  id: string;
  name: string;
  shortDescription: string;
  markdown: string;
  settings: PluginSetting[];
  iconPath: string;
  comingSoon?: boolean;
}

const PLUGINS: PluginItem[] = [
  {
    id: "codex-auto-submit",
    name: "Codex Auto-Submit",
    shortDescription: "Automatically clicks Submit in Codex webview via CDP.",
    iconPath: "/icons/openai.png",
    markdown: `## Description
Plugin watches Codex webview and clicks \`Submit\` when the workflow requires it.
IMPORTANT: Close all VS Code windows first, then launch VS Code only from this app for auto-submit to work.

### Instructions
1. Click \`Close All VS Code instances\` to restart editors in clean state.
2. Start VS Code from an instance in this app (it uses \`--remote-debugging-port=9222\`).
3. Open Codex panel (ChatGPT extension webview).
4. Click \`Start\` and check logs in the Logs tab.
5. Use \`Stop\` to stop the plugin.

### Notes
- If submit button is not found, check error details in logs.
- Clear logs before rerun if needed.`,
    settings: [
      {
        id: "autoRestart",
        label: "Auto-restart on crash",
        type: "toggle",
        value: true,
      },
      { id: "debugPort", label: "CDP port", type: "text", value: "9222" },
    ],
  },
  {
    id: "auto-capture",
    name: "Auto Capture",
    shortDescription:
      "Capture elements on websites, add comments, and pass this context to your coding agent.",
    iconPath: "/icons/cursor-logo.png",
    markdown: `## Description
Capture elements on websites, add comments, and pass this context to your coding agent.

### Notes
- Plugin UI is ready in this release.
- Runtime integration is coming soon.`,
    settings: [],
    comingSoon: true,
  },
];

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className={styles.pluginInlineCode}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={`h3-${index}`} className={styles.pluginMdTitle}>
          {line.slice(3)}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={`h4-${index}`} className={styles.pluginMdSubtitle}>
          {line.slice(4)}
        </h4>,
      );
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${index}`} className={styles.pluginMdList}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^-\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`} className={styles.pluginMdBulletList}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphClass = line.startsWith("IMPORTANT:")
      ? `${styles.pluginMdParagraph} ${styles.pluginMdWarning}`
      : styles.pluginMdParagraph;
    nodes.push(
      <p key={`p-${index}`} className={paragraphClass}>
        {renderInlineMarkdown(line)}
      </p>,
    );
    index += 1;
  }

  return <div className={styles.pluginMarkdown}>{nodes}</div>;
}

export function PluginsView() {
  const [pluginSettings, setPluginSettings] = useState<
    Record<string, PluginSetting[]>
  >(() =>
    Object.fromEntries(PLUGINS.map((plugin) => [plugin.id, plugin.settings])),
  );
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PluginTab>("description");
  const [pluginStatuses, setPluginStatuses] = useState<
    Record<string, PluginStatus>
  >(() =>
    Object.fromEntries(
      PLUGINS.map((plugin) => [plugin.id, "stopped" as PluginStatus]),
    ),
  );
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
  const [closingEditors, setClosingEditors] = useState(false);
  const [logs, setLogs] = useState<Record<string, PluginLogEntry[]>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function hydrateStatus() {
      const entries = await Promise.all(
        PLUGINS.map(async (plugin) => {
          const state = await window.electron?.getPluginStatus?.(plugin.id);
          const nextState =
            state?.ok && state.status === "running" ? "running" : "stopped";
          return [plugin.id, nextState] as const;
        }),
      );
      if (!mounted) return;
      setPluginStatuses(Object.fromEntries(entries));
    }

    void hydrateStatus();

    const unsubscribeLog = window.electron?.onPluginLog?.((entry) => {
      setLogs((prev) => {
        const current = prev[entry.pluginId] ?? [];
        const next = [
          ...current,
          { timestamp: entry.timestamp, line: entry.line },
        ].slice(-400);
        return { ...prev, [entry.pluginId]: next };
      });
    });

    const unsubscribeExit = window.electron?.onPluginExit?.((payload) => {
      setPluginStatuses((prev) => ({ ...prev, [payload.pluginId]: "stopped" }));
      if (!payload.ok && payload.error) {
        setError(payload.error);
      }
    });

    return () => {
      mounted = false;
      unsubscribeLog?.();
      unsubscribeExit?.();
    };
  }, []);

  const selectedPlugin = useMemo(
    () => PLUGINS.find((plugin) => plugin.id === selectedPluginId) ?? null,
    [selectedPluginId],
  );
  const selectedPluginLogs = selectedPlugin
    ? (logs[selectedPlugin.id] ?? [])
    : [];
  const selectedPluginStatus = selectedPlugin
    ? (pluginStatuses[selectedPlugin.id] ?? "stopped")
    : "stopped";
  const selectedStatusLabel =
    selectedPluginStatus === "running" ? "Running" : "Stopped";

  async function handleToggle(pluginId: string) {
    if (busyPluginId) return;
    const plugin = PLUGINS.find((item) => item.id === pluginId);
    if (plugin?.comingSoon) {
      setError("Auto Capture runtime integration is coming soon.");
      return;
    }

    setBusyPluginId(pluginId);
    setError("");
    const currentStatus = pluginStatuses[pluginId] ?? "stopped";

    try {
      if (currentStatus === "running") {
        const result = await window.electron?.stopPlugin?.(pluginId);
        if (!result?.ok) {
          setError(result?.error || "Failed to stop plugin.");
          return;
        }
        setPluginStatuses((prev) => ({ ...prev, [pluginId]: "stopped" }));
        return;
      }

      const result = await window.electron?.startPlugin?.(pluginId);
      if (!result?.ok) {
        setError(result?.error || "Failed to start plugin.");
        return;
      }
      setPluginStatuses((prev) => ({ ...prev, [pluginId]: "running" }));
    } finally {
      setBusyPluginId(null);
    }
  }

  function clearLogs(pluginId: string) {
    setLogs((prev) => ({ ...prev, [pluginId]: [] }));
  }

  function openPlugin(pluginId: string) {
    setSelectedPluginId(pluginId);
    setActiveTab("description");
    setError("");
  }

  async function handleCloseEditors(ide: "vscode" | "cursor" = "vscode") {
    if (closingEditors) return;
    setClosingEditors(true);
    setError("");
    try {
      const result = await window.electron?.closeAllEditors?.(ide);
      if (!result?.ok) {
        setError(result?.error || "Failed to close editor processes.");
      }
    } finally {
      setClosingEditors(false);
    }
  }

  function updateSetting(
    pluginId: string,
    settingId: string,
    nextValue: boolean | string,
  ) {
    setPluginSettings((prev) => {
      const current = prev[pluginId] ?? [];
      const next = current.map((setting) =>
        setting.id === settingId ? { ...setting, value: nextValue } : setting,
      );
      return { ...prev, [pluginId]: next };
    });
  }

  return (
    <section className={styles.pluginsView}>
      {!selectedPlugin ? (
        <>
          <header className={styles.contentHeader}>
            <h1>Plugins</h1>
            <p>Utilities and automations for project workflows.</p>
          </header>

          <div className={styles.pluginsList}>
            {PLUGINS.map((plugin) => (
              <article
                key={plugin.id}
                className={styles.pluginListCard}
                role="button"
                tabIndex={0}
                onClick={() => openPlugin(plugin.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPlugin(plugin.id);
                  }
                }}
              >
                <div className={styles.pluginHeader}>
                  <div className={styles.pluginHeadContent}>
                    <div className={styles.pluginTitleRow}>
                      <img
                        src={plugin.iconPath}
                        alt=""
                        aria-hidden="true"
                        className={styles.pluginCardIcon}
                      />
                      <h2>{plugin.name}</h2>
                    </div>
                    <p
                      className={`${styles.pluginDescription} ${styles.pluginDescriptionClamp}`}
                    >
                      {plugin.shortDescription}
                    </p>
                  </div>
                  <span
                    className={styles.pluginStatus}
                    data-state={pluginStatuses[plugin.id] ?? "stopped"}
                  >
                    {(pluginStatuses[plugin.id] ?? "stopped") === "running"
                      ? "Running"
                      : "Stopped"}
                  </span>
                </div>

                <div className={styles.pluginActions}>
                  <button
                    type="button"
                    className={`${styles.createButton} ${(pluginStatuses[plugin.id] ?? "stopped") === "running" ? styles.pluginStopButton : styles.pluginStartButton}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggle(plugin.id);
                    }}
                    disabled={busyPluginId === plugin.id}
                  >
                    {busyPluginId === plugin.id
                      ? "Working..."
                      : (pluginStatuses[plugin.id] ?? "stopped") === "running"
                        ? "Stop"
                        : "Start"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={styles.pluginBackRow}>
            <button
              type="button"
              className={styles.pluginBackButton}
              onClick={() => setSelectedPluginId(null)}
            >
              Back to plugins
            </button>
            <span
              className={styles.pluginStatusPlain}
              data-state={selectedPluginStatus}
            >
              <span className={styles.pluginStatusDot} />
              {selectedStatusLabel}
            </span>
          </div>

          <article className={styles.pluginDetailPage}>
            <div className={styles.pluginDetailHeader}>
              <div className={styles.pluginHeadContent}>
                <div className={styles.pluginTitleRow}>
                  <img
                    src={selectedPlugin.iconPath}
                    alt=""
                    aria-hidden="true"
                    className={styles.pluginCardIcon}
                  />
                  <h2>{selectedPlugin.name}</h2>
                </div>
              </div>
            </div>

            <div className={styles.pluginActions}>
              {selectedPlugin.id === "codex-auto-submit" ? (
                <>
                  <button
                    type="button"
                    className={`${styles.createButton} ${styles.pluginCloseEditorsButton}`}
                    onClick={() => {
                      void handleCloseEditors("vscode");
                    }}
                    disabled={closingEditors}
                  >
                    {closingEditors
                      ? "Closing VS Code..."
                      : "Close All VS Code instances"}
                  </button>
                </>
              ) : null}
              {activeTab === "logs" ? (
                <button
                  type="button"
                  className={styles.createButton}
                  onClick={() => clearLogs(selectedPlugin.id)}
                >
                  Clear logs
                </button>
              ) : null}
              <button
                type="button"
                className={`${styles.createButton} ${selectedPluginStatus === "running" ? styles.pluginStopButton : styles.pluginStartButton}`}
                onClick={() => {
                  void handleToggle(selectedPlugin.id);
                }}
                disabled={busyPluginId === selectedPlugin.id}
              >
                {busyPluginId === selectedPlugin.id
                  ? "Working..."
                  : selectedPluginStatus === "running"
                    ? "Stop"
                    : "Start"}
              </button>
            </div>

            <div className={styles.pluginTabs}>
              <button
                type="button"
                className={`${styles.pluginTabButton} ${activeTab === "description" ? styles.pluginTabButtonActive : ""}`}
                onClick={() => setActiveTab("description")}
              >
                Description
              </button>
              <button
                type="button"
                className={`${styles.pluginTabButton} ${activeTab === "logs" ? styles.pluginTabButtonActive : ""}`}
                onClick={() => setActiveTab("logs")}
              >
                Logs
              </button>
              <button
                type="button"
                className={`${styles.pluginTabButton} ${activeTab === "settings" ? styles.pluginTabButtonActive : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                Settings
              </button>
            </div>

            {error ? (
              <p
                className={`${styles.createStatus} ${styles.createStatusError}`}
              >
                {error}
              </p>
            ) : null}

            <div className={styles.pluginTabPanel}>
              {activeTab === "description" ? (
                <div className={styles.pluginInstructionBlock}>
                  <MarkdownContent markdown={selectedPlugin.markdown} />
                </div>
              ) : null}

              {activeTab === "logs" ? (
                <div className={styles.pluginLogsWrap}>
                  <div className={styles.pluginLogsHeader}>
                    <h3>Logs</h3>
                    <span>{selectedPluginLogs.length} lines</span>
                  </div>
                  <div className={styles.pluginLogs}>
                    {selectedPluginLogs.length === 0 ? (
                      <p className={styles.emptyState}>
                        Logs will appear after plugin start.
                      </p>
                    ) : (
                      selectedPluginLogs.map((entry, entryIndex) => (
                        <p
                          key={`${entry.timestamp}-${entryIndex}`}
                          className={styles.pluginLogLine}
                        >
                          <span>[{formatTime(entry.timestamp)}]</span>{" "}
                          {entry.line}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "settings" ? (
                <div className={styles.pluginSettingsPanel}>
                  {(pluginSettings[selectedPlugin.id] ?? []).map((setting) => (
                    <label key={setting.id} className={styles.pluginSettingRow}>
                      <span>{setting.label}</span>
                      {setting.type === "toggle" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(setting.value)}
                          onChange={(event) =>
                            updateSetting(
                              selectedPlugin.id,
                              setting.id,
                              event.target.checked,
                            )
                          }
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(setting.value)}
                          onChange={(event) =>
                            updateSetting(
                              selectedPlugin.id,
                              setting.id,
                              event.target.value,
                            )
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
