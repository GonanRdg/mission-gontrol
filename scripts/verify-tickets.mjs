import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".impeccable/review/tickets");
await mkdir(output, { recursive: true });
const client = resolve(root, "dist/client");
const css = (await readdir(resolve(client, "assets"))).find(name => /^index-.*\.css$/.test(name));
if (!css) throw new Error("Build the web client before verifying ticket UI.");
const context = "a".repeat(64);
const source = `
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {SessionTickets,TicketPaneButton,useSessionTickets} from '~/components/views/SessionTickets';
import {TicketSettingsPage} from '~/components/views/TicketSettingsPage';
import {setApiToken} from '~/lib/api';
setApiToken('fixture-bearer');
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function Harness(){
  const state=useSessionTickets('ticket-ui-fixture');
  const host=useRef(null), terminal=useRef(null);
  const [settings,setSettings]=useState(false);
  useEffect(()=>{const fn=()=>setSettings(true);window.addEventListener('mc:open-settings',fn);return()=>window.removeEventListener('mc:open-settings',fn)},[]);
  useEffect(()=>{
    const term=new Terminal({fontSize:13,fontFamily:'Geist Mono',theme:{background:'#050607',foreground:'#e8e6df'}});
    const fit=new FitAddon();term.loadAddon(fit);term.open(host.current);fit.fit();
    term.writeln('Mission Gontrol · fixture terminal');term.writeln('Repository context loaded.');
    window.pasted=[];term.onData(value=>window.pasted.push(value));window.term=term;terminal.current=term;
    const observer=new ResizeObserver(()=>fit.fit());observer.observe(host.current);
    return()=>{observer.disconnect();term.dispose()};
  },[]);
  return <div style={{height:'100%',display:'flex',flexDirection:'column',position:'relative',border:'1px solid var(--border-strong)',background:'var(--surface-0)'}}>
    <header style={{display:'flex',alignItems:'center',gap:12,padding:16,borderBottom:'1px solid var(--border-strong)'}}><strong style={{marginRight:'auto'}}>mission-control · Review branch</strong><span style={{fontSize:12,color:'var(--text-faint)'}}>Fixture APIs / real components</span><TicketPaneButton open={state.open} onToggle={()=>state.update({open:!state.open})}/></header>
    <div className='mc-session-content' data-tickets-open={state.open||undefined} style={{display:'flex',position:'relative',flex:1,minHeight:0}}>
      <div data-terminal-body style={{position:'relative',flex:1,minWidth:0,minHeight:0}}><div ref={host} style={{position:'absolute',inset:0}}/></div>
      {state.open&&<SessionTickets projectId='fixture' repoName='mission-control' state={state} onClose={()=>state.update({open:false})} onPaste={text=>{terminal.current.paste(text);terminal.current.focus()}}/>}
    </div>
    {settings&&<div style={{position:'absolute',inset:0,zIndex:10,background:'var(--surface-0)',overflow:'auto',padding:24}}><button id='close-settings' onClick={()=>setSettings(false)} style={{float:'right'}}>Back to session</button><TicketSettingsPage/></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
`;
const bundle = await build({ absWorkingDir: root, stdin: { contents: source, loader: "tsx", resolveDir: root, sourcefile: "ticket-ui-fixture.tsx" }, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic", outfile: resolve(output, "harness.js"), define: { "process.env.NODE_ENV": '"development"', "import.meta.env.SSR": "false" } });
let connection = { provider: "jira", workspaceUrl: "https://example.atlassian.net", connected: true, oauthConfigured: true, connecting: false };
let filters = { project: "APP", repository: "fixture/repo", keywords: ["mission-control"], title: true, description: true, labels: true, field: true, fieldId: "customfield_10042", ancestors: true };
const issues = [1, 2].map(number => ({ id: `APP-${number}`, key: `APP-${number}`, title: number === 1 ? "Keep ticket context beside the terminal" : "Restore context across sessions", description: "Keep the description and ticket context available while working in the terminal.", url: `https://example.atlassian.net/browse/APP-${number}`, status: "To do", done: false, type: "Story", priority: "High", assignee: "Alex Morgan", labels: ["desktop"], parentId: "APP-9", metadata: ["mission-control"], match: { location: "Repository field", keyword: "mission-control", ancestor: "APP-9" }, comments: [{ id: "1", author: "Alex Morgan", body: "Keep existing prompt text intact.", editable: true, updatedAt: "2026-11-12" }], transitions: [{ id: "21", name: "Start progress" }], canEdit: true, canComment: true, commentsLimited: false, context }));
const mutations = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const json = (data, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(data)); };
  if (url.pathname.startsWith("/api/")) {
    if (request.headers.authorization !== "Bearer fixture-bearer") return json({ error: "Unauthorized fixture request" }, 401);
    let text = ""; for await (const chunk of request) text += chunk;
    const body = text ? JSON.parse(text) : {};
    if (url.pathname === "/api/tickets/connection") { if (request.method === "PUT") connection = { ...connection, ...body }; return json(connection); }
    if (url.pathname === "/api/projects") return json({ projects: [{ id: "fixture", name: "mission-control", path: "/fixture", sandboxId: null }] });
    if (url.pathname === "/api/sandboxes") return json({ sandboxes: [], enabled: false, activeScopeId: "local" });
    if (url.pathname === "/api/settings") return json({ minimalTheme: true, themeStyle: "flat" });
    if (url.pathname === "/api/tickets/projects") return json([{ id: "APP", name: "Platform (APP)" }, { id: "OPS", name: "Operations (OPS)" }]);
    if (url.pathname.endsWith("/tickets/fields")) return json([{ id: "customfield_10042", name: "Repository · Custom field" }]);
    if (url.pathname.endsWith("/tickets/filters")) { if (request.method === "PUT") filters = body; return json(filters); }
    if (url.pathname.endsWith("/tickets") || url.pathname.endsWith("/tickets/preview")) return json({ context, tickets: issues, scanned: 2, ancestorLimited: false, nextCursor: null });
    const match = url.pathname.match(/\/tickets\/(APP-\d+)(\/comments)?$/);
    if (match) {
      const issue = issues.find(item => item.id === match[1]);
      if (!issue) return json({ error: "Missing fixture" }, 404);
      if (request.method === "PATCH") { assert.equal(body.context, context); mutations.push(body); if (body.title !== undefined) issue.title = body.title; if (body.description !== undefined) issue.description = body.description; if (body.transitionId) issue.status = "In progress"; return json(null); }
      if (request.method === "POST") { assert.equal(body.context, context); mutations.push(body); if (body.commentId) issue.comments.find(comment => comment.id === body.commentId).body = body.body; else issue.comments.push({ id: String(issue.comments.length + 1), author: "Alex Morgan", body: body.body, editable: true, updatedAt: "2026-11-12" }); return json(null); }
      assert.equal(url.searchParams.get("context"), context); return json(issue);
    }
    return json({ error: "Unknown fixture API" }, 404);
  }
  if (url.pathname === "/") {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><html lang="en" data-theme="dark" data-style="flat" data-minimal="true"><title>Ticket integration verification</title><link rel="stylesheet" href="/assets/${css}"><link rel="stylesheet" href="/harness.css"><style>body{padding:20px;margin:0}#root{height:calc(100vh - 40px)}button{cursor:pointer}button:focus-visible{outline:2px solid var(--accent)}@media(max-width:700px){body{padding:8px}#root{height:calc(100vh - 16px)}}</style><div id="root"></div><script type="module" src="/harness.js"></script></html>`); return;
  }
  const built = bundle.outputFiles.find(file => file.path.endsWith(url.pathname === "/harness.css" ? ".css" : ".js"));
  if (["/harness.js", "/harness.css"].includes(url.pathname)) { response.setHeader("content-type", url.pathname.endsWith("css") ? "text/css" : "text/javascript"); response.end(built?.text ?? ""); return; }
  try {
    const path = resolve(client, `.${url.pathname}`); if (!path.startsWith(`${client}/`)) throw new Error("Invalid asset path");
    response.setHeader("content-type", path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : "application/octet-stream"); response.end(await readFile(path));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await puppeteer.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await browser.defaultBrowserContext().overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  const page = await browser.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 }); await page.goto(origin);
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
  await page.waitForSelector(".xterm"); await page.waitForSelector("[aria-label='Show Jira tickets']");
  await page.click("[aria-label='Show Jira tickets']"); await page.waitForSelector(".mc-ticket-title h3");
  await page.mouse.move(10, 10);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, "desktop.png") });
  await page.click(".mc-ticket-footer button");
  assert.equal(await page.evaluate(() => pasted.join("")), "Implement ticket https://example.atlassian.net/browse/APP-1");
  assert.equal(await page.evaluate(() => pasted.join("").includes("\r")), false);
  await page.click("[aria-label='Hide Jira tickets']"); assert.equal(await page.$(".mc-ticket-pane"), null);
  await page.click("[aria-label='Show Jira tickets']"); await page.waitForSelector(".mc-ticket-title h3");
  assert.equal(await page.evaluate(() => pasted.join("")), "Implement ticket https://example.atlassian.net/browse/APP-1");
  await page.select(".mc-ticket-transition select", "21");
  await page.waitForFunction(() => document.querySelector(".mc-ticket-transition select").selectedOptions[0].textContent === "In progress");
  await page.click(".mc-ticket-title button");
  await page.screenshot({ path: resolve(output, "editor.png") });
  await page.locator(".mc-ticket-editor input").fill("Keep ticket context visible");
  await page.click(".mc-ticket-editor button[type=submit]"); await page.waitForFunction(() => document.querySelector(".mc-ticket-title h3")?.textContent === "Keep ticket context visible");
  assert.ok(mutations.find(patch => patch.title === "Keep ticket context visible" && !("description" in patch)));
  await page.type("textarea[name=comment]", "A comment from the ticket reader."); await page.click(".mc-ticket-comments form button[type=submit]");
  await page.waitForFunction(() => document.querySelector(".mc-ticket-comments").textContent.includes("A comment from the ticket reader."));
  await page.evaluate(() => document.querySelector('.mc-ticket-reader').scrollTop = document.querySelector('.mc-ticket-reader').scrollHeight);
  await page.screenshot({ path: resolve(output, "comments.png") });
  await page.click(".mc-ticket-header [aria-label='Ticket settings']"); await page.waitForSelector("#ticket-provider");
  await page.waitForFunction(() => document.querySelector("form[aria-label='Repository ticket filters'] select")?.options.length > 1);
  await page.screenshot({ path: resolve(output, "settings.png") });
  await page.evaluate(() => { const panel = document.querySelector('#close-settings').parentElement; panel.scrollTop = panel.scrollHeight; });
  await page.screenshot({ path: resolve(output, "settings-filters.png") });
  await page.click("form[aria-label='Repository ticket filters'] button[type=submit]");
  await page.waitForFunction(() => document.querySelector("form[aria-label='Repository ticket filters'] button[type=submit]").disabled === false);
  await page.click("#close-settings");
  await page.setViewport({ width: 700, height: 900 }); await page.waitForSelector(".mc-ticket-pane");
  await page.evaluate(() => document.querySelector('.mc-ticket-reader').scrollTop = 0);
  await page.screenshot({ path: resolve(output, "narrow.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; term.options.theme = { background: '#ffffff', foreground: '#242424' }; });
  await page.screenshot({ path: resolve(output, "light.png") });
  await page.setViewport({ width: 520, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-terminal-body]')).visibility === 'hidden');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(output, "compact.png") });
  await page.click("[aria-label='Hide Jira tickets']");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-terminal-body]')).visibility), 'visible');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed: true, providerRequests: "fixture only", checks: ["production reader/settings components", "real xterm paste without Enter", "hide/reopen preserves terminal", "status transition", "title-only patch", "comment creation", "settings discovery/save", "narrow layout", "dark/light"], mutations: mutations.length }, null, 2));
  console.log("Ticket UI: production components, xterm paste without Enter, hide/reopen, status, title-only edit, comments, settings, narrow and light appearances passed against fixture APIs.");
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
