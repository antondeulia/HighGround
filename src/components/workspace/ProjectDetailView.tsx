'use client';

import { useEffect, useMemo, useState } from 'react';
import { Instance, Project } from '@/types/project';
import styles from './Workspace.module.css';

type TerminalProfile = 'git-bash' | 'powershell' | 'cmd';
type IdeProfile = 'vscode' | 'cursor';
type ActiveMenu = { instanceId: string; kind: 'terminal' | 'ide' } | null;

interface ProjectDetailViewProps {
  project: Project;
  instanceSearch: string;
  createInstanceOpen: boolean;
  createInstanceName: string;
  createInstanceTag: string;
  createInstancePath: string;
  createInstanceStatus: string;
  createInstanceError: boolean;
  onBack: () => void;
  onInstanceSearchChange: (value: string) => void;
  onToggleInstanceRun: (instanceId: string) => void;
  onDeleteInstance: (instanceId: string) => void;
  onUpdateInstanceCommand: (instanceId: string, command: string) => void;
  onOpenInstanceTerminal: (instanceId: string, terminal: TerminalProfile) => void;
  onOpenInstanceVsCode: (instanceId: string, ide: IdeProfile) => void;
  onCreateInstanceClick: () => void;
  onCreateInstanceNameChange: (value: string) => void;
  onCreateInstanceTagChange: (value: string) => void;
  onCloseCreateInstance: () => void;
  onSubmitCreateInstance: () => Promise<void>;
}

function InstanceRow({
  instance,
  onToggle,
  onDelete,
  onUpdateCommand,
  onOpenTerminal,
  onOpenVsCode,
  activeMenu,
  onToggleMenu,
  onCloseMenus
}: {
  instance: Instance;
  onToggle: (instanceId: string) => void;
  onDelete: (instanceId: string) => void;
  onUpdateCommand: (instanceId: string, command: string) => void;
  onOpenTerminal: (instanceId: string, terminal: TerminalProfile) => void;
  onOpenVsCode: (instanceId: string, ide: IdeProfile) => void;
  activeMenu: ActiveMenu;
  onToggleMenu: (instanceId: string, kind: 'terminal' | 'ide') => void;
  onCloseMenus: () => void;
}) {
  const [terminalProfile, setTerminalProfile] = useState<TerminalProfile>('git-bash');
  const [ideProfile, setIdeProfile] = useState<IdeProfile>('vscode');
  const terminalMenuOpen = activeMenu?.instanceId === instance.id && activeMenu.kind === 'terminal';
  const ideMenuOpen = activeMenu?.instanceId === instance.id && activeMenu.kind === 'ide';

  async function handleCopyPath(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(instance.path);
    } catch {
      // Ignore clipboard errors silently in restricted environments.
    }
  }

  return (
    <tr className={styles.instanceRow}>
      <td>
        <input type="checkbox" />
      </td>
      <td>
        <span className={`${styles.statusDot} ${instance.running ? styles.statusDotOnline : ''}`} />
      </td>
      <td>{instance.name}</td>
      <td className={styles.instancePathCell}>
        <div className={styles.instancePathInner}>
          <span className={styles.instancePathText}>{instance.path}</span>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.copyPathButton}`}
            onClick={handleCopyPath}
            aria-label={`Copy path for ${instance.name}`}
            title="Copy path"
          >
            ⧉
          </button>
        </div>
      </td>
      <td>
        <div className={styles.commandRunGroup}>
          <input
            type="text"
            value={instance.command}
            onChange={(event) => onUpdateCommand(instance.id, event.target.value)}
            placeholder="npm run dev"
            className={styles.instanceInlineInput}
          />
          <span className={styles.tooltipWrap} data-tooltip={instance.running ? 'Stop instance' : 'Run command'}>
            <button
              type="button"
              className={`${styles.runButton} ${styles.commandRunButton} ${instance.running ? styles.runButtonStop : ''}`}
              onClick={() => onToggle(instance.id)}
              aria-label={instance.running ? `Stop ${instance.name}` : `Run ${instance.name}`}
            >
              {instance.running ? '■' : '▶'}
            </button>
          </span>
        </div>
      </td>
      <td className={styles.instanceActionsCell}>
        <div className={styles.instanceActions}>
          <div className={styles.actionCombo} data-menu-root="true">
            <span className={styles.tooltipWrap} data-tooltip={`Open terminal (${terminalProfile})`}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.splitMainButton}`}
                onClick={() => onOpenTerminal(instance.id, terminalProfile)}
                aria-label={`Open terminal for ${instance.name}`}
              >
                <span
                  className={`${styles.mainActionIcon} ${styles.menuOptionIcon} ${
                    terminalProfile === 'git-bash'
                      ? styles.menuOptionGitBash
                      : terminalProfile === 'powershell'
                        ? styles.menuOptionPowerShell
                        : styles.menuOptionCmd
                  }`}
                >
                  {terminalProfile === 'cmd' ? 'C' : ''}
                </span>
              </button>
            </span>
            <div className={styles.instanceMenu} data-menu-root="true">
              <button
                type="button"
                className={`${styles.iconButton} ${styles.splitArrowButton}`}
                onClick={() => onToggleMenu(instance.id, 'terminal')}
                aria-label={`Choose terminal for ${instance.name}`}
              >
                <img src="/icons/down-arrow.png" alt="" className={styles.splitArrowIcon} />
              </button>
              {terminalMenuOpen ? (
                <div className={styles.instanceMenuPopover}>
                  <button
                    type="button"
                    onClick={() => {
                      setTerminalProfile('git-bash');
                      onCloseMenus();
                    }}
                  >
                    <span className={`${styles.menuOptionIcon} ${styles.menuOptionGitBash}`} aria-hidden="true" />
                    <span>Git Bash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerminalProfile('powershell');
                      onCloseMenus();
                    }}
                  >
                    <span
                      className={`${styles.menuOptionIcon} ${styles.menuOptionPowerShell}`}
                      aria-hidden="true"
                    />
                    <span>PowerShell</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTerminalProfile('cmd');
                      onCloseMenus();
                    }}
                  >
                    <span className={`${styles.menuOptionIcon} ${styles.menuOptionCmd}`} aria-hidden="true">
                      C
                    </span>
                    <span>CMD</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.actionCombo} data-menu-root="true">
            <span className={styles.tooltipWrap} data-tooltip={`Open IDE (${ideProfile})`}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.splitMainButton}`}
                onClick={() => onOpenVsCode(instance.id, ideProfile)}
                aria-label={`Open IDE for ${instance.name}`}
              >
                <span
                  className={`${styles.mainActionIcon} ${styles.menuOptionIcon} ${
                    ideProfile === 'vscode' ? styles.menuOptionVsCode : styles.menuOptionCursor
                  }`}
                />
              </button>
            </span>
            <div className={styles.instanceMenu} data-menu-root="true">
              <button
                type="button"
                className={`${styles.iconButton} ${styles.splitArrowButton}`}
                onClick={() => onToggleMenu(instance.id, 'ide')}
                aria-label={`Choose IDE for ${instance.name}`}
              >
                <img src="/icons/down-arrow.png" alt="" className={styles.splitArrowIcon} />
              </button>
              {ideMenuOpen ? (
                <div className={styles.instanceMenuPopover}>
                  <button
                    type="button"
                    onClick={() => {
                      setIdeProfile('vscode');
                      onCloseMenus();
                    }}
                  >
                    <span className={`${styles.menuOptionIcon} ${styles.menuOptionVsCode}`} aria-hidden="true" />
                    <span>VS Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIdeProfile('cursor');
                      onCloseMenus();
                    }}
                  >
                    <span className={`${styles.menuOptionIcon} ${styles.menuOptionCursor}`} aria-hidden="true" />
                    <span>Cursor</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <span className={styles.tooltipWrap} data-tooltip="Delete instance">
            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconButtonDanger}`}
              onClick={() => onDelete(instance.id)}
              aria-label={`Delete ${instance.name}`}
            >
              🗑
            </button>
          </span>
        </div>
      </td>
    </tr>
  );
}

export function ProjectDetailView({
  project,
  instanceSearch,
  createInstanceOpen,
  createInstanceName,
  createInstanceTag,
  createInstancePath,
  createInstanceStatus,
  createInstanceError,
  onBack,
  onInstanceSearchChange,
  onToggleInstanceRun,
  onDeleteInstance,
  onUpdateInstanceCommand,
  onOpenInstanceTerminal,
  onOpenInstanceVsCode,
  onCreateInstanceClick,
  onCreateInstanceNameChange,
  onCreateInstanceTagChange,
  onCloseCreateInstance,
  onSubmitCreateInstance
}: ProjectDetailViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-menu-root="true"]')) return;
      setActiveMenu(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleToggleMenu(instanceId: string, kind: 'terminal' | 'ide') {
    setActiveMenu((current) => {
      if (current?.instanceId === instanceId && current.kind === kind) {
        return null;
      }

      return { instanceId, kind };
    });
  }

  const tags = useMemo(() => {
    const unique = Array.from(new Set(project.instances.map((instance) => instance.tag)));
    return ['all', ...unique];
  }, [project.instances]);

  const filteredInstances = project.instances.filter((instance) => {
    const target = `${instance.name} ${instance.path} ${instance.tag}`.toLowerCase();
    const bySearch = target.includes(instanceSearch.toLowerCase());
    const byStatus =
      statusFilter === 'all' || (statusFilter === 'running' ? instance.running : !instance.running);
    const byTag = tagFilter === 'all' || instance.tag === tagFilter;

    return bySearch && byStatus && byTag;
  });

  return (
    <section>
      <header className={styles.detailHeader}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Projects
        </button>
        <div className={styles.detailTitleBlock}>
          <h1>{project.name}</h1>
          <p className={styles.detailPath}>{project.path}</p>
        </div>
      </header>

      <section className={styles.instancesToolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.instanceSearchInput}
            value={instanceSearch}
            onChange={(event) => onInstanceSearchChange(event.target.value)}
            placeholder="Search"
          />
        </div>

        <div className={styles.instancesToolbarActions}>
          <button type="button" className={styles.createButton} onClick={onCreateInstanceClick}>
            + Instance
          </button>

          <div className={styles.filtersMenu}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-label="Filters"
            >
              ☰
            </button>

            {filtersOpen ? (
              <div className={styles.filtersPopover}>
                <label className={styles.fieldLabel}>
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as 'all' | 'running' | 'stopped')
                    }
                  >
                    <option value="all">All</option>
                    <option value="running">Running</option>
                    <option value="stopped">Stopped</option>
                  </select>
                </label>

                <label className={styles.fieldLabel}>
                  <span>Tag</span>
                  <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                    {tags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          <button type="button" className={styles.iconButton} aria-label="View mode">
            ⛶
          </button>
        </div>
      </section>

      {project.instances.length === 0 ? (
        <section className={styles.instancesEmpty} aria-live="polite">
          У вас пока что нет инстансов.
        </section>
      ) : (
        <section className={styles.instancesTableWrap}>
          <table className={styles.instancesTable}>
            <thead>
              <tr>
                <th />
                <th>Status</th>
                <th>Name</th>
                <th>Path</th>
                <th>Command</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstances.map((instance) => (
                <InstanceRow
                  key={instance.id}
                  instance={instance}
                  onToggle={onToggleInstanceRun}
                  onDelete={onDeleteInstance}
                  onUpdateCommand={onUpdateInstanceCommand}
                  onOpenTerminal={onOpenInstanceTerminal}
                  onOpenVsCode={onOpenInstanceVsCode}
                  activeMenu={activeMenu}
                  onToggleMenu={handleToggleMenu}
                  onCloseMenus={() => setActiveMenu(null)}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {createInstanceOpen ? (
        <div className={styles.modalOverlay} onClick={onCloseCreateInstance} role="presentation">
          <form
            className={styles.createPanel}
            onClick={(event) => event.stopPropagation()}
            onSubmit={async (event) => {
              event.preventDefault();
              await onSubmitCreateInstance();
            }}
          >
            <div className={styles.createHeader}>
              <h3>Новый инстанс</h3>
              <button type="button" className={styles.closeButton} onClick={onCloseCreateInstance}>
                ×
              </button>
            </div>

            <label className={styles.fieldLabel}>
              <span>Имя инстанса</span>
              <input
                value={createInstanceName}
                placeholder="website-ui-worker"
                onChange={(event) => onCreateInstanceNameChange(event.target.value)}
                required
              />
            </label>

            <label className={styles.fieldLabel}>
              <span>Выбранная папка</span>
              <input value={createInstancePath} readOnly />
            </label>

            <label className={styles.fieldLabel}>
              <span>Tag</span>
              <input
                value={createInstanceTag}
                placeholder="latest"
                onChange={(event) => onCreateInstanceTagChange(event.target.value)}
              />
            </label>

            <button type="submit" className={styles.createSubmit}>
              Создать инстанс
            </button>

            <p className={`${styles.createStatus} ${createInstanceError ? styles.createStatusError : ''}`}>
              {createInstanceStatus}
            </p>
          </form>
        </div>
      ) : null}
    </section>
  );
}
