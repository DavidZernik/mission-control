let state, selected = 'video', tab = 'questions', busy = false, lastSignature = '';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isWorking = r => ['working','busy','starting','running'].includes(r.runtime?.state);
function showError(message){ $('error').textContent=message; $('error').hidden=false; }
async function api(url, data){const res=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const json=await res.json();if(!res.ok)throw Error(json.error||'Request failed');return json;}
function render(force=false){
  if(!state)return;
  const pageSignature=JSON.stringify([selected,tab,state.messages,state.questions,state.decisions,state.roles.map(r=>r.runtime?.state)]);
  $('connection').textContent='● Connected · changes saved locally';
  if(!force&&render.pageSignature===pageSignature)return;
  render.pageSignature=pageSignature;
  document.title='The Common Room · Production';
  const role=state.roles.find(r=>r.id===selected), pending=state.questions.filter(q=>q.role===selected&&['open','discussing'].includes(q.status));
  $('connection').textContent='● Connected · changes saved locally';
  $('team').innerHTML=state.roles.map(r=>{const n=state.questions.filter(q=>q.role===r.id&&['open','discussing'].includes(q.status)).length;return `<button class="team-card ${selected===r.id?'selected':''}" data-role="${r.id}"><strong>${esc(r.name)}</strong><span class="${n?'needs':''}">${isWorking(r)?'Working…':n?'Next decision ready':r.runtime?'Ready for your next message':'Ready to start'}</span></button>`}).join('');
  $('role-name').textContent=role.name;$('role-job').textContent=role.job;
  $('role-status').textContent=isWorking(role)?'Working…':pending.length?'Needs your input':'Ready';
  $('count').textContent=pending.length ? 1 : 0;
  for(const t of ['questions','chat','decisions'])$(t+'-tab').classList.toggle('active',tab===t);
  const signature=JSON.stringify([selected,tab,state.messages,state.questions,state.decisions,role.runtime?.state]);
  if(!force&&(lastSignature===signature||$('content').contains(document.activeElement)))return;
  lastSignature=signature;
  if(tab==='questions')$('content').innerHTML=pending.slice(0,1).map(q=>`<article class="question"><div class="eyebrow">${esc(q.source)}</div><h3>${esc(q.title)}</h3>${q.context?`<p class="question-context">${esc(q.context)}</p>`:''}<div class="choices">${q.options.map(o=>`<button data-question="${esc(q.id)}" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div><form data-question-form="${esc(q.id)}"><textarea aria-label="Your answer" placeholder="Or answer in your own words…" maxlength="8000" required></textarea><button class="primary">Reply ↗</button></form></article>`).join('')||`<div class="empty">${isWorking(role)?'Your agent is working on your reply. New questions will appear here.':'No decision needed from you right now. Use the conversation to continue the assigned work.'}</div>`;
  if(tab==='questions'){const work=state.questions.filter(q=>q.role===selected&&['delegated','waiting_on_team'].includes(q.status));if(work.length)$('content').innerHTML+=`<div class="assigned-work"><h3>Next work for this agent</h3>${work.map(q=>`<p>${esc(q.resolution || q.title)}</p>`).join('')}</div>`;}
  if(tab==='chat')$('content').innerHTML=state.messages.filter(m=>m.role===selected).map(m=>`<article class="message ${m.author}"><div class="message-label">${m.author==='user'?'YOU':esc(role.name.toUpperCase())} · ${new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>${m.question?`<div class="hint">${esc(m.question)}</div>`:''}<div class="message-text">${esc(m.text)}</div></article>`).join('')+(isWorking(role)?'<div class="working">Agent is thinking…</div>':'')||'<div class="empty">Start with a question card or send your own message.</div>';
  if(tab==='decisions')$('content').innerHTML=(state.decisions || []).map(q=>`<article class="decision"><div class="eyebrow">${esc(state.roles.find(r=>r.id===q.role)?.name)}</div><strong>${esc(q.title)}</strong><p>${esc(q.answer)}</p></article>`).join('')||'<div class="empty">Your answers will appear here and inform every agent’s next turn.</div>';
}
async function refresh(){try{state=await api('/api/studio');render();}catch(e){$('connection').textContent='Disconnected · retrying';}}
async function send(text,questionId){if(busy)return;busy=true;$('error').hidden=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api('/api/studio/'+selected+'/reply',{text,questionId});$('message').value='';tab='chat';await refresh();render(true);$('content').scrollTop=$('content').scrollHeight;}catch(e){showError(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
$('team').onclick=e=>{const b=e.target.closest('[data-role]');if(b){selected=b.dataset.role;render(true);}};
for(const t of ['questions','chat','decisions'])$(t+'-tab').onclick=()=>{tab=t;render(true);};
$('content').onclick=e=>{const b=e.target.closest('[data-answer]');if(b)send(b.dataset.answer,b.dataset.question);};
$('content').onsubmit=e=>{const f=e.target.closest('[data-question-form]');if(f){e.preventDefault();send(f.querySelector('textarea').value,f.dataset.questionForm);}};
$('composer').onsubmit=e=>{e.preventDefault();send($('message').value);};
// Return sends, Shift+Return keeps multiline editing. Ignore IME composition.
$('composer').addEventListener('keydown', e => {
  if (e.target !== $('message') || e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (e.repeat || busy || !$('message').value.trim()) return;
  $('composer').requestSubmit();
});
refresh();setInterval(()=>{if(!busy)refresh();},2500);
