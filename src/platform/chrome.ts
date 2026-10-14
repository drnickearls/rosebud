/** `chrome` for extension scripts, typed just far enough for what Rosebud calls (no @types/chrome dependency). */
interface ChromeApi {
  runtime: {
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
  };
  action: {
    onClicked: { addListener(listener: () => void): void };
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(key: string): Promise<void>;
    };
  };
}

export const chromeApi = (globalThis as unknown as { chrome: ChromeApi }).chrome;
