/* ALKY-1 DCS Trainer - operator interface (three linked DCS pages) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { Sim, LIMITS, SCENARIOS, PROCEDURES, DIAG, DRILLS, clock, P, R } = window.Alky;

  // URL overrides for instructors / testing: ?scenario=suction&kind=recycle&seed=1&onset=40&cap=0.25&ramp=80
  const qs = new URLSearchParams(location.search);
  const num = k => (qs.has(k) && isFinite(+qs.get(k)) ? +qs.get(k) : undefined);
  const opts = { onset: num('onset'), finalCap: num('cap'), ramp: num('ramp'), kind: qs.get('kind') || undefined,
                 scenario: SCENARIOS[qs.get('scenario')] ? qs.get('scenario') : 'drill' };
  const sim = new Sim(Object.assign({}, opts, { seed: num('seed') }));

  const ui = { speed: 1, paused: false, page: 1, selected: 'TIC-100', selByPage: { 1: 'TIC-100', 2: 'PIC-301', 3: 'FIC-402' },
               win: 600, hoverT: null, geo: null, dirty: {}, evCount: -1, almSig: '', confirm: null, procSig: '' };
  window.app = { sim, ui };

  const m = () => sim.m;
  const f = (v, d) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
  const FLAME_TXT = { idle: 'IDLE (purge only)', smokeless: 'SMOKELESS', smoky: 'SMOKING', oversteamed: 'OVER-STEAMED' };
  const PRI_RANK = { URGENT: 3, HIGH: 2, LOW: 1 };

  // ---------------- pages ----------------
  const PAGES = {
    1: { title: 'Page 1 · Unit 1 alkylation reactor section', short: 'Reactor', def: 'TIC-100' },
    2: { title: 'Page 2 · K-301 refrigeration: suction drum, capacity control, anti-surge, condenser', short: 'Compressor', def: 'PIC-301' },
    3: { title: 'Page 3 · F-401 flare: header, knockout drum, steam-assisted stack', short: 'Flare', def: 'FIC-402' },
    4: { title: 'Page 4 · T-501 deisobutanizer: reboiler E-501, condenser E-502, reflux drum D-502', short: 'Fractionator', def: 'TIC-501' },
    5: { title: 'Page 5 · Utilities - MP steam: B-601 water-tube boiler, burner management, FD fan, BFW', short: 'Steam', def: 'PIC-601' },
    6: { title: 'Page 6 · Utilities - plant air, instrument air, nitrogen', short: 'Air & N2', def: 'K-701' },
    7: { title: 'Page 7 · Tank farm: feed and product tanks, truck bay U-1', short: 'Tank farm', def: 'TK-901' },
    8: { title: 'Page 8 · Utilities - TG-1001 condensing steam turbine generator, E-1001 condenser, governor', short: 'Turbine', def: 'SIC-1001' },
    9: { title: 'Page 9 · Electrical - 11 kV single line, TNB grid incomer, generator breaker, synchroscope', short: 'Electrical', def: 'SYNC' },
    10: { title: 'Page 10 · Utilities - D-1201 deaerator, demin water, condensate return', short: 'Deaerator', def: 'D-1201' },
    11: { title: 'Page 11 · Utilities - boiler blowdown and wastewater treatment (DOE Standard B)', short: 'Wastewater', def: 'TK-1304' },
  };
  const PAGE_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const DIGIT_PAGE = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 6, 9: 7 };
  const pageOfTag = tag => {
    const m4 = /-(1[0-3])\d\d/.exec(tag || '');
    if (m4) return { 10: 8, 11: 9, 12: 10, 13: 11 }[m4[1]];
    if (/^(AAH|AAHH|FAL)-60[236]|^FIC-606|^HV-607/.test(tag || '')) return 5;
    const mm = /-(\d)/.exec(tag || '');
    return mm ? DIGIT_PAGE[mm[1]] || null : null;
  };
  const ALARM_FP = {
    'TAHH-100': 'TIC-100', 'TAH-100': 'TIC-100', 'TAL-100': 'TIC-100', 'TIC-100.OPH': 'TIC-100', 'XA-101': 'XV-101', 'AIL-100': 'FIC-102',
    'TAH-102': 'E-101', 'FDA-101': 'FIC-101', 'FDA-102': 'FIC-102', 'FAL-201': 'P-201',
    'PAH-301': 'PIC-301', 'TAH-302': 'PIC-301', 'IAL-301': 'K-301', 'SDA-301': 'K-301', 'XA-301': 'K-301', 'XA-302': 'K-301', 'UA-301': 'UIC-301',
    'PAH-303': 'K-301', 'TAH-304': 'K-301', 'FAL-303': 'E-301', 'LAH-302': 'D-302', 'LAL-301': 'D-301', 'ZA-301': 'PSV-301',
    'PAH-401': 'HDR', 'LAH-401': 'D-401', 'LAHH-401': 'D-401', 'AA-401': 'F-401', 'BAL-402': 'F-401', 'FAL-801': 'HV-801',
    'PAH-103': 'PIC-103', 'ZA-101': 'PSV-101', 'ZA-302': 'PSV-302',
    'PAH-502': 'PIC-502', 'TAL-501': 'TIC-501', 'TAH-501': 'TIC-501', 'LAL-502': 'LIC-502', 'LAH-502': 'LIC-502', 'LAL-501': 'LIC-501', 'LAH-501': 'LIC-501',
    'AIH-503': 'LIC-501', 'AIL-502': 'LIC-502', 'ZA-501': 'PSV-501',
    'PAL-605': 'PIC-601', 'PAH-605': 'PIC-601', 'LAL-601': 'LIC-601', 'LAH-601': 'LIC-601', 'AIL-601': 'FIC-602', 'XA-601': 'B-601', 'ZA-601': 'PSV-601',
    'PAL-701': 'D-701', 'PAL-702': 'A-701', 'PALL-702': 'A-701', 'XA-701': 'K-701', 'ZA-701': 'PSV-701', 'LAL-801': 'TK-801', 'ZA-801': 'PSV-801',
    'BAL-401': 'F-401', 'BAL-403': 'F-401', 'XA-402': 'F-401', 'AAH-402': 'HV-801', 'PAL-403': 'HV-403',
    'LAL-103': 'LIC-103', 'LAH-103': 'LIC-103', 'AIL-201': 'FIC-203',
    'LAH-901': 'TK-901', 'LAHH-901': 'TK-901', 'LAL-901': 'TK-901', 'LAH-902': 'TK-902', 'LAL-902': 'TK-902', 'LAH-903': 'TK-903',
    'LAL-904': 'TK-904', 'LAH-905': 'TK-905', 'AAH-903': 'TK-903', 'AAH-904': 'TK-904', 'AAH-905': 'TK-905', 'ZA-901': 'PSV-901', 'ZA-902': 'PSV-902',
    'AAH-602': 'FIC-606', 'AAHH-602': 'FIC-606', 'AAH-603': 'HV-607', 'FAL-606': 'FIC-606',
    'XA-1001': 'TG-1001', 'SAH-1001': 'SIC-1001', 'VAH-1001': 'TG-1001', 'PAH-1001': 'E-1001', 'LAH-1001': 'LIC-1001', 'LAL-1001': 'LIC-1001', 'PAL-1002': 'SIC-1001', 'ZA-1001': 'PSV-1001',
    'XA-1104': 'TNB', 'XA-1101': 'CB-1101', 'XA-1102': 'CB-1102', 'FAL-1101': 'SYNC', 'FAH-1101': 'SYNC', 'XA-1103': 'CB-1103', 'XA-1100': 'BUS', 'JAH-1101': 'TNB',
    'LAL-1201': 'LIC-1201', 'LAH-1201': 'LIC-1201', 'PAL-1201': 'PIC-1201', 'AAH-1203': 'D-1201', 'AIH-1205': 'A-1205A', 'LAL-1204': 'TK-1204', 'AIH-1208': 'XV-1208', 'AAH-1209': 'XV-1208', 'LAH-1207': 'LIC-1207', 'ZA-1201': 'PSV-1201',
    'TAH-1301': 'TIC-1301', 'LAH-1302': 'LIC-1302', 'LAH-1303': 'S-1303', 'AAL-1304': 'AIC-1304', 'AAH-1304': 'AIC-1304', 'AAL-1305': 'TK-1305', 'AAH-1305': 'TK-1305', 'AAH-1306': 'TK-1305', 'TAH-1305': 'TK-1305', 'XA-1305': 'XV-1305',
  };
  const fpPage = tag => ({ 'HDR': 3, 'TIC-100': 1, 'TRUCK': 7, 'TNB': 9, 'SYNC': 9, 'BUS': 9 }[tag] || pageOfTag(tag) || 1);

  function goPage(p, keepSel) {
    p = +p;
    if (!PAGES[p]) return;
    ui.selByPage[ui.page] = ui.selected;
    ui.page = p;
    PAGE_NUMS.forEach(i => { $('pfd' + i).toggleAttribute('hidden', i !== p); });   // SVG has no .hidden property
    document.querySelectorAll('#pagenav [data-page]').forEach(b => b.classList.toggle('on', +b.dataset.page === p));
    $('gfx-title').textContent = PAGES[p].title;
    if (!keepSel) { ui.selected = ui.selByPage[p] || PAGES[p].def; buildFaceplate(); }
    ui.hoverT = null;
    render();
  }
  $('pagenav').addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) goPage(b.dataset.page); });
  function showTag(tag) {   // jump to the page that owns a tag and open its faceplate
    const p = fpPage(tag);
    if (p !== ui.page) { ui.selByPage[p] = tag; goPage(p); } else select(tag);
  }

  // ---------------- graphic tags ----------------
  const TAGS = {
    1: [
      { fp: 'FIC-101', x: 100, y: 22, w: 108, alarms: ['FDA-101'], lines: [() => 'FIC-101', () => f(m().Fo, 0) + ' kmol/h', () => `SP ${f(sim.fic101.sp, 0)} · ${sim.fic101.mode}`] },
      { fp: 'FIC-102', x: 186, y: 222, w: 108, alarms: ['FDA-102'], lines: [() => 'FIC-102', () => f(m().Fi, 0) + ' kmol/h', () => `SP ${f(sim.fic102.sp, 0)} · ${sim.fic102.mode}`] },
      { fp: 'FIC-102', x: 222, y: 140, w: 70, alarms: ['AIL-100'], lines: [() => 'AI-100 I/O', () => f(m().io, 1)] },
      { fp: 'E-101', x: 372, y: 178, w: 76, alarms: ['TAH-102'], lines: [() => 'TI-102', () => f(m().Tpc, 1) + ' °C'] },
      { fp: 'TIC-100', x: 452, y: 18, w: 120, alarms: ['TAHH-100', 'TAH-100', 'TAL-100', 'TIC-100.OPH'], lines: [() => 'TIC-100 reactor', () => f(m().Tr, 1) + ' °C', () => `SP ${f(sim.tic100.sp, 1)} °C`, () => `OP ${f(sim.tic100.op, 0)} % · ${sim.tic100.mode}`] },
      { fp: 'TIC-100', x: 582, y: 18, w: 110, alarms: [], lines: [() => 'QI-100 cooling', () => f(sim.x.qcool, 2) + ' MW', () => f(sim.x.qcool / P.designDuty * 100, 0) + ' % of design'] },
      { fp: 'TIC-100', x: 428, y: 244, w: 78, alarms: [], lines: [() => 'ZI-100 TV-100', () => f(sim.x.zc, 0) + ' % open'] },
      { fp: 'P-201', x: 650, y: 210, w: 92, alarms: ['FAL-201'], lines: [() => 'FI-201 acid', () => f(m().Facid, 0) + ' m3/h'] },
      { fp: 'D-102', x: 850, y: 148, w: 112, alarms: [], lines: [() => 'D-102 settler', () => 'TI-103 ' + f(m().Tset, 1) + ' °C', () => 'LI-103 ' + f(m().Lset, 0) + ' %', () => 'AI-201 ' + f(m().acidStr, 1) + ' wt%'] },
      { fp: 'K-301', x: 18, y: 330, w: 120, alarms: ['PAH-301', 'IAL-301', 'XA-301', 'PAH-303'], lines: [() => 'K-301 refrig.', () => 'PI-301 ' + f(m().Ps, 2) + ' barg', () => 'II-301 ' + f(m().amps, 0) + ' A'] },
      { fp: 'K-301', x: 510, y: 386, w: 84, alarms: [], lines: [() => 'TI-301 refrig.', () => f(m().Tref, 1) + ' °C'] },
      { fp: 'XV-101', x: 252, y: 22, w: 64, alarms: ['XA-101'], lines: [() => 'XV-101', () => (sim.eq.tripped ? 'TRIPPED' : sim.eq.xvOpen ? 'OPEN' : 'CLOSED')] },
      { fp: 'PSV-301', x: 18, y: 270, w: 150, alarms: ['ZA-301'], lines: [() => 'PSV-301 ' + (sim.x.psvOpen ? 'OPEN ▶ P3' : 'closed')] },
      { fp: 'PIC-103', x: 850, y: 215, w: 120, alarms: ['PAH-103'], lines: [() => 'PIC-103 reactor P', () => f(m().Pr, 2) + ' barg', () => `PV-103 ${f(sim.x.zPV103, 0)} % · ${sim.pic103.mode}`] },
      { fp: 'PSV-101', x: 850, y: 262, w: 120, alarms: ['ZA-101'], lines: [() => 'PSV-101 ' + (sim.x.psv['PSV-101'].open ? 'OPEN ▶ P3' : 'closed')] },
    ],
    2: [
      { fp: 'D-302', x: 40, y: 250, w: 104, alarms: ['LAH-302'], lines: [() => 'D-302 drum', () => 'LI-302 ' + f(m().Ldrum, 0) + ' %'] },
      { fp: 'PIC-301', x: 196, y: 250, w: 128, alarms: ['PAH-301', 'TAH-302'], lines: [() => 'PIC-301 suction', () => 'PI-301 ' + f(m().Ps, 2) + ' barg', () => 'TI-302 ' + f(m().Ts, 1) + ' °C', () => `SP ${f(sim.pic301.sp, 2)} · ${sim.pic301.mode}`] },
      { fp: 'K-301', x: 420, y: 240, w: 130, alarms: ['IAL-301', 'SDA-301', 'XA-301', 'XA-302'], lines: [() => 'K-301 ' + (sim.eq.K301 ? 'RUNNING' : 'STOPPED'), () => 'SI-301 ' + f(m().N, 0) + ' % (dem ' + f(sim.x.Ndem, 0) + ')', () => 'II-301 ' + f(m().amps, 0) + ' A', () => 'Surge margin ' + f(sim.x.SM, 0) + ' %'] },
      { fp: 'K-301', x: 480, y: 108, w: 100, alarms: ['PAH-303', 'TAH-304'], lines: [() => 'Discharge', () => 'PI-303 ' + f(m().Pd, 1) + ' barg', () => 'TI-304 ' + f(m().Td, 0) + ' °C'] },
      { fp: 'UIC-301', x: 270, y: 6, w: 160, alarms: ['UA-301'], lines: [() => 'UIC-301 anti-surge', () => 'FV-302 ' + f(sim.x.zR, 0) + ' % · ' + sim.uic301.mode, () => 'SM calc ' + f(sim.x.SM, 0) + ' · meas ' + f(m().SMmeas, 0) + ' %'] },
      { fp: 'K-301', x: 590, y: 30, w: 130, alarms: [], warn: () => sim.eq.pshhBypass, lines: [() => 'PSHH-303 trip', () => sim.eq.pshhBypass ? 'BYPASSED' : 'ACTIVE · 16.8 barg'] },
      { fp: 'E-301', x: 650, y: 300, w: 96, alarms: ['FAL-303'], lines: [() => 'FI-303 CW', () => f(m().cw, 0) + ' %'] },
      { fp: 'D-301', x: 700, y: 240, w: 120, alarms: ['LAL-301'], lines: [() => 'D-301', () => 'LI-301 ' + f(m().Lacc, 0) + ' %'] },
      { fp: 'PSV-301', x: 880, y: 140, w: 106, alarms: ['ZA-301'], lines: [() => 'PSV-301', () => sim.x.psvOpen ? 'OPEN' : 'CLOSED', () => f(sim.x.Wpsv, 1) + ' t/h'] },
      { fp: 'K-301', x: 880, y: 250, w: 106, alarms: [], lines: [() => 'QI-301 avail.', () => f(sim.x.Qavail, 2) + ' MW', () => 'evap ' + f(sim.x.Qevap, 2) + ' MW'] },
      { fp: 'TIC-100', x: 880, y: 330, w: 106, alarms: ['TAH-100', 'TAHH-100'], lines: [() => 'TI-100 reactor', () => f(m().Tr, 1) + ' °C'] },
    ],
    3: [
      { fp: 'HDR', x: 40, y: 20, w: 230, alarms: ['ZA-301', 'ZA-101', 'ZA-302', 'ZA-501'], lines: [() => 'Relief sources to flare',
        () => ['PSV-101', 'PSV-301'].map(t => t.slice(4) + (sim.x.psv[t].open ? ' OPEN' : ' shut')).join(' · '),
        () => ['PSV-302', 'PSV-501'].map(t => t.slice(4) + (sim.x.psv[t].open ? ' OPEN' : ' shut')).join(' · '),
        () => 'FI-401 total ' + f(sim.x.Wflare, 1) + ' t/h · N₂ purge ' + f(sim.x.purge, 1)] },
      { fp: 'HDR', x: 310, y: 215, w: 104, alarms: ['PAH-401'], lines: [() => 'Flare header', () => 'PI-401 ' + f(m().Ph, 2) + ' barg', () => 'TI-401 ' + f(sim.x.Tfh, 0) + ' °C'] },
      { fp: 'D-401', x: 428, y: 255, w: 92, alarms: ['LAH-401', 'LAHH-401'], lines: [() => 'LI-401', () => f(m().Lko, 0) + ' %'] },
      { fp: 'F-401', x: 600, y: 30, w: 170, alarms: ['AA-401'], lines: [() => 'F-401 flame', () => FLAME_TXT[sim.x.flame], () => 'steam/HC ' + (sim.x.hc >= 1 ? f(sim.x.ratio, 2) : '—') + ' · HC ' + f(sim.x.hc, 1) + ' t/h'] },
      { fp: 'F-401', x: 600, y: 90, w: 170, alarms: ['BAL-402'], lines: [() => 'Pilots A · B · C', () => sim.eq.pilots.map(p => (p ? 'LIT' : 'OUT')).join(' · ')] },
      { fp: 'FIC-402', x: 890, y: 230, w: 104, alarms: [], lines: [() => 'FIC-402 steam', () => f(m().steam, 1) + ' t/h', () => `SP ${f(sim.fic402.sp, 1)} · ${sim.fic402.ratioMode ? 'RATIO' : sim.fic402.mode}`, () => 'ratio SP ' + f(sim.fic402.ratioSP, 2)] },
      { fp: 'PIC-601', x: 890, y: 300, w: 104, alarms: ['PAL-605'], lines: [() => 'PI-605 MP steam', () => f(sim.x.Psh, 1) + ' barg'] },
    ],
    4: [
      { fp: 'PSV-501', x: 96, y: 96, w: 130, alarms: ['ZA-501'], lines: [() => 'PSV-501', () => sim.x.psv['PSV-501'].open ? 'OPEN ▶ P3' : 'CLOSED', () => f(sim.x.psv['PSV-501'].W, 1) + ' t/h'] },
      { fp: 'FIC-102', x: 40, y: 150, w: 150, alarms: [], lines: [() => 'FI-105 iC4 make-up', () => f(sim.x.mk, 0) + ' kmol/h'] },
      { fp: 'LIC-501', x: 40, y: 290, w: 160, alarms: ['AIH-503'], lines: [() => 'AI-503 iC4 in alkylate', () => f(sim.x.ic4b, 1) + ' % (spec ≤ 5)'] },
      { fp: 'LIC-501', x: 150, y: 372, w: 128, alarms: ['LAL-501', 'LAH-501'], lines: [() => 'LIC-501 bottoms', () => 'LI-501 ' + f(m().Lb, 0) + ' %', () => 'FI-503 ' + f(sim.x.B5, 0) + ' kmol/h'] },
      { fp: 'TIC-501', x: 405, y: 140, w: 120, alarms: ['TAL-501', 'TAH-501'], lines: [() => 'TIC-501 tray', () => f(m().Ttray, 1) + ' °C', () => `SP ${f(sim.tic501.sp, 0)} · ${sim.tic501.mode}`, () => 'PSHH-502 ' + (sim.eq.rebTrip ? 'TRIPPED' : 'ok')] },
      { fp: 'PIC-502', x: 680, y: 96, w: 124, alarms: ['PAH-502'], lines: [() => 'PIC-502 column', () => 'PI-502 ' + f(m().Pc, 2) + ' barg', () => 'TI-502 top ' + f(sim.x.Ttop, 0) + ' °C', () => `CW ${f(sim.x.zCW5, 0)} % · ${sim.pic502.mode}`] },
      { fp: 'LIC-502', x: 680, y: 164, w: 124, alarms: ['LAL-502', 'LAH-502'], lines: [() => 'LIC-502 drum', () => 'LI-502 ' + f(m().Ld, 0) + ' %'] },
      { fp: 'FIC-502', x: 410, y: 264, w: 120, alarms: [], lines: [() => 'FIC-502 reflux', () => f(sim.x.L5, 0) + ' kmol/h · ' + sim.fic502.mode] },
      { fp: 'LIC-502', x: 700, y: 272, w: 150, alarms: ['AIL-502'], lines: [() => 'FI-504 iC4 recycle', () => f(sim.x.D5, 0) + ' kmol/h', () => 'AI-502 purity ' + f(sim.x.pur5, 1) + ' %'] },
      { fp: 'TIC-501', x: 640, y: 318, w: 120, alarms: [], lines: [() => 'FI-501 steam', () => f(sim.x.st501, 1) + ' t/h'] },
    ],
    5: [
      { fp: 'LIC-601', x: 30, y: 60, w: 114, alarms: ['LAL-601', 'LAH-601'], lines: [() => 'LIC-601 drum', () => 'LI-601 ' + f(m().Ldr, 0) + ' %', () => 'PI-601 ' + f(sim.x.Pdrum, 1) + ' barg'] },
      { fp: 'PSV-601', x: 206, y: 6, w: 116, alarms: ['ZA-601'], lines: [() => 'PSV-601 → atm', () => sim.x.psv['PSV-601'].open ? 'OPEN ' + f(sim.x.psv['PSV-601'].W, 1) + ' t/h' : 'closed'] },
      { fp: 'PIC-601', x: 14, y: 150, w: 110, alarms: [], lines: [() => 'FI-601 fuel', () => f(sim.x.fuel, 2) + ' t/h'] },
      { fp: 'FIC-602', x: 14, y: 336, w: 120, alarms: [], lines: [() => 'FIC-602 air', () => f(sim.x.air, 1) + ' t/h', () => (sim.fic602.ratioMode ? 'RATIO EA ' + f(sim.fic602.ratioSP, 0) + ' %' : sim.fic602.mode)] },
      { fp: 'PIC-601', x: 480, y: 100, w: 132, alarms: ['PAL-605', 'PAH-605'], lines: [() => 'PIC-601 header', () => 'PI-605 ' + f(m().Psh, 2) + ' barg', () => 'gen ' + f(sim.x.gen, 1) + ' t/h', () => `OP ${f(sim.pic601.op, 0)} % · ${sim.pic601.mode}`] },
      { fp: 'FIC-602', x: 470, y: 180, w: 110, alarms: ['AIL-601'], lines: [() => 'AI-601 O₂', () => f(m().O2, 1) + ' %'] },
      { fp: 'B-601', x: 620, y: 196, w: 190, alarms: ['XA-601'], lines: [() => 'B-601 burner management', () => sim.x.bms, () => sim.x.bms === 'PURGING' ? `purge ${Math.floor(sim.x.purgeT)} / 60 s` : 'flame ' + (sim.x.bms === 'FIRING' && sim.x.fuel > 0.05 ? 'ON' : 'OFF')] },
      { fp: 'PIC-601', x: 650, y: 106, w: 160, alarms: [], lines: [() => 'Steam users', () => 'E-501 ' + f(sim.x.st501, 1) + ' · flare ' + f(sim.x.steam, 1), () => 'other ' + f(sim.x.stUse - sim.x.st501 - sim.x.steam, 1) + ' t/h'] },
      { fp: 'LIC-601', x: 640, y: 330, w: 120, alarms: [], lines: [() => 'FI-604 BFW', () => f(sim.x.bfw, 1) + ' t/h'] },
    ],
    6: [
      { fp: 'K-701', x: 14, y: 220, w: 176, alarms: ['XA-701'], lines: [() => 'Air compressors', () => 'K-701 ' + (sim.eq.K701 ? (sim.x.ld701 ? 'LOADED' : 'unloaded') : 'STOPPED'), () => 'K-702 ' + (sim.eq.K702 ? (sim.x.ld702 ? 'LOADED' : 'unloaded') : 'STBY') + ' · auto ' + (sim.eq.k702auto ? 'ARMED' : 'OFF')] },
      { fp: 'D-701', x: 270, y: 150, w: 104, alarms: ['PAL-701'], lines: [() => 'PI-701 receiver', () => f(m().Prec, 2) + ' barg'] },
      { fp: 'PSV-701', x: 262, y: 20, w: 104, alarms: ['ZA-701'], lines: [() => 'PSV-701 → atm', () => sim.x.psv['PSV-701'].open ? 'OPEN' : 'closed'] },
      { fp: 'A-701', x: 600, y: 128, w: 160, alarms: ['PAL-702', 'PALL-702'], lines: [() => 'PI-702 IA header', () => f(m().Pia, 2) + ' barg', () => 'AI-701 dew point −40 °C'] },
      { fp: 'A-701', x: 780, y: 128, w: 200, alarms: [], warn: () => sim.x.iaFail, lines: [() => 'Valve fail-safe (all pages)', () => sim.x.iaFail ? 'ACTIVE - valves at fail position' : 'normal'] },
      { fp: 'PV-702', x: 340, y: 262, w: 150, alarms: [], lines: [() => 'PV-702 plant air', () => sim.x.Prec > Alky.U.air.paShut ? 'OPEN' : 'SHUT (IA priority)'] },
      { fp: 'TK-801', x: 130, y: 324, w: 100, alarms: ['LAL-801'], lines: [() => 'LI-801 LN₂', () => f(sim.x.Ln2, 1) + ' %'] },
      { fp: 'PSV-801', x: 350, y: 352, w: 100, alarms: [], lines: [() => 'PSV-801', () => sim.x.psv['PSV-801'].open ? 'OPEN' : 'closed'] },
      { fp: 'TK-801', x: 340, y: 438, w: 130, alarms: [], lines: [() => 'PIC-801 N₂ header', () => f(m().Pn2, 2) + ' barg'] },
      { fp: 'HV-801', x: 590, y: 440, w: 150, alarms: ['FAL-801'], lines: [() => 'HV-801 flare purge', () => (sim.eq.HV801 ? 'OPEN ' : 'CLOSED ') + f(sim.x.purge, 2) + ' t/h'] },
      { fp: 'HV-802', x: 790, y: 440, w: 160, alarms: [], lines: [() => 'HV-802 T-501 purge', () => (sim.eq.HV802 ? 'OPEN 1.0 t/h' : 'CLOSED')] },
    ],
  };
  const tkL = k => sim.x.tk[k];
  const atmLines = k => [() => `${k} ${({ 'TK-903': 'alkylate', 'TK-904': 'fresh acid', 'TK-905': 'spent acid' })[k]}`, () => 'LI-' + k.slice(3) + ' ' + f(tkL(k).L, 0) + ' %',
    () => f(tkL(k).P, 0) + ' mbar · O₂ ' + f(tkL(k).O2, 1) + ' %', () => 'net ' + (tkL(k).net >= 0 ? '+' : '') + f(tkL(k).net, 1) + ' t/h'];
  TAGS[7] = [
    { fp: 'TK-901', x: 40, y: 196, w: 160, alarms: ['LAH-901', 'LAHH-901', 'LAL-901', 'ZA-901'], lines: [() => 'TK-901 olefin', () => 'LT-901 ' + f(m().L901, 0) + ' % · radar ' + f(tkL('TK-901').L, 0) + ' %', () => 'PI-901 ' + f(tkL('TK-901').P, 2) + ' barg', () => 'net ' + (tkL('TK-901').net >= 0 ? '+' : '') + f(tkL('TK-901').net, 1) + ' t/h'] },
    { fp: 'TK-902', x: 250, y: 196, w: 140, alarms: ['LAH-902', 'LAL-902', 'ZA-902'], lines: [() => 'TK-902 isobutane', () => 'LI-902 ' + f(tkL('TK-902').L, 0) + ' %', () => 'PI-902 ' + f(tkL('TK-902').P, 2) + ' barg', () => 'net ' + (tkL('TK-902').net >= 0 ? '+' : '') + f(tkL('TK-902').net, 1) + ' t/h'] },
    { fp: 'TK-903', x: 452, y: 220, w: 130, alarms: ['LAH-903', 'AAH-903'], lines: atmLines('TK-903') },
    { fp: 'TK-904', x: 746, y: 250, w: 88, alarms: ['LAL-904', 'AAH-904'], lines: [() => 'TK-904 acid', () => f(tkL('TK-904').L, 0) + ' %', () => f(tkL('TK-904').P, 0) + ' mbar', () => 'O₂ ' + f(tkL('TK-904').O2, 1) + ' %'] },
    { fp: 'TK-905', x: 892, y: 250, w: 100, alarms: ['LAH-905', 'AAH-905'], lines: [() => 'TK-905 spent', () => f(tkL('TK-905').L, 0) + ' %', () => f(tkL('TK-905').P, 0) + ' mbar', () => 'O₂ ' + f(tkL('TK-905').O2, 1) + ' %'] },
    { fp: 'TRUCK', x: 660, y: 400, w: 180, alarms: [], lines: [() => 'Truck bay U-1', () => { const t = sim.x.truck; return t.state === 'none' ? 'empty' : TF.tanks[t.tank].truck; },
      () => { const t = sim.x.truck; return t.state === 'none' ? '' : (t.state === 'arriving' ? 'arriving · ' : 'connected · ') + f(t.amt, 1) + ' t'; }] },
  ];
  TAGS[1].push(
    { fp: 'FIC-203', x: 850, y: 292, w: 120, alarms: ['AIL-201'], lines: [() => 'FIC-203 fresh acid', () => f(sim.x.Ff, 2) + ' t/h · ' + sim.fic203.mode] },
    { fp: 'LIC-103', x: 850, y: 324, w: 120, alarms: ['LAL-103', 'LAH-103'], lines: [() => 'LIC-103 acid lvl', () => 'LI-103 ' + f(m().Lset, 0) + ' % · ' + f(sim.x.Fsp, 2) + ' t/h'] });
  TAGS[3].push(
    { fp: 'HV-801', x: 310, y: 262, w: 104, alarms: ['AAH-402', 'FAL-801'], lines: [() => 'AI-402 hdr O₂', () => f(sim.x.hO2, 1) + ' %'] },
    { fp: 'HV-403', x: 870, y: 166, w: 120, alarms: ['PAL-403'], lines: [() => 'Pilot gas', () => sim.x.gasOK ? (sim.eq.HV404 && !sim.eq.HV403 ? 'BACKUP' : 'OK') : 'NO GAS'] });
  TAGS[4].push(
    { fp: 'HV-802', x: 405, y: 78, w: 110, alarms: [], lines: [() => 'AI-504 col. HC', () => f(sim.x.colHC, 0) + ' %'] });
  const X = () => sim.x, onoff = (k, a, b) => (sim.eq[k] ? a : b);
  TAGS[5].push(
    { fp: 'FIC-606', x: 4, y: 2, w: 132, alarms: ['FAL-606'], lines: [() => 'FIC-606 CBD', () => f(X().bw.cbd, 2) + ' t/h · ' + sim.fic606.mode] },
    { fp: 'FIC-606', x: 352, y: 418, w: 150, alarms: ['AAH-602', 'AAHH-602', 'AAH-603'], lines: [() => 'AI-602 boiler water', () => 'TDS ' + f(X().bw.tds, 0) + ' ppm', () => 'mud sludge ' + f(X().bw.sludge, 0) + ' % (IBD at 80)'] },
    { fp: 'HV-607', x: 220, y: 418, w: 110, alarms: [], lines: [() => 'IBD HV-607', () => sim.eq.HV607 ? 'OPEN ' + f(X().bw.ibd, 0) + ' t/h' : 'closed'] });
  TAGS[8] = [
    { fp: 'SIC-1001', x: 14, y: 140, w: 170, alarms: ['PAL-1002'], lines: [() => 'PI-1003 inlet steam', () => f(sim.x.Psh, 2) + ' barg' + (X().tg.runback ? ' · RUNBACK' : ''), () => 'FI-1001 ' + f(X().tg.Ftg, 1) + ' t/h'] },
    { fp: 'SIC-1001', x: 190, y: 18, w: 180, alarms: ['SAH-1001'], lines: [() => 'SIC-1001 governor', () => 'SI-1001 ' + f(X().tg.N, 0) + ' rpm', () => X().tg.mode + ' · GV ' + f(X().tg.zv, 0) + ' %',
      () => X().tg.mode === 'SPEED' ? 'target ' + f(X().tg.Nsp, 0) + ' rpm' : 'load SP ' + f(X().tg.Psp, 2) + ' MW'] },
    { fp: 'TG-1001', x: 600, y: 18, w: 170, alarms: ['XA-1001', 'VAH-1001'], lines: [() => 'TG-1001 ' + (X().tg.latched ? 'LATCHED' : X().tg.tripped ? 'TRIPPED' : 'STOPPED'), () => 'VI-1001 vib ' + f(X().tg.vib, 0) + ' µm', () => 'turning gear ' + onoff('TGEAR', 'ON', 'off')] },
    { fp: 'G-1001', x: 620, y: 214, w: 160, alarms: ['XA-1102'], lines: [() => 'G-1001 generator', () => 'JI-1001 ' + f(X().tg.Pe, 2) + ' MW', () => f(X().tg.Vg, 2) + ' kV · ' + f(X().tg.Q, 1) + ' MVAr', () => 'CB-1102 ' + onoff('CB1102', 'CLOSED', 'OPEN') + ' · field ' + onoff('EXC1001', 'ON', 'off')] },
    { fp: 'E-1001', x: 690, y: 296, w: 170, alarms: ['PAH-1001'], lines: [() => 'E-1001 condenser', () => 'PI-1001 ' + f(X().tg.Pcond, 3) + ' bara', () => 'TI-1001 ' + f(X().tg.Tcond, 0) + ' °C · eff ' + f(X().tg.evac * 100, 0) + ' %'] },
    { fp: 'J-1001A', x: 14, y: 360, w: 150, alarms: [], lines: [() => 'Air ejectors', () => 'A ' + onoff('J1001A', sim.flt.ejA ? 'NO STEAM' : 'RUN', 'stop') + ' · B ' + onoff('J1001B', 'RUN', 'STBY'), () => 'air ' + f(X().tg.Pair, 3) + ' bar'] },
    { fp: 'LIC-1001', x: 300, y: 380, w: 130, alarms: ['LAH-1001', 'LAL-1001'], lines: [() => 'LIC-1001 hotwell', () => 'LI-1001 ' + f(X().tg.Lhw, 0) + ' %', () => 'FI-1002 ' + f(X().tg.Fhw, 1) + ' t/h'] },
    { fp: 'PSV-1001', x: 330, y: 220, w: 70, alarms: ['ZA-1001'], lines: [() => 'PSV-1001', () => sim.x.psv['PSV-1001'].open ? 'OPEN' : 'shut'] },
  ];
  TAGS[9] = [
    { fp: 'TNB', x: 168, y: 72, w: 150, alarms: ['XA-1104', 'JAH-1101'], lines: [() => 'TNB supply', () => X().el.gridOK ? f(X().el.fg, 2) + ' Hz · ' + f(X().el.Vgrid, 2) + ' kV' : 'NO GRID', () => 'import JI-1101 ' + f(X().el.imp, 2) + ' MW'] },
    { fp: 'CB-1101', x: 14, y: 196, w: 70, alarms: ['XA-1101'], lines: [() => 'CB-1101', () => onoff('CB1101', 'CLOSED', 'OPEN')] },
    { fp: 'BUS', x: 470, y: 160, w: 200, alarms: ['FAL-1101', 'FAH-1101', 'XA-1100'], lines: [() => '11 kV bus', () => 'SI-1101 ' + f(X().el.f, 2) + ' Hz · ' + f(X().el.Vbus, 2) + ' kV', () => 'plant load ' + f(X().el.load, 2) + ' MW', () => 'source: ' + (X().el.Vbus < 1 ? 'DEAD' : sim.eq.CB1101 && X().el.gridOK ? (sim.eq.CB1102 ? 'TNB + TG' : 'TNB') : 'ISLAND (TG only)')] },
    { fp: 'CB-1103', x: 510, y: 296, w: 150, alarms: ['XA-1103'], lines: [() => 'UFLS 81U ' + (sim.eq.uflsArm ? 'ARMED 48.5 Hz' : 'OFF')] },
    { fp: 'SYNC', x: 728, y: 274, w: 254, alarms: [], lines: [() => 'Synchronising ' + (X().el.sync || '— (nothing to synchronise)'), () => X().el.sync ? `slip ${X().el.slip >= 0 ? '+' : ''}${f(X().el.slip, 2)} Hz · ΔV ${f(X().el.dV, 2)} kV` : '',
      () => X().el.sync ? `angle ${f(X().el.phi, 0)}° · check-synch ${Math.abs(X().el.slip) <= 0.2 && Math.abs(X().el.dV) / 11 <= 0.05 && Math.abs(X().el.phi) <= 20 ? 'PERMIT' : 'block'}` : ''] },
    { fp: 'G-1001', x: 728, y: 340, w: 254, alarms: [], lines: [() => 'Meters', () => 'TG-1001 ' + f(X().tg.Pe, 2) + ' MW · ' + f(X().tg.N / 60, 2) + ' Hz', () => 'TNB import ' + f(X().el.imp, 2) + ' / max demand 3.5 MW', () => 'governor ' + X().tg.mode] },
  ];
  const trS = k => sim.x.dm[k];
  TAGS[10] = [
    { fp: 'A-1205A', x: 14, y: 320, w: 194, alarms: ['AIH-1205'], lines: [() => 'AI-1205 demin ' + f(X().dm.cond, 2) + ' µS/cm', () => `A ${trS('A').st} ${f(trS('A').cap, 0)} % · B ${trS('B').st} ${f(trS('B').cap, 0)} %`, () => 'production ' + f(X().dm.Fprod, 0) + ' t/h'] },
    { fp: 'TK-1204', x: 198, y: 30, w: 110, alarms: ['LAL-1204'], lines: [() => 'TK-1204', () => 'LI-1204 ' + f(X().dm.L, 0) + ' %'] },
    { fp: 'LIC-1201', x: 380, y: 104, w: 130, alarms: ['LAL-1201', 'LAH-1201'], lines: [() => 'LIC-1201 make-up', () => 'LI-1201 ' + f(X().da.L, 0) + ' %', () => 'FI-1201 ' + f(X().dm.Fmk, 1) + ' t/h · ' + sim.lic1201.mode] },
    { fp: 'PIC-1201', x: 632, y: 350, w: 140, alarms: ['PAL-1201'], lines: [() => 'PIC-1201 pegging', () => 'PI-1201 ' + f(X().da.P, 2) + ' barg', () => 'steam ' + f(X().da.Fpeg, 1) + ' t/h · ' + sim.pic1201.mode] },
    { fp: 'D-1201', x: 380, y: 300, w: 150, alarms: ['AAH-1203'], lines: [() => 'D-1201 deaerator', () => 'TI-1201 ' + f(X().da.T, 1) + ' °C', () => 'AI-1203 O₂ ' + f(X().da.O2, 0) + ' ppb'] },
    { fp: 'XV-1208', x: 690, y: 176, w: 136, alarms: ['AIH-1208', 'AAH-1209', 'LAH-1207'], lines: [() => 'AI-1208 ' + f(X().cr.cond, 0) + ' µS/cm', () => 'AI-1209 oil ' + f(X().cr.oil, 0) + ' ppm', () => 'XV-1208 ' + (sim.eq.XV1208 ? 'DUMP' : 'to D-1201') + (sim.eq.xv1208auto ? ' · auto' : ' · MAN')] },
    { fp: 'LIC-1207', x: 680, y: 70, w: 110, alarms: [], lines: [() => 'LIC-1207', () => f(X().cr.L, 0) + ' % · ' + f(X().cr.Fout, 0) + ' t/h'] },
    { fp: 'P-1210', x: 820, y: 360, w: 130, alarms: [], lines: [() => 'O₂ scavenger +', () => 'phosphate dosing'] },
  ];
  TAGS[11] = [
    { fp: 'TIC-1301', x: 250, y: 40, w: 124, alarms: ['TAH-1301'], lines: [() => 'TIC-1301 quench', () => 'TI-1301 ' + f(X().ww.Tbd, 0) + ' °C', () => 'blowdown ' + f(X().ww.bdIn, 1) + ' t/h'] },
    { fp: 'LIC-1302', x: 420, y: 316, w: 130, alarms: ['LAH-1302'], lines: [() => 'LIC-1302', () => 'LI-1302 ' + f(X().ww.Leq, 0) + ' %', () => 'FI-1302 ' + f(X().ww.Ftr, 1) + ' t/h'] },
    { fp: 'S-1303', x: 430, y: 380, w: 170, alarms: ['LAH-1303'], lines: [() => 'S-1303 oil layer ' + f(X().ww.layer, 0) + ' %', () => 'oil in/out ' + f(X().ww.oilEq, 0) + ' / ' + f(X().ww.oilS, 1) + ' mg/L'] },
    { fp: 'AIC-1304', x: 650, y: 300, w: 150, alarms: ['AAL-1304', 'AAH-1304'], lines: [() => 'AIC-1304 pH', () => f(X().ww.ph4, 2) + ' · SP ' + f(sim.aic1304.sp, 1), () => 'OP ' + f(sim.aic1304.op, 0) + ' % · ' + sim.aic1304.mode, () => 'dose ' + (X().ww.dose >= 0 ? 'NaOH ' : 'acid ') + f(Math.abs(X().ww.dose), 0)] },
    { fp: 'TK-1305', x: 776, y: 4, w: 210, alarms: ['AAL-1305', 'AAH-1305', 'AAH-1306', 'TAH-1305', 'XA-1305'], lines: [() => 'Final effluent (DOE Std B)', () => 'AI-1305 pH ' + f(X().ww.ph5, 2) + ' (5.5–9.0)', () => 'AI-1306 oil ' + f(X().ww.oil5, 1) + ' mg/L (≤ 10)', () => 'TI-1305 ' + f(X().ww.T5, 1) + ' °C (≤ 40)'] },
    { fp: 'XV-1305', x: 800, y: 380, w: 110, alarms: ['XA-1305'], lines: [() => 'XV-1305', () => sim.eq.XV1305 ? 'OUTFALL' : 'RECYCLE', () => 'off-spec ' + Math.round(X().ww.violT) + ' s'] },
  ];
  TAGS[3].forEach(t => { if (t.fp === 'F-401' && t.lines.length === 3) t.alarms = ['AA-401', 'XA-402']; if (t.fp === 'F-401' && t.lines.length === 2) t.alarms = ['BAL-401', 'BAL-402', 'BAL-403']; });

  const SVGNS = 'http://www.w3.org/2000/svg';
  function buildTags() {
    PAGE_NUMS.forEach(p => {
      const g = $('tags' + p); g.innerHTML = '';
      TAGS[p].forEach(t => {
        const grp = document.createElementNS(SVGNS, 'g');
        grp.setAttribute('class', 'tag'); grp.dataset.fp = t.fp;
        const r = document.createElementNS(SVGNS, 'rect');
        Object.entries({ x: t.x, y: t.y, width: t.w, height: t.lines.length * 13 + 7, rx: 3, class: 'bg' }).forEach(([k, v]) => r.setAttribute(k, v));
        grp.appendChild(r);
        t.els = t.lines.map((_, j) => {
          const tx = document.createElementNS(SVGNS, 'text');
          tx.setAttribute('x', t.x + 5); tx.setAttribute('y', t.y + 13 + j * 13);
          tx.setAttribute('class', j === 0 ? 'tn' : j === 1 ? 'tv' : '');
          grp.appendChild(tx); return tx;
        });
        const ic = document.createElementNS(SVGNS, 'text');
        ic.setAttribute('x', t.x + t.w - 5); ic.setAttribute('y', t.y + 13); ic.setAttribute('text-anchor', 'end'); ic.setAttribute('class', 'almic');
        grp.appendChild(ic); t.ic = ic; t.g = grp;
        g.appendChild(grp);
      });
    });
  }

  function setSt(id, on, onTxt, offTxt) {
    const el = $('st-' + id); if (!el) return;
    el.textContent = on ? onTxt : offTxt;
    el.setAttribute('class', 'st' + (on ? '' : ' stopped'));
    const eq = $('eq-' + id); if (eq) eq.classList.toggle('stopped', !on);
  }

  function renderGraphic() {
    const almBy = {};
    sim.alarms.forEach(a => { almBy[a.tag] = a; });
    TAGS[ui.page].forEach(t => {
      t.lines.forEach((fn, j) => { const s = fn(); if (t.els[j].textContent !== s) t.els[j].textContent = s; });
      let top = null, unack = false;
      t.alarms.forEach(tag => {
        const a = almBy[tag];
        if (!a) return;
        if (!a.acked) unack = true;
        if (a.active && (!top || PRI_RANK[a.pri] > PRI_RANK[top.pri])) top = a;
      });
      const cls = ['tag'];
      if (top) cls.push('alm-' + top.pri);
      else if (t.warn && t.warn()) cls.push('alm-LOW');
      if (t.fp === ui.selected) cls.push('sel');
      t.g.setAttribute('class', cls.join(' '));
      t.ic.textContent = top ? { URGENT: '▲ U', HIGH: '◆ H', LOW: '■ L' }[top.pri] : (unack ? '○' : '');
      t.ic.setAttribute('class', 'almic' + (unack ? ' blink' : ''));
    });
    const eq = sim.eq, x = sim.x;
    if (ui.page === 1) {
      ['P-101', 'P-102', 'P-201'].forEach(p => setSt(p, eq[p.replace('-', '')], 'RUN', 'STOPPED'));
      setSt('K-301', eq.K301, 'RUN', 'STOPPED');
      setSt('XV-101', eq.xvOpen, 'OPEN', eq.tripped ? 'TRIPPED' : 'CLOSED');
    } else if (ui.page === 2) {
      setSt('P-303A', eq.P303A, 'RUN', 'STOPPED');
      setSt('P-303B', eq.P303B, 'RUN', 'STBY');
      $('eq2-K-301').classList.toggle('stopped', !eq.K301);
      $('vfdA').classList.toggle('vfd-on', x.vfdCh === 'A');
      $('vfdB').classList.toggle('vfd-on', x.vfdCh === 'B');
      $('eq-PSV-301').classList.toggle('open', x.psvOpen);
      const lv = $('lvl-D-302'), hh = Math.max(2, x.Ldrum / 100 * 136);
      lv.setAttribute('y', 238 - hh); lv.setAttribute('height', hh);
    } else if (ui.page === 4) {
      setSt('P-502', eq.P502, 'RUN', 'STOPPED');
      const lvl = (id, pct, y0, h0) => { const r = $(id), hh = Math.max(1, pct / 100 * h0); r.setAttribute('y', y0 - hh); r.setAttribute('height', hh); };
      lvl('lvl-D-502', x.Ld, 198, 46); lvl('lvl-T-501', x.Lb, 426, 52);
    } else if (ui.page === 5) {
      setSt('K-601', eq.K601, 'RUN', 'STOPPED'); setSt('P-601A', eq.P601A, 'RUN', 'STOPPED'); setSt('P-601B', eq.P601B, 'RUN', 'STBY');
      const r = $('lvl-B-601'), hh = Math.max(1, x.LdrM / 100 * 40); r.setAttribute('y', 114 - hh); r.setAttribute('height', hh);
      $('blr-flame').classList.toggle('off', !(x.bms === 'FIRING' && x.fuel > 0.05));
    } else if (ui.page === 6) {
      setSt('K-701', eq.K701, x.ld701 ? 'LOADED' : 'UNLOADED', 'STOPPED'); setSt('K-702', eq.K702, x.ld702 ? 'LOADED' : 'UNLOADED', eq.k702auto ? 'STBY (AUTO)' : 'STBY (OFF)');
      const r = $('lvl-TK-801'), hh = Math.max(1, x.Ln2 / 100 * 112); r.setAttribute('y', 436 - hh); r.setAttribute('height', hh);
      $('eq-HV-801').classList.toggle('closed', !eq.HV801); $('eq-HV-802').classList.toggle('closed', !eq.HV802);
    } else if (ui.page === 7) {
      ['P-901', 'P-902', 'P-903', 'P-904', 'P-905'].forEach(p => setSt(p, eq[p.replace('-', '')], 'RUN', 'STOP'));
      const lvl = (id, pct, y0, h0) => { const r = $(id), hh = Math.max(1, pct / 100 * h0); r.setAttribute('y', y0 - hh); r.setAttribute('height', hh); };
      lvl('lvl-TK-901', x.tk['TK-901'].L, 116, 52); lvl('lvl-TK-902', x.tk['TK-902'].L, 116, 52);
      lvl('lvl-TK-903', x.tk['TK-903'].L, 206, 142); lvl('lvl-TK-904', x.tk['TK-904'].L, 206, 122); lvl('lvl-TK-905', x.tk['TK-905'].L, 206, 122);
      const t = x.truck;
      $('eq-TRUCK').setAttribute('class', 'eq truck ' + t.state + (ui.selected === 'TRUCK' ? ' sel' : ''));
      $('truck-lbl').textContent = t.state === 'none' ? 'NO TRUCK' : `${TF.tanks[t.tank].truck.split(' ')[0].toUpperCase()} ${f(t.amt, 1)} t`;
      $('truck-hose').classList.toggle('on', t.state === 'connected');
    } else if (ui.page === 8) {
      const g = x.tg;
      setSt('J-1001A', eq.J1001A, sim.flt.ejA ? 'NO STEAM' : 'RUN', 'STOP'); setSt('J-1001B', eq.J1001B, 'RUN', 'STBY');
      setSt('P-1001A', eq.P1001A, 'RUN', 'STOP'); setSt('P-1001B', eq.P1001B, 'RUN', 'STBY');
      setSt('G-1001', eq.CB1102, 'ON BUS ' + f(g.Pe, 2) + ' MW', g.Vg > 5 ? 'EXCITED · CB open' : 'DE-EXCITED');
      $('eq-TG-1001').classList.toggle('stopped', g.N < 50);
      $('eq-TG-1001').classList.toggle('tripped', g.tripped);
      $('eq-TTV').classList.toggle('closed', !g.latched);
      $('eq-TGEAR').classList.toggle('stopped', !eq.TGEAR);
      const r = $('lvl-HW'), hh = Math.max(1, g.Lhw / 100 * 34); r.setAttribute('y', 378 - hh); r.setAttribute('height', hh);
    } else if (ui.page === 9) {
      const el = x.el;
      ['CB-1101', 'CB-1102', 'CB-1103'].forEach(b => { const on = eq[b.replace('-', '')]; $('eq-' + b).classList.toggle('closed', on); setSt(b, on, 'CLOSED', 'OPEN'); $('eq-' + b).classList.remove('stopped'); });
      setSt('TNB', el.gridOK, 'LIVE', 'DEAD');
      $('st9-G-1001').textContent = x.tg.N > 50 ? f(x.tg.Pe, 2) + ' MW · ' + f(x.tg.N / 60, 2) + ' Hz' : 'stopped';
      $('bus-1101').parentNode.classList.toggle('dead', el.Vbus < 1);
      const ptr = $('sync-ptr');
      ptr.setAttribute('transform', `rotate(${el.sync ? el.phi.toFixed(1) : 0} 855 150)`);
      ptr.classList.toggle('idle', !el.sync);
      $('sync-pt').textContent = el.sync ? `${el.sync} · ${el.slip >= 0 ? 'gen FAST' : 'gen SLOW'} ${f(Math.abs(el.slip), 2)} Hz` : 'no breaker to synchronise';
    } else if (ui.page === 10) {
      ['P-1206A', 'P-1206B', 'P-1207', 'P-1210'].forEach(p => setSt(p, eq[p.replace('-', '')], 'RUN', p.endsWith('B') ? 'STBY' : 'STOP'));
      ['A', 'B'].forEach(k => { const tr = x.dm[k], e = $('eq-A-1205' + k); $('st-A-1205' + k).textContent = tr.st === 'regen' ? `REGEN ${Math.round(tr.regT / 6)} %` : tr.st.toUpperCase();
        e.setAttribute('class', 'eq vessel ' + (tr.st === 'regen' ? 'regen' : tr.st === 'exhausted' || (tr.st === 'service' && tr.cap < 10) ? 'exhausted' : tr.st === 'standby' ? 'stopped' : '') + (ui.selected === 'A-1205' + k ? ' sel' : '')); });
      const lvl = (id, pct, y0, h0) => { const r = $(id), hh = Math.max(1, pct / 100 * h0); r.setAttribute('y', y0 - hh); r.setAttribute('height', hh); };
      lvl('lvl-TK-1204', x.dm.L, 216, 122); lvl('lvl-D-1201', x.da.L, 282, 66); lvl('lvl-TK-1207', x.cr.L, 156, 82);
    } else if (ui.page === 11) {
      ['P-1302A', 'P-1302B', 'P-1303', 'P-1304A', 'P-1304B', 'P-1306'].forEach(p => setSt(p, eq[p.replace('-', '')], 'RUN', p.endsWith('B') ? 'STBY' : 'STOP'));
      const r = $('lvl-TK-1302'), hh = Math.max(1, x.ww.Leq / 100 * 132); r.setAttribute('y', 256 - hh); r.setAttribute('height', hh);
      $('oil-S-1303').setAttribute('height', Math.max(1, x.ww.layer / 100 * 40));
    } else {
      setSt('P-401', eq.P401, 'RUN', 'STOPPED');
      const ko = $('ko-liq'), hh = Math.max(1, x.Lko / 100 * 80);
      ko.setAttribute('y', 245 - hh); ko.setAttribute('height', hh);
      document.querySelector('#pfd3 .pipe.hdr').classList.toggle('relieving', x.Wpsv > 0.5);
      const fl = x.flame;
      let sc = x.hc < 1 ? (fl === 'oversteamed' ? 0.22 : 0.3) : Math.min(1.3, 0.35 + Math.sqrt(x.hc) / 4.5);
      if (fl === 'oversteamed' && x.hc >= 1) sc *= 0.7;
      if (!eq.pilots.some(Boolean)) sc = 0;   // no pilot: no flame (an 'unlit' release shows only as a grey plume)
      $('flame-scale').setAttribute('transform', `scale(${sc.toFixed(3)})`);
      $('flame-outer').setAttribute('fill', fl === 'smoky' ? 'url(#flameSmoky)' : fl === 'oversteamed' ? 'url(#flameSteam)' : 'url(#flameGrad)');
      const sm = $('smoke');
      sm.setAttribute('transform', `translate(825 ${(168 - 90 * sc).toFixed(0)})`);
      sm.classList.toggle('steamy', fl === 'oversteamed');
      sm.style.opacity = fl === 'smoky' ? Math.min(1, 0.35 + (0.3 - x.ratio) / 0.3) : fl === 'oversteamed' ? 0.7 : fl === 'unlit' ? 0.6 : 0;
      eq.pilots.forEach((on, i) => $('pilot' + i).classList.toggle('out', !on));
    }
    document.querySelectorAll(`#pfd${ui.page} .eq.psv[data-fp]`).forEach(e => { const s = x.psv[e.dataset.fp]; if (s) e.classList.toggle('open', s.open); });
    document.querySelectorAll(`#pfd${ui.page} .eq.valve[data-fp]`).forEach(e => {   // hand valves: red outline when closed
      const k = e.dataset.fp.replace('-', ''); if (HV[e.dataset.fp] && k in eq) e.classList.toggle('closed', !eq[k]);
    });
    document.querySelectorAll(`#pfd${ui.page} .eq`).forEach(e => e.classList.toggle('sel', e.dataset.fp === ui.selected));
  }

  // ---------------- KPIs ----------------
  function renderKPIs() {
    const mm = m(), x = sim.x, out = sim.outsideLimits().join(' ');
    const K = {
      1: [['Reactor temp TI-100', f(mm.Tr, 1), '°C', /temperature/.test(out)], ['I/O molar ratio', f(mm.io, 1), '', /I\/O/.test(out)],
          ['Cooling demand', f(sim.tic100.op, 0), '% OP', false], ['Delivered duty', f(x.qcool, 2), 'MW', false],
          ['Olefin feed', f(mm.Fo, 0), 'kmol/h', false], ['Isobutane feed', f(mm.Fi, 0), 'kmol/h', false]],
      2: [['Suction PI-301', f(mm.Ps, 2), 'barg', mm.Ps > R.pah301], ['Discharge PI-303', f(mm.Pd, 1), 'barg', mm.Pd > R.pah303],
          ['Speed SI-301', f(mm.N, 0), '%', x.Ndem - x.N > 10], ['Recycle FV-302', f(x.zR, 0), '% open', x.zR > 30 && x.N > 60],
          ['Available cooling', f(x.Qavail, 2), 'MW', sim.eq.K301 && x.Qavail < x.Qevap], ['Reactor TI-100', f(mm.Tr, 1), '°C', /temperature/.test(out)]],
      3: [['PSV-301', x.psvOpen ? 'OPEN' : 'CLOSED', '', x.psvOpen], ['Relief flow FI-401', f(x.Wpsv, 1), 't/h', x.Wpsv > 0.5],
          ['Header PI-401', f(mm.Ph, 2), 'barg', mm.Ph > 0.5], ['KO drum LI-401', f(mm.Lko, 0), '%', mm.Lko > 50],
          ['Flame', FLAME_TXT[x.flame].split(' ')[0], '', x.flame === 'smoky' || x.flame === 'oversteamed'], ['Steam / HC', x.hc >= 1 ? f(x.ratio, 2) : '—', '', x.hc >= 1 && (x.ratio < 0.3 || x.ratio > 1.5)]],
      4: [['Column PI-502', f(mm.Pc, 2), 'barg', mm.Pc > Alky.C5.pah], ['Tray TI-501', f(mm.Ttray, 1), '°C', mm.Ttray < 128 || mm.Ttray > 152],
          ['Reboiler steam', f(x.st501, 1), 't/h', sim.eq.rebTrip], ['Reflux FI-502', f(x.L5, 0), 'kmol/h', false],
          ['iC4 recycle purity', f(x.pur5, 1), '%', x.pur5 < 92], ['iC4 in alkylate', f(x.ic4b, 1), '%', x.ic4b > 5]],
      5: [['Header PI-605', f(mm.Psh, 2), 'barg', mm.Psh < 9.3 || mm.Psh > 11.8], ['Steam generation', f(x.gen, 1), 't/h', false],
          ['Fuel gas', f(x.fuel, 2), 't/h', false], ['Flue O₂', f(mm.O2, 1), '%', x.bms === 'FIRING' && mm.O2 < 1],
          ['Drum level', f(mm.Ldr, 0), '%', mm.Ldr < 30 || mm.Ldr > 75], ['Burner management', x.bms, '', x.bms !== 'FIRING']],
      6: [['Receiver PI-701', f(mm.Prec, 2), 'barg', mm.Prec < 6.3], ['IA header PI-702', f(mm.Pia, 2), 'barg', mm.Pia < Alky.U.air.iaLow],
          ['Compressors', (sim.eq.K701 ? 'K-701 ' : '') + (sim.eq.K702 ? 'K-702' : '') || 'NONE', '', !sim.eq.K701 && !sim.eq.K702], ['Valve fail-safe', x.iaFail ? 'ACTIVE' : 'normal', '', x.iaFail],
          ['LN₂ tank', f(x.Ln2, 1), '%', x.Ln2 < 20], ['N₂ header', f(mm.Pn2, 2), 'barg', mm.Pn2 < 5]],
      7: [['TK-901 LT / radar', f(mm.L901, 0) + ' / ' + f(x.tk['TK-901'].L, 0), '%', Math.abs(mm.L901 - x.tk['TK-901'].L) > 3 || x.tk['TK-901'].L > 85],
          ['TK-902 isobutane', f(x.tk['TK-902'].L, 0), '%', x.tk['TK-902'].L < 15 || x.tk['TK-902'].L > 85],
          ['TK-903 alkylate', f(x.tk['TK-903'].L, 0), '%', x.tk['TK-903'].L > 85],
          ['TK-904 / 905 acid', f(x.tk['TK-904'].L, 0) + ' / ' + f(x.tk['TK-905'].L, 0), '%', x.tk['TK-904'].L < 15 || x.tk['TK-905'].L > 85],
          ['Truck bay', x.truck.state === 'none' ? 'empty' : x.truck.state, '', false],
          ['Truck load', x.truck.state === 'none' ? '—' : f(x.truck.amt, 1), 't', false]],
      8: [['Turbine speed SI-1001', f(x.tg.N, 0), 'rpm', x.tg.N > 3150 || x.tg.vib > 75], ['Generator JI-1001', f(x.tg.Pe, 2), 'MW', x.tg.tripped],
          ['Condenser PI-1001', f(x.tg.Pcond, 3), 'bara', x.tg.Pcond > 0.2], ['Turbine steam FI-1001', f(x.tg.Ftg, 1), 't/h', x.tg.runback],
          ['Hotwell LI-1001', f(x.tg.Lhw, 0), '%', x.tg.Lhw < 20 || x.tg.Lhw > 75], ['Governor mode', x.tg.latched ? x.tg.mode : x.tg.tripped ? 'TRIPPED' : 'OFF', '', x.tg.tripped]],
      9: [['Bus frequency', f(x.el.f, 2), 'Hz', x.el.f > 1 && (x.el.f < 49.5 || x.el.f > 50.5)], ['Bus voltage', f(x.el.Vbus, 2), 'kV', x.el.Vbus < 10.5],
          ['TNB import', f(x.el.imp, 2), 'MW', x.el.imp > Alky.E.maxDemand], ['Generation', f(x.tg.Pe, 2), 'MW', false],
          ['Plant load', f(x.el.load, 2), 'MW', false], ['TNB grid', x.el.gridOK ? (sim.eq.CB1101 ? 'CONNECTED' : 'LIVE · CB open') : 'LOST', '', !x.el.gridOK || !sim.eq.CB1101]],
      10: [['Deaerator PI-1201', f(x.da.P, 2), 'barg', x.da.P < 0.2], ['Deaerator level', f(x.da.L, 0), '%', x.da.L < 30 || x.da.L > 85],
           ['Feedwater O₂', f(x.da.O2, 0), 'ppb', x.da.O2 > 20], ['Demin conductivity', f(x.dm.cond, 2), 'µS/cm', x.dm.cond > 1],
           ['Condensate AI-1208', f(x.cr.cond, 0), 'µS/cm', x.cr.cond > 20], ['Boiler water TDS', f(x.bw.tds, 0), 'ppm', x.bw.tds > 2500]],
      11: [['Pit pH AIC-1304', f(x.ww.ph4, 2), '', x.ww.ph4 < 6 || x.ww.ph4 > 9], ['Effluent pH AI-1305', f(x.ww.ph5, 2), '', x.ww.ph5 < 5.5 || x.ww.ph5 > 9],
           ['Effluent oil', f(x.ww.oil5, 1), 'mg/L', x.ww.oil5 > 10], ['Effluent temp', f(x.ww.T5, 1), '°C', x.ww.T5 > 40],
           ['Equalisation LI-1302', f(x.ww.Leq, 0), '%', x.ww.Leq > 80], ['Outfall XV-1305', sim.eq.XV1305 ? 'OUTFALL' : 'RECYCLE', '', x.ww.offspec && sim.eq.XV1305]],
    }[ui.page];
    $('kpis').innerHTML = K.map(([n, v, u, o]) =>
      `<div class="kpi${o ? ' out' : ''}"><div class="k">${n}${o ? ' <span class="flag">· ABNORMAL</span>' : ''}</div><div class="v">${v}<span class="u">${u}</span></div></div>`).join('');
  }

  // ---------------- faceplates ----------------
  const CTRL = {
    'TIC-100': { c: () => sim.tic100, desc: 'Reactor temperature → TV-100 refrigerant valve. Direct acting: higher output = more cooling.', pv: () => m().Tr, lo: 0, hi: 20, dec: 1, step: 0.5, zv: () => sim.x.zc, valve: 'TV-100', color: '--pen-temp',
                 hint: `Training limits ${LIMITS.tLo}–${LIMITS.tHi} °C · TAH 11 · TAHH 13.5 · trip TZHH-100 at 15 °C` },
    'FIC-101': { c: () => sim.fic101, desc: 'Olefin feed flow → FV-101 (via XV-101 isolation).', pv: () => m().Fo, lo: 0, hi: 240, dec: 0, step: 10, zv: () => sim.x.zFo, valve: 'FV-101', color: '--pen-olefin',
                 hint: 'Design 120 kmol/h. Reaction heat is proportional to olefin rate. Compare valve feedback with controller output.' },
    'FIC-102': { c: () => sim.fic102, desc: 'Isobutane (recycle + make-up) flow → FV-102.', pv: () => m().Fi, lo: 0, hi: 1800, dec: 0, step: 50, zv: () => sim.x.zFi, valve: 'FV-102', color: '--pen-demand',
                 hint: `Design 1080 kmol/h. Keep I/O molar ratio ≥ ${LIMITS.ioLo}.` },
    'PIC-301': { c: () => sim.pic301, desc: 'K-301 capacity control: suction pressure → VFD speed (OP 20–100 % = 40–100 % speed). Below 20 % output it also opens FV-302 hot-gas bypass.', pv: () => m().Ps, lo: 0, hi: 8, dec: 2, step: 0.1, zv: () => sim.x.N, valve: 'Speed', color: '--pen-demand',
                 hint: `Normal SP ${R.psSP.toFixed(2)} barg (≈ −5 °C evaporating). PAH-301 at ${R.pah301} barg. A higher setpoint means warmer refrigerant, not more capacity.`,
                 extra: () => [['Speed demand', f(sim.x.Ndem, 0) + ' %'], ['VFD speed limit', f(sim.x.speedLim, 0) + ' % (channel ' + sim.x.vfdCh + ')'], ['Evaporating temp TI-301', f(m().Tref, 1) + ' °C']] },
    'UIC-301': { c: () => sim.uic301, desc: 'Anti-surge controller. PV = surge margin from FT-302 flow and pressures. Opens FV-302 recycle when the margin falls below SP.', pv: () => m().SMmeas, lo: -20, hi: 250, dec: 0, step: 1, zv: () => sim.x.zR, valve: 'FV-302', color: '--pen-duty',
                 hint: 'The calculated margin uses speed and pressures only - compare it with the measured margin to spot a failed FT-302. In MAN, do not close FV-302 if the calculated margin is below ~10 %.',
                 extra: () => [['Surge margin (calculated)', f(sim.x.SM, 0) + ' %'], ['Surge margin (measured)', f(m().SMmeas, 0) + ' %'], ['Recycle flow', f(sim.x.Qrec, 2) + ' MW-eq']] },
    'FIC-402': { c: () => sim.fic402, desc: 'Flare assist steam from the MP utility steam header (no dedicated boiler). AUTO = flow control; RATIO = steam follows hydrocarbon flow to the tip.', pv: () => m().steam, lo: 0, hi: 16, dec: 1, step: 0.5, zv: () => sim.x.zS, valve: 'FV-402', color: '--pen-demand',
                 hint: `Smokeless window: steam/HC 0.3–1.5. Minimum tip-cooling steam ${R.steamMin} t/h. Sustained over-steaming snuffs pilots.`, ratio: true,
                 extra: () => [['HC to flare tip', f(sim.x.hc, 1) + ' t/h'], ['Steam / HC ratio', sim.x.hc >= 1 ? f(sim.x.ratio, 2) : '— (idle)'], ['Flame', FLAME_TXT[sim.x.flame]], ['MP steam header PI-605 (B-601)', f(sim.x.Psh, 1) + ' barg']] },
    'PIC-103': { c: () => sim.pic103, desc: 'Reactor system back-pressure. PV-103 lets effluent leave D-102 for T-501 and holds R-101 / D-102 liquid-full at 6 barg.', pv: () => m().Pr, lo: 0, hi: 12, dec: 2, step: 0.2, zv: () => sim.x.zPV103, valve: 'PV-103', color: '--pen-demand',
                 hint: 'PSV-101 relieves at 10.0 barg. Closing PV-103 (MAN 0 %) blocks the outlet: the feed pumps push the pressure up to the relief valve.',
                 extra: () => [['Effluent to T-501', f(sim.x.Fout, 0) + ' kmol/h'], ['PSV-101', sim.x.psv['PSV-101'].open ? 'OPEN ' + f(sim.x.psv['PSV-101'].W, 1) + ' t/h' : 'closed']] },
    'TIC-501': { c: () => sim.tic501, desc: 'T-501 control-tray temperature → FV-501 reboiler steam. Reverse acting: tray too cold (isobutane slipping into the alkylate) → more steam.', pv: () => m().Ttray, lo: 60, hi: 190, dec: 1, step: 1, zv: () => sim.x.z501, valve: 'FV-501', color: '--pen-temp',
                 hint: 'Normal 140 °C. PSHH-502 closes FV-501 at 8.6 barg column pressure; reset it here once pressure is below 7.5 barg.', reb: true,
                 extra: () => [['Reboiler steam FI-501', f(sim.x.st501, 1) + ' t/h'], ['Boil-up', f(sim.x.V5, 0) + ' kmol/h'], ['PSHH-502 steam trip', sim.eq.rebTrip ? 'TRIPPED' : 'normal'], ['MP steam header', f(sim.x.Psh, 1) + ' barg']] },
    'PIC-502': { c: () => sim.pic502, desc: 'T-501 overhead pressure → E-502 condenser cooling water valve. Direct acting: pressure high → more cooling water.', pv: () => m().Pc, lo: 0, hi: 10, dec: 2, step: 0.1, zv: () => sim.x.zCW5, valve: 'CW valve', color: '--pen-demand',
                 hint: 'Normal 6.5 barg. PAH-502 8.0 · PSHH-502 8.6 (cuts reboiler steam) · PSV-501 9.0 barg to flare.',
                 extra: () => [['Top temperature TI-502', f(sim.x.Ttop, 1) + ' °C'], ['PSV-501', sim.x.psv['PSV-501'].open ? 'OPEN' : 'closed']] },
    'FIC-502': { c: () => sim.fic502, desc: 'T-501 reflux flow from P-502 back to the top tray.', pv: () => m().L5, lo: 0, hi: 2600, dec: 0, step: 50, zv: () => sim.x.zL, valve: 'FV-502', color: '--pen-demand',
                 hint: 'Normal 1300 kmol/h (reflux ratio ≈ 1.35). Too little reflux lets heavy material into the isobutane recycle.',
                 extra: () => [['Reflux / distillate', sim.x.D5 > 1 ? f(sim.x.L5 / sim.x.D5, 2) : 'total reflux']] },
    'LIC-502': { c: () => sim.lic502, desc: 'D-502 reflux drum level → FV-504 distillate (isobutane recycle to the reactor).', pv: () => m().Ld, lo: 0, hi: 100, dec: 0, step: 5, zv: () => sim.x.zD, valve: 'FV-504', color: '--pen-duty',
                 hint: 'Distillate goes back to the reactor as isobutane recycle (x2). Make-up (x5) covers the difference.',
                 extra: () => [['Recycle FI-504', f(sim.x.D5, 0) + ' kmol/h'], ['Recycle purity AI-502', f(sim.x.pur5, 1) + ' %'], ['Make-up FI-105', f(sim.x.mk, 0) + ' kmol/h']] },
    'LIC-501': { c: () => sim.lic501, desc: 'T-501 bottoms level → FV-503 alkylate product (x4).', pv: () => m().Lb, lo: 0, hi: 100, dec: 0, step: 5, zv: () => sim.x.zB, valve: 'FV-503', color: '--pen-temp',
                 hint: 'Alkylate spec: isobutane ≤ 5 % (AI-503). Off-spec means too little boil-up.',
                 extra: () => [['Alkylate FI-503', f(sim.x.B5, 0) + ' kmol/h'], ['iC4 in alkylate AI-503', f(sim.x.ic4b, 1) + ' %']] },
    'PIC-601': { c: () => sim.pic601, desc: 'MP steam header pressure → boiler firing (FV-601 fuel gas). Reverse acting: header pressure low → more fuel. Fuel is cross-limited by combustion air.', pv: () => m().Psh, lo: 0, hi: 14, dec: 2, step: 0.1, zv: () => sim.x.zFuel, valve: 'FV-601', color: '--pen-demand',
                 hint: 'Normal 10.5 barg. PSHH-601 trips the burners at 12.5 barg drum pressure; PSV-601 vents at 13.0 barg.',
                 extra: () => [['Steam generation FI-603', f(sim.x.gen, 1) + ' t/h'], ['Header demand', f(sim.x.stUse, 1) + ' t/h'], ['Drum pressure PI-601', f(sim.x.Pdrum, 2) + ' barg'], ['Fuel gas FI-601', f(sim.x.fuel, 2) + ' t/h'], ['Burner management', sim.x.bms]] },
    'FIC-602': { c: () => sim.fic602, desc: 'Combustion air from FD fan K-601 (damper). RATIO = air follows fuel at the set excess air. The burner management drives it to purge position during a purge.', pv: () => m().air, lo: 0, hi: 60, dec: 1, step: 1, zv: () => sim.x.zAir, valve: 'Damper', color: '--pen-temp',
                 hint: 'Normal 15 % excess air (O₂ ≈ 2.7 %). O₂ below 1 % risks CO and smoke.', ratio: true, ratioLbl: 'Excess air %', ratioTag: 'FIC-602',
                 extra: () => [['Excess air', f(sim.x.EA * 100, 0) + ' %'], ['Flue O₂ AI-601', f(m().O2, 1) + ' %'], ['FD fan K-601', sim.eq.K601 ? 'RUNNING' : 'STOPPED']] },
    'LIC-601': { c: () => sim.lic601, desc: 'B-601 steam drum level → LV-601 boiler feedwater. Reverse acting: level low → more feedwater.', pv: () => m().Ldr, lo: 0, hi: 100, dec: 0, step: 5, zv: () => sim.x.zBfw, valve: 'LV-601', color: '--pen-demand',
                 hint: 'Swell/shrink: the level jumps briefly when steam demand changes. LALL-601 (15 %) and LAHH-601 (85 %) trip the burners.',
                 extra: () => [['BFW FI-604', f(sim.x.bfw, 1) + ' t/h'], ['Steam FI-603', f(sim.x.gen, 1) + ' t/h'], ['BFW pumps A / B', (sim.eq.P601A ? 'RUN' : 'STOP') + ' / ' + (sim.eq.P601B ? 'RUN' : 'STBY')]] },
  };
  const PUMPS = {
    'P-101': { desc: 'Olefin feed pump', flow: () => f(m().Fo, 0) + ' kmol/h', ctrl: 'FIC-101', note: 'Stopping P-101 forces FIC-101 to MAN 0 %. To restart: Start P-101, make sure XV-101 is open, then put FIC-101 back in AUTO (or raise its output).' },
    'P-102': { desc: 'Isobutane feed pump', flow: () => f(m().Fi, 0) + ' kmol/h', ctrl: 'FIC-102', note: 'Isobutane must keep circulating to hold the I/O ratio. Stopping P-102 forces FIC-102 to MAN 0 %.' },
    'P-201': { desc: 'Acid recirculation pump (settler → reactor return line)', flow: () => f(m().Facid, 0) + ' m3/h', note: 'Acid circulation is needed for reaction and emulsion mixing.' },
    'P-303A': { desc: 'E-301 condenser cooling water pump A (duty)', flow: () => 'FI-303 ' + f(m().cw, 0) + ' % CW flow', note: 'P-303B is the standby. If A trips or underperforms, start B.' },
    'P-303B': { desc: 'E-301 condenser cooling water pump B (standby)', flow: () => 'FI-303 ' + f(m().cw, 0) + ' % CW flow', note: 'Normally on auto-start standby. Running A and B together is allowed.' },
    'P-401': { desc: 'D-401 flare knockout drum pump-out (to slop)', flow: () => (sim.eq.P401 ? f(R.koPump, 1) : '0.0') + ' t/h · LI-401 ' + f(m().Lko, 0) + ' %', note: 'Start at LAH-401 (50 %). Liquid reaching the flare tip (LAHH-401, 75 %) is a burning-liquid hazard.' },
    'P-502': { desc: 'T-501 reflux / distillate pump', flow: () => 'reflux ' + f(sim.x.L5, 0) + ' · recycle ' + f(sim.x.D5, 0) + ' kmol/h', note: 'Stopping P-502 stops reflux and isobutane recycle: the reflux drum fills and the column floods.' },
    'P-601A': { desc: 'B-601 boiler feedwater pump A (duty)', flow: () => 'FI-604 ' + f(sim.x.bfw, 1) + ' t/h', note: 'Losing both BFW pumps empties the drum: LALL-601 trips the burners at 15 %.' },
    'P-601B': { desc: 'B-601 boiler feedwater pump B (standby)', flow: () => 'FI-604 ' + f(sim.x.bfw, 1) + ' t/h', note: 'Standby. Start it if P-601A is lost.' },
    'K-601': { desc: 'B-601 forced-draft (FD) fan - combustion and purge air', flow: () => 'air ' + f(sim.x.air, 1) + ' t/h · damper ' + f(sim.x.zAir, 0) + ' %', note: 'Combustion air comes from this fan, not from the plant air system. Stopping it while firing trips the burners. It must run for the furnace purge.' },
    'K-701': { desc: 'Plant / instrument air compressor (duty), load/unload control 7.0–7.8 barg', flow: () => (sim.x.ld701 ? 'LOADED ' : 'unloaded ') + '· receiver ' + f(m().Prec, 2) + ' barg', note: 'If it stops, standby K-702 auto-starts at 6.5 barg (when armed). Instrument air below 3.5 barg sends every control valve to its fail position.' },
    'K-702': { desc: 'Plant / instrument air compressor (standby)', flow: () => (sim.x.ld702 ? 'LOADED ' : sim.eq.K702 ? 'unloaded ' : 'standby ') + '· auto-start ' + (sim.eq.k702auto ? 'ARMED' : 'OFF'), note: 'Auto-start on low receiver pressure (6.5 barg) when armed.', auto: true },
  };
  const INFO = {
    'E-101': { title: 'E-101 feed pre-cooler', desc: 'Chills combined olefin + isobutane feed with refrigerant before the reactor.',
      rows: () => [['TI-102 outlet temperature', f(m().Tpc, 1) + ' °C'], ['Feed flow (total)', f(m().Fo + m().Fi, 0) + ' kmol/h'], ['Refrigerant TI-301', f(m().Tref, 1) + ' °C']], note: 'Normal outlet ≈ 10.8 °C. TAH-102 at 14 °C.' },
    'R-101': { title: 'R-101 alkylation contactor', desc: 'Acid/hydrocarbon emulsion; reaction heat removed by refrigerant tube bundle (TV-100).',
      rows: () => [['TI-100 temperature', f(m().Tr, 1) + ' °C'], ['Olefin feed', f(m().Fo, 0) + ' kmol/h'], ['I/O molar ratio', f(m().io, 1)], ['Reactor heat load', f(sim.x.load, 2) + ' MW'], ['Delivered duty', f(sim.x.qcool, 2) + ' MW']], note: 'Click TIC-100 to operate temperature control.' },
    'D-102': { title: 'D-102 acid settler', desc: 'Separates acid from hydrocarbon. Acid returns to R-101 via P-201.',
      rows: () => [['TI-103 settler temperature', f(m().Tset, 1) + ' °C'], ['LI-103 acid level', f(m().Lset, 0) + ' %'], ['AI-201 acid strength', f(m().acidStr, 2) + ' wt%'], ['FI-201 acid return', f(m().Facid, 0) + ' m3/h']], note: 'Acid strength falls slowly if the reactor runs hot (above 12 °C).' },
    'D-302': { title: 'D-302 compressor suction drum', desc: 'Separates any liquid refrigerant carried over from the R-101 bundle and E-101 before it can reach K-301.',
      rows: () => [['LI-302 level', f(m().Ldrum, 0) + ' %'], ['PI-301 suction pressure', f(m().Ps, 2) + ' barg'], ['TI-302 suction temperature', f(m().Ts, 1) + ' °C'], ['Evaporating temperature', f(m().Tref, 1) + ' °C']],
      note: 'LAH-302 at 50 %. LAHH-302 at 75 % trips K-301 (liquid slugging). A normal level rules out liquid carryover as a cause.' },
    'E-301': { title: 'E-301 refrigerant condenser', desc: 'Condenses K-301 discharge vapour with cooling water from P-303A / P-303B.',
      rows: () => [['FI-303 CW flow', f(m().cw, 0) + ' %'], ['P-303A / P-303B', (sim.eq.P303A ? 'RUN' : 'STOP') + ' / ' + (sim.eq.P303B ? 'RUN' : 'STBY')], ['PI-303 condensing pressure', f(m().Pd, 1) + ' barg'], ['Condensing temperature', f(Alky.tsat(sim.x.Pd), 1) + ' °C'], ['CW supply temperature', R.Tcw + ' °C']],
      note: 'Less CW → hotter condensing → higher discharge pressure → K-301 moves less vapour at the same speed (and nears surge).', go: ['P-303A', 'P-303B'] },
    'D-301': { title: 'D-301 refrigerant accumulator', desc: 'Liquid refrigerant receiver. Feeds TV-100 (R-101 bundle) and E-101. Protected by PSV-301 to the flare.',
      rows: () => [['PI-303 pressure', f(m().Pd, 2) + ' barg'], ['LI-301 level', f(m().Lacc, 0) + ' %'], ['PSV-301', sim.x.psvOpen ? 'OPEN' : 'closed']], note: 'Refrigerant lost to the flare lowers LI-301. Below ~15 % the evaporators starve.', go: ['PSV-301'] },
    'T-501': { title: 'T-501 deisobutanizer', desc: 'Separates reactor effluent: isobutane overhead (recycled to R-101), alkylate from the bottom.',
      rows: () => [['Feed from D-102', f(sim.x.F5, 0) + ' kmol/h'], ['Pressure PI-502', f(m().Pc, 2) + ' barg'], ['Tray TI-501', f(m().Ttray, 1) + ' °C'], ['Boil-up', f(sim.x.V5, 0) + ' kmol/h'], ['Reflux / recycle / alkylate', f(sim.x.L5, 0) + ' / ' + f(sim.x.D5, 0) + ' / ' + f(sim.x.B5, 0) + ' kmol/h'], ['Recycle purity / iC4 in alkylate', f(sim.x.pur5, 1) + ' % / ' + f(sim.x.ic4b, 1) + ' %']],
      note: 'Controls: TIC-501 (reboiler steam), PIC-502 (condenser), FIC-502 (reflux), LIC-502 (recycle draw), LIC-501 (alkylate draw).', go: ['TIC-501', 'PIC-502', 'FIC-502'] },
    'E-501': { title: 'E-501 reboiler', desc: 'Steam-heated reboiler. MP steam from B-601 (page 5) through FV-501.',
      rows: () => [['Steam FI-501', f(sim.x.st501, 1) + ' t/h'], ['Duty', f(sim.x.st501 / 3.6 * Alky.C5.hs, 1) + ' MW'], ['Steam header PI-605', f(sim.x.Psh, 2) + ' barg'], ['PSHH-502 trip', sim.eq.rebTrip ? 'TRIPPED' : 'normal']], note: 'Low steam-header pressure starves the reboiler: alkylate goes off-spec.', go: ['TIC-501'], page: 5 },
    'E-502': { title: 'E-502 overhead condenser', desc: 'Cooling-water condenser for T-501 overhead. PIC-502 sets the CW valve.',
      rows: () => [['CW valve', f(sim.x.zCW5, 0) + ' %'], ['Top temperature TI-502', f(sim.x.Ttop, 1) + ' °C'], ['Column pressure', f(m().Pc, 2) + ' barg']], note: 'Losing condenser cooling raises column pressure toward PSHH-502 and PSV-501.', go: ['PIC-502'] },
    'D-502': { title: 'D-502 reflux drum', desc: 'Receives condensed overhead. P-502 sends reflux to T-501 and isobutane recycle to the reactor.',
      rows: () => [['LI-502 level', f(m().Ld, 0) + ' %'], ['Reflux', f(sim.x.L5, 0) + ' kmol/h'], ['Recycle', f(sim.x.D5, 0) + ' kmol/h']], note: '', go: ['LIC-502', 'FIC-502', 'P-502'] },
    'B-601': { title: 'B-601 water-tube boiler', desc: 'Fuel-gas fired water-tube boiler (steam drum over mud drum) supplying the MP steam header: T-501 reboiler, flare assist steam and other users.',
      rows: () => [['Burner management', sim.x.bms + (sim.x.bms === 'PURGING' ? ` (${Math.floor(sim.x.purgeT)} / 60 s)` : '')], ['Flame', sim.x.bms === 'FIRING' && sim.x.fuel > 0.05 ? 'ON' : 'OFF'], ['Steam generation', f(sim.x.gen, 1) + ' t/h'], ['Drum pressure / level', f(sim.x.Pdrum, 2) + ' barg / ' + f(m().Ldr, 0) + ' %'], ['Fuel / air', f(sim.x.fuel, 2) + ' / ' + f(sim.x.air, 1) + ' t/h'], ['Flue O₂', f(m().O2, 1) + ' %'], ['FD fan K-601', sim.eq.K601 ? 'RUNNING' : 'STOPPED']],
      note: 'Relight after a trip: run K-601 → Start purge (60 s of air through the furnace) → Light-off. Trips: drum pressure 12.5 barg, drum level 15 / 85 %, loss of air, loss of instrument air.', go: ['PIC-601', 'FIC-602', 'LIC-601'], bms: true },
    'D-701': { title: 'D-701 plant air receiver', desc: 'Air buffer for K-701 / K-702. Feeds the instrument air dryer and, through PV-702, plant air.',
      rows: () => [['PI-701', f(m().Prec, 2) + ' barg'], ['Compressor supply', f(sim.x.airSup, 1) + ' t/h'], ['PSV-701', sim.x.psv['PSV-701'].open ? 'OPEN' : 'closed']], note: 'Load 7.0 / unload 7.8 barg. PV-702 shuts plant air below 6.0 barg so instrument air keeps priority.', go: ['K-701', 'K-702'] },
    'A-701': { title: 'A-701 instrument air dryer and header', desc: 'Dries air to −40 °C dew point for every control valve positioner on all pages.',
      rows: () => [['PI-702 IA header', f(m().Pia, 2) + ' barg'], ['Valve fail-safe', sim.x.iaFail ? 'ACTIVE' : 'normal']],
      note: 'Below 3.5 barg: FV-101 closes (olefin stops), FV-102/TV-100/FV-302/FV-402 open, FV-501 (reboiler steam) and the boiler fuel valve close (boiler trips).' },
    'PV-702': { title: 'PV-702 plant air priority valve', desc: 'Closes plant air when receiver pressure falls below 6.0 barg so instrument air keeps priority.',
      rows: () => [['Status', sim.x.Prec > Alky.U.air.paShut ? 'OPEN' : 'SHUT'], ['Receiver', f(m().Prec, 2) + ' barg']], note: 'Self-acting.' },
    'TK-801': { title: 'TK-801 liquid nitrogen storage + E-801 vaporizer', desc: 'Nitrogen for flare header purge, K-301 seal gas and T-501 purging at startup/shutdown.',
      rows: () => [['LI-801 level', f(sim.x.Ln2, 1) + ' %'], ['N₂ header PIC-801', f(m().Pn2, 2) + ' barg'], ['N₂ use', f(sim.x.n2Use, 2) + ' t/h']], note: 'LAL-801 at 20 %: call for a tanker.', go: ['HV-801', 'HV-802'] },
    'E-801': { title: 'E-801 ambient-air vaporizer', desc: 'Vaporizes liquid nitrogen from TK-801 into the N₂ header.', rows: () => [['N₂ header', f(m().Pn2, 2) + ' barg']], note: '' },
    'D-401': { title: 'D-401 flare knockout drum', desc: 'Removes liquid from the relief stream before the flare stack.',
      rows: () => [['LI-401 level', f(m().Lko, 0) + ' %'], ['Liquid in (carryover)', f(R.carry * sim.x.Wpsv, 1) + ' t/h'], ['P-401 pump-out', sim.eq.P401 ? 'RUNNING ' + R.koPump + ' t/h' : 'STOPPED']], note: 'LAH-401 50 %, LAHH-401 75 %. Start P-401 before the level gets high.', go: ['P-401'] },
    'HDR': { title: 'Flare header', desc: 'Collects relief from PSV-301 and other units; continuous purge gas keeps air out.',
      rows: () => [['PI-401 header pressure', f(m().Ph, 2) + ' barg'], ['TI-401 header temperature', f(sim.x.Tfh, 0) + ' °C'], ['Relief flow FI-401', f(sim.x.Wpsv, 1) + ' t/h'], ['Purge gas', R.purge + ' t/h']], note: 'PAH-401 at 0.5 barg. Flashing refrigerant chills the header.' },
    'F-401': { title: 'F-401 steam-assisted flare', desc: 'Elevated flare with three pilots and assist steam (FIC-402) for smokeless burning.',
      rows: () => [['Flame', FLAME_TXT[sim.x.flame]], ['HC to tip', f(sim.x.hc, 1) + ' t/h'], ['Assist steam', f(m().steam, 1) + ' t/h'], ['Steam / HC', sim.x.hc >= 1 ? f(sim.x.ratio, 2) : '—'], ['Pilots A / B / C', sim.eq.pilots.map(p => (p ? 'LIT' : 'OUT')).join(' / ')], ['Smoking time', Math.round(sim.x.smokeT) + ' s']],
      note: 'Smokeless at steam/HC 0.3–1.5. Below 0.3 the flame smokes; above 1.5 it is over-steamed and pilots can be snuffed.', go: ['FIC-402'], pilots: true },
  };
  // tank farm faceplates
  const TF = Alky.TF;
  Object.keys(TF.tanks).forEach(k => {
    const d = TF.tanks[k], n = k.slice(3), press = d.kind === 'press';
    INFO[k] = { title: `${k} ${d.name}`, tank: k,
      desc: press ? `Pressurised bullet (${d.cap} t). PSV-${n} relieves to the flare at 10 barg.` : `Atmospheric tank (${d.cap} t) with N₂ blanket PCV-${n} and pressure/vacuum vent PVRV-${n}.`,
      rows: () => {
        const s = sim.x.tk[k];
        const r = [['Level', k === 'TK-901' ? `LT-901 ${f(m().L901, 1)} % · radar LI-901B ${f(s.L, 1)} %` : f(s.L, 1) + ' %'], ['Inventory', f(s.L / 100 * d.cap, 1) + ' / ' + d.cap + ' t'], ['Net flow', (s.net >= 0 ? '+' : '') + f(s.net, 1) + ' t/h']];
        if (press) r.push(['Pressure PI-' + n, f(s.P, 2) + ' barg'], ['PSV-' + n, sim.x.psv['PSV-' + n].open ? 'OPEN' : 'closed']);
        else r.push(['Vapour space', f(s.P, 0) + ' mbarg' + (s.vent ? ' (PVRV venting)' : s.vac ? ' (VACUUM - air in)' : '')], ['O₂ in vapour space', f(s.O2, 1) + ' %'], ['N₂ blanket PCV-' + n, sim.eq['PCV' + n] ? 'in service' : 'CLOSED']);
        r.push(['Truck transfer', d.dir === 'in' ? 'unloading via ' + d.pump : 'loading via ' + d.pump]);
        return r;
      },
      note: d.dir === 'in' ? `Call a truck, then start ${d.pump}. LAHH-${n} stops unloading at 95 %.` : `Call a truck, then start ${d.pump}. It stops when the truck is full or the tank is low.`,
      go: press ? [] : ['PCV-' + n], page: null };
    PUMPS[d.pump] = { desc: `${k} truck ${d.dir === 'in' ? 'unloading' : 'loading'} pump (${d.rate} t/h)`, flow: () => {
      const t = sim.x.truck; return t.tank === k && t.state === 'connected' ? `truck ${f(t.amt, 1)} / ${TF.truckCap} t · ${k} ${f(sim.x.tk[k].L, 0)} %` : 'no matching truck at bay U-1'; },
      note: `Start is refused unless the ${d.truck.toLowerCase()} truck is connected. Stops by itself when the transfer is complete.` };
  });
  INFO.TRUCK = { title: 'Truck bay U-1', desc: 'One truck at a time. A called truck arrives and connects after 30 s.',
    rows: () => { const t = sim.x.truck; return t.state === 'none' ? [['Status', 'empty bay']] :
      [['Truck', TF.tanks[t.tank].truck], ['Status', t.state === 'arriving' ? `arriving in ${Math.max(0, Math.ceil(t.eta - sim.t))} s` : 'CONNECTED'], ['Load', f(t.amt, 1) + ' / ' + TF.truckCap + ' t'], ['Tank / pump', t.tank + ' / ' + TF.tanks[t.tank].pump]]; },
    note: 'Release the truck after the pump stops.' };
  INFO['F-401'].go = ['FIC-402', 'HV-403', 'HV-404'];
  INFO['B-601'].go = ['PIC-601', 'FIC-602', 'LIC-601', 'MSV-601'];
  CTRL['FIC-203'] = { c: () => sim.fic203, desc: 'Fresh acid (x3) from TK-904 to the acid system.', pv: () => sim.x.Ff, lo: 0, hi: 2, dec: 2, step: 0.1, zv: () => sim.x.zFf, valve: 'FV-203', color: '--pen-temp',
    hint: 'Normal 0.6 t/h. Fresh acid holds acid strength near 90.5 wt%.', extra: () => [['Acid strength AI-201', f(sim.x.acidStr, 2) + ' wt%'], ['TK-904 level', f(sim.x.tk['TK-904'].L, 0) + ' %']] };
  CTRL['LIC-103'] = { c: () => sim.lic103, desc: 'D-102 acid level → spent acid draw to TK-905.', pv: () => m().Lset, lo: 0, hi: 100, dec: 0, step: 5, zv: () => sim.x.zSp, valve: 'FV-204', color: '--pen-duty',
    hint: 'Spent acid out balances fresh acid in. Level rises when P-201 stops (acid drains back from R-101).', extra: () => [['Spent acid FI-204', f(sim.x.Fsp, 2) + ' t/h'], ['TK-905 level', f(sim.x.tk['TK-905'].L, 0) + ' %']] };

  // ---- pages 8-11: controllers ----
  const xx = () => sim.x;
  Object.assign(CTRL, {
    'LIC-1001': { c: () => sim.lic1001, desc: 'E-1001 hotwell level → LV-1001 condensate to the deaerator (P-1001A/B).', pv: () => xx().tg.Lhw, lo: 0, hi: 100, dec: 0, step: 5, zv: () => xx().zHw, valve: 'LV-1001', color: '--pen-duty',
      hint: 'Too high floods the condenser tubes (vacuum falls, LAHH trips the turbine at 92 %). Too low starves the condensate pumps.', extra: () => [['Condensate FI-1002', f(xx().tg.Fhw, 1) + ' t/h'], ['Exhaust steam', f(xx().tg.Ftg, 1) + ' t/h']] },
    'LIC-1201': { c: () => sim.lic1201, desc: 'D-1201 deaerator level → LV-1201 demin make-up (P-1206A/B from TK-1204).', pv: () => xx().da.L, lo: 0, hi: 100, dec: 0, step: 5, zv: () => xx().zMk, valve: 'LV-1201', color: '--pen-duty',
      hint: 'Make-up replaces steam and condensate that do not come back (flare steam, losses, blowdown, dumped condensate). LALL-1201 at 5 % stops the BFW pumps.',
      extra: () => [['Make-up FI-1201', f(xx().dm.Fmk, 1) + ' t/h'], ['Turbine condensate', f(xx().tg.Fhw, 1) + ' t/h'], ['Process condensate', f(xx().cr.toDA, 1) + ' t/h'], ['BFW out', f(xx().bfw, 1) + ' t/h']] },
    'PIC-1201': { c: () => sim.pic1201, desc: 'D-1201 deaerator pressure → PV-1201 pegging steam from the MP header. Steam heats the water to saturation and strips the oxygen.', pv: () => xx().da.P, lo: 0, hi: 1.5, dec: 2, step: 0.05, zv: () => xx().zPeg, valve: 'PV-1201', color: '--pen-temp',
      hint: 'Normal 0.35 barg ≈ 108 °C. Low pressure means sub-cooled water and poor O₂ removal (AAH-1203 above 20 ppb). PSV-1201 at 2.0 barg.', extra: () => [['TI-1201', f(xx().da.T, 1) + ' °C'], ['AI-1203 O₂', f(xx().da.O2, 0) + ' ppb'], ['Pegging steam', f(xx().da.Fpeg, 1) + ' t/h']] },
    'LIC-1207': { c: () => sim.lic1207, desc: 'TK-1207 condensate receiver level → LV-1207 return to the deaerator (P-1207).', pv: () => xx().cr.L, lo: 0, hi: 100, dec: 0, step: 5, zv: () => xx().zCr, valve: 'LV-1207', color: '--pen-duty',
      hint: 'Condensate from the E-501 reboiler and other steam users. XV-1208 dumps it to wastewater if AI-1208 shows contamination.', extra: () => [['Return FI-1207', f(xx().cr.Fout, 1) + ' t/h'], ['AI-1208 conductivity', f(xx().cr.cond, 0) + ' µS/cm']] },
    'FIC-606': { c: () => sim.fic606, desc: 'B-601 continuous blowdown (CBD) from the steam drum → D-1301 flash drum. Controls boiler water dissolved solids (TDS).', pv: () => xx().bw.cbd, lo: 0, hi: 2, dec: 2, step: 0.1, zv: () => xx().zCbd, valve: 'FV-606', color: '--pen-demand',
      hint: 'Normal 0.5 t/h (≈ 1 % of steam). More CBD = lower TDS but more heat and treated water lost. AAH-602 2500 ppm, AAHH-602 3500 ppm (foaming / carryover).',
      extra: () => [['AI-602 boiler water TDS', f(xx().bw.tds, 0) + ' ppm'], ['Feedwater TDS', f(xx().bw.feedTDS, 1) + ' ppm'], ['Cycles of concentration', f(xx().bw.tds / Math.max(0.1, xx().bw.feedTDS), 0)], ['Mud drum sludge', f(xx().bw.sludge, 0) + ' % (IBD at 80 %)']] },
    'TIC-1301': { c: () => sim.tic1301, desc: 'Blowdown quench: raw water through TV-1301 cools the D-1301 flash drum liquid before the wastewater plant.', pv: () => xx().ww.Tbd, lo: 20, hi: 100, dec: 0, step: 1, zv: () => xx().zQ, valve: 'TV-1301', color: '--pen-temp',
      hint: 'SP 40 °C. A long IBD or a condensate dump can exceed the quench capacity.', extra: () => [['Blowdown in', f(xx().ww.bdIn, 1) + ' t/h'], ['Flash steam', f(xx().ww.flash, 2) + ' t/h'], ['Quench water', f(xx().ww.Fq, 1) + ' t/h']] },
    'LIC-1302': { c: () => sim.lic1302, desc: 'TK-1302 equalisation tank level → LV-1302 transfer (P-1302A/B) to the oil separator.', pv: () => xx().ww.Leq, lo: 0, hi: 100, dec: 0, step: 5, zv: () => xx().zTr, valve: 'LV-1302', color: '--pen-duty',
      hint: 'The tank buffers flow, pH and temperature swings. Above about 25 t/h the separator efficiency falls.', extra: () => [['Transfer FI-1302', f(xx().ww.Ftr, 1) + ' t/h'], ['Tank pH / oil', f(Alky.phOf(xx().ww.Beq), 2) + ' / ' + f(xx().ww.oilEq, 0) + ' mg/L'], ['Tank temperature', f(xx().ww.Teq, 1) + ' °C']] },
    'AIC-1304': { c: () => sim.aic1304, desc: 'TK-1304 neutralisation pH → split-range dosing. Output above 50 % = caustic (P-1304A/B), below 50 % = acid (P-1306).', pv: () => xx().ww.ph4, lo: 0, hi: 14, dec: 2, step: 0.1, zv: () => sim.aic1304.op, valve: 'Dosing', color: '--pen-temp',
      hint: 'SP 7.5. pH is very steep near neutral. A dosing pump must be running for the output to do anything. Demin regeneration sends strong acid, then caustic, here.',
      extra: () => [['Dosing', (xx().ww.dose >= 0 ? 'caustic ' : 'acid ') + f(Math.abs(xx().ww.dose), 0) + ' eq·t/h'], ['Caustic pumps A / B', (sim.eq.P1304A ? 'RUN' : 'STOP') + ' / ' + (sim.eq.P1304B ? 'RUN' : 'STBY')], ['Acid pump P-1306', sim.eq.P1306 ? 'RUN' : 'STOP'], ['Regen waste in', f(xx().dm.Freg, 0) + ' t/h']] },
  });
  // ---- pages 8-11: pumps, fans, ejectors ----
  Object.assign(PUMPS, {
    'J-1001A': { desc: 'E-1001 steam-jet air ejector A (duty) - removes air from the condenser', flow: () => 'air ' + f(xx().tg.Pair, 3) + ' bar · condenser ' + f(xx().tg.Pcond, 3) + ' bara', note: 'Uses about 0.3 t/h of MP steam. Start both ejectors (hogging) to pull vacuum for a startup.' },
    'J-1001B': { desc: 'E-1001 steam-jet air ejector B (standby)', flow: () => 'air ' + f(xx().tg.Pair, 3) + ' bar · condenser ' + f(xx().tg.Pcond, 3) + ' bara', note: 'Standby. One ejector holds vacuum in normal operation.' },
    'P-1001A': { desc: 'Condensate extraction pump A (hotwell → deaerator)', flow: () => 'FI-1002 ' + f(xx().tg.Fhw, 1) + ' t/h · hotwell ' + f(xx().tg.Lhw, 0) + ' %', ctrl: 'LIC-1001', note: 'Losing both pumps floods the hotwell and the condenser.' },
    'P-1001B': { desc: 'Condensate extraction pump B (standby)', flow: () => 'FI-1002 ' + f(xx().tg.Fhw, 1) + ' t/h', ctrl: 'LIC-1001', note: 'Standby.' },
    'P-1206A': { desc: 'Demin water transfer pump A (TK-1204 → deaerator make-up)', flow: () => 'FI-1201 ' + f(xx().dm.Fmk, 1) + ' t/h', ctrl: 'LIC-1201', note: 'No make-up: the deaerator level falls and LALL-1201 stops the BFW pumps.' },
    'P-1206B': { desc: 'Demin water transfer pump B (standby)', flow: () => 'FI-1201 ' + f(xx().dm.Fmk, 1) + ' t/h', ctrl: 'LIC-1201', note: 'Standby.' },
    'P-1207': { desc: 'Condensate return pump (TK-1207 → deaerator or dump)', flow: () => f(xx().cr.Fout, 1) + ' t/h · ' + (sim.eq.XV1208 ? 'DUMPING' : 'to D-1201'), ctrl: 'LIC-1207', note: '' },
    'P-1210': { desc: 'BFW chemical dosing: oxygen scavenger and phosphate', flow: () => sim.eq.P1210 ? 'dosing' : 'stopped', note: 'Scavenger removes the last traces of O₂; phosphate keeps hardness as soft sludge in the mud drum (removed by IBD).' },
    'P-1302A': { desc: 'Wastewater transfer pump A (TK-1302 → separator)', flow: () => 'FI-1302 ' + f(xx().ww.Ftr, 1) + ' t/h', ctrl: 'LIC-1302', note: '' },
    'P-1302B': { desc: 'Wastewater transfer pump B (standby)', flow: () => 'FI-1302 ' + f(xx().ww.Ftr, 1) + ' t/h', ctrl: 'LIC-1302', note: '' },
    'P-1303': { desc: 'S-1303 oil skimmer pump (to slop)', flow: () => 'oil layer ' + f(xx().ww.layer, 0) + ' %', note: 'If the skimmer stops, the oil layer builds up and oil carries over to the effluent (LAH-1303 at 80 %).' },
    'P-1304A': { desc: 'Caustic (NaOH) dosing pump A (duty) for AIC-1304', flow: () => 'caustic ' + f(Math.max(0, xx().ww.dose), 0) + ' eq·t/h', ctrl: 'AIC-1304', note: 'Not on auto-start: if it trips, start P-1304B.' },
    'P-1304B': { desc: 'Caustic (NaOH) dosing pump B (standby)', flow: () => 'caustic ' + f(Math.max(0, xx().ww.dose), 0) + ' eq·t/h', ctrl: 'AIC-1304', note: 'Standby.' },
    'P-1306': { desc: 'Acid (H₂SO₄) dosing pump for AIC-1304', flow: () => 'acid ' + f(Math.max(0, -xx().ww.dose), 0) + ' eq·t/h', ctrl: 'AIC-1304', note: 'Lowers the pH when caustic regeneration waste arrives.' },
  });
  // ---- pages 8-11: equipment, governor, generator, breakers ----
  const row = (lbl, id, step, unit) => `<div class="fp-row"><label>${lbl}</label><button data-act="${id}dn">▼</button><input id="fp-${id}" type="number" step="${step}"><button data-act="${id}up">▲</button><button data-act="${id}set">Set</button><span class="muted">${unit}</span></div>`;
  const brk = tag => () => `<div class="fp-row"><button data-act="brkClose">Close ${tag}</button><button data-act="brkOpen" id="fp-brkopen">Open ${tag}</button>${tag === 'CB-1103' ? '<button data-act="ufls" id="fp-ufls">UFLS</button>' : ''}</div>`;
  const syncRows = () => { const el = xx().el; return el.sync ? [['Synchroscope on', el.sync], ['Slip (gen − bus)', (el.slip >= 0 ? '+' : '') + f(el.slip, 3) + ' Hz'], ['ΔV', f(el.dV, 2) + ' kV'], ['Phase angle', f(el.phi, 0) + '°'],
    ['Check-synch (25)', Math.abs(el.slip) <= 0.2 && Math.abs(el.dV) / 11 <= 0.05 && Math.abs(el.phi) <= 20 ? 'PERMIT' : 'BLOCK']] : [['Synchroscope', 'nothing to synchronise']]; };
  Object.assign(INFO, {
    'TG-1001': { title: 'TG-1001 condensing steam turbine', desc: 'Single-casing condensing turbine on the MP header (10.5 barg), 3000 rpm, driving G-1001. Exhausts to the E-1001 condenser under vacuum.',
      rows: () => { const g = xx().tg; return [['Status', g.latched ? 'LATCHED (TTV open)' : g.tripped ? 'TRIPPED' : 'STOPPED'], ['Speed SI-1001', f(g.N, 0) + ' rpm'], ['Steam FI-1001', f(g.Ftg, 1) + ' t/h'], ['Vibration VI-1001', f(g.vib, 0) + ' µm (alarm 75, trip 125)'],
        ['Condenser PI-1001', f(g.Pcond, 3) + ' bara'], ['Turning gear', sim.eq.TGEAR ? 'ENGAGED' : 'off'], ['Trips', 'overspeed 3300 rpm · vib 125 µm · vacuum 0.35 bara · inlet 6 barg · hotwell 92 %']]; },
      ctl: () => '<div class="fp-row"><button data-act="tgLatch">Latch / open TTV</button><button data-act="tgTrip" id="fp-tgtrip">Trip turbine</button><button data-act="tgGear">Turning gear</button></div>',
      note: 'Never hold the speed inside the 1800–2200 rpm critical band.', go: ['SIC-1001', 'G-1001', 'E-1001'] },
    'SIC-1001': { title: 'SIC-1001 turbine governor', desc: 'SPEED control while the generator breaker is open (ramps at 10 rpm/s, 40 rpm/s through the critical band). LOAD control on the grid (ramps at 0.5 MW/min). DROOP (4 %) when islanded: the load reference moves the frequency.',
      rows: () => { const g = xx().tg; return [['Mode', g.latched ? g.mode : 'not latched'], ['Speed / reference / target', f(g.N, 0) + ' / ' + f(g.Nref, 0) + ' / ' + f(g.Nsp, 0) + ' rpm'], ['Load / ramp / setpoint', f(g.Pe, 2) + ' / ' + f(g.Pref, 2) + ' / ' + f(g.Psp, 2) + ' MW'],
        ['Governor valve GV-1001', f(g.zv, 1) + ' %'], ['Inlet PI-1003', f(xx().Psh, 2) + ' barg' + (g.runback ? ' · RUNBACK (below 9 barg)' : '')]]; },
      ctl: () => row('Speed target', 'nsp', 1, 'rpm') + row('Load setpoint', 'psp', 0.1, 'MW') + '<div class="fp-row"><button data-act="tgLatch">Latch</button><button data-act="tgTrip" id="fp-tgtrip">Trip turbine</button></div>',
      note: 'Synchronising: run 0.05–0.15 Hz fast (3 to 9 rpm above bus speed) and close CB-1102 near 12 o\'clock.', go: ['G-1001', 'SYNC'] },
    'G-1001': { title: 'G-1001 generator (3.5 MVA, 11 kV) and AVR', desc: 'Synchronous generator. The AVR holds terminal voltage before synchronising and sets reactive power (MVAr) on the grid.',
      rows: () => { const g = xx().tg; return [['Output JI-1001', f(g.Pe, 2) + ' MW · ' + f(g.Q, 2) + ' MVAr'], ['Terminal voltage', f(g.Vg, 2) + ' kV (AVR SP ' + f(g.Vsp, 2) + ')'], ['Frequency', f(g.N / 60, 2) + ' Hz'], ['Field breaker', sim.eq.EXC1001 ? 'ON' : 'OFF'], ['CB-1102', sim.eq.CB1102 ? 'CLOSED' : 'OPEN'], ...syncRows()]; },
      ctl: () => `<div class="fp-row"><button data-act="exc">Field ON / OFF</button><button data-act="brkClose" data-v="CB-1102">Close CB-1102</button><button data-act="brkOpen" data-v="CB-1102" id="fp-brkopen">Open CB-1102</button></div>` + row('AVR voltage', 'vsp', 0.05, 'kV'),
      note: 'Reverse power (32G) trips CB-1102 after 5 s if the generator motors. Island protection: 81U 47.5 Hz, 81O 52 Hz.', go: ['SIC-1001', 'SYNC'] },
    'E-1001': { title: 'E-1001 surface condenser', desc: 'Condenses turbine exhaust under vacuum with cooling water. Air ejectors J-1001A/B remove leaking air; the hotwell collects condensate.',
      rows: () => { const g = xx().tg; return [['Pressure PI-1001', f(g.Pcond, 3) + ' bara'], ['Air partial pressure', f(g.Pair, 3) + ' bar'], ['Condensing TI-1001', f(g.Tcond, 1) + ' °C'], ['Turbine efficiency factor', f(g.evac * 100, 0) + ' %'], ['Ejectors A / B', (sim.eq.J1001A ? (sim.flt.ejA ? 'RUN - NO MOTIVE STEAM' : 'RUN') : 'stop') + ' / ' + (sim.eq.J1001B ? 'RUN' : 'STBY')], ['Hotwell', f(g.Lhw, 0) + ' %']]; },
      note: 'Worse vacuum = less MW per tonne of steam. PAH-1001 at 0.20 bara, trip at 0.35 bara.', go: ['J-1001A', 'J-1001B', 'LIC-1001', 'P-1001A', 'P-1001B'] },
    'TNB': { title: 'TNB 33 kV grid incomer (TR-1101)', desc: 'Utility supply through the 33/11 kV transformer and CB-1101. Loss-of-mains protection opens CB-1101 if the grid fails.',
      rows: () => { const el = xx().el; return [['Grid', el.gridOK ? 'LIVE' : 'LOST'], ['Frequency / voltage', el.gridOK ? f(el.fg, 3) + ' Hz / ' + f(el.Vgrid, 2) + ' kV' : '—'], ['CB-1101', sim.eq.CB1101 ? 'CLOSED' : 'OPEN'], ['Import JI-1101', f(el.imp, 2) + ' MW (max demand ' + Alky.E.maxDemand + ')']]; },
      note: 'After a grid failure wait for TNB to confirm the supply is stable, then resynchronise the island at CB-1101.', go: ['CB-1101', 'SYNC'] },
    'BUS': { title: '11 kV plant bus', desc: 'Feeds MCC-1 (process), MCC-2 (utilities), the essential board (DCS, UPS, lighting) and the non-essential feeder CB-1103.',
      rows: () => { const el = xx().el; return [['Frequency / voltage', f(el.f, 2) + ' Hz / ' + f(el.Vbus, 2) + ' kV'], ['Plant load', f(el.load, 2) + ' MW'], ['Generation', f(xx().tg.Pe, 2) + ' MW'], ['TNB import', f(el.imp, 2) + ' MW'], ['UFLS 81U', sim.eq.uflsArm ? 'armed at 48.5 Hz (sheds CB-1103)' : 'DISARMED']]; },
      note: 'A dead bus stops every motor: K-301, pumps, fans and air compressors.', go: ['CB-1101', 'CB-1102', 'CB-1103'] },
    'SYNC': { title: 'Synchroscope and check-synch relay (25)', desc: 'Shows the breaker being synchronised: CB-1102 (generator to a live bus) or CB-1101 (island back to the TNB grid). Pointer turns clockwise when the incoming side is fast.',
      rows: syncRows, note: 'Close when slip is small and positive, voltages match and the pointer is near 12 o\'clock. The relay blocks |slip| > 0.2 Hz, |ΔV| > 5 %, |angle| > 20°.', go: ['SIC-1001', 'G-1001', 'CB-1101', 'CB-1102'] },
    'D-1201': { title: 'D-1201 deaerator', desc: 'Heats boiler feedwater to saturation with pegging steam and vents the released O₂ and CO₂. Receives demin make-up, turbine condensate and process condensate; feeds the BFW pumps on page 5.',
      rows: () => { const d = xx().da; return [['Pressure / temperature', f(d.P, 2) + ' barg / ' + f(d.T, 1) + ' °C'], ['Level LI-1201', f(d.L, 0) + ' %'], ['Dissolved O₂ AI-1203', f(d.O2, 0) + ' ppb (≤ 20)'], ['Water in', f(d.Win, 1) + ' t/h'], ['Pegging steam', f(d.Fpeg, 1) + ' t/h'], ['BFW out', f(xx().bfw, 1) + ' t/h']]; },
      note: 'Cold or low-pressure deaerator = oxygen into the boiler (corrosion).', go: ['PIC-1201', 'LIC-1201', 'P-1210'] },
    'TK-1204': { title: 'TK-1204 demineralised water tank', desc: 'Stores demin water from trains A-1205A/B. The trains run automatically on tank level (start < 85 %, stop > 92 %).',
      rows: () => [['Level', f(xx().dm.L, 1) + ' %'], ['Production', f(xx().dm.Fprod, 0) + ' t/h'], ['Make-up out', f(xx().dm.Fmk, 1) + ' t/h'], ['Conductivity AI-1205', f(xx().dm.cond, 2) + ' µS/cm']], note: '', go: ['A-1205A', 'A-1205B', 'P-1206A', 'P-1206B'] },
    'TK-1207': { title: 'TK-1207 condensate receiver', desc: 'Collects steam condensate from E-501 and other users. AI-1208 (conductivity) and AI-1209 (oil) check it before it goes back to the deaerator.',
      rows: () => [['Level', f(xx().cr.L, 0) + ' %'], ['In / out', f(xx().cr.Fin, 1) + ' / ' + f(xx().cr.Fout, 1) + ' t/h'], ['AI-1208 conductivity', f(xx().cr.cond, 0) + ' µS/cm (alarm 20)'], ['AI-1209 oil', f(xx().cr.oil, 0) + ' ppm'], ['XV-1208', sim.eq.XV1208 ? 'DUMPING to WWT' : 'to D-1201']], note: '', go: ['LIC-1207', 'P-1207', 'XV-1208'] },
    'D-1301': { title: 'D-1301 blowdown flash drum', desc: 'CBD and IBD from B-601 (and any dumped condensate) flash to atmospheric pressure. About 16 % flashes to steam; the liquid is quenched and sent to TK-1302.',
      rows: () => [['CBD / IBD', f(xx().bw.cbd, 2) + ' / ' + f(xx().bw.ibd, 1) + ' t/h'], ['Condensate dump', f(xx().cr.toWW, 1) + ' t/h'], ['Flash steam', f(xx().ww.flash, 2) + ' t/h'], ['To wastewater', f(xx().ww.Tbd, 0) + ' °C']], note: '', go: ['TIC-1301', 'FIC-606', 'HV-607'] },
    'TK-1302': { title: 'TK-1302 equalisation tank', desc: 'Buffers oily process water from ALKY-1, cooled blowdown and recycled effluent.',
      rows: () => [['Level', f(xx().ww.Leq, 0) + ' %'], ['pH / oil / temp', f(Alky.phOf(xx().ww.Beq), 2) + ' / ' + f(xx().ww.oilEq, 0) + ' mg/L / ' + f(xx().ww.Teq, 1) + ' °C'], ['Recycle in', sim.eq.XV1305 ? '0' : f(xx().ww.F5, 1) + ' t/h']], note: '', go: ['LIC-1302', 'P-1302A', 'P-1302B'] },
    'S-1303': { title: 'S-1303 CPI oil separator', desc: 'Corrugated-plate interceptor: oil rises and is skimmed to slop by P-1303.',
      rows: () => [['Flow', f(xx().ww.Ftr, 1) + ' t/h (design 25)'], ['Oil layer', f(xx().ww.layer, 0) + ' %'], ['Efficiency', f(xx().ww.eff * 100, 1) + ' %'], ['Oil in / out', f(xx().ww.oilEq, 0) + ' / ' + f(xx().ww.oilS, 1) + ' mg/L']], note: '', go: ['P-1303'] },
    'TK-1304': { title: 'TK-1304 neutralisation pit', desc: 'Separator outflow and demin regeneration waste are neutralised here with caustic or acid (AIC-1304).',
      rows: () => [['pH', f(xx().ww.ph4, 2)], ['Inflow', f(xx().ww.Ftr + xx().dm.Freg, 1) + ' t/h'], ['Regeneration waste', f(xx().dm.Freg, 0) + ' t/h'], ['Dosing', (xx().ww.dose >= 0 ? 'caustic ' : 'acid ') + f(Math.abs(xx().ww.dose), 0)]], note: '', go: ['AIC-1304', 'P-1304A', 'P-1304B', 'P-1306'] },
    'TK-1305': { title: 'TK-1305 guard basin and final effluent', desc: 'Final check before the outfall. DOE Standard B (training): pH 5.5–9.0, oil & grease ≤ 10 mg/L, temperature ≤ 40 °C.',
      rows: () => [['pH AI-1305', f(xx().ww.ph5, 2)], ['Oil AI-1306', f(xx().ww.oil5, 1) + ' mg/L'], ['Temperature TI-1305', f(xx().ww.T5, 1) + ' °C'], ['Flow', f(xx().ww.F5, 1) + ' t/h'], ['XV-1305', sim.eq.XV1305 ? 'OUTFALL' : 'RECYCLE to TK-1302'], ['Off-spec discharged', Math.round(xx().ww.violT) + ' s']],
      note: 'If the effluent is off-spec, close XV-1305 to recycle it.', go: ['XV-1305', 'AIC-1304'] },
  });
  ['A', 'B'].forEach(k => {
    INFO['A-1205' + k] = { title: `A-1205${k} demin train ${k}`, desc: 'Cation → degasser → anion → mixed bed. Ion-exchange resin removes dissolved salts until it is exhausted, then it must be regenerated with acid and caustic.',
      rows: () => { const tr = xx().dm[k]; return [['State', tr.st.toUpperCase() + (tr.st === 'regen' ? ` (${Math.round(tr.regT)} / 600 s)` : '')], ['Resin capacity left', f(tr.cap, 0) + ' %'], ['Demin conductivity AI-1205', f(xx().dm.cond, 2) + ' µS/cm (alarm 1.0)']]; },
      ctl: () => '<div class="fp-row"><button data-act="dmSvc">Put in service</button><button data-act="dmStby">Take out of service</button><button data-act="dmRegen">Regenerate</button></div>',
      note: 'Before the capacity runs out, put the other train in service and regenerate this one. Regeneration waste goes to TK-1304 (page 11).', go: ['TK-1204'], train: k };
  });
  ['CB-1101', 'CB-1102', 'CB-1103'].forEach(tag => {
    const what = { 'CB-1101': 'TNB incomer breaker (33/11 kV transformer to the 11 kV bus)', 'CB-1102': 'G-1001 generator breaker', 'CB-1103': 'Non-essential feeder breaker (offices, workshop, warehouse, 0.4 MW)' }[tag];
    INFO[tag] = { title: tag + ' ' + what.split(' (')[0], desc: what + '.', breaker: tag,
      rows: () => [['Status', sim.eq[tag.replace('-', '')] ? 'CLOSED' : 'OPEN'], ...(tag === 'CB-1103' ? [['UFLS 81U', sim.eq.uflsArm ? 'armed 48.5 Hz' : 'DISARMED']] : syncRows())],
      ctl: brk(tag), note: tag === 'CB-1103' ? 'Shed this feeder by hand if the islanded generator is overloaded.' : 'Live-live closing is supervised by the check-synch relay. Dead-bus closing is allowed.', go: tag === 'CB-1103' ? ['BUS'] : ['SYNC', 'SIC-1001'] };
  });
  const HV_EXTRA = ({
    'XV-1208': { desc: 'Condensate dump valve: OPEN sends returned condensate to wastewater instead of the deaerator.', row: () => ['AI-1208 / oil', f(sim.x.cr.cond, 0) + ' µS/cm / ' + f(sim.x.cr.oil, 0) + ' ppm'], note: 'Auto-dump opens it above 30 µS/cm when armed. Dumped condensate must be replaced by demin make-up.', auto: true },
    'HV-607': { desc: 'B-601 intermittent blowdown (IBD) from the mud drum - removes settled sludge.', row: () => ['Sludge / IBD flow', f(sim.x.bw.sludge, 0) + ' % / ' + f(sim.x.bw.ibd, 0) + ' t/h'], note: 'Open for 15–30 s when AAH-603 says IBD is due, with the drum level normal. It drains about 25 t/h: a long IBD empties the drum.' },
    'XV-1305': { desc: 'Final effluent valve: OPEN = to the outfall, CLOSED = recycle to TK-1302.', row: () => ['Effluent pH / oil', f(sim.x.ww.ph5, 2) + ' / ' + f(sim.x.ww.oil5, 1) + ' mg/L'], note: 'Recycle while the effluent is off-spec; the equalisation tank level rises while recycling.' },
  });

  // every PSV gets the same faceplate, built from the model's PSV list
  Alky.PSVS.forEach(v => {
    INFO[v.tag] = { title: `${v.tag} relief valve - ${v.desc}`, desc: `Spring-loaded, self-acting. Lifts at ${v.set} barg, reseats at ${v.reseat} barg. Relieves to ${v.dest === 'flare' ? 'the flare header (page 3)' : 'atmosphere'}.`,
      rows: () => { const s = sim.x.psv[v.tag]; return [['Status', s.open ? 'OPEN - RELIEVING' : 'CLOSED'], ['Protected pressure', f(v.p(sim), 2) + ' barg'], ['Set / reseat', v.set + ' / ' + v.reseat + ' barg'], ['Relief flow', f(s.W, 1) + ' t/h'], ['Lifts this run', String(s.lifts)], ['Time open', Math.round(s.t) + ' s']]; },
      note: 'No operator control: you stop the relief by removing its cause (lower the pressure).', page: v.dest === 'flare' ? 3 : null };
  });
  const HV = {
    'HV-801': { desc: 'Flare header N₂ purge (keeps air out of the flare header).', row: () => ['Header O₂ AI-402', f(sim.x.hO2, 1) + ' %'], note: 'Normally open. Without purge, air enters the header (AAH-402) and the pilots cannot be lit.' },
    'HV-802': { desc: 'T-501 N₂ purge (startup / shutdown gas-freeing).', row: () => ['Column HC AI-504', f(sim.x.colHC, 1) + ' %'], note: 'Normally closed. Opened with vent HV-504 to gas-free the column.' },
    'MSV-601': { desc: 'B-601 main steam stop valve - connects the boiler drum to the MP steam header.', row: () => ['Drum / header', f(sim.x.Pb, 1) + ' / ' + f(sim.x.Psh, 1) + ' barg'], note: 'Open only once the drum is near header pressure (≥ 10 barg). Close it before stopping the burners.' },
    'HV-403': { desc: 'Flare pilot gas supply (through PCV-403).', row: () => ['Pilot gas', sim.x.gasOK ? 'available' : 'NO GAS'], note: 'Opening it puts the flare in service. Pilots need gas and an inert header to light.' },
    'HV-404': { desc: 'Backup pilot gas from propane bottles.', row: () => ['Pilot gas', sim.x.gasOK ? 'available' : 'NO GAS'], note: 'Use if the normal pilot gas supply fails.' },
    'HV-502': { desc: 'E-502 cooling-water bypass around the CW control valve.', row: () => ['CW valve ZI-502', f(sim.x.zCW5, 0) + ' %'], note: 'Gives full condenser cooling if the CW control valve fails closed. Column pressure is then held by reboiler steam.' },
    'HV-503': { desc: 'T-501 startup fill: isobutane from TK-902 into the column.', row: () => ['Fill / LI-501', f(sim.x.fill5, 0) + ' kmol/h / ' + f(m().Lb, 0) + ' %'], note: 'Used only during column startup.' },
    'HV-504': { desc: 'T-501 vent to the flare header (depressuring).', row: () => ['Column / vent', f(m().Pc, 2) + ' barg / ' + f(sim.x.vent5, 1) + ' t/h'], note: 'Used during column shutdown to depressure before N₂ purging.' },
    ...Object.fromEntries(['903', '904', '905'].map(n => ['PCV-' + n, { desc: `TK-${n} N₂ blanket regulator (holds +20 mbarg).`,
      row: () => ['Tank P / O₂', f(sim.x.tk['TK-' + n].P, 0) + ' mbarg / ' + f(sim.x.tk['TK-' + n].O2, 1) + ' %'], note: 'Closing it while pumping out pulls the tank into vacuum: the PVRV admits air.' }])),
  };

  Object.assign(HV, HV_EXTRA);

  function canOperate() { return sim.phase === 'running'; }

  function buildFaceplate() {
    const tag = ui.selected, el = $('faceplate');
    ui.dirty = {};
    const lock = canOperate() ? '' : `<div class="notice">${sim.phase === 'standby' ? 'Take over the shift to operate.' : 'Run frozen for debrief.'}</div>`;
    const pg = fpPage(tag);
    const pgLink = pg !== ui.page ? `<button data-act="page" data-v="${pg}">Show page ${pg}</button>` : '';
    if (CTRL[tag]) {
      const d = CTRL[tag];
      el.innerHTML = `<h3>${tag}</h3><div class="desc">${d.desc}</div>${lock}
        <div class="fp-row"><label>Mode</label><button data-act="mode" data-v="AUTO" id="fp-auto">AUTO</button><button data-act="mode" data-v="MAN" id="fp-man">MAN</button>
          ${d.ratio ? '<button data-act="ratio" id="fp-ratio">RATIO</button>' : ''}${d.reb ? '<button data-act="rebreset">Reset PSHH-502</button>' : ''}${pgLink}</div>
        <div class="bars">
          <div><div class="bar" id="bar-pv"><div class="fill" style="background:var(${d.color})"></div><div class="mk"></div></div><div class="bar-l">PV / SP</div></div>
          <div><div class="bar" id="bar-op"><div class="fill" style="background:var(--pen-demand)"></div></div><div class="bar-l">OP</div></div>
          <div><div class="bar" id="bar-zv"><div class="fill" style="background:var(--axis)"></div></div><div class="bar-l">${d.valve}</div></div>
          <dl class="fp-vals"><dt>PV</dt><dd id="fp-pv"></dd><dt>SP</dt><dd id="fp-spv"></dd><dt>OP</dt><dd id="fp-opv"></dd><dt>${d.valve}</dt><dd id="fp-zv"></dd></dl>
        </div>
        ${d.extra ? '<dl class="fp-vals" id="fp-extra"></dl>' : ''}
        <div class="fp-row"><label>Setpoint</label><button data-act="spdn" aria-label="Lower setpoint">▼</button><input id="fp-sp" type="number" step="${d.step}"><button data-act="spup" aria-label="Raise setpoint">▲</button><button data-act="spset">Set</button></div>
        <div class="fp-row"><label>Output (MAN)</label><button data-act="opdn" aria-label="Lower output">▼</button><input id="fp-op" type="number" step="5" min="0" max="100"><button data-act="opup" aria-label="Raise output">▲</button><button data-act="opset">Set</button></div>
        ${d.ratio ? `<div class="fp-row"><label>${d.ratioLbl || 'Steam/HC ratio'}</label><input id="fp-ratio-sp" type="number" step="${d.ratioTag ? 1 : 0.05}" min="0" max="60"><button data-act="ratioset">Set</button></div>` : ''}
        <p class="hint">${d.hint}</p>`;
    } else if (PUMPS[tag]) {
      const d = PUMPS[tag];
      el.innerHTML = `<h3>${tag}</h3><div class="desc">${d.desc}</div>${lock}
        <dl class="fp-vals"><dt>Status</dt><dd id="fp-status"></dd><dt>Flow</dt><dd id="fp-flow"></dd>${d.ctrl ? `<dt>${d.ctrl}</dt><dd id="fp-ctrl"></dd>` : ''}</dl>
        <div class="notice" id="fp-warn" hidden></div>
        <div class="fp-row"><button data-act="pstart">Start</button><button data-act="pstop" id="fp-stop">Stop</button>${d.ctrl ? `<button data-act="goto" data-v="${d.ctrl}">Open ${d.ctrl}</button>` : ''}${d.auto ? '<button data-act="autostart" id="fp-autostart">Auto-start</button>' : ''}${pgLink}</div>
        <p class="hint">${d.note}</p>`;
    } else if (HV[tag]) {
      const h = HV[tag];
      el.innerHTML = `<h3>${tag}</h3><div class="desc">${h.desc}</div>${lock}
        <dl class="fp-vals"><dt>Position</dt><dd id="fp-status"></dd><dt>${h.row()[0]}</dt><dd id="fp-flow"></dd></dl>
        <div class="fp-row"><button data-act="hvopen">Open</button><button data-act="hvclose" id="fp-hvclose">Close</button>${h.auto ? '<button data-act="dumpAuto" id="fp-dumpauto">Auto-dump</button>' : ''}${pgLink}</div>
        <p class="hint">${h.note}</p>`;
    } else if (tag === 'XV-101') {
      el.innerHTML = `<h3>XV-101</h3><div class="desc">Olefin feed emergency isolation valve. Closed automatically by TZHH-100 at ${Alky.TRIP_T} °C.</div>${lock}
        <dl class="fp-vals"><dt>Position</dt><dd id="fp-status"></dd><dt>Trip TZHH-100</dt><dd id="fp-trip"></dd><dt>Olefin flow</dt><dd id="fp-flow"></dd></dl>
        <div class="fp-row"><button data-act="xvclose" id="fp-xvclose">Close (isolate olefin)</button><button data-act="xvopen">Open / reset trip</button>${pgLink}</div>
        <p class="hint">Closing forces FIC-101 to MAN 0 %. Opening needs TI-100 below ${LIMITS.tHi} °C. After opening, raise FIC-101 output or return it to AUTO.</p>`;
    } else if (tag === 'K-301') {
      el.innerHTML = `<h3>K-301 refrigeration compressor</h3><div class="desc">Variable-speed centrifugal compressor. PIC-301 sets speed; UIC-301 protects against surge; PSHH-303 trips it on high discharge pressure.</div>${lock}
        <dl class="fp-vals" id="fp-info"></dl>
        <div class="fp-row"><button data-act="kstart">Start</button><button data-act="kstop" id="fp-kstop">Stop</button><button data-act="vfd">VFD changeover A → B</button></div>
        <div class="fp-row"><button data-act="bypass" id="fp-byp">PSHH-303 bypass</button><button data-act="goto" data-v="PIC-301">Open PIC-301</button><button data-act="goto" data-v="UIC-301">Open UIC-301</button>${pgLink}</div>
        <p class="hint">Normal: speed ≈ 89 %, suction 3.1 barg, discharge 12.4 barg, 200 A, surge margin > 100 %. A VFD changeover only helps if the speed is being limited.</p>`;
    } else if (INFO[tag]) {
      const d = INFO[tag];
      const go = (d.go || []).map(t => `<button data-act="goto" data-v="${t}">Open ${t}</button>`).join('');
      const pil = d.pilots ? '<div class="fp-row" id="fp-pilots"></div>' : '';
      const pg2 = d.page && d.page !== ui.page ? `<button data-act="page" data-v="${d.page}">Show page ${d.page}</button>` : pgLink;
      const bms = d.bms ? `${lock}<div class="fp-row"><button data-act="purge">Start purge</button><button data-act="light">Light-off</button><button data-act="bstop">Normal stop</button><button data-act="btrip" id="fp-btrip">Trip burners</button></div>` : '';
      const trk = d.tank ? `${lock}<div class="fp-row"><button data-act="call" data-v="${d.tank}">Call ${Alky.TF.tanks[d.tank].truck.toLowerCase()} truck</button><button data-act="goto" data-v="${Alky.TF.tanks[d.tank].pump}">Open ${Alky.TF.tanks[d.tank].pump}</button><button data-act="goto" data-v="TRUCK">Truck bay</button></div>` : '';
      const tbay = tag === 'TRUCK' ? `${lock}<div class="fp-row">${Object.keys(Alky.TF.tanks).map(k => `<button data-act="call" data-v="${k}">${Alky.TF.tanks[k].truck}</button>`).join('')}</div><div class="fp-row"><button data-act="release">Release truck</button></div>` : '';
      el.innerHTML = `<h3>${d.title}</h3><div class="desc">${d.desc}</div><dl class="fp-vals" id="fp-info"></dl>${pil}${bms}${trk}${tbay}${d.ctl ? lock + d.ctl() : ''}
        ${go || pg2 ? `<div class="fp-row">${go}${pg2}</div>` : ''}<p class="hint">${d.note}</p>`;
    }
    el.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { ui.dirty[inp.id] = true; }));
    el.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') doAct(inp.id === 'fp-sp' ? 'spset' : inp.id === 'fp-op' ? 'opset' : 'ratioset');
    }));
    updateFaceplate();
  }

  function bar(id, frac) {
    const b = $(id); if (!b) return;
    b.querySelector('.fill').style.height = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }
  const dl = rows => rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  function updateFaceplate() {
    const tag = ui.selected, el = $('faceplate');
    const op = canOperate();
    el.querySelectorAll('button, input').forEach(b => { b.disabled = !op && b.dataset.act !== 'page' && b.dataset.act !== 'goto'; });
    if (CTRL[tag]) {
      const d = CTRL[tag], c = d.c(), pv = d.pv();
      $('fp-pv').textContent = f(pv, d.dec) + ' ' + c.unit;
      $('fp-spv').textContent = f(c.sp, d.dec) + ' ' + c.unit;
      $('fp-opv').textContent = f(c.op, 1) + ' %';
      $('fp-zv').textContent = f(d.zv(), 1) + ' %';
      $('fp-auto').classList.toggle('on', c.mode === 'AUTO' && !c.ratioMode);
      $('fp-man').classList.toggle('on', c.mode === 'MAN');
      if ($('fp-ratio')) $('fp-ratio').classList.toggle('on', !!c.ratioMode);
      bar('bar-pv', (pv - d.lo) / (d.hi - d.lo));
      $('bar-pv').querySelector('.mk').style.bottom = Math.max(0, Math.min(100, (c.sp - d.lo) / (d.hi - d.lo) * 100)) + '%';
      bar('bar-op', c.op / 100); bar('bar-zv', d.zv() / 100);
      if (d.extra) $('fp-extra').innerHTML = dl(d.extra());
      const sp = $('fp-sp'), opi = $('fp-op'), rs = $('fp-ratio-sp');
      if (!ui.dirty['fp-sp'] && document.activeElement !== sp) sp.value = c.sp.toFixed(d.dec);
      if (!ui.dirty['fp-op'] && document.activeElement !== opi) opi.value = c.op.toFixed(0);
      if (rs && !ui.dirty['fp-ratio-sp'] && document.activeElement !== rs) rs.value = c.ratioSP.toFixed(2);
      if (op && c.mode !== 'MAN') el.querySelectorAll('[data-act^="op"], #fp-op').forEach(b => { b.disabled = true; });
      if (op && c.ratioMode) el.querySelectorAll('[data-act^="sp"], #fp-sp').forEach(b => { b.disabled = true; });
    } else if (PUMPS[tag]) {
      const on = sim.eq[tag.replace('-', '')];
      $('fp-status').textContent = on ? 'RUNNING' : (tag === 'P-303B' ? 'STANDBY (stopped)' : 'STOPPED');
      const d = PUMPS[tag];
      $('fp-flow').textContent = d.flow();
      let warn = '';
      if (d.ctrl) {
        const c = CTRL[d.ctrl].c();
        $('fp-ctrl').textContent = `${c.mode} · OP ${f(c.op, 0)} %`;
        if (on && c.mode === 'MAN' && c.op < 1) warn = `Pump is running but ${d.ctrl} is in MAN at 0 % output, so there is no flow. Open ${d.ctrl} and switch it to AUTO (or raise its output).`;
        if (on && tag === 'P-101' && !sim.eq.xvOpen) warn = 'Pump is running but XV-101 (olefin isolation) is closed, so there is no flow. Open XV-101 first, then put FIC-101 back in AUTO.';
      }
      $('fp-warn').hidden = !warn; $('fp-warn').textContent = warn;
      setConfirmLabel('fp-stop', 'Stop', 'Confirm STOP');
      if ($('fp-autostart')) $('fp-autostart').textContent = sim.eq.k702auto ? 'Disarm auto-start' : 'Arm auto-start';
    } else if (HV[tag]) {
      $('fp-status').textContent = sim.eq[tag.replace('-', '')] ? 'OPEN' : 'CLOSED';
      $('fp-flow').textContent = HV[tag].row()[1];
      setConfirmLabel('fp-hvclose', 'Close', 'Confirm CLOSE');
      if ($('fp-dumpauto')) $('fp-dumpauto').textContent = sim.eq.xv1208auto ? 'Disarm auto-dump' : 'Arm auto-dump';
    } else if (tag === 'XV-101') {
      $('fp-status').textContent = sim.eq.xvOpen ? 'OPEN' : 'CLOSED';
      $('fp-trip').textContent = sim.eq.tripped ? 'TRIPPED' : 'Normal';
      $('fp-flow').textContent = f(m().Fo, 0) + ' kmol/h';
      setConfirmLabel('fp-xvclose', 'Close (isolate olefin)', 'Confirm CLOSE');
    } else if (tag === 'K-301') {
      const x = sim.x;
      $('fp-info').innerHTML = dl([['Status', sim.eq.K301 ? 'RUNNING' : 'STOPPED'], ['Speed SI-301 / demand', f(m().N, 0) + ' % / ' + f(x.Ndem, 0) + ' %'],
        ['VFD channel / speed limit', x.vfdCh + ' / ' + f(x.speedLim, 0) + ' %'], ['Motor current II-301', f(m().amps, 0) + ' A'],
        ['Suction PI-301 / TI-302', f(m().Ps, 2) + ' barg / ' + f(m().Ts, 1) + ' °C'], ['Discharge PI-303 / TI-304', f(m().Pd, 1) + ' barg / ' + f(m().Td, 0) + ' °C'],
        ['Surge margin (calculated)', f(x.SM, 0) + ' %'], ['Recycle FV-302', f(x.zR, 0) + ' %'], ['Available cooling QI-301', f(x.Qavail, 2) + ' MW'],
        ['PSHH-303 trip', sim.eq.pshhBypass ? 'BYPASSED' : 'ACTIVE (16.8 barg)']]);
      setConfirmLabel('fp-kstop', 'Stop', 'Confirm STOP');
      setConfirmLabel('fp-byp', sim.eq.pshhBypass ? 'Remove PSHH-303 bypass' : 'Apply PSHH-303 bypass', sim.eq.pshhBypass ? 'Confirm REMOVE bypass' : 'Confirm APPLY bypass');
    } else if (INFO[tag]) {
      $('fp-info').innerHTML = dl(INFO[tag].rows());
      if (INFO[tag].bms) setConfirmLabel('fp-btrip', 'Trip burners', 'Confirm TRIP');
      setConfirmLabel('fp-tgtrip', 'Trip turbine', 'Confirm TRIP');
      const bt = INFO[tag].breaker || (tag === 'G-1001' ? 'CB-1102' : null);
      if (bt) setConfirmLabel('fp-brkopen', 'Open ' + bt, 'Confirm OPEN ' + bt);
      if ($('fp-ufls')) $('fp-ufls').textContent = sim.eq.uflsArm ? 'Disarm UFLS' : 'Arm UFLS';
      const g = sim.x.tg;
      [['fp-nsp', g.Nsp, 0], ['fp-psp', g.Psp, 2], ['fp-vsp', g.Vsp, 2]].forEach(([id, v, d]) => { const i = $(id); if (i && !ui.dirty[id] && document.activeElement !== i) i.value = v.toFixed(d); });
      if (INFO[tag].pilots) {
        const p = $('fp-pilots');
        const html = sim.eq.pilots.map((on, i) => on ? '' : `<button data-act="relight" data-v="${i}">Relight pilot ${'ABC'[i]}</button>`).join('');
        if (p.innerHTML !== html) { p.innerHTML = html; p.querySelectorAll('button').forEach(b => { b.disabled = !op; }); }
      }
    }
  }

  function setConfirmLabel(id, normal, confirmTxt) {
    const b = $(id); if (!b) return;
    const armed = ui.confirm && ui.confirm.id === id && performance.now() < ui.confirm.until;
    b.textContent = armed ? confirmTxt : normal;
    b.classList.toggle('danger', !!armed);
  }
  function armOrRun(id, fn) {
    if (ui.confirm && ui.confirm.id === id && performance.now() < ui.confirm.until) { ui.confirm = null; fn(); }
    else ui.confirm = { id, until: performance.now() + 3000 };
  }

  function doAct(act, v) {
    if (act === 'page') { goPage(+v); return; }
    if (act === 'goto') { showTag(v); return; }
    if (!canOperate()) return;
    const tag = ui.selected;
    let r;
    if (CTRL[tag]) {
      const d = CTRL[tag], c = d.c();
      if (act === 'mode') r = c.ratioMode && v === 'AUTO' ? sim.setRatio(false, null, d.ratioTag) : sim.setMode(tag, v);
      if (act === 'ratio') r = sim.setRatio(true, null, d.ratioTag);
      if (act === 'ratioset') { r = sim.setRatio(c.ratioMode, parseFloat($('fp-ratio-sp').value), d.ratioTag); ui.dirty['fp-ratio-sp'] = false; }
      if (act === 'rebreset') r = sim.resetRebTrip();
      if (act === 'spup') r = sim.setSP(tag, +(c.sp + d.step).toFixed(3));
      if (act === 'spdn') r = sim.setSP(tag, +(c.sp - d.step).toFixed(3));
      if (act === 'spset') { r = sim.setSP(tag, parseFloat($('fp-sp').value)); ui.dirty['fp-sp'] = false; }
      if (act === 'opup') r = sim.setOP(tag, c.op + 5);
      if (act === 'opdn') r = sim.setOP(tag, c.op - 5);
      if (act === 'opset') { r = sim.setOP(tag, parseFloat($('fp-op').value)); ui.dirty['fp-op'] = false; }
    } else if (PUMPS[tag]) {
      if (act === 'pstart') r = sim.setPump(tag, true);
      if (act === 'pstop') armOrRun('fp-stop', () => { r = sim.setPump(tag, false); });
      if (act === 'autostart') r = sim.setAutoStart(!sim.eq.k702auto);
    } else if (HV[tag]) {
      if (act === 'hvopen') r = sim.setValve(tag, true);
      if (act === 'hvclose') armOrRun('fp-hvclose', () => { r = sim.setValve(tag, false); });
      if (act === 'dumpAuto') r = sim.setDumpAuto(!sim.eq.xv1208auto);
    } else if (INFO[tag] && INFO[tag].ctl) {
      const g = sim.x.tg, num = id => { const v = parseFloat($(id).value); ui.dirty[id] = false; return v; };
      const bt = v || INFO[tag].breaker;
      if (act === 'tgLatch') r = sim.tgCmd('latch');
      if (act === 'tgTrip') armOrRun('fp-tgtrip', () => { r = sim.tgCmd('trip'); });
      if (act === 'tgGear') r = sim.tgCmd('gear');
      if (act === 'exc') r = sim.tgCmd('exc');
      if (act === 'nspset') r = sim.tgCmd('speed', num('fp-nsp')); if (act === 'nspup') r = sim.tgCmd('speed', g.Nsp + 1); if (act === 'nspdn') r = sim.tgCmd('speed', g.Nsp - 1);
      if (act === 'pspset') r = sim.tgCmd('load', num('fp-psp')); if (act === 'pspup') r = sim.tgCmd('load', +(g.Psp + 0.1).toFixed(2)); if (act === 'pspdn') r = sim.tgCmd('load', +(g.Psp - 0.1).toFixed(2));
      if (act === 'vspset') r = sim.tgCmd('vsp', num('fp-vsp')); if (act === 'vspup') r = sim.tgCmd('vsp', +(g.Vsp + 0.05).toFixed(2)); if (act === 'vspdn') r = sim.tgCmd('vsp', +(g.Vsp - 0.05).toFixed(2));
      if (act === 'brkClose') r = sim.breaker(bt, true);
      if (act === 'brkOpen') armOrRun('fp-brkopen', () => { r = sim.breaker(bt, false); });
      if (act === 'ufls') r = sim.setUfls(!sim.eq.uflsArm);
      const tr = INFO[tag].train;
      if (act === 'dmSvc') r = sim.demin(tr, 'service'); if (act === 'dmStby') r = sim.demin(tr, 'standby'); if (act === 'dmRegen') r = sim.demin(tr, 'regen');
    } else if (INFO[tag] && INFO[tag].bms) {
      if (act === 'purge') r = sim.bms('purge');
      if (act === 'light') r = sim.bms('light');
      if (act === 'btrip') armOrRun('fp-btrip', () => { r = sim.bms('trip'); });
      if (act === 'bstop') r = sim.bms('stop');
    } else if (act === 'call' || act === 'release') {
      r = act === 'call' ? sim.callTruck(v) : sim.releaseTruck();
    } else if (tag === 'K-301') {
      if (act === 'kstart') r = sim.setCompressor(true);
      if (act === 'kstop') armOrRun('fp-kstop', () => { r = sim.setCompressor(false); });
      if (act === 'vfd') r = sim.vfdChangeover();
      if (act === 'bypass') armOrRun('fp-byp', () => { r = sim.setBypass(!sim.eq.pshhBypass); });
    } else if (tag === 'XV-101') {
      if (act === 'xvclose') armOrRun('fp-xvclose', () => { r = sim.closeXV(); });
      if (act === 'xvopen') r = sim.openXV();
    } else if (tag === 'F-401' && act === 'relight') r = sim.relightPilot(+v);
    if (r && r.msg && !r.ok && r.msg !== 'No change') toast(r.msg);
    if (r && r.ok && r.info) toast(r.info);
    render();
  }
  $('faceplate').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) doAct(b.dataset.act, b.dataset.v); });

  function select(tag) {
    if (!tag || tag === ui.selected) return;
    ui.selected = tag; ui.confirm = null;
    buildFaceplate(); renderGraphic();
  }
  PAGE_NUMS.forEach(p => $('pfd' + p).addEventListener('click', e => {
    const l = e.target.closest('.link[data-page]');
    if (l) { goPage(+l.dataset.page); return; }
    const g = e.target.closest('[data-fp]');
    if (g) select(g.dataset.fp);
  }));

  // ---------------- alarms & events ----------------
  const pgCell = tag => { const p = pageOfTag(tag); return p ? `<span class="pg" data-goto-page="${p}" title="Show page ${p}">P${p}</span>` : ''; };
  function renderBadges() {
    PAGE_NUMS.forEach(p => {
      const al = sim.alarms.filter(a => pageOfTag(a.tag) === p);
      const un = al.filter(a => !a.acked).length, act = al.filter(a => a.active).length;
      const b = $('badge-' + p);
      b.textContent = un ? String(un) : act ? String(act) : '';
      b.classList.toggle('ack', !un && act > 0);
    });
  }
  function renderAlarms() {
    const sig = sim.alarms.map(a => a.tag + a.active + a.acked + a.tIn).join('|');
    const unack = sim.alarms.filter(a => !a.acked);
    $('alm-count').textContent = `${unack.length} unacknowledged · ${sim.alarms.filter(a => a.active).length} active`;
    const top = sim.alarms.filter(a => a.active).sort((a, b) => PRI_RANK[b.pri] - PRI_RANK[a.pri] || b.tIn - a.tIn)[0];
    $('alm-top').innerHTML = top ? `<span class="pri ${top.pri}">${top.pri}</span> ${clock(top.tIn)} ${pgCell(top.tag)} <b>${top.tag}</b> ${esc(top.desc)}` : 'No active alarms';
    $('almbanner').classList.toggle('unack', unack.length > 0);
    $('btn-ackall').disabled = !unack.length || !canOperate();
    renderBadges();
    if (sig === ui.almSig) return;
    ui.almSig = sig;
    $('alm-body').innerHTML = sim.alarms.length ? sim.alarms.map(a => {
      const state = a.active ? (a.acked ? 'ACK' : 'UNACK') : 'RTN UNACK';
      return `<tr class="${a.acked ? '' : 'unack'} clickable" data-alm="${a.tag}"><td>${clock(a.tIn)}</td><td>${pgCell(a.tag)}</td><td><span class="pri ${a.pri}">${a.pri}</span></td><td>${a.tag}</td><td>${esc(a.desc)}</td><td>${esc(a.value)}</td>
        <td class="${a.acked ? '' : 'blink'}">${state}</td><td>${a.acked ? '' : `<button data-ack="${a.tag}">Ack</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="8" class="muted">No alarms</td></tr>';
  }
  $('alm-body').addEventListener('click', e => {
    const b = e.target.closest('[data-ack]');
    if (b) { if (canOperate()) { sim.ack(b.dataset.ack); render(); } return; }
    const row = e.target.closest('[data-alm]');
    if (row) showTag(ALARM_FP[row.dataset.alm] || row.dataset.alm);
  });
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-goto-page]');
    if (p && !p.closest('#debrief')) { e.stopPropagation(); goPage(+p.dataset.gotoPage); }
  }, true);
  $('btn-ackall').addEventListener('click', () => { if (canOperate()) { sim.ackAll(); render(); } });

  const KIND = { ALM: 'ALARM', RTN: 'RETURN', ACK: 'ACK', OPR: 'OPERATOR', TRIP: 'TRIP', SYS: 'SYSTEM', FAULT: 'FAULT', KEY: 'KEY', PROC: 'PROCEDURE', DEV: 'DEVIATION', PSV: 'RELIEF' };
  function renderEvents() {
    const evs = sim.events.filter(e => !e.hidden);
    if (evs.length === ui.evCount) return;
    ui.evCount = evs.length;
    $('evt-body').innerHTML = evs.slice().reverse().map(e =>
      `<tr><td>${clock(e.t)}</td><td>${pgCell(e.tag)}</td><td><span class="kind ${e.kind}">${KIND[e.kind] || e.kind}</span></td><td>${e.tag}</td><td>${esc(e.msg)}</td></tr>`).join('');
  }
  function selectTab(name) {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
    ['proc', 'alm', 'evt'].forEach(t => { $('tab-' + t).hidden = t !== name; });
  }
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); });

  // ---------------- procedure tab ----------------
  function procRef(key) {
    const pd = PROCEDURES[key];
    return `<details class="proc-ref"><summary>${esc(pd.title)}</summary><ol class="proc">${pd.steps.map(s =>
      `<li class="todo"><div class="ps-h"><b>${esc(s.title)}</b>${s.type === 'check' ? ' <span class="muted">(confirm)</span>' : ''}</div><div class="ps-d">${esc(s.detail)}</div></li>`).join('')}</ol></details>`;
  }
  function renderProcedure() {
    const p = sim.proc, el = $('tab-proc');
    const sig = p ? [sim.phase, p.cur, p.done, p.deviations.length, ui.procAll].join('|') : 'none|' + sim.scenario;
    if (sig !== ui.procSig) {
      ui.procSig = sig;
      if (!p) {
        el.innerHTML = `<div class="proc-wrap"><p class="muted">No procedure is active in this scenario (${esc(SCENARIOS[sim.scenario].name)}).
          Choose <b>Startup</b> or <b>Shutdown</b> on the handover screen (Reset) to run one. Reference copies:</p>${procRef('startup')}${procRef('shutdown')}</div>`;
      } else {
        const n = p.steps.length, doneN = p.steps.filter(s => s.tDone != null).length;
        el.innerHTML = `<div class="proc-wrap"><div class="proc-h"><b>${esc(p.title)}</b>
            <span>${p.done != null ? `<span class="ok">✓ Complete at ${clock(p.done)}</span>` : `Step ${Math.min(p.cur + 1, n)} of ${n}`} · ${doneN}/${n} done ·
            <span class="${p.deviations.length ? 'bad' : ''}">${p.deviations.length} deviation(s)</span></span>
            <label class="muted"><input type="checkbox" id="proc-all" ${ui.procAll ? 'checked' : ''}> show all step details</label></div>
          <ol class="proc">${p.steps.map((s, i) => {
            const state = s.tDone != null ? 'done' : i === p.cur ? 'cur' : 'todo';
            const ic = state === 'done' ? '✓' : state === 'cur' ? '▶' : '○';
            const showD = state === 'cur' || ui.procAll;
            const act = state === 'cur' && s.type === 'check' ? `<button class="primary" data-confirm="${i}" ${sim.phase !== 'running' ? 'disabled' : ''}>Confirm checks done</button>`
              : state === 'cur' && s.hold ? '<div class="ps-hold" id="ps-hold"></div>' : '';
            return `<li class="${state}"><div class="ps-h"><span class="ps-ic">${ic}</span><b>${i + 1}. ${esc(s.title)}</b>
              <span class="ps-t">${s.tDone != null ? clock(s.tDone) : s.type === 'check' ? 'confirm' : 'auto'}</span></div>
              ${showD ? `<div class="ps-d">${esc(s.detail)}</div>` : ''}${act}</li>`;
          }).join('')}</ol>
          ${p.deviations.length ? `<div class="devs"><b>Deviations</b><ul>${p.deviations.map(d => `<li>${clock(d.t)} ${esc(d.msg)}</li>`).join('')}</ul></div>` : ''}</div>`;
      }
    }
    const h = $('ps-hold');
    if (h && p) {
      const st = p.steps[p.cur];
      h.textContent = st.okSince != null ? `Holding: ${Math.floor(sim.t - st.okSince)} / ${st.hold} s` : `Waiting for conditions to hold for ${st.hold} s`;
    }
  }
  $('tab-proc').addEventListener('click', e => { const b = e.target.closest('[data-confirm]'); if (b) { sim.confirmStep(+b.dataset.confirm); render(); } });
  $('tab-proc').addEventListener('change', e => { if (e.target.id === 'proc-all') { ui.procAll = e.target.checked; renderProcedure(); } });

  // ---------------- handover / scenario picker ----------------
  const DESIGN = `Unit at design rates: olefin <b>120 kmol/h</b>, isobutane <b>1080 kmol/h</b> (I/O <b>9.0</b>), reactor TIC-100 in AUTO at <b>8.0 °C</b>,
      acid circulating, K-301 running at ≈ 89 % speed (suction 3.1 barg, discharge 12.4 barg), CW pump P-303A running with P-303B on standby, flare idle on purge.`;
  const BRIEF = {
    steady: `<p>${DESIGN}</p><p><b>Free practice:</b> no upset is scheduled. Try setpoint changes, mode changes and pump starts/stops on all three pages and watch how the unit responds. Press <b>Finish</b> for a short summary (not scored).</p>`,
    drill: `<p>${DESIGN}</p><p>Start on <b>page 1 (reactor)</b>. Monitor and respond to anything abnormal - the upset is <b>unannounced</b>. When you have diagnosed it and the unit is where you want it, press <b>Submit diagnosis</b>.</p>`,
    suction: `<p>${DESIGN}</p><p>Start on <b>page 2 (refrigeration compressor)</b>. An unannounced upset will raise K-301 suction pressure and reactor temperature together.
      Use the trends on pages 1 and 2 to decide whether the high suction pressure is a <b>cause</b> (the compressor lost capacity), a <b>symptom</b> (another refrigeration-loop fault) or a
      <b>response</b> (to a process disturbance). Take corrective action, then press <b>Submit diagnosis</b>.</p>
      <p class="muted">Score: diagnosis 40 · reactor time outside limits 25 · unnecessary interventions 15 · outcome 20. The root cause is randomised each run.</p>`,
    relief: `<p>${DESIGN}</p><p><b>Handover notes:</b> <b>PSHH-303</b> (K-301 high discharge pressure trip) is <b>in bypass</b> for transmitter calibration, authorised until 08:00.
      Flare assist steam <b>FIC-402</b> is in AUTO at the <b>0.5 t/h</b> minimum. P-401 (KO drum pump-out) is stopped.</p>
      <p>Start on <b>page 3 (flare)</b>. Follow any event across the reactor, compressor and flare pages, keep the flare smokeless and the KO drum level under control, and press <b>Submit diagnosis</b> when the unit is safe.</p>
      <p class="muted">Score: diagnosis 25 · relief and flare 35 · reactor limits 15 · unnecessary interventions 10 · outcome 15.</p>`,
    startup: `<p>The unit is in <b>cold shutdown</b> after maintenance: reactor and refrigerant at ambient (25 °C), P-101, P-102, P-201 and K-301 stopped, XV-101 closed, acid inventory in D-102. CW is running.</p>
      <p>Bring the unit to design rates by following the <b>startup procedure</b> on the <b>Procedure</b> tab. Steps complete automatically when the plant reaches the stated condition; check steps need <b>Confirm</b>. Doing a later step's action early is an <b>out-of-sequence deviation</b>.</p>
      <p class="muted">Score: completion 30 · sequence and step size 25 · time outside limits 25 · time to complete 20 (target 15 min).</p>`,
    shutdown: `<p>${DESIGN} A <b>planned shutdown</b> to cold shutdown has been authorised.</p>
      <p>Follow the <b>shutdown procedure</b> on the <b>Procedure</b> tab. Steps complete automatically; check steps need <b>Confirm</b>. Doing a later step's action early is an <b>out-of-sequence deviation</b>.</p>
      <p class="muted">Score: completion 30 · sequence and step size 25 · time outside limits 25 · time to complete 20 (target 10 min).</p>`,
  };
  Object.assign(BRIEF, {
    colDrill: `<p>${DESIGN}</p><p>Start on <b>page 4 (fractionator)</b>. Watch T-501 pressure, the condenser and the reboiler. The upset is <b>unannounced</b>. Compare each controller's output with its valve feedback.</p>
      <p class="muted">Score: diagnosis 35 · consequences 30 · unnecessary interventions 15 · outcome 20.</p>`,
    blrDrill: `<p>${DESIGN}</p><p>Start on <b>page 5 (steam / B-601)</b>. Keep the boiler on line - the column reboiler and the flare depend on its steam. The upset is <b>unannounced</b>.</p>
      <p class="muted">Score: diagnosis 35 · consequences 30 · unnecessary interventions 15 · outcome 20.</p>`,
    flrDrill: `<p>${DESIGN}</p><p>Start on <b>page 3 (flare)</b>. Handover note: <b>another unit will depressure to the flare during your shift</b>. Keep the flare lit and ready. The upset is <b>unannounced</b>.</p>
      <p class="muted">Score: diagnosis 35 · consequences (time with no pilot, unburned release) 30 · unnecessary interventions 15 · outcome 20.</p>`,
    tankDrill: `<p>${DESIGN}</p><p>Start on <b>page 7 (tank farm)</b>. An olefin truck is <b>unloading into TK-901</b> through P-901 (20 t on board, tank at 55 %). Stop the transfer before the tank is full.
      TK-901 has two level instruments: LT-901 (control and LAH) and an independent radar LI-901B (LAHH trip at 95 %).</p>
      <p class="muted">Score: diagnosis 35 · consequences 30 · unnecessary interventions 15 · outcome 20.</p>`,
  });
  const UTIL = `<p>${DESIGN} TG-1001 is generating <b>2.2 MW</b> on the 11 kV bus with <b>about 1.1 MW imported from TNB</b>. Deaerator D-1201 at 0.35 barg, demin train A in service, wastewater to the outfall within the DOE limits.</p>`;
  Object.assign(BRIEF, {
    gridDrill: `${UTIL}<p>Start on <b>page 9 (electrical)</b>. The upset is <b>unannounced</b>. Keep the plant powered, keep the frequency near 50 Hz and, if you lose the grid, get back on it when TNB allows - synchronising with the synchroscope.</p>
      <p class="muted">Score: diagnosis 35 · consequences (time below 49.8 Hz, load shedding, blackout, rough synchronising) 30 · unnecessary interventions 15 · outcome 20.</p>`,
    tgDrill: `${UTIL}<p>Start on <b>page 8 (turbine)</b>. Air ejector J-1001A holds the condenser vacuum, J-1001B is on standby. The upset is <b>unannounced</b> - keep TG-1001 on line.</p>
      <p class="muted">Score: diagnosis 35 · consequences 30 · unnecessary interventions 15 · outcome 20.</p>`,
    waterDrill: `${UTIL}<p>Start on <b>page 10 (deaerator and condensate)</b>. About 24 t/h of steam condensate returns from the E-501 reboiler and other users. The upset is <b>unannounced</b>. Protect the boiler water quality (page 5, AI-602).</p>
      <p class="muted">Score: diagnosis 35 · consequences 30 · unnecessary interventions 15 · outcome 20.</p>`,
    wwtDrill: `${UTIL}<p>Start on <b>page 11 (wastewater)</b>. Demin train B is exhausted and the field operator will regenerate it during your shift (acid then caustic waste goes to the TK-1304 neutralisation pit). Keep the final effluent within <b>DOE Standard B</b>: pH 5.5–9.0, oil ≤ 10 mg/L, ≤ 40 °C.</p>
      <p class="muted">Score: diagnosis 35 · consequences (off-spec discharge) 30 · unnecessary interventions 15 · outcome 20.</p>`,
  });
  const SCN_GROUPS = [['Normal operation', ['steady']], ['Upset drills (unannounced)', ['drill', 'suction', 'relief', 'colDrill', 'blrDrill', 'flrDrill', 'tankDrill', 'gridDrill', 'tgDrill', 'waterDrill', 'wwtDrill']],
    ['Startup procedures', ['plantStart', 'startup', 'columnStart', 'boilerStart', 'tgStart', 'flareStart']], ['Shutdown procedures', ['plantStop', 'shutdown', 'columnStop', 'tgStop', 'boilerStop', 'flareStop']]];
  function briefFor(k) {
    if (BRIEF[k]) return BRIEF[k];
    const pd = PROCEDURES[k];
    return `<p>${esc(SCENARIOS[k].sub)}</p><p>Follow <b>${esc(pd.title)}</b> on the <b>Procedure</b> tab (${pd.steps.length} steps). Steps complete automatically when the plant reaches the stated condition; check steps need <b>Confirm</b>.
      Doing a later step's action early is an <b>out-of-sequence deviation</b>. Use the page tabs - the steps move between the flare, boiler, column, compressor and reactor pages.</p>
      <p class="muted">Score: completion 30 · sequence and step size 25 · time outside limits 25 · time to complete 20 (target ${Math.round(pd.target / 60)} min). Speed 5× or 10× helps.</p>`;
  }
  function renderHandover() {
    $('scn-pick').innerHTML = SCN_GROUPS.map(([g, keys]) => `<div class="scn-group" style="grid-column:1/-1">${g}</div>` + keys.map(k =>
      `<button type="button" role="radio" aria-checked="${k === sim.scenario}" class="scn-opt${k === sim.scenario ? ' on' : ''}" data-scn="${k}">
      <b>${SCENARIOS[k].name}</b><span>${SCENARIOS[k].sub}</span></button>`).join('')).join('');
    $('brief').innerHTML = briefFor(sim.scenario);
  }
  $('scn-pick').addEventListener('click', e => {
    const b = e.target.closest('[data-scn]');
    if (!b || sim.phase !== 'standby' || b.dataset.scn === sim.scenario) return;
    opts.scenario = b.dataset.scn;
    resetRun();
  });

  // ---------------- trends ----------------
  function setStripWrap(wrap, strips) { wrap.classList.toggle('p5', strips.length >= 5); }
  function renderTrend() {
    const h = sim.history, strips = Trend.SETS[ui.page];
    const t1 = h.length ? h[h.length - 1].t : 0;
    setStripWrap($('trend-wrap'), strips);
    const lg = Trend.legendHTML(strips);
    if ($('trend-legend').innerHTML !== lg) $('trend-legend').innerHTML = lg;
    $('trend-page').textContent = '· page ' + ui.page + ' ' + PAGES[ui.page].short.toLowerCase();
    ui.geo = Trend.draw($('trend'), h, { t0: t1 - ui.win, t1, cursor: ui.hoverT, strips });
  }
  function hookHover(canvasId, ttId, getHist, getGeo, getStrips, onT) {
    const cv = $(canvasId), wrap = cv.parentElement;
    wrap.addEventListener('mousemove', e => {
      const geo = getGeo(); if (!geo) return;
      const rc = cv.getBoundingClientRect();
      const x = e.clientX - rc.left;
      if (x < geo.L || x > rc.width - geo.R) { onT(null); if (ttId) $(ttId).hidden = true; return; }
      const t = geo.tOf(x);
      onT(t);
      if (ttId) {
        const tt = $(ttId), r = Trend.nearest(getHist(), t);
        tt.innerHTML = Trend.tooltipHTML(r, getStrips()); tt.hidden = false;
        const left = x + 14 + 230 > rc.width ? x - 244 : x + 14;
        tt.style.left = left + 'px'; tt.style.top = Math.max(4, e.clientY - rc.top - 60) + 'px';
      }
    });
    wrap.addEventListener('mouseleave', () => { onT(null); if (ttId) $(ttId).hidden = true; });
  }
  hookHover('trend', 'tt', () => sim.history, () => ui.geo, () => Trend.SETS[ui.page], t => { ui.hoverT = t; renderTrend(); });
  document.querySelector('.trends .seg').addEventListener('click', e => {
    const b = e.target.closest('[data-win]'); if (!b) return;
    ui.win = +b.dataset.win;
    document.querySelectorAll('.trends .seg button').forEach(x => x.classList.toggle('on', x === b));
    renderTrend();
  });

  // ---------------- top bar ----------------
  function renderTop() {
    $('clock').textContent = clock(sim.t);
    const ph = $('phase');
    ph.textContent = sim.phase === 'standby' ? 'STANDBY' : sim.phase === 'debrief' ? 'FROZEN · DEBRIEF' : (ui.paused ? 'PAUSED' : 'ON SHIFT');
    ph.className = 'phase' + (sim.phase === 'running' ? ' running' : '') + (ui.paused && sim.phase === 'running' ? ' paused' : '');
    $('btn-takeover').hidden = sim.phase !== 'standby';
    $('scn-pill').textContent = SCENARIOS[sim.scenario].name;
    $('btn-submit').disabled = sim.phase === 'standby';
    if (sim.phase === 'debrief') $('btn-submit').textContent = 'Open debrief';
    else if (DRILLS.includes(sim.scenario)) $('btn-submit').textContent = 'Submit diagnosis';
    else setConfirmLabel('btn-submit', 'Finish & debrief', 'Confirm finish');
    $('btn-pause').disabled = sim.phase !== 'running';
    $('btn-pause').textContent = ui.paused ? 'Resume' : 'Pause';
    setConfirmLabel('btn-reset', 'Reset', 'Confirm reset');
  }
  document.querySelector('.speed').addEventListener('click', e => {
    const b = e.target.closest('[data-speed]'); if (!b) return;
    ui.speed = +b.dataset.speed;
    document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('btn-pause').addEventListener('click', () => { ui.paused = !ui.paused; render(); });
  function takeOver() {
    sim.takeOver(); $('handover').hidden = true;
    if (sim.proc) selectTab('proc');
    goPage(SCENARIOS[sim.scenario].page);
    if (sim.scenario === 'startup') showTag('K-301');
    buildFaceplate(); render();
  }
  $('btn-takeover').addEventListener('click', takeOver);
  $('btn-takeover2').addEventListener('click', takeOver);
  $('btn-reset').addEventListener('click', () => armOrRun('btn-reset', () => resetRun()));

  function resetRun() {
    sim.opts = Object.assign({}, opts);
    sim.reset(qs.has('seed') ? num('seed') : undefined);
    audio.silenced.clear(); audio.lastPri = null;
    Snd.reset(sim);    // stop every active sound and forget equipment state from the old run
    ui.paused = false; ui.almSig = ''; ui.evCount = -1; ui.hoverT = null; ui.confirm = null; ui.procSig = '';
    ui.selByPage = { 1: 'TIC-100', 2: 'PIC-301', 3: 'FIC-402' };
    $('debrief').hidden = true; $('diag').hidden = true; $('handover').hidden = false;
    selectTab(sim.proc ? 'proc' : 'alm');
    renderHandover();
    goPage(SCENARIOS[sim.scenario].page);
  }

  // ---------------- diagnosis ----------------
  function buildDiag() {
    const qsx = DIAG[sim.scenario] || [];
    $('diag-qs').innerHTML = qsx.map(q => `<fieldset><legend>${esc(q.legend)}</legend><div class="opts">${Object.entries(q.opts).map(([k, v]) =>
      `<label><input type="radio" name="${q.id}" value="${k}" ${q.id === 'finalState' ? '' : 'required'}> ${esc(v)}</label>`).join('')}</div></fieldset>`).join('');
  }
  $('btn-submit').addEventListener('click', () => {
    if (sim.phase === 'debrief') { $('debrief').hidden = false; drawReplay(); return; }
    if (sim.phase !== 'running') return;
    if (!DRILLS.includes(sim.scenario)) { armOrRun('btn-submit', () => { showDebrief(sim.submit({})); }); render(); return; }
    ui.wasPaused = ui.paused; ui.paused = true;
    buildDiag();
    $('diag').hidden = false; render();
  });
  $('diag-cancel').addEventListener('click', () => { $('diag').hidden = true; ui.paused = !!ui.wasPaused; render(); });
  $('diag-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target), ans = { explanation: $('opt-expl').value.trim() };
    (DIAG[sim.scenario] || []).forEach(q => { ans[q.id] = fd.get(q.id); });
    const rep = sim.submit(ans);
    $('diag').hidden = true; ui.paused = false;
    showDebrief(rep);
    render();
  });

  // ---------------- debrief ----------------
  const rp = { t0: 0, t1: 0, cursor: 0, geo: null, playing: null, page: 1, ghost: null, markers: [] };
  const TITLES = { drill: 'Drill debrief - loss of refrigeration', suction: 'Drill debrief - high K-301 suction pressure', relief: 'Drill debrief - overpressure relief to flare',
                   startup: 'Startup debrief', shutdown: 'Shutdown debrief', steady: 'Steady-state practice summary' };
  Object.keys(SCENARIOS).forEach(k => { if (!TITLES[k]) TITLES[k] = (DRILLS.includes(k) ? 'Drill debrief - ' : 'Debrief - ') + SCENARIOS[k].name.replace(/^Upset: /, ''); });
  function showDebrief(rep) {
    const scn = rep.scenario || 'drill', isDrill = DRILLS.includes(scn);
    $('db-title').textContent = TITLES[scn];
    $('db-answers-h').textContent = isDrill ? 'Your diagnosis vs. model answer' : rep.proc ? 'Procedure record' : 'Final state';
    $('db-score').innerHTML = (rep.total == null ? '<div class="score-total"><small>Practice - not scored</small></div>'
      : `<div class="score-total">${rep.total}<small> / 100</small></div>`) + rep.cats.map(c =>
      `<div class="cat"><div class="cat-h"><span>${c.name}</span><span>${c.max == null ? '' : `${c.pts} / ${c.max}`}</span></div>
       ${c.max == null ? '' : `<div class="cat-bar"><i style="width:${c.pts / c.max * 100}%"></i></div>`}<ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
    const finalLine = `TI-100 ${f(rep.final.Tr, 1)} °C · olefin ${f(rep.final.Fo, 0)} kmol/h · K-301 ${sim.eq.K301 ? 'running' : 'stopped'} · PSV-301 ${sim.x.psvOpen ? 'OPEN' : 'closed'} · flare ${FLAME_TXT[sim.x.flame].toLowerCase()}${rep.final.tripped ? ' · TRIPPED' : ''}`;
    if (rep.proc) {
      const p = rep.proc;
      $('db-answers').innerHTML = `<div class="answers"><p><b>${esc(p.title)}</b><br><span class="muted">Final state: ${finalLine}</span></p>
        <table class="list"><thead><tr><th>#</th><th>Step</th><th>Completed</th><th>Elapsed</th></tr></thead><tbody>${p.steps.map((s, i) =>
          `<tr class="${s.tDone == null ? 'future' : ''}"><td>${i + 1}</td><td>${esc(s.title)}</td><td>${s.tDone != null ? clock(s.tDone) : '<span class="bad">not done</span>'}</td>
           <td>${s.tDone != null ? `${Math.floor(Math.round(s.tDone) / 60)}:${String(Math.round(s.tDone) % 60).padStart(2, '0')}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (!isDrill) {
      $('db-answers').innerHTML = `<div class="answers"><p>${finalLine}</p><p class="muted">Steady-state practice has no fault and no score. Choose an upset drill, Startup or Shutdown for a scored session.</p></div>`;
    } else {
      const a = rep.answers || {}, cor = rep.correct || {};
      const mark = ok => ok ? '<span class="ok">✓ correct</span>' : '<span class="bad">✗ incorrect</span>';
      const qrows = (DIAG[scn] || []).map(q => {
        const yours = q.opts[a[q.id]] || '—';
        if (!(q.id in cor)) return `<dt>${esc(q.legend.replace(/^\d+\.\s*/, ''))}</dt><dd>${esc(yours)}</dd>`;
        const ok = a[q.id] === cor[q.id];
        return `<dt>${esc(q.legend.replace(/^\d+\.\s*/, ''))}</dt><dd>${esc(yours)} ${mark(ok)}${ok ? '' : `<br><span class="muted">Correct: ${esc(q.opts[cor[q.id]])}</span>`}</dd>`;
      }).join('');
      $('db-answers').innerHTML = `<dl class="answers">
        <dt>Actual fault</dt><dd>${esc(sim.faultDesc || 'The fault had not started when you submitted.')}${rep.drill && rep.drill.onset != null && isFinite(rep.drill.onset) ? ` - started ${clock(rep.drill.onset)} (T+${rep.drill.onset} s).` : ''}</dd>
        ${qrows}
        <dt>Final state</dt><dd>${finalLine}</dd>
        <dt>Your explanation</dt><dd>${a.explanation ? esc(a.explanation) : '<span class="muted">(none given)</span>'}</dd>
        <dt>Model answer</dt><dd>${esc(rep.modelAnswer)}</dd></dl>`;
    }
    // what changed first
    const fc = rep.firstChanges || [];
    $('db-first-panel').hidden = !fc.length;
    $('db-first').innerHTML = `<ol class="firstlist">${fc.map((c, i) => `<li data-t="${c.t}" data-rpage="${c.page}"><span class="n">${i + 1}</span>
      <span class="tt">T+${Math.round(c.t - rep.marks.onset)} s</span><span><span class="pg">P${c.page}</span> ${esc(c.label)} ${c.dir === 'up' ? '▲ rose' : '▼ fell'}</span>
      <span class="tt">${f(c.from, c.dec)} → ${f(c.to, c.dec)} ${c.unit}</span></li>`).join('')}</ol>
      ${fc.length ? '<p class="hint" style="padding:0 10px 8px">Each line is the first time that measurement moved clearly away from its pre-fault average. The top of the list is closest to the root cause.</p>' : ''}`;
    // effect of actions: compare with a no-action re-run of the same drill
    rp.ghost = null;
    $('db-ghost-panel').hidden = !isDrill;
    if (isDrill) {
      const g = sim.noActionRun(rep.tEnd);
      rp.ghost = g.history;
      const yMax = Math.max(...sim.history.filter(r => r.t >= 0).map(r => r.Tr));
      const yesno = v => (v != null ? '<span class="bad">yes</span>' : 'no');
      const rows = [
        ['Peak reactor temperature', f(yMax, 1) + ' °C', f(g.maxTr, 1) + ' °C'],
        ['Time reactor outside limits', Math.round(sim.tOut) + ' s', Math.round(g.tOut) + ' s'],
        ['TZHH-100 reactor trip', yesno(sim.marks.trip), yesno(g.trip)],
        ['K-301 compressor trip', yesno(sim.marks.k301trip), yesno(g.k301trip)],
        ['PSV-301 open', Math.round(sim.x.psvT) + ' s', Math.round(g.psvT) + ' s'],
        ['Flare smoking', Math.round(sim.x.smokeT) + ' s', Math.round(g.smokeT) + ' s'],
      ];
      const H = sim.history.filter(r => r.t >= 0), mx = k => Math.max(...H.map(r => r[k])), mn = k => Math.min(...H.map(r => r[k]));
      const extra = {
        gridDrill: [['Lowest bus frequency', f(Math.min(...H.filter(r => r.fbus > 1).map(r => r.fbus).concat([50])), 2) + ' Hz', f(g.minF, 2) + ' Hz'], ['UFLS load shed', yesno(sim.marks.ufls), yesno(g.marks.ufls)],
          ['Plant blackout', yesno(sim.marks.blackout), yesno(g.marks.blackout)], ['Back on the TNB grid', sim.eq.CB1101 ? 'yes' : '<span class="bad">no</span>', g.marks.resync != null ? 'yes' : '<span class="bad">no</span>']],
        tgDrill: [['Worst condenser pressure', f(mx('Pcond'), 3) + ' bara', f(g.maxPcond, 3) + ' bara'], ['TG-1001 trip', yesno(sim.marks.tgTrip), yesno(g.marks.tgTrip)]],
        waterDrill: [['Peak boiler water TDS', f(mx('tds'), 0) + ' ppm', f(g.maxTds, 0) + ' ppm']],
        wwtDrill: [['Lowest effluent pH', f(mn('ph5'), 2), f(g.minPh5, 2)], ['Off-spec effluent to outfall', Math.round(sim.x.ww.violT) + ' s', Math.round(g.violT) + ' s']],
      }[sim.scenario];
      if (extra) rows.splice(0, rows.length, ...extra);
      $('db-ghost').innerHTML = `<div class="answers"><table class="cmp"><thead><tr><th>Measure (to ${clock(rep.tEnd)})</th><th>Your run</th><th>No action</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join('')}</tbody></table>
        <p class="hint">The dashed grey line on the replay is the no-action run. Where your line separates from it is where your actions changed the outcome.</p></div>`;
    }
    rp.page = SCENARIOS[scn].page;
    rp.t0 = Math.max(sim.history[0].t, -60); rp.t1 = Math.ceil(rep.tEnd); rp.cursor = rp.t1;
    $('rp-slider').min = rp.t0; $('rp-slider').max = rp.t1; $('rp-slider').value = rp.t1;
    const k = rep.marks;
    rp.markers = [
      k.onset != null && { t: k.onset, label: 'Fault onset', color: '--status-critical', dash: [5, 3] },
      fc[0] && { t: fc[0].t, label: '1st change: ' + fc[0].label.split(' ').slice(0, 2).join(' '), color: '--status-serious', dash: [2, 2] },
      k.firstHelpful != null && { t: k.firstHelpful, label: '1st corrective action', color: '--status-good', dash: [] },
      k.psvFirst != null && { t: k.psvFirst, label: 'PSV-301 lifts', color: '--pen-duty', dash: [] },
      k.k301trip != null && { t: k.k301trip, label: 'K-301 TRIP', color: '--status-critical', dash: [] },
      k.trip != null && { t: k.trip, label: 'REACTOR TRIP', color: '--status-critical', dash: [] },
      ...(rep.proc ? rep.proc.steps.map((s, i) => s.tDone != null && { t: s.tDone, label: 'S' + (i + 1), color: '--status-good', dash: [2, 3] }) : []),
    ].filter(Boolean).sort((p, q) => p.t - q.t).map((mk, i) => Object.assign(mk, { row: i % 3 }));
    rep.timeline.filter(e => e.kind === 'OPR' && e.t !== k.firstHelpful).forEach(e => rp.markers.push({
      t: e.t, color: e.assess === 'helpful' ? '--status-good' : e.assess === 'neutral' || !e.assess ? '--text-muted' : '--status-critical', dash: [1, 3] }));
    $('db-events').innerHTML = rep.timeline.map(e =>
      `<tr class="clickable" data-t="${e.t}"><td>${clock(e.t)}</td><td>${pgCell(e.tag)}</td><td><span class="kind ${e.kind}">${KIND[e.kind] || e.kind}</span></td><td>${e.tag}</td><td>${esc(e.msg)}${e.reason ? `<div class="muted">${esc(e.reason)}</div>` : ''}</td>
       <td>${e.assess ? `<span class="assess ${e.assess === 'out of sequence' ? 'unnecessary' : e.assess}">${e.assess}</span>` : ''}</td></tr>`).join('');
    $('debrief').hidden = false;
    setReplayPage(rp.page);
  }
  function setReplayPage(p) {
    rp.page = +p;
    document.querySelectorAll('#rp-pages [data-rpage]').forEach(b => b.classList.toggle('on', +b.dataset.rpage === rp.page));
    drawReplay();
  }
  $('rp-pages').addEventListener('click', e => { const b = e.target.closest('[data-rpage]'); if (b) setReplayPage(b.dataset.rpage); });
  const READ = {
    1: r => [['TI-100 reactor', f(r.Tr, 1) + ' °C'], ['FI-101 olefin', f(r.Fo, 0) + ' kmol/h'], ['I/O ratio', f(r.io, 1)], ['TIC-100 OP (demand)', f(r.op, 0) + ' %'],
             ['TV-100 feedback', f(r.zc, 0) + ' %'], ['QI-100 delivered', f(r.qcool, 2) + ' MW'], ['Reactor heat load', f(r.load, 2) + ' MW'], ['TI-102 pre-cooler', f(r.Tpc, 1) + ' °C'],
             ['TI-301 refrigerant', f(r.Tref, 1) + ' °C'], ['FI-201 acid', f(r.Facid, 0) + ' m3/h'], ['TIC-100 SP / mode', f(r.ticSP, 1) + ' °C · ' + r.ticMode], ['XV-101', r.xv ? 'OPEN' : 'CLOSED']],
    2: r => [['PI-301 suction', f(r.Ps, 2) + ' barg'], ['TI-302 suction', f(r.Ts, 1) + ' °C'], ['PI-303 discharge', f(r.Pd, 1) + ' barg'], ['TI-304 discharge', f(r.Td, 0) + ' °C'],
             ['SI-301 speed', f(r.N, 0) + ' %'], ['II-301 current', f(r.amps, 0) + ' A'], ['FV-302 recycle', f(r.zR, 0) + ' %'], ['Surge margin calc / meas', f(r.SM, 0) + ' / ' + f(r.SMmeas, 0) + ' %'],
             ['FI-303 CW flow', f(r.cw, 0) + ' %'], ['Available cooling', f(r.Qavail, 2) + ' MW'], ['Evaporator load', f(r.Qevap, 2) + ' MW'], ['LI-302 / LI-301', f(r.Ldrum, 0) + ' / ' + f(r.Lacc, 0) + ' %'],
             ['TI-100 reactor', f(r.Tr, 1) + ' °C'], ['K-301', r.k301 ? 'RUNNING' : 'STOPPED']],
    3: r => [['PSV-301', r.psv ? 'OPEN' : 'closed'], ['Relief FI-401', f(r.Wpsv, 1) + ' t/h'], ['PI-303 (D-301)', f(r.Pd, 2) + ' barg'], ['PI-401 header', f(r.Ph, 2) + ' barg'],
             ['LI-401 KO drum', f(r.Lko, 0) + ' %'], ['HC to tip', f(r.hc, 1) + ' t/h'], ['Assist steam', f(r.steam, 1) + ' t/h'], ['Steam / HC', r.ratio == null ? '—' : f(r.ratio, 2)],
             ['Flame', FLAME_TXT[r.flame] || '—'], ['TI-100 reactor', f(r.Tr, 1) + ' °C']],
    4: r => [['PI-502 column', f(r.Pc, 2) + ' barg'], ['TI-502 top', f(r.Ttop, 1) + ' °C'], ['TI-501 tray', f(r.Ttray, 1) + ' °C'], ['FI-501 steam', f(r.st501, 1) + ' t/h'],
             ['Boil-up', f(r.V5, 0) + ' kmol/h'], ['Feed', f(r.F5, 0) + ' kmol/h'], ['Reflux', f(r.L5, 0) + ' kmol/h'], ['iC4 recycle', f(r.D5, 0) + ' kmol/h'],
             ['Alkylate', f(r.B5, 0) + ' kmol/h'], ['LI-502 / LI-501', f(r.Ld, 0) + ' / ' + f(r.Lb, 0) + ' %'], ['Recycle purity', f(r.pur5, 1) + ' %'], ['iC4 in alkylate', f(r.ic4b, 1) + ' %'], ['Make-up iC4', f(r.mk, 0) + ' kmol/h']],
    5: r => [['PI-605 header', f(r.Psh, 2) + ' barg'], ['PI-601 drum', f(r.Pdrum, 2) + ' barg'], ['Generation', f(r.gen, 1) + ' t/h'], ['Demand', f(r.stUse, 1) + ' t/h'],
             ['Fuel gas', f(r.fuel, 2) + ' t/h'], ['Air', f(r.air, 1) + ' t/h'], ['Flue O₂', f(r.O2, 1) + ' %'], ['Drum level', f(r.Ldr, 0) + ' %'], ['BFW', f(r.bfw, 1) + ' t/h'], ['Burner management', r.bms || '—']],
    7: r => [['TK-901 LT-901', f(r.L901, 1) + ' %'], ['TK-901 radar', f(r.L901B, 1) + ' %'], ['TK-901 pressure', f(r.P901, 2) + ' barg'], ['TK-902', f(r.L902, 1) + ' %'],
             ['TK-903', f(r.L903, 1) + ' %'], ['TK-904', f(r.L904, 1) + ' %'], ['TK-905', f(r.L905, 1) + ' %'], ['TK-903 vapour', f(r.P903, 0) + ' mbar · O₂ ' + f(r.O2903, 1) + ' %'], ['Truck load', f(r.truckAmt, 1) + ' t']],
    6: r => [['PI-701 receiver', f(r.Prec, 2) + ' barg'], ['PI-702 IA header', f(r.Pia, 2) + ' barg'], ['K-701', r.ld701 ? 'LOADED' : 'unloaded/off'], ['K-702', r.ld702 ? 'LOADED' : 'unloaded/off'],
             ['N₂ header', f(r.Pn2, 2) + ' barg'], ['LN₂ tank', f(r.Ln2, 1) + ' %'], ['Flare N₂ purge', f(r.purge, 2) + ' t/h']],
    8: r => [['SI-1001 speed', f(r.Ntg, 0) + ' rpm'], ['Governor', r.tgMode], ['JI-1001 output', f(r.Pe, 2) + ' MW'], ['Load ramp', f(r.PeSP, 2) + ' MW'], ['FI-1001 steam', f(r.Ftg, 1) + ' t/h'],
             ['PI-1001 condenser', f(r.Pcond, 3) + ' bara'], ['Hotwell', f(r.Lhw, 0) + ' %'], ['Vibration', f(r.vib, 0) + ' µm']],
    9: r => [['Bus frequency', f(r.fbus, 2) + ' Hz'], ['TNB frequency', r.gridOK ? f(r.fgrid, 2) + ' Hz' : 'GRID LOST'], ['Bus voltage', f(r.Vbus, 2) + ' kV'], ['Plant load', f(r.eload, 2) + ' MW'],
             ['Generation', f(r.Pe, 2) + ' MW'], ['TNB import', f(r.imp, 2) + ' MW'], ['CB-1101 / 1102 / 1103', [r.cb1101, r.cb1102, r.cb1103].map(v => (v ? 'C' : 'O')).join(' / ')]],
    10: r => [['Deaerator', f(r.daP, 2) + ' barg · ' + f(r.daT, 1) + ' °C'], ['Deaerator level', f(r.daL, 0) + ' %'], ['Feedwater O₂', f(r.daO2, 0) + ' ppb'], ['Make-up', f(r.Fmk, 1) + ' t/h'],
              ['Demin', f(r.dmCond, 2) + ' µS/cm · tank ' + f(r.dmL, 0) + ' %'], ['Condensate', f(r.crCond, 0) + ' µS/cm · oil ' + f(r.crOil, 0) + ' ppm'], ['Dumped', f(r.crDump, 1) + ' t/h'], ['Boiler TDS', f(r.tds, 0) + ' ppm']],
    11: r => [['Pit pH', f(r.ph4, 2)], ['Effluent pH', f(r.ph5, 2)], ['Dosing', f(r.dose, 0)], ['Effluent oil', f(r.oil5, 1) + ' mg/L'], ['Effluent temp', f(r.T5, 1) + ' °C'],
              ['Equalisation', f(r.Leq, 0) + ' %'], ['XV-1305', r.outfall ? 'OUTFALL' : 'RECYCLE'], ['Off-spec discharged', f(r.violT, 0) + ' s']],
  };
  function drawReplay() {
    if ($('debrief').hidden) return;
    const strips = Trend.SETS[rp.page];
    setStripWrap($('rp-wrap'), strips);
    $('rp-legend').innerHTML = Trend.legendHTML(strips, !!rp.ghost);
    rp.geo = Trend.draw($('rp-canvas'), sim.history, { t0: rp.t0, t1: rp.t1, cursor: rp.cursor, markers: rp.markers, strips, ghost: rp.ghost });
    $('rp-time').textContent = clock(rp.cursor) + ` (T${rp.cursor >= 0 ? '+' : ''}${Math.round(rp.cursor)} s)`;
    const r = Trend.nearest(sim.history, rp.cursor);
    if (r) $('rp-read').innerHTML = READ[rp.page](r).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    document.querySelectorAll('#db-events tr').forEach(tr => tr.classList.toggle('future', +tr.dataset.t > rp.cursor + 0.5));
  }
  const jumpTo = t => { rp.cursor = Math.max(rp.t0, Math.min(rp.t1, Math.round(t))); $('rp-slider').value = rp.cursor; stopPlay(); drawReplay(); };
  $('rp-slider').addEventListener('input', e => jumpTo(+e.target.value));
  $('db-events').addEventListener('click', e => { const tr = e.target.closest('tr[data-t]'); if (tr) jumpTo(+tr.dataset.t); });
  $('db-first').addEventListener('click', e => { const li = e.target.closest('li[data-t]'); if (li) { rp.page = +li.dataset.rpage; setReplayPage(rp.page); jumpTo(+li.dataset.t); } });
  hookHover('rp-canvas', null, () => sim.history, () => rp.geo, () => Trend.SETS[rp.page], () => {});
  $('rp-canvas').parentElement.addEventListener('click', e => {
    if (!rp.geo) return;
    jumpTo(rp.geo.tOf(e.clientX - $('rp-canvas').getBoundingClientRect().left));
  });
  function stopPlay() { if (rp.playing) { clearInterval(rp.playing); rp.playing = null; $('rp-play').textContent = '▶ Play'; } }
  $('rp-play').addEventListener('click', () => {
    if (rp.playing) return stopPlay();
    if (rp.cursor >= rp.t1) rp.cursor = rp.t0;
    const stepT = Math.max(1, (rp.t1 - rp.t0) / 200);
    $('rp-play').textContent = '❚❚ Pause';
    rp.playing = setInterval(() => {
      rp.cursor = Math.min(rp.t1, rp.cursor + stepT); $('rp-slider').value = rp.cursor; drawReplay();
      if (rp.cursor >= rp.t1) stopPlay();
    }, 100);
  });
  $('db-console').addEventListener('click', () => { $('debrief').hidden = true; });
  $('db-again').addEventListener('click', resetRun);

  // ---------------- alarm sound (Web Audio, no files) ----------------
  // The horn and the equipment sounds (js/sound.js) share one audio context, master volume and mute.
  const audio = { silenced: new Set(), nextAt: 0, lastPri: null };
  const HORN = {
    URGENT: { period: 900, notes: [[988, 0.11, 0], [988, 0.11, 0.18], [988, 0.11, 0.36]] },
    HIGH: { period: 1600, notes: [[740, 0.2, 0], [587, 0.2, 0.26]] },
    LOW: { period: 4000, notes: [[523, 0.16, 0]] },
  };
  const almKey = a => a.tag + '@' + a.tIn;
  function soundingPri() {
    if (sim.phase !== 'running' || ui.paused) return null;
    let top = null;
    sim.alarms.forEach(a => { if (a.active && !a.acked && !audio.silenced.has(almKey(a)) && (!top || PRI_RANK[a.pri] > PRI_RANK[top])) top = a.pri; });
    return top;
  }
  function updateSound() {
    const pri = soundingPri();
    $('btn-silence').disabled = !pri;
    // equipment sounds follow the simulated state on every page (graphics on other pages need not be visible)
    Snd.update(sim, sim.phase === 'running' && !ui.paused);
    if (!pri || !Snd.ready()) { audio.lastPri = pri; return; }
    const now = performance.now();
    if (pri !== audio.lastPri || now >= audio.nextAt) {
      const h = HORN[pri];
      h.notes.forEach(([fq, d, off]) => Snd.tone(fq, d, off));
      audio.nextAt = now + h.period;
    }
    audio.lastPri = pri;
  }
  function renderSoundBtn() {
    const on = Snd.state.enabled;
    $('btn-snd-enable').textContent = on ? '🔊 Sound on' : '🔈 Enable sound';
    $('btn-snd-enable').classList.toggle('on', on);
    $('btn-snd-enable').title = on ? 'Click to turn all sound off' : 'Enable alarm horn and equipment sounds (compressor, relief valves)';
    $('btn-mute').textContent = Snd.state.muted ? 'Unmute' : 'Mute';
    $('btn-mute').setAttribute('aria-pressed', String(Snd.state.muted));
    $('btn-mute').classList.toggle('on', Snd.state.muted);
    $('snd-vol').value = Math.round(Snd.state.volume * 100);
  }
  $('btn-snd-enable').addEventListener('click', () => {
    if (Snd.state.enabled) Snd.disable(); else Snd.enable(sim);
    renderSoundBtn();
  });
  $('btn-mute').addEventListener('click', () => { Snd.setMuted(!Snd.state.muted); renderSoundBtn(); });
  $('snd-vol').addEventListener('input', e => { Snd.setVolume(+e.target.value / 100); });
  // remember the choice: if sound was enabled last time, the first click anywhere re-enables it (browsers need a gesture)
  const autoEnable = () => {
    if (Snd.wanted() && !Snd.state.enabled) { Snd.enable(sim); renderSoundBtn(); }
    document.removeEventListener('pointerdown', autoEnable); document.removeEventListener('keydown', autoEnable);
  };
  document.addEventListener('pointerdown', autoEnable); document.addEventListener('keydown', autoEnable);
  $('btn-silence').addEventListener('click', () => {
    sim.alarms.forEach(a => { if (a.active && !a.acked) audio.silenced.add(almKey(a)); });
    audio.lastPri = null;
    render();
  });
  renderSoundBtn();

  // ---------------- misc ----------------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, Math.max(3500, msg.length * 55));
  }

  let lastPhase = null;
  function render() {
    if (sim.phase !== lastPhase) { lastPhase = sim.phase; buildFaceplate(); }
    renderTop(); renderGraphic(); renderKPIs(); updateFaceplate(); renderAlarms(); renderEvents(); renderTrend();
    renderProcedure(); updateSound();
  }

  window.addEventListener('resize', () => { renderTrend(); drawReplay(); });
  buildTags();
  renderHandover();
  selectTab(sim.proc ? 'proc' : 'alm');
  goPage(SCENARIOS[sim.scenario].page);
  setInterval(() => {
    if (sim.phase === 'running' && !ui.paused) sim.advance(0.1 * ui.speed);
    render();
  }, 100);
  Object.assign(window.app, { render, showDebrief, goPage, showTag });
})();
