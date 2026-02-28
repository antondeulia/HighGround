'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Workspace.module.css';

type PluginStatus = 'running' | 'stopped';

interface PluginLogEntry {
  timestamp: string;
  line: string;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}

export function PluginsView() {
  const [status, setStatus] = useState<PluginStatus>('stopped');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<PluginLogEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function hydrateStatus() {
      const state = await window.electron?.getPluginStatus?.('codex-auto-submit');
      if (!mounted || !state?.ok) return;
      setStatus(state.status ?? 'stopped');
    }

    void hydrateStatus();

    const unsubscribeLog = window.electron?.onPluginLog?.((entry) => {
      if (entry.pluginId !== 'codex-auto-submit') return;
      setLogs((prev) => {
        const next = [...prev, { timestamp: entry.timestamp, line: entry.line }];
        return next.slice(-300);
      });
    });

    const unsubscribeExit = window.electron?.onPluginExit?.((payload) => {
      if (payload.pluginId !== 'codex-auto-submit') return;
      setStatus('stopped');
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

  const statusLabel = useMemo(() => (status === 'running' ? 'Запущен' : 'Остановлен'), [status]);

  async function handleToggle() {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      if (status === 'running') {
        const result = await window.electron?.stopPlugin?.('codex-auto-submit');
        if (!result?.ok) {
          setError(result?.error || 'Не удалось остановить плагин.');
          return;
        }
        setStatus('stopped');
        return;
      }

      const result = await window.electron?.startPlugin?.('codex-auto-submit');
      if (!result?.ok) {
        setError(result?.error || 'Не удалось запустить плагин.');
        return;
      }
      setStatus('running');
    } finally {
      setBusy(false);
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  return (
    <section className={styles.pluginsView}>
      <header className={styles.contentHeader}>
        <h1>Plugins</h1>
        <p>Утилиты и автоматизации для работы с проектами.</p>
      </header>

      <article className={styles.pluginCard}>
        <div className={styles.pluginHeader}>
          <div>
            <h2>Codex Auto-Submit</h2>
            <p className={styles.pluginDescription}>
              Автоматически нажимает кнопку Submit в Codex webview через CDP.
            </p>
          </div>
          <span className={styles.pluginStatus} data-state={status}>
            {statusLabel}
          </span>
        </div>

        <div className={styles.pluginActions}>
          <button
            type="button"
            className={`${styles.createButton} ${status === 'running' ? styles.pluginStopButton : styles.pluginStartButton}`}
            onClick={() => {
              void handleToggle();
            }}
            disabled={busy}
          >
            {busy ? 'Обработка...' : status === 'running' ? 'Стоп' : 'Запустить'}
          </button>
          <button type="button" className={styles.createButton} onClick={clearLogs}>
            Очистить логи
          </button>
        </div>

        <div className={styles.pluginInstructionBlock}>
          <h3>Инструкция</h3>
          <ol>
            <li>Запусти VS Code/Cursor с `--remote-debugging-port=9222`.</li>
            <li>Открой панель Codex (ChatGPT extension webview).</li>
            <li>Нажми `Запустить` и следи за логами ниже.</li>
            <li>Для остановки нажми `Стоп`.</li>
          </ol>
        </div>

        {error ? <p className={`${styles.createStatus} ${styles.createStatusError}`}>{error}</p> : null}

        <div className={styles.pluginLogsWrap}>
          <div className={styles.pluginLogsHeader}>
            <h3>Логи</h3>
            <span>{logs.length} строк</span>
          </div>
          <div className={styles.pluginLogs}>
            {logs.length === 0 ? (
              <p className={styles.emptyState}>Логи появятся после запуска плагина.</p>
            ) : (
              logs.map((entry, index) => (
                <p key={`${entry.timestamp}-${index}`} className={styles.pluginLogLine}>
                  <span>[{formatTime(entry.timestamp)}]</span> {entry.line}
                </p>
              ))
            )}
          </div>
        </div>
      </article>
    </section>
  );
}
