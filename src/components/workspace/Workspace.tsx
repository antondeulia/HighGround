'use client';

import { useEffect, useMemo, useState } from 'react';
import { Project, ProjectsViewMode, ThemeMode } from '@/types/project';
import { createInstance, createProject } from './project-factory';
import { Sidebar } from './Sidebar';
import { ProjectsView } from './ProjectsView';
import { ProjectDetailView } from './ProjectDetailView';
import { CreateProjectPanel } from './CreateProjectPanel';
import styles from './Workspace.module.css';

interface CreateResult {
  ok: boolean;
  folderPath?: string;
  existed?: boolean;
  error?: string;
}

type TerminalProfile = 'git-bash' | 'powershell' | 'cmd';
type IdeProfile = 'vscode' | 'cursor';

const PROJECTS_STORAGE_KEY = 'folder-manager.projects.v1';

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
  const [viewMode, setViewMode] = useState<ProjectsViewMode>('cards');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
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
    if (!selectedProject || !selectedProjectId) return;
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
        project.id === selectedProjectId
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
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
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
    if (!selectedProjectId) return;

    const selected = projects.find((project) => project.id === selectedProjectId);
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
            if (project.id !== selectedProjectId) return project;
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
          if (project.id !== selectedProjectId) return project;
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
    if (!selectedProjectId) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== selectedProjectId) return project;
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
    if (!selectedProjectId) return;

    const selected = projects.find((project) => project.id === selectedProjectId);
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
    if (!selectedProjectId) return;

    const selected = projects.find((project) => project.id === selectedProjectId);
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
    if (!selectedProjectId) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== selectedProjectId) return project;
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
        <Sidebar theme={theme} onThemeChange={setTheme} />

        <main className={styles.main}>
          {!selectedProject ? (
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
                onOpenProject={setSelectedProjectId}
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
              onBack={() => {
                setSelectedProjectId(null);
                setInstanceSearch('');
                setCreateInstanceOpen(false);
              }}
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
