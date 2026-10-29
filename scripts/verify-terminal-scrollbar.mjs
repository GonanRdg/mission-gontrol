import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "..");
const client = resolve(root, "dist/client");
const assets = await readdir(resolve(client, "assets"));
const asset = (pattern) => {
  const name = assets.find((value) => pattern.test(value));
  if (!name) throw new Error(`Build the web client first; missing ${pattern}`);
  return `/assets/${name}`;
};
const css = asset(/^index-.*\.css$/);
const xterm = asset(/^xterm-.*\.js$/);
const fit = asset(/^addon-fit-.*\.js$/);
const helper = await build({
  entryPoints: [resolve(root, "src/lib/terminal-scrollbar.ts")],
  bundle: true, write: false, platform: "browser", format: "esm",
});
const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("content-type", "text/html");
    response.end(`<link rel="stylesheet" href="${css}">
      <div id="pane" style="position:relative;width:600px;height:450px;margin:20px;overflow:hidden">
        <div id="terminal" style="position:absolute;inset:0"></div>
      </div><script type="module">
        import { Terminal } from '${xterm}';
        import { FitAddon } from '${fit}';
        import { attachTerminalScrollbar } from '/helper.js';
        window.term = new Terminal({scrollback: 5000});
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(document.querySelector('#terminal'));
        attachTerminalScrollbar(term);
        fit.fit();
        window.ready = true;
      </script>`);
    return;
  }
  if (request.url === "/helper.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(helper.outputFiles[0].text);
    return;
  }
  try {
    const file = resolve(client, `.${new URL(request.url, "http://localhost").pathname}`);
    if (!file.startsWith(`${client}/`)) throw new Error("Invalid asset path");
    response.setHeader("content-type", file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready);
  const write = (data) => page.evaluate(async (value) => {
    await new Promise((done) => term.write(value, done));
    await new Promise(requestAnimationFrame);
  }, data);
  const state = () => page.evaluate(() => {
    const slider = document.querySelector(".scrollbar.vertical > .slider");
    const rect = slider.getBoundingClientRect();
    const bar = getComputedStyle(slider.parentElement);
    return {
      visible: getComputedStyle(slider).visibility === "visible" && bar.opacity !== "0",
      history: term.buffer.active.baseY, viewport: term.buffer.active.viewportY,
      rect: rect.toJSON(),
      hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === slider,
      pageScroll: window.scrollY,
    };
  });
  if ((await state()).visible) throw new Error("Empty terminal shows an inert scrollbar");
  await write(Array.from({length: 1000}, (_, i) => `Output line ${i}`).join("\r\n"));
  for (const minimal of [false, true]) for (const theme of ["dark", "light"]) {
    await page.evaluate(({minimal, theme}) => {
      document.documentElement.dataset.minimal = String(minimal);
      document.documentElement.dataset.theme = theme;
      term.scrollToBottom();
    }, {minimal, theme});
    await page.mouse.move(790, 590);
    await new Promise((done) => setTimeout(done, 1200));
    const before = await state();
    if (!before.visible || !before.hit || before.history === 0) throw new Error("Terminal history has no usable scrollbar");
    const x = before.rect.x + before.rect.width / 2;
    await page.mouse.move(x, before.rect.y + before.rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, 30, {steps: 10});
    await page.mouse.up();
    const after = await state();
    if (after.viewport !== 0 || after.pageScroll !== before.pageScroll) throw new Error("Drag fails to scroll the terminal independently");
    console.log(`${minimal ? "flat" : "painted"}/${theme}: terminal viewport ${before.viewport} -> ${after.viewport}`);
  }
  await write("\x1b[?1049h\x1b[2JAlternate screen");
  if ((await state()).visible) throw new Error("Alternate buffer shows an inert scrollbar");
  await write("\x1b[?1049l");
  if (!(await state()).visible) throw new Error("Returning to normal history loses its scrollbar");
  await page.evaluate(() => document.querySelector("#pane").style.visibility = "hidden");
  if ((await state()).visible) throw new Error("Scrollbar escapes a hidden terminal");
  await page.evaluate(async () => {
    document.querySelector("#pane").style.visibility = "visible";
    term.clear();
    await new Promise(requestAnimationFrame);
  });
  if ((await state()).visible) throw new Error("Cleared terminal retains an inert scrollbar");
  console.log("Empty, alternate, restored, hidden, and cleared terminal states: passed");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
