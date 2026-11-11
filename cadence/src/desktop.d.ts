export {};

declare global {
  interface Window {
    cadence?: {
      isDesktop: boolean;
      platform: string;
      saveProject: (payload: { json: string; name: string; path: string | null }) => Promise<{ canceled: boolean; path?: string }>;
      openProject: () => Promise<{ canceled: boolean; path?: string; json?: string }>;
      saveBinary: (payload: {
        base64: string;
        defaultName: string;
        filters: { name: string; extensions: string[] }[];
      }) => Promise<{ canceled: boolean; path?: string }>;
      windowAction: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      setMenu: (tree: unknown) => Promise<void>;
      onMenuCommand: (handler: (command: string) => void) => () => void;
      openExternal: (url: string) => Promise<void>;
      appInfo: () => Promise<{ platform: string; version: string; electron: string }>;
    };
  }
}
