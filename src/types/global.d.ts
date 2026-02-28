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
      onInstanceExit?: (handler: (instanceId: string) => void) => () => void;
      startPlugin?: (pluginId: string) => Promise<PluginRunResult>;
      stopPlugin?: (pluginId: string) => Promise<PluginRunResult>;
      getPluginStatus?: (pluginId: string) => Promise<PluginRunResult>;
      onPluginLog?: (handler: (event: PluginLogEvent) => void) => () => void;
      onPluginExit?: (handler: (event: PluginExitEvent) => void) => () => void;
    };
  }
}
