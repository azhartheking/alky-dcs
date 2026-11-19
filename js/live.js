/* ALKY-1 DCS Trainer - LIVE ROOM (multiplayer when the page runs inside claude.ai).
 * One HOST (the instructor: Editor or owner) runs the simulation and broadcasts its state about once a second.
 * Everyone else who opens the page becomes an OPERATOR: their own model stops, they see the host's plant live,
 * and their actions (setpoints, valves, pumps, acks, procedure steps) are sent to the host and applied there.
 * Taking over the shift, submitting the diagnosis and resetting stay with the host. Outside claude.ai this file
 * does nothing. Messages are limited to 4 KiB, so the state travels in numbered ASCII chunks.            */
(function () {
  'use strict';
  const app = window.app;
  if (!app || !app.sim || !window.claude || typeof window.claude.use !== 'function') return;
  const sim = app.sim, $ = (id) => document.getElementById(id);
  const ACTIONS = ['setSP', 'setRatio', 'setOP', 'setMode', 'setValve', 'setPump', 'setCompressor', 'breaker', 'tgCmd', 'bms', 'demin',
    'vfdChangeover', 'setUfls', 'setDumpAuto', 'setBypass', 'setAutoStart', 'resetRebTrip', 'relightPilot', 'releaseTruck', 'callTruck',
    'openXV', 'closeXV', 'confirmStep', 'ack', 'ackAll'].filter((k) => typeof sim[k] === 'function');
  const SKIP = new Set(['rand', 'opts', 'history', 'events', 'almState', 'report']);
  const CH = 1800;
  const L = window.alkyLive = { room: null, user: null, state: 'solo', canHost: false, left: false, lastRx: 0, n: 0, names: {}, tx: null };
  let rx = { q: -1, peer: null, parts: [], got: 0, n: 0 }, txSeq = 0;

  // ---- operator: actions go to the host, the local model stands still
  const orig = {};
  for (const k of ACTIONS.concat(['advance'])) orig[k] = sim[k].bind(sim);
  for (const k of ACTIONS) sim[k] = function (...args) {
    if (L.state !== 'op') return orig[k](...args);
    L.room.emit('cmd', { k, a: args }).catch(() => { });
    if (k === 'ack' || k === 'ackAll') return orig[k](...args);           // acknowledge locally at once as well
    return { ok: true, info: 'Sent to the instructor’s plant.' };
  };
  sim.advance = function (s) { if (L.state === 'op') return; return orig.advance(s); };

  // ---- host: state broadcast
  const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function snapshot() {
    const o = {};
    for (const k of Object.keys(sim)) if (!SKIP.has(k) && typeof sim[k] !== 'function' && k[0] !== '_') o[k] = sim[k];
    o.events = sim.events.slice(-40);
    o.hist5 = sim.history.slice(-2);
    o._nextRec = sim._nextRec;
    return o;
  }
  function hostTx() {
    if (!L.room || L.state !== 'host') return;
    const j = JSON.stringify(snapshot(), (k, v) => typeof v === 'function' ? undefined : v === Infinity ? '__+inf' : v === -Infinity ? '__-inf'
      : typeof v === 'number' ? (isFinite(v) ? +v.toPrecision(5) : null) : v).replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    const n = Math.ceil(j.length / CH); txSeq++;
    for (let i = 0; i < n; i++) L.room.emit('st', { q: txSeq, i, n, d: j.slice(i * CH, (i + 1) * CH) }).catch(() => { });
  }
  function merge(dst, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (isPlain(v) && isPlain(dst[k])) merge(dst[k], v); else dst[k] = v;
    }
  }
  function onState(m) {
    if (m.sameTab || L.state === 'host' || L.left) return;
    const d = m.data; if (!d || typeof d.d !== 'string' || typeof d.n !== 'number' || d.n > 300) return;
    if (d.q !== rx.q || m.peer !== rx.peer) rx = { q: d.q, peer: m.peer, parts: [], got: 0, n: d.n };
    if (rx.parts[d.i] == null) { rx.parts[d.i] = d.d; rx.got++; }
    if (rx.got < rx.n) return;
    let snap; try { snap = JSON.parse(rx.parts.join(''), (k, v) => v === '__+inf' ? Infinity : v === '__-inf' ? -Infinity : v); } catch (e) { return; }
    rx.got = -1;
    if (!snap || !snap.x) return;
    if (L.state !== 'op') { L.state = 'op'; sim.history = []; }
    L.lastRx = Date.now();
    const hist = snap.hist5 || []; delete snap.hist5;
    const lastT = sim.history.length ? sim.history[sim.history.length - 1].t : -Infinity;
    if (snap.t < lastT) sim.history = [];
    for (const r of hist) if (!sim.history.length || r.t > sim.history[sim.history.length - 1].t) sim.history.push(r);
    merge(sim, snap);
    if (sim.phase === 'running' && $('handover')) $('handover').hidden = true;
    if (app.render) app.render();
  }
  // ---- host: commands from operators
  async function nameOf(m) {
    if (!m.by || !L.user || !L.user.profiles) return 'operator';
    if (!L.names[m.by]) { try { const ps = await L.user.profiles([m.by]); L.names[m.by] = (ps[m.by] && ps[m.by].name) || 'operator'; } catch (e) { L.names[m.by] = 'operator'; } }
    return L.names[m.by];
  }
  async function onCmd(m) {
    if (L.state !== 'host' || m.sameTab) return;
    const c = m.data; if (!c || !ACTIONS.includes(c.k) || !Array.isArray(c.a) || c.a.length > 4) return;
    const who = await nameOf(m);
    let r; try { r = orig[c.k](...c.a); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
    try { sim._log('event', '', who + ': ' + c.k + '(' + c.a.map((x) => JSON.stringify(x)).join(', ') + ')' + (r && r.ok === false ? ' — refused' + (r.msg ? ': ' + r.msg : '') : '')); } catch (e) { }
    if (app.render) app.render();
  }
  // ---- roles
  function leaveOp() { if (L.state !== 'op') return; L.state = 'solo'; if (app.render) app.render(); }
  function host(on) {
    if (on) {
      L.left = false; L.state = 'host'; try { sessionStorage.setItem('alky.host', '1'); } catch (e) { }
      L.room.presence({ role: 'host' }).catch(() => { });
      if (!L.tx) L.tx = setInterval(hostTx, 1500);
    } else {
      L.state = 'solo'; try { sessionStorage.removeItem('alky.host'); } catch (e) { }
      L.room.presence({ role: null }).catch(() => { });
      if (L.tx) { clearInterval(L.tx); L.tx = null; }
    }
    paint();
  }
  // ---- header button
  const btn = document.createElement('button');
  btn.title = 'Live room: the instructor hosts the plant; everyone who opens the page follows it and operates it together';
  btn.hidden = true;
  btn.addEventListener('click', () => {
    if (L.state === 'host') { if (confirm('Stop hosting? Operators drop back to their own plant.')) host(false); }
    else if (L.state === 'op') { if (confirm('Leave the live room and practise on your own plant?')) { L.left = true; leaveOp(); } }
    else if (L.left) { L.left = false; L.lastRx = Date.now(); }
    else if (L.canHost) { if (confirm('Host this plant live? Everyone who opens the page will see your plant and can operate it with you. Taking over the shift, the diagnosis and reset stay with you.')) host(true); }
    else alert('No instructor is hosting right now. When the instructor presses HOST you join automatically; until then you operate your own plant.');
    paint();
  });
  const top = document.querySelector('.topbar'); if (top) top.insertBefore(btn, $('btn-takeover') || null);
  function paint() {
    if (!L.room) return;
    btn.hidden = false;
    btn.textContent = '👥 ' + (L.state === 'host' ? 'HOST · ' + L.n + ' online' : L.state === 'op' ? 'LIVE · following host' : L.left ? 'SOLO · rejoin live' : L.canHost ? 'SOLO · host live' : 'SOLO · ' + L.n + ' online');
    btn.classList.toggle('primary', L.state !== 'solo');
    for (const id of ['btn-takeover', 'btn-submit', 'btn-reset']) { const b = $(id); if (b && L.state === 'op') { b.disabled = true; b.title = 'The host (instructor) controls this in the live room'; } }
  }
  setInterval(() => {
    if (L.state === 'op' && Date.now() - L.lastRx > 15000) leaveOp();
    paint();
  }, 1000);
  // ---- connect
  window.claude.use('room').then(async (r) => {
    if (!r) return;
    L.room = r;
    r.on('st', onState); r.on('cmd', onCmd);
    r.onPeers((ch) => { L.n = ch.peers.length; paint(); });
    try { L.user = await window.claude.use('user'); L.canHost = !!(L.user && L.user.canEdit && L.user.canEdit()); } catch (e) { L.canHost = false; }
    let was = null; try { was = sessionStorage.getItem('alky.host'); } catch (e) { }
    if (was && L.canHost) host(true);
    paint();
  }).catch(() => { });
})();
