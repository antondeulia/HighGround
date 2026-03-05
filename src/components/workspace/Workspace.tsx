'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
const WORKSPACE_STORAGE_KEY = 'folder-manager.workspace.v1';
const TAB_ANIMATION_MS = 180;

interface WorkspacePersistedState {
  theme?: ThemeMode;
  activeSection?: WorkspaceSection;
  isSidebarCollapsed?: boolean;
  viewMode?: ProjectsViewMode;
  tabs?: WorkspaceTab[];
  activeTabId?: string | null;
  search?: string;
  instanceSearch?: string;
  filtersOpen?: boolean;
  statusFilter?: 'all' | 'running' | 'stopped';
  tagFilter?: string;
  createDraft?: {
    name?: string;
    path?: string;
    tags?: string;
  };
  createInstanceDraft?: {
    name?: string;
    tag?: string;
    path?: string;
  };
  terminalProfiles?: Record<string, TerminalProfile>;
  ideProfiles?: Record<string, IdeProfile>;
  defaultTerminal?: TerminalProfile;
  defaultIde?: IdeProfile;
}

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
          localUrl:
            typeof instance.localUrl === 'string' && instance.localUrl.trim().length > 0
              ? instance.localUrl
              : '',
          command: typeof instance.command === 'string' ? instance.command : 'npm run dev',
          running: false
        }))
      : []
  }));
}

function sanitizeWorkspaceState(raw: unknown): WorkspacePersistedState {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const state = raw as WorkspacePersistedState;
  const safeTheme: ThemeMode | undefined =
    state.theme === 'white' || state.theme === 'hybrid' || state.theme === 'dark' ? state.theme : undefined;
  const safeSection: WorkspaceSection | undefined =
    state.activeSection === 'projects' || state.activeSection === 'plugins' || state.activeSection === 'settings'
      ? state.activeSection
      : undefined;
  const safeView: ProjectsViewMode | undefined =
    state.viewMode === 'cards' || state.viewMode === 'table' ? state.viewMode : undefined;
  const safeStatus: 'all' | 'running' | 'stopped' | undefined =
    state.statusFilter === 'all' || state.statusFilter === 'running' || state.statusFilter === 'stopped'
      ? state.statusFilter
      : undefined;
  const safeTabs = Array.isArray(state.tabs)
    ? state.tabs.filter((tab): tab is WorkspaceTab => {
        return (
          Boolean(tab) &&
          typeof tab.id === 'string' &&
          (typeof tab.projectId === 'string' || tab.projectId === null)
        );
      })
    : undefined;

  return {
    theme: safeTheme,
    activeSection: safeSection,
    isSidebarCollapsed: typeof state.isSidebarCollapsed === 'boolean' ? state.isSidebarCollapsed : undefined,
    viewMode: safeView,
    tabs: safeTabs,
    activeTabId: typeof state.activeTabId === 'string' || state.activeTabId === null ? state.activeTabId : undefined,
    search: typeof state.search === 'string' ? state.search : undefined,
    instanceSearch: typeof state.instanceSearch === 'string' ? state.instanceSearch : undefined,
    filtersOpen: typeof state.filtersOpen === 'boolean' ? state.filtersOpen : undefined,
    statusFilter: safeStatus,
    tagFilter: typeof state.tagFilter === 'string' ? state.tagFilter : undefined,
    createDraft:
      state.createDraft && typeof state.createDraft === 'object'
        ? {
            name: typeof state.createDraft.name === 'string' ? state.createDraft.name : undefined,
            path: typeof state.createDraft.path === 'string' ? state.createDraft.path : undefined,
            tags: typeof state.createDraft.tags === 'string' ? state.createDraft.tags : undefined
          }
        : undefined,
    createInstanceDraft:
      state.createInstanceDraft && typeof state.createInstanceDraft === 'object'
        ? {
            name: typeof state.createInstanceDraft.name === 'string' ? state.createInstanceDraft.name : undefined,
            tag: typeof state.createInstanceDraft.tag === 'string' ? state.createInstanceDraft.tag : undefined,
            path: typeof state.createInstanceDraft.path === 'string' ? state.createInstanceDraft.path : undefined
          }
        : undefined,
    terminalProfiles:
      state.terminalProfiles && typeof state.terminalProfiles === 'object'
        ? state.terminalProfiles
        : undefined,
    ideProfiles: state.ideProfiles && typeof state.ideProfiles === 'object' ? state.ideProfiles : undefined,
    defaultTerminal:
      state.defaultTerminal === 'git-bash' ||
      state.defaultTerminal === 'powershell' ||
      state.defaultTerminal === 'cmd'
        ? state.defaultTerminal
        : undefined,
    defaultIde: state.defaultIde === 'vscode' || state.defaultIde === 'cursor' ? state.defaultIde : undefined
  };
}

export function Workspace() {
  const [theme, setTheme] = useState<ThemeMode>('hybrid');
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('projects');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ProjectsViewMode>('cards');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [openingTabIds, setOpeningTabIds] = useState<string[]>([]);
  const [closingTabIds, setClosingTabIds] = useState<string[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [instanceSearch, setInstanceSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [tagFilter, setTagFilter] = useState('all');

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
  const [terminalProfiles, setTerminalProfiles] = useState<Record<string, TerminalProfile>>({});
  const [ideProfiles, setIdeProfiles] = useState<Record<string, IdeProfile>>({});
  const [defaultTerminal, setDefaultTerminal] = useState<TerminalProfile>('git-bash');
  const [defaultIde, setDefaultIde] = useState<IdeProfile>('vscode');
  const [appStartWithWindows, setAppStartWithWindows] = useState(false);
  const [startupSettingsBusy, setStartupSettingsBusy] = useState(false);
  const [startupSettingsError, setStartupSettingsError] = useState('');
  const [appVersion, setAppVersion] = useState('0.0.0');
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    status: 'idle',
    currentVersion: '0.0.0'
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const tabOpenTimersRef = useRef<Record<string, number>>({});
  const tabCloseTimersRef = useRef<Record<string, number>>({});

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [tabs, activeTabId]);
  const activeProjectId = activeTab?.projectId ?? null;

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const hay = `${project.name} ${project.path}`.toLowerCase();
      const bySearch = hay.includes(search.toLowerCase());
      return bySearch;
    });
  }, [projects, search]);

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
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = sanitizeWorkspaceState(JSON.parse(raw));

      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.activeSection) setActiveSection(parsed.activeSection);
      if (typeof parsed.isSidebarCollapsed === 'boolean') setIsSidebarCollapsed(parsed.isSidebarCollapsed);
      if (parsed.viewMode) setViewMode(parsed.viewMode);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) setTabs(parsed.tabs);
      if (typeof parsed.activeTabId !== 'undefined') setActiveTabId(parsed.activeTabId);
      if (typeof parsed.search === 'string') setSearch(parsed.search);
      if (typeof parsed.instanceSearch === 'string') setInstanceSearch(parsed.instanceSearch);
      if (typeof parsed.filtersOpen === 'boolean') setFiltersOpen(parsed.filtersOpen);
      if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
      if (typeof parsed.tagFilter === 'string') setTagFilter(parsed.tagFilter);
      if (parsed.createDraft) {
        if (typeof parsed.createDraft.name === 'string') setNewName(parsed.createDraft.name);
        if (typeof parsed.createDraft.path === 'string' && parsed.createDraft.path.trim().length > 0) {
          setNewPath(parsed.createDraft.path);
        }
        if (typeof parsed.createDraft.tags === 'string') setNewTags(parsed.createDraft.tags);
      }
      if (parsed.createInstanceDraft) {
        if (typeof parsed.createInstanceDraft.name === 'string') setNewInstanceName(parsed.createInstanceDraft.name);
        if (typeof parsed.createInstanceDraft.tag === 'string') setNewInstanceTag(parsed.createInstanceDraft.tag);
        if (typeof parsed.createInstanceDraft.path === 'string') setNewInstancePath(parsed.createInstanceDraft.path);
      }
      if (parsed.terminalProfiles) setTerminalProfiles(parsed.terminalProfiles);
      if (parsed.ideProfiles) setIdeProfiles(parsed.ideProfiles);
      if (parsed.defaultTerminal) setDefaultTerminal(parsed.defaultTerminal);
      if (parsed.defaultIde) setDefaultIde(parsed.defaultIde);
    } catch {
      // Ignore invalid workspace snapshot and use defaults.
    } finally {
      setWorkspaceLoaded(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const result = await window.electron?.getStartupSettings?.();
      if (!mounted || !result?.ok || !result.settings) return;
      setAppStartWithWindows(Boolean(result.settings.appStartWithWindows));
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [versionResult, statusResult] = await Promise.all([
        window.electron?.getAppVersion?.(),
        window.electron?.getUpdateStatus?.()
      ]);

      if (!mounted) return;

      if (versionResult?.ok && versionResult.version) {
        setAppVersion(versionResult.version);
      }
      if (statusResult?.ok) {
        const { ok: _ok, ...nextStatus } = statusResult;
        setUpdateState((prev) => ({ ...prev, ...nextStatus }));
      }
    })();

    const unsubscribe = window.electron?.onUpdateStatus?.((payload) => {
      setUpdateState((prev) => ({ ...prev, ...payload }));
      if (payload.currentVersion) {
        setAppVersion(payload.currentVersion);
      }
      setUpdateBusy(false);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects, projectsLoaded]);

  useEffect(() => {
    if (!workspaceLoaded) return;

    const nextState: WorkspacePersistedState = {
      theme,
      activeSection,
      isSidebarCollapsed,
      viewMode,
      tabs,
      activeTabId,
      search,
      instanceSearch,
      filtersOpen,
      statusFilter,
      tagFilter,
      createDraft: {
        name: newName,
        path: newPath,
        tags: newTags
      },
      createInstanceDraft: {
        name: newInstanceName,
        tag: newInstanceTag,
        path: newInstancePath
      },
      terminalProfiles,
      ideProfiles,
      defaultTerminal,
      defaultIde
    };

    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    theme,
    activeSection,
    isSidebarCollapsed,
    viewMode,
    tabs,
    activeTabId,
    search,
    instanceSearch,
    filtersOpen,
    statusFilter,
    tagFilter,
    newName,
    newPath,
    newTags,
    newInstanceName,
    newInstanceTag,
    newInstancePath,
    terminalProfiles,
    ideProfiles,
    defaultTerminal,
    defaultIde,
    workspaceLoaded
  ]);

  useEffect(() => {
    return () => {
      Object.values(tabOpenTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      Object.values(tabCloseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null);
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

    const existingInstanceIds = new Set(projects.flatMap((project) => project.instances.map((instance) => instance.id)));
    setTerminalProfiles((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([instanceId]) => existingInstanceIds.has(instanceId))
      ) as Record<string, TerminalProfile>;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    setIdeProfiles((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([instanceId]) => existingInstanceIds.has(instanceId))
      ) as Record<string, IdeProfile>;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
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
      setCreateStatus('Provide project name and path.');
      return;
    }

    const result = await createProjectFolder();
    if (!result.ok || !result.folderPath) {
      setCreateError(true);
      setCreateStatus(result.error || 'Failed to create project folder.');
      return;
    }

    const project = createProject(newName.trim(), result.folderPath, newTags);
    setProjects((prev) => [project, ...prev]);
    setCreateError(false);
    setCreateStatus(result.existed ? 'Folder already existed, project added.' : 'Folder created and project added.');
    setNewName('');
    setNewTags('');
    setCreateOpen(false);
  }

  async function handleCreateClick() {
    if (folderPickerBusy) return;

    const picker = window.electron?.selectFolder;
    if (!picker) {
      setCreateError(true);
      setCreateStatus('System folder picker is unavailable.');
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
      setCreateStatus('Folder selected. Enter project name and tags.');
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
      setCreateInstanceStatus('System folder picker is unavailable.');
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
      setCreateInstanceStatus('Folder selected. Provide instance name and tag.');
      setCreateInstanceOpen(true);
    } finally {
      setFolderPickerBusy(false);
    }
  }

  async function handleCreateInstanceSubmit() {
    if (!selectedProject || !activeProjectId) return;
    if (!newInstanceName.trim() || !newInstancePath.trim()) {
      setCreateInstanceError(true);
      setCreateInstanceStatus('Provide instance name and path.');
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
      setCreateInstanceStatus(result.error || 'Failed to create instance folder.');
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
    setCreateInstanceStatus(result.existed ? 'Folder already existed, instance added.' : 'Instance created.');
    setNewInstanceName('');
    setNewInstanceTag('latest');
    setCreateInstanceOpen(false);
  }

  function handleDeleteProject(projectId: string) {
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setTabs((prev) => prev.map((tab) => (tab.projectId === projectId ? { ...tab, projectId: null } : tab)));
  }

  function handleEditProject(projectId: string) {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;

    const nextName = window.prompt('New project name', target.name);
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
          window.alert(result?.error || 'Failed to stop instance.');
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
        window.alert('Provide a start command, for example: npm run dev');
        return;
      }

      const result = await window.electron?.startInstance?.({
        instanceId: instance.id,
        instancePath: instance.path,
        command: instance.command.trim()
      });

      if (!result?.ok) {
        window.alert(result?.error || 'Failed to start instance.');
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

  function handleUpdateInstanceLocalUrl(instanceId: string, localUrl: string) {
    if (!activeProjectId) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        return {
          ...project,
          instances: project.instances.map((instance) =>
            instance.id === instanceId ? { ...instance, localUrl } : instance
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
        window.alert(result?.error || 'Failed to open terminal.');
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
        window.alert(result?.error || 'Failed to open IDE.');
      }
    })();
  }

  function handleDeleteInstance(instanceId: string) {
    if (!activeProjectId) return;

    const selected = projects.find((project) => project.id === activeProjectId);
    const instance = selected?.instances.find((item) => item.id === instanceId);
    if (!instance) return;

    const confirmed = window.confirm(`Delete instance "${instance.name}"?\nThis action cannot be undone.`);
    if (!confirmed) return;

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        return {
          ...project,
          instances: project.instances.filter((instance) => instance.id !== instanceId)
        };
      })
    );
    setTerminalProfiles((prev) => {
      if (!(instanceId in prev)) return prev;
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
    setIdeProfiles((prev) => {
      if (!(instanceId in prev)) return prev;
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }

  function handleTerminalProfileChange(instanceId: string, terminal: TerminalProfile) {
    setTerminalProfiles((prev) => ({ ...prev, [instanceId]: terminal }));
  }

  function handleIdeProfileChange(instanceId: string, ide: IdeProfile) {
    setIdeProfiles((prev) => ({ ...prev, [instanceId]: ide }));
  }

  async function handleAppStartupToggle(enabled: boolean) {
    setStartupSettingsBusy(true);
    setStartupSettingsError('');
    setAppStartWithWindows(enabled);
    try {
      const result = await window.electron?.setAppStartup?.(enabled);
      if (!result?.ok || !result.settings) {
        setStartupSettingsError(result?.error || 'Failed to update app startup.');
        setAppStartWithWindows((prev) => !prev);
        return;
      }
      setAppStartWithWindows(Boolean(result.settings.appStartWithWindows));
    } finally {
      setStartupSettingsBusy(false);
    }
  }

  async function handleUpdateAction() {
    if (updateBusy) return;
    setUpdateBusy(true);

    try {
      if (updateState.status === 'downloaded') {
        const result = await window.electron?.installUpdate?.();
        if (!result?.ok) {
          setUpdateState((prev) => ({
            ...prev,
            status: 'error',
            error: result?.error || 'Failed to install update.'
          }));
          setUpdateBusy(false);
        }
        return;
      }

      const result = await window.electron?.checkForUpdates?.();
      if (!result?.ok) {
        setUpdateState((prev) => ({
          ...prev,
          status: 'error',
          error: result?.error || 'Failed to check updates.'
        }));
      }
    } finally {
      if (updateState.status !== 'downloaded') {
        setUpdateBusy(false);
      }
    }
  }

  const updateActionLabel = useMemo(() => {
    const versionLabel = `v${appVersion}`;

    if (updateBusy || updateState.status === 'checking') {
      return `Checking updates... ${versionLabel}`;
    }
    if (updateState.status === 'downloading') {
      const percent =
        typeof updateState.downloadPercent === 'number'
          ? ` ${Math.round(updateState.downloadPercent)}%`
          : '';
      return `Downloading update...${percent}`;
    }
    if (updateState.status === 'available' || updateState.status === 'downloaded') {
      const next = updateState.availableVersion ? `v${updateState.availableVersion}` : 'new version';
      return updateState.status === 'downloaded'
        ? `Update ready: ${next}`
        : `Update to ${next}`;
    }
    if (updateState.status === 'error') {
      return `Update failed - Retry (${versionLabel})`;
    }

    return `Updated - ${versionLabel}`;
  }, [appVersion, updateBusy, updateState]);

  const canClickUpdateBadge =
    updateState.status === 'downloaded' ||
    updateState.status === 'available' ||
    updateState.status === 'error' ||
    updateState.status === 'idle' ||
    updateState.status === 'not-available';

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
      if (prev.length === 0) {
        const nextTab = createTab(projectId);
        setActiveTabId(nextTab.id);
        return [nextTab];
      }

      if (!activeTabId || !prev.some((tab) => tab.id === activeTabId)) {
        const firstTabId = prev[0].id;
        setActiveTabId(firstTabId);
        return prev.map((tab, index) => (index === 0 ? { ...tab, projectId } : tab));
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

  function scheduleOpeningTabAnimation(tabId: string) {
    setOpeningTabIds((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));

    if (tabOpenTimersRef.current[tabId]) {
      window.clearTimeout(tabOpenTimersRef.current[tabId]);
    }

    tabOpenTimersRef.current[tabId] = window.setTimeout(() => {
      setOpeningTabIds((prev) => prev.filter((id) => id !== tabId));
      delete tabOpenTimersRef.current[tabId];
    }, TAB_ANIMATION_MS);
  }

  function handleCloseTab(tabId: string) {
    if (closingTabIds.includes(tabId)) return;
    setClosingTabIds((prev) => [...prev, tabId]);

    if (tabCloseTimersRef.current[tabId]) {
      window.clearTimeout(tabCloseTimersRef.current[tabId]);
    }

    tabCloseTimersRef.current[tabId] = window.setTimeout(() => {
      setTabs((prev) => {
        const removedIndex = prev.findIndex((tab) => tab.id === tabId);
        if (removedIndex === -1) {
          return prev;
        }

        const next = prev.filter((tab) => tab.id !== tabId);
        setActiveTabId((currentActiveTabId) => {
          if (currentActiveTabId !== tabId) return currentActiveTabId;
          if (next.length === 0) return null;
          const nextIndex = Math.min(removedIndex, next.length - 1);
          return next[nextIndex].id;
        });

        return next;
      });

      setClosingTabIds((prev) => prev.filter((id) => id !== tabId));
      delete tabCloseTimersRef.current[tabId];
    }, TAB_ANIMATION_MS);

    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleAddTab() {
    const nextTab = createTab();
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(nextTab.id);
    scheduleOpeningTabAnimation(nextTab.id);
    setActiveSection('projects');
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleCloseAllTabs() {
    if (tabs.length === 0) return;

    const confirmed = window.confirm('Close all tabs?\nThis action cannot be undone.');
    if (!confirmed) return;

    Object.values(tabOpenTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    Object.values(tabCloseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    tabOpenTimersRef.current = {};
    tabCloseTimersRef.current = {};

    setOpeningTabIds([]);
    setClosingTabIds([]);
    setTabs([]);
    setActiveTabId(null);
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  function handleBackToProjectsList() {
    const nextTab = createTab();
    setTabs((prev) => [...prev, nextTab]);
    setActiveTabId(nextTab.id);
    scheduleOpeningTabAnimation(nextTab.id);
    setActiveSection('projects');
    setInstanceSearch('');
    setCreateInstanceOpen(false);
  }

  const rootClass = `${styles.workspace} ${styles[`theme${theme[0].toUpperCase()}${theme.slice(1)}`]}`;
  const workspaceBodyClass = `${styles.workspaceBody} ${isSidebarCollapsed ? styles.workspaceBodySidebarCollapsed : ''}`;

  return (
    <div className={rootClass}>
      <header className={styles.topBar}>
        <div className={styles.topBrand}>
          <span className={styles.brandIcon}>FM</span>
          <span className={styles.topBrandText}>Folder Manager</span>
        </div>
        <div className={styles.windowControls}>
          <button className={styles.windowControlButton} type="button" onClick={() => window.electron?.minimizeWindow?.()}>
            <img
              src="/icons/minimize.png"
              alt=""
              className={`${styles.windowControlIcon} ${styles.windowControlIconMinimize}`}
            />
          </button>
          <button
            className={styles.windowControlButton}
            type="button"
            onClick={() => window.electron?.toggleMaximizeWindow?.()}
          >
            <img
              src="/icons/maximize.png"
              alt=""
              className={`${styles.windowControlIcon} ${styles.windowControlIconMaximize}`}
            />
          </button>
          <button
            className={`${styles.windowControlButton} ${styles.windowControlButtonClose}`}
            type="button"
            onClick={() => window.electron?.closeWindow?.()}
          >
            <img src="/icons/close.png" alt="" className={`${styles.windowControlIcon} ${styles.windowControlIconClose}`} />
          </button>
        </div>
      </header>

      <div className={workspaceBodyClass}>
        <Sidebar
          theme={theme}
          onThemeChange={setTheme}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        <main className={styles.main}>
          <section className={styles.projectTabsBar} aria-label="Open project tabs">
            <div className={styles.projectTabs}>
              {tabs.map((tab, index) => {
                const tabProject = tab.projectId ? projects.find((project) => project.id === tab.projectId) ?? null : null;
                const tabTitle = tabProject?.name ?? 'New tab';
                const isOpening = openingTabIds.includes(tab.id);
                const isClosing = closingTabIds.includes(tab.id);
                const isActive = tab.id === activeTabId;
                const isFirst = index === 0;
                const isLast = index === tabs.length - 1;
                const nextTab = index < tabs.length - 1 ? tabs[index + 1] : null;
                const showLeadingDivider = isFirst && !isActive;
                const showMiddleDivider = Boolean(nextTab) && !isActive && nextTab?.id !== activeTabId;
                const showTrailingDivider = isLast && !isActive;
                return (
                  <div key={tab.id} className={styles.projectTabItem}>
                    <span
                      className={`${styles.projectTabDivider} ${styles.projectTabDividerLeft} ${showLeadingDivider ? styles.projectTabDividerVisible : ''}`}
                      aria-hidden="true"
                    />
                    <div
                      className={`${styles.projectTab} ${isActive ? styles.projectTabActive : ''} ${isOpening ? styles.projectTabOpening : ''} ${isClosing ? styles.projectTabClosing : ''}`}
                    >
                      <button type="button" className={styles.projectTabSelect} onClick={() => handleSelectTab(tab.id)}>
                        <span className={styles.projectTabName}>{tabTitle}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.projectTabClose}
                        aria-label={`Close ${tabTitle} tab`}
                        disabled={isClosing}
                        onClick={() => handleCloseTab(tab.id)}
                      >
                        x
                      </button>
                    </div>
                    <span
                      className={`${styles.projectTabDivider} ${styles.projectTabDividerRight} ${showMiddleDivider || showTrailingDivider ? styles.projectTabDividerVisible : ''}`}
                      aria-hidden="true"
                    />
                  </div>
                );
              })}
              <button type="button" className={styles.projectTabAdd} aria-label="New tab" onClick={handleAddTab}>
                +
              </button>
            </div>
            <div className={styles.projectTabsActions}>
              <button
                type="button"
                className={styles.projectTabsCloseAll}
                aria-label="Close all tabs"
                title="Close all tabs"
                onClick={handleCloseAllTabs}
              >
                ×
              </button>
            </div>
          </section>

          {activeSection === 'plugins' ? (
            <PluginsView />
          ) : activeSection === 'settings' ? (
            <section className={styles.pluginsView}>
              <header className={styles.contentHeader}>
                <h1>Settings</h1>
                <p>Default settings for new and unconfigured instances.</p>
              </header>
              <div className={styles.settingsPanel}>
                <label className={styles.fieldLabel}>
                  <span>Default terminal</span>
                  <select
                    value={defaultTerminal}
                    onChange={(event) => setDefaultTerminal(event.target.value as TerminalProfile)}
                  >
                    <option value="git-bash">Git Bash</option>
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">CMD</option>
                  </select>
                </label>

                <label className={styles.fieldLabel}>
                  <span>Default IDE</span>
                  <select value={defaultIde} onChange={(event) => setDefaultIde(event.target.value as IdeProfile)}>
                    <option value="vscode">VS Code</option>
                    <option value="cursor">Cursor</option>
                  </select>
                </label>

                <label className={`${styles.fieldLabel} ${styles.fieldLabelToggle}`}>
                  <span>Start app with Windows</span>
                  <span className={styles.toggleSwitch}>
                    <input
                      className={styles.toggleInput}
                      type="checkbox"
                      checked={appStartWithWindows}
                      onChange={(event) => {
                        void handleAppStartupToggle(event.target.checked);
                      }}
                      disabled={startupSettingsBusy}
                    />
                    <span className={styles.toggleTrack} aria-hidden="true" />
                  </span>
                </label>

                {startupSettingsError ? (
                  <p className={`${styles.createStatus} ${styles.createStatusError}`}>{startupSettingsError}</p>
                ) : null}
              </div>
            </section>
          ) : !selectedProject ? (
            <>
              <ProjectsView
                viewMode={viewMode}
                search={search}
                projects={filteredProjects}
                onSearchChange={setSearch}
                onViewChange={setViewMode}
                onCreateToggle={() => {
                  void handleCreateClick();
                }}
                onOpenProject={handleOpenProject}
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
              filtersOpen={filtersOpen}
              statusFilter={statusFilter}
              tagFilter={tagFilter}
              terminalProfiles={terminalProfiles}
              ideProfiles={ideProfiles}
              createInstanceOpen={createInstanceOpen}
              createInstanceName={newInstanceName}
              createInstanceTag={newInstanceTag}
              createInstancePath={newInstancePath}
              createInstanceStatus={createInstanceStatus}
              createInstanceError={createInstanceError}
              onBack={handleBackToProjectsList}
              onInstanceSearchChange={setInstanceSearch}
              onFiltersOpenChange={setFiltersOpen}
              onStatusFilterChange={setStatusFilter}
              onTagFilterChange={setTagFilter}
              onTerminalProfileChange={handleTerminalProfileChange}
              onIdeProfileChange={handleIdeProfileChange}
              onToggleInstanceRun={handleToggleInstanceRun}
              onDeleteInstance={handleDeleteInstance}
              onUpdateInstanceLocalUrl={handleUpdateInstanceLocalUrl}
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
              defaultTerminal={defaultTerminal}
              defaultIde={defaultIde}
            />
          )}

          <button
            type="button"
            className={`${styles.updateBadge} ${canClickUpdateBadge ? styles.updateBadgeAction : ''}`}
            onClick={() => {
              if (canClickUpdateBadge) {
                void handleUpdateAction();
              }
            }}
            disabled={!canClickUpdateBadge || updateBusy}
            title={updateState.status === 'downloaded' ? 'Install update and restart' : 'Check for updates'}
          >
            {updateActionLabel}
          </button>
        </main>
      </div>
    </div>
  );
}
