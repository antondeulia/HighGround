'use client';

import { useEffect, useMemo, useState } from 'react';
import { Project, ProjectsViewMode, ThemeMode } from '@/types/project';
import { createInstance, createProject } from './project-factory';
import { Sidebar } from './Sidebar';
import { ProjectsView } from './ProjectsView';
import { ProjectDetailView } from './ProjectDetailView';
import { CreateProjectPanel } from './CreateProjectPanel';
import { PluginsView } from './PluginsView';
import styles from './Workspace.module.css';

interface CreateResult {
  ok: boolean;
  folderPath?: string;
  existed?: boolean;
  error?: string;
}

type TerminalProfile = 'git-bash' | 'powershell' | 'cmd';
type IdeProfile = 'vscode' | 'cursor';
type WorkspaceSection = 'projects' | 'plugins' | 'settings';

interface WorkspaceTab {
  id: string;
  projectId: string | null;
}

const PROJECTS_STORAGE_KEY = 'folder-manager.projects.v1';

function createTab(projectId: string | null = null): WorkspaceTab {
  const tabId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return { id: tabId, projectId };
}

function normalizeProjects(rawProjects: Project[]): Project[] {
  return rawProjects.map((project) => ({
    ...project,
    instances: Array.isArray(project.instances)
      ? project.instances.map((instance) => ({
          ...instance,
          command: typeof instance.command === 'string' ? instance.command : 'npm run dev',
          running: false
        }))
      : []
  }));
}

export function Workspace() {
  const [theme, setTheme] = useState<ThemeMode>('hybrid');
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('projects');
  const [viewMode, setViewMode] = useState<ProjectsViewMode>('cards');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [instanceSearch, setInstanceSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('C:/projects');
  const [newTags, setNewTags] = useState('');
  const [createStatus, setCreateStatus] = useState('');
  const [createError, setCreateError] = useState(false);
  const [createInstanceOpen, setCreateInstanceOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstanceTag, setNewInstanceTag] = useState('latest');
  const [newInstancePath, setNewInstancePath] = useState('');
  const [createInstanceStatus, setCreateInstanceStatus] = useState('');
  const [createInstanceError, setCreateInstanceError] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const activeProjectId = activeTab?.projectId ?? null;

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const byFilter = filter === 'all' || project.category === filter;
      const hay = `${project.name} ${project.path}`.toLowerCase();
      const bySearch = hay.includes(search.toLowerCase());
      return byFilter && bySearch;
    });
  }, [projects, filter, search]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
      if (!raw) {
        setProjects([]);
        return;
      }

      const parsed = JSON.parse(raw) as Project[];
      if (Array.isArray(parsed)) {
        setProjects(normalizeProjects(parsed));
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects, projectsLoaded]);

  useEffect(() => {
    if (tabs.length === 0) {
      const fallback = createTab();
      setTabs([fallback]);
      setActiveTabId(fallback.id);
      return;
    }

    if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) return;
    setActiveTabId(tabs[0].id);
  }, [tabs, activeTabId]);

  useEffect(() => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (!tab.projectId) return tab;
        if (projects.some((project) => project.id === tab.projectId)) return tab;
        return { ...tab, projectId: null };
      })
    );
  }, [projects]);

  useEffect(() => {
    if (!createOpen && !createInstanceOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCreateOpen(false);
        setCreateInstanceOpen(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createOpen, createInstanceOpen]);

  async function createProjectFolder(): Promise<CreateResult> {
    const response = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: newName, targetPath: newPath })
    });

    return (await response.json()) as CreateResult;
  }

  async function handleCreateProject() {
    if (!newName.trim() || !newPath.trim()) {
      setCreateError(true);
      setCreateStatus('Укажи название и путь проекта.');
      return;
    }

    const result = await createProjectFolder();
    if (!result.ok || !result.folderPath) {
      setCreateError(true);
      setCreateStatus(result.error || 'Не удалось создать папку проекта.');
      return;
    }

    const project = createProject(newName.trim(), result.folderPath, newTags);
    setProjects((prev) => [project, ...prev]);
    setCreateError(false);
    setCreateStatus(result.existed ? 'Папка уже существовала, проект добавлен.' : 'Папка создана и проект добавлен.');
    setNewName('');
    setNewTags('');
    setCreateOpen(false);
  }

  async function handleCreateClick() {
    if (folderPickerBusy) return;

    const picker = window.electron?.selectFolder;
    if (!picker) {
      setCreateError(true);
      setCreateStatus('Системный выбор папки недоступен.');
      setCreateOpen(true);
      return;
    }

    setFolderPickerBusy(true);
    try {
      const selectedFolder = await picker();
      if (!selectedFolder) {
        return;
      }

      setNewPath(selectedFolder);
      setCreateStatus('Папка выбрана. Введи название проекта и теги.');
      setCreateError(false);
      setCreateOpen(true);
    } finally {
      setFolderPickerBusy(false);
    }
  }

  async function handleCreateInstanceClick() {
    if (!selectedProject || folderPickerBusy) return;

    const picker = window.electron?.selectFolder;
    if (!picker) {
      setCreateInstanceError(true);
      setCreateInstanceStatus('Системный выбор папки недоступен.');
      setCreateInstanceOpen(true);
      return;
    }

    setFolderPickerBusy(true);
    try {
      const selectedFolder = await picker(selectedProject.path);
      if (!selectedFolder) {
        return;
      }

      setNewInstancePath(selectedFolder);
      setCreateInstanceError(false);
      setCreateInstanceStatus('Папка выбрана. Укажи имя и tag инстанса.');
      setCreateInstanceOpen(true);
    } finally {
      setFolderPickerBusy(false);
    }
  }

  async function handleCreateInstanceSubmit() {
    if (!selectedProject || !activeProjectId) return;
    if (!newInstanceName.trim() || !newInstancePath.trim()) {
      setCreateInstanceError(true);
      setCreateInstanceStatus('Укажи имя инстанса и путь.');
      return;
    }

    const response = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: newInstanceName.trim(), targetPath: newInstancePath.trim() })
    });
    const result = (await response.json()) as CreateResult;

    if (!result.ok || !result.folderPath) {
      setCreateInstanceError(true);
      setCreateInstanceStatus(result.error || 'Не удалось создать папку инстанса.');
      return;
    }

    const instance = createInstance(newInstanceName.trim(), result.folderPath, newInstanceTag.trim() || 'latest');
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProjectId
          ? { ...project, instances: [instance, ...project.instances] }
          : project
      )
    );

    setCreateInstanceError(false);
    setCreateInstanceStatus(result.existed ? 'Папка уже существовала, инстанс добавлен.' : 'Инстанс создан.');
    setNewInstanceName('');
    setNewInstanceTag('latest');
    setCreateInstanceOpen(false);
  }

  function handleToggleProjectRun(projectId: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== projectId || project.instances.length === 0) return project;
        const [first, ...rest] = project.instances;
        return {
          ...project,
          instances: [{ ...first, running: !first.running }, ...rest]
        };
      })
    );
  }

  function handleDeleteProject(projectId: string) {
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setTabs((prev) => prev.map((tab) => (tab.projectId === projectId ? { ...tab, projectId: null } : tab)));
  }

  function handleEditProject(projectId: string) {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;

    const nextName = window.prompt('Новое имя проекта', target.name);
    if (!nextName) return;

    const trimmed = nextName.trim();
    if (!trimmed) return;

    setProjects((prev) =>
      prev.map((project) => (project.id === projectId ? { ...project, name: trimmed } : project))
    );
  }

  function handleToggleInstanceRun(instanceId: string) {
    if (!activeProjectId) return;

    const selected = projects.find((project) => project.id === activeProjectId);
    if (!selected) return;

    const instance = selected.instances.find((item) => item.id === instanceId);
    if (!instance) return;

    if (instance.running) {
      void (async () => {
        const result = await window.electron?.stopInstance?.(instance.id);
        if (!result?.ok) {
          window.alert(result?.error || 'Не удалось остановить инстанс.');
          return;
        }

        setProjects((prev) =>
          prev.map((project) => {
            if (project.id !== activeProjectId) return project;
            return {
              ...project,
              instances: project.instances.map((item) =>
                item.id === instanceId ? { ...item, running: false } : item
              )
            };
          })
        );
      })();
      return;
    }

    void (async () => {
      if (!instance.command.trim()) {
        window.alert('Укажи команду запуска, например: npm run dev');
        return;
      }

      const result = await window.electron?.startInstance?.({
        instanceId: instance.id,
        instancePath: instance.path,
        command: instance.command.trim()
      });

      if (!result?.ok) {
        window.alert(result?.error || 'Не удалось запустить инстанс.');
        return;
      }

      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== activeProjectId) return project;
          return {
            ...project,
            instances: project.instances.map((item) =>
              item.id === instanceId ? { ...item, running: true } : item
            )
          };
        })
      );
    })();
  }

  function handleUpdateInstanceCommand(instanceId: string, command: string) {
    if (!activeProjectId) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        return {
          ...project,
          instances: project.instances.map((instance) =>
            instance.id === instanceId ? { ...instance, command } : instance
          )
        };
      })
    );
  }

  function handleOpenInstanceTerminal(instanceId: string, terminal: TerminalProfile) {
    if (!activeProjectId) return;

    const selected = projects.find((project) => project.id === activeProjectId);
    const instance = selected?.instances.find((item) => item.id === instanceId);
    if (!instance) return;

    void (async () => {
      const result = await window.electron?.openInstanceTerminal?.(instance.path, terminal);

      if (!result?.ok) {
        window.alert(result?.error || 'Не удалось открыть терминал.');
      }
    })();
  }

  function handleOpenInstanceVsCode(instanceId: string, ide: IdeProfile) {
    if (!activeProjectId) return;

    const selected = projects.find((project) => project.id === activeProjectId);
    const instance = selected?.instances.find((item) => item.id === instanceId);
    if (!instance) return;

    void (async () => {
      const result = await window.electron?.openInstanceVsCode?.(instance.path, ide);

      if (!result?.ok) {
        window.alert(result?.error || 'Не удалось открыть IDE.');
      }
    })();
  }

  function handleDeleteInstance(instanceId: string) {
    if (!activeProjectId) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        return {
          ...project,
          instances: project.instances.filter((instance) => instance.id !== instanceId)
        };
      })
    );
  }

  useEffect(() => {
    const unsubscribe = window.electron?.onInstanceExit?.((instanceId) => {
      setProjects((prev) =>
        prev.map((project) => ({
          ...project,
          instances: project.instances.map((instance) =>
            instance.id === instanceId ? { ...instance, running: false } : instance
          )
        }))
      );
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  function handleOpenProject(projectId: string) {
    setActiveSection('projects');
    setTabs((prev) => {
      if (!activeTabId || !prev.some((tab) => tab.id === activeTabId)) {
        const nextTab = createTab(projectId);
        setActiveTabId(nextTab.id);
        return [...prev, nextTab];
      }

      return prev.map((tab) => (tab.id === activeTabId ? { ...tab, projectId } : tab));
    });
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleSelectTab(tabId: string) {
    setActiveSection('projects');
    setActiveTabId(tabId);
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleCloseTab(tabId: string) {
    setTabs((prev) => {
      const removedIndex = prev.findIndex((tab) => tab.id === tabId);
      if (removedIndex === -1) return prev;

      if (prev.length === 1) {
        return [{ ...prev[0], projectId: null }];
      }

      const next = prev.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const nextIndex = Math.min(removedIndex, next.length - 1);
        setActiveTabId(next[nextIndex].id);
      }
      return next;
    });
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleAddTab() {
    const nextTab = createTab();
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(nextTab.id);
    setActiveSection('projects');
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleBackToProjectsList() {
    if (!activeTabId) return;
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, projectId: null } : tab)));
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  const rootClass = `${styles.workspace} ${styles[`theme${theme[0].toUpperCase()}${theme.slice(1)}`]}`;

  return (
    <div className={rootClass}>
      <header className={styles.topBar}>
        <div className={styles.topBrand}>
          <span className={styles.brandIcon}>FM</span>
          <span className={styles.topBrandText}>Folder Manager</span>
        </div>
        <div className={styles.windowControls}>
          <button className={styles.windowControlButton} type="button" onClick={() => window.electron?.minimizeWindow?.()}>
            —
          </button>
          <button
            className={styles.windowControlButton}
            type="button"
            onClick={() => window.electron?.toggleMaximizeWindow?.()}
          >
            □
          </button>
          <button
            className={`${styles.windowControlButton} ${styles.windowControlButtonClose}`}
            type="button"
            onClick={() => window.electron?.closeWindow?.()}
          >
            ×
          </button>
        </div>
      </header>

      <div className={styles.workspaceBody}>
        <Sidebar
          theme={theme}
          onThemeChange={setTheme}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        <main className={styles.main}>
          <section className={styles.projectTabsBar} aria-label="Open project tabs">
            <div className={styles.projectTabs}>
              {tabs.map((tab) => {
                const tabProject = tab.projectId ? projects.find((project) => project.id === tab.projectId) ?? null : null;
                const tabTitle = tabProject?.name ?? 'Новая вкладка';
                return (
                  <div key={tab.id} className={`${styles.projectTab} ${activeTabId === tab.id ? styles.projectTabActive : ''}`}>
                    <button type="button" className={styles.projectTabSelect} onClick={() => handleSelectTab(tab.id)}>
                      <span className={styles.projectTabName}>{tabTitle}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.projectTabClose}
                      aria-label={`Close ${tabTitle} tab`}
                      onClick={() => handleCloseTab(tab.id)}
                    >
                      x
                    </button>
                  </div>
                );
              })}
              <button type="button" className={styles.projectTabAdd} aria-label="New tab" onClick={handleAddTab}>
                +
              </button>
            </div>
          </section>

          {activeSection === 'plugins' ? (
            <PluginsView />
          ) : activeSection === 'settings' ? (
            <section className={styles.pluginsView}>
              <header className={styles.contentHeader}>
                <h1>Settings</h1>
                <p>Раздел в разработке.</p>
              </header>
            </section>
          ) : !selectedProject ? (
            <>
              <ProjectsView
                viewMode={viewMode}
                search={search}
                filter={filter}
                projects={filteredProjects}
                onSearchChange={setSearch}
                onFilterChange={setFilter}
                onViewChange={setViewMode}
                onCreateToggle={() => {
                  void handleCreateClick();
                }}
                onOpenProject={handleOpenProject}
                onToggleProjectRun={handleToggleProjectRun}
                onDeleteProject={handleDeleteProject}
                onEditProject={handleEditProject}
              />

              <CreateProjectPanel
                isOpen={createOpen}
                name={newName}
                path={newPath}
                tags={newTags}
                statusText={createStatus}
                statusError={createError}
                onNameChange={setNewName}
                onTagsChange={setNewTags}
                onClose={() => setCreateOpen(false)}
                onSubmit={handleCreateProject}
              />
            </>
          ) : (
            <ProjectDetailView
              project={selectedProject}
              instanceSearch={instanceSearch}
              createInstanceOpen={createInstanceOpen}
              createInstanceName={newInstanceName}
              createInstanceTag={newInstanceTag}
              createInstancePath={newInstancePath}
              createInstanceStatus={createInstanceStatus}
              createInstanceError={createInstanceError}
              onBack={handleBackToProjectsList}
              onInstanceSearchChange={setInstanceSearch}
              onToggleInstanceRun={handleToggleInstanceRun}
              onDeleteInstance={handleDeleteInstance}
              onUpdateInstanceCommand={handleUpdateInstanceCommand}
              onOpenInstanceTerminal={handleOpenInstanceTerminal}
              onOpenInstanceVsCode={handleOpenInstanceVsCode}
              onCreateInstanceClick={() => {
                void handleCreateInstanceClick();
              }}
              onCreateInstanceNameChange={setNewInstanceName}
              onCreateInstanceTagChange={setNewInstanceTag}
              onCloseCreateInstance={() => setCreateInstanceOpen(false)}
              onSubmitCreateInstance={handleCreateInstanceSubmit}
            />
          )}
        </main>
      </div>
    </div>
  );
}
