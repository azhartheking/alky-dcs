/*
 * ALKY-1 DCS Trainer - synthesized sound (Web Audio, no audio files).
 *
 * Equipment sounds follow the SIMULATED STATE, never the button that was pressed:
 *   K-301 start      contactor clunk + motor whine that rises with the real speed SI-301, blending into the run loop
 *   K-301 running    low hum + light whine; pitch follows speed, level follows motor load (II-301)
 *   K-301 stop       VFD ramp-down: the same voice falls in pitch with the speed and ends when the machine stops
 *   K-301 trip       clunk + forced fast drop (much quicker than a normal stop)
 *   PSV lift         sharp metallic "KLAK" + muffled rush ("PSSSHHH") whose level follows total relief flow
 *   PSV reseat       quick fade of the rush + softer closing clack
 * The alarm horn shares the master volume and mute.
 */
(function (global) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const S = {
    ctx: null, master: null, alarmBus: null, equipBus: null, noise: null,
    enabled: false, muted: false, volume: 0.6,
    comp: null, rush: null, prev: null, tripUntil: 0, audible: false, rushOn: false,
    created: { comp: 0, rush: 0 }, log: [],
  };
  try {
    const v = parseFloat(localStorage.getItem('alky-vol'));
    if (isFinite(v)) S.volume = clamp(v, 0, 1);
    S.muted = localStorage.getItem('alky-mute') === '1';
  } catch (e) { /* storage blocked */ }

  function dbg(ev, extra) {
    S.log.push(Object.assign({ ev, at: S.ctx ? +S.ctx.currentTime.toFixed(2) : 0 }, extra || {}));
    if (S.log.length > 400) S.log.shift();
  }

  function ensureCtx() {
    try {
      if (!S.ctx) {
        S.ctx = new (global.AudioContext || global.webkitAudioContext)();
        S.master = S.ctx.createGain();
        S.alarmBus = S.ctx.createGain(); S.alarmBus.gain.value = 1.0;
        S.equipBus = S.ctx.createGain(); S.equipBus.gain.value = 0.35;   // equipment kept well below the alarm horn
        S.alarmBus.connect(S.master); S.equipBus.connect(S.master); S.master.connect(S.ctx.destination);
        const len = S.ctx.sampleRate * 2, buf = S.ctx.createBuffer(1, len, S.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        S.noise = buf;
        applyMaster();
      }
      if (S.ctx.state === 'suspended') S.ctx.resume();
      return true;
    } catch (e) { S.ctx = null; return false; }
  }
  function applyMaster() {
    if (!S.master) return;
    const g = S.enabled && !S.muted ? S.volume : 0;
    S.master.gain.setTargetAtTime(g, S.ctx.currentTime, 0.05);
  }
  const ready = () => !!(S.ctx && S.enabled && S.ctx.state === 'running');

  // ---------- one-shot building blocks ----------
  function burst(at, dur, ftype, freq, q, gain, bus) {
    const c = S.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = S.noise; f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(bus || S.equipBus);
    src.start(at, Math.random()); src.stop(at + dur + 0.05);
  }
  function ping(at, freq, dur, gain, type, bus) {
    const c = S.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus || S.equipBus);
    o.start(at); o.stop(at + dur + 0.05);
  }
  function clunk(at, k) {        // heavy contactor / breaker
    burst(at, 0.09, 'lowpass', 380, 0.7, 0.9 * k);
    ping(at, 58, 0.22, 0.75 * k, 'sine');
    ping(at + 0.008, 112, 0.09, 0.3 * k, 'triangle');
  }
  function klak(at) {            // spring-loaded PSV popping: sharp metallic hit
    burst(at, 0.035, 'highpass', 2500, 0.7, 0.7);
    ping(at, 1850, 0.16, 0.32); ping(at, 2740, 0.12, 0.24); ping(at, 3960, 0.08, 0.16);
    ping(at, 420, 0.1, 0.25, 'triangle');
  }
  function clack(at) {           // softer reseat
    burst(at, 0.025, 'bandpass', 1500, 1.2, 0.3);
    ping(at, 900, 0.07, 0.16); ping(at, 1380, 0.05, 0.1);
  }

  // ---------- persistent voices (created at most once each) ----------
  function compVoice() {
    if (S.comp) return S.comp;
    const c = S.ctx, out = c.createGain(); out.gain.value = 1; out.connect(S.equipBus);
    const mk = (type, f, filt) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; g.gain.value = 0;
      if (filt) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filt; o.connect(lp); lp.connect(g); } else o.connect(g);
      g.connect(out); o.start(); return { o, g };
    };
    const hum = mk('sawtooth', 45, 260), hum2 = mk('sine', 90), whine = mk('sine', 400), whine2 = mk('sine', 800);
    const rs = c.createBufferSource(), rf = c.createBiquadFilter(), rg = c.createGain();
    rs.buffer = S.noise; rs.loop = true; rf.type = 'bandpass'; rf.frequency.value = 180; rf.Q.value = 0.8; rg.gain.value = 0;
    rs.connect(rf); rf.connect(rg); rg.connect(out); rs.start();
    S.comp = { out, hum, hum2, whine, whine2, rumble: { s: rs, g: rg }, all: [hum.o, hum2.o, whine.o, whine2.o, rs] };
    S.created.comp++; dbg('compressor-voice-created', { count: S.created.comp });
    return S.comp;
  }
  function rushVoice() {
    if (S.rush) return S.rush;
    const c = S.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = S.noise; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.6;
    lp.type = 'lowpass'; lp.frequency.value = 1600; g.gain.value = 0;   // muffled: vapour heard through the header
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(S.equipBus); s.start();
    S.rush = { s, g, bp };
    S.created.rush++; dbg('psv-rush-voice-created', { count: S.created.rush });
    return S.rush;
  }
  function killVoices() {
    [S.comp && S.comp.all, S.rush && [S.rush.s]].forEach(list => (list || []).forEach(n => { try { n.stop(); n.disconnect(); } catch (e) { /* already stopped */ } }));
    if (S.comp) try { S.comp.out.disconnect(); } catch (e) { /* ignore */ }
    if (S.rush) try { S.rush.g.disconnect(); } catch (e) { /* ignore */ }
    S.comp = null; S.rush = null;
  }

  // ---------- state follower ----------
  function snapshot(sim) {
    const psv = {};
    Object.keys(sim.x.psv || {}).forEach(k => { psv[k] = sim.x.psv[k].open; });
    return { K: sim.eq.K301, psv };
  }
  function sync(sim) { S.prev = snapshot(sim); S.tripUntil = 0; }

  // called every UI frame; active = simulation is running (not standby, paused or frozen)
  function update(sim, active) {
    if (!S.prev) sync(sim);
    if (!ready()) { S.prev = snapshot(sim); return; }
    const t = S.ctx.currentTime, p = S.prev, now = snapshot(sim);
    const x = sim.x, N = x.N, load = clamp(x.W / 1.1, 0, 1.3);

    // compressor transitions - taken from the model state, so a rejected start makes no sound
    if (now.K && !p.K) { clunk(t, 1); S.tripUntil = 0; dbg('k301-start', { N: +N.toFixed(1) }); }
    if (!now.K && p.K) {
      if (x.kStop === 'trip') { clunk(t, 1.25); S.tripUntil = t + 2.2; dbg('k301-trip', { N: +N.toFixed(1) }); }
      else dbg('k301-normal-stop', { N: +N.toFixed(1) });
    }
    // compressor voice: pitch follows speed, level follows load
    if (N > 0.5 || now.K || S.comp) {
      const v = compVoice(), n = clamp(N / 100, 0, 1.1), run = clamp(N / 40, 0, 1);
      const tc = 0.12;
      if (t < S.tripUntil) {                       // trip: quick, forced fall regardless of the slower model coast
        [v.hum.g, v.hum2.g, v.whine.g, v.whine2.g, v.rumble.g].forEach(g => g.gain.setTargetAtTime(0, t, 0.28));
        v.whine.o.frequency.setTargetAtTime(70, t, 0.35); v.whine2.o.frequency.setTargetAtTime(140, t, 0.35);
        v.hum.o.frequency.setTargetAtTime(18, t, 0.4);
      } else {
        const on = active ? 1 : 0;
        v.hum.o.frequency.setTargetAtTime(20 + 30 * n, t, tc);
        v.hum2.o.frequency.setTargetAtTime(40 + 60 * n, t, tc);
        v.whine.o.frequency.setTargetAtTime(140 + 560 * n, t, tc);
        v.whine2.o.frequency.setTargetAtTime(2 * (140 + 560 * n), t, tc);
        v.hum.g.gain.setTargetAtTime(on * 0.15 * run * (0.75 + 0.25 * load), t, tc);
        v.hum2.g.gain.setTargetAtTime(on * 0.06 * run, t, tc);
        v.whine.g.gain.setTargetAtTime(on * 0.03 * run * (0.7 + 0.3 * load), t, tc);
        v.whine2.g.gain.setTargetAtTime(on * 0.008 * run, t, tc);
        v.rumble.g.gain.setTargetAtTime(on * 0.05 * run * (0.6 + 0.4 * load), t, tc);
      }
      const audible = active && N > 1 && t >= S.tripUntil;
      if (audible && !S.audible) dbg('k301-loop-audible', { N: +N.toFixed(1) });
      if (!audible && S.audible) dbg('k301-loop-silent', { N: +N.toFixed(1), why: !active ? 'paused/frozen' : t < S.tripUntil ? 'trip-drop' : 'stopped' });
      S.audible = audible;
    }
    // relief valves (any page)
    let W = 0, anyOpen = false;
    Object.keys(now.psv).forEach(k => {
      const s = x.psv[k];
      W += s.W; anyOpen = anyOpen || s.open;
      if (now.psv[k] && !p.psv[k]) { klak(t); dbg('psv-klak', { tag: k }); }
      if (!now.psv[k] && p.psv[k]) { clack(t + 0.02); dbg('psv-clack', { tag: k }); }
    });
    if (anyOpen || W > 0.3 || S.rush) {
      const r = rushVoice();
      const target = active && (anyOpen || W > 0.3) ? clamp(0.06 + 0.45 * Math.sqrt(W / 30), 0, 0.5) : 0;
      r.g.gain.setTargetAtTime(target, t, target > 0 ? 0.15 : 0.08);   // closes quickly on reseat
      r.bp.frequency.setTargetAtTime(600 + 12 * Math.min(W, 40), t, 0.3);
      const on = target > 0;
      if (on !== S.rushOn) dbg(on ? 'psv-rush-on' : 'psv-rush-off', { W: +W.toFixed(1) });
      S.rushOn = on;
      S.rushLevel = target;
    }
    S.prev = now;
  }

  function reset(sim) {
    killVoices();
    S.audible = false; S.rushOn = false; S.tripUntil = 0;
    dbg('reset');
    if (sim) sync(sim); else S.prev = null;
  }
  function enable(sim) {
    if (!ensureCtx()) return false;
    S.enabled = true; applyMaster();
    if (sim) sync(sim);      // no spurious start/klak for states that already exist
    try { localStorage.setItem('alky-snd', 'on'); } catch (e) { /* ignore */ }
    dbg('enabled');
    return true;
  }
  function disable() {
    S.enabled = false; applyMaster(); killVoices();
    try { localStorage.setItem('alky-snd', 'off'); } catch (e) { /* ignore */ }
    dbg('disabled');
  }
  function setVolume(v) { S.volume = clamp(v, 0, 1); applyMaster(); try { localStorage.setItem('alky-vol', String(S.volume)); } catch (e) { /* ignore */ } }
  function setMuted(m) { S.muted = !!m; applyMaster(); try { localStorage.setItem('alky-mute', m ? '1' : '0'); } catch (e) { /* ignore */ } }
  function wanted() { try { return localStorage.getItem('alky-snd') === 'on'; } catch (e) { return false; } }

  // alarm horn note (shares master volume / mute)
  function tone(freq, dur, offset) {
    if (!ready()) return;
    const c = S.ctx, at = c.currentTime + 0.02 + (offset || 0), o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.07, at + 0.012);
    g.gain.setValueAtTime(0.07, at + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(S.alarmBus); o.start(at); o.stop(at + dur + 0.02);
  }

  function stats() {
    return { ctx: S.ctx ? S.ctx.state : 'none', enabled: S.enabled, muted: S.muted, volume: S.volume,
      compVoices: S.comp ? 1 : 0, rushVoices: S.rush ? 1 : 0, created: Object.assign({}, S.created),
      comp: S.comp ? { hum: +S.comp.hum.g.gain.value.toFixed(3), whineHz: Math.round(S.comp.whine.o.frequency.value), whine: +S.comp.whine.g.gain.value.toFixed(3) } : null,
      rush: S.rush ? +S.rush.g.gain.value.toFixed(3) : null };
  }

  global.Snd = { enable, disable, setVolume, setMuted, update, reset, sync, tone, ready, wanted, stats, state: S };
})(window);
