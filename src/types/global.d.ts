export {};

declare global {
  type TerminalProfile = 'git-bash' | 'powershell' | 'cmd';
  type IdeProfile = 'vscode' | 'cursor';

  interface InstanceRunResult {
    ok: boolean;
    error?: string;
  }

  type PluginStatus = 'running' | 'stopped';

  interface PluginRunResult {
    ok: boolean;
    status?: PluginStatus;
    error?: string;
  }

  interface PluginLogEvent {
    pluginId: string;
    timestamp: string;
    line: string;
  }

  interface PluginExitEvent {
    pluginId: string;
    ok: boolean;
    error?: string;
  }

  interface StartupSettings {
    appStartWithWindows: boolean;
    pluginStartWithWindows: Record<string, boolean>;
  }

  interface StartupSettingsResult {
    ok: boolean;
    settings?: StartupSettings;
    error?: string;
  }

  type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'not-available'
    | 'error';

  interface AppUpdateState {
    status: UpdateStatus;
    currentVersion: string;
    availableVersion?: string | null;
    downloadPercent?: number | null;
    error?: string | null;
    canCheck?: boolean;
    canInstall?: boolean;
  }

  interface AppVersionResult {
    ok: boolean;
    version?: string;
    error?: string;
  }

  interface AppUpdateResult {
    ok: boolean;
    error?: string;
    skipped?: boolean;
  }

  interface Window {
    electron?: {
      platform: string;
      selectFolder?: (defaultPath?: string) => Promise<string | null>;
      minimizeWindow?: () => void;
      toggleMaximizeWindow?: () => void;
      closeWindow?: () => void;
      startInstance?: (payload: {
        instanceId: string;
        instancePath: string;
        command: string;
      }) => Promise<InstanceRunResult>;
      stopInstance?: (instanceId: string) => Promise<InstanceRunResult>;
      openInstanceTerminal?: (
        instancePath: string,
        terminal?: TerminalProfile
      ) => Promise<InstanceRunResult>;
      openInstanceVsCode?: (instancePath: string, ide?: IdeProfile) => Promise<InstanceRunResult>;
      closeAllEditors?: (ide?: IdeProfile) => Promise<InstanceRunResult>;
      startEditor?: (ide?: IdeProfile) => Promise<InstanceRunResult>;
      onInstanceExit?: (handler: (instanceId: string) => void) => () => void;
      startPlugin?: (pluginId: string) => Promise<PluginRunResult>;
      stopPlugin?: (pluginId: string) => Promise<PluginRunResult>;
      getPluginStatus?: (pluginId: string) => Promise<PluginRunResult>;
      getStartupSettings?: () => Promise<StartupSettingsResult>;
      setAppStartup?: (enabled: boolean) => Promise<StartupSettingsResult>;
      setPluginStartup?: (
        pluginId: string,
        enabled: boolean
      ) => Promise<StartupSettingsResult>;
      getAppVersion?: () => Promise<AppVersionResult>;
      getUpdateStatus?: () => Promise<AppUpdateState & { ok: boolean }>;
      checkForUpdates?: () => Promise<AppUpdateResult>;
      installUpdate?: () => Promise<AppUpdateResult>;
      onPluginLog?: (handler: (event: PluginLogEvent) => void) => () => void;
      onPluginExit?: (handler: (event: PluginExitEvent) => void) => () => void;
      onUpdateStatus?: (handler: (event: AppUpdateState) => void) => () => void;
    };
  }
}
