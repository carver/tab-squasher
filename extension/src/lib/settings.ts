// Per-device settings in storage.local.

import { type Destination, isDestination } from "./spark";

const SERVER_URL_KEY = "serverUrl";
const DESTINATION_KEY = "destination";
const DEFAULT_DESTINATION: Destination = "anki";

export async function loadServerUrl(): Promise<string | null> {
  const stored = await browser.storage.local.get(SERVER_URL_KEY);
  const url = stored[SERVER_URL_KEY];
  return typeof url === "string" ? url : null;
}

export async function saveServerUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [SERVER_URL_KEY]: url });
}

/** The Destination picked last in the popup, which new Sparks start with. */
export async function loadDestination(): Promise<Destination> {
  const stored = await browser.storage.local.get(DESTINATION_KEY);
  const destination = stored[DESTINATION_KEY];
  return isDestination(destination) ? destination : DEFAULT_DESTINATION;
}

export async function saveDestination(destination: Destination): Promise<void> {
  await browser.storage.local.set({ [DESTINATION_KEY]: destination });
}
