import type { Tone } from "../lib/present";
import { checkServer, parseServerUrl } from "../lib/server";
import { loadServerUrl, saveServerUrl } from "../lib/settings";

const form = document.querySelector<HTMLFormElement>("#form")!;
const input = document.querySelector<HTMLInputElement>("#server-url")!;
const status = document.querySelector<HTMLElement>("#status")!;

function show(message: string, tone: Tone): void {
  status.textContent = message;
  status.className = tone;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const parsed = parseServerUrl(input.value);
  if (!parsed.ok) {
    show(parsed.problem, "bad");
    return;
  }
  input.value = parsed.url;
  await saveServerUrl(parsed.url);
  show("Saved. Checking the server...", "muted");
  const health = await checkServer(parsed.url);
  if (health.ok) {
    show(`Saved. Server ${health.version} is reachable.`, "good");
  } else {
    show(`Saved, but: ${health.problem}`, "bad");
  }
});

void loadServerUrl().then((url) => {
  if (url) input.value = url;
});
