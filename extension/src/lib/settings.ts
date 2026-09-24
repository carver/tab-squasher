// Per-device settings in storage.local.

const SERVER_URL_KEY = "serverUrl";

export async function loadServerUrl(): Promise<string | null> {
  const stored = await browser.storage.local.get(SERVER_URL_KEY);
  const url = stored[SERVER_URL_KEY];
  return typeof url === "string" ? url : null;
}

export async function saveServerUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [SERVER_URL_KEY]: url });
}
