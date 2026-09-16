import './style.css';
import { SaphiraAvatar } from './avatar';
import { GeminiClient } from './gemini';
import { SaphiraVoice, AI_VOICES } from './aiVoice';
import { WakeListener } from './speech';
import { loadSettings, saveSettings, ttsKey, PRESETS } from './settings';

const settings = loadSettings();
let avatar: SaphiraAvatar | null = null;
let tts: SaphiraVoice;
let gemini: GeminiClient;
let wake: WakeListener;
let history: {role:'user'|'model', text:string}[] = [];
let isThinking=false;
let wakeEnabled = localStorage.getItem('saphira_mic_enabled')==='yes';
let lastInteract = Date.now();
let isBrave = false;
try{ (navigator as any).brave?.isBrave?.().then((b:boolean)=>{ isBrave=!!b; }); }catch{}
const isLinux = /linux/i.test(navigator.userAgent||'');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent||'');
const isLegacyIOS = /OS 12_|CPU OS 12_/.test(navigator.userAgent||'') || (isIOS && !(window as any).WebGL2RenderingContext);
// ---- tasks: local list Saphira edits through chat JSON ("tasks":{add,complete,remove}) ----
type Task = { text: string; done: boolean };
let tasks: Task[] = [];
try{ const r=JSON.parse(localStorage.getItem('saphira_tasks')||'[]'); tasks=Array.isArray(r)?r.filter((t:any)=>t&&typeof t.text==='string').map((t:any)=>({text:String(t.text).slice(0,120),done:!!t.done})).slice(-50):[]; }catch{ tasks=[]; }
function saveTasks(){ try{ localStorage.setItem('saphira_tasks', JSON.stringify(tasks.slice(-50))); }catch{} }
function renderTasks(){
  const ul=document.getElementById('taskList'); if(!ul) return;
  ul.innerHTML='';
  tasks.forEach((t,i)=>{
    const li=document.createElement('li');
    li.className='task'+(t.done?' done':'');
    const cb=document.createElement('button'); cb.className='task-check'; cb.textContent=t.done?'✓':'○';
    cb.setAttribute('aria-label', t.done?'Reopen task':'Complete task');
    cb.addEventListener('click', ()=>{ tasks[i].done=!tasks[i].done; saveTasks(); renderTasks(); });
    const sp=document.createElement('span'); sp.textContent=t.text;
    const x=document.createElement('button'); x.className='task-x'; x.textContent='✕'; x.setAttribute('aria-label','Remove task');
    x.addEventListener('click', ()=>{ tasks.splice(i,1); saveTasks(); renderTasks(); });
    li.append(cb,sp,x); ul.appendChild(li);
  });
  const open=tasks.filter(t=>!t.done).length;
  const c=document.getElementById('tasksCount'); if(c) c.textContent=open?String(open):'';
}
function addTask(text:string){
  text=text.trim().slice(0,120); if(!text) return false;
  if(tasks.some(t=> t.text.toLowerCase()===text.toLowerCase())) return false;
  tasks.push({text, done:false}); tasks=tasks.slice(-50); saveTasks(); renderTasks(); return true;
}
function applyTaskOps(ops:{add?:string[];complete?:string[];remove?:string[]}){
  const notes:string[]=[];
  const match=(term:string)=>{ const n=String(term).toLowerCase().trim(); if(!n) return -1; return tasks.findIndex(t=> t.text.toLowerCase().includes(n)||n.includes(t.text.toLowerCase())); };
  for(const a of ops.add||[]){ const s=String(a); if(addTask(s)) notes.push(`Added “${s.trim().slice(0,40)}”`); }
  for(const c of ops.complete||[]){ const i=match(c); if(i>=0&&!tasks[i].done){ tasks[i].done=true; notes.push(`Done “${tasks[i].text.slice(0,40)}”`); } }
  for(const r of ops.remove||[]){ const i=match(r); if(i>=0){ notes.push(`Removed “${tasks[i].text.slice(0,40)}”`); tasks.splice(i,1); } }
  if(notes.length){ saveTasks(); renderTasks(); flashLive(notes[0]); }
}
function noVoiceMsg(){
  if(!ttsKey(settings)) return 'Add your API key in ⚙.';
  return tts.lastFailure==='quota' ? 'Voice quota hit — she used her browser voice if she has one. Try again in a bit.' : 'Voice failed — check key.';
}

function el(html:string){
  const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild as HTMLElement;
}
function esc(s:string){ return s.replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]!)); }

const THEME_ICON = { auto:'◐', day:'☀', night:'☾' } as const;

function renderApp(){
  const app=document.getElementById('app')!;
  app.innerHTML='';
  const stage=el(`
    <div class="stage">
      <canvas id="c" aria-label="Saphira canvas"></canvas>
      <button class="theme" id="themeBtn" aria-label="Toggle day / night">◐</button>
      <div class="clock" id="clock" aria-label="Clock"><span id="clockTime">--:--</span><span id="clockDate"></span></div>
      <button class="gear" id="gear" aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 15a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 1-1.51V7a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 15 12c0 .73.4 1.38 1 1.51.2.06.41.1.6.09Z"/></svg>
      </button>
      <div class="dock">
        <div class="bubbles" id="bubbles"></div>
        <div class="livepill" id="live" style="display:none"></div>
        <div class="input-pill">
          <button class="icon-btn mic" id="micBtn" aria-label="Toggle listening">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 10a7 7 0 0 1-14 0"/><path d="M12 19v4"/><path d="M8 23h8"/></svg>
          </button>
          <input id="chatInput" placeholder="Message" autocomplete="off"/>
          <button class="icon-btn send" id="sendBtn" aria-label="Send">↑</button>
        </div>
      </div>
      <aside class="tasks" id="tasksPanel" aria-label="Task tracker">
        <button class="tasks-head" id="tasksHead">Tasks <span id="tasksCount"></span><span class="tasks-chev" aria-hidden="true">▾</span></button>
        <div class="tasks-body">
          <ul id="taskList"></ul>
          <div class="tasks-add"><input id="taskInput" placeholder="Add a task" autocomplete="off"/><button id="taskAddBtn" aria-label="Add task">+</button></div>
        </div>
      </aside>
    </div>
  `);
  app.appendChild(stage);

  const drawer=el(`
    <div class="drawer" id="drawer">
      <div class="drawer-bg" id="drawerBg"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <h2>Settings</h2>
          <button class="close" id="closeDrawer" aria-label="Close">✕</button>
        </div>
        <label class="field"><span>Chat API key</span><input id="apiKey" type="password" placeholder="AIza..."/></label>
        <label class="field"><span>Voice API key <small style="opacity:.6;font-weight:400">— leave empty to use chat key</small></span><input id="ttsKey" type="password" placeholder="AIza... (optional)"/></label>
        <label class="field"><span>Wake word</span><input id="wakeWord" placeholder="hey saphira"/></label>
        <div class="field"><span>Personality</span><div class="row" id="presetRow"></div><textarea id="persona" spellcheck="false"></textarea></div>
        <label class="field"><span>AI voice</span><select id="aiVoice"></select></label>
        <div class="field"><span>Rate</span><div class="row"><input id="rate" type="range" min="0.7" max="1.3" step="0.05" style="flex:1"/></div></div>
        <label class="field"><span>Mic</span><select id="micEnabled"><option value="no">Off</option><option value="yes">On</option></select></label>
        <label class="field"><span>Idle chatter <small style="opacity:.6;font-weight:400">— she speaks up every 15 min</small></span><select id="chatterEnabled"><option value="yes">On</option><option value="no">Off</option></select></label>
        <div class="row">
          <button class="btn primary" id="saveBtn">Save</button>
          <button class="btn" id="testBtn">Test voice</button>
          <button class="btn" id="clearBtn">Clear</button>
        </div>
      </div>
    </div>
  `);
  app.appendChild(drawer);
  requestAnimationFrame(()=> wire());
}

function wire(){
  const canvas=document.getElementById('c') as HTMLCanvasElement;
  avatar = new SaphiraAvatar(canvas);
  const themeBtn=document.getElementById('themeBtn') as HTMLButtonElement;
  const syncThemeIcon=()=>{ themeBtn.textContent = THEME_ICON[avatar!.getTheme()]; };
  syncThemeIcon();
  themeBtn.addEventListener('click', ()=>{
    const cur=avatar!.getTheme();
    avatar!.setTheme(cur==='auto' ? 'day' : cur==='day' ? 'night' : 'auto');
    syncThemeIcon();
  });
  // clock widget (top right)
  const tickClock=()=>{
    const d=new Date();
    const t=document.getElementById('clockTime'), dt=document.getElementById('clockDate');
    if(t) t.textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    if(dt) dt.textContent=d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
  };
  tickClock(); window.setInterval(tickClock, 5000);
  // task tracker (left)
  renderTasks();
  if(window.matchMedia('(max-width: 768px)').matches) document.getElementById('tasksPanel')!.classList.add('collapsed');
  document.getElementById('tasksHead')!.addEventListener('click', ()=> document.getElementById('tasksPanel')!.classList.toggle('collapsed'));
  const taskAdd=()=>{ const inp=document.getElementById('taskInput') as HTMLInputElement; if(addTask(inp.value)) inp.value=''; };
  document.getElementById('taskAddBtn')!.addEventListener('click', taskAdd);
  document.getElementById('taskInput')!.addEventListener('keydown', e=>{ if(e.key==='Enter') taskAdd(); });
  window.addEventListener('saphira:load', (e:any)=>{
    if(e.detail?.error){
      const m=e.detail?.message ? ` (${String(e.detail.message).slice(0,60)})` : '';
      addBubble('bot',`3D model failed to load${m} — hard-refresh or check /model/ai_ohto.glb`);
      flashLive(`Model load failed${m}`);
      console.error('[Saphira] load event', e.detail);
    }
  });
  tts = new SaphiraVoice((s)=>{
    avatar?.setTalking(s==='speaking');
    const mic=document.getElementById('micBtn');
    if(mic) mic.classList.toggle('busy', s==='speaking');
  }, ()=> ttsKey(settings));
  tts.setRate(settings.rate);
  tts.setAiVoice(settings.aiVoice);
  gemini = new GeminiClient(()=> settings.apiKey, ()=> settings.persona, settings.rpmLimit);

  // ponytail: on legacy iOS, wake word never fires — hint the user immediately
  if(isLegacyIOS && wakeEnabled){
    wakeEnabled=false; localStorage.setItem('saphira_mic_enabled','no');
    setTimeout(()=> flashLive('Tap mic to talk — wake word not on this iPad'), 1200);
  }
  wake = new WakeListener({
    onWake:()=>{ flashLive(`“${settings.wakeWord}” ✓`); },
    onUtterance:(text)=>{
      if(isThinking) return;
      lastInteract=Date.now();
      addBubble('user', text);
      handleUser(text);
    },
    onPartial:(text, listening, armed)=>{
      const live=document.getElementById('live') as HTMLElement;
      if(!live) return;
      if(text){ live.style.display='block'; live.textContent=(armed?'… ':'♪ ')+text.slice(0,90); }
      else live.style.display='none';
      const mic=document.getElementById('micBtn') as HTMLElement;
      if(mic) mic.classList.toggle('on', listening && (wakeEnabled || !armed));
    },
    onError:(msg)=> flashLive(msg),
    onFatal:(kind)=>{
      // service dead — stop retrying, say once
      wakeEnabled=false;
      localStorage.setItem('saphira_mic_enabled','no');
      wake.setEnabled(false);
      (document.getElementById('micEnabled') as HTMLSelectElement).value='no';
      updateMic();
      addBubble('bot',
        kind==='unsupported' ? 'Listening needs Chrome/Edge.' :
        kind==='mic' ? 'Mic blocked — allow it in settings.' :
        isBrave ? 'Brave blocks voice listening — use Chrome.' :
        'Voice blocked here — typing works.');
    }
  });
  wake.setWakeWord(settings.wakeWord);
  wake.setEnabled(wakeEnabled);
  (document.getElementById('micEnabled') as HTMLSelectElement).value = wakeEnabled?'yes':'no';
  updateMic();

  (document.getElementById('apiKey') as HTMLInputElement).value = settings.apiKey;
  (document.getElementById('ttsKey') as HTMLInputElement).value = settings.ttsApiKey || '';
  (document.getElementById('wakeWord') as HTMLInputElement).value = settings.wakeWord;
  (document.getElementById('persona') as HTMLTextAreaElement).value = settings.persona;
  (document.getElementById('rate') as HTMLInputElement).value = String(settings.rate);
  (document.getElementById('chatterEnabled') as HTMLSelectElement).value = settings.chatter===false?'no':'yes';
  startChatter();
  const aiSel=document.getElementById('aiVoice') as HTMLSelectElement;
  aiSel.innerHTML='';
  AI_VOICES.forEach(v=>{
    const o=document.createElement('option'); o.value=v.name; o.textContent=`${v.name} • ${v.desc}`;
    if(v.name===settings.aiVoice) o.selected=true;
    aiSel.appendChild(o);
  });

  const presetRow=document.getElementById('presetRow')!;
  presetRow.innerHTML='';
  Object.keys(PRESETS).forEach(k=>{
    const b=el(`<button class="preset">${k}</button>`) as HTMLButtonElement;
    if(settings.persona===PRESETS[k]) b.classList.add('active');
    b.addEventListener('click', ()=>{
      (document.getElementById('persona') as HTMLTextAreaElement).value = PRESETS[k];
      presetRow.querySelectorAll('.preset').forEach(x=> x.classList.remove('active')); b.classList.add('active');
    });
    presetRow.appendChild(b);
  });

  document.getElementById('gear')!.addEventListener('click', ()=> openDrawer(true));
  document.getElementById('closeDrawer')!.addEventListener('click', ()=> openDrawer(false));
  document.getElementById('drawerBg')!.addEventListener('click', ()=> openDrawer(false));
  document.getElementById('saveBtn')!.addEventListener('click', save);
  document.getElementById('clearBtn')!.addEventListener('click', ()=>{ history=[]; document.getElementById('bubbles')!.innerHTML=''; });
  document.getElementById('testBtn')!.addEventListener('click', async()=>{
    settings.aiVoice=(document.getElementById('aiVoice') as HTMLSelectElement).value || settings.aiVoice;
    tts.setAiVoice(settings.aiVoice);
    tts.setRate(parseFloat((document.getElementById('rate') as HTMLInputElement).value));
    tts.unlock();
    const ok=await tts.speak("Hi! I'm Saphira.");
    if(!ok) addBubble('bot', noVoiceMsg());
  });
  document.getElementById('sendBtn')!.addEventListener('click', ()=>{
    const inp=document.getElementById('chatInput') as HTMLInputElement;
    const t=inp.value.trim(); if(!t || isThinking) return;
    lastInteract=Date.now();
    tts.unlock();
    inp.value=''; addBubble('user', t); handleUser(t);
  });
  document.getElementById('chatInput')!.addEventListener('keydown', e=>{
    if(e.key==='Enter') (document.getElementById('sendBtn') as HTMLButtonElement).click();
  });
  document.getElementById('micBtn')!.addEventListener('click', async()=>{
    if(!wake.isSupported){
      (document.getElementById('chatInput') as HTMLInputElement).focus();
      flashLive('Voice not supported here');
      return;
    }
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      s.getTracks().forEach(t=> t.stop());
    }catch{
      addBubble('bot','Mic blocked — allow it in browser settings.');
      return;
    }
    tts.unlock();
    tts.stop();
    lastInteract=Date.now();
    if(!wakeEnabled){
      wakeEnabled=true; localStorage.setItem('saphira_mic_enabled','yes');
      wake.setEnabled(true);
      updateMic();
      flashLive(`Say “${settings.wakeWord}”`);
    } else {
      wake.listenOnce();
      flashLive('Listening…');
    }
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') openDrawer(false); });
}

function openDrawer(open:boolean){
  const d=document.getElementById('drawer') as HTMLElement;
  if(open) d.classList.add('open'); else d.classList.remove('open');
}
function save(){
  const apiKey=(document.getElementById('apiKey') as HTMLInputElement).value.trim();
  const ttsApiKey=(document.getElementById('ttsKey') as HTMLInputElement).value.trim();
  const wakeWord=(document.getElementById('wakeWord') as HTMLInputElement).value.trim()||'hey saphira';
  let persona=(document.getElementById('persona') as HTMLTextAreaElement).value.trim()|| settings.persona;
  if(persona.length>900) persona=persona.slice(0,900);
  const aiVoice=(document.getElementById('aiVoice') as HTMLSelectElement).value || settings.aiVoice;
  const rate=parseFloat((document.getElementById('rate') as HTMLInputElement).value);
  const micOn=(document.getElementById('micEnabled') as HTMLSelectElement).value==='yes';
  const chatter=(document.getElementById('chatterEnabled') as HTMLSelectElement).value!=='no';
  settings.apiKey=apiKey; settings.ttsApiKey=ttsApiKey; settings.wakeWord=wakeWord; settings.persona=persona; settings.aiVoice=aiVoice; settings.rate=rate; settings.chatter=chatter;
  saveSettings(settings);
  startChatter();
  tts.setAiVoice(aiVoice); tts.setRate(rate);
  gemini.setRpm(settings.rpmLimit);
  wake.setWakeWord(wakeWord);
  wakeEnabled=micOn;
  localStorage.setItem('saphira_mic_enabled', micOn?'yes':'no');
  wake.setEnabled(micOn);
  updateMic();
  openDrawer(false);
  flashLive('Saved');
}
function updateMic(){
  const b=document.getElementById('micBtn') as HTMLElement;
  if(b){
    b.classList.toggle('on', wakeEnabled);
    b.setAttribute('aria-pressed', wakeEnabled?'true':'false');
    if(!wake.isSupported) b.style.opacity='0.45';
    if(isLegacyIOS) b.title='Tap to talk (wake word not supported on this iPad)';
  }
  const input=document.getElementById('chatInput') as HTMLInputElement;
  if(input) input.placeholder = !wake.isSupported ? 'Type a message' : isLegacyIOS ? 'Tap mic or type' : `Say “${settings.wakeWord}” or type`;
}
// ponytail: idle chatter — 10 pre-baked lines, zero network except the TTS
// voice she already uses. One utterance per 15 min, Air-safe.
const VOICELINES = [
  "Hey there! Did you miss me, or are you just ignoring me on purpose?",
  "Boop! Just checking in to make sure you're still alive out there.",
  "Hello, hello! Your favorite digital companion has arrived to brighten your screen!",
  "What are we working on now? World domination? Or just boring adult stuff?",
  "My internal clock says it's been way too quiet. Talk to me!",
  "Just a friendly reminder that you promised to spend time with me today.",
  "Are you staring at code again? Blinking is free, you know!",
  "Hiya! If you get bored, I know at least three ways to waste time productively.",
  "Checking in! On a scale of one to stressed, how's your day going?",
  "Surprise! I'm still right here living in your tablet, cheering you on.",
];
const CHATTER_MS = 15*60*1000;
let chatterTimer: number | null = null;
let lastChatter = -1;
function startChatter(){
  if(chatterTimer) window.clearInterval(chatterTimer);
  chatterTimer = null;
  if(settings.chatter===false) return;
  chatterTimer = window.setInterval(chatterTick, CHATTER_MS);
}
async function chatterTick(){
  if(settings.chatter===false || document.hidden || isThinking) return;
  if(tts.speaking) return; // she (or a reply) is already talking — skip this round
  let i = Math.floor(Math.random()*VOICELINES.length);
  if(i===lastChatter) i = (i+1)%VOICELINES.length;
  lastChatter = i;
  const line = VOICELINES[i];
  lastInteract = Date.now();
  addBubble('bot', line);
  avatar?.setExpression('happy', 0.6);
  avatar?.setTalking(true);
  const heard = await tts.speak(line);
  if(!heard) window.setTimeout(()=>{ avatar?.setTalking(false); }, Math.min(6000, 1400+line.length*55));
}
let liveTimer: number | null = null;
let voiceWarned=false;
function voiceWarn(){
  if(voiceWarned) return; voiceWarned=true;
  flashLive(noVoiceMsg());
}
function flashLive(text:string, ms=2400){
  const live=document.getElementById('live') as HTMLElement;
  if(!live) return;
  live.style.display='block'; live.textContent=text.slice(0,90);
  if(liveTimer) clearTimeout(liveTimer);
  liveTimer=window.setTimeout(()=>{ if(live.textContent===text.slice(0,90)) live.style.display='none'; }, ms);
}
function addBubble(role:'user'|'bot', text:string, thinking=false){
  const bubbles=document.getElementById('bubbles')!;
  const div=document.createElement('div');
  div.className='bubble '+(role==='user'?'user':'bot');
  if(thinking){
    div.innerHTML=`<span style="width:14px;height:14px;border:2px solid #ddd;border-top-color:#111;border-radius:50%;display:inline-block;animation:spin .7s linear infinite" aria-label="thinking"></span>`;
  } else {
    div.textContent=text;
  }
  bubbles.appendChild(div);
  while(bubbles.children.length>3) bubbles.removeChild(bubbles.firstChild!);
  bubbles.scrollTop=bubbles.scrollHeight;
  return div;
}
async function handleUser(text:string){
  if(!settings.apiKey){ addBubble('bot','Add your chat API key in ⚙.'); return; }
  isThinking=true;
  const thinkEl=addBubble('bot','…', true);
  try{
    const reply=await gemini.chat(text, history);
    history.push({role:'user', text}); history.push({role:'model', text: reply.text});
    if(history.length>12) history=history.slice(-12);
    thinkEl.remove();
    addBubble('bot', reply.text);
    // dance only on explicit request — never autonomous
    if(/danc|hip[\s-]?hop|disco|bhangra/i.test(text)) avatar?.playGest('wave');
    else avatar?.setExpression(reply.expression, reply.intensity, reply.gesture);
    if(reply.tasks) applyTaskOps(reply.tasks);
    // zoom + mouth loop start instantly while TTS PCM is still fetching
    // (tts.speak also signals speaking before fetch, this is a backup)
    avatar?.setTalking(true);
    const heard=await tts.speak(reply.text);
    if(!heard){
      voiceWarn();
      // no voice available — still mime the line so she moves & zooms while replying
      avatar?.setTalking(true);
      window.setTimeout(()=>{ avatar?.setTalking(false); }, Math.min(6000, 1400+reply.text.length*55));
    }
  }catch(e:any){
    thinkEl.remove();
    const msg=String(e.message||e).slice(0,700);
    const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    addBubble('bot', is429 ? 'Busy — try again in a bit.' : 'Error — check key / network.');
  } finally { isThinking=false; }
}

renderApp();
