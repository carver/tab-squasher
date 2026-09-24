// Real Firefox (headless, via geckodriver) with the built extension
// installed, a real tab-squasher server on a temp Inbox, and a local site
// to Spark from. Paths default to what install.sh downloads.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { Builder, By, until, type WebDriver } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const EXTENSION_DIR = join(import.meta.dirname, "..");
const SERVER_DIR = join(EXTENSION_DIR, "../server");
const CACHE = join(homedir(), ".cache/tab-squasher");
const FIREFOX_BIN = process.env.FIREFOX_BIN ?? join(CACHE, "firefox/firefox");
const GECKODRIVER = process.env.GECKODRIVER ?? join(CACHE, "geckodriver");
const EXTENSION_ID = "tab-squasher@carver";
/** Fixed so tests can open moz-extension:// pages directly. */
const EXTENSION_UUID = "6f1c7e0a-2b1d-4c1e-9a3e-5d2f8b7c4e10";
export const EXTENSION_ORIGIN = `moz-extension://${EXTENSION_UUID}`;

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Deletes every temp dir the harness made. Call from afterAll. */
export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** The tab-squasher server binary, restartable on the same port and Inbox. */
export class SparkServer {
  private process: ChildProcess | null = null;
  readonly inboxDir = join(tempDir("tab-squasher-e2e-"), "inbox");

  private constructor(readonly port: number) {}

  static async start(): Promise<SparkServer> {
    execFileSync("cargo", ["build", "-q"], { cwd: SERVER_DIR, stdio: "inherit" });
    const server = new SparkServer(await freePort());
    await server.up();
    return server;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Starts the server unless it's already running. */
  async up(): Promise<void> {
    if (this.process && this.process.exitCode === null) return;
    this.process = spawn(join(SERVER_DIR, "target/debug/tab-squasher-server"), {
      env: { ...process.env, TAB_SQUASHER_INBOX_DIR: this.inboxDir, TAB_SQUASHER_PORT: String(this.port) },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      if (await fetch(`${this.url}/health`).then((r) => r.ok, () => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("server did not start");
  }

  async down(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGTERM");
    });
  }

  /** Every Spark in the Inbox, across year files. */
  inbox(): Record<string, unknown>[] {
    let files: string[];
    try {
      files = readdirSync(this.inboxDir).filter((name) => name.endsWith(".jsonl"));
    } catch {
      return [];
    }
    return files.flatMap((name) =>
      readFileSync(join(this.inboxDir, name), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
  }
}

/** Pages to Spark from: /article, and /video with a minute of silence to seek in. */
export async function startSite(): Promise<{ url: string; close: () => Promise<void> }> {
  const pages: Record<string, [string, string | Buffer]> = {
    "/article": [
      "text/html",
      `<!doctype html><title>Change data capture</title>
       <p id="quote">Debezium records all row-level changes in your database.</p>
       <p>Other text on the page.</p>`,
    ],
    // Rules real sites ship that catch a stray element: Reddit-style web
    // component sites hide undefined custom elements until they load.
    "/hostile": [
      "text/html",
      `<!doctype html><title>Hostile styles</title>
       <style>
         :not(:defined) { visibility: hidden !important; }
         body ~ * { display: none !important; }
       </style>
       <p id="quote">Debezium records all row-level changes in your database.</p>`,
    ],
    "/video": [
      "text/html",
      `<!doctype html><title>A talk on backpressure</title>
       <video id="v" src="/silence.wav" preload="auto"></video>`,
    ],
    "/silence.wav": ["audio/wav", silentWav(60)],
  };
  const site: Server = createServer((request, response) => {
    const page = pages[new URL(request.url ?? "/", "http://site").pathname];
    if (!page) return void response.writeHead(404).end();
    const [type, body] = page;
    // Firefox only seeks media over HTTP when the server honours Range.
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
    if (!range) return void response.writeHead(200, { "content-type": type, "accept-ranges": "bytes" }).end(body);
    const bytes = Buffer.from(body);
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : bytes.length - 1;
    response
      .writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${bytes.length}` })
      .end(bytes.subarray(start, end + 1));
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const { port } = site.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => site.close(() => resolve())) };
}

function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds, 128);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function startFirefox(): Promise<WebDriver> {
  execFileSync("npm", ["run", "-s", "build"], { cwd: EXTENSION_DIR, stdio: "inherit" });
  const artifacts = tempDir("tab-squasher-xpi-");
  execFileSync("npx", ["web-ext", "build", "--source-dir", "dist", "--artifacts-dir", artifacts, "--filename", "e2e.zip"], {
    cwd: EXTENSION_DIR,
    stdio: "ignore",
  });
  const options = new firefox.Options()
    .setBinary(FIREFOX_BIN)
    .addArguments("-headless")
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }))
    .setPreference("media.autoplay.default", 0);
  const driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    // System access lets openExtensionPage use Firefox's chrome context.
    .setFirefoxService(new firefox.ServiceBuilder(GECKODRIVER).addArguments("--allow-system-access"))
    .build();
  await (driver as firefox.Driver).installAddon(join(artifacts, "e2e.zip"), true);
  return driver;
}

/**
 * Opens one of the extension's pages in a new tab and switches to it.
 * WebDriver refuses to navigate to moz-extension:// URLs, so the tab is
 * opened from Firefox's own (chrome) context instead.
 */
export async function openExtensionPage(driver: WebDriver, path: string): Promise<void> {
  await switchToLiveWindow(driver);
  const before = new Set(await driver.getAllWindowHandles());
  const ff = driver as firefox.Driver;
  await ff.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `gBrowser.selectedTab = gBrowser.addTab(arguments[0], {
       triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
     });`,
    `${EXTENSION_ORIGIN}/${path}`,
  );
  await ff.setContext(firefox.Context.CONTENT);
  let opened: string | undefined;
  await driver.wait(async () => {
    opened = (await driver.getAllWindowHandles()).find((handle) => !before.has(handle));
    return opened !== undefined;
  }, 5000);
  await driver.switchTo().window(opened!);
  await driver.wait(async () => (await driver.executeScript("return document.readyState")) === "complete", 5000);
}

/** After a tab closes itself, WebDriver is left pointing at nothing. */
export async function switchToLiveWindow(driver: WebDriver): Promise<void> {
  const handles = await driver.getAllWindowHandles();
  const current = await driver.getWindowHandle().catch(() => null);
  if (current === null || !handles.includes(current)) await driver.switchTo().window(handles[0]!);
}

/** Clicks `selector`, waits for the current tab to close itself, then switches to one still open. */
export async function clickAndWaitForTabToClose(driver: WebDriver, selector: string): Promise<void> {
  const current = await driver.getWindowHandle();
  await driver.findElement(By.css(selector)).click();
  await driver.wait(async () => !(await driver.getAllWindowHandles()).includes(current), 10_000);
  await switchToLiveWindow(driver);
}

let pagesOpened = 0;

/**
 * Opens `url` in a new tab and returns its WebExtension tab id. A counter
 * is added to the query string, so each call gets a tab no other test has
 * touched.
 */
export async function openPage(driver: WebDriver, baseUrl: string): Promise<number> {
  const url = `${baseUrl}?page=${++pagesOpened}`;
  await switchToLiveWindow(driver);
  await driver.switchTo().newWindow("tab");
  await driver.get(url);
  await driver.wait(async () => (await driver.executeScript("return document.readyState")) === "complete", 5000);
  const handle = await driver.getWindowHandle();
  await openExtensionPage(driver, "options.html");
  const id: unknown = (await driver.executeAsyncScript(
    `const [url, done] = arguments;
     browser.tabs.query({}).then(
       (tabs) => done(tabs.find((tab) => tab.url === url)?.id ?? "no tab has " + url),
       (error) => done(String(error)),
     );`,
    url,
  ));
  await driver.close();
  await driver.switchTo().window(handle);
  if (typeof id !== "number") throw new Error(`finding the tab: ${String(id)}`);
  return id;
}

/** Selects the text of the element matching `selector` in the current tab. */
export async function selectText(driver: WebDriver, selector: string): Promise<void> {
  await driver.executeScript(
    `const range = document.createRange();
     range.selectNodeContents(document.querySelector(arguments[0]));
     getSelection().removeAllRanges();
     getSelection().addRange(range);`,
    selector,
  );
}

/** Opens the popup as a tab for the page tab `tabId`, the way the Android chip does. */
export async function openPopup(driver: WebDriver, tabId: number): Promise<void> {
  await openExtensionPage(driver, `popup.html?tab=${tabId}`);
  await driver.wait(until.elementLocated(By.css("#source:not(:empty)")), 5000);
}

export async function setServerUrl(driver: WebDriver, url: string): Promise<string> {
  await openExtensionPage(driver, "options.html");
  const input = await driver.findElement(By.css("#server-url"));
  await input.clear();
  await input.sendKeys(url);
  await driver.findElement(By.css("button[type=submit]")).click();
  const status = await driver.findElement(By.css("#status"));
  await driver.wait(async () => /reachable|but:|Use |Enter |Leave /.test(await status.getText()), 10_000);
  const text = await status.getText();
  await driver.close();
  await driver.switchTo().window((await driver.getAllWindowHandles())[0]!);
  return text;
}

/** Runs `files` in the page tab `tabId` the way a registered content script would. */
export async function injectContentScript(driver: WebDriver, tabId: number, file: string): Promise<void> {
  const handle = await driver.getWindowHandle();
  await openExtensionPage(driver, "options.html");
  const result: unknown = await driver.executeAsyncScript(
    `const [tabId, file, done] = arguments;
     browser.scripting.executeScript({ target: { tabId }, files: [file] }).then(() => done("ok"), (e) => done(String(e)));`,
    tabId,
    file,
  );
  await driver.close();
  await driver.switchTo().window(handle);
  if (result !== "ok") throw new Error(`injecting ${file}: ${String(result)}`);
}
