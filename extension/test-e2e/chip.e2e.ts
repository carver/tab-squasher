// The Android selection chip. It only registers on Android, so here it's
// injected by hand; everything after that is the real code path.

import { By, type WebDriver } from "selenium-webdriver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { injectContentScript, openPage, selectText, setServerUrl, SparkServer, startFirefox, startSite } from "./harness";

let driver: WebDriver;
let server: SparkServer;
let site: Awaited<ReturnType<typeof startSite>>;

beforeAll(async () => {
  [server, site, driver] = await Promise.all([SparkServer.start(), startSite(), startFirefox()]);
  await setServerUrl(driver, server.url);
});

afterAll(async () => {
  await driver?.quit();
  await server?.down();
  await site?.close();
});

/** The chip is in a closed shadow root, so it's found by where it sits on screen. */
async function tapChip(): Promise<void> {
  const [width, height] = (await driver.executeScript("return [innerWidth, innerHeight]")) as [number, number];
  await driver
    .actions()
    .move({ x: width - 40, y: height - 100 })
    .press()
    .release()
    .perform();
}

async function chipShown(): Promise<boolean> {
  return (await driver.executeScript("return document.querySelector('tab-squasher-chip') !== null")) as boolean;
}

describe("the selection chip", () => {
  it("appears only while text is selected", async () => {
    const tabId = await openPage(driver, `${site.url}/article`);
    await injectContentScript(driver, tabId, "chip.js");

    expect(await chipShown()).toBe(false);
    await selectText(driver, "#quote");
    await driver.wait(chipShown, 2000);
    await driver.executeScript("getSelection().removeAllRanges()");
    await driver.wait(async () => !(await chipShown()), 2000);
  });

  it("opens the Spark tab for the page, with the selection as the Quote", async () => {
    const tabId = await openPage(driver, `${site.url}/article`);
    await injectContentScript(driver, tabId, "chip.js");
    await selectText(driver, "#quote");
    await driver.wait(chipShown, 2000);
    const before = new Set(await driver.getAllWindowHandles());

    await tapChip();

    let sparkTab: string | undefined;
    await driver.wait(async () => {
      sparkTab = (await driver.getAllWindowHandles()).find((handle) => !before.has(handle));
      return sparkTab !== undefined;
    }, 5000);
    await driver.switchTo().window(sparkTab!);
    await driver.wait(async () => (await driver.findElement(By.css("#source")).getText()) !== "", 5000);
    expect(await driver.getCurrentUrl()).toMatch(new RegExp(`/popup\\.html\\?tab=${tabId}$`));
    expect(await driver.findElement(By.css("#quote")).getAttribute("value")).toBe(
      "Debezium records all row-level changes in your database.",
    );
  });
});
