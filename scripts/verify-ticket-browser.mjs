import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, ".impeccable/review/ticket-browser");
await mkdir(output, { recursive: true });
const client = resolve(root, "dist/client");
const css = (await readdir(resolve(client, "assets"))).find(name => /^index-.*\.css$/.test(name));
const source = `
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {SessionTickets,TicketPaneButton,useSessionTickets} from '~/components/views/SessionTickets';
import {TicketSettingsPage} from '~/components/views/TicketSettingsPage';
import {setSettingsOverlayOpen} from '~/lib/settings-navigation';
import {setApiToken} from '~/lib/api';
setApiToken('fixture-bearer');
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function Harness(){
 const state=useSessionTickets('browser-fixture'),host=useRef(null),terminal=useRef(null);
 const [settings,setSettings]=useState(false),[project,setProject]=useState('fixture');
 window.switchProject=()=>setProject('operations');
 useEffect(()=>{const fn=()=>{setSettingsOverlayOpen(true);setSettings(true)};window.addEventListener('mc:open-settings',fn);return()=>window.removeEventListener('mc:open-settings',fn)},[]);
 useEffect(()=>{const term=new Terminal({fontSize:14});const fit=new FitAddon();term.loadAddon(fit);term.open(host.current);fit.fit();window.pasted=[];term.onData(value=>window.pasted.push(value));terminal.current=term;const observer=new ResizeObserver(()=>fit.fit());observer.observe(host.current);return()=>{observer.disconnect();term.dispose()}},[]);
 return <main style={{height:'100%',position:'relative',display:'flex',flexDirection:'column',background:'var(--surface-0)',color:'var(--text)'}}><header style={{padding:16,display:'flex',justifyContent:'space-between'}}><strong>{project==='fixture'?'mission-control':'operations'}</strong><TicketPaneButton open={state.open} onToggle={()=>state.update({open:!state.open})}/></header><div className='mc-session-content' data-tickets-open={state.open||undefined} style={{display:'flex',flex:1,minHeight:0,position:'relative'}}><div data-terminal-body style={{flex:1,minWidth:0,position:'relative'}}><div ref={host} style={{position:'absolute',inset:0}}/></div>{state.open&&<SessionTickets projectId={project} repoName={project==='fixture'?'mission-control':'operations'} state={state} onClose={()=>state.update({open:false})} onPaste={text=>{terminal.current.paste(text);terminal.current.focus()}}/>}</div>{settings&&<section role='dialog' aria-modal='true' style={{position:'absolute',inset:0,zIndex:20,background:'var(--surface-0)',overflow:'auto',padding:24}}><button id='close-settings' onClick={()=>{setSettingsOverlayOpen(false);setSettings(false)}}>Back to session</button><TicketSettingsPage key={project} activeProjectId={project}/></section>}</main>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);`;
const bundle = await build({ absWorkingDir: root, stdin: { contents: source, loader: "tsx", resolveDir: root, sourcefile: "ticket-browser-fixture.tsx" }, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic", outfile: resolve(output, "harness.js"), define: { "process.env.NODE_ENV": '"development"', "import.meta.env.SSR": "false" } });
const empty = { workspaceUrl: "", project: "", keywords: "", title: true, description: true, pendingOnly: true };
const settings = new Map();
const server = createServer(async (request, response) => {
 const url = new URL(request.url, 'http://localhost');
 const json = value => { response.setHeader('content-type','application/json');response.end(JSON.stringify(value)); };
 if(url.pathname.startsWith('/api/')){
  if(request.headers.authorization!=='Bearer fixture-bearer'){response.statusCode=401;return json({error:'unauthorized'})}
  if(url.pathname==='/api/tickets/connection')return json({provider:'jira',workspaceUrl:'',connected:false,oauthConfigured:false,connecting:false});
  if(url.pathname==='/api/projects')return json({projects:[{id:'fixture',name:'mission-control',path:'/fixture',sandboxId:null},{id:'operations',name:'operations',path:'/operations',sandboxId:null}]});
  if(url.pathname==='/api/sandboxes')return json({sandboxes:[],enabled:false,activeScopeId:'local'});
  if(url.pathname==='/api/settings')return json({minimalTheme:true,themeStyle:'flat'});
  if(url.pathname.endsWith('/tickets/browser')){const id=url.pathname.split('/')[3];if(request.method==='PUT'){let body='';for await(const chunk of request)body+=chunk;settings.set(id,JSON.parse(body))}return json(settings.get(id)??empty)}
  response.statusCode=404;return json({error:'fixture API not implemented'});
 }
 if(url.pathname==='/'){response.setHeader('content-type','text/html');response.end('<!doctype html><html lang="en" data-theme="dark" data-style="flat" data-minimal="true"><link rel="stylesheet" href="/assets/'+css+'"><link rel="stylesheet" href="/harness.css"><style>body{margin:0;padding:20px}#root{height:calc(100vh - 40px)}</style><div id="root"></div><script type="module" src="/harness.js"></script></html>');return}
 if(['/harness.js','/harness.css'].includes(url.pathname)){response.setHeader('content-type',url.pathname.endsWith('css')?'text/css':'text/javascript');response.end(bundle.outputFiles.find(file=>file.path.endsWith(url.pathname.endsWith('css')?'.css':'.js'))?.text??'');return}
 try{const path=resolve(client,`.${url.pathname}`);if(!path.startsWith(client+'/'))throw Error();response.setHeader('content-type',path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(await readFile(path))}catch{response.statusCode=404;response.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const origin=`http://127.0.0.1:${server.address().port}`;
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[resolve(root,'scripts/verify-ticket-browser-electron.mjs'),root,origin,output],{env,stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});
 if(code!==0)throw new Error(`Electron ticket browser verification failed (${code})`);
} finally {await new Promise(resolve=>server.close(resolve))}
