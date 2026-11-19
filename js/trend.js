/*
 * Trend renderer: stacked strips on one shared timeline, one y-scale per strip (no dual axes).
 * Each DCS page has its own strip set. An optional "ghost" history (the same drill re-run with no
 * operator action) is drawn as a dashed grey line on pens marked ghost:true.
 */
(function (global) {
  'use strict';

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  const T_STRIP = { key: 'temp', title: 'Reactor temperature TI-100', unit: '°C', lo: 0, hi: 18, ticks: [0, 4, 8, 11, 15],
    pens: [{ k: 'Tr', name: 'TI-100', color: '--pen-temp', ghost: true, fmt: v => v.toFixed(1) + ' °C' }],
    refs: [{ v: 4, label: 'limit 4' }, { v: 11, label: 'limit 11' }, { v: 15, label: 'trip 15', strong: true }] };

  const SETS = {
    1: [
      T_STRIP,
      { key: 'flow', title: 'Olefin feed FI-101', unit: 'kmol/h', lo: 0, hi: 200, ticks: [0, 50, 100, 150, 200],
        pens: [{ k: 'Fo', name: 'FI-101', color: '--pen-olefin', fmt: v => v.toFixed(0) + ' kmol/h' },
               { k: 'foSP', name: 'SP', color: '--pen-olefin', dash: [4, 4], thin: true, fmt: v => v.toFixed(0) }] },
      { key: 'cool', title: 'Cooling: demand vs delivered', unit: '%', lo: 0, hi: 110, ticks: [0, 25, 50, 75, 100],
        pens: [{ k: 'op', name: 'Demand (TIC-100 OP)', short: 'Demand', color: '--pen-demand', fmt: v => v.toFixed(0) + ' %' },
               { k: 'qcoolPct', name: 'Delivered duty QI-100', short: 'Delivered', color: '--pen-duty', fmt: (v, r) => r.qcool.toFixed(2) + ' MW (' + v.toFixed(0) + ' %)' }] },
    ],
    2: [
      { key: 'ps', title: 'Suction pressure PI-301', unit: 'barg', lo: 0, hi: 6, ticks: [0, 2, 3.1, 4, 6],
        pens: [{ k: 'Ps', name: 'PI-301', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(2) + ' barg' }],
        refs: [{ v: 3.6, label: 'PAH 3.6' }] },
      { key: 'pd', title: 'Discharge pressure PI-303', unit: 'barg', lo: 8, hi: 20, ticks: [8, 12, 16, 20],
        pens: [{ k: 'Pd', name: 'PI-303', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(1) + ' barg' }],
        refs: [{ v: 14.5, label: 'PAH 14.5' }, { v: 16.8, label: 'PSHH 16.8' }, { v: 17.5, label: 'PSV 17.5', strong: true }] },
      { key: 'mach', title: 'Speed, recycle valve and CW flow', unit: '%', lo: 0, hi: 110, ticks: [0, 25, 50, 75, 100],
        pens: [{ k: 'N', name: 'Speed SI-301', short: 'Speed', color: '--pen-demand', fmt: v => v.toFixed(0) + ' %' },
               { k: 'zR', name: 'Recycle FV-302', short: 'Recycle', color: '--pen-duty', fmt: v => v.toFixed(0) + ' %' },
               { k: 'cw', name: 'CW flow FI-303', short: 'CW', color: '--pen-temp', fmt: v => v.toFixed(0) + ' %' }] },
      { key: 'duty', title: 'Reactor heat load vs available cooling', unit: 'MW', lo: 0, hi: 7, ticks: [0, 2, 4, 6],
        pens: [{ k: 'load', name: 'Reactor heat load', short: 'Load', color: '--pen-duty', fmt: v => v.toFixed(2) + ' MW' },
               { k: 'Qavail', name: 'Available cooling QI-301', short: 'Available', color: '--pen-demand', fmt: v => v.toFixed(2) + ' MW' }] },
      T_STRIP,
    ],
    3: [
      { key: 'relief', title: 'PSV-301 relief flow and assist steam', unit: 't/h', lo: 0, hi: 30, ticks: [0, 10, 20, 30],
        pens: [{ k: 'Wpsv', name: 'Relief FI-401', short: 'Relief', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(1) + ' t/h' },
               { k: 'steam', name: 'Assist steam FI-402', short: 'Steam', color: '--pen-demand', fmt: v => v.toFixed(1) + ' t/h' }] },
      { key: 'pd3', title: 'D-301 pressure PI-303 vs PSV-301 set', unit: 'barg', lo: 10, hi: 19, ticks: [10, 13, 16, 19],
        pens: [{ k: 'Pd', name: 'PI-303', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(2) + ' barg' }],
        refs: [{ v: 16.3, label: 'reseat 16.3' }, { v: 17.5, label: 'set 17.5', strong: true }] },
      { key: 'ph', title: 'Flare header pressure PI-401', unit: 'barg', lo: 0, hi: 1, ticks: [0, 0.5, 1],
        pens: [{ k: 'Ph', name: 'PI-401', color: '--pen-demand', fmt: v => v.toFixed(2) + ' barg' }], refs: [{ v: 0.5, label: 'PAH 0.5' }] },
      { key: 'ko', title: 'KO drum level LI-401', unit: '%', lo: 0, hi: 100, ticks: [0, 50, 75, 100],
        pens: [{ k: 'Lko', name: 'LI-401', color: '--pen-temp', ghost: true, fmt: v => v.toFixed(0) + ' %' }],
        refs: [{ v: 50, label: 'LAH 50' }, { v: 75, label: 'LAHH 75', strong: true }] },
      { key: 'ratio', title: 'Steam / hydrocarbon ratio (during relief)', unit: 'ratio', lo: 0, hi: 2, ticks: [0, 0.3, 1, 1.5, 2],
        pens: [{ k: 'ratio', name: 'Steam/HC', color: '--pen-olefin', fmt: v => v.toFixed(2) }],
        refs: [{ v: 0.3, label: 'smoky below 0.3' }, { v: 1.5, label: 'over-steam above 1.5' }] },
    ],
    4: [
      { key: 'pc', title: 'Column pressure PI-502', unit: 'barg', lo: 4, hi: 10, ticks: [4, 6.5, 8, 10],
        pens: [{ k: 'Pc', name: 'PI-502', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(2) + ' barg' }],
        refs: [{ v: 8.0, label: 'PAH 8.0' }, { v: 8.6, label: 'PSHH 8.6' }, { v: 9.0, label: 'PSV 9.0', strong: true }] },
      { key: 'tray', title: 'Control tray temperature TIC-501', unit: '°C', lo: 60, hi: 190, ticks: [60, 100, 140, 190],
        pens: [{ k: 'Ttray', name: 'TI-501', color: '--pen-temp', ghost: true, fmt: v => v.toFixed(1) + ' °C' }], refs: [{ v: 128, label: 'TAL 128' }, { v: 152, label: 'TAH 152' }] },
      { key: 'reb', title: 'Reboiler steam FI-501', unit: 't/h', lo: 0, hi: 40, ticks: [0, 20, 40],
        pens: [{ k: 'st501', name: 'FI-501 steam', color: '--pen-duty', fmt: v => v.toFixed(1) + ' t/h' }] },
      { key: 'flows', title: 'Reflux, distillate (iC4 recycle) and feed', unit: 'kmol/h', lo: 0, hi: 2600, ticks: [0, 1000, 2000],
        pens: [{ k: 'L5', name: 'Reflux FI-502', short: 'Reflux', color: '--pen-demand', fmt: v => v.toFixed(0) + ' kmol/h' },
               { k: 'D5', name: 'Distillate FI-504', short: 'Distillate', color: '--pen-duty', fmt: v => v.toFixed(0) + ' kmol/h' },
               { k: 'F5', name: 'Feed FI-501F', short: 'Feed', color: '--pen-temp', fmt: v => v.toFixed(0) + ' kmol/h' }] },
      { key: 'qual', title: 'Product quality', unit: '%', lo: 0, hi: 100, ticks: [0, 5, 50, 92, 100],
        pens: [{ k: 'pur5', name: 'Recycle purity AI-502', short: 'iC4 recycle', color: '--pen-demand', fmt: v => v.toFixed(1) + ' %' },
               { k: 'ic4b', name: 'iC4 in alkylate AI-503', short: 'iC4 in alky', color: '--pen-duty', fmt: v => v.toFixed(1) + ' %' }],
        refs: [{ v: 5, label: 'alky spec 5 %' }, { v: 92, label: 'recycle 92 %' }] },
    ],
    5: [
      { key: 'hdr', title: 'MP steam header PI-605 and drum PI-601', unit: 'barg', lo: 6, hi: 14, ticks: [6, 8, 10.5, 12.5, 14],
        pens: [{ k: 'Psh', name: 'Header PI-605', short: 'Header', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(2) + ' barg' },
               { k: 'Pdrum', name: 'Drum PI-601', short: 'Drum', color: '--pen-duty', fmt: v => v.toFixed(2) + ' barg' }],
        refs: [{ v: 9.3, label: 'PAL 9.3' }, { v: 12.5, label: 'PSHH 12.5' }, { v: 13, label: 'PSV 13.0', strong: true }] },
      { key: 'gen', title: 'Steam generation vs demand', unit: 't/h', lo: 0, hi: 60, ticks: [0, 30, 60],
        pens: [{ k: 'gen', name: 'Generation FI-603', short: 'Generation', color: '--pen-demand', fmt: v => v.toFixed(1) + ' t/h' },
               { k: 'stUse', name: 'Header demand', short: 'Demand', color: '--pen-duty', fmt: v => v.toFixed(1) + ' t/h' }] },
      { key: 'fuel', title: 'Fuel gas FI-601', unit: 't/h', lo: 0, hi: 3, ticks: [0, 1.5, 3],
        pens: [{ k: 'fuel', name: 'Fuel FI-601', color: '--pen-olefin', fmt: v => v.toFixed(2) + ' t/h' }] },
      { key: 'o2', title: 'Flue gas O2 AI-601', unit: '%', lo: 0, hi: 21, ticks: [0, 1, 3, 10, 21],
        pens: [{ k: 'O2', name: 'O2 AI-601', color: '--pen-temp', fmt: v => v.toFixed(1) + ' %' }], refs: [{ v: 1, label: 'low 1 %' }] },
      { key: 'dl', title: 'Steam drum level LI-601', unit: '%', lo: 0, hi: 100, ticks: [0, 15, 50, 85, 100],
        pens: [{ k: 'Ldr', name: 'LI-601', color: '--pen-demand', fmt: v => v.toFixed(0) + ' %' }],
        refs: [{ v: 15, label: 'LALL trip', strong: true }, { v: 85, label: 'LAHH trip', strong: true }] },
    ],
    6: [
      { key: 'air', title: 'Air receiver PI-701 and instrument air header PI-702', unit: 'barg', lo: 0, hi: 10, ticks: [0, 3.5, 5.5, 7.5, 10],
        pens: [{ k: 'Prec', name: 'Receiver PI-701', short: 'Receiver', color: '--pen-demand', fmt: v => v.toFixed(2) + ' barg' },
               { k: 'Pia', name: 'IA header PI-702', short: 'IA header', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(2) + ' barg' }],
        refs: [{ v: 3.5, label: 'valves fail-safe 3.5', strong: true }, { v: 5.5, label: 'PAL 5.5' }, { v: 9.5, label: 'PSV 9.5' }] },
      { key: 'comp', title: 'Air compressors loaded', unit: '%', lo: 0, hi: 110, ticks: [0, 100],
        pens: [{ k: 'ld701', name: 'K-701 loaded', short: 'K-701', color: '--pen-demand', fmt: v => (v > 50 ? 'LOADED' : 'unloaded/off') },
               { k: 'ld702', name: 'K-702 loaded', short: 'K-702', color: '--pen-duty', fmt: v => (v > 50 ? 'LOADED' : 'unloaded/off') }] },
      { key: 'n2', title: 'Nitrogen header PI-801', unit: 'barg', lo: 0, hi: 12, ticks: [0, 7, 12],
        pens: [{ k: 'Pn2', name: 'N2 PI-801', color: '--pen-olefin', fmt: v => v.toFixed(2) + ' barg' }], refs: [{ v: 10, label: 'PSV 10' }] },
      { key: 'ln2', title: 'Liquid nitrogen TK-801', unit: '%', lo: 0, hi: 100, ticks: [0, 20, 50, 100],
        pens: [{ k: 'Ln2', name: 'LI-801', color: '--pen-temp', fmt: v => v.toFixed(1) + ' %' }], refs: [{ v: 20, label: 'LAL 20' }] },
    ],
    7: [
      { key: 't901', title: 'TK-901 olefin level: LT-901 vs radar LI-901B', unit: '%', lo: 0, hi: 100, ticks: [0, 50, 85, 95, 100],
        pens: [{ k: 'L901', name: 'LT-901', color: '--pen-demand', fmt: v => v.toFixed(1) + ' %' },
               { k: 'L901B', name: 'Radar LI-901B', short: 'Radar', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(1) + ' %' }],
        refs: [{ v: 85, label: 'LAH 85' }, { v: 95, label: 'LAHH trip 95', strong: true }] },
      { key: 'p901', title: 'TK-901 pressure PI-901', unit: 'barg', lo: 0, hi: 12, ticks: [0, 2, 6, 10, 12],
        pens: [{ k: 'P901', name: 'PI-901', color: '--pen-olefin', fmt: v => v.toFixed(2) + ' barg' }], refs: [{ v: 10, label: 'PSV-901 10', strong: true }] },
      { key: 'tlv', title: 'Tank levels', unit: '%', lo: 0, hi: 100, ticks: [0, 50, 100],
        pens: [{ k: 'L902', name: 'TK-902 iC4', short: 'TK-902', color: '--pen-demand', fmt: v => v.toFixed(1) + ' %' },
               { k: 'L903', name: 'TK-903 alkylate', short: 'TK-903', color: '--pen-duty', fmt: v => v.toFixed(1) + ' %' },
               { k: 'L904', name: 'TK-904 fresh acid', short: 'TK-904', color: '--pen-temp', fmt: v => v.toFixed(1) + ' %' }] },
      { key: 'truck', title: 'Truck at bay U-1', unit: 't', lo: 0, hi: 22, ticks: [0, 10, 20],
        pens: [{ k: 'truckAmt', name: 'Truck load', color: '--pen-olefin', fmt: v => v.toFixed(1) + ' t' }] },
    ],
    8: [
      { key: 'ntg', title: 'Turbine speed SI-1001', unit: 'rpm', lo: 0, hi: 3400, ticks: [0, 1000, 1800, 2200, 3000],
        pens: [{ k: 'Ntg', name: 'SI-1001', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(0) + ' rpm' }],
        refs: [{ v: 1800, label: 'critical band' }, { v: 2200, label: '' }, { v: 3300, label: 'trip 3300', strong: true }] },
      { key: 'mw', title: 'Generator output JI-1001 and setpoint', unit: 'MW', lo: 0, hi: 4, ticks: [0, 1, 2, 3, 4],
        pens: [{ k: 'Pe', name: 'JI-1001', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(2) + ' MW' },
               { k: 'PeSP', name: 'Load ramp', short: 'SP', color: '--pen-duty', dash: [4, 4], thin: true, fmt: v => v.toFixed(2) + ' MW' }] },
      { key: 'vac', title: 'Condenser pressure PI-1001', unit: 'bara', lo: 0, hi: 0.5, ticks: [0, 0.1, 0.2, 0.35, 0.5],
        pens: [{ k: 'Pcond', name: 'PI-1001', color: '--pen-temp', ghost: true, fmt: v => v.toFixed(3) + ' bara' }],
        refs: [{ v: 0.2, label: 'PAH 0.20' }, { v: 0.35, label: 'trip 0.35', strong: true }] },
      { key: 'vib', title: 'Vibration VI-1001 and hotwell LI-1001', unit: 'µm / %', lo: 0, hi: 130, ticks: [0, 50, 75, 125],
        pens: [{ k: 'vib', name: 'Vibration', color: '--pen-olefin', fmt: v => v.toFixed(0) + ' µm' }, { k: 'Lhw', name: 'Hotwell', color: '--pen-demand', fmt: v => v.toFixed(0) + ' %' }],
        refs: [{ v: 75, label: 'VAH 75' }, { v: 125, label: 'trip 125', strong: true }] },
    ],
    9: [
      { key: 'fbus', title: 'Bus frequency SI-1101 vs TNB', unit: 'Hz', lo: 47.5, hi: 51, ticks: [47.5, 48.5, 49.5, 50, 50.5, 51],
        pens: [{ k: 'fbus', name: 'Bus SI-1101', short: 'Bus', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(2) + ' Hz' },
               { k: 'fgrid', name: 'TNB grid', short: 'TNB', color: '--pen-duty', dash: [4, 4], thin: true, fmt: v => v.toFixed(2) + ' Hz' }],
        refs: [{ v: 48.5, label: 'UFLS 48.5', strong: true }, { v: 49.5, label: 'FAL 49.5' }] },
      { key: 'pwr', title: 'Power balance: load, generation, TNB import', unit: 'MW', lo: 0, hi: 4, ticks: [0, 1, 2, 3, 3.5],
        pens: [{ k: 'eload', name: 'Plant load', short: 'Load', color: '--pen-temp', fmt: v => v.toFixed(2) + ' MW' },
               { k: 'Pe', name: 'TG-1001', color: '--pen-duty', fmt: v => v.toFixed(2) + ' MW' },
               { k: 'imp', name: 'TNB import', short: 'Import', color: '--pen-demand', ghost: true, fmt: v => v.toFixed(2) + ' MW' }],
        refs: [{ v: 3.5, label: 'max demand 3.5' }] },
      { key: 'brk', title: 'Breakers (1 = closed): CB-1101 TNB, CB-1102 gen, CB-1103 non-essential', unit: '', lo: 0, hi: 1.2, ticks: [0, 1],
        pens: [{ k: 'cb1101', name: 'CB-1101', color: '--pen-demand', fmt: v => (v ? 'closed' : 'open') }, { k: 'cb1102', name: 'CB-1102', color: '--pen-duty', fmt: v => (v ? 'closed' : 'open') },
               { k: 'cb1103', name: 'CB-1103', color: '--pen-temp', fmt: v => (v ? 'closed' : 'open') }] },
      { key: 'vbus', title: 'Bus voltage', unit: 'kV', lo: 0, hi: 12, ticks: [0, 6, 11, 12],
        pens: [{ k: 'Vbus', name: 'Bus kV', color: '--pen-olefin', fmt: v => v.toFixed(2) + ' kV' }] },
    ],
    10: [
      { key: 'dap', title: 'Deaerator pressure PI-1201 and level LI-1201', unit: 'barg / %÷100', lo: 0, hi: 1, ticks: [0, 0.2, 0.35, 0.6, 1],
        pens: [{ k: 'daP', name: 'PI-1201', color: '--pen-temp', fmt: v => v.toFixed(2) + ' barg' }, { k: 'daLf', name: 'LI-1201 (÷100)', short: 'Level', color: '--pen-demand', fmt: (v, r) => r.daL.toFixed(0) + ' %' }],
        refs: [{ v: 0.2, label: 'PAL 0.2' }] },
      { key: 'o2', title: 'Feedwater dissolved O₂ AI-1203', unit: 'ppb', lo: 0, hi: 100, ticks: [0, 20, 50, 100],
        pens: [{ k: 'daO2', name: 'AI-1203', color: '--pen-olefin', fmt: v => v.toFixed(0) + ' ppb' }], refs: [{ v: 20, label: 'AAH 20' }] },
      { key: 'crc', title: 'Condensate AI-1208 and demin AI-1205 conductivity', unit: 'µS/cm', lo: 0, hi: 160, ticks: [0, 20, 80, 160],
        pens: [{ k: 'crCond', name: 'Condensate', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(0) + ' µS/cm' }, { k: 'dmCond10', name: 'Demin ×10', color: '--pen-demand', fmt: (v, r) => r.dmCond.toFixed(2) + ' µS/cm' }],
        refs: [{ v: 20, label: 'AIH-1208 20' }] },
      { key: 'tds', title: 'Boiler water TDS AI-602', unit: 'ppm', lo: 0, hi: 4000, ticks: [0, 1000, 2500, 3500],
        pens: [{ k: 'tds', name: 'AI-602', color: '--pen-temp', ghost: true, fmt: v => v.toFixed(0) + ' ppm' }], refs: [{ v: 2500, label: 'AAH 2500' }, { v: 3500, label: 'carryover 3500', strong: true }] },
    ],
    11: [
      { key: 'ph', title: 'pH: neutralisation pit AIC-1304 and final effluent AI-1305', unit: 'pH', lo: 0, hi: 14, ticks: [2, 5.5, 7.5, 9, 12],
        pens: [{ k: 'ph4', name: 'Pit AIC-1304', short: 'Pit', color: '--pen-demand', fmt: v => v.toFixed(2) }, { k: 'ph5', name: 'Effluent AI-1305', short: 'Effluent', color: '--pen-duty', ghost: true, fmt: v => v.toFixed(2) }],
        refs: [{ v: 5.5, label: 'DOE 5.5', strong: true }, { v: 9, label: 'DOE 9.0', strong: true }] },
      { key: 'dose', title: 'Dosing (+ caustic / − acid)', unit: 'eq·t/h', lo: -2600, hi: 2900, ticks: [-2500, 0, 2800],
        pens: [{ k: 'dose', name: 'Dose', color: '--pen-temp', fmt: v => v.toFixed(0) }] },
      { key: 'eff', title: 'Effluent oil AI-1306 and temperature TI-1305', unit: 'mg/L / °C', lo: 0, hi: 60, ticks: [0, 10, 40, 60],
        pens: [{ k: 'oil5', name: 'Oil', color: '--pen-olefin', fmt: v => v.toFixed(1) + ' mg/L' }, { k: 'T5', name: 'Temperature', short: 'Temp', color: '--pen-demand', fmt: v => v.toFixed(1) + ' °C' }],
        refs: [{ v: 10, label: 'oil 10' }, { v: 40, label: 'temp 40' }] },
      { key: 'leq', title: 'Equalisation LI-1302 and outfall (100 = open)', unit: '%', lo: 0, hi: 110, ticks: [0, 50, 80, 100],
        pens: [{ k: 'Leq', name: 'LI-1302', color: '--pen-demand', fmt: v => v.toFixed(0) + ' %' }, { k: 'outfall100', name: 'XV-1305', color: '--pen-duty', fmt: (v, r) => (r.outfall ? 'OUTFALL' : 'RECYCLE') }] },
    ],
  };

  function draw(canvas, hist, opts) {
    opts = opts || {};
    const strips = opts.strips || SETS[1];
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return null;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const col = { surf: css('--chart-surface'), grid: css('--grid'), axis: css('--axis'), muted: css('--text-muted'),
                  sec: css('--text-secondary'), prim: css('--text-primary'), crit: css('--status-critical'), warn: css('--status-warning') };
    const L = 44, R = 78, T = 6, B = 20, gap = 12;
    const n = strips.length;
    const sh = (H - T - B - gap * (n - 1)) / n;
    const t1 = opts.t1 != null ? opts.t1 : (hist.length ? hist[hist.length - 1].t : 0);
    const t0 = opts.t0 != null ? opts.t0 : t1 - 600;
    const xOf = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R);
    const tOf = x => t0 + (x - L) / (W - L - R) * (t1 - t0);
    const inWin = r => r.t >= t0 - 1 && r.t <= t1 + 1;
    const vis = hist.filter(inWin);
    const ghost = opts.ghost ? opts.ghost.filter(inWin) : null;
    const step = Math.max(1, Math.floor(vis.length / (W - L - R)));

    g.font = '11px system-ui, "Segoe UI", sans-serif';
    g.textBaseline = 'middle';
    const line = (rows, k, yOf) => {
      g.beginPath(); let started = false;
      for (let j = 0; j < rows.length; j += step) {
        const r = rows[j], v = r[k];
        if (v == null || !isFinite(v)) { started = false; continue; }
        const x = xOf(r.t), y = yOf(v);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      const lr = rows[rows.length - 1];
      if (lr && lr[k] != null && isFinite(lr[k]) && started) g.lineTo(xOf(lr.t), yOf(lr[k]));
      g.stroke();
    };
    strips.forEach((s0, i) => {
      let s = s0;
      if (s0.key === 'temp') {
        const mx = vis.concat(ghost || []).reduce((a, r) => Math.max(a, r.Tr || 0), 0);
        if (mx > s0.hi - 1) s = Object.assign({}, s0, { hi: 30, ticks: [0, 4, 8, 11, 15, 20, 25, 30] });
      }
      const y0 = T + i * (sh + gap), y1 = y0 + sh;
      const yOf = v => y1 - (Math.max(s.lo, Math.min(s.hi, v)) - s.lo) / (s.hi - s.lo) * sh;
      g.fillStyle = col.surf; g.fillRect(L, y0, W - L - R, sh);
      g.lineWidth = 1;
      const tickStep = sh < 55 ? 2 : 1;
      s.ticks.forEach((tv, ti) => {
        const y = Math.round(yOf(tv)) + 0.5;
        g.strokeStyle = col.grid; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
        if (ti % tickStep === 0 || ti === s.ticks.length - 1) { g.fillStyle = col.muted; g.textAlign = 'right'; g.fillText(String(tv), L - 6, y); }
      });
      g.save(); g.translate(10, (y0 + y1) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center';
      g.fillStyle = col.muted; g.fillText(s.unit, 0, 0); g.restore();
      (s.refs || []).forEach(rf => {
        const y = Math.round(yOf(rf.v)) + 0.5;
        g.strokeStyle = rf.strong ? col.crit : col.warn; g.globalAlpha = 0.7; g.setLineDash([3, 4]);
        g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        g.fillStyle = col.muted; g.textAlign = 'right'; g.fillText(rf.label, W - R - 4, y - 6);
      });
      g.fillStyle = col.sec; g.textAlign = 'left'; g.fillText(s.title, L + 6, y0 + 9);
      (opts.markers || []).forEach(mk => {
        if (mk.t < t0 || mk.t > t1) return;
        const x = Math.round(xOf(mk.t)) + 0.5;
        g.strokeStyle = mk.color ? css(mk.color) : col.sec; g.setLineDash(mk.dash || [2, 3]);
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
        if (i === 0 && mk.label) { g.fillStyle = col.sec; g.textAlign = 'left'; g.fillText(mk.label, x + 3, y0 + 22 + 12 * (mk.row || 0)); }
      });
      g.save(); g.beginPath(); g.rect(L, y0, W - L - R, sh); g.clip();
      if (ghost) s.pens.filter(p => p.ghost).forEach(p => {
        g.strokeStyle = col.muted; g.lineWidth = 1.5; g.setLineDash([5, 4]); line(ghost, p.k, yOf); g.setLineDash([]);
      });
      s.pens.forEach(p => {
        g.strokeStyle = css(p.color); g.lineWidth = p.thin ? 1 : 2; g.setLineDash(p.dash || []); g.lineJoin = 'round';
        line(vis, p.k, yOf); g.setLineDash([]);
      });
      g.restore();
      const last = vis[vis.length - 1];
      if (last) {
        const placed = [];
        s.pens.filter(p => !p.thin).forEach(p => {
          if (last[p.k] == null || !isFinite(last[p.k])) return;
          let y = yOf(last[p.k]);
          placed.forEach(py => { if (Math.abs(py - y) < 12) y = py + (y >= py ? 12 : -12); });
          placed.push(y);
          g.fillStyle = css(p.color); g.fillRect(W - R + 4, y - 1, 8, 2);
          g.fillStyle = col.prim; g.textAlign = 'left';
          g.fillText(p.short || p.name, W - R + 15, y);
        });
      }
      if (opts.cursor != null && opts.cursor >= t0 && opts.cursor <= t1) {
        const x = Math.round(xOf(opts.cursor)) + 0.5;
        g.strokeStyle = col.prim; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.globalAlpha = 1;
        const r = nearest(hist, opts.cursor);
        if (r) s.pens.filter(p => !p.thin).forEach(p => {
          if (r[p.k] == null || !isFinite(r[p.k])) return;
          g.fillStyle = css(p.color); g.beginPath(); g.arc(x, yOf(r[p.k]), 4, 0, 7); g.fill();
          g.strokeStyle = col.surf; g.lineWidth = 2; g.stroke();
        });
      }
      g.strokeStyle = col.axis; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y1 + 0.5); g.lineTo(W - R, y1 + 0.5); g.stroke();
    });
    const span = t1 - t0;
    const tick = span > 1800 ? 300 : span > 600 ? 120 : span > 240 ? 60 : 30;
    g.fillStyle = col.muted; g.textAlign = 'center';
    for (let tt = Math.ceil(t0 / tick) * tick; tt <= t1; tt += tick) g.fillText(Alky.clock(tt), xOf(tt), H - B / 2);
    return { tOf, xOf, L, R, t0, t1 };
  }

  function nearest(hist, t) {
    if (!hist.length) return null;
    let lo = 0, hi = hist.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hist[mid].t < t) lo = mid; else hi = mid; }
    return Math.abs(hist[lo].t - t) <= Math.abs(hist[hi].t - t) ? hist[lo] : hist[hi];
  }

  function tooltipHTML(r, strips) {
    if (!r) return '';
    let h = `<div class="tt-time">${Alky.clock(r.t)}</div>`;
    (strips || SETS[1]).forEach(s => s.pens.filter(p => !p.thin).forEach(p => {
      if (r[p.k] == null || !isFinite(r[p.k])) return;
      h += `<div class="tt-row"><span class="sw" style="background:var(${p.color})"></span><span>${p.name}</span><b>${p.fmt(r[p.k], r)}</b></div>`;
    }));
    return h;
  }

  function legendHTML(strips, ghost) {
    const seen = new Set(); let h = '';
    strips.forEach(s => s.pens.filter(p => !p.thin).forEach(p => {
      if (seen.has(p.name)) return; seen.add(p.name);
      h += `<span><i style="background:var(${p.color})"></i>${p.short || p.name}</span>`;
    }));
    if (ghost) h += '<span><i class="ghost"></i>No-action run</span>';
    return h;
  }

  global.Trend = { draw, nearest, tooltipHTML, legendHTML, SETS };
})(window);
