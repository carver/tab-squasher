import { By, until, type WebDriver } from "selenium-webdriver";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  openPage,
  removeTempDirs,
  openPopup,
  selectText,
  setServerUrl,
  SparkServer,
  startFirefox,
  startSite,
  clickAndWaitForTabToClose,
} from "./harness";

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
  removeTempDirs();
});

beforeEach(async () => {
  await server.up().catch(() => undefined);
});

async function text(selector: string): Promise<string> {
  return driver.findElement(By.css(selector)).getText();
}

async function value(selector: string): Promise<string | null> {
  return driver.findElement(By.css(selector)).getAttribute("value");
}

async function waitForStatus(pattern: RegExp): Promise<string> {
  const status = await driver.findElement(By.css("#status"));
  await driver.wait(async () => pattern.test(await status.getText()), 10_000);
  return status.getText();
}

function outboxRows(containing: string) {
  return driver.findElements(By.xpath(`//ul[@id='outbox-list']/li[contains(., '${containing}')]`));
}

async function openTabIds(): Promise<number> {
  return (await driver.getAllWindowHandles()).length;
}

describe("settings", () => {
  it("saves the server address and reports the server reachable", async () => {
    expect(await setServerUrl(driver, `${server.url}/`)).toMatch(/Server 0\.1\.0 is reachable/);
  });

  it("refuses plain http to anything but this machine", async () => {
    expect(await setServerUrl(driver, "http://laptop.example.ts.net:3816")).toBe(
      "Use https:// (plain http:// is only allowed for localhost)",
    );
  });
});

describe("the server notice", () => {
  it("stays hidden while the server answers", async () => {
    await openPopup(driver, await openPage(driver, `${site.url}/article`));
    await driver.sleep(500);
    expect(await driver.findElement(By.css("#server-notice")).isDisplayed()).toBe(false);
  });

  it("says Sparks will wait when the server can't be reached", async () => {
    await server.down();
    await openPopup(driver, await openPage(driver, `${site.url}/article`));
    const notice = await driver.findElement(By.css("#server-notice"));
    await driver.wait(() => notice.isDisplayed(), 10_000);
    expect(await notice.getText()).toContain("Couldn't reach the server. Is this device on the tailnet? Sparks will wait in the Outbox.");
  });
});

describe("sending a Spark", () => {
  it("prefills the Quote from the page selection and sends the Spark to the Inbox", async () => {
    const tabId = await openPage(driver, `${site.url}/article`);
    await selectText(driver, "#quote");
    await openPopup(driver, tabId);

    expect(await text("#source")).toBe("Change data capture · 127.0.0.1");
    expect(await value("#quote")).toBe("Debezium records all row-level changes in your database.");
    await driver.findElement(By.css("#note")).sendKeys("Debezium does CDC");

    // Opened as a tab (the Android route), a sent Spark closes the popup tab.
    await clickAndWaitForTabToClose(driver, "#send");
    expect(server.inbox().at(-1)).toMatchObject({
      note: "Debezium does CDC",
      quote: "Debezium records all row-level changes in your database.",
      selection: "Debezium records all row-level changes in your database.",
      source: { url: expect.stringMatching(`^${site.url}/article\\?page=`), title: "Change data capture", video_seconds: null },
    });
  });

  it("records where a video was when the Spark was made", async () => {
    const tabId = await openPage(driver, `${site.url}/video`);
    const videoState = () =>
      driver.executeScript(`const v = document.querySelector("#v"); return [v.readyState, v.currentTime];`) as Promise<
        [number, number]
      >;
    await driver.wait(async () => (await videoState())[0] >= 1, 5000, "video metadata never loaded");
    await driver.executeScript(`document.querySelector("#v").currentTime = 34.5;`);
    await driver.wait(async () => (await videoState())[1] === 34.5, 5000, "seek never landed");
    await openPopup(driver, tabId);

    expect(await text("#source")).toBe("A talk on backpressure · 127.0.0.1 · 0:34");
    await driver.findElement(By.css("#note")).sendKeys("Backpressure point");
    await clickAndWaitForTabToClose(driver, "#send");

    expect(server.inbox().at(-1)).toMatchObject({ note: "Backpressure point", source: { video_seconds: 34.5 } });
  });

  it("won't send without a Note or a Quote, and says why", async () => {
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);

    expect(await text("#problem")).toBe("Add a Note or a Quote");
    expect(await driver.findElement(By.css("#send")).isEnabled()).toBe(false);
  });

  it("closes the page tab and the popup with Send & close", async () => {
    const before = server.inbox().length;
    const tabsBefore = await openTabIds();
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);
    await driver.findElement(By.css("#note")).sendKeys("Close me");

    await driver.findElement(By.css("#send-close")).click();

    await driver.wait(async () => (await openTabIds()) === tabsBefore, 10_000);
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]!);
    await driver.wait(() => server.inbox().length === before + 1, 10_000);
    expect(server.inbox().at(-1)).toMatchObject({ note: "Close me" });
  });
});

describe("the Outbox", () => {
  it("keeps a Spark while the server is down and sends it once the server is back", async () => {
    const before = server.inbox().length;
    await server.down();
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);
    await driver.findElement(By.css("#note")).sendKeys("Sent while offline");
    await driver.findElement(By.css("#send")).click();

    expect(await waitForStatus(/Outbox/)).toBe("Couldn't reach the server. Saved in the Outbox; it will retry.");
    await driver.wait(until.elementLocated(By.css("#outbox-list li")), 5000);
    expect(await text("#outbox-list li")).toContain("Sent while offline");

    await server.up();
    await driver.navigate().refresh();

    await driver.wait(() => server.inbox().length === before + 1, 10_000);
    expect(server.inbox().at(-1)).toMatchObject({ note: "Sent while offline" });
    await driver.wait(async () => (await outboxRows("Sent while offline")).length === 0, 5000);
  });

  it("keeps a Spark from Send & close while the server is down, and sends it later", async () => {
    const before = server.inbox().length;
    await server.down();
    const tabsBefore = await openTabIds();
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);
    await driver.findElement(By.css("#note")).sendKeys("Closed while offline");

    await driver.findElement(By.css("#send-close")).click();

    await driver.wait(async () => (await openTabIds()) === tabsBefore, 10_000);
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]!);
    await openPopup(driver, await openPage(driver, `${site.url}/article`));
    await driver.wait(async () => (await outboxRows("Closed while offline")).length === 1, 5000);

    await server.up();
    await driver.navigate().refresh();
    await driver.wait(() => server.inbox().length === before + 1, 10_000);
    expect(server.inbox().at(-1)).toMatchObject({ note: "Closed while offline" });
  });

  it("lets a waiting Spark be edited before it is sent", async () => {
    await server.down();
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);
    await driver.findElement(By.css("#note")).sendKeys("Frist draft");
    await driver.findElement(By.css("#send")).click();
    await waitForStatus(/Outbox/);

    await driver.wait(async () => (await outboxRows("Frist draft")).length === 1, 5000);
    await (await outboxRows("Frist draft"))[0]!.findElement(By.xpath(".//button[text()='Edit']")).click();
    const note = await driver.findElement(By.css("#note"));
    expect(await note.getAttribute("value")).toBe("Frist draft");
    await note.clear();
    await note.sendKeys("First draft");
    await server.up();
    await clickAndWaitForTabToClose(driver, "#send");

    expect(server.inbox().at(-1)).toMatchObject({ note: "First draft" });
    expect(server.inbox().filter((spark) => spark.note === "Frist draft")).toEqual([]);
  });

  it("deletes a waiting Spark after asking twice", async () => {
    await server.down();
    const tabId = await openPage(driver, `${site.url}/article`);
    await openPopup(driver, tabId);
    await driver.findElement(By.css("#note")).sendKeys("Never mind");
    await driver.findElement(By.css("#send")).click();
    await waitForStatus(/Outbox/);
    await driver.wait(async () => (await outboxRows("Never mind")).length === 1, 5000);
    const row = (await outboxRows("Never mind"))[0]!;

    await row.findElement(By.xpath(".//button[text()='Delete']")).click();
    await row.findElement(By.xpath(".//button[text()='Really delete?']")).click();

    await driver.wait(async () => (await outboxRows("Never mind")).length === 0, 5000);
    await server.up();
    expect(server.inbox().filter((spark) => spark.note === "Never mind")).toEqual([]);
  });
});
