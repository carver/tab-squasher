// The Outbox lives in storage.local, so it survives the background script
// being unloaded and the browser restarting.

import type { Backend, Outbox } from "./outbox";

const OUTBOX_KEY = "outbox";

export async function readOutbox(): Promise<Outbox> {
  const stored = await browser.storage.local.get(OUTBOX_KEY);
  return (stored[OUTBOX_KEY] as Outbox | undefined) ?? [];
}

export const storageBackend: Backend = {
  read: readOutbox,
  write: (outbox) => browser.storage.local.set({ [OUTBOX_KEY]: outbox }),
};

export function onOutboxChange(listener: (outbox: Outbox) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[OUTBOX_KEY];
    if (area === "local" && change) listener((change.newValue as Outbox | undefined) ?? []);
  });
}
