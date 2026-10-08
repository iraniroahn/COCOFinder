// Temporary probe: inspect data sources from a GitHub runner (removed after use).
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "en-IN" });
const page = await ctx.newPage();

for (const url of ["https://iocl.com/xp100", "https://locator.iocl.com/robots.txt", "https://locator.iocl.com/sitemap.xml"]) {
  console.log("=== ", url);
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    console.log("status", res && res.status(), "final", page.url());
    await page.waitForTimeout(8000);
    const html = await page.content();
    console.log("len", html.length);
    fs.writeFileSync(url.replace(/\W+/g, "_") + ".html", html);
    if (url.includes("xp100")) {
      const tables = await page.$$eval("table", (ts) => ts.map((t) => ({
        rows: t.rows.length,
        head: t.rows[0] && t.rows[0].innerText.slice(0, 400),
        r1: t.rows[1] && t.rows[1].innerText.slice(0, 400),
        r2: t.rows[2] && t.rows[2].innerText.slice(0, 400),
        last: t.rows[t.rows.length - 1] && t.rows[t.rows.length - 1].innerText.slice(0, 400),
      })));
      console.log(JSON.stringify(tables, null, 1));
      const links = await page.$$eval("a", (as) => as.map((a) => a.href).filter((h) => /xlsx?|csv|pdf|xp100/i.test(h)));
      console.log("links", links.slice(0, 40));
      const i = html.toLowerCase().indexOf("list of xp100");
      console.log(html.slice(i, i + 1500));
    } else {
      console.log((await page.innerText("body")).slice(0, 3000));
    }
  } catch (e) {
    console.log("ERR", e.message);
  }
}
await browser.close();
