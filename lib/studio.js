const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const roles = [
  {
    "id": "video",
    "name": "Video producer",
    "job": "Compare video tools and show you short samples.",
    "starter": "How much can we spend in total to test three video tools?",
    "context": "We want to make one short video with HeyGen, Runway and MuseTalk, using the same host and words. You can compare how they look before we choose a tool. This budget covers the tests only, not the full ten-minute episode. These are spending limits, not confirmed prices.",
    "options": [
      "Up to $5 total",
      "Up to $10 total",
      "Show me estimated costs first"
    ]
  },
  {
    "id": "design",
    "name": "Show designer",
    "job": "Help you choose the hosts, their voices and the studio.",
    "starter": "How should the four hosts talk to each other?",
    "context": "Their personalities will shape how the show feels. They can disagree while staying friendly, or challenge each other more directly. This choice helps us design the hosts and write their conversations.",
    "options": [
      "Friendly, with lively disagreements",
      "Direct, with stronger debates",
      "Show me an example of each"
    ]
  },
  {
    "id": "news",
    "name": "News producer",
    "job": "Find news stories and plan what happens in the episode.",
    "starter": "What should we cover in the first ten-minute episode?",
    "context": "We can spend most of the time discussing one important story, or briefly cover a few headlines before a longer discussion. If you are unsure, I can suggest stories first.",
    "options": [
      "Discuss one main story",
      "Start with headlines, then discuss one story",
      "Suggest stories before I choose"
    ]
  },
  {
    "id": "app",
    "name": "App builder",
    "job": "Help viewers speak to the hosts and join the discussion.",
    "starter": "How should viewers use their microphone to speak to the hosts?",
    "context": "When a viewer joins the discussion, the app needs to know when they have finished speaking so a host can reply. Holding a button is quick. Clicking once to start and again to stop is easier for a longer comment.",
    "options": [
      "Hold the button while speaking, release when finished",
      "Click to start speaking, then click again to finish",
      "Help me choose"
    ]
  }
];
const brief = 'The Common Room is an original Swey news show. First make ONE ten-minute pilot, not daily automation. Four recurring fictional hosts, mostly US news with important international stories, warmth like Today and discussion like The View. The viewer joins as a fifth panelist. Simulated studio audience. Characters and studio are reusable. Cost is a priority. The user has already decided to try ALL THREE tools, so do not ask whether to compare them. This is an Apple Silicon Mac without an NVIDIA GPU, so MuseTalk requires rented GPU access, not a free local render. Compare HeyGen Avatar III, Runway Characters and MuseTalk using the same short host performance. No provider has been selected. ElevenLabs key was configured in the separate stage app, but do not read secrets. Provider access must be checked. Use the shared decisions for current budget approval; do not infer approval for new subscriptions. No samples have been rendered.';
const ownership = {
  test_budget: 'video', tool_comparison: 'video', test_length: 'video', provider_access: 'video',
  host_style: 'design', host_personalities: 'design', host_viewpoints: 'design', host_chemistry: 'design', moderator: 'design', studio: 'design', seating: 'design', test_host: 'design',
  episode_structure: 'news', story_selection: 'news', footage_sources: 'news',
  viewer_role: 'app', microphone: 'app', interruption: 'app'
};
const responsibilities = {
  video: 'Own tool comparison, measured costs, rendering and editing. Do not choose host personalities, political viewpoints, studio design or episode stories. Request the test host asset from design. Recommend a short test length yourself within the approved budget, rather than asking the user to make routine technical choices.',
  design: 'Own fictional cast, personalities, viewpoints, voices, appearance, studio and seating. Do not choose news stories, episode structure, video providers or spending. Prepare concrete cast/set proposals from the agreed brief instead of asking endless abstract questions.',
  news: 'Own source research, verification, story selection, episode structure, scripts and footage sources. Respect approved cast and structure. Do not recast hosts or redesign the app. Research when asked, cite sources, and never present remembered impressions as transcript research. Do not assume news clips are free to reuse.',
  app: 'Own viewer interaction, microphone controls, interruption, playback and accessibility. Do not choose stories, host viewpoints, set design or episode structure. Use the approved push-to-talk decision.'
};
const marker = /<studio-question>([\s\S]*?)<\/studio-question>/g;

class Studio {
  constructor(manager, root) {
    this.manager = manager;
    this.root = root;
    this.file = path.join(root, 'data', 'studio.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { instances: {}, questions: [], messages: [] };
    this.data.decisions ||= [];
    for (const role of roles) if (!this.data.questions.some(q => q.id === 'intro-' + role.id)) {
      this.data.questions.push({ id: 'intro-' + role.id, role: role.id, topic: ({video:'test_budget',design:'host_chemistry',news:'episode_structure',app:'microphone'})[role.id], title: role.starter, context: role.context, options: role.options, status: 'open', createdAt: Date.now(), source: 'Production brief' });
    }
    // Update unanswered starter copy without changing decisions or chat history.
    for (const question of this.data.questions.filter(q => q.status === 'open')) {
      const role = roles.find(r => question.id === 'intro-' + r.id);
      const oldBudget = question.role === 'video' && question.title === "What's the ceiling for the three-provider bake-off?";
      const copy = oldBudget ? roles[0] : role;
      if (copy) Object.assign(question, { title: copy.starter, context: copy.context, options: copy.options });
    }
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  role(id) {
    const role = roles.find(r => r.id === id);
    if (!role) throw Object.assign(new Error('Unknown production role'), { status: 404 });
    return role;
  }
  ensureInstance(roleId) {
    this.role(roleId);
    let iid = this.data.instances[roleId];
    if (iid && this.manager.listInstances().some(i => i.id === iid)) return iid;
    const projectPath = path.join(this.root, 'workspaces', 'common-room');
    let project = this.manager.listProjects().find(p => p.path === projectPath);
    if (!project) project = this.manager.addProject({ name: 'The Common Room', path: projectPath, description: brief });
    const instance = this.manager.launchInstance('claude-code', { projectId: project.id });
    this.manager.updateSettings(instance.id, { permissionMode: 'plan' });
    this.data.instances[roleId] = instance.id;
    this.save();
    return instance.id;
  }
  recordDecision(topic, summary, sourceId, quote) {
    if (!ownership[topic] || typeof summary !== 'string' || !summary.trim()) return false;
    const source = this.data.messages.find(m => m.id === sourceId && m.author === 'user');
    if (!source || typeof quote !== 'string' || !quote.trim() || !source.text.includes(quote)) return false;
    // Requests for advice are not approvals. Spending changes require explicit card choices.
    if (/not sure|what do (you|u) think|you tell me|show me|estimate|recommend\?/i.test(source.text)) return false;
    if (topic === 'test_budget') return false;
    const old = this.data.decisions.find(d => d.topic === topic);
    if (old && old.sourceId === sourceId) return true;
    if (old && old.sourceAt > source.createdAt) return false;
    const decision = { topic, role: ownership[topic], title: topic.replaceAll('_', ' '), answer: summary.slice(0, 2000), sourceId, quote, sourceAt: source.createdAt, updatedAt: Date.now() };
    if (old) Object.assign(old, decision); else this.data.decisions.push(decision);
    for (const q of this.data.questions) if (q.topic === topic && ['open','discussing'].includes(q.status)) Object.assign(q, { status: 'answered', answer: decision.answer, sourceId, answeredAt: Date.now() });
    return true;
  }
  addQuestion(q, role, id, ts) {
    const topic = Object.hasOwn(ownership, q.topic) ? q.topic : null;
    const owner = topic ? ownership[topic] : role;
    if (topic && this.data.decisions.some(d => d.topic === topic)) return;
    const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    const duplicate = this.data.questions.find(x => x.role === owner && ['open','discussing'].includes(x.status) && ((topic && x.topic === topic) || normalize(x.title) === normalize(q.title)));
    if (duplicate) return;
    const intro = this.data.questions.find(x => x.id === 'intro-' + owner && x.status === 'open');
    if (intro) intro.status = 'superseded';
    this.data.questions.push({ id: id + '-q', role: owner, fromRole: owner !== role ? role : undefined, topic, title: q.title.slice(0, 1200), context: typeof q.context === 'string' ? q.context.slice(0, 2000) : '', options: Array.isArray(q.options) ? q.options.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 200)) : [], status: 'open', createdAt: ts, source: owner !== role ? 'Passed to the right agent' : 'Agent question' });
  }
  sync() {
    let changed = false;
    for (const [role, iid] of Object.entries(this.data.instances)) {
      if (!this.manager.listInstances().some(i => i.id === iid)) continue;
      for (const event of this.manager.instanceHistory(iid)) {
        // Only completed textual assistant messages may create questions.
        if (event.type === 'error' || (event.type === 'result' && event.is_error)) {
          const errorId = iid + '-error-' + event.ts;
          if (!this.data.messages.some(m => m.id === errorId)) {
            this.data.messages.push({ id: errorId, role, author: 'assistant', text: 'The agent could not finish this turn. ' + (event.text || event.result || 'Check the agent connection in Mission Control and try again.'), createdAt: event.ts });
            changed = true;
          }
        }
        if (event.type !== 'assistant') continue;
        const text = (event.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        if (!text.trim()) continue;
        const id = crypto.createHash('sha256').update(iid + ':' + event.ts + ':' + text).digest('hex').slice(0, 24);
        if (this.data.messages.some(m => m.id === id)) continue;
        let clean = text.replace(/<studio-decision>([\s\S]*?)<\/studio-decision>/g, (_, raw) => {
          try { const d = JSON.parse(raw); this.recordDecision(d.topic, d.summary, d.sourceId, d.quote); } catch {}
          return '';
        }).replace(marker, (_, raw) => {
          try {
            const q = JSON.parse(raw);
            if (typeof q.title !== 'string' || !q.title.trim()) return raw;
            this.addQuestion(q, role, id, event.ts);
            return q.title;
          } catch { return raw; }
        });
        this.data.messages.push({ id, role, author: 'assistant', text: clean, createdAt: event.ts });
        changed = true;
      }
    }
    if (changed) this.save();
  }
  snapshot() {
    this.sync();
    const instances = this.manager.listInstances();
    return { brief, roles: roles.map(r => {
      const instance = instances.find(i => i.id === this.data.instances[r.id]);
      return { ...r, instanceId: instance?.id, runtime: instance?.status || null };
    }), questions: this.data.questions, decisions: this.data.decisions, messages: this.data.messages };
  }
  send(roleId, text, questionId) {
    const role = this.role(roleId);
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw Object.assign(new Error('Enter a reply of 1 to 8,000 characters.'), { status: 400 });
    this.sync();
    const question = questionId ? this.data.questions.find(q => q.id === questionId && q.role === roleId) : null;
    if (questionId && !question) throw Object.assign(new Error('Question not found'), { status: 404 });
    if (question && !['open','discussing'].includes(question.status)) throw Object.assign(new Error('This question is already answered. Send a follow-up to change your decision.'), { status: 409 });
    const iid = this.ensureInstance(roleId);
    const decisions = this.data.decisions.map(d => `${d.topic}: ${d.answer}`).join('\n');
    const userMessage = { id: crypto.randomUUID(), role: roleId, author: 'user', text: text.trim(), question: question?.title, createdAt: Date.now() };
    const recent = [...this.data.messages.filter(m => m.author === 'user').slice(-20), userMessage].map(m => ({ id: m.id, role: m.role, text: m.text }));
    const activeQuestions = this.data.questions.filter(q => ['open','discussing','delegated','waiting_on_team'].includes(q.status)).map(q => ({ id: q.id, topic: q.topic, role: q.role, title: q.title, status: q.status, nextWork: q.resolution }));
    const prompt = `You are the ${role.name} for The Common Room.\n${brief}\nShared producer decisions:\n${decisions || 'None yet.'}\nROLE BOUNDARIES: ${responsibilities[roleId]} Topic ownership: ${JSON.stringify(ownership)}. Other roles own their topics even if the user mentions them here. Acknowledge and route that topic to its owner, do not begin a second interview. Approved shared decisions override conflicting old suggestions in your session. Work on research and drafts, using available read-only search and web tools when helpful. Never read credentials, spend money, create accounts or claim assets exist. Media APIs are not connected. Distinguish a proposal from user approval. If asked for your recommendation, give a concrete recommendation with reasons instead of another questionnaire. Do not append a question to every reply; ask only if user input is actually needed to progress. Keep replies concise and collaborative. Use plain everyday English for every role. Avoid industry jargon such as bake-off, ceiling, render, pipeline, VO, and rundown. Say tool comparison, maximum budget, make a video, voice recording, and episode plan instead. Every question must stand alone without requiring the user to read the conversation first. Include two or three short sentences of context explaining what we are deciding, why it matters and what the choices change. Use concrete, clearly different answer options. For money questions, specify total versus per-item cost and tests versus the finished episode. Do not invent prices or imply a spending limit is a verified cost estimate. Respect the low-budget preference, offer estimated costs first, and never treat that option as spending approval. Ask only one useful question at a time. Open questions: ${JSON.stringify(activeQuestions)}. Recent user messages with source IDs: ${JSON.stringify(recent)}. When a user clearly settles a choice in normal chat, append <studio-decision>{"topic":"one owned topic key","summary":"Only what the user actually agreed","sourceId":"exact user message id","quote":"exact supporting words from that message"}</studio-decision>. Never turn a request for advice into a decision. Never use this block to approve or change spending. For new questions supply a topic from the ownership map. Do not repeat existing or answered topics. When you need a decision, append at most one <studio-question>{"topic":"owned_topic_key","title":"A clear question in everyday words","context":"What this decision is about, why it matters, and what the choices change.","options":["Option one","Option two"]}</studio-question> block. Free-text replies are always allowed. Do not repeat an answered question. The dashboard displays that block as a question card.\n${question ? 'Question being answered: ' + question.title + '\nContext: ' + (question.context || '') + '\n' : ''}Producer says: ${text.trim()}`;
    const result = this.manager.sendChat(iid, prompt);
    this.data.messages.push(userMessage);
    if (question) {
      const explicitChoice = question.options.includes(text.trim()) && !/show me|help me|suggest|estimate|example/i.test(text);
      Object.assign(question, { status: explicitChoice ? 'answered' : 'discussing', answer: text.trim(), sourceId: userMessage.id, answeredAt: Date.now() });
      if (explicitChoice) {
        const topic = question.topic || (question.id === 'intro-video' ? 'test_budget' : question.id === 'intro-app' ? 'microphone' : question.id === 'intro-design' ? 'host_chemistry' : question.id === 'intro-news' ? 'episode_structure' : null);
        if (topic && !/show me|help me|suggest|estimate|example/i.test(text)) {
          const d = { topic, role: ownership[topic], title: question.title, answer: text.trim(), sourceId: userMessage.id, quote: text.trim(), sourceAt: userMessage.createdAt, updatedAt: Date.now() };
          const old = this.data.decisions.find(x => x.topic === topic);
          if (old) Object.assign(old, d); else this.data.decisions.push(d);
        } else question.status = 'discussing';
      }
    }
    this.save();
    return { ...result, instanceId: iid };
  }
}

function mount(app, manager, root, wrap) {
  const studio = new Studio(manager, root);
  app.get('/api/studio', wrap((req, res) => res.json(studio.snapshot())));
  app.post('/api/studio/:role/reply', wrap((req, res) => res.json(studio.send(req.params.role, req.body.text, req.body.questionId))));
  return studio;
}
module.exports = { Studio, mount };
