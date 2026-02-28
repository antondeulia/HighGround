export {};

declare global {
  type TerminalProfile = 'git-bash' | 'powershell' | 'cmd';
  type IdeProfile = 'vscode' | 'cursor';

  interface InstanceRunResult {
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
    };
  }
}
