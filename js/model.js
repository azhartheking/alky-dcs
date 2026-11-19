/*
 * ALKY-1 DCS Trainer - process model, drills, procedures, alarms, event log and scoring.
 * Simplified dynamic model with FICTIONAL training values. Not for real plant use.
 *
 * Three linked areas share one simulation:
 *   Page 1  reactor section  : R-101, feeds, E-101 pre-cooler, D-102 settler, acid return, TIC-100
 *   Page 2  refrigeration    : D-302 suction drum, K-301 (VFD + PIC-301 capacity control, UIC-301 anti-surge
 *                              recycle FV-302), E-301 condenser (CW pumps P-303A/B), D-301 accumulator, PSV-301
 *   Page 3  flare            : flare header, D-401 knockout drum + P-401, F-401 steam-assisted flare, pilots,
 *                              FIC-402 assist steam from the MP utility steam header
 *
 * No DOM access in this file.
 */
(function (global) {
  'use strict';

  // ---------- constants (fictional training values) ----------
  const P = {
    olefinDesign: 120, ic4Design: 1080, olefinMax: 240, ic4Max: 1800, tempSP: 8,
    C: 45,               // MJ/K   reactor + acid emulsion thermal capacity
    UA: 0.346,           // MW/K   reactor tube bundle at TV-100 100 %
    designDuty: 4.5,     // MW     reference for "% of design" cooling duty
    hRxn: 0.0222,        // MW per kmol/h olefin reacted
    cpHC: 0.13 / 3600,   // MW per (kmol/h * K)
    acidCp: 0.315, acidFlow: 450, feedT: 30, pcEff: 0.55,
    ambientT: 25, ambientUA: 0.003,
  };
  const R = {
    Qdes: 4.3,       // MW   evaporator duty K-301 can remove at 100 % speed, normal suction/discharge
    Cs: 60,          // MJ/bar suction-side capacitance (bundle + D-302 + suction line)
    Cd: 40,          // MJ/bar discharge-side capacitance (E-301 + D-301)
    UAc: 0.42,       // MW/K E-301 with full cooling water
    Tcw: 26,         // degC CW supply
    psSP: 3.1,       // barg PIC-301 normal setpoint (≈ −5 degC evaporating)
    nMin: 40,        // %    minimum governor speed
    recMax: 5.0,     // MW-equivalent vapour through FV-302 fully open
    pah301: 3.6, pah303: 14.5, pshh: 16.8, psvSet: 17.5, psvReseat: 16.3,
    hvap: 0.35,      // MJ/kg refrigerant latent heat
    inv: 40,         // t    refrigerant inventory (D-301 0-100 %)
    koCap: 3,        // t    liquid that fills D-401 0-100 %
    koPump: 6,       // t/h  P-401 pump-out
    purge: 0.3,      // t/h  continuous header purge gas
    carry: 0.25,     // fraction of PSV-301 relief that arrives as liquid at D-401
    steamMin: 0.5,   // t/h  minimum (tip cooling) assist steam
  };
  // T-501 deisobutanizer (fictional)
  const C5 = {
    lam: 18,         // MJ/kmol latent heat, isobutane-rich vapour
    refMax: 2600, dMax: 2000, bMax: 600,   // kmol/h at 100 % valve
    Md: 150, Mb: 300,                      // kmol liquid that fills D-502 / column sump + trays 0-100 %
    Ccol: 10,        // kmol/bar overhead vapour capacitance
    UAc: 0.55, Tcw: 26,                    // E-502 condenser (plant cooling water)
    pSP: 6.5, pah: 8.0, trSP: 140,
    steamMax: 35,    // t/h through FV-501 fully open at 10.5 barg header
    hs: 2.0,         // MJ/kg MP steam latent heat in E-501
  };
  // Utilities (fictional)
  const U = {
    hdrSP: 10.5, Ch: 600,          // MP steam header: t/h·s per bar
    other: 8,                      // t/h other plant steam users
    fuelLHV: 50, eff: 0.88, hgen: 2.33, stoich: 17, fuelMax: 3, airMax: 60,
    pshh: 12.5, purgeT: 60,
    air: { load: 7.0, unload: 7.8, cap: 6, iaUse: 3.3, paUse: 1.5, Crec: 180, stbyStart: 6.5, paShut: 6.0, iaLow: 5.5, failsafe: 3.5 },
    n2: { sp: 7.0, tank: 30 },
  };
  // isobutane saturation (fictional fit) barg <-> degC
  const psatI = T => Math.exp(9.75 - 2520 / (T + 273.15)) - 1.013;
  const tsatI = p => 2520 / (9.75 - Math.log(Math.max(0.05, p + 1.013))) - 273.15;
  // water / steam saturation (Antoine), bara <-> degC
  const psatW = T => Math.pow(10, 8.07131 - 1730.63 / (233.426 + T)) * 0.0013332;
  const tsatW = p => 1730.63 / (8.07131 - Math.log10(Math.max(0.005, p) / 0.0013332)) - 233.426;
  // Power (pages 8-9): TG-1001 condensing steam turbine generator on the MP header, 11 kV plant bus, TNB grid incomer
  const E = {
    nNom: 3000, fNom: 50, S: 3.5, H: 5,          // rpm, Hz, MVA rating, inertia constant s
    stMax: 25, dh: 0.1667,                        // t/h steam at 100 % governor valve; MW per t/h at design vacuum
    droop: 0.04, chest: 0.4, loadRate: 0.5 / 60,  // speed droop, steam chest lag s, MW/s load ramp
    rampN: 10, rampCrit: 40, crit: [1800, 2200], sah: 3200, trip: 3300,
    ufls: 48.5, uf81: 47.5, of81: 52, maxDemand: 3.5, vNom: 11.0, tgDesign: 2.2,
  };
  // Water (pages 5, 10, 11): demin, condensate, deaerator, boiler water chemistry, blowdown, wastewater treatment
  const WT = {
    daCap: 30, daSP: 0.35, pegMax: 6, mkMax: 40, dmTrain: 12, dmTank: 150, recCap: 10, hwCap: 8,
    cbdMax: 2, cbdSP: 0.5, tdsTau: 600, ibdFlow: 25, regenT: 600,
    eqCap: 200, pitV: 8, gbTau: 120, dosCaustic: 2800, dosAcid: 2500,   // pit and guard basin mixing accelerated for training
    lim: { phLo: 5.5, phHi: 9.0, oil: 10, temp: 40 },   // DOE Standard B effluent limits (training values)
  };
  // pH from excess base B (meq/L): steep around neutral, buffered at the ends
  const MOTOR_MW = { P101: 0.05, P102: 0.22, P201: 0.18, P303A: 0.12, P303B: 0.12, P401: 0.03, P502: 0.10, P601A: 0.15, P601B: 0.15, K601: 0.18,
    P901: 0.04, P902: 0.04, P903: 0.04, P904: 0.03, P905: 0.03, P1001A: 0.04, P1001B: 0.04, P1206A: 0.03, P1206B: 0.03, P1207: 0.03, P1210: 0.005,
    P1302A: 0.03, P1302B: 0.03, P1303: 0.01, P1304A: 0.005, P1304B: 0.005, P1306: 0.005 };
  const phOf = B => clamp(7 + 3.2 * Math.tanh(B / 3) + 1.3 * Math.tanh(B), 0.5, 13.5);
  // Pressure safety valves on every pressure system
  const PSVS = [
    { tag: 'PSV-101', page: 1, desc: 'R-101 / D-102 reactor system', p: s => s.x.Pr, set: 10.0, reseat: 9.3, k: 13, dest: 'flare', liq: 0.3 },
    { tag: 'PSV-301', page: 2, desc: 'D-301 refrigerant accumulator', p: s => s.x.Pd, set: 17.5, reseat: 16.3, k: 6, dest: 'flare', liq: 0.25 },
    { tag: 'PSV-302', page: 2, desc: 'D-302 compressor suction drum', p: s => s.x.Ps, set: 12.0, reseat: 11.2, k: 6, dest: 'flare', liq: 0.05 },
    { tag: 'PSV-501', page: 4, desc: 'T-501 column / E-502 / D-502', p: s => s.x.Pc, set: 9.0, reseat: 8.4, k: 12, dest: 'flare', liq: 0.1 },
    { tag: 'PSV-601', page: 5, desc: 'B-601 boiler steam drum', p: s => s.x.Pdrum, set: 13.0, reseat: 12.2, k: 12, dest: 'atm', liq: 0 },
    { tag: 'PSV-701', page: 6, desc: 'D-701 plant air receiver', p: s => s.x.Prec, set: 9.5, reseat: 8.8, k: 4, dest: 'atm', liq: 0 },
    { tag: 'PSV-801', page: 6, desc: 'Nitrogen header', p: s => s.x.Pn2, set: 10.0, reseat: 9.3, k: 2, dest: 'atm', liq: 0 },
    { tag: 'PSV-901', page: 7, desc: 'TK-901 olefin bullet', p: s => s.x.tk['TK-901'].P, set: 10.0, reseat: 9.3, k: 14, dest: 'flare', liq: 0.5 },
    { tag: 'PSV-902', page: 7, desc: 'TK-902 isobutane bullet', p: s => s.x.tk['TK-902'].P, set: 10.0, reseat: 9.3, k: 14, dest: 'flare', liq: 0.5 },
    { tag: 'PSV-1001', page: 8, desc: 'TG-1001 exhaust / E-1001 condenser relief diaphragm', p: s => s.x.tg.Pcond - 1.013, set: 0.3, reseat: 0.1, k: 20, dest: 'atm', liq: 0 },
    { tag: 'PSV-1201', page: 10, desc: 'D-1201 deaerator', p: s => s.x.da.P, set: 2.0, reseat: 1.7, k: 6, dest: 'atm', liq: 0 },
  ];
  // Tank farm (page 7). Masses in t, flows in t/h. Pressurised bullets have PSVs to flare;
  // atmospheric tanks have a pressure/vacuum vent (PVRV) and an N2 blanket (PCV-90x).
  const TF = {
    tanks: {
      'TK-901': { name: 'Olefin feed (x1)', cap: 20, kind: 'press', psat: 1.9, pump: 'P-901', dir: 'in', rate: 60, truck: 'Olefin delivery' },
      'TK-902': { name: 'Isobutane (x2 recycle + x5 make-up)', cap: 40, kind: 'press', psat: 2.5, pump: 'P-902', dir: 'in', rate: 60, truck: 'Isobutane delivery' },
      'TK-903': { name: 'Alkylate product (x4)', cap: 40, kind: 'atm', pump: 'P-903', dir: 'out', rate: 80, truck: 'Alkylate collection' },
      'TK-904': { name: 'Fresh acid (x3)', cap: 30, kind: 'atm', pump: 'P-904', dir: 'in', rate: 30, truck: 'Fresh acid delivery' },
      'TK-905': { name: 'Spent acid', cap: 30, kind: 'atm', pump: 'P-905', dir: 'out', rate: 30, truck: 'Spent acid collection' },
    },
    truckCap: 20, arrive: 30, mw: { ole: 0.056, ic4: 0.058, alky: 0.114 },
  };
  const TANK_OF_PUMP = {};
  Object.keys(TF.tanks).forEach(k => { TANK_OF_PUMP[TF.tanks[k].pump] = k; });
  const LIMITS = { tLo: 4, tHi: 11, ioLo: 7 };
  const TRIP_T = 15;
  const SHIFT_START = 6 * 3600;
  const DT = 0.1;
  const PRE_HISTORY = 300;

  // refrigerant saturation curve (propane-like, fictional fit). barg <-> degC
  const psat = T => Math.exp(10 - 2300 / (T + 273.15)) - 1.013;
  const tsat = p => 2300 / (10 - Math.log(Math.max(0.05, p + 1.013))) - 273.15;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function clock(t) {
    let s = Math.round(SHIFT_START + t);
    s = ((s % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return [h, m, ss].map(n => String(n).padStart(2, '0')).join(':');
  }
  function mmss(t) {
    const s = Math.max(0, Math.round(t));
    return `${Math.floor(s / 60)} min ${s % 60} s`;
  }

  function makeCtrl(o) { return Object.assign({ mode: 'AUTO', lastE: 0, pvf: o.sp }, o); }

  // PI controller, velocity form (bumpless in both directions).
  function piStep(c, pv, dt) {
    c.pvf += (pv - c.pvf) * dt / (c.filt || 1.0);
    const e = c.action * (c.pvf - c.sp);
    if (c.mode === 'AUTO') c.op = clamp(c.op + c.kc * ((e - c.lastE) + dt / c.ti * e), 0, 100);
    c.lastE = e;
  }

  // ---------- alarm definitions ----------
  const ALARMS = [
    { tag: 'TAHH-100', pri: 'URGENT', desc: 'Reactor temperature high-high', on: s => s.m.Tr > 13.5, off: s => s.m.Tr < 13.2, val: s => s.m.Tr.toFixed(1) + ' °C' },
    { tag: 'TAH-100', pri: 'HIGH', desc: 'Reactor temperature high', on: s => s.m.Tr > 11, off: s => s.m.Tr < 10.7, val: s => s.m.Tr.toFixed(1) + ' °C' },
    { tag: 'TAL-100', pri: 'HIGH', desc: 'Reactor temperature low', on: s => s.m.Tr < 4, off: s => s.m.Tr > 4.3, val: s => s.m.Tr.toFixed(1) + ' °C' },
    { tag: 'XA-101', pri: 'URGENT', desc: 'Olefin feed isolated by TZHH-100 trip', on: s => s.eq.tripped, off: s => !s.eq.tripped, val: () => 'TRIP' },
    { tag: 'AIL-100', pri: 'HIGH', desc: 'Isobutane/olefin ratio low', on: s => s.m.Fo > 5 && s.m.io < LIMITS.ioLo, off: s => s.m.Fo <= 5 || s.m.io > LIMITS.ioLo + 0.3, val: s => s.m.io.toFixed(1), delay: 3 },
    { tag: 'TIC-100.OPH', pri: 'LOW', desc: 'TIC-100 output high (cooling demand at max)', on: s => s.tic100.op > 95, off: s => s.tic100.op < 93, val: s => s.tic100.op.toFixed(0) + ' %', delay: 5 },
    { tag: 'TAH-102', pri: 'LOW', desc: 'E-101 pre-cooler outlet temperature high', on: s => s.m.Tpc > 14, off: s => s.m.Tpc < 13.7, val: s => s.m.Tpc.toFixed(1) + ' °C' },
    { tag: 'FDA-101', pri: 'LOW', desc: 'FIC-101 olefin flow deviation', on: s => s.fic101.mode === 'AUTO' && Math.abs(s.m.Fo - s.fic101.sp) > 15, off: s => s.fic101.mode !== 'AUTO' || Math.abs(s.m.Fo - s.fic101.sp) < 10, val: s => s.m.Fo.toFixed(0) + ' kmol/h', delay: 8 },
    { tag: 'FDA-102', pri: 'LOW', desc: 'FIC-102 isobutane flow deviation', on: s => s.fic102.mode === 'AUTO' && Math.abs(s.m.Fi - s.fic102.sp) > 100, off: s => s.fic102.mode !== 'AUTO' || Math.abs(s.m.Fi - s.fic102.sp) < 70, val: s => s.m.Fi.toFixed(0) + ' kmol/h', delay: 8 },
    { tag: 'FAL-201', pri: 'HIGH', desc: 'Acid circulation flow low', on: s => s.m.Facid < 300, off: s => s.m.Facid > 320, val: s => s.m.Facid.toFixed(0) + ' m3/h' },
    // page 2 - refrigeration
    { tag: 'PAH-301', pri: 'HIGH', desc: 'K-301 suction pressure high', on: s => s.m.Ps > R.pah301, off: s => s.m.Ps < R.pah301 - 0.1, val: s => s.m.Ps.toFixed(2) + ' barg' },
    { tag: 'IAL-301', pri: 'LOW', desc: 'K-301 motor current low', on: s => s.m.amps < 100, off: s => s.m.amps > 105, val: s => s.m.amps.toFixed(0) + ' A' },
    { tag: 'SDA-301', pri: 'LOW', desc: 'K-301 speed below PIC-301 demand', on: s => s.x.Ndem - s.x.N > 10, off: s => s.x.Ndem - s.x.N < 6, val: s => s.x.N.toFixed(0) + ' %', delay: 8 },
    { tag: 'UA-301', pri: 'HIGH', desc: 'K-301 surge margin low (UIC-301)', on: s => s.m.SMmeas < 8, off: s => s.m.SMmeas > 12, val: s => s.m.SMmeas.toFixed(0) + ' %', delay: 2 },
    { tag: 'XA-302', pri: 'URGENT', desc: 'K-301 SURGE detected', on: s => s.x.SM < 0, off: s => s.x.SM > 3, val: s => s.x.SM.toFixed(0) + ' %' },
    { tag: 'TAH-302', pri: 'LOW', desc: 'K-301 suction temperature high', on: s => s.m.Ts > 20, off: s => s.m.Ts < 18, val: s => s.m.Ts.toFixed(1) + ' °C' },
    { tag: 'TAH-304', pri: 'LOW', desc: 'K-301 discharge temperature high', on: s => s.m.Td > 95, off: s => s.m.Td < 93, val: s => s.m.Td.toFixed(0) + ' °C' },
    { tag: 'PAH-303', pri: 'HIGH', desc: 'K-301 discharge pressure high', on: s => s.m.Pd > R.pah303, off: s => s.m.Pd < R.pah303 - 0.2, val: s => s.m.Pd.toFixed(1) + ' barg' },
    { tag: 'FAL-303', pri: 'HIGH', desc: 'E-301 condenser cooling water flow low', on: s => s.m.cw < 60, off: s => s.m.cw > 65, val: s => s.m.cw.toFixed(0) + ' %', delay: 2 },
    { tag: 'LAH-302', pri: 'HIGH', desc: 'D-302 suction drum level high', on: s => s.m.Ldrum > 50, off: s => s.m.Ldrum < 47, val: s => s.m.Ldrum.toFixed(0) + ' %' },
    { tag: 'LAL-301', pri: 'LOW', desc: 'D-301 refrigerant accumulator level low', on: s => s.m.Lacc < 30, off: s => s.m.Lacc > 32, val: s => s.m.Lacc.toFixed(0) + ' %' },
    { tag: 'XA-301', pri: 'HIGH', desc: 'K-301 refrigeration compressor stopped with unit in service', on: s => !s.eq.K301, off: s => s.eq.K301, val: () => 'STOPPED', delay: 2 },
    { tag: 'ZA-301', pri: 'HIGH', desc: 'PSV-301 open - relieving to flare', on: s => s.x.psvOpen, off: s => !s.x.psvOpen, val: s => s.x.Wpsv.toFixed(1) + ' t/h' },
    // page 3 - flare
    { tag: 'PAH-401', pri: 'HIGH', desc: 'Flare header pressure high', on: s => s.m.Ph > 0.5, off: s => s.m.Ph < 0.45, val: s => s.m.Ph.toFixed(2) + ' barg' },
    { tag: 'LAH-401', pri: 'HIGH', desc: 'D-401 flare knockout drum level high', on: s => s.m.Lko > 50, off: s => s.m.Lko < 47, val: s => s.m.Lko.toFixed(0) + ' %' },
    { tag: 'LAHH-401', pri: 'URGENT', desc: 'D-401 KO drum level high-high (liquid carryover to flare)', on: s => s.m.Lko > 75, off: s => s.m.Lko < 72, val: s => s.m.Lko.toFixed(0) + ' %' },
    { tag: 'AA-401', pri: 'HIGH', desc: 'Flare smoking (smoke detector / camera)', on: s => s.x.flame === 'smoky', off: s => s.x.flame !== 'smoky', val: s => 'ratio ' + s.x.ratio.toFixed(2), delay: 8 },
    { tag: 'BAL-402', pri: 'HIGH', desc: 'Flare pilot B flame failure', on: s => !s.eq.pilots[1], off: s => s.eq.pilots[1], val: () => 'OUT' },
    { tag: 'FAL-801', pri: 'HIGH', desc: 'Flare header N2 purge lost (air ingress risk)', on: s => s.x.purge < 0.1 && s.x.Wflare < 0.5, off: s => s.x.purge >= 0.1 || s.x.Wflare >= 0.5, val: s => s.x.purge.toFixed(2) + ' t/h', delay: 30 },
    // page 1 - reactor pressure
    { tag: 'PAH-103', pri: 'HIGH', desc: 'R-101 / D-102 pressure high', on: s => s.m.Pr > 8.5, off: s => s.m.Pr < 8.3, val: s => s.m.Pr.toFixed(1) + ' barg' },
    // page 4 - fractionator
    { tag: 'PAH-502', pri: 'HIGH', desc: 'T-501 column pressure high', on: s => s.m.Pc > C5.pah, off: s => s.m.Pc < C5.pah - 0.2, val: s => s.m.Pc.toFixed(2) + ' barg' },
    { tag: 'TAL-501', pri: 'LOW', desc: 'T-501 control tray temperature low', on: s => s.m.Ttray < 128, off: s => s.m.Ttray > 130, val: s => s.m.Ttray.toFixed(0) + ' °C', delay: 5 },
    { tag: 'TAH-501', pri: 'LOW', desc: 'T-501 control tray temperature high', on: s => s.m.Ttray > 152, off: s => s.m.Ttray < 150, val: s => s.m.Ttray.toFixed(0) + ' °C', delay: 5 },
    { tag: 'LAL-502', pri: 'LOW', desc: 'D-502 reflux drum level low', on: s => s.m.Ld < 15, off: s => s.m.Ld > 18, val: s => s.m.Ld.toFixed(0) + ' %' },
    { tag: 'LAH-502', pri: 'LOW', desc: 'D-502 reflux drum level high', on: s => s.m.Ld > 85, off: s => s.m.Ld < 82, val: s => s.m.Ld.toFixed(0) + ' %' },
    { tag: 'LAL-501', pri: 'LOW', desc: 'T-501 bottoms level low', on: s => s.m.Lb < 15, off: s => s.m.Lb > 18, val: s => s.m.Lb.toFixed(0) + ' %' },
    { tag: 'LAH-501', pri: 'LOW', desc: 'T-501 bottoms level high', on: s => s.m.Lb > 85, off: s => s.m.Lb < 82, val: s => s.m.Lb.toFixed(0) + ' %' },
    { tag: 'AIH-503', pri: 'HIGH', desc: 'Alkylate off-spec (isobutane in product high)', on: s => s.m.ic4b > 5, off: s => s.m.ic4b < 4.5, val: s => s.m.ic4b.toFixed(1) + ' %', delay: 10 },
    { tag: 'AIL-502', pri: 'LOW', desc: 'Isobutane recycle purity low', on: s => s.m.pur5 < 92, off: s => s.m.pur5 > 93, val: s => s.m.pur5.toFixed(1) + ' %', delay: 10 },
    // page 5 - steam / boiler
    { tag: 'PAL-605', pri: 'HIGH', desc: 'MP steam header pressure low', on: s => s.m.Psh < 9.3, off: s => s.m.Psh > 9.5, val: s => s.m.Psh.toFixed(2) + ' barg' },
    { tag: 'PAH-605', pri: 'LOW', desc: 'MP steam header pressure high', on: s => s.m.Psh > 11.8, off: s => s.m.Psh < 11.6, val: s => s.m.Psh.toFixed(2) + ' barg' },
    { tag: 'LAL-601', pri: 'HIGH', desc: 'B-601 steam drum level low', on: s => s.m.Ldr < 30, off: s => s.m.Ldr > 33, val: s => s.m.Ldr.toFixed(0) + ' %' },
    { tag: 'LAH-601', pri: 'HIGH', desc: 'B-601 steam drum level high', on: s => s.m.Ldr > 75, off: s => s.m.Ldr < 72, val: s => s.m.Ldr.toFixed(0) + ' %' },
    { tag: 'AIL-601', pri: 'HIGH', desc: 'B-601 flue gas O2 low (incomplete combustion risk)', on: s => s.m.O2 < 1.0, off: s => s.m.O2 > 1.3, val: s => s.m.O2.toFixed(1) + ' %', delay: 3 },
    { tag: 'XA-601', pri: 'URGENT', desc: 'B-601 boiler not firing (burner management)', on: s => s.x.bms !== 'FIRING', off: s => s.x.bms === 'FIRING', val: s => s.x.bms },
    // page 6 - air and nitrogen
    { tag: 'PAL-701', pri: 'LOW', desc: 'D-701 air receiver pressure low', on: s => s.m.Prec < 6.3, off: s => s.m.Prec > 6.6, val: s => s.m.Prec.toFixed(2) + ' barg' },
    { tag: 'PAL-702', pri: 'HIGH', desc: 'Instrument air header pressure low', on: s => s.m.Pia < U.air.iaLow, off: s => s.m.Pia > U.air.iaLow + 0.3, val: s => s.m.Pia.toFixed(2) + ' barg' },
    { tag: 'PALL-702', pri: 'URGENT', desc: 'INSTRUMENT AIR FAILURE - control valves going to fail position', on: s => s.m.Pia < 4.0, off: s => s.m.Pia > 4.5, val: s => s.m.Pia.toFixed(2) + ' barg' },
    { tag: 'XA-701', pri: 'HIGH', desc: 'No air compressor running (K-701 / K-702)', on: s => !s.eq.K701 && !s.eq.K702, off: s => s.eq.K701 || s.eq.K702, val: () => 'STOPPED', delay: 2 },
    { tag: 'LAL-801', pri: 'LOW', desc: 'TK-801 liquid nitrogen level low', on: s => s.m.Ln2 < 20, off: s => s.m.Ln2 > 22, val: s => s.m.Ln2.toFixed(0) + ' %' },
    // flare pilots / header
    { tag: 'BAL-401', pri: 'HIGH', desc: 'Flare pilot A flame failure', on: s => !s.eq.pilots[0], off: s => s.eq.pilots[0], val: () => 'OUT' },
    { tag: 'BAL-403', pri: 'HIGH', desc: 'Flare pilot C flame failure', on: s => !s.eq.pilots[2], off: s => s.eq.pilots[2], val: () => 'OUT' },
    { tag: 'XA-402', pri: 'URGENT', desc: 'FLARE FLAME OUT - unburned hydrocarbon release', on: s => s.x.flame === 'unlit', off: s => s.x.flame !== 'unlit', val: s => s.x.hc.toFixed(1) + ' t/h' },
    { tag: 'AAH-402', pri: 'HIGH', desc: 'Flare header oxygen high (air ingress / flashback risk)', on: s => s.x.hO2 > 4, off: s => s.x.hO2 < 3.5, val: s => s.x.hO2.toFixed(1) + ' %' },
    { tag: 'PAL-403', pri: 'HIGH', desc: 'Flare pilot gas pressure low', on: s => !s.x.gasOK, off: s => s.x.gasOK, val: () => 'LOW', delay: 2 },
    // reactor acid make-up / spent acid
    { tag: 'LAL-103', pri: 'LOW', desc: 'D-102 acid level low', on: s => s.m.Lset < 30, off: s => s.m.Lset > 33, val: s => s.m.Lset.toFixed(0) + ' %' },
    { tag: 'LAH-103', pri: 'LOW', desc: 'D-102 acid level high', on: s => s.m.Lset > 90, off: s => s.m.Lset < 87, val: s => s.m.Lset.toFixed(0) + ' %' },
    { tag: 'AIL-201', pri: 'LOW', desc: 'Acid strength low', on: s => s.x.acidStr < 88.5, off: s => s.x.acidStr > 89, val: s => s.x.acidStr.toFixed(1) + ' wt%' },
    // tank farm
    { tag: 'LAH-901', pri: 'HIGH', desc: 'TK-901 olefin level high (LT-901)', on: s => s.m.L901 > 85, off: s => s.m.L901 < 83, val: s => s.m.L901.toFixed(0) + ' %' },
    { tag: 'LAHH-901', pri: 'URGENT', desc: 'TK-901 level high-high (radar LI-901B) - unloading tripped', on: s => s.x.tk['TK-901'].L > 95, off: s => s.x.tk['TK-901'].L < 93, val: s => s.x.tk['TK-901'].L.toFixed(0) + ' %' },
    { tag: 'LAL-901', pri: 'HIGH', desc: 'TK-901 olefin level low', on: s => s.m.L901 < 15, off: s => s.m.L901 > 17, val: s => s.m.L901.toFixed(0) + ' %' },
    { tag: 'LAH-902', pri: 'HIGH', desc: 'TK-902 isobutane level high', on: s => s.x.tk['TK-902'].L > 85, off: s => s.x.tk['TK-902'].L < 83, val: s => s.x.tk['TK-902'].L.toFixed(0) + ' %' },
    { tag: 'LAL-902', pri: 'HIGH', desc: 'TK-902 isobutane level low', on: s => s.x.tk['TK-902'].L < 15, off: s => s.x.tk['TK-902'].L > 17, val: s => s.x.tk['TK-902'].L.toFixed(0) + ' %' },
    { tag: 'LAH-903', pri: 'HIGH', desc: 'TK-903 alkylate level high', on: s => s.x.tk['TK-903'].L > 85, off: s => s.x.tk['TK-903'].L < 83, val: s => s.x.tk['TK-903'].L.toFixed(0) + ' %' },
    { tag: 'LAL-904', pri: 'LOW', desc: 'TK-904 fresh acid level low', on: s => s.x.tk['TK-904'].L < 15, off: s => s.x.tk['TK-904'].L > 17, val: s => s.x.tk['TK-904'].L.toFixed(0) + ' %' },
    { tag: 'LAH-905', pri: 'LOW', desc: 'TK-905 spent acid level high', on: s => s.x.tk['TK-905'].L > 85, off: s => s.x.tk['TK-905'].L < 83, val: s => s.x.tk['TK-905'].L.toFixed(0) + ' %' },
    ...['TK-903', 'TK-904', 'TK-905'].map(k => ({ tag: 'AAH-' + k.slice(3), pri: 'HIGH', desc: `${k} vapour space oxygen high (N₂ blanket lost / air drawn in)`,
      on: s => s.x.tk[k].O2 > 8, off: s => s.x.tk[k].O2 < 7, val: s => s.x.tk[k].O2.toFixed(1) + ' %' })),
    // page 5 - boiler water chemistry and blowdown
    { tag: 'AAH-602', pri: 'HIGH', desc: 'B-601 boiler water TDS high - increase CBD', on: s => s.x.bw.tds > 2500, off: s => s.x.bw.tds < 2350, val: s => s.x.bw.tds.toFixed(0) + ' ppm', delay: 5 },
    { tag: 'AAHH-602', pri: 'URGENT', desc: 'B-601 boiler water TDS high-high - foaming / carryover to steam', on: s => s.x.bw.tds > 3500, off: s => s.x.bw.tds < 3300, val: s => s.x.bw.tds.toFixed(0) + ' ppm' },
    { tag: 'AAH-603', pri: 'LOW', desc: 'B-601 mud drum sludge high - intermittent blowdown (IBD) due', on: s => s.x.bw.sludge > 80, off: s => s.x.bw.sludge < 60, val: s => s.x.bw.sludge.toFixed(0) + ' %' },
    { tag: 'FAL-606', pri: 'LOW', desc: 'B-601 continuous blowdown (CBD) flow low', on: s => s.x.bw.cbd < 0.15, off: s => s.x.bw.cbd > 0.25, val: s => s.x.bw.cbd.toFixed(2) + ' t/h', delay: 20 },
    // page 8 - steam turbine generator
    { tag: 'XA-1001', pri: 'HIGH', desc: 'TG-1001 steam turbine TRIPPED', on: s => s.x.tg.tripped, off: s => !s.x.tg.tripped, val: () => 'TRIP' },
    { tag: 'SAH-1001', pri: 'HIGH', desc: 'TG-1001 speed high (overspeed trip 3300 rpm)', on: s => s.x.tg.N > E.sah, off: s => s.x.tg.N < E.sah - 30, val: s => s.x.tg.N.toFixed(0) + ' rpm' },
    { tag: 'VAH-1001', pri: 'HIGH', desc: 'TG-1001 shaft vibration high (trip 125 µm)', on: s => s.x.tg.vib > 75, off: s => s.x.tg.vib < 65, val: s => s.x.tg.vib.toFixed(0) + ' µm' },
    { tag: 'PAH-1001', pri: 'HIGH', desc: 'E-1001 condenser pressure high - vacuum falling (trip 0.35 bara)', on: s => s.x.tg.Pcond > 0.2, off: s => s.x.tg.Pcond < 0.18, val: s => s.x.tg.Pcond.toFixed(3) + ' bara', delay: 3 },
    { tag: 'LAH-1001', pri: 'LOW', desc: 'E-1001 hotwell level high', on: s => s.x.tg.Lhw > 75, off: s => s.x.tg.Lhw < 72, val: s => s.x.tg.Lhw.toFixed(0) + ' %' },
    { tag: 'LAL-1001', pri: 'LOW', desc: 'E-1001 hotwell level low (condensate pump NPSH)', on: s => s.x.tg.Lhw < 20, off: s => s.x.tg.Lhw > 23, val: s => s.x.tg.Lhw.toFixed(0) + ' %' },
    { tag: 'PAL-1002', pri: 'HIGH', desc: 'TG-1001 inlet steam pressure low - load runback', on: s => s.x.tg.runback, off: s => !s.x.tg.runback, val: s => s.x.Psh.toFixed(2) + ' barg' },
    // page 9 - electrical / TNB grid
    { tag: 'XA-1104', pri: 'URGENT', desc: 'TNB 33 kV grid supply LOST', on: s => !s.x.el.gridOK, off: s => s.x.el.gridOK, val: () => 'NO GRID' },
    { tag: 'XA-1101', pri: 'HIGH', desc: 'TNB incomer CB-1101 open - plant islanded or isolated from grid', on: s => !s.eq.CB1101, off: s => s.eq.CB1101, val: () => 'OPEN' },
    { tag: 'XA-1102', pri: 'HIGH', desc: 'Generator breaker CB-1102 tripped by protection', on: s => s.x.tg.cbTrip, off: s => !s.x.tg.cbTrip, val: () => 'TRIP' },
    { tag: 'FAL-1101', pri: 'HIGH', desc: '11 kV bus frequency low', on: s => s.x.el.f > 1 && s.x.el.f < 49.5, off: s => s.x.el.f < 1 || s.x.el.f > 49.7, val: s => s.x.el.f.toFixed(2) + ' Hz', delay: 1 },
    { tag: 'FAH-1101', pri: 'HIGH', desc: '11 kV bus frequency high', on: s => s.x.el.f > 50.5, off: s => s.x.el.f < 50.3, val: s => s.x.el.f.toFixed(2) + ' Hz', delay: 1 },
    { tag: 'XA-1103', pri: 'LOW', desc: 'Non-essential feeder CB-1103 open (load shed)', on: s => !s.eq.CB1103, off: s => s.eq.CB1103, val: () => 'OPEN' },
    { tag: 'XA-1100', pri: 'URGENT', desc: 'PLANT BLACKOUT - 11 kV bus dead, all motors stopped', on: s => s.x.el.Vbus < 1, off: s => s.x.el.Vbus > 5, val: () => '0 kV' },
    { tag: 'JAH-1101', pri: 'LOW', desc: 'TNB import above contract maximum demand (3.5 MW)', on: s => s.x.el.imp > E.maxDemand, off: s => s.x.el.imp < E.maxDemand - 0.2, val: s => s.x.el.imp.toFixed(2) + ' MW', delay: 15 },
    // page 10 - deaerator, demin, condensate
    { tag: 'LAL-1201', pri: 'HIGH', desc: 'D-1201 deaerator level low (BFW pump suction)', on: s => s.x.da.L < 30, off: s => s.x.da.L > 33, val: s => s.x.da.L.toFixed(0) + ' %' },
    { tag: 'LAH-1201', pri: 'LOW', desc: 'D-1201 deaerator level high', on: s => s.x.da.L > 85, off: s => s.x.da.L < 82, val: s => s.x.da.L.toFixed(0) + ' %' },
    { tag: 'PAL-1201', pri: 'LOW', desc: 'D-1201 deaerator pressure low (poor O₂ stripping)', on: s => s.x.da.P < 0.2, off: s => s.x.da.P > 0.25, val: s => s.x.da.P.toFixed(2) + ' barg', delay: 10 },
    { tag: 'AAH-1203', pri: 'HIGH', desc: 'Boiler feedwater dissolved O₂ high (corrosion)', on: s => s.x.da.O2 > 20, off: s => s.x.da.O2 < 15, val: s => s.x.da.O2.toFixed(0) + ' ppb', delay: 10 },
    { tag: 'AIH-1205', pri: 'HIGH', desc: 'Demin water conductivity high - train exhausted (breakthrough)', on: s => s.x.dm.cond > 1, off: s => s.x.dm.cond < 0.8, val: s => s.x.dm.cond.toFixed(2) + ' µS/cm', delay: 5 },
    { tag: 'LAL-1204', pri: 'HIGH', desc: 'TK-1204 demin water tank level low', on: s => s.x.dm.L < 25, off: s => s.x.dm.L > 28, val: s => s.x.dm.L.toFixed(0) + ' %' },
    { tag: 'AIH-1208', pri: 'HIGH', desc: 'Returned condensate conductivity high (contamination)', on: s => s.x.cr.cond > 20, off: s => s.x.cr.cond < 15, val: s => s.x.cr.cond.toFixed(0) + ' µS/cm', delay: 3 },
    { tag: 'AAH-1209', pri: 'HIGH', desc: 'Oil / hydrocarbon detected in returned condensate', on: s => s.x.cr.oil > 5, off: s => s.x.cr.oil < 3, val: s => s.x.cr.oil.toFixed(0) + ' ppm', delay: 3 },
    { tag: 'LAH-1207', pri: 'LOW', desc: 'TK-1207 condensate receiver level high', on: s => s.x.cr.L > 85, off: s => s.x.cr.L < 82, val: s => s.x.cr.L.toFixed(0) + ' %' },
    // page 11 - blowdown and wastewater treatment
    { tag: 'TAH-1301', pri: 'LOW', desc: 'Blowdown to wastewater temperature high', on: s => s.x.ww.Tbd > 60, off: s => s.x.ww.Tbd < 55, val: s => s.x.ww.Tbd.toFixed(0) + ' °C', delay: 5 },
    { tag: 'LAH-1302', pri: 'HIGH', desc: 'TK-1302 equalisation tank level high', on: s => s.x.ww.Leq > 80, off: s => s.x.ww.Leq < 77, val: s => s.x.ww.Leq.toFixed(0) + ' %' },
    { tag: 'LAH-1303', pri: 'LOW', desc: 'S-1303 oil separator oil layer high - run skimmer P-1303', on: s => s.x.ww.layer > 80, off: s => s.x.ww.layer < 70, val: s => s.x.ww.layer.toFixed(0) + ' %' },
    { tag: 'AAL-1304', pri: 'HIGH', desc: 'TK-1304 neutralisation pit pH low', on: s => s.x.ww.ph4 < 6.0, off: s => s.x.ww.ph4 > 6.3, val: s => s.x.ww.ph4.toFixed(2), delay: 3 },
    { tag: 'AAH-1304', pri: 'HIGH', desc: 'TK-1304 neutralisation pit pH high', on: s => s.x.ww.ph4 > 9.0, off: s => s.x.ww.ph4 < 8.7, val: s => s.x.ww.ph4.toFixed(2), delay: 3 },
    { tag: 'AAL-1305', pri: 'HIGH', desc: 'Final effluent pH below DOE limit 5.5', on: s => s.x.ww.ph5 < WT.lim.phLo, off: s => s.x.ww.ph5 > WT.lim.phLo + 0.2, val: s => s.x.ww.ph5.toFixed(2) },
    { tag: 'AAH-1305', pri: 'HIGH', desc: 'Final effluent pH above DOE limit 9.0', on: s => s.x.ww.ph5 > WT.lim.phHi, off: s => s.x.ww.ph5 < WT.lim.phHi - 0.2, val: s => s.x.ww.ph5.toFixed(2) },
    { tag: 'AAH-1306', pri: 'HIGH', desc: 'Final effluent oil & grease above DOE limit 10 mg/L', on: s => s.x.ww.oil5 > WT.lim.oil, off: s => s.x.ww.oil5 < WT.lim.oil - 1, val: s => s.x.ww.oil5.toFixed(1) + ' mg/L', delay: 5 },
    { tag: 'TAH-1305', pri: 'HIGH', desc: 'Final effluent temperature above DOE limit 40 °C', on: s => s.x.ww.T5 > WT.lim.temp, off: s => s.x.ww.T5 < WT.lim.temp - 1, val: s => s.x.ww.T5.toFixed(1) + ' °C', delay: 5 },
    { tag: 'XA-1305', pri: 'URGENT', desc: 'OFF-SPEC EFFLUENT DISCHARGING TO OUTFALL - divert XV-1305 to recycle', on: s => s.x.ww.offspec && s.eq.XV1305, off: s => !s.x.ww.offspec || !s.eq.XV1305, val: s => 'pH ' + s.x.ww.ph5.toFixed(1) + ' · oil ' + s.x.ww.oil5.toFixed(0) },
  ];
  // one "relief valve open" alarm per PSV (ZA-xxx), same page as the valve
  PSVS.forEach(v => {
    if (v.tag === 'PSV-301') return;   // ZA-301 is defined above
    ALARMS.push({ tag: 'ZA-' + v.tag.slice(4), pri: 'HIGH', desc: `${v.tag} open - ${v.desc} relieving to ${v.dest === 'flare' ? 'flare' : 'atmosphere'}`,
      on: s => s.x.psv[v.tag].open, off: s => !s.x.psv[v.tag].open, val: s => s.x.psv[v.tag].W.toFixed(1) + ' t/h' });
  });

  // State-based alarming: only enabled while the equipment is in service.
  const inService = s => s.x.Fo > 5 || s.x.qrxn > 0.2;
  const kRun = sec => s => s.eq.K301 && s.x.k301t > sec;
  const ALARM_ENABLE = {
    'TAHH-100': inService, 'TAH-100': inService, 'TAL-100': inService, 'TIC-100.OPH': inService,
    'PAH-301': kRun(120), 'IAL-301': s => kRun(60)(s) && s.x.Fo > 60, 'SDA-301': kRun(60), 'UA-301': kRun(30), 'XA-302': kRun(10),
    'TAH-302': kRun(120), 'TAH-304': kRun(60), 'FAL-303': kRun(5),
    'TAH-102': s => s.eq.K301 && s.x.k301t > 180 && s.x.Fo + s.x.Fi > 100,
    'FAL-201': s => (s.eq.P201 && s.x.p201t > 15) || s.x.Fo > 5,
    'XA-301': s => s.x.Fo > 5 || s.x.Fi > 100,
    'TAL-501': s => s.x.F5 > 200, 'TAH-501': s => s.x.F5 > 200, 'AIH-503': s => s.x.F5 > 200, 'AIL-502': s => s.x.F5 > 200,
    'AIL-601': s => s.x.bms === 'FIRING',
    'XA-601': s => s.eq.MSV601,                                   // only when the boiler is supplying the header
    'PAL-605': s => s.eq.MSV601,
    'BAL-401': s => s.x.flareInService, 'BAL-402': s => s.x.flareInService, 'BAL-403': s => s.x.flareInService,
    'PAL-403': s => s.x.flareInService, 'AAH-402': s => s.x.flareInService,
    'LAL-103': s => s.eq.P201, 'AIL-201': s => s.x.Fo > 5,
    'AIH-503': s => s.x.F5 > 200, 'TAL-501': s => s.x.F5 > 200,
    'LAL-501': s => s.x.F5 > 200, 'LAL-502': s => s.x.F5 > 200,
    'LAL-601': s => s.x.bms !== 'OFF' || s.eq.K601,
    'AAH-602': s => s.x.bms === 'FIRING', 'AAHH-602': s => s.x.bms === 'FIRING', 'AAH-603': s => s.x.bms === 'FIRING', 'FAL-606': s => s.x.bms === 'FIRING' && s.x.Pb > 8,
    'SAH-1001': s => s.x.tg.latched, 'VAH-1001': s => s.x.tg.N > 200, 'PAH-1001': s => s.x.tg.N > 1000,
    'LAH-1001': s => s.eq.P1001A || s.eq.P1001B || s.x.tg.N > 100, 'LAL-1001': s => s.eq.P1001A || s.eq.P1001B,
    'LAL-1201': s => s.eq.P601A || s.eq.P601B, 'PAL-1201': s => s.pic1201.mode === 'AUTO' && s.x.Psh > 5, 'AAH-1203': s => s.x.bms === 'FIRING' && s.pic1201.mode === 'AUTO',
    'AIH-1205': s => s.x.dm.Fprod > 0, 'AAH-1209': s => s.eq.P1207, 'AIH-1208': s => s.eq.P1207,
    'TAH-1301': s => s.x.ww.bdIn > 0.05,
  };
  ALARMS.forEach(a => { a.en = ALARM_ENABLE[a.tag] || null; });

  // ---------- scenarios ----------
  const SCENARIOS = {
    steady: { name: 'Steady state', page: 1, sub: 'Normal operation at design rates. Free practice - no upset.' },
    drill: { name: 'Upset: loss of refrigeration', page: 1, sub: 'Reactor page drill. Unannounced loss of K-301 capacity. Diagnose and respond.' },
    suction: { name: 'Upset: high K-301 suction pressure', page: 2, sub: 'Compressor page drill. High suction pressure and rising reactor temperature together - cause, symptom or response?' },
    relief: { name: 'Upset: overpressure relief to flare', page: 3, sub: 'Flare page drill. A refrigeration upset lifts PSV-301 to the flare. Protect the unit and keep the flare smokeless.' },
    colDrill: { name: 'Upset: column condenser failure', page: 4, group: 'drill', sub: 'Fractionator drill. T-501 pressure climbs. Find why and protect the column before the trip and relief valve.' },
    blrDrill: { name: 'Upset: boiler feedwater loss', page: 5, group: 'drill', sub: 'Boiler drill. Drum level starts falling. Act before the low-level trip takes out the steam supply.' },
    flrDrill: { name: 'Upset: flare pilot gas failure', page: 3, group: 'drill', sub: 'Flare drill. Pilots go out. Restore ignition before another unit vents to the flare.' },
    tankDrill: { name: 'Upset: tank overfill during unloading', page: 7, group: 'drill', sub: 'Tank farm drill. An olefin truck is unloading into TK-901. Watch the level.' },
    startup: { name: 'Reactor startup', page: 1, group: 'start', sub: 'Reactor section in cold shutdown; column, boiler and flare in service. Bring the reactor to design rates.' },
    shutdown: { name: 'Reactor shutdown', page: 1, group: 'stop', sub: 'Reactor section at design rates. Shut it down to cold; the column goes to hot standby.' },
    plantStart: { name: 'FULL PLANT startup', page: 3, group: 'start', sub: 'Everything cold except air and N₂. Flare → boiler → column → refrigeration → reactor, in order.' },
    plantStop: { name: 'FULL PLANT shutdown', page: 1, group: 'stop', sub: 'Everything at design rates. Reactor → column → boiler. The flare stays in service.' },
    columnStart: { name: 'Column startup', page: 4, group: 'start', sub: 'T-501 empty, gas-freed and cold. Fill, heat and line out on total reflux.' },
    columnStop: { name: 'Column shutdown', page: 4, group: 'stop', sub: 'T-501 on total reflux (reactor down). Cool, drain, depressure and N₂-purge.' },
    boilerStart: { name: 'Boiler startup', page: 5, group: 'start', sub: 'B-601 cold and empty. Fill, purge, light off, warm up and put on line.' },
    boilerStop: { name: 'Boiler shutdown', page: 5, group: 'stop', sub: 'B-601 firing with the process down. Take it off line, stop the burners and post-purge.' },
    flareStart: { name: 'Flare startup', page: 3, group: 'start', sub: 'Flare header full of air, pilots out. N₂-purge, light the pilots and put the flare in service.' },
    flareStop: { name: 'Flare shutdown', page: 3, group: 'stop', sub: 'Plant down, flare in service. Take the flare out of service safely, keeping the header inert.' },
    tgStart: { name: 'Steam turbine startup + grid sync', page: 8, group: 'start', sub: 'TG-1001 on turning gear, condenser at atmospheric pressure. Pull vacuum, run up, synchronise with the TNB-fed bus and load to 2.2 MW.' },
    tgStop: { name: 'Steam turbine shutdown', page: 8, group: 'stop', sub: 'TG-1001 at 2.2 MW. Unload, open the generator breaker, trip, put on turning gear and break vacuum.' },
    gridDrill: { name: 'Upset: TNB grid failure (islanding)', page: 9, group: 'drill', sub: 'Electrical drill. Something happens on the 11 kV system. Keep the plant powered and get back on the grid.' },
    tgDrill: { name: 'Upset: turbine condenser vacuum loss', page: 8, group: 'drill', sub: 'Turbine drill. Generator output starts to drift. Find out why before the turbine trips.' },
    waterDrill: { name: 'Upset: contaminated condensate', page: 10, group: 'drill', sub: 'Water drill. Watch the condensate, deaerator and boiler water quality.' },
    wwtDrill: { name: 'Upset: wastewater pH excursion', page: 11, group: 'drill', sub: 'Wastewater drill. The demin plant is regenerating. Keep the final effluent within the DOE limits.' },
  };
  Object.keys(SCENARIOS).forEach(k => { if (!SCENARIOS[k].group) SCENARIOS[k].group = k === 'steady' ? 'normal' : 'drill'; });
  const DRILLS = ['drill', 'suction', 'relief', 'colDrill', 'blrDrill', 'flrDrill', 'tankDrill', 'gridDrill', 'tgDrill', 'waterDrill', 'wwtDrill'];

  // ---------- diagnosis questions (per drill) ----------
  const CAUSES = {
    olefin_fcv: 'Olefin feed flow control failure (FV-101 opened)',
    tic_fault: 'TI-100 transmitter or TIC-100 controller failure',
    refrig: 'Loss of refrigeration capacity (K-301 cooling system)',
    tv_stuck: 'TV-100 cooling valve stuck / failed',
    acid: 'Loss of acid circulation (P-201)',
    ic4: 'Loss of isobutane feed (P-102 / FV-102)',
    none: 'No abnormal condition',
  };
  const FIRST = {
    temp: 'Reactor temperature rose first, with delivered cooling duty steady',
    olefin: 'Olefin feed flow increased first',
    cooling: 'Delivered cooling duty fell with olefin feed steady, while TIC-100 output (cooling demand) climbed',
    acid: 'Acid circulation flow dropped first',
    ratio: 'Isobutane/olefin ratio fell first',
  };
  const FINAL = {
    safe: 'Safe state: olefin feed stopped, isobutane and acid circulating',
    reduced: 'Stabilised at reduced olefin rate',
    normal: 'Normal rates maintained',
    tripped: 'Unit tripped by protective system',
  };
  const SUCTION_KINDS = ['speed', 'recycle', 'condenser', 'load'];
  const SUCTION_ROLE = { speed: 'cause', recycle: 'cause', condenser: 'symptom', load: 'response' };
  const DIAG = {
    drill: [
      { id: 'cause', legend: '1. Most likely root cause', opts: CAUSES },
      { id: 'first', legend: '2. What changed first?', opts: FIRST },
      { id: 'finalState', legend: '3. Where have you left the unit?', opts: FINAL },
    ],
    suction: [
      { id: 'role', legend: '1. The high K-301 suction pressure is a…', opts: {
        cause: 'CAUSE - it started at the compressor itself (K-301 lost capacity) and is driving the reactor temperature up',
        symptom: 'SYMPTOM - of a different fault elsewhere in the refrigeration loop (the discharge/condenser side moved first)',
        response: 'RESPONSE - to a process disturbance: reactor heat load rose first and a healthy compressor is reacting to it' } },
      { id: 'root', legend: '2. Root cause', opts: {
        drum: 'Liquid carryover to suction drum D-302',
        speed: 'K-301 drive (VFD channel A) fault limiting speed',
        load: 'Olefin feed valve FV-101 failed open (reactor heat load up)',
        recycle: 'Anti-surge recycle FV-302 held open (UIC-301 / FT-302 failure)',
        condenser: 'Loss of condenser cooling water (P-303A degraded)',
        tic: 'TI-100 transmitter failure',
        none: 'No abnormal condition' } },
      { id: 'first', legend: '3. What changed first?', opts: {
        suction: 'Suction pressure PI-301 rose with nothing else changing',
        load: 'Olefin flow and reactor heat load rose',
        speed: 'K-301 speed SI-301 fell while PIC-301 demand rose',
        condenser: 'CW flow FI-303 fell and discharge pressure PI-303 rose',
        recycle: 'Recycle valve FV-302 opened and suction temperature TI-302 rose' } },
    ],
    relief: [
      { id: 'root', legend: '1. Root cause of the relief', opts: {
        speed: 'K-301 drive fault', header: 'Flare header blockage', cw: 'Loss of condenser cooling water (P-303A trip, P-303B did not auto-start)',
        recycle: 'Anti-surge recycle failure', load: 'Reactor feed upset' } },
      { id: 'first', legend: '2. What changed first?', opts: {
        psv: 'PSV-301 lifted with no prior change', tr: 'Reactor temperature rose', cw: 'CW flow FI-303 fell (P-303A stopped)',
        pd: 'Discharge pressure PI-303 rose with CW flow normal', ps: 'Suction pressure PI-301 rose' } },
      { id: 'layer', legend: '3. Which protection layer limited the overpressure?', opts: {
        pshh: 'PSHH-303 tripped K-301', psv: 'PSV-301 relieved to the flare (PSHH-303 was in bypass)', tzhh: 'TZHH-100 reactor trip', none: 'No protection was needed - pressure never reached the relief set point' } },
    ],
  };

  Object.assign(DIAG, {
    colDrill: [
      { id: 'root', legend: '1. Root cause', opts: { reflux: 'Reflux pump P-502 trip', cwvalve: 'E-502 cooling-water valve failed closed (positioner fault)', reboiler: 'Reboiler steam valve FV-501 stuck open', feed: 'Feed surge from the reactor', pt: 'Pressure transmitter PI-502 fault' } },
      { id: 'first', legend: '2. What changed first?', opts: { pressure: 'Column pressure rose with the CW valve normal', steam: 'Reboiler steam rose first', valve: 'CW valve position (feedback) fell while PIC-502 output rose', reflux: 'Reflux flow fell first' } },
    ],
    blrDrill: [
      { id: 'root', legend: '1. Root cause', opts: { tube: 'Boiler tube leak', lt: 'Drum level transmitter fault', bfw: 'BFW pump P-601A tripped and P-601B did not auto-start', fuel: 'Fuel gas valve failure', demand: 'Steam demand surge' } },
      { id: 'first', legend: '2. What changed first?', opts: { level: 'Drum level fell with BFW flow normal', press: 'Header pressure fell first', bfw: 'BFW flow FI-604 fell to zero', o2: 'Flue O₂ changed first' } },
    ],
    flrDrill: [
      { id: 'root', legend: '1. Root cause', opts: { purge: 'N₂ purge loss', steam: 'Over-steaming snuffed the pilots', pilotgas: 'Pilot gas supply failed (PCV-403)', relief: 'Relief load too high', tc: 'Pilot thermocouple failure' } },
      { id: 'first', legend: '2. What changed first?', opts: { steam: 'Assist steam rose first', pilots: 'Pilot gas pressure fell, then the pilots went out one after another', o2: 'Header O₂ rose first', relief: 'Relief flow appeared first' } },
    ],
    tankDrill: [
      { id: 'root', legend: '1. Root cause', opts: { overfill: 'The truck held more than expected', psv: 'PSV-901 leaking', lt: 'Level transmitter LT-901 stuck (frozen reading)', pump: 'P-901 pumping too fast', feed: 'P-101 feed stopped' } },
      { id: 'first', legend: '2. What changed first?', opts: { press: 'Tank pressure rose first', both: 'Both level readings rose together', frozen: 'LI-901 stopped changing while unloading continued and the radar LI-901B kept rising', flow: 'Unloading flow changed' } },
    ],
  });
  const NEW_DRILL = {
    colDrill: { correct: { root: 'cwvalve', first: 'valve' }, desc: 'E-502 CW valve positioner failed - valve driving closed regardless of PIC-502' },
    blrDrill: { correct: { root: 'bfw', first: 'bfw' }, desc: 'BFW pump P-601A tripped; standby P-601B failed to auto-start' },
    flrDrill: { correct: { root: 'pilotgas', first: 'pilots' }, desc: 'Pilot gas pressure controller PCV-403 failed closed; an upstream unit vents to the flare 120 s later' },
    tankDrill: { correct: { root: 'lt', first: 'frozen' }, desc: 'LT-901 level transmitter froze during truck unloading' },
    gridDrill: { correct: { root: 'grid', first: 'cb' }, desc: 'TNB 33 kV grid fault - CB-1101 tripped on loss of mains; grid restored 240 s later' },
    tgDrill: { correct: { root: 'ejector', first: 'vac' }, desc: 'Air ejector J-1001A motive steam failed - condenser air builds up; standby J-1001B not started' },
    waterDrill: { correct: { root: 'leak', first: 'cond' }, desc: 'E-501 reboiler tube leak - hydrocarbon/acid into returned condensate; XV-1208 auto-dump interlock failed' },
    wwtDrill: { correct: { root: 'caustic', first: 'ph' }, desc: 'Caustic dosing pump P-1304A tripped (P-1304B no auto-start) during demin train B regeneration' },
  };
  Object.assign(DIAG, {
    gridDrill: [
      { id: 'root', legend: '1. Root cause', opts: { grid: 'Loss of the TNB grid supply - CB-1101 opened on loss of mains and the plant islanded', gov: 'Turbine governor fault', avr: 'Generator AVR (excitation) failure', motor: 'Large motor start overloaded the generator', boiler: 'Boiler trip - low steam pressure to the turbine' } },
      { id: 'first', legend: '2. What changed first?', opts: { f: 'Bus frequency fell with the TNB incomer still closed', cb: 'CB-1101 opened and TNB import dropped to zero; frequency then dipped as TG-1001 picked up the whole plant load', v: 'Generator voltage collapsed first', steam: 'MP steam header pressure fell first' } },
    ],
    tgDrill: [
      { id: 'root', legend: '1. Root cause', opts: { ejector: 'Air ejector J-1001A lost motive steam - air accumulates in the condenser', cw: 'Condenser cooling water failure', hotwell: 'Hotwell flooding (condensate pump trip)', gov: 'Governor valve fault', steam: 'Low inlet steam pressure' } },
      { id: 'first', legend: '2. What changed first?', opts: { vac: 'Condenser pressure PI-1001 rose (vacuum fell) with hotwell level, steam flow and inlet pressure normal; MW then fell', mw: 'Generator MW fell with steam flow falling first', hw: 'Hotwell level rose first', psh: 'Inlet steam pressure fell first' } },
    ],
    waterDrill: [
      { id: 'root', legend: '1. Root cause', opts: { leak: 'Process leak into steam condensate (E-501 reboiler tube leak)', demin: 'Demin train breakthrough', dose: 'Chemical dosing overdose', cbd: 'CBD valve closed', o2: 'Deaerator pegging steam failure' } },
      { id: 'first', legend: '2. What changed first?', opts: { cond: 'Returned condensate conductivity AI-1208 and oil AI-1209 rose first', tds: 'Boiler water TDS rose first', o2: 'Deaerator O₂ rose first', demin: 'Demin water conductivity rose first' } },
    ],
    wwtDrill: [
      { id: 'root', legend: '1. Root cause', opts: { caustic: 'Caustic dosing pump P-1304A tripped while acid regeneration waste arrived', regen: 'Regeneration waste too strong for the dosing system', ai: 'pH analyser fault', oil: 'Oil separator carryover', bd: 'Boiler blowdown too alkaline' } },
      { id: 'first', legend: '2. What changed first?', opts: { ph: 'Neutralisation pH fell while AIC-1304 output rose to full caustic with no caustic flow', out: 'Final effluent pH fell with the pit pH normal', oil: 'Oil-in-water rose first', temp: 'Effluent temperature rose first' } },
    ],
  });

  // ---------- procedures ----------
  const PROCEDURES = {
    startup: { title: 'ALKY-1 reactor section - normal startup (cold to design rates)', target: 900, steps: [
      { title: 'Pre-start checks', type: 'check',
        detail: 'Confirm XV-101 is CLOSED and FIC-101 is in MAN at 0 %. P-101, P-102, P-201 and K-301 are stopped. CW pump P-303A is running to E-301. PIC-301 and UIC-301 are in AUTO. Acid inventory is in D-102 (LI-103 ≈ 85 %). Alarms on idle equipment are suppressed until it is in service.' },
      { title: 'Start K-301 refrigeration compressor', keys: ['K-301:start'],
        detail: 'Open the K-301 faceplate (page 2) and press Start. PIC-301 brings suction pressure down to 3.1 barg; UIC-301 opens recycle FV-302 while there is no evaporator load.',
        done: s => s.eq.K301 },
      { title: 'Wait for refrigerant below 0 °C',
        detail: 'Wait until TI-301 (refrigerant evaporating temperature) is below 0 °C before loading the system.',
        done: s => s.x.Tref < 0 },
      { title: 'Establish isobutane circulation', keys: ['P-102:start', 'FIC-102:*'],
        detail: 'Start P-102, then put FIC-102 in AUTO with SP 1080 kmol/h. Isobutane must circulate through E-101 and R-101 before any olefin is introduced.',
        done: s => s.eq.P102 && s.fic102.mode === 'AUTO' && s.x.Fi >= 950 },
      { title: 'Start acid circulation', keys: ['P-201:start'],
        detail: 'Start P-201. Confirm FI-201 ≥ 400 m3/h; LI-103 falls as acid fills R-101.',
        done: s => s.x.Facid >= 400 },
      { title: 'Cool the reactor below 10 °C', keys: ['TIC-100:*'],
        detail: 'Put TIC-100 in AUTO with SP 8.0 °C (6–10 °C allowed). Wait for TI-100 to fall below 10 °C.',
        done: s => s.tic100.mode === 'AUTO' && s.tic100.sp >= 6 && s.tic100.sp <= 10 && s.x.Tr < 10 },
      { title: 'Open olefin isolation XV-101', keys: ['XV-101:open'],
        detail: 'Permissive: TI-100 below 11 °C. Open XV-101 from its faceplate. FIC-101 remains in MAN at 0 %.',
        done: s => s.eq.xvOpen },
      { title: 'Introduce olefin at reduced rate (≤ 40 kmol/h)', keys: ['P-101:start', 'FIC-101:*'],
        detail: 'Start P-101. Set FIC-101 SP to 40 kmol/h or less, then switch FIC-101 to AUTO. Watch TI-100 and the I/O ratio (≥ 7).',
        done: s => s.eq.P101 && s.fic101.mode === 'AUTO' && s.x.Fo >= 30 },
      { title: 'Raise olefin to 80 kmol/h', keys: ['FIC-101:*'],
        detail: 'Raise FIC-101 SP in steps of no more than 40 kmol/h. Let TI-100 settle (TIC-100 output below 95 %) between steps.',
        done: s => s.x.Fo >= 75 },
      { title: 'Raise olefin to design rate 120 kmol/h', keys: ['FIC-101:*'],
        detail: 'Raise FIC-101 SP to 120 kmol/h (step ≤ 40 kmol/h). Keep TI-100 at or below 11 °C.',
        done: s => s.x.Fo >= 115 },
      { title: 'Line out at design conditions (hold 60 s)', hold: 60,
        detail: 'Hold TI-100 between 6 and 10 °C, olefin 115–125 kmol/h and I/O ratio ≥ 7 for 60 seconds. Startup complete.',
        done: s => s.x.Tr >= 6 && s.x.Tr <= 10 && s.x.Fo >= 115 && s.x.Fo <= 125 && s.x.Fi / Math.max(1, s.x.Fo) >= 7 },
    ] },
    shutdown: { title: 'ALKY-1 reactor section - normal shutdown (design rates to cold shutdown)', target: 600, steps: [
      { title: 'Pre-shutdown checks', type: 'check',
        detail: 'Confirm K-301 running, TIC-100 in AUTO, acid circulating (FI-201 ≥ 400 m3/h) and isobutane at design rate. Inform the downstream units and the flare operator.' },
      { title: 'Reduce olefin to 80 kmol/h', keys: ['FIC-101:sp'],
        detail: 'Lower FIC-101 SP in steps of no more than 40 kmol/h. Keep TIC-100 in AUTO and TI-100 within 4–11 °C.',
        done: s => s.x.Fo <= 85 },
      { title: 'Reduce olefin to 40 kmol/h', keys: ['FIC-101:sp'],
        detail: 'Lower FIC-101 SP to 40 kmol/h. Check that the I/O ratio is rising and TI-100 stays within limits. K-301 slows down and UIC-301 may open recycle as load falls - this is normal.',
        done: s => s.x.Fo <= 45 },
      { title: 'Stop olefin feed', keys: ['FIC-101:*', 'XV-101:close', 'P-101:stop'],
        detail: 'Put FIC-101 in MAN at 0 % (or SP 0), close XV-101, then stop P-101.',
        done: s => !s.eq.xvOpen && !s.eq.P101 && s.x.Fo < 1 },
      { title: 'Circulate out residual olefin (2 min)',
        detail: 'Keep isobutane, acid circulation and refrigeration running for 2 minutes so the remaining olefin reacts out. Do not stop anything yet.',
        done: (s, i) => s.proc.steps[i - 1].tDone != null && s.t - s.proc.steps[i - 1].tDone >= 120 },
      { title: 'Stop acid circulation', keys: ['P-201:stop'],
        detail: 'Stop P-201. Acid settles back into D-102 (LI-103 rises).',
        done: s => !s.eq.P201 },
      { title: 'Stop isobutane feed', keys: ['P-102:stop', 'FIC-102:*'],
        detail: 'Stop P-102. FIC-102 goes to MAN at 0 %.',
        done: s => !s.eq.P102 },
      { title: 'Close the refrigerant valve', keys: ['TIC-100:*'],
        detail: 'Put TIC-100 in MAN and set its output to 0 % (TV-100 closed).',
        done: s => s.tic100.mode === 'MAN' && s.tic100.op < 1 },
      { title: 'Stop K-301 refrigeration compressor', keys: ['K-301:stop'],
        detail: 'Stop K-301 from its faceplate (page 2).',
        done: s => !s.eq.K301 },
      { title: 'Final checks - cold shutdown', type: 'check',
        detail: 'Confirm XV-101 closed and P-101, P-102, P-201 and K-301 stopped. The unit is in cold shutdown.' },
    ] },
  };

  // ---- unit procedure building blocks (re-used by the full-plant procedures) ----
  const pre = detail => ({ title: 'Pre-start checks', type: 'check', detail });
  const FLARE_START = [
    { title: 'Purge the flare header with N₂', keys: ['HV-801:open'], detail: 'Open N₂ purge HV-801 (page 6, or the flare page). Wait for header O₂ AI-402 below 2 %: air must be removed before any ignition source.', done: s => s.eq.HV801 && s.x.hO2 < 2 },
    { title: 'Line up pilot gas', keys: ['HV-403:open'], detail: 'Open pilot gas valve HV-403 on the F-401 faceplate. PAL-403 clears.', done: s => s.eq.HV403 && s.x.gasOK },
    { title: 'Light pilots A, B and C', keys: ['F-401:relight'], detail: 'Relight each pilot from the F-401 faceplate. Ignition is refused while the header still holds air.', done: s => s.eq.pilots.every(Boolean) },
  ];
  const FLARE_STEAM = { title: 'Establish minimum flare assist steam', keys: ['FIC-402:*'], detail: 'Put FIC-402 in AUTO at 0.5 t/h (tip cooling). Needs steam on the MP header from B-601.', done: s => s.fic402.mode === 'AUTO' && s.x.steam >= 0.4 };
  const BOILER_START = [
    { title: 'Fill the boiler steam drum', keys: ['P-601A:start', 'P-601B:start', 'LIC-601:*'], detail: 'Start BFW pump P-601A and fill the drum (LIC-601 in MAN at 100 %, or AUTO at 50 %). Continue when drum level LI-601 is above 40 %; leave LIC-601 in AUTO.', done: s => (s.eq.P601A || s.eq.P601B) && s.x.Ldr >= 40 },
    { title: 'Start FD fan K-601', keys: ['K-601:start'], detail: 'The fan supplies combustion air and furnace purge air.', done: s => s.eq.K601 },
    { title: 'Purge the furnace', keys: ['B-601:purge'], detail: 'B-601 faceplate: Start purge. 60 s of fan air sweeps any fuel out of the furnace.', done: s => s.x.bms === 'READY' },
    { title: 'Light off at low fire', keys: ['B-601:light'], detail: 'B-601 faceplate: Light-off. Permissives: purge complete, drum level ≥ 30 %.', done: s => s.x.bms === 'FIRING' },
    { title: 'Warm up to 10 barg drum pressure', keys: ['PIC-601:*'], detail: 'Keep PIC-601 in MAN at low fire (15–25 %) so the boiler heats evenly. Wait for drum pressure PI-601 ≥ 10 barg.', done: s => s.x.Pb >= 10 },
    { title: 'Open main steam valve MSV-601', keys: ['MSV-601:open'], detail: 'Put the boiler on the MP steam header.', done: s => s.eq.MSV601 },
    { title: 'Header pressure control in AUTO', keys: ['PIC-601:*'], hold: 30, detail: 'Put PIC-601 in AUTO at 10.5 barg. Header PI-605 ≥ 10 barg held for 30 s.', done: s => s.pic601.mode === 'AUTO' && s.x.Psh >= 10 },
    { title: 'Deaerator pegging steam in AUTO', keys: ['PIC-1201:*'], hold: 30, detail: 'Page 10: put PIC-1201 in AUTO at 0.35 barg. Steam heats D-1201 to about 108 °C and strips the dissolved oxygen. Continue when PI-1201 has held ≥ 0.25 barg for 30 s.', done: s => s.pic1201.mode === 'AUTO' && s.x.da.P >= 0.25 },
  ];
  BOILER_START.splice(4, 0, { title: 'Continuous blowdown in AUTO', keys: ['FIC-606:*'], detail: 'Put FIC-606 (CBD) in AUTO at 0.5 t/h. Blowdown removes the dissolved solids that concentrate as the boiler steams: it holds boiler water TDS AI-602 below 2500 ppm.', done: s => s.fic606.mode === 'AUTO' });
  const DA_START = [
    { title: 'Line up demin make-up to the deaerator', keys: ['P-1206A:start', 'P-1206B:start', 'LIC-1201:*'], detail: 'Page 10: start demin transfer pump P-1206A and put LIC-1201 in AUTO at 60 %. Start chemical dosing P-1210 (O₂ scavenger and phosphate).', done: s => (s.eq.P1206A || s.eq.P1206B) && s.lic1201.mode === 'AUTO' && s.eq.P1210 },
  ];
  const TG_START = [
    { title: 'Start condensate pump P-1001A', keys: ['P-1001A:start', 'P-1001B:start', 'LIC-1001:*'], detail: 'Page 8: start condensate extraction pump P-1001A. LIC-1001 holds the hotwell level and sends condensate to the deaerator.', done: s => s.eq.P1001A || s.eq.P1001B },
    { title: 'Start the air ejectors and pull vacuum', keys: ['J-1001A:start', 'J-1001B:start'], detail: 'Start J-1001A and J-1001B (hogging). Wait for condenser pressure PI-1001 below 0.20 bara. Gland steam is lined up automatically with the ejectors.', done: s => s.x.tg.Pcond < 0.2 },
    { title: 'Latch the turbine and open the trip valve', keys: ['TG-1001:latch'], detail: 'TG-1001 faceplate: Latch / open TTV. Permissives: vacuum below 0.25 bara, condensate pump running, rotor on turning gear. The governor takes speed control.', done: s => s.x.tg.latched },
    { title: 'Roll to 500 rpm and soak (60 s)', keys: ['SIC-1001:*', 'TG-1001:gear'], hold: 60, detail: 'SIC-1001 speed target 500 rpm. The turning gear disengages as the rotor lifts. Hold 400–700 rpm for 60 s so the casing and rotor warm evenly.', done: s => s.x.tg.N >= 400 && s.x.tg.N <= 700 },
    { title: 'Run up to 3000 rpm through the critical band', keys: ['SIC-1001:*'], detail: 'Set the speed target to 3000 rpm. The governor ramps at 10 rpm/s and accelerates through the 1800–2200 rpm critical band. Never park the speed target inside that band: vibration builds up.', done: s => s.x.tg.N >= 2970 && s.x.tg.N <= 3030 },
    { title: 'Excite the generator', keys: ['G-1001:exc', 'G-1001:vsp'], detail: 'G-1001 faceplate: field breaker ON. The AVR builds the terminal voltage to 11.0 kV.', done: s => s.eq.EXC1001 && s.x.tg.Vg > 10.6 },
    { title: 'Synchronise and close CB-1102', keys: ['CB-1102:close', 'SIC-1001:*', 'G-1001:vsp'], detail: 'Page 9 synchroscope: trim the speed target so the generator runs slightly fast (slip +0.05 to +0.15 Hz), match the voltage with the AVR, then close CB-1102 as the pointer approaches 12 o\'clock. The check-synch relay refuses |Δf| > 0.2 Hz, |ΔV| > 5 % or |angle| > 20°.', done: s => s.eq.CB1102 },
    { title: 'Pick up minimum load (≥ 0.3 MW)', keys: ['SIC-1001:*'], detail: 'Governor is now in LOAD mode. Raise the load setpoint to at least 0.3 MW straight away - the reverse-power relay trips CB-1102 if the generator motors for 5 s.', done: s => s.eq.CB1102 && s.x.tg.Pe >= 0.3 },
    { title: 'Load to 2.2 MW', keys: ['SIC-1001:*'], hold: 30, detail: 'Set the load setpoint to 2.2 MW. The governor ramps at 0.5 MW/min; watch the MP header pressure - B-601 must make about 13 t/h more steam. Hold for 30 s.', done: s => s.eq.CB1102 && s.x.tg.Pe >= 2.1 },
  ];
  const TG_STOP = [
    { title: 'Reduce generator load to 0.3 MW', keys: ['SIC-1001:*'], detail: 'SIC-1001 load setpoint 0.3 MW (ramps at 0.5 MW/min). TNB import rises as the generator unloads.', done: s => s.eq.CB1102 && s.x.tg.Pe <= 0.45 },
    { title: 'Open generator breaker CB-1102', keys: ['CB-1102:open'], detail: 'Page 9: open CB-1102. With little load there is no overspeed. The governor returns to speed control at 3000 rpm.', done: s => !s.eq.CB1102 },
    { title: 'Trip the turbine (close the trip valve)', keys: ['TG-1001:trip'], detail: 'TG-1001 faceplate: Trip. The rotor coasts down.', done: s => !s.x.tg.latched },
    { title: 'De-excite the generator', keys: ['G-1001:exc'], detail: 'G-1001 faceplate: field breaker OFF.', done: s => !s.eq.EXC1001 },
    { title: 'Engage turning gear at standstill', keys: ['TG-1001:gear'], detail: 'When the rotor is below 5 rpm, engage the turning gear so the hot rotor does not bow.', done: s => s.eq.TGEAR && s.x.tg.N < 5 },
    { title: 'Break vacuum: stop the air ejectors', keys: ['J-1001A:stop', 'J-1001B:stop'], detail: 'Stop J-1001A and J-1001B. Only after the rotor is on turning gear.', done: s => !s.eq.J1001A && !s.eq.J1001B },
    { title: 'Stop condensate pump', keys: ['P-1001A:stop', 'P-1001B:stop'], detail: 'Stop P-1001A / P-1001B. The hotwell keeps its water for the next start.', done: s => !s.eq.P1001A && !s.eq.P1001B },
  ];
  const BOILER_STOP = [
    { title: 'Reduce firing to minimum', keys: ['PIC-601:*'], detail: 'PIC-601 to MAN at 15 % output or less.', done: s => s.pic601.mode === 'MAN' && s.pic601.op <= 15 },
    { title: 'Take the boiler off the header', keys: ['MSV-601:close'], detail: 'Close MSV-601. Steam users must already be shut down.', done: s => !s.eq.MSV601 },
    { title: 'Stop the burners (normal stop)', keys: ['B-601:stop'], detail: 'B-601 faceplate: Normal stop.', done: s => s.x.bms === 'OFF' },
    { title: 'Post-purge for 60 s', detail: 'Keep FD fan K-601 running for 60 s after the burners stop.', done: s => s.x.bms === 'OFF' && s.eq.K601 && s.x.bmsOffT != null && s.t - s.x.bmsOffT >= 60 },
    { title: 'Stop FD fan K-601', keys: ['K-601:stop'], detail: 'Stop K-601.', done: s => !s.eq.K601 },
    { title: 'Cool down, then stop BFW', keys: ['P-601A:stop', 'P-601B:stop', 'LIC-601:*'], detail: 'Keep the drum level up while it cools. When drum pressure PI-601 is below 2 barg, stop the BFW pumps.', done: s => s.x.Pb < 2 && !s.eq.P601A && !s.eq.P601B },
  ];
  const COLUMN_START = [
    { title: 'Condenser cooling-water control in AUTO', keys: ['PIC-502:*'], detail: 'Put PIC-502 in AUTO at 6.5 barg. The CW valve opens as pressure builds.', done: s => s.pic502.mode === 'AUTO' },
    { title: 'Fill T-501 with isobutane', keys: ['HV-503:open'], detail: 'Open startup fill valve HV-503 (isobutane from TK-902). Fill the bottoms to LI-501 ≥ 40 %.', done: s => s.x.Lb >= 40 },
    { title: 'Stop the fill', keys: ['HV-503:close'], detail: 'Close HV-503.', done: s => !s.eq.HV503 },
    { title: 'Start reboiler steam (warm-up)', keys: ['TIC-501:*'], detail: 'TIC-501 in MAN at 25–35 % output. Boil-up starts and the overhead condenses into D-502.', done: s => s.x.st501 >= 5 },
    { title: 'Start reflux pump P-502', keys: ['P-502:start'], detail: 'Start P-502 once D-502 level is above 20 %.', done: s => s.eq.P502 && s.x.Ld >= 20 },
    { title: 'Reflux in AUTO (total reflux)', keys: ['FIC-502:*'], detail: 'Put FIC-502 in AUTO (SP 1000–1300 kmol/h). LIC-502 holds the drum level.', done: s => s.fic502.mode === 'AUTO' && s.x.L5 >= 700 },
    { title: 'Tray temperature in AUTO - hot standby', keys: ['TIC-501:*'], hold: 60, detail: 'Put TIC-501 in AUTO at 140 °C. Hold within ±6 °C for 60 s. The column is ready for feed.', done: s => s.tic501.mode === 'AUTO' && Math.abs(s.x.Ttray - 140) < 6 },
  ];
  const COLUMN_STOP = [
    { title: 'Stop reboiler steam', keys: ['TIC-501:*'], detail: 'TIC-501 to MAN, output 0 %.', done: s => s.tic501.mode === 'MAN' && s.x.st501 < 0.5 },
    { title: 'Pump D-502 out to TK-902', keys: ['LIC-502:*'], detail: 'LIC-502 to MAN 100 % until LI-502 is below 5 %.', done: s => s.x.Ld < 5 },
    { title: 'Stop reflux pump P-502', keys: ['P-502:stop', 'FIC-502:*'], detail: 'Stop P-502.', done: s => !s.eq.P502 },
    { title: 'Drain the column to TK-903', keys: ['LIC-501:*'], detail: 'LIC-501 to MAN 100 % until LI-501 is below 5 %.', done: s => s.x.Lb < 5 },
    { title: 'Depressure to the flare', keys: ['HV-504:open'], detail: 'Open vent HV-504 to the flare header. Wait for PI-502 below 0.5 barg.', done: s => s.x.Pc < 0.5 },
    { title: 'N₂ purge (gas-free)', keys: ['HV-802:open'], detail: 'Open HV-802 (page 6) with HV-504 still open. Purge until column hydrocarbon AI-504 is below 2 %.', done: s => s.x.colHC < 2 },
    { title: 'Close purge and vent', keys: ['HV-802:close', 'HV-504:close'], detail: 'Close HV-802 and HV-504. The column is gas-free under N₂.', done: s => !s.eq.HV802 && !s.eq.HV504 },
  ];
  const FLARE_STOP = [
    { title: 'Stop flare assist steam', keys: ['FIC-402:*'], detail: 'FIC-402 to MAN, output 0 %.', done: s => s.fic402.mode === 'MAN' && s.x.steam < 0.1 },
    { title: 'Close pilot gas', keys: ['HV-403:close', 'HV-404:close'], detail: 'Close HV-403 (and backup HV-404). The pilots go out.', done: s => !s.eq.HV403 && !s.eq.HV404 && !s.eq.pilots.some(Boolean) },
    { title: 'Keep the header inert', hold: 30, detail: 'N₂ purge HV-801 stays OPEN and header O₂ stays below 2 % (held 30 s) until the header is blinded for maintenance.', done: s => s.eq.HV801 && s.x.hO2 < 2 },
  ];
  Object.assign(PROCEDURES, {
    flareStart: { title: 'F-401 flare - startup', target: 300, steps: [pre('Confirm all relief sources are isolated or idle, KO drum D-401 below 20 %, N₂ available on page 6.'), ...FLARE_START, FLARE_STEAM,
      { title: 'Flare in service', type: 'check', detail: 'Confirm three pilots lit, header inert, minimum steam flowing.' }] },
    flareStop: { title: 'F-401 flare - shutdown', target: 240, steps: [pre('Confirm every unit is shut down and depressured: no relief can reach the flare.'), ...FLARE_STOP] },
    boilerStart: { title: 'B-601 boiler - cold startup', target: 2400, steps: [pre('Confirm drum vents open, instrument air available, fuel gas available, MSV-601 closed. Deaerator D-1201 full of demin water (cold), demin pump P-1206A and dosing P-1210 running.'), ...BOILER_START] },
    boilerStop: { title: 'B-601 boiler - normal shutdown', target: 1500, steps: [pre('Confirm the steam users (T-501 reboiler, flare steam, TG-1001 turbine) are shut down.'), ...BOILER_STOP] },
    tgStart: { title: 'TG-1001 steam turbine generator - startup and synchronising', target: 1200, steps: [pre('Confirm TG-1001 on turning gear, lube oil running, CB-1102 open, 11 kV bus live from TNB (page 9), MP steam header at 10.5 barg, B-601 able to raise about 13 t/h more steam.'), ...TG_START] },
    tgStop: { title: 'TG-1001 steam turbine generator - normal shutdown', target: 900, steps: [pre('Inform the control room: TNB import will rise by about 2.2 MW. Check the import stays below the 3.5 MW maximum demand.'), ...TG_STOP] },
    columnStart: { title: 'T-501 deisobutanizer - startup to total reflux', target: 1500, steps: [pre('Confirm T-501 is gas-free under N₂, vent HV-504 and purge HV-802 closed, steam and CW available, TK-902 has isobutane.'), ...COLUMN_START] },
    columnStop: { title: 'T-501 deisobutanizer - shutdown and gas-freeing', target: 1600, steps: [pre('Confirm the reactor is shut down (no feed to T-501).'), ...COLUMN_STOP] },
    plantStart: { title: 'ALKY-1 - full plant startup (all units cold)', target: 6600, steps: [
      pre('Power from TNB (page 9), air and N₂ in service (page 6), demin water and wastewater treatment in service (pages 10-11). Every other unit is cold. TK-901 and TK-902 above 60 % (column fill and isobutane circulation draw heavily on TK-902 before the recycle returns). Work in this order: flare → deaerator → boiler → turbine → column → refrigeration and reactor.'),
      ...FLARE_START, ...DA_START, ...BOILER_START, FLARE_STEAM, ...TG_START, ...COLUMN_START, ...PROCEDURES.startup.steps.slice(1)] },
    plantStop: { title: 'ALKY-1 - full plant shutdown (flare stays in service)', target: 4200, steps: [
      pre('Inform the tank farm, flare operator and TNB control: import rises as the turbine unloads. Shutdown order: reactor → refrigeration → column → turbine → boiler.'),
      ...PROCEDURES.shutdown.steps.slice(1, 9), ...COLUMN_STOP, ...TG_STOP, ...BOILER_STOP,
      { title: 'Final checks - plant cold, flare in service', type: 'check', detail: 'Confirm the reactor, K-301, T-501, TG-1001 and B-601 are shut down, the plant is on TNB supply and the flare pilots are lit.' }] },
  });

  // ---------- first-change detector (debrief "what changed first") ----------
  const WATCH = [
    { k: 'Fo', label: 'Olefin flow FI-101', thr: 8, page: 1, unit: 'kmol/h', dec: 0 },
    { k: 'load', label: 'Reactor heat load', thr: 0.2, page: 1, unit: 'MW', dec: 2 },
    { k: 'qcool', label: 'Delivered cooling QI-100', thr: 0.15, page: 1, unit: 'MW', dec: 2 },
    { k: 'op', label: 'Cooling demand TIC-100 OP', thr: 8, page: 1, unit: '%', dec: 0 },
    { k: 'Tr', label: 'Reactor temperature TI-100', thr: 0.4, page: 1, unit: '°C', dec: 1 },
    { k: 'cw', label: 'Condenser CW flow FI-303', thr: 8, page: 2, unit: '%', dec: 0 },
    { k: 'N', label: 'K-301 speed SI-301', thr: 4, page: 2, unit: '%', dec: 0 },
    { k: 'zR', label: 'Recycle valve FV-302', thr: 8, page: 2, unit: '%', dec: 0 },
    { k: 'Ts', label: 'Suction temperature TI-302', thr: 3, page: 2, unit: '°C', dec: 1 },
    { k: 'Pd', label: 'Discharge pressure PI-303', thr: 0.4, page: 2, unit: 'barg', dec: 1 },
    { k: 'Ps', label: 'Suction pressure PI-301', thr: 0.15, page: 2, unit: 'barg', dec: 2 },
    { k: 'amps', label: 'K-301 motor current II-301', thr: 12, page: 2, unit: 'A', dec: 0 },
    { k: 'Wpsv', label: 'PSV-301 relief flow', thr: 0.5, page: 3, unit: 't/h', dec: 1 },
    { k: 'Ph', label: 'Flare header pressure PI-401', thr: 0.05, page: 3, unit: 'barg', dec: 2 },
    { k: 'Lko', label: 'KO drum level LI-401', thr: 3, page: 3, unit: '%', dec: 0 },
    { k: 'Pr', label: 'Reactor pressure PI-103', thr: 0.4, page: 1, unit: 'barg', dec: 1 },
    { k: 'Pc', label: 'Column pressure PI-502', thr: 0.3, page: 4, unit: 'barg', dec: 2 },
    { k: 'Ttray', label: 'Column tray temperature TI-501', thr: 3, page: 4, unit: '°C', dec: 0 },
    { k: 'st501', label: 'Reboiler steam FI-501', thr: 2, page: 4, unit: 't/h', dec: 1 },
    { k: 'Psh', label: 'MP steam header PI-605', thr: 0.3, page: 5, unit: 'barg', dec: 2 },
    { k: 'gen', label: 'Boiler steam generation FI-603', thr: 3, page: 5, unit: 't/h', dec: 1 },
    { k: 'Pia', label: 'Instrument air header PI-702', thr: 0.5, page: 6, unit: 'barg', dec: 2 },
    { k: 'zCW5', label: 'E-502 CW valve position ZI-502', thr: 8, page: 4, unit: '%', dec: 0 },
    { k: 'bfw', label: 'Boiler feedwater FI-604', thr: 3, page: 5, unit: 't/h', dec: 1 },
    { k: 'Ldr', label: 'Boiler drum level LI-601', thr: 3, page: 5, unit: '%', dec: 0 },
    { k: 'pilotsLit', label: 'Flare pilots lit', thr: 0.5, page: 3, unit: '', dec: 0 },
    { k: 'gasOKn', label: 'Flare pilot gas available', thr: 0.5, page: 3, unit: '', dec: 0 },
    { k: 'L901', label: 'TK-901 level LT-901', thr: 2, page: 7, unit: '%', dec: 0 },
    { k: 'L901B', label: 'TK-901 radar level LI-901B', thr: 2, page: 7, unit: '%', dec: 0 },
    { k: 'P901', label: 'TK-901 pressure PI-901', thr: 0.3, page: 7, unit: 'barg', dec: 2 },
    { k: 'cb1101', label: 'TNB incomer CB-1101 (1 = closed)', thr: 0.5, page: 9, unit: '', dec: 0 },
    { k: 'imp', label: 'TNB import JI-1101', thr: 0.3, page: 9, unit: 'MW', dec: 2 },
    { k: 'fbus', label: '11 kV bus frequency SI-1101', thr: 0.15, page: 9, unit: 'Hz', dec: 2 },
    { k: 'Pe', label: 'Generator output JI-1001', thr: 0.15, page: 8, unit: 'MW', dec: 2 },
    { k: 'Pcond', label: 'Condenser pressure PI-1001', thr: 0.015, page: 8, unit: 'bara', dec: 3 },
    { k: 'Ftg', label: 'Turbine steam FI-1001', thr: 1, page: 8, unit: 't/h', dec: 1 },
    { k: 'Lhw', label: 'Hotwell level LI-1001', thr: 4, page: 8, unit: '%', dec: 0 },
    { k: 'crCond', label: 'Condensate conductivity AI-1208', thr: 3, page: 10, unit: 'µS/cm', dec: 0 },
    { k: 'crOil', label: 'Oil in condensate AI-1209', thr: 2, page: 10, unit: 'ppm', dec: 0 },
    { k: 'tds', label: 'Boiler water TDS AI-602', thr: 150, page: 5, unit: 'ppm', dec: 0 },
    { k: 'daO2', label: 'Feedwater O₂ AI-1203', thr: 5, page: 10, unit: 'ppb', dec: 0 },
    { k: 'dmCond', label: 'Demin conductivity AI-1205', thr: 0.3, page: 10, unit: 'µS/cm', dec: 2 },
    { k: 'ph4', label: 'Neutralisation pit pH AIC-1304', thr: 0.4, page: 11, unit: '', dec: 2 },
    { k: 'dose', label: 'Caustic dosing FI-1304', thr: 150, page: 11, unit: 'eq', dec: 0 },
    { k: 'ph5', label: 'Final effluent pH AI-1305', thr: 0.4, page: 11, unit: '', dec: 2 },
  ];

  class Sim {
    constructor(opts) {
      this.opts = opts || {};
      this.reset(this.opts.seed);
    }

    reset(seed) {
      const o = this.opts;
      this.seed = (seed != null ? seed : Math.floor(Math.random() * 1e9)) >>> 0;
      const r = mulberry32(this.seed);
      this.rand = r;
      this.scenario = SCENARIOS[o.scenario] ? o.scenario : 'drill';
      this.drill = {
        onset: o.onset != null ? o.onset : Math.round(60 + r() * 120),
        finalCap: o.finalCap != null ? o.finalCap : Math.round((0.18 + r() * 0.30) * 100) / 100,
        ramp: o.ramp != null ? o.ramp : Math.round(70 + r() * 40),
        kind: SUCTION_KINDS.includes(o.kind) ? o.kind : SUCTION_KINDS[Math.floor(r() * SUCTION_KINDS.length) % SUCTION_KINDS.length],
      };
      if (!DRILLS.includes(this.scenario)) this.drill.onset = Infinity;
      this.phase = 'standby';
      this.t = -PRE_HISTORY - 3000;
      this.x = {
        Tr: 8, Tset: 8.5, Tpc: 10.75, Tref: -5, cap: 1, qrxn: 2.66, zFo: 50, zFi: 60, zc: 66,
        Fo: 120, Fi: 1080, Facid: P.acidFlow, Lset: 55, qcool: 3, load: 3, qmaxNow: 4.5, acidStr: 90.5,
        k301t: 9999, p201t: 9999,
        // refrigeration
        Ps: R.psSP, Pd: 13.0, N: 80, Ndem: 80, zR: 0, Ts: -1, Td: 58, Qcap: 3.8, Qrec: 0, Qevap: 3.8, Qavail: 4.6,
        W: 1.0, SM: 100, cw: 100, Ldrum: 10, Lacc: 55, speedLim: 100, vfdCh: 'A',
        // relief and flare
        psvOpen: false, psvLift: 0, Wpsv: 0, Ph: 0.02, Lko: 15, Tfh: 20, steam: R.steamMin, zS: 3, Psteam: 10.4,
        hc: 0, ratio: 1.6, flame: 'idle', smokeT: 0, overT: 0, psvT: 0, psvLifts: 0, kStop: 'ramp',
        Wflare: 0, Wliq: 0, purge: 0.3,
        // reactor pressure + fractionator T-501
        Pr: 6.0, zPV103: 45, Fout: 1080, F5: 1080, A5: 120, z501: 58, st501: 20.3, V5: 2260, Pc: C5.pSP, Ttop: 52.7,
        zCW5: 77, zL: 50, zD: 48, zB: 20, L5: 1300, D5: 960, B5: 120, Ld: 50, Lb: 50, Ttray: C5.trSP, ex5: 0, pur5: 98.5, ic4b: 2, mk: 120,
        // MP steam + B-601 boiler
        Psh: U.hdrSP, Pdrum: 11.5, gen: 45.2, stUse: 45.2, useLag: 45.2, zFuel: 80, fuel: 2.4, zAir: 78, air: 46.9, EA: 0.15, O2: 2.8,
        zBfw: 76, bfw: 45.7, Ldr: 50, LdrM: 50, bms: 'FIRING', purgeT: 0,
        // plant / instrument air and nitrogen
        Prec: 7.4, Pia: 7.1, ld701: true, ld702: false, airSup: 6, Ln2: 70, Pn2: U.n2.sp, n2Use: 0.4,
        psv: {},
        // boiler drum (separate from the header through MSV-601), column extras, flare pilots/header, acid, tank farm
        Pb: 11.5, msvF: 45.2, bmsOffT: null, fill5: 0, vent5: 0, colHC: 100, hO2: 0.5, gasOK: true, flareInService: true, pilotLossT: 0,
        unburnT: 0, extVent: 0, Ff: 0.6, Fsp: 0.6, zFf: 30, zSp: 30, acidInv: 55,
        tk: { 'TK-901': { L: 60, P: 1.9, O2: 0 }, 'TK-902': { L: 60, P: 2.5, O2: 0 }, 'TK-903': { L: 40, P: 20, O2: 0.5 },
              'TK-904': { L: 70, P: 20, O2: 0.5 }, 'TK-905': { L: 30, P: 20, O2: 0.5 } },
        truck: { tank: null, amt: 0, state: 'none', eta: 0 },
        // TG-1001 turbine generator (page 8)
        tg: { N: 3000, Nref: 3000, Nsp: 3000, zv: 53, I: 53, Pm: E.tgDesign, Pe: E.tgDesign, Pref: E.tgDesign, Psp: E.tgDesign, Ftg: 13.2, Fej: 0.6,
              Pair: 0.008, Pcond: 0.105, Tcond: 46, Lhw: 50, Fhw: 13.2, vib: 22, latched: true, tripped: false, cbTrip: false, mode: 'LOAD',
              Vg: 11.0, Vsp: 11.0, Q: 0.8, runback: false, evac: 1, rpT: 0, ufT: 0, ofT: 0 },
        // 11 kV electrical system and TNB grid (page 9)
        el: { gridOK: true, fg: 50, Vgrid: 11, f: 50, Vbus: 11, load: 3.3, imp: 1.1, phi: 0, slip: 0, dV: 0, sync: null, ufT: 0, dead: false, restoreAt: null },
        // deaerator, demin, condensate (page 10) and boiler water (page 5)
        da: { L: 60, P: 0.35, T: 108.5, O2: 7, Fpeg: 2.9, Win: 42 },
        dm: { A: { st: 'service', cap: 70, regT: 0 }, B: { st: 'standby', cap: 100, regT: 0 }, L: 70, cond: 0.15, Fprod: 12, prod: true, Fmk: 5, Freg: 0, Breg: 0 },
        cr: { L: 50, cond: 2, oil: 0, Fin: 24, Fout: 24, toDA: 24, toWW: 0 },
        bw: { tds: 950, sludge: 40, cbd: 0.5, ibd: 0, ibdT: 0, feedTDS: 11 },
        zMk: 12, zHw: 44, zCr: 60, zPeg: 48, zCbd: 25, zQ: 5, zTr: 20,
        // blowdown + wastewater treatment (page 11)
        ww: { bdIn: 0.5, Tbd: 40, flash: 0.08, Fq: 2, Leq: 50, Teq: 34, Beq: 0.4, oilEq: 250, Ftr: 6, layer: 40, eff: 0.985, oilS: 4,
              B4: 0.2, ph4: 7.5, T4: 34, oil4: 4, dose: 0, B5: 0.2, ph5: 7.5, T5: 33, oil5: 4, F5: 6, offspec: false, violT: 0 },
      };
      PSVS.forEach(v => { this.x.psv[v.tag] = { open: false, lift: 0, W: 0, lifts: 0, t: 0 }; });
      this.eq = { P101: true, P102: true, P201: true, K301: true, P303A: true, P303B: false, P401: false,
                  xvOpen: true, tripped: false, pshhBypass: false, pilots: [true, true, true],
                  P502: true, P601A: true, P601B: false, K601: true, K701: true, K702: false, k702auto: true, HV801: true, HV802: false, rebTrip: false,
                  MSV601: true, HV403: true, HV404: false, HV502: false, HV503: false, HV504: false,
                  P901: false, P902: false, P903: false, P904: false, P905: false, PCV903: true, PCV904: true, PCV905: true,
                  // power
                  TGEAR: false, J1001A: true, J1001B: false, P1001A: true, P1001B: false, EXC1001: true, CB1101: true, CB1102: true, CB1103: true, uflsArm: true,
                  // water
                  P1206A: true, P1206B: false, P1207: true, P1210: true, XV1208: false, xv1208auto: true, HV607: false,
                  // wastewater
                  P1302A: true, P1302B: false, P1303: true, P1304A: true, P1304B: false, P1306: true, XV1305: true };
      this.fic101 = makeCtrl({ tag: 'FIC-101', sp: P.olefinDesign, op: 50, kc: 0.35, ti: 4, action: -1, spLo: 0, spHi: 200, unit: 'kmol/h' });
      this.fic102 = makeCtrl({ tag: 'FIC-102', sp: P.ic4Design, op: 60, kc: 0.04, ti: 4, action: -1, spLo: 0, spHi: 1600, unit: 'kmol/h' });
      this.tic100 = makeCtrl({ tag: 'TIC-100', sp: P.tempSP, op: 66, kc: 8, ti: 40, action: +1, spLo: 2, spHi: 14, unit: '°C' });
      this.pic301 = makeCtrl({ tag: 'PIC-301', sp: R.psSP, op: 70, kc: 40, ti: 20, action: +1, spLo: 1.5, spHi: 5, unit: 'barg', filt: 1 });
      this.uic301 = makeCtrl({ tag: 'UIC-301', sp: 15, op: 0, kc: 1.5, ti: 4, action: -1, spLo: 8, spHi: 30, unit: '%', filt: 0.5 });
      this.fic402 = makeCtrl({ tag: 'FIC-402', sp: R.steamMin, op: 3, kc: 4, ti: 4, action: -1, spLo: 0, spHi: 16, unit: 't/h', ratioMode: false, ratioSP: 0.4 });
      this.pic103 = makeCtrl({ tag: 'PIC-103', sp: 6.0, op: 45, kc: 30, ti: 150, action: +1, spLo: 3, spHi: 9, unit: 'barg' });
      this.tic501 = makeCtrl({ tag: 'TIC-501', sp: C5.trSP, op: 58, kc: 0.12, ti: 240, action: -1, spLo: 120, spHi: 160, unit: '°C' });
      this.pic502 = makeCtrl({ tag: 'PIC-502', sp: C5.pSP, op: 77, kc: 60, ti: 300, action: +1, spLo: 5, spHi: 8.5, unit: 'barg' });
      this.fic502 = makeCtrl({ tag: 'FIC-502', sp: 1300, op: 50, kc: 0.02, ti: 4, action: -1, spLo: 0, spHi: 2600, unit: 'kmol/h' });
      this.lic502 = makeCtrl({ tag: 'LIC-502', sp: 50, op: 48, kc: 4, ti: 600, action: +1, spLo: 20, spHi: 80, unit: '%' });
      this.lic501 = makeCtrl({ tag: 'LIC-501', sp: 50, op: 20, kc: 10, ti: 600, action: +1, spLo: 20, spHi: 80, unit: '%' });
      this.pic601 = makeCtrl({ tag: 'PIC-601', sp: U.hdrSP, op: 80, kc: 30, ti: 300, action: -1, spLo: 8, spHi: 12, unit: 'barg' });
      this.fic602 = makeCtrl({ tag: 'FIC-602', sp: 46.9, op: 78, kc: 1.5, ti: 4, action: -1, spLo: 0, spHi: 60, unit: 't/h', ratioMode: true, ratioSP: 15 });
      this.lic601 = makeCtrl({ tag: 'LIC-601', sp: 50, op: 76, kc: 6, ti: 600, action: -1, spLo: 30, spHi: 70, unit: '%' });
      this.fic203 = makeCtrl({ tag: 'FIC-203', sp: 0.6, op: 30, kc: 20, ti: 5, action: -1, spLo: 0, spHi: 2, unit: 't/h' });
      this.lic103 = makeCtrl({ tag: 'LIC-103', sp: 55, op: 30, kc: 5, ti: 600, action: +1, spLo: 30, spHi: 80, unit: '%' });
      this.lic1001 = makeCtrl({ tag: 'LIC-1001', sp: 50, op: 44, kc: 4, ti: 200, action: +1, spLo: 20, spHi: 80, unit: '%' });
      this.lic1201 = makeCtrl({ tag: 'LIC-1201', sp: 60, op: 12, kc: 6, ti: 300, action: -1, spLo: 30, spHi: 80, unit: '%' });
      this.pic1201 = makeCtrl({ tag: 'PIC-1201', sp: WT.daSP, op: 48, kc: 300, ti: 100, action: -1, spLo: 0.1, spHi: 1.0, unit: 'barg' });
      this.lic1207 = makeCtrl({ tag: 'LIC-1207', sp: 50, op: 60, kc: 4, ti: 200, action: +1, spLo: 20, spHi: 80, unit: '%' });
      this.fic606 = makeCtrl({ tag: 'FIC-606', sp: WT.cbdSP, op: 25, kc: 20, ti: 5, action: -1, spLo: 0, spHi: 2, unit: 't/h' });
      this.tic1301 = makeCtrl({ tag: 'TIC-1301', sp: 40, op: 5, kc: 2, ti: 20, action: +1, spLo: 30, spHi: 60, unit: '°C' });
      this.lic1302 = makeCtrl({ tag: 'LIC-1302', sp: 50, op: 20, kc: 4, ti: 600, action: +1, spLo: 20, spHi: 80, unit: '%' });
      this.aic1304 = makeCtrl({ tag: 'AIC-1304', sp: 7.5, op: 50, kc: 20, ti: 60, action: -1, spLo: 6, spHi: 9, unit: 'pH' });
      if (this.scenario === 'relief') this.eq.pshhBypass = true;   // handover: PSHH-303 bypassed for calibration
      // ---- starting states per scenario ----
      const sc = this.scenario;
      const COLD = {
        startup: ['reactor'], shutdown: [], plantStop: [],
        plantStart: ['reactor', 'columnCold', 'tgCold', 'boilerCold', 'flareCold', 'waterCold'],
        columnStart: ['reactor', 'columnCold'], columnStop: ['reactor', 'columnHot'],
        boilerStart: ['reactor', 'columnCold', 'tgCold', 'boilerCold', 'daCold'], boilerStop: ['reactor', 'columnCold', 'tgCold'],
        flareStart: ['reactor', 'columnCold', 'flareCold'], flareStop: ['reactor', 'columnCold'],
        tgStart: ['tgCold'],
      }[sc] || [];
      if (COLD.includes('reactor') && !COLD.includes('columnCold') && !COLD.includes('columnHot')) COLD.push('columnHot');
      COLD.forEach(k => this['_init_' + k]());
      if (['plantStart', 'columnStart'].includes(sc)) { this.x.tk['TK-902'].L = 80; this.x.tk['TK-901'].L = 80; }
      if (sc === 'tankDrill') {   // truck already unloading olefin into TK-901
        Object.assign(this.x.truck, { tank: 'TK-901', amt: 20, state: 'connected' });
        this.x.tk['TK-901'].L = 55; this.eq.P901 = true;
      }
      if (sc === 'wwtDrill') Object.assign(this.x.dm.B, { st: 'exhausted', cap: 0 });   // train B waiting for regeneration
      const pd = PROCEDURES[this.scenario];
      this._pdTarget = pd;
      this.proc = pd ? { title: pd.title, target: pd.target, cur: 0, done: null, deviations: [],
                         steps: pd.steps.map(st => Object.assign({}, st, { tDone: null, okSince: null })) } : null;
      this.flt = { capFault: 1, speedLim: 100, cwA: 100, ftFail: false, fvStuck: false, cw5Fail: false, pilotGasFail: false, lt901: null, ejA: false, tubeLeak: false };
      this.fix = {};
      this.m = {};
      this.events = [];
      this.history = [];
      this.alarms = [];
      this.almState = {};
      this.evId = 0;
      this.tOut = 0;
      this.surgeT = 0;
      this.marks = { onset: null, opRise: null, opSat: null, dutyFall: null, firstAlarm: null, firstHelpful: null, trip: null, safeState: null, k301trip: null, psvFirst: null, anyPsv: null, boilerTrip: null, rebTrip: null, tankTrip: null,
                     tgTrip: null, genTrip: null, blackout: null, ufls: null, roughSync: null, resync: null, island: null };
      this.qPre = null;
      this.report = null;

      while (this.t < -PRE_HISTORY) this._tick(DT, false);
      this._measure();
      for (const a of ALARMS) this.almState[a.tag] = { active: false, pending: null };
      this._nextRec = this.t;
      while (this.t < 0 - 1e-9) this._tick(DT, true);
      this.t = 0;
      this._record();
      this._nextRec = 1;
      return this;
    }

    // ---------- starting states (used by the startup / shutdown scenarios) ----------
    _init_reactor() {   // reactor section and K-301 cold, acid settled in D-102
      const Pso = psat(R.Tcw);
      Object.assign(this.x, { Tr: P.ambientT, Tset: P.ambientT, Tpc: P.ambientT, Tref: tsat(Pso), cap: 0, qrxn: 0,
        zFo: 0, zFi: 0, zc: 0, Fo: 0, Fi: 0, Facid: 0, Lset: 85, qcool: 0, load: 0, qmaxNow: 0, k301t: 0, p201t: 0,
        Ps: Pso, Pd: Pso, N: 0, Ndem: 0, Qcap: 0, Qevap: 0, Qavail: 0, W: 0, Ts: P.ambientT, Td: P.ambientT,
        Pr: 6.0, zPV103: 0, Fout: 0, F5: 0, A5: 0, mk: 0, Ff: 0, Fsp: 0, zFf: 0, zSp: 0 });
      Object.assign(this.eq, { P101: false, P102: false, P201: false, K301: false, xvOpen: false });
      Object.assign(this.fic101, { mode: 'MAN', op: 0, sp: 0 });
      Object.assign(this.fic102, { mode: 'MAN', op: 0 });
      Object.assign(this.tic100, { mode: 'MAN', op: 0 });
      Object.assign(this.pic103, { op: 0 });
      Object.assign(this.fic203, { mode: 'MAN', op: 0 });
      Object.assign(this.lic103, { mode: 'MAN', op: 0 });
    }
    _init_columnHot() {   // T-501 on total reflux: boil-up = reflux, no feed, no draws
      Object.assign(this.x, { z501: 33, st501: 11.7, V5: 1300, zD: 0, zB: 0, D5: 0, B5: 0 });
      Object.assign(this.tic501, { op: 33 });
      Object.assign(this.lic502, { op: 0 });
      Object.assign(this.lic501, { op: 0 });
    }
    _init_columnCold() {  // T-501 empty, cold, gas-free under N2
      Object.assign(this.x, { F5: 0, A5: 0, z501: 0, st501: 0, V5: 0, Pc: 0.5, Ttop: 26, zCW5: 0, zL: 0, zD: 0, zB: 0, L5: 0, D5: 0, B5: 0,
        Ld: 0, Lb: 0, Ttray: P.ambientT, ic4b: 0, pur5: 0, colHC: 0, mk: 0 });
      this.eq.P502 = false;
      Object.assign(this.tic501, { mode: 'MAN', op: 0 });
      Object.assign(this.pic502, { mode: 'MAN', op: 0 });
      Object.assign(this.fic502, { mode: 'MAN', op: 0 });
      Object.assign(this.lic502, { mode: 'AUTO', op: 0 });
      Object.assign(this.lic501, { mode: 'AUTO', op: 0 });
    }
    _init_boilerCold() {  // B-601 cold, drum empty, off the header
      Object.assign(this.x, { bms: 'OFF', Ldr: 0, LdrM: 0, Pb: 0, Pdrum: 0, Psh: 0, gen: 0, msvF: 0, zFuel: 0, fuel: 0, zAir: 0, air: 0, bfw: 0, zBfw: 0, stUse: 0, useLag: 0 });
      Object.assign(this.eq, { K601: false, P601A: false, P601B: false, MSV601: false });
      Object.assign(this.pic601, { mode: 'MAN', op: 0 });
      Object.assign(this.lic601, { mode: 'MAN', op: 0 });
      Object.assign(this.fic606, { mode: 'MAN', op: 0 });
      Object.assign(this.x.bw, { tds: 30, sludge: 0, cbd: 0 });
      this.x.zCbd = 0;
    }
    _init_tgCold() {      // TG-1001 on turning gear, condenser at atmospheric pressure, generator breaker open
      Object.assign(this.x.tg, { N: 3, Nref: 0, Nsp: 0, zv: 0, I: 0, Pm: 0, Pe: 0, Pref: 0, Psp: 0, Ftg: 0, Fej: 0, Pair: 0.95, Tcond: 30, Lhw: 30, Fhw: 0,
        vib: 15, latched: false, mode: 'SPEED', Vg: 0 });
      Object.assign(this.eq, { TGEAR: true, J1001A: false, J1001B: false, P1001A: false, P1001B: false, EXC1001: false, CB1102: false });
      Object.assign(this.lic1001, { mode: 'AUTO', op: 0 });
      this.x.zHw = 0;
    }
    _init_daCold() {      // deaerator full of cold demin water, no pegging steam (make-up in service)
      Object.assign(this.x.da, { L: 60, P: 0, T: 30, O2: 900, Fpeg: 0 });
      Object.assign(this.pic1201, { mode: 'MAN', op: 0 });
      this.x.zPeg = 0;
    }
    _init_waterCold() {   // as daCold, and the demin make-up and chemical dosing are not lined up yet
      this._init_daCold();
      this.x.da.L = 55;
      Object.assign(this.eq, { P1206A: false, P1206B: false, P1210: false });
      Object.assign(this.lic1201, { mode: 'MAN', op: 0 });
      this.x.zMk = 0;
    }
    _init_flareCold() {   // flare header full of air, pilots out
      Object.assign(this.eq, { pilots: [false, false, false], HV403: false, HV801: false });
      Object.assign(this.x, { hO2: 21, flareInService: false, purge: 0 });
      Object.assign(this.fic402, { mode: 'MAN', op: 0 });
    }

    // ---------- time stepping ----------
    advance(seconds) {
      if (this.phase !== 'running') return;
      const n = Math.max(1, Math.round(seconds / DT));
      for (let i = 0; i < n && this.phase === 'running'; i++) this._tick(DT, true);
    }

    _tick(dt, live) {
      this.t += dt;
      this._faults();
      this._physics(dt);
      this._measure();
      piStep(this.tic100, this.m.Tr, dt);
      piStep(this.fic101, this.m.Fo, dt);
      piStep(this.fic102, this.m.Fi, dt);
      piStep(this.pic301, this.m.Ps, dt);
      piStep(this.uic301, this.m.SMmeas, dt);
      if (this.uic301.mode === 'AUTO' && this.m.SMmeas < 5) this.uic301.op = Math.max(this.uic301.op, 60);   // fast-open
      if (this.fic402.ratioMode && this.fic402.mode === 'AUTO') this.fic402.sp = clamp(this.fic402.ratioSP * this.x.hc, R.steamMin, 16);
      piStep(this.fic402, this.m.steam, dt);
      piStep(this.pic103, this.m.Pr, dt);
      piStep(this.tic501, this.m.Ttray, dt);
      piStep(this.pic502, this.m.Pc, dt);
      piStep(this.fic502, this.m.L5, dt);
      piStep(this.lic502, this.m.Ld, dt);
      piStep(this.lic501, this.m.Lb, dt);
      piStep(this.pic601, this.m.Psh, dt);
      if (this.fic602.ratioMode && this.fic602.mode === 'AUTO') this.fic602.sp = clamp(this.x.fuel * U.stoich * (1 + this.fic602.ratioSP / 100), 6, U.airMax);
      piStep(this.fic602, this.m.air, dt);
      piStep(this.lic601, this.m.Ldr, dt);
      piStep(this.fic203, this.x.Ff, dt);
      piStep(this.lic103, this.m.Lset, dt);
      const x = this.x;
      piStep(this.lic1001, x.tg.Lhw, dt);
      piStep(this.lic1201, x.da.L, dt);
      piStep(this.pic1201, x.da.P, dt);
      piStep(this.lic1207, x.cr.L, dt);
      piStep(this.fic606, x.bw.cbd, dt);
      piStep(this.tic1301, x.ww.Tbd, dt);
      piStep(this.lic1302, x.ww.Leq, dt);
      piStep(this.aic1304, x.ww.ph4, dt);
      if (this.phase === 'running') {
        this._protection(dt);
        this._limits(dt);
        this._tracking(dt);
        this._procTick();
      }
      if (live) {
        if (this.phase === 'running') this._alarms();
        if (this.t >= this._nextRec - 1e-9) { this._record(); this._nextRec += 1; }
      }
    }

    // hidden drill faults
    _faults() {
      const d = this.drill, f = this.flt;
      if (this.phase !== 'running' || this.t < d.onset) return;
      const since = this.t - d.onset;
      if (this.marks.onset === null) {
        this.marks.onset = this.t;
        this.qPre = this.x.qcool;
        const desc = {
          drill: `K-301 refrigeration capacity falling to ${Math.round(d.finalCap * 100)} % over ${d.ramp} s`,
          suction: { speed: 'K-301 VFD channel A fault - speed limit falling to 50 %', recycle: 'FT-302 anti-surge flow transmitter failed low - UIC-301 opens FV-302',
                     condenser: 'P-303A CW pump degrading - E-301 CW flow falling to 22 %', load: 'FV-101 positioner fault - olefin valve driving open (heat load up)' }[d.kind],
          relief: 'P-303A CW pump tripped; P-303B failed to auto-start. PSHH-303 in bypass.',
        }[this.scenario] || NEW_DRILL[this.scenario].desc;
        this.faultDesc = desc;
        this._log('FAULT', { relief: 'P-303A', colDrill: 'E-502', blrDrill: 'P-601A', flrDrill: 'F-401', tankDrill: 'TK-901', gridDrill: 'CB-1101', tgDrill: 'J-1001A', waterDrill: 'E-501', wwtDrill: 'P-1304A' }[this.scenario] || 'K-301', 'Drill fault initiated: ' + desc, { hidden: true });
        if (this.scenario === 'relief') this.eq.P303A = false;
        if (this.scenario === 'blrDrill') this.eq.P601A = false;            // P-601B does not auto-start
        if (this.scenario === 'tankDrill') f.lt901 = this.x.tk['TK-901'].L;   // LT-901 freezes
        if (this.scenario === 'gridDrill') { this.x.el.gridOK = false; this.x.el.restoreAt = this.t + 240; }
        if (this.scenario === 'tgDrill') f.ejA = true;
        if (this.scenario === 'waterDrill') { f.tubeLeak = true; this.eq.xv1208auto = false; }
        if (this.scenario === 'wwtDrill') {
          this.eq.P1304A = false;
          Object.assign(this.x.dm.B, { st: 'regen', regT: 0 });
          this._log('SYS', 'A-1205B', 'Demin train B regeneration started by the field operator (acid, then caustic waste to TK-1304)');
        }
      }
      if (this.scenario === 'gridDrill' && this.x.el.restoreAt != null && !this.x.el.gridOK && this.t >= this.x.el.restoreAt) {
        this.x.el.gridOK = true;
        this._log('SYS', 'TNB', 'TNB control centre: 33 kV supply restored and stable - permission to resynchronise at CB-1101');
      }
      if (this.scenario === 'drill') f.capFault = 1 - (1 - d.finalCap) * Math.min(1, since / d.ramp);
      if (this.scenario === 'colDrill') f.cw5Fail = true;
      if (this.scenario === 'flrDrill') { f.pilotGasFail = true; this.x.extVent = since >= 120 && since < 240 ? 6 : 0; }
      if (this.scenario === 'suction') {
        if (d.kind === 'speed') f.speedLim = this.fix.chB != null ? Math.min(100, 50 + 50 * (this.t - this.fix.chB) / 15) : 100 - 50 * Math.min(1, since / 15);
        if (d.kind === 'recycle') f.ftFail = true;
        if (d.kind === 'condenser') f.cwA = 100 - 78 * Math.min(1, since / 60);
        if (d.kind === 'load') f.fvStuck = true;
      }
    }

    _physics(dt) {
      const x = this.x, eq = this.eq, f = this.flt;
      x.cap = f.capFault;
      x.k301t = eq.K301 ? x.k301t + dt : 0;
      x.p201t = eq.P201 ? x.p201t + dt : 0;
      const running = this.phase === 'running';

      // ---- plant / instrument air (page 6) ----
      const A = U.air;
      if (!eq.K701) x.ld701 = false; else if (x.Prec < A.load) x.ld701 = true; else if (x.Prec > A.unload) x.ld701 = false;
      if (!eq.K702) x.ld702 = false; else if (x.Prec < A.load) x.ld702 = true; else if (x.Prec > A.unload) x.ld702 = false;
      if (running && eq.k702auto && !eq.K702 && x.Prec < A.stbyStart) {
        eq.K702 = true;
        this._log('SYS', 'K-702', `Standby air compressor K-702 AUTO-STARTED on low receiver pressure (${x.Prec.toFixed(2)} barg)`);
      }
      x.airSup = (x.ld701 ? A.cap : 0) + (x.ld702 ? A.cap : 0);
      const paUse = x.Prec > A.paShut ? A.paUse : 0;                       // PV-702 shuts plant air to protect instrument air
      x.Prec = clamp(x.Prec + (x.airSup - paUse - (x.Pia > 0.3 ? A.iaUse : 0) - x.psv['PSV-701'].W) / A.Crec * dt, 0, 12);
      x.Pia = Math.max(0, x.Prec - 0.3);
      const ia = x.Pia > A.failsafe;
      const fs = (target, failPos) => (ia ? target : failPos);              // valve goes to its fail position without air
      x.iaFail = !ia;

      // ---- nitrogen (page 6) ----
      x.n2Use = (eq.HV801 ? 0.3 : 0) + 0.1 + (eq.HV802 ? 1.0 : 0);
      if (running) x.Ln2 = clamp(x.Ln2 - x.n2Use / U.n2.tank / 3600 * 100 * dt, 0, 100);
      x.Pn2 += ((x.Ln2 > 2 ? U.n2.sp : 0) - x.Pn2) * dt / 10;
      x.purge = eq.HV801 && x.Pn2 > 2 ? 0.3 : 0;

      // ---- pressure safety valves (all pages) ----
      x.Wflare = 0; x.Wliq = 0;
      PSVS.forEach(v => {
        const s = x.psv[v.tag], p = v.p(this);
        if (running) {
          if (!s.open && p >= v.set) {
            s.open = true; s.lifts++;
            if (v.tag === 'PSV-301' && this.marks.psvFirst === null) this.marks.psvFirst = this.t;
            if (this.marks.anyPsv === null) this.marks.anyPsv = this.t;
            this._log('PSV', v.tag, `${v.tag} LIFTED at ${p.toFixed(2)} barg (set ${v.set}) - ${v.desc} relieving to ${v.dest === 'flare' ? 'flare header' : 'atmosphere'}`);
          } else if (s.open && p <= v.reseat) {
            s.open = false;
            this._log('PSV', v.tag, `${v.tag} reseated at ${p.toFixed(2)} barg (reseat ${v.reseat})`);
          }
          if (s.open) s.t += dt;
        }
        s.lift += ((s.open ? 1 : 0) - s.lift) * dt / 0.5;
        s.W = v.k * Math.sqrt(Math.max(0, p - (v.dest === 'flare' ? x.Ph : 0))) * s.lift;
        if (v.dest === 'flare') { x.Wflare += s.W; x.Wliq += s.W * v.liq; }
      });
      const p301 = x.psv['PSV-301'];
      x.psvOpen = p301.open; x.psvLifts = p301.lifts;

      // ---- feed system (feed pumps lose flow against high reactor pressure) ----
      const zFoT = f.fvStuck ? 85 : fs(this.fic101.op, 0);   // FV-101 fail closed; positioner fault drives it open
      x.zFo += (zFoT - x.zFo) * dt / (f.fvStuck ? 12 : 1.5);
      x.zFi += (fs(this.fic102.op, 100) - x.zFi) * dt / 1.5;    // FV-102 fail open (keeps I/O ratio high)
      const pf = Math.sqrt(clamp((11.5 - x.Pr) / 5.5, 0, 1.3));   // pump curve: shut-off head ≈ 11.5 barg
      const FoT = (eq.P101 && eq.xvOpen) ? P.olefinMax * x.zFo / 100 * pf : 0;
      const FiT = eq.P102 ? P.ic4Max * x.zFi / 100 * pf : 0;
      x.Fo += (FoT - x.Fo) * dt / 1.0;
      x.Fi += (FiT - x.Fi) * dt / 1.0;

      // ---- acid loop / reaction ----
      x.Facid += ((eq.P201 ? P.acidFlow : 0) - x.Facid) * dt / 2;
      const acidFrac = x.Facid / P.acidFlow;
      const conv = 0.15 + 0.85 * acidFrac;
      x.qrxn += (P.hRxn * x.Fo * conv * (1 + 0.01 * (x.Tr - 8)) - x.qrxn) * dt / 5;

      // ---- refrigeration loop ----
      x.speedLim = f.speedLim;
      const pic = this.pic301.op;
      x.Ndem = pic < 20 ? R.nMin : R.nMin + (pic - 20) / 80 * (100 - R.nMin);
      const nT = eq.K301 ? Math.min(x.Ndem, f.speedLim) : 0;
      if (eq.K301) x.N += (nT - x.N) * dt / (x.N < R.nMin ? 8 : 4);
      else if (x.kStop === 'ramp') x.N = Math.max(0, x.N - 6 * dt);   // normal stop: VFD ramps speed down (~15 s)
      else x.N += -x.N * dt / 1.8;                                      // trip: drive off, machine coasts down fast
      const picLow = pic < 20 ? (20 - pic) * 5 : 0;              // split range: hot-gas bypass at very low load
      x.zR += (fs(Math.max(this.uic301.op, picLow), 100) - x.zR) * dt / 1.5;   // FV-302 fail open
      const fS = clamp((x.Ps + 1.013) / 4.113, 0.05, 1.6);          // suction density effect
      const r = (x.Pd + 1.013) / (x.Ps + 1.013);                    // compression ratio
      const g = clamp(1 - 2.0 * (r / 3.25 - 1), 0, 1.25);          // head effect: higher ratio, less flow
      const run = eq.K301 && x.N > 1;
      x.Qcap = run ? R.Qdes * (x.N / 100) * fS * g * f.capFault : 0;
      x.Qrec = run ? R.recMax * x.zR / 100 * clamp((x.Pd - x.Ps) / 10, 0, 1.2) : 0;
      x.Qavail = eq.K301 ? Math.max(0, R.Qdes * (f.speedLim / 100) * fS * g * f.capFault - x.Qrec) : 0;
      const Qsurge = 0.35 * R.Qdes * (x.N / 100) * Math.pow(r / 3.25, 1.5);
      x.SM = x.N > 20 ? (x.Qcap / Math.max(0.01, Qsurge) - 1) * 100 : 100;
      x.W = run ? 0.26 * x.Qcap * Math.max(0.3, Math.log(Math.max(1.01, r)) / Math.log(3.25)) : 0;

      x.Tref = tsat(x.Ps);
      const lf = clamp((x.Lacc - 5) / 10, 0, 1);                    // liquid refrigerant available to TV-100 / E-101
      if (x.Fo + x.Fi > 1) x.Tpc += ((P.feedT - P.pcEff * lf * (P.feedT - x.Tref)) - x.Tpc) * dt / 15;
      x.zc += (fs(this.tic100.op, 100) - x.zc) * dt / 2;    // TV-100 fail open (maximum cooling)
      x.qcool = P.UA * x.zc / 100 * Math.max(0, x.Tr - x.Tref) * lf;
      x.qmaxNow = P.UA * Math.max(0, x.Tr - x.Tref) * lf;
      const qpc = P.cpHC * (x.Fo + x.Fi) * Math.max(0, P.feedT - x.Tpc);
      x.Qevap = x.qcool + qpc;
      const Qeq = eq.K301 ? 0 : 0.4 * (x.Pd - x.Ps);                 // settle-out through the stopped machine

      // condenser + accumulator + PSV-301
      x.cw = Math.min(100, (eq.P303A ? f.cwA : 0) + (eq.P303B ? 100 : 0));
      const cwf = 0.25 + 0.75 * Math.pow(x.cw / 100, 0.8);
      const Qcond = R.UAc * cwf * Math.max(0, tsat(x.Pd) - R.Tcw);
      x.Wpsv = p301.W;
      const Qrel = x.Wpsv / 3.6 * R.hvap;
      const Qrel302 = x.psv['PSV-302'].W / 3.6 * R.hvap;
      const Qin = run ? (x.Qcap - x.Qrec) + x.W : 0;
      x.Ps = clamp(x.Ps + (x.Qevap + x.Qrec + Qeq - x.Qcap - Qrel302) / R.Cs * dt, 0.05, 25);
      x.Pd = clamp(x.Pd + (Qin - Qcond - Qrel - Qeq) / R.Cd * dt, 0.05, 25);
      x.Lacc = clamp(x.Lacc - x.Wpsv / R.inv / 3600 * 100 * dt, 0, 100);

      // suction / discharge temperatures
      const Tsuc = x.Tref + 4;
      const a = run && x.Qcap > 0.05 ? Math.min(0.7, 0.8 * x.Qrec / x.Qcap) : 0;
      x.Ts += ((run ? Tsuc + a * Math.max(0, x.Td - Tsuc) : 0.2 * P.ambientT + 0.8 * x.Tref) - x.Ts) * dt / 5;
      x.Td += ((run ? x.Ts + 37 * Math.log(Math.max(1, r)) : tsat(x.Pd)) - x.Td) * dt / 8;
      // D-302 suction drum: carryover when the bundle floods (small ΔT with TV-100 wide open)
      x.Ldrum = clamp(x.Ldrum + (0.15 * Math.max(0, 5 - (x.Tr - x.Tref)) * x.zc / 100 - 0.003 * (x.Ldrum - 10)) * dt, 0, 100);

      // ---- reactor heat balance ----
      const qfeed = P.cpHC * (x.Fo + x.Fi) * (x.Tpc - x.Tr);
      const qacid = P.acidCp * acidFrac * (x.Tset - x.Tr);
      x.load = x.qrxn + qfeed + qacid + P.ambientUA * (P.ambientT - x.Tr);
      x.Tr += (x.load - x.qcool) / P.C * dt;

      // ---- acid settler D-102: fresh acid x3 in (FIC-203 from TK-904), spent acid out (LIC-103 to TK-905) ----
      if (acidFrac > 0.05) x.Tset += ((x.Tr + 0.5) - x.Tset) * dt / 60 * acidFrac;
      else x.Tset += (P.ambientT - x.Tset) * dt / 1500;
      const tk = x.tk;
      x.zFf += (fs(this.fic203.op, 0) - x.zFf) * dt / 2;
      x.Ff = tk['TK-904'].L > 1 ? 2.0 * x.zFf / 100 : 0;
      x.zSp += (fs(this.lic103.op, 0) - x.zSp) * dt / 2;
      x.Fsp = tk['TK-905'].L < 97 ? 2.0 * x.zSp / 100 : 0;
      x.acidInv = clamp(x.acidInv + (x.Ff - x.Fsp) / 40 * 100 / 3600 * dt, 0, 100);      // 40 t acid system
      x.Lset = clamp(x.acidInv + (1 - acidFrac) * 30, 0, 100);                          // acid in R-101 drains to D-102 when P-201 stops
      x.acidStr = clamp(x.acidStr + (x.Ff * (98.5 - x.acidStr) - 0.04 * x.Fo * (1 + 0.3 * Math.max(0, x.Tr - 12))) / 40 / 3600 * dt, 80, 98.5);

      // ---- reactor system pressure (PIC-103 back-pressure valve PV-103 to T-501) ----
      const reacted = Math.max(0, x.qrxn / P.hRxn);                           // kmol/h olefin consumed (2 moles → 1)
      x.zPV103 += (fs(this.pic103.op, 100) - x.zPV103) * dt / 2;              // PV-103 fail open
      x.Fout = 2400 * x.zPV103 / 100 * Math.sqrt(Math.max(0, x.Pr - 1) / 5);
      const rel101 = x.psv['PSV-101'].W / 58 * 1000;
      x.Pr = clamp(x.Pr + (x.Fo + x.Fi - reacted - x.Fout - rel101) / 3600 / 5 * dt, 0.5, 20);

      // ---- T-501 deisobutanizer (page 4) ----
      const c5 = C5;
      x.F5 += (x.Fout - x.F5) * dt / 30;                                      // effluent treating / feed line lag
      x.A5 += (Math.min(reacted, x.Fout) - x.A5) * dt / 30;                   // alkylate in the feed
      x.z501 += ((eq.rebTrip ? 0 : fs(this.tic501.op, 0)) - x.z501) * dt / 3;  // FV-501 fail closed; PSHH-502 trip closes it
      x.st501 = x.Psh > 2 ? c5.steamMax * Math.sqrt(Math.max(0, x.Psh) / U.hdrSP) * x.z501 / 100 : 0;
      x.V5 += ((x.Lb > 2 ? x.st501 / 3.6 * c5.hs * 3600 / c5.lam : 0) - x.V5) * dt / 20;   // boil-up needs liquid in the sump
      x.fill5 = eq.HV503 && tk['TK-902'].L > 2 ? 600 : 0;                     // startup fill from TK-902, kmol/h
      x.Ttop = tsatI(x.Pc);
      x.zCW5 += ((f.cw5Fail ? 0 : fs(this.pic502.op, 100)) - x.zCW5) * dt / (f.cw5Fail ? 25 : 3);   // E-502 CW valve fail open
      const cwEff = Math.max(x.zCW5, eq.HV502 ? 100 : 0);                     // HV-502 bypass around the CW valve
      // condenser can take the boil-up plus the vapour already stored in the column (≈ 60 s to draw it down)
      const cond5 = Math.min(x.V5 + Math.max(0, x.Pc - 1) * c5.Ccol * 60, c5.UAc * cwEff / 100 * Math.max(0, x.Ttop - c5.Tcw) * 3600 / c5.lam);
      const rel501 = x.psv['PSV-501'].W / 58 * 1000;
      x.vent5 = eq.HV504 ? 25 * Math.sqrt(Math.max(0, x.Pc - x.Ph)) : 0;     // HV-504 depressuring to flare, t/h
      const flash = x.V5 < 50 && x.Lb > 5 ? Math.max(0, psatI(P.ambientT) - x.Pc) * c5.Ccol * 120 : 0;   // cold liquid flashes to its vapour pressure
      x.Pc = clamp(x.Pc + (x.V5 + flash + (eq.HV802 ? 36 : 0) - cond5 - rel501 - x.vent5 / 0.058) / 3600 / c5.Ccol * dt, 0, 15);
      if (x.fill5 > 0 || x.Lb > 5) x.colHC += (100 - x.colHC) * dt / 20;     // hydrocarbon in the column vapour space, AI-504
      else if (eq.HV802 && eq.HV504) x.colHC -= x.colHC * dt / 60;
      x.zL += (fs(this.fic502.op, 100) - x.zL) * dt / 2;
      x.zD += (fs(this.lic502.op, 0) - x.zD) * dt / 2;
      x.zB += (fs(this.lic501.op, 0) - x.zB) * dt / 2;
      x.L5 = eq.P502 && x.Ld > 2 ? c5.refMax * x.zL / 100 : 0;
      x.D5 = eq.P502 && x.Ld > 2 ? c5.dMax * x.zD / 100 : 0;
      x.B5 = x.Lb > 2 && tk['TK-903'].L < 97 ? c5.bMax * x.zB / 100 : 0;    // LAHH-903 closes the product inlet
      x.Ld = clamp(x.Ld + (cond5 - x.L5 - x.D5) / c5.Md / 3600 * 100 * dt, 0, 100);
      x.Lb = clamp(x.Lb + (x.F5 + x.fill5 + x.L5 - x.V5 - x.B5) / c5.Mb / 3600 * 100 * dt, 0, 100);
      const light = Math.max(0, x.F5 - x.A5);
      x.ex5 = (x.D5 - light) / Math.max(200, x.F5);                          // >0 heavies go overhead, <0 lights go to bottoms
      const heat = clamp(x.V5 / 800, 0, 1);                                  // a cold column sits at ambient
      const Tsplit = clamp(c5.trSP + 120 * x.ex5 + 12 * (x.Pc - c5.pSP), 60, 185);
      x.Ttray += ((P.ambientT + (Tsplit - P.ambientT) * heat) - x.Ttray) * dt / 45;
      const pur = clamp(98.5 - 200 * Math.max(0, x.ex5) - 8 * Math.max(0, 1.1 - x.L5 / Math.max(1, x.D5)), 60, 99.5);
      const ic4b = clamp(2 + 150 * Math.max(0, -x.ex5) + (x.V5 < 100 && x.F5 > 50 ? 30 : 0), 0.5, 60);
      x.pur5 += (pur - x.pur5) * dt / 60;
      x.ic4b += (ic4b - x.ic4b) * dt / 60;
      x.mk = Math.max(0, x.Fi - x.D5);                                        // fresh isobutane make-up FI-105

      // ---- MP steam header + B-601 water-tube boiler (page 5) ----
      x.zS += (fs(this.fic402.op, 100) - x.zS) * dt / 2;                      // FV-402 flare steam fail open
      x.steam = 16 * Math.sqrt(Math.max(0, x.Psh) / U.hdrSP) * x.zS / 100;
      x.stUse = x.st501 + x.steam + U.other * Math.sqrt(Math.max(0, x.Psh) / U.hdrSP) + x.tg.Ftg + x.tg.Fej + x.da.Fpeg;
      x.useLag += (x.stUse - x.useLag) * dt / 20;
      x.zAir += (fs(this.fic602.op, 100) - x.zAir) * dt / 3;                  // air damper fail open
      x.air = eq.K601 ? U.airMax * x.zAir / 100 : 0;
      const firing = x.bms === 'FIRING';
      const airLimPct = x.air / U.stoich / U.fuelMax * 100;                   // cross-limit: fuel never exceeds the air
      x.zFuel += ((firing ? Math.min(fs(this.pic601.op, 0), airLimPct) : 0) - x.zFuel) * dt / 2;   // fuel valve fail closed
      x.fuel = U.fuelMax * x.zFuel / 100;
      x.EA = x.fuel > 0.02 ? x.air / (U.stoich * x.fuel) - 1 : 9;
      x.O2 = x.fuel > 0.02 ? clamp(21 * x.EA / (1 + x.EA), 0, 21) : (x.air > 1 ? 21 : 0);
      const Qfire = Math.min(x.fuel, x.air / U.stoich) * U.fuelLHV / 3.6;      // MW
      x.gen += (Qfire * U.eff / U.hgen * 3.6 - x.gen) * dt / 30;              // t/h steam
      // drum (boiler side) and header are separate volumes joined by main steam valve MSV-601
      const vent = x.psv['PSV-601'].W;
      x.msvF = eq.MSV601 ? 45 * Math.sqrt(Math.max(0, x.Pb - x.Psh)) : 0;
      x.Pb = clamp(x.Pb + (x.gen - x.msvF - vent - (firing ? 0 : 0.6 * x.Pb)) / 300 * dt, 0, 16);   // cools when not firing
      x.Pdrum = x.Pb;
      x.Psh = clamp(x.Psh + (x.msvF - x.stUse) / U.Ch * dt, 0, 16);
      x.zBfw += (fs(this.lic601.op, 100) - x.zBfw) * dt / 3;                  // feedwater valve fail open
      x.bfw = (eq.P601A || eq.P601B) && x.da.L > 3 ? 60 * x.zBfw / 100 : 0;   // BFW pumps take suction from deaerator D-1201
      x.Ldr = clamp(x.Ldr + (x.bfw - x.gen - vent - x.bw.cbd - x.bw.ibd) / 10 / 3600 * 100 * dt, 0, 100);
      x.LdrM = clamp(x.Ldr + 0.6 * (x.stUse - x.useLag), 0, 100);            // swell / shrink on load changes
      if (x.bms === 'PURGING' && running) {
        if (!eq.K601) { x.bms = 'TRIPPED'; x.purgeT = 0; this._log('SYS', 'B-601', 'B-601 purge ABORTED - FD fan K-601 stopped (no purge air)'); }
        else if (x.zAir >= 30) {   // purge time only counts with enough air flow through the furnace
          x.purgeT += dt;
          if (x.purgeT >= U.purgeT) { x.bms = 'READY'; this._log('SYS', 'B-601', 'B-601 furnace purge complete (5 volume changes) - light-off permitted'); }
        }
      }

      // ---- flare system: pilots, pilot gas, header oxygen ----
      x.gasOK = (eq.HV403 && !f.pilotGasFail) || eq.HV404;
      x.flareInService = eq.HV403 || eq.HV404;
      if (!x.gasOK && eq.pilots.some(Boolean)) {
        x.pilotLossT += dt;
        eq.pilots.forEach((on, i) => {
          if (on && x.pilotLossT >= (x.flareInService ? 5 + 15 * i : 2)) {
            eq.pilots[i] = false;
            if (running) this._log(x.flareInService ? 'TRIP' : 'SYS', 'F-401', `Flare pilot ${'ABC'[i]} ${x.flareInService ? 'FLAME OUT - no pilot gas' : 'extinguished (pilot gas closed)'}`);
          }
        });
      } else if (x.gasOK) x.pilotLossT = 0;
      const sweep = x.purge > 0.1 || x.Wflare > 0.5 || x.vent5 > 0.5;
      x.hO2 = clamp(x.hO2 + (sweep ? -x.hO2 / 60 : (21 - x.hO2) / 900) * dt, 0, 21);
      const Wh = x.Wflare + x.vent5 + x.extVent + x.purge;
      x.Ph += ((0.02 + 0.0011 * Wh * Wh) - x.Ph) * dt / 2;
      x.Tfh += ((x.Wflare > 1 ? -15 : 20) - x.Tfh) * dt / 30;            // flashing hydrocarbon chills the header
      const liqOut = eq.P401 && x.Lko > 2 ? R.koPump : 0;
      x.Lko = clamp(x.Lko + (x.Wliq - liqOut) / R.koCap / 3600 * 100 * dt, 0, 100);
      x.hc = (x.Wflare - x.Wliq) + x.vent5 * x.colHC / 100 + x.extVent + (x.Lko > 85 ? 2 : 0);   // N2 is not fuel
      x.Psteam = x.Psh;
      x.ratio = x.steam / Math.max(0.05, x.hc);
      const lit = eq.pilots.some(Boolean);
      x.flame = x.hc >= 0.3 && !lit ? 'unlit'
        : x.hc < 1 ? (x.steam > 3 ? 'oversteamed' : 'idle') : x.ratio < 0.3 ? 'smoky' : x.ratio > 1.5 ? 'oversteamed' : 'smokeless';
      if (x.flame === 'unlit' && running) x.unburnT += dt;

      // ---- tank farm (page 7) ----
      const trk = x.truck;
      if (trk.state === 'arriving' && this.t >= trk.eta) {
        trk.state = 'connected';
        if (running) this._log('SYS', 'TRUCK', `Truck connected at bay U-1: ${TF.tanks[trk.tank].truck} for ${trk.tank} (${trk.amt.toFixed(1)} t on board)`);
      }
      const tq = {};   // truck transfer into each tank, t/h (negative = out of the tank)
      if (trk.state === 'connected' && running) {
        const d = TF.tanks[trk.tank], pk = d.pump.replace('-', '');
        if (eq[pk]) {
          if (d.dir === 'in') {
            if (trk.amt > 0) { tq[trk.tank] = d.rate; trk.amt = Math.max(0, trk.amt - d.rate / 3600 * dt); }
            if (trk.amt <= 0) { eq[pk] = false; if (running) this._log('SYS', d.pump, `Truck empty - ${d.pump} stopped. ${trk.tank} received the load.`); }
          } else {
            const room = trk.amt < TF.truckCap && tk[trk.tank].L > 3;
            if (room) { tq[trk.tank] = -d.rate; trk.amt = Math.min(TF.truckCap, trk.amt + d.rate / 3600 * dt); }
            else { eq[pk] = false; if (running) this._log('SYS', d.pump, `${trk.amt >= TF.truckCap ? 'Truck full' : trk.tank + ' low level'} - ${d.pump} stopped.`); }
          }
        }
      }
      const mw = TF.mw;
      const tin = { 'TK-901': 0, 'TK-902': x.D5 * mw.ic4, 'TK-903': x.B5 * mw.alky, 'TK-904': 0, 'TK-905': x.Fsp };
      const tout = { 'TK-901': x.Fo * mw.ole, 'TK-902': (x.Fi + x.fill5) * mw.ic4, 'TK-903': 0, 'TK-904': x.Ff, 'TK-905': 0 };
      Object.keys(TF.tanks).forEach(k => {
        const d = TF.tanks[k], s = tk[k];
        const relief = d.kind === 'press' ? x.psv['PSV-' + k.slice(3)].W : 0;
        s.net = tin[k] - tout[k] + (tq[k] || 0) - relief;                     // t/h
        const dL = running ? s.net / d.cap / 36 * dt : 0;                       // % this step (inventories frozen before takeover)
        s.L = clamp(s.L + dL, 0, 100);
        if (d.kind === 'press') s.P = d.psat + 1.2 * Math.pow(Math.max(0, s.L - 92), 1.5);   // vapour space compresses near full
        else {   // atmospheric: N2 blanket PCV-90x holds +20 mbarg; PVRV vents at +50, admits air at -5 mbarg
          s.n2 = eq['PCV' + k.slice(3)] && x.Pn2 > 2 ? clamp(5 * (20 - s.P), 0, 30) : 0;
          s.P += (400 * dL / dt + s.n2) * dt;
          s.vent = s.P > 50; if (s.vent) s.P = 50;
          const vac = s.P < -5;
          if (vac) {
            s.P = -5; s.O2 = clamp(s.O2 + 0.05 * dt, 0, 21);
            if (!s.vac && running) this._log('SYS', 'PVRV-' + k.slice(3), `PVRV-${k.slice(3)} vacuum breaker OPEN - air drawn into ${k} (no N₂ blanket)`);
          }
          s.vac = vac;
          if (s.n2 > 0) s.O2 = Math.max(0, s.O2 - s.O2 * 0.002 * dt);
        }
      });
      this._power(dt, running);
      this._water(dt, running, fs);
      this._wwt(dt, running, fs);
    }

    // ---------- plant electrical load (MW) on the 11 kV bus ----------
    _elecLoad() {
      const e = this.eq, x = this.x;
      let p = 0.35;                                   // essential: lighting, DCS / UPS, HVAC, cooling-tower fans
      if (e.CB1103) p += 0.40;                        // non-essential feeder: offices, workshop, warehouse
      if (e.K301) p += Math.max(0.05, x.W) / 0.95;    // K-301 VFD motor
      for (const k in MOTOR_MW) if (e[k]) p += MOTOR_MW[k];
      if (e.K701) p += x.ld701 ? 0.30 : 0.10;
      if (e.K702) p += x.ld702 ? 0.30 : 0.10;
      return p;
    }

    // ---------- TG-1001 steam turbine generator + 11 kV system + TNB grid (pages 8-9) ----------
    _power(dt, running) {
      const x = this.x, eq = this.eq, g = x.tg, el = x.el, K = E.nNom / (2 * E.H * E.S);   // rpm/s per MW imbalance
      el.fg = el.gridOK ? 50 + 0.025 * Math.sin(this.t / 41) + 0.012 * Math.sin(this.t / 9.3) : 0;
      el.Vgrid = el.gridOK ? 11.0 + 0.04 * Math.sin(this.t / 53) : 0;
      // condenser vacuum: air leaks in, steam-jet ejectors remove it (hogging rate at high pressure)
      const nEj = (eq.J1001A && !this.flt.ejA ? 1 : 0) + (eq.J1001B ? 1 : 0);
      const ejSteam = x.Psh > 5;
      g.Fej = ((eq.J1001A ? 0.3 : 0) + (eq.J1001B ? 0.3 : 0)) * (ejSteam ? 1 : 0);
      const kr = ejSteam ? nEj * (g.Pair > 0.25 ? 0.008 : 0.05) : 0;
      g.Pair = clamp(g.Pair + (0.0004 - kr * g.Pair) * dt, 0.003, 1.013 - psatW(g.Tcond));
      g.Tcond += ((30 + 9 + 7 * g.Ftg / 13.2) - g.Tcond) * dt / 20;
      g.Pcond = g.Pair + psatW(g.Tcond);
      g.evac = clamp(1 - 1.8 * (g.Pcond - 0.1), 0.3, 1.04);
      // hotwell: condensed exhaust steam in, condensate pumps P-1001A/B out (LIC-1001)
      x.zHw += ((this.x.iaFail ? 100 : this.lic1001.op) - x.zHw) * dt / 3;
      g.Fhw = (eq.P1001A || eq.P1001B) && g.Lhw > 2 ? 30 * x.zHw / 100 : 0;
      if (running) g.Lhw = clamp(g.Lhw + (g.Ftg + g.Fej - g.Fhw) / WT.hwCap * 100 / 3600 * dt, 0, 100);
      // which electrical case: grid-connected, island or unsynchronised
      const gridTie = eq.CB1101 && el.gridOK;
      const onGrid = eq.CB1102 && gridTie, island = eq.CB1102 && !gridTie;
      if (onGrid) g.mode = 'LOAD'; else if (island) g.mode = 'DROOP'; else g.mode = 'SPEED';
      // governor
      const pk = Math.sqrt(Math.max(0, x.Psh) / U.hdrSP);
      const Pfull = E.stMax * E.dh * g.evac * Math.max(0.05, pk);   // MW at 100 % valve
      g.runback = g.latched && onGrid && x.Psh < 9.0;   // inlet-pressure limiter (grid mode only; in island frequency has priority)
      const zLim = g.runback ? 100 * clamp((x.Psh - 7.0) / 2.0, 0, 1) : 100;
      let z = 0;
      const Ploss = g.N > 0.5 ? 0.012 + 0.05 * (g.N / 3000) + 0.10 * Math.pow(g.N / 3000, 2) : 0;   // bearings, windage, gland friction
      const brake = g.latched ? 0 : 0.03 + 0.1 * Math.min(1, g.N / 3000);   // coast-down: oil drag and windage with the trip valve shut
      if (g.mode === 'SPEED') {
        const [c0, c1] = E.crit;
        const crossing = (g.Nref >= c0 && g.Nref < c1 && g.Nsp >= c1) || (g.Nref > c0 && g.Nref <= c1 && g.Nsp <= c0);
        const rate = crossing ? E.rampCrit : E.rampN;
        g.Nref += clamp(g.Nsp - g.Nref, -rate * dt, rate * dt);
        const e = g.Nref - g.N;
        g.I = clamp(g.I + 0.03 * e * dt / 6, 0, 100);
        z = clamp(0.03 * e + g.I, 0, 100);
      } else if (g.mode === 'LOAD') {
        g.Pref += clamp(g.Psp - g.Pref, -E.loadRate * dt, E.loadRate * dt);
        const e = g.Pref - g.Pe;
        g.I = clamp(g.I + 8 * e * dt / 4, 0, 100);
        z = clamp(8 * e + g.I, 0, 100);
      } else {   // DROOP (island): power follows frequency, the load reference shifts the droop line
        g.Pref += clamp(g.Psp - g.Pref, -E.loadRate * 4 * dt, E.loadRate * 4 * dt);
        const Pt = g.Pref + (E.nNom - g.N) / (E.droop * E.nNom) * E.S;
        z = clamp(Pt / Pfull * 100, 0, 100);
        g.I = z;
      }
      if (!g.latched) { z = 0; g.I = 0; }
      z = Math.min(z, zLim);
      g.zv += (z - g.zv) * dt / 0.2;
      g.Ftg = g.latched && x.Psh > 1 ? E.stMax * g.zv / 100 * pk : 0;
      g.Pm += (g.Ftg * E.dh * g.evac - g.Pm) * dt / E.chest;
      // generator voltage (AVR)
      const excited = eq.EXC1001 && g.N > 2500;
      g.Vg += ((excited ? g.Vsp * g.N / E.nNom : 0) - g.Vg) * dt / 1.5;
      // rotor and bus
      el.load = this._elecLoad();
      if (onGrid) {
        g.N = el.fg * 60;
        g.Pe = g.Pm - Ploss;
        el.f = el.fg; el.Vbus = el.Vgrid; g.Vg = el.Vgrid;
        g.Q = clamp((g.Vsp - el.Vgrid) * 8, -2, 2.5);
        el.imp = el.load - g.Pe;
      } else if (island) {
        const Pl = el.load * (0.6 + 0.4 * (g.N / E.nNom));      // load falls a little with frequency
        g.N = clamp(g.N + K * (g.Pm - Ploss - Pl) * dt, 0, 3600);
        g.Pe = Pl;
        el.f = g.N / 60; el.Vbus = g.Vg; el.imp = 0;
        g.Q = el.load * 0.45;
      } else {
        const turning = eq.TGEAR && g.N < 5 && g.Pm < 0.005;   // turning gear holds ~3 rpm until steam rolls the rotor
        g.N = turning ? 3 : clamp(g.N + K * (g.Pm - Ploss - (g.N > 0.5 ? brake : 0)) * dt, 0, 3600);
        g.Pe = 0; g.Q = 0;
        el.f = gridTie ? el.fg : 0; el.Vbus = gridTie ? el.Vgrid : 0;
        el.imp = gridTie ? el.load : 0;
      }
      if (eq.TGEAR && g.N > 30) { eq.TGEAR = false; if (running) this._log('SYS', 'TG-1001', 'Turning gear disengaged automatically (rotor speed above 30 rpm)'); }
      // vibration: builds up while running inside the critical speed band
      const inCrit = g.N > E.crit[0] && g.N < E.crit[1];
      g.vib = inCrit ? g.vib + 3 * dt : g.vib + ((15 + 7 * Math.min(1, g.N / 3000) + (g.evac < 0.9 ? 15 : 0)) - g.vib) * dt / 10;
      // synchroscope: which breaker is being synchronised
      let fa = 0, fb = 0, va = 0, vb = 0;
      el.sync = null;
      if (!eq.CB1102 && g.N > 2000 && el.Vbus > 1) { el.sync = 'CB-1102'; fa = g.N / 60; fb = el.f; va = g.Vg; vb = el.Vbus; }
      else if (eq.CB1102 && !eq.CB1101 && el.gridOK && el.Vbus > 1) { el.sync = 'CB-1101'; fa = el.f; fb = el.fg; va = el.Vbus; vb = el.Vgrid; }
      if (el.sync) { el.slip = fa - fb; el.dV = va - vb; el.phi = ((el.phi + 360 * el.slip * dt + 540) % 360) - 180; }
      else { el.slip = 0; el.dV = 0; }
      if (!running) return;
      // ---- protection ----
      if (eq.CB1101 && !el.gridOK) {
        eq.CB1101 = false;
        if (this.marks.island === null && eq.CB1102) this.marks.island = this.t;
        this._log('TRIP', 'CB-1101', eq.CB1102 ? 'CB-1101 TNB incomer TRIPPED - loss of mains (ROCOF / under-voltage). Plant ISLANDED on TG-1001, governor to droop (frequency) control'
          : 'CB-1101 TNB incomer TRIPPED - loss of mains. No generator on the bus');
      }
      if (g.latched) {
        let why = null;
        if (g.N > E.trip) why = `overspeed ${g.N.toFixed(0)} rpm ≥ ${E.trip} rpm`;
        else if (g.vib > 125) why = `shaft vibration ${g.vib.toFixed(0)} µm (VAHH-1001)`;
        else if (g.Pcond > 0.35 && g.N > 1000) why = `low condenser vacuum ${g.Pcond.toFixed(3)} bara (PSHH-1001)`;
        else if (x.Psh < 6 && g.N > 2500) why = `low inlet steam pressure ${x.Psh.toFixed(1)} barg`;
        else if (g.Lhw > 92) why = 'hotwell level high-high (condenser flooding)';
        if (why) this._tgTrip(why);
      }
      if (eq.CB1102) {
        let why = null;
        if (onGrid) { g.rpT = g.Pe < -0.05 ? g.rpT + dt : 0; if (g.rpT > 5) why = `reverse power ${g.Pe.toFixed(2)} MW for 5 s (32G)`; }
        if (island) {
          g.ufT = el.f < E.uf81 ? g.ufT + dt : 0; g.ofT = el.f > E.of81 ? g.ofT + dt : 0;
          if (g.ufT > 2) why = `under-frequency ${el.f.toFixed(2)} Hz (81U)`;
          if (g.ofT > 1) why = `over-frequency ${el.f.toFixed(2)} Hz (81O)`;
        }
        if (!g.latched && g.Pm < 0.05 && onGrid && g.rpT > 0.5) why = 'turbine tripped - reverse power (32G)';
        if (why) this._genTrip(why);
      }
      // under-frequency load shedding stage 1
      el.ufT = eq.uflsArm && eq.CB1103 && el.f > 1 && el.f < E.ufls ? el.ufT + dt : 0;
      if (el.ufT > 0.3) {
        eq.CB1103 = false; el.ufT = 0;
        if (this.marks.ufls === null) this.marks.ufls = this.t;
        this._log('TRIP', 'CB-1103', `UFLS stage 1 (81U at ${E.ufls} Hz): non-essential feeder CB-1103 SHED at ${el.f.toFixed(2)} Hz`);
      }
      // blackout: dead bus stops every motor
      const dead = el.Vbus < 1;
      if (dead && !el.dead) {
        if (this.marks.blackout === null) this.marks.blackout = this.t;
        const stopped = ['K301'].concat(Object.keys(MOTOR_MW), ['K701', 'K702']).filter(k => eq[k]);
        stopped.forEach(k => { eq[k] = false; });
        this.x.kStop = 'trip';
        this.fic101.mode = 'MAN'; this.fic101.op = 0; this.fic102.mode = 'MAN'; this.fic102.op = 0;
        if (x.bms === 'FIRING') this._bmsTrip('FD fan K-601 stopped - plant blackout');
        this._log('TRIP', 'BUS-1101', `PLANT BLACKOUT: 11 kV bus dead - ${stopped.length} motors stopped (K-301, pumps, fans, air compressors). Restore power, then restart equipment.`);
      }
      el.dead = dead;
    }
    _tgTrip(why) {
      const g = this.x.tg;
      g.latched = false; g.tripped = true; g.I = 0;
      if (this.marks.tgTrip === null) this.marks.tgTrip = this.t;
      this._log('TRIP', 'TG-1001', `AUTOMATIC TRIP: TG-1001 steam turbine tripped - ${why}. Trip and throttle valve closed.`);
    }
    _genTrip(why) {
      const g = this.x.tg;
      this.eq.CB1102 = false; g.cbTrip = true; g.rpT = 0; g.ufT = 0; g.ofT = 0;
      g.Nsp = E.nNom; g.Nref = Math.min(g.N, E.nNom); g.I = 5;
      if (this.marks.genTrip === null) this.marks.genTrip = this.t;
      this._log('TRIP', 'CB-1102', `AUTOMATIC TRIP: generator breaker CB-1102 opened - ${why}`);
    }

    // ---------- demin, condensate, deaerator, boiler water chemistry (pages 5, 10) ----------
    _water(dt, running, fs) {
      const x = this.x, eq = this.eq, da = x.da, dm = x.dm, cr = x.cr, bw = x.bw, g = x.tg, f = this.flt;
      // demin trains A/B: run on TK-1204 level (start below 85 %, stop above 92 %)
      dm.prod = dm.L < 85 ? true : dm.L > 92 ? false : dm.prod;
      const svc = ['A', 'B'].filter(k => dm[k].st === 'service');
      dm.Fprod = dm.prod ? svc.length * WT.dmTrain : 0;
      let condT = 0.15; dm.Freg = 0; dm.Breg = 0;
      ['A', 'B'].forEach(k => {
        const tr = dm[k];
        if (tr.st === 'service' && dm.prod && running) tr.cap = Math.max(0, tr.cap - dt / 60);   // ≈ 1 % of resin capacity per minute (accelerated)
        if (tr.st === 'service') condT = Math.max(condT, 0.15 + 30 * Math.pow(Math.max(0, (10 - tr.cap) / 10), 2));
        if (tr.st === 'regen' && running) {
          tr.regT += dt;
          const t = tr.regT;   // backwash, acid, slow rinse, caustic, fast rinse - waste to TK-1304
          const ph = t < 60 ? [6, 0] : t < 260 ? [4, -500] : t < 300 ? [4, -40] : t < 500 ? [4, 350] : [6, 5];
          dm.Freg += ph[0]; dm.Breg += ph[0] * ph[1];
          if (t >= WT.regenT) { tr.st = 'standby'; tr.cap = 100; tr.regT = 0; this._log('SYS', 'A-1205' + k, `Demin train ${k} regeneration complete - in standby`); }
        }
      });
      if (dm.Freg > 0) dm.Breg /= dm.Freg;
      dm.cond += (condT - dm.cond) * dt / 20;
      // demin transfer pumps P-1206A/B → LV-1201 make-up (LIC-1201)
      x.zMk += (fs(this.lic1201.op, 100) - x.zMk) * dt / 3;
      dm.Fmk = (eq.P1206A || eq.P1206B) && dm.L > 2 ? WT.mkMax * x.zMk / 100 : 0;
      if (running) dm.L = clamp(dm.L + (dm.Fprod - dm.Fmk) / WT.dmTank * 100 / 3600 * dt, 0, 100);
      // process condensate: E-501 reboiler + other users' returns → TK-1207 → P-1207 → deaerator (or dump XV-1208)
      cr.Fin = x.st501 + 0.5 * U.other * Math.sqrt(Math.max(0, x.Psh) / U.hdrSP);
      x.zCr += (fs(this.lic1207.op, 100) - x.zCr) * dt / 3;
      cr.Fout = eq.P1207 && cr.L > 2 ? 40 * x.zCr / 100 : 0;
      if (running) cr.L = clamp(cr.L + (cr.Fin - cr.Fout) / WT.recCap * 100 / 3600 * dt, 0, 100);
      const leak = f.tubeLeak && x.st501 > 1;
      cr.cond += ((leak ? 140 : 2) - cr.cond) * dt / 15;
      cr.oil += ((leak ? 60 : 0) - cr.oil) * dt / 15;
      if (eq.xv1208auto && !eq.XV1208 && cr.cond > 30 && running) { eq.XV1208 = true; this._log('SYS', 'XV-1208', `XV-1208 AUTO-DUMP: condensate diverted to wastewater (AI-1208 ${cr.cond.toFixed(0)} µS/cm)`); }
      cr.toDA = eq.XV1208 ? 0 : cr.Fout; cr.toWW = eq.XV1208 ? cr.Fout : 0;
      // deaerator D-1201: energy balance on the stored water, pegging steam PV-1201 from the MP header (PIC-1201)
      x.zPeg += (fs(this.pic1201.op, 0) - x.zPeg) * dt / 2;
      da.Fpeg = x.Psh > 1 ? WT.pegMax * x.zPeg / 100 * Math.sqrt(Math.max(0, x.Psh) / U.hdrSP) : 0;
      const Win = dm.Fmk + g.Fhw + cr.toDA;
      const Tin = Win > 0.1 ? (dm.Fmk * 30 + g.Fhw * g.Tcond + cr.toDA * 95) / Win : da.T;
      const vent = da.T > 100 ? 0.1 : 0;
      da.T = clamp(da.T + (da.Fpeg / 3.6 * 2.2 - Win / 3.6 * 0.00419 * (da.T - Tin) - (da.T - 25) * 0.002) / 50 * dt, 15, 160);
      da.P = Math.max(0, psatW(da.T) - 1.013);
      da.Win = Win;
      da.O2 += ((5 + 900 * clamp((104 - da.T) / 70, 0, 1) + (da.P < 0.15 && da.T > 90 ? 20 : 0)) - da.O2) * dt / 30;
      if (running) da.L = clamp(da.L + (Win + da.Fpeg - x.bfw - vent - (x.psv['PSV-1201'] ? x.psv['PSV-1201'].W : 0)) / WT.daCap * 100 / 3600 * dt, 0, 100);
      // boiler water chemistry: TDS concentrates, CBD (FIC-606) removes it; sludge settles in the mud drum, IBD (HV-607) removes it
      x.zCbd += (fs(this.fic606.op, 0) - x.zCbd) * dt / 2;
      bw.cbd = x.Pb > 1 ? WT.cbdMax * x.zCbd / 100 * Math.sqrt(x.Pb / 11) : 0;
      bw.ibd = eq.HV607 && x.Pb > 0.5 ? WT.ibdFlow * Math.sqrt(x.Pb / 11) : 0;
      if (eq.HV607) bw.ibdT += dt;
      const feedCond = Win > 0.1 ? (dm.Fmk * dm.cond + g.Fhw * 0.3 + cr.toDA * cr.cond) / Win : 1;
      bw.feedTDS = 0.6 * feedCond + (eq.P1210 ? 10 : 0);
      if (x.bfw > 1 && x.Ldr > 5) {
        const Css = bw.feedTDS * x.bfw / Math.max(0.05, bw.cbd + bw.ibd);
        bw.tds += (Css - bw.tds) * dt / WT.tdsTau;
      }
      if (x.bms === 'FIRING' && running) bw.sludge = clamp(bw.sludge + 0.02 * dt * (eq.P1210 ? 1 : 1.5), 0, 100);
      if (bw.ibd > 0) bw.sludge = Math.max(0, bw.sludge - 1.5 * dt * bw.ibd / WT.ibdFlow);
      if (!running) return;
      if ((eq.P601A || eq.P601B) && da.L < 5) {   // LALL-1201 protects the BFW pumps from running dry
        const was = [eq.P601A && 'P-601A', eq.P601B && 'P-601B'].filter(Boolean).join(' / ');
        eq.P601A = false; eq.P601B = false;
        this._log('TRIP', 'LALL-1201', `AUTOMATIC TRIP: deaerator D-1201 level low-low ${da.L.toFixed(0)} % - BFW pump ${was} stopped (no suction)`);
      }
    }

    // ---------- blowdown flash drum + wastewater treatment (page 11) ----------
    _wwt(dt, running, fs) {
      const x = this.x, eq = this.eq, ww = x.ww, bw = x.bw, cr = x.cr, dm = x.dm;
      // D-1301 blowdown flash drum: CBD + IBD (and dumped condensate) flash to atmosphere, liquid quenched by TIC-1301
      const bd = bw.cbd + bw.ibd;
      ww.bdIn = bd + cr.toWW;
      ww.flash = 0.16 * bd + 0.04 * cr.toWW;
      const liq = Math.max(0, ww.bdIn - ww.flash);
      x.zQ += (fs(this.tic1301.op, 100) - x.zQ) * dt / 2;
      ww.Fq = 40 * x.zQ / 100;
      const Tmix = liq + ww.Fq > 0.05 ? (liq * 100 + ww.Fq * 28) / (liq + ww.Fq) : 30;
      ww.Tbd += (Tmix - ww.Tbd) * dt / 5;
      const Fbd = liq + ww.Fq, Bbd = (bd * 0.84 * 2.5 - cr.toWW * 0.96 * 0.3 + ww.Fq * 0.1) / Math.max(0.01, Fbd);
      const oilBd = cr.toWW > 0 ? cr.oil * cr.toWW * 0.96 / Math.max(0.01, Fbd) : 0;
      // inflows to TK-1302 equalisation: oily process water from ALKY-1 (3 t/h) + cooled blowdown
      const Fow = 3, Bow = -0.4, oilOw = 300, Tow = 32;
      const Mq = Math.max(20, ww.Leq / 100 * WT.eqCap);
      x.zTr += (fs(this.lic1302.op, 0) - x.zTr) * dt / 3;
      ww.Ftr = (eq.P1302A || eq.P1302B) && ww.Leq > 2 ? 40 * x.zTr / 100 : 0;
      const Frec = eq.XV1305 ? 0 : ww.F5;     // guard basin recycle when the outfall is closed
      const Fin = Fow + Fbd + Frec;
      const mixIn = (v0, a, b, c) => v0 + ((Fow * a + Fbd * b + Frec * c) - Fin * v0) / Mq / 3600 * dt;
      ww.Beq = mixIn(ww.Beq, Bow, Bbd, ww.B5);
      ww.oilEq = Math.max(0, mixIn(ww.oilEq, oilOw, oilBd, ww.oil5));
      ww.Teq = mixIn(ww.Teq, Tow, ww.Tbd, ww.T5);
      if (running) ww.Leq = clamp(ww.Leq + (Fin - ww.Ftr) / WT.eqCap * 100 / 3600 * dt, 0, 100);
      // S-1303 CPI oil separator with skimmer P-1303
      const Q = ww.Ftr;
      if (running) ww.layer = clamp(ww.layer + (Q * ww.oilEq * 0.00002 - (eq.P1303 ? 0.08 : 0)) * dt, 5, 100);
      ww.eff = clamp(0.985 - 0.01 * Math.max(0, Q - 25) - (ww.layer > 80 ? (ww.layer - 80) * 0.03 : 0), 0.3, 0.985);
      ww.oilS = ww.oilEq * (1 - ww.eff);
      // TK-1304 neutralisation pit: separator outflow + demin regeneration waste, pH control AIC-1304 (split range)
      const op = this.x.iaFail ? 50 : this.aic1304.op;
      const caustic = (eq.P1304A || eq.P1304B) && op > 50 ? (op - 50) / 50 * WT.dosCaustic : 0;
      const acid = eq.P1306 && op < 50 ? -(50 - op) / 50 * WT.dosAcid : 0;
      ww.dose = caustic + acid;
      const F4 = Q + dm.Freg;
      const mix4 = (v0, a, b, d) => v0 + ((Q * a + dm.Freg * b) - F4 * v0 + (d || 0)) / WT.pitV / 3600 * dt;
      ww.B4 = mix4(ww.B4, ww.Beq, dm.Breg, ww.dose);
      ww.oil4 = Math.max(0, mix4(ww.oil4, ww.oilS, 0));
      ww.T4 = mix4(ww.T4, ww.Teq, 30);
      ww.ph4 = phOf(ww.B4);
      // TK-1305 guard basin and final effluent analysers; XV-1305 OPEN = outfall, CLOSED = recycle to TK-1302
      ww.F5 = F4;
      const mix5 = (v0, a) => v0 + (F4 > 0.1 ? (a - v0) * dt / WT.gbTau : 0);
      ww.B5 = mix5(ww.B5, ww.B4); ww.oil5 = Math.max(0, mix5(ww.oil5, ww.oil4)); ww.T5 = mix5(ww.T5, ww.T4);
      ww.ph5 = phOf(ww.B5);
      const L = WT.lim;
      ww.offspec = ww.ph5 < L.phLo || ww.ph5 > L.phHi || ww.oil5 > L.oil || ww.T5 > L.temp;
      if (running && ww.offspec && eq.XV1305 && ww.F5 > 0.5) ww.violT += dt;
    }

    _measure() {
      const x = this.x, n = () => (this.rand() - 0.5) * 2;
      this.m = {
        Tr: x.Tr + n() * 0.02, Fo: Math.max(0, x.Fo + n() * 0.3), Fi: Math.max(0, x.Fi + n() * 2),
        Tpc: x.Tpc + n() * 0.02, Tset: x.Tset + n() * 0.02, Tref: x.Tref + n() * 0.02,
        Facid: Math.max(0, x.Facid + n() * 1), Lset: x.Lset + n() * 0.05, qcool: x.qcool,
        zFo: x.zFo, zFi: x.zFi, zc: x.zc, acidStr: x.acidStr,
        Ps: x.Ps + n() * 0.005, Pd: x.Pd + n() * 0.02, Ts: x.Ts + n() * 0.05, Td: x.Td + n() * 0.1,
        amps: this.eq.K301 ? 210 * x.W + n() * 0.5 : 0, N: x.N + n() * 0.1, cw: x.cw + (x.cw > 0 ? n() * 0.3 : 0),
        SMmeas: this.flt.ftFail ? -4 + n() * 0.5 : x.SM + n() * 0.3,
        Ldrum: x.Ldrum + n() * 0.05, Lacc: x.Lacc + n() * 0.05,
        Ph: Math.max(0, x.Ph + n() * 0.003), Lko: x.Lko + n() * 0.05, steam: Math.max(0, x.steam + n() * 0.02),
      };
      Object.assign(this.m, {
        Pr: x.Pr + n() * 0.01, Pc: x.Pc + n() * 0.005, Ttray: x.Ttray + n() * 0.05, Ld: x.Ld + n() * 0.1, Lb: x.Lb + n() * 0.1,
        L5: Math.max(0, x.L5 + n() * 3), pur5: x.pur5, ic4b: x.ic4b,
        Psh: x.Psh + n() * 0.005, Ldr: x.LdrM + n() * 0.1, O2: x.O2 + n() * 0.03, air: Math.max(0, x.air + n() * 0.1),
        Prec: x.Prec + n() * 0.005, Pia: x.Pia + n() * 0.005, Ln2: x.Ln2, Pn2: x.Pn2 + n() * 0.01,
        L901: this.flt && this.flt.lt901 != null ? this.flt.lt901 : x.tk['TK-901'].L + n() * 0.05,   // LT-901 (can freeze)
        L901B: x.tk['TK-901'].L + n() * 0.05,                                                          // independent radar
      });
      this.m.P301 = this.m.Ps;   // legacy name used by the reactor page
      this.m.io = this.m.Fo > 1 ? this.m.Fi / this.m.Fo : Infinity;
    }

    // ---------- protection, limits, tracking ----------
    _protection(dt) {
      const x = this.x, eq = this.eq;
      if (!eq.tripped && x.Tr >= TRIP_T && (eq.xvOpen || x.Fo > 2)) {
        eq.tripped = true; eq.xvOpen = false;
        this.fic101.mode = 'MAN'; this.fic101.op = 0;
        this.marks.trip = this.t;
        this._log('TRIP', 'TZHH-100', `AUTOMATIC TRIP: reactor temperature ${x.Tr.toFixed(1)} °C ≥ ${TRIP_T} °C. XV-101 closed, FIC-101 forced to MAN 0 %`);
      }
      if (eq.K301) {
        if (!eq.pshhBypass && x.Pd >= R.pshh) this._k301Trip(`PSHH-303 discharge pressure ${x.Pd.toFixed(1)} barg ≥ ${R.pshh} barg`);
        else if (x.Ldrum >= 75) this._k301Trip(`LAHH-302 suction drum level ${x.Ldrum.toFixed(0)} % - liquid to compressor`);
        else {
          this.surgeT = x.SM < 0 && x.N > 20 ? this.surgeT + dt : Math.max(0, this.surgeT - dt * 0.5);
          if (this.surgeT > 8) this._k301Trip('sustained surge - vibration high (XA-302)');
        }
      }
      if (!eq.rebTrip && x.Pc >= 8.6) {   // PSHH-502: cut reboiler steam on high column pressure
        eq.rebTrip = true;
        if (this.marks.rebTrip === null) this.marks.rebTrip = this.t;
        this._log('TRIP', 'PSHH-502', `AUTOMATIC TRIP: T-501 pressure ${x.Pc.toFixed(2)} barg ≥ 8.6 barg - reboiler steam FV-501 closed. Reset on TIC-501 when pressure < 7.5 barg.`);
      }
      // tank farm protections: no suction (LALL) and overfill (LAHH, independent radar) trips
      const tk = x.tk;
      [['TK-901', 'P101', this.fic101, 'P-101 olefin feed'], ['TK-902', 'P102', this.fic102, 'P-102 isobutane feed']].forEach(([k, p, c, what]) => {
        if (eq[p] && tk[k].L < 2) {
          eq[p] = false; c.mode = 'MAN'; c.op = 0;
          this._log('TRIP', 'LALL-' + k.slice(3), `AUTOMATIC TRIP: ${k} empty - ${what} pump stopped (no suction)`);
        }
      });
      ['TK-901', 'TK-902', 'TK-904'].forEach(k => {
        const pk = TF.tanks[k].pump.replace('-', '');
        if (eq[pk] && tk[k].L >= 95) {
          eq[pk] = false;
          if (this.marks.tankTrip === null) this.marks.tankTrip = this.t;
          this._log('TRIP', 'LAHH-' + k.slice(3), `AUTOMATIC TRIP: ${k} level high-high ${tk[k].L.toFixed(0)} % (independent radar) - unloading pump ${TF.tanks[k].pump} stopped`);
        }
      });
      if (x.bms === 'FIRING') {   // B-601 burner management system
        if (x.Pdrum >= U.pshh) this._bmsTrip(`PSHH-601 drum pressure ${x.Pdrum.toFixed(1)} barg`);
        else if (x.LdrM < 15) this._bmsTrip('LALL-601 low drum level (tube overheating risk)');
        else if (x.LdrM > 85) this._bmsTrip('LAHH-601 high drum level (water carryover)');
        else if (!eq.K601 || x.air < 3) this._bmsTrip('combustion air lost (FD fan K-601)');
        else if (x.iaFail) this._bmsTrip('flame failure - fuel valve closed on instrument air failure');
      }
      if (x.flame === 'oversteamed') x.overT += dt;
      if (eq.pilots[1] && x.overT > 45) {
        eq.pilots[1] = false;
        this._log('TRIP', 'F-401', 'Flare pilot B flame failure - thermocouple TI-402B below 200 °C (over-steaming)');
      }
    }

    _bmsTrip(why) {
      this.x.bms = 'TRIPPED'; this.x.purgeT = 0;
      if (this.marks.boilerTrip === null) this.marks.boilerTrip = this.t;
      this._log('TRIP', 'B-601', `AUTOMATIC TRIP: B-601 boiler burners shut off - ${why}. Purge required before relight.`);
    }

    _k301Trip(why) {
      this.eq.K301 = false;
      this.x.kStop = 'trip';
      this.surgeT = 0;
      if (this.marks.k301trip === null) this.marks.k301trip = this.t;
      this._log('TRIP', 'K-301', `AUTOMATIC TRIP: K-301 refrigeration compressor stopped - ${why}`);
    }

    outsideLimits() {
      const x = this.x, r = [];
      const tempApplies = !this.proc || x.Fo > 5;
      if (tempApplies && x.Tr > LIMITS.tHi) r.push('reactor temperature above ' + LIMITS.tHi + ' °C');
      if (tempApplies && x.Tr < LIMITS.tLo) r.push('reactor temperature below ' + LIMITS.tLo + ' °C');
      if (x.Fo > 5 && x.Fi / x.Fo < LIMITS.ioLo) r.push('I/O ratio below ' + LIMITS.ioLo);
      if (x.Fo > 5 && x.Facid < 300) r.push('olefin fed without acid circulation');
      return r;
    }

    _limits(dt) {
      if (this.outsideLimits().length) this.tOut += dt;
      if (this.x.flame === 'smoky') this.x.smokeT += dt;
      if (this.x.psvOpen) this.x.psvT += dt;
    }

    _tracking() {
      const k = this.marks, x = this.x;
      if (k.onset === null) return;
      if (k.opRise === null && this.tic100.op > 75) k.opRise = this.t;
      if (k.opSat === null && this.tic100.op >= 99) k.opSat = this.t;
      if (k.dutyFall === null && this.qPre && x.qcool < this.qPre * 0.95) k.dutyFall = this.t;
      if (k.safeState === null && x.Fo < 2 && x.Fi > 500 && x.Facid > 300 && x.Tr <= LIMITS.tHi) k.safeState = this.t;
      if (k.safeState !== null && !(x.Fo < 2)) k.safeState = null;
    }

    _alarms() {
      for (const a of ALARMS) {
        const st = this.almState[a.tag];
        const enabled = !a.en || a.en(this);
        if (!st.active) {
          if (enabled && a.on(this)) {
            if (a.delay) {
              if (st.pending === null) st.pending = this.t;
              if (this.t - st.pending < a.delay) continue;
            }
            st.active = true; st.pending = null;
            this._raise(a);
          } else st.pending = null;
        } else if (!enabled || a.off(this)) {
          st.active = false;
          this._clear(a);
        }
      }
    }

    _raise(a) {
      let al = this.alarms.find(x => x.tag === a.tag);
      const value = a.val(this);
      if (!al) { al = { id: ++this.evId, tag: a.tag, pri: a.pri, desc: a.desc }; this.alarms.unshift(al); }
      Object.assign(al, { active: true, acked: false, tIn: this.t, value });
      if (this.marks.firstAlarm === null) this.marks.firstAlarm = this.t;
      this._log('ALM', a.tag, `${a.desc} - ${value}`, { pri: a.pri });
    }

    _clear(a) {
      const al = this.alarms.find(x => x.tag === a.tag);
      this._log('RTN', a.tag, `${a.desc} - returned to normal`);
      if (!al) return;
      al.active = false;
      if (al.acked) this.alarms = this.alarms.filter(x => x !== al);
    }

    ack(tag) {
      const al = this.alarms.find(x => x.tag === tag);
      if (!al || al.acked) return;
      al.acked = true;
      this._log('ACK', tag, 'Alarm acknowledged by operator');
      if (!al.active) this.alarms = this.alarms.filter(x => x !== al);
    }

    ackAll() { for (const al of this.alarms.slice()) if (!al.acked) this.ack(al.tag); }

    _record() {
      const x = this.x, m = this.m;
      this.history.push({
        t: Math.round(this.t),
        Tr: m.Tr, Fo: m.Fo, Fi: m.Fi, io: isFinite(m.io) ? m.io : null,
        op: this.tic100.op, zc: x.zc, qcool: x.qcool, qcoolPct: x.qcool / P.designDuty * 100, load: x.load,
        Tpc: m.Tpc, Tref: m.Tref, P301: m.Ps, amps: m.amps, Tset: m.Tset, Facid: m.Facid,
        foSP: this.fic101.sp, ticSP: this.tic100.sp, ticMode: this.tic100.mode, xv: this.eq.xvOpen,
        Ps: m.Ps, Pd: m.Pd, N: m.N, zR: x.zR, Ts: m.Ts, Td: m.Td, cw: m.cw, SM: x.SM, SMmeas: m.SMmeas,
        Qavail: x.Qavail, Qevap: x.Qevap, Ldrum: m.Ldrum, Lacc: m.Lacc, k301: this.eq.K301,
        Pr: m.Pr, Fout: x.Fout, F5: x.F5, Pc: m.Pc, Ttop: x.Ttop, Ttray: m.Ttray, st501: x.st501, L5: x.L5, D5: x.D5, B5: x.B5, V5: x.V5,
        Ld: m.Ld, Lb: m.Lb, pur5: x.pur5, ic4b: x.ic4b, mk: x.mk,
        Psh: m.Psh, Pdrum: x.Pdrum, gen: x.gen, stUse: x.stUse, fuel: x.fuel, air: x.air, O2: m.O2, Ldr: m.Ldr, bfw: x.bfw, bms: x.bms,
        Prec: m.Prec, Pia: m.Pia, ld701: x.ld701 ? 100 : 0, ld702: x.ld702 ? 100 : 0, Ln2: x.Ln2, Pn2: m.Pn2, purge: x.purge,
        Wflare: x.Wflare, psvOpenN: PSVS.filter(v => x.psv[v.tag].open).length,
        Pb: x.Pb, msvF: x.msvF, hO2: x.hO2, pilotsLit: this.eq.pilots.filter(Boolean).length, gasOKn: x.gasOK ? 1 : 0, unlit: x.flame === 'unlit' ? 1 : 0,
        colHC: x.colHC, vent5: x.vent5, fill5: x.fill5, zCW5: x.zCW5, Lset: m.Lset, acidStr: x.acidStr, Ff: x.Ff, Fsp: x.Fsp,
        L901: m.L901, L901B: m.L901B, P901: x.tk['TK-901'].P, L902: x.tk['TK-902'].L, L903: x.tk['TK-903'].L, L904: x.tk['TK-904'].L, L905: x.tk['TK-905'].L,
        P903: x.tk['TK-903'].P, O2903: x.tk['TK-903'].O2, truckAmt: x.truck.amt,
        Wpsv: x.Wpsv, psv: x.psvOpen, Ph: m.Ph, Lko: m.Lko, steam: m.steam, hc: x.hc, ratio: x.hc >= 1 ? Math.min(3, x.ratio) : null, flame: x.flame,
        Ntg: x.tg.N, Pe: x.tg.Pe, Pm: x.tg.Pm, PeSP: x.tg.Pref, Ftg: x.tg.Ftg, Pcond: x.tg.Pcond, Lhw: x.tg.Lhw, vib: x.tg.vib, Vg: x.tg.Vg, tgMode: x.tg.mode,
        fbus: x.el.f, fgrid: x.el.fg, Vbus: x.el.Vbus, imp: x.el.imp, eload: x.el.load, slip: x.el.slip, phi: x.el.phi,
        cb1101: this.eq.CB1101 ? 1 : 0, cb1102: this.eq.CB1102 ? 1 : 0, cb1103: this.eq.CB1103 ? 1 : 0, gridOK: x.el.gridOK ? 1 : 0,
        daL: x.da.L, daLf: x.da.L / 100, dmCond10: x.dm.cond * 10, outfall100: this.eq.XV1305 ? 100 : 0, daP: x.da.P, daT: x.da.T, daO2: x.da.O2, Fpeg: x.da.Fpeg, Fmk: x.dm.Fmk, dmL: x.dm.L, dmCond: x.dm.cond, dmProd: x.dm.Fprod,
        crL: x.cr.L, crCond: x.cr.cond, crOil: x.cr.oil, crDump: x.cr.toWW, tds: x.bw.tds, sludge: x.bw.sludge, cbd: x.bw.cbd, ibd: x.bw.ibd,
        Tbd: x.ww.Tbd, Leq: x.ww.Leq, ph4: x.ww.ph4, ph5: x.ww.ph5, oil5: x.ww.oil5, T5: x.ww.T5, dose: x.ww.dose, layer: x.ww.layer, violT: x.ww.violT, outfall: this.eq.XV1305 ? 1 : 0,
      });
    }

    _log(kind, tag, msg, extra) {
      const ev = Object.assign({ id: ++this.evId, t: this.t, kind, tag, msg }, extra || {});
      this.events.push(ev);
      return ev;
    }

    // ---------- operator commands ----------
    _faultActive() { return this.marks.onset !== null; }

    _action(tag, msg, cls, reason, key) {
      if (this.phase !== 'running') return null;
      if (!DRILLS.includes(this.scenario)) { cls = 'neutral'; reason = ''; }
      if (cls === 'helpful' && this.marks.firstHelpful === null) this.marks.firstHelpful = this.t;
      const ev = this._log('OPR', tag, msg, { assess: cls, reason, key });
      if (this.proc && key) this._seqCheck(ev);
      return ev;
    }

    // Grades one operator action in a drill. Returns [class, reason].
    _judge(key, from, to) {
      if (!DRILLS.includes(this.scenario)) return ['neutral', ''];
      if (!this._faultActive()) return ['unnecessary', 'Unit was stable and within limits; no intervention was required before the upset.'];
      const sc = this.scenario, kind = this.drill.kind, down = to < from, x = this.x;
      const sat = this.tic100.op > 95;
      switch (key) {
        case 'FIC-101:sp': case 'FIC-101:op':
          return down ? ['helpful', 'Cutting olefin feed reduces reaction heat to match the available refrigeration.']
                      : ['unnecessary', 'Raising olefin feed adds reaction heat while cooling is short.'];
        case 'XV-101:close': case 'P-101:stop':
          return ['helpful', 'Stopping olefin feed removes the reaction heat source (safe state).'];
        case 'FIC-102:sp': case 'FIC-102:op':
          return down ? ['unnecessary', 'Cutting isobutane lowers the I/O ratio and does not address the cooling shortfall.']
                      : ['neutral', 'More isobutane raises the I/O ratio; small extra sensible load.'];
        case 'P-102:stop': return ['unnecessary', 'Stopping isobutane collapses the I/O ratio; keep isobutane circulating.'];
        case 'P-201:stop': return ['unnecessary', 'Stopping acid circulation; keep acid circulating in hot standby.'];
        case 'TIC-100:sp':
          if (down) return sat ? ['unnecessary', 'TIC-100 was already at 100 % output; a lower setpoint cannot add cooling.'] : ['neutral', 'Lower setpoint asks for more cooling; little effect once the valve is wide open.'];
          return to > LIMITS.tHi ? ['unnecessary', `Setpoint above the ${LIMITS.tHi} °C training limit masks the problem.`] : ['neutral', 'Raising the setpoint within limits does not remove the heat imbalance.'];
        case 'TIC-100:MAN': return ['unnecessary', 'TIC-100 was working correctly (output at max); manual mode adds no cooling.'];
        case 'TIC-100:op': return down ? ['unnecessary', 'Reducing cooling valve output during a cooling shortfall makes it worse.'] : ['neutral', 'Manual output increase; valve was already near fully open.'];
        case 'K-301:stop':
          return x.Fo < 2 ? ['neutral', 'K-301 stopped with olefin already out.'] : ['unnecessary', 'Stopping K-301 removes all refrigeration from a reactor in service.'];
        case 'K-301:chB':
          return sc === 'suction' && kind === 'speed' ? ['helpful', 'Changing over to drive channel B removes the speed limit (the root cause).'] : ['unnecessary', 'The drive was healthy - speed was not limited.'];
        case 'UIC-301:MAN':
          return sc === 'suction' && kind === 'recycle' ? ['helpful', 'Taking UIC-301 out of AUTO stops the failed FT-302 signal holding FV-302 open.'] : ['unnecessary', 'UIC-301 was protecting K-301 correctly; manual removes surge protection.'];
        case 'UIC-301:op':
          return sc === 'suction' && kind === 'recycle' && down ? ['helpful', 'Closing FV-302 returns recycle capacity to the evaporators.'] : ['unnecessary', 'Manual recycle changes outside a recycle fault risk surge or waste capacity.'];
        case 'UIC-301:AUTO':
          return sc === 'suction' && kind === 'recycle' ? ['unnecessary', 'Returning UIC-301 to AUTO with FT-302 still failed re-opens FV-302.'] : ['neutral', ''];
        case 'P-303B:start':
          return (sc === 'suction' && kind === 'condenser') || sc === 'relief' ? ['helpful', 'Standby CW pump restores E-301 cooling and brings discharge pressure down (the root cause).'] : ['neutral', 'Extra CW flow; harmless but does not address this fault.'];
        case 'HV-502:open': return sc === 'colDrill' ? ['helpful', 'CW bypass HV-502 restores condenser cooling around the failed valve (the root cause).'] : ['neutral', ''];
        case 'PIC-502:MAN': case 'PIC-502:op': case 'PIC-502:sp':
          return sc === 'colDrill' ? ['unnecessary', 'The CW valve positioner has failed - PIC-502 changes cannot move it.'] : ['neutral', ''];
        case 'TIC-501:op': case 'TIC-501:sp':
          return sc === 'colDrill' && down ? ['helpful', 'Less reboiler steam means less vapour for the starved condenser.'] : ['neutral', ''];
        case 'P-601B:start': return sc === 'blrDrill' ? ['helpful', 'Standby BFW pump restores feedwater (the root cause).'] : ['neutral', ''];
        case 'LIC-601:MAN': case 'LIC-601:op': case 'LIC-601:sp':
          return sc === 'blrDrill' ? ['unnecessary', 'The feedwater valve is not the problem - no pump is running.'] : ['neutral', ''];
        case 'PIC-601:op': case 'PIC-601:MAN':
          return sc === 'blrDrill' ? (down || key.endsWith('MAN') ? ['helpful', 'Lower firing slows the fall in drum level.'] : ['unnecessary', 'More firing boils the drum dry faster.']) : ['neutral', ''];
        case 'HV-404:open': return sc === 'flrDrill' ? ['helpful', 'Backup pilot gas restores fuel to the pilots.'] : ['neutral', ''];
        case 'P-901:stop': return sc === 'tankDrill' ? ['helpful', 'Stopping the unloading pump prevents the overfill.'] : ['neutral', ''];
        case 'SIC-1001:load':
          if (sc === 'gridDrill') return x.el.gridOK || this.eq.CB1101 ? ['neutral', ''] : (!down ? ['helpful', 'Raising the island load reference brings the frequency back toward 50 Hz.'] : ['unnecessary', 'Lowering the load reference in the island drives the frequency down further.']);
          if (sc === 'tgDrill') return down ? ['helpful', 'Unloading the turbine reduces exhaust steam to the failing condenser.'] : ['unnecessary', 'More steam to a condenser that is losing vacuum.'];
          return ['neutral', ''];
        case 'CB-1103:open': return sc === 'gridDrill' && !this.eq.CB1101 ? ['helpful', 'Shedding the non-essential feeder relieves the islanded generator.'] : ['unnecessary', 'Shedding load is not needed with the grid connected.'];
        case 'CB-1101:close': return sc === 'gridDrill' ? ['helpful', 'Resynchronising to the restored TNB grid ends the island.'] : ['neutral', ''];
        case 'CB-1102:open': return sc === 'gridDrill' ? ['unnecessary', 'Opening the generator breaker in the island blacks out the plant.'] : ['neutral', ''];
        case 'TG-1001:trip': return ['gridDrill', 'tgDrill'].includes(sc) ? ['unnecessary', 'Tripping the turbine loses the generation the plant needs.'] : ['neutral', ''];
        case 'J-1001B:start': return sc === 'tgDrill' ? ['helpful', 'The standby air ejector restores condenser vacuum (the root cause).'] : ['neutral', ''];
        case 'J-1001A:stop': return ['neutral', ''];
        case 'P-1001B:start': return sc === 'tgDrill' ? ['unnecessary', 'Hotwell level was normal - the condensate pumps were not the problem.'] : ['neutral', ''];
        case 'XV-1208:open': return sc === 'waterDrill' ? ['helpful', 'Dumping the contaminated condensate keeps it out of the deaerator and boiler.'] : ['unnecessary', 'Dumping clean condensate wastes treated water and heat.'];
        case 'FIC-606:sp': case 'FIC-606:op':
          return sc === 'waterDrill' && !down ? ['helpful', 'More continuous blowdown removes dissolved solids from the boiler water.'] : ['neutral', ''];
        case 'P-1304B:start': return sc === 'wwtDrill' ? ['helpful', 'The standby caustic dosing pump restores pH control (the root cause).'] : ['neutral', ''];
        case 'P-1304A:start': return sc === 'wwtDrill' ? ['neutral', 'P-1304A restarted (it may trip again - check why it stopped).'] : ['neutral', ''];
        case 'XV-1305:close': return sc === 'wwtDrill' ? ['helpful', 'Recycling the final effluent stops off-spec water reaching the outfall.'] : ['neutral', ''];
        case 'AIC-1304:sp': case 'AIC-1304:MAN': case 'AIC-1304:op':
          return sc === 'wwtDrill' ? ['unnecessary', 'AIC-1304 was already calling for full caustic - no pump was running to deliver it.'] : ['neutral', ''];
        case 'PIC-301:sp':
          return ['neutral', 'Changing the suction pressure setpoint moves the evaporating temperature but does not add compressor capacity.'];
        case 'FIC-402:sp': case 'FIC-402:op': case 'FIC-402:RATIO':
          if (sc !== 'relief') return ['neutral', ''];
          if (key === 'FIC-402:RATIO') return ['helpful', 'Ratio control keeps assist steam in step with relief flow (smokeless burning).'];
          return !down ? (x.flame === 'oversteamed' ? ['unnecessary', 'More steam on an over-steamed flare.'] : ['helpful', 'More assist steam during relief suppresses smoke.'])
                       : (x.flame === 'smoky' ? ['unnecessary', 'Cutting steam while the flare is smoking.'] : ['neutral', 'Trimming steam to avoid over-steaming.']);
        case 'P-401:start': return sc === 'relief' ? ['helpful', 'Pumping out D-401 prevents liquid carryover to the flare tip.'] : ['neutral', ''];
        case 'F-401:relight': return ['helpful', 'Relighting the pilot restores ignition reliability.'];
        case 'PSHH-303:remove': return ['neutral', 'Removing the bypass lets PSHH-303 trip K-301: relief stops, but all refrigeration is lost.'];
        default: return ['neutral', ''];
      }
    }

    // ---------- procedure engine ----------
    _ownsKey(step, key) {
      return (step.keys || []).some(k => k === key || (k.endsWith(':*') && key.startsWith(k.slice(0, -1))));
    }
    _seqCheck(ev) {
      const p = this.proc;
      if (p.done != null) return;
      this._procTick();
      if (p.done != null) return;
      const owners = p.steps.map((st, i) => (this._ownsKey(st, ev.key) ? i : -1)).filter(i => i >= 0);
      if (!owners.length || owners.some(i => i <= p.cur)) return;
      const i = owners[0];
      ev.assess = 'out of sequence';
      ev.reason = `Belongs to step ${i + 1} (${p.steps[i].title}); step ${p.cur + 1} (${p.steps[p.cur].title}) was not complete.`;
      this._deviation(`${ev.msg} - out of sequence: ${ev.reason}`);
    }
    _deviation(msg) {
      if (!this.proc) return;
      this.proc.deviations.push({ t: this.t, msg });
      this._log('DEV', 'PROC', msg);
    }
    _procTick() {
      const p = this.proc;
      if (!p || p.done != null) return;
      const st = p.steps[p.cur];
      if (!st || st.type === 'check') return;
      if (st.done(this, p.cur)) {
        if (st.okSince == null) st.okSince = this.t;
        if (this.t - st.okSince >= (st.hold || 0)) this._completeStep(p.cur);
      } else st.okSince = null;
    }
    _completeStep(i) {
      const p = this.proc, st = p.steps[i];
      st.tDone = this.t;
      this._log('PROC', `STEP ${i + 1}`, `Procedure step ${i + 1} complete: ${st.title}`);
      p.cur = i + 1;
      if (p.cur >= p.steps.length) {
        p.done = this.t;
        this._log('PROC', 'PROC', `${this.scenario === 'startup' ? 'Startup' : 'Shutdown'} procedure complete`);
      }
    }
    confirmStep(i) {
      const p = this.proc;
      if (!p || this.phase !== 'running' || i !== p.cur || p.steps[i].type !== 'check') return { ok: false };
      this._completeStep(i);
      return { ok: true };
    }

    _ctrl(tag) {
      return { 'TIC-100': this.tic100, 'FIC-101': this.fic101, 'FIC-102': this.fic102, 'PIC-301': this.pic301, 'UIC-301': this.uic301, 'FIC-402': this.fic402,
               'PIC-103': this.pic103, 'TIC-501': this.tic501, 'PIC-502': this.pic502, 'FIC-502': this.fic502, 'LIC-502': this.lic502, 'LIC-501': this.lic501,
               'PIC-601': this.pic601, 'FIC-602': this.fic602, 'LIC-601': this.lic601, 'FIC-203': this.fic203, 'LIC-103': this.lic103,
               'LIC-1001': this.lic1001, 'LIC-1201': this.lic1201, 'PIC-1201': this.pic1201, 'LIC-1207': this.lic1207, 'FIC-606': this.fic606,
               'TIC-1301': this.tic1301, 'LIC-1302': this.lic1302, 'AIC-1304': this.aic1304 }[tag];
    }

    setSP(tag, v) {
      const c = this._ctrl(tag);
      if (!c || !isFinite(v)) return { ok: false, msg: 'Invalid setpoint' };
      if (c.ratioMode) return { ok: false, msg: `${tag} is in RATIO - change the ratio instead` };
      v = clamp(v, c.spLo, c.spHi);
      const from = c.sp;
      if (Math.abs(v - from) < 1e-6) return { ok: false, msg: 'No change' };
      c.sp = v;
      const dec = c.unit === 'kmol/h' ? 0 : c.unit === 'barg' ? 2 : 1;
      const [cls, why] = this._judge(`${tag}:sp`, from, v);
      this._mergeOrAct(tag, 'sp', from, v, dec, c.unit, 'SP changed', cls, why);
      if (this.proc && this.phase === 'running' && tag === 'FIC-101' && Math.abs(v - from) > 40 + 1e-6) {
        this._deviation(`FIC-101 SP changed by ${Math.abs(v - from).toFixed(0)} kmol/h in one move (procedure limit: 40 kmol/h per step)`);
      }
      return { ok: true };
    }

    setMode(tag, mode) {
      const c = this._ctrl(tag);
      if (!c || c.mode === mode) return { ok: false };
      if (tag === 'FIC-101' && mode === 'AUTO' && !this.eq.xvOpen) return { ok: false, msg: 'XV-101 is closed - open it before returning FIC-101 to AUTO' };
      if (tag === 'FIC-101' && mode === 'AUTO' && !this.eq.P101) return { ok: false, msg: 'P-101 is stopped - start it before returning FIC-101 to AUTO' };
      if (tag === 'FIC-102' && mode === 'AUTO' && !this.eq.P102) return { ok: false, msg: 'P-102 is stopped - start it before returning FIC-102 to AUTO' };
      c.mode = mode;
      if (mode === 'MAN') c.ratioMode = false;
      if (mode === 'AUTO') c.lastE = c.action * (c.pvf - c.sp);
      const [cls, why] = this._judge(`${tag}:${mode}`, 0, 0);
      this._action(tag, `${tag} mode changed to ${mode}`, cls, why, `${tag}:${mode}`);
      return { ok: true };
    }

    setOP(tag, v) {
      const c = this._ctrl(tag);
      if (!c || c.mode !== 'MAN' || !isFinite(v)) return { ok: false, msg: 'Output can only be set in MAN' };
      v = clamp(v, 0, 100);
      const from = c.op;
      if (Math.abs(v - from) < 1e-6) return { ok: false };
      c.op = v;
      const [cls, why] = this._judge(`${tag}:op`, from, v);
      this._mergeOrAct(tag, 'op', from, v, 0, '%', 'OP (manual)', cls, why);
      return { ok: true };
    }

    // FIC-402: switch assist steam between flow control and steam/hydrocarbon ratio control
    setRatio(on, ratio, tag) {
      if (tag === 'FIC-602') {   // combustion air: ratio = excess air %
        const a = this.fic602;
        if (ratio != null && isFinite(ratio)) a.ratioSP = clamp(ratio, 0, 60);
        const was = a.ratioMode;
        a.ratioMode = !!on;
        if (on) { a.mode = 'AUTO'; a.lastE = a.action * (a.pvf - a.sp); }
        this._action('FIC-602', on && !was ? `FIC-602 combustion air to RATIO (excess air ${a.ratioSP.toFixed(0)} %)` : !on && was ? 'FIC-602 ratio off (flow control)' : `FIC-602 excess air set to ${a.ratioSP.toFixed(0)} %`, 'neutral', '', 'FIC-602:ratio');
        return { ok: true };
      }
      const c = this.fic402;
      if (ratio != null && isFinite(ratio)) c.ratioSP = clamp(ratio, 0.1, 2);
      if (on === c.ratioMode && ratio == null) return { ok: false };
      const was = c.ratioMode;
      c.ratioMode = !!on;
      if (on) { c.mode = 'AUTO'; c.lastE = c.action * (c.pvf - c.sp); }
      if (on && !was) {
        const [cls, why] = this._judge('FIC-402:RATIO', 0, 1);
        this._action('FIC-402', `FIC-402 assist steam to RATIO control (steam/HC ${c.ratioSP.toFixed(2)})`, cls, why, 'FIC-402:RATIO');
      } else if (!on && was) this._action('FIC-402', 'FIC-402 ratio control off (flow control)', 'neutral', '', 'FIC-402:AUTO');
      else if (ratio != null) this._action('FIC-402', `FIC-402 steam/HC ratio set to ${c.ratioSP.toFixed(2)}`, 'neutral', '', 'FIC-402:ratio');
      return { ok: true };
    }

    // Consecutive raise/lower presses on the same tag within 5 s count as one operator action.
    _mergeOrAct(tag, sub, from, to, dec, unit, verb, cls, why) {
      const last = this._lastOpr;
      if (last && last.tag === tag && last.sub === sub && last.assess === cls && this.t - last.tLast < 5 && this.events.includes(last)) {
        last.msg = `${tag} ${verb} ${last.from.toFixed(dec)} → ${to.toFixed(dec)} ${unit}`;
        last.tLast = this.t;
        return last;
      }
      const ev = this._action(tag, `${tag} ${verb} ${from.toFixed(dec)} → ${to.toFixed(dec)} ${unit}`, cls, why, `${tag}:${sub}`);
      if (ev) { ev.sub = sub; ev.from = from; ev.tLast = this.t; }
      this._lastOpr = ev;
      return ev;
    }

    // ---------- tank farm trucks ----------
    callTruck(tank) {
      const trk = this.x.truck, d = TF.tanks[tank];
      if (!d) return { ok: false };
      if (trk.state !== 'none') return { ok: false, msg: `Bay U-1 is busy (${TF.tanks[trk.tank].truck}). Release that truck first.` };
      Object.assign(trk, { tank, amt: d.dir === 'in' ? TF.truckCap : 0, state: 'arriving', eta: this.t + TF.arrive });
      this._action('TRUCK', `${d.truck} truck called for ${tank} (arrives in ${TF.arrive} s)`, 'neutral', '', 'TRUCK:call');
      return { ok: true, info: `${d.truck} truck on its way to bay U-1 - it connects in ${TF.arrive} s.` };
    }
    releaseTruck() {
      const trk = this.x.truck;
      if (trk.state === 'none') return { ok: false };
      const pk = TF.tanks[trk.tank].pump.replace('-', '');
      if (this.eq[pk]) return { ok: false, msg: `Stop ${TF.tanks[trk.tank].pump} before releasing the truck` };
      this._action('TRUCK', `Truck released from bay U-1 (${TF.tanks[trk.tank].truck}, ${trk.amt.toFixed(1)} t on board)`, 'neutral', '', 'TRUCK:release');
      Object.assign(trk, { tank: null, amt: 0, state: 'none' });
      return { ok: true };
    }

    setPump(tag, on) {
      if (on && TANK_OF_PUMP[tag]) {   // truck transfer pumps need the matching truck at the bay
        const k = TANK_OF_PUMP[tag], trk = this.x.truck, d = TF.tanks[k];
        if (!(trk.state === 'connected' && trk.tank === k)) return { ok: false, msg: `${tag} start refused: no ${d.truck.toLowerCase()} truck connected at bay U-1 (call one from the ${k} faceplate)` };
        if (d.dir === 'in' && this.x.tk[k].L >= 95) return { ok: false, msg: `${tag} start refused: ${k} level high-high` };
      }
      const key = tag.replace('-', '');
      if (!(key in this.eq) || this.eq[key] === on) return { ok: false };
      this.eq[key] = on;
      const [cls, why] = this._judge(`${tag}:${on ? 'start' : 'stop'}`, 0, 0);
      const ctrl = { 'P-101': this.fic101, 'P-102': this.fic102 }[tag];
      if (ctrl && !on) { ctrl.mode = 'MAN'; ctrl.op = 0; }
      this._action(tag, `${tag} ${on ? 'started' : 'stopped'} by operator${ctrl && !on ? ` (${ctrl.tag} forced to MAN 0 %)` : ''}`, cls, why, `${tag}:${on ? 'start' : 'stop'}`);
      let info = '';
      if (on && ctrl && ctrl.mode === 'MAN' && ctrl.op < 1) {
        info = `${tag} running. ${ctrl.tag} is in MAN at 0 % - raise its output or switch it to AUTO to restore flow.`;
        if (tag === 'P-101' && !this.eq.xvOpen) info += ' XV-101 is also closed - open it first.';
      }
      return { ok: true, info };
    }

    closeXV() {
      if (!this.eq.xvOpen) return { ok: false };
      this.eq.xvOpen = false;
      this.fic101.mode = 'MAN'; this.fic101.op = 0;
      const [cls, why] = this._judge('XV-101:close', 0, 0);
      this._action('XV-101', 'XV-101 olefin feed isolation closed by operator (FIC-101 to MAN 0 %)', cls, why, 'XV-101:close');
      return { ok: true };
    }

    openXV() {
      if (this.eq.xvOpen) return { ok: false };
      if (this.x.Tr >= LIMITS.tHi) return { ok: false, msg: `${this.eq.tripped ? 'Trip reset' : 'XV-101 open'} blocked: permissive needs TI-100 below ${LIMITS.tHi} °C (now ${this.x.Tr.toFixed(1)} °C)` };
      if (this.eq.tripped) { this.eq.tripped = false; this._action('TZHH-100', 'Trip reset by operator', 'neutral', ''); }
      this.eq.xvOpen = true;
      this._action('XV-101', 'XV-101 opened by operator (FIC-101 remains MAN)', 'neutral', '', 'XV-101:open');
      return { ok: true, info: 'XV-101 open. FIC-101 is still in MAN - raise its output or switch it to AUTO to restore olefin flow.' + (this.eq.P101 ? '' : ' P-101 is stopped - start it too.') };
    }

    setCompressor(on) {
      if (this.eq.K301 === on) return { ok: false };
      if (on && !this.eq.pshhBypass && this.x.Pd >= R.pshh - 0.3) return { ok: false, msg: `K-301 start blocked: discharge pressure ${this.x.Pd.toFixed(1)} barg is at the PSHH-303 trip point` };
      this.eq.K301 = on;
      if (!on) this.x.kStop = 'ramp';
      const [cls, why] = this._judge(`K-301:${on ? 'start' : 'stop'}`, 0, 0);
      this._action('K-301', `K-301 refrigeration compressor ${on ? 'started' : 'stopped'} by operator`, cls, why, `K-301:${on ? 'start' : 'stop'}`);
      return { ok: true, info: on ? 'K-301 starting. Suction pressure PI-301 and refrigerant temperature TI-301 will fall over the next minute.' : '' };
    }

    vfdChangeover() {
      if (!this.eq.K301) return { ok: false, msg: 'K-301 is not running' };
      if (this.x.vfdCh === 'B') return { ok: false, msg: 'Already on drive channel B' };
      this.x.vfdCh = 'B';
      this.fix.chB = this.t;
      const [cls, why] = this._judge('K-301:chB', 0, 0);
      this._action('K-301', 'K-301 VFD changed over from channel A to channel B', cls, why, 'K-301:chB');
      return { ok: true, info: 'VFD channel B in control. Speed limit restores over ~15 s if channel A was faulty.' };
    }

    setBypass(on) {
      if (this.eq.pshhBypass === on) return { ok: false };
      this.eq.pshhBypass = on;
      const key = on ? 'PSHH-303:apply' : 'PSHH-303:remove';
      const [cls, why] = this._judge(key, 0, 0);
      this._action('PSHH-303', `PSHH-303 trip bypass ${on ? 'APPLIED' : 'REMOVED'} by operator`, cls, why, key);
      return { ok: true, info: on ? '' : `PSHH-303 active: K-301 trips if discharge pressure reaches ${R.pshh} barg.` };
    }

    // Hand valves (HV-801 flare N2 purge, HV-802 column N2 purge)
    setValve(tag, open) {
      const key = tag.replace('-', '');
      if (!(key in this.eq) || this.eq[key] === open) return { ok: false };
      this.eq[key] = open;
      const [cls, why] = this._judge(`${tag}:${open ? 'open' : 'close'}`, 0, 0);
      this._action(tag, `${tag} ${open ? 'opened' : 'closed'} by operator`, cls, why, `${tag}:${open ? 'open' : 'close'}`);
      return { ok: true };
    }

    setAutoStart(on) {
      if (this.eq.k702auto === on) return { ok: false };
      this.eq.k702auto = on;
      this._action('K-702', `K-702 standby auto-start ${on ? 'ARMED' : 'DISARMED'} by operator`, 'neutral', '', 'K-702:auto');
      return { ok: true };
    }

    // B-601 burner management: purge → ready → light-off; manual trip
    bms(action) {
      const x = this.x;
      if (action === 'purge') {
        if (x.bms !== 'TRIPPED' && x.bms !== 'OFF') return { ok: false, msg: 'Purge is only needed when the burners are off' };
        if (!this.eq.K601) return { ok: false, msg: 'Start FD fan K-601 first - the furnace is purged with combustion air' };
        if (x.iaFail) return { ok: false, msg: 'No instrument air - the burner valves and damper cannot be operated' };
        x.bms = 'PURGING'; x.purgeT = 0;
        Object.assign(this.fic602, { mode: 'MAN', op: 45 });     // BMS drives the air damper to purge position
        this._action('B-601', 'B-601 furnace purge started (BMS drives air damper to 45 %)', 'neutral', '', 'B-601:purge');
        return { ok: true, info: `Purging for ${U.purgeT} s with FD fan air. Keep K-601 running.` };
      }
      if (action === 'light') {
        if (x.bms !== 'READY') return { ok: false, msg: 'Light-off not permitted - complete a furnace purge first' };
        if (x.Ldr < 30) return { ok: false, msg: `Light-off not permitted - drum level ${x.Ldr.toFixed(0)} % (needs ≥ 30 %)` };
        x.bms = 'FIRING';
        this.pic601.op = Math.min(this.pic601.op, 20);   // light off at low fire
        Object.assign(this.fic602, { mode: 'AUTO', ratioMode: true });   // air back on fuel/air ratio
        this.fic602.lastE = this.fic602.action * (this.fic602.pvf - this.fic602.sp);
        this._action('B-601', 'B-601 burners lit (low fire), PIC-601 takes control', 'neutral', '', 'B-601:light');
        return { ok: true };
      }
      if (action === 'stop') {
        if (x.bms !== 'FIRING') return { ok: false };
        x.bms = 'OFF'; x.bmsOffT = this.t;
        this._action('B-601', 'B-601 burners stopped (normal stop) - post-purge with FD fan', 'neutral', '', 'B-601:stop');
        return { ok: true, info: 'Burners off. Keep K-601 running for the 60 s post-purge.' };
      }
      if (action === 'trip') {
        if (x.bms !== 'FIRING') return { ok: false };
        this._bmsTrip('manual trip by operator');
        return { ok: true };
      }
      return { ok: false };
    }

    resetRebTrip() {
      if (!this.eq.rebTrip) return { ok: false };
      if (this.x.Pc >= 7.5) return { ok: false, msg: `PSHH-502 reset blocked: column pressure ${this.x.Pc.toFixed(2)} barg must be below 7.5 barg` };
      this.eq.rebTrip = false;
      this._action('PSHH-502', 'PSHH-502 reboiler steam trip reset by operator', 'neutral', '', 'PSHH-502:reset');
      return { ok: true };
    }

    relightPilot(i) {
      if (this.eq.pilots[i]) return { ok: false };
      if (!this.x.gasOK) return { ok: false, msg: 'Relight refused: no pilot gas (open HV-403, or backup HV-404)' };
      if (this.x.hO2 >= 4) return { ok: false, msg: `Relight refused: flare header O₂ ${this.x.hO2.toFixed(1)} % - purge with N₂ first (flashback risk)` };
      this.eq.pilots[i] = true;
      this.x.overT = 0;
      const [cls, why] = this._judge('F-401:relight', 0, 0);
      this._action('F-401', `Flare pilot ${'ABC'[i]} relit by operator (FFG ignition)`, cls, why, 'F-401:relight');
      return { ok: true };
    }

    // ---------- TG-1001 turbine / G-1001 generator commands ----------
    tgCmd(action, v) {
      const g = this.x.tg, eq = this.eq, x = this.x;
      const act = (msg, key, cls, why) => { const [c, w] = cls ? [cls, why] : this._judge(key, 0, v); this._action(key.split(':')[0], msg, c, w, key); };
      if (action === 'latch') {
        if (g.latched) return { ok: false };
        if (g.Pcond > 0.25) return { ok: false, msg: `Latch refused: condenser pressure ${g.Pcond.toFixed(2)} bara - pull vacuum below 0.25 bara first (start the air ejectors)` };
        if (!eq.P1001A && !eq.P1001B) return { ok: false, msg: 'Latch refused: no condensate pump running (P-1001A/B)' };
        if (g.N < 5 && !eq.TGEAR) return { ok: false, msg: 'Latch refused: rotor stationary - engage the turning gear first (avoid a bowed rotor)' };
        if (x.Psh < 8) return { ok: false, msg: `Latch refused: MP steam header ${x.Psh.toFixed(1)} barg (needs ≥ 8 barg)` };
        g.latched = true; g.tripped = false; g.Nsp = Math.round(g.N); g.Nref = g.N; g.I = 0;
        act('TG-1001 latched - trip and throttle valve open, governor in speed control', 'TG-1001:latch');
        return { ok: true, info: 'Turbine latched. Set the SIC-1001 speed target (start with 500 rpm).' };
      }
      if (action === 'trip') {
        if (!g.latched) return { ok: false };
        g.latched = false; g.I = 0;
        act(`TG-1001 tripped by operator at ${g.N.toFixed(0)} rpm, ${g.Pe.toFixed(2)} MW`, 'TG-1001:trip');
        return { ok: true, info: eq.CB1102 ? 'Turbine tripped with the breaker closed: reverse power will open CB-1102.' : '' };
      }
      if (action === 'gear') {
        if (eq.TGEAR) { eq.TGEAR = false; act('TG-1001 turning gear disengaged', 'TG-1001:gear'); return { ok: true }; }
        if (g.N > 5) return { ok: false, msg: `Turning gear can only engage at standstill (rotor ${g.N.toFixed(0)} rpm)` };
        eq.TGEAR = true; act('TG-1001 turning gear engaged', 'TG-1001:gear');
        return { ok: true };
      }
      if (action === 'speed') {
        if (!isFinite(v)) return { ok: false };
        if (g.mode !== 'SPEED') return { ok: false, msg: 'Generator on the bus: the governor is in ' + g.mode + ' mode - change the load setpoint instead' };
        const from = g.Nsp; g.Nsp = clamp(v, 0, 3150);
        if (from === g.Nsp) return { ok: false, msg: 'No change' };
        this._mergeOrAct('SIC-1001', 'speed', from, g.Nsp, 0, 'rpm', 'speed target', 'neutral', '');
        if (g.Nsp > E.crit[0] && g.Nsp < E.crit[1]) return { ok: true, info: `Warning: ${g.Nsp.toFixed(0)} rpm is inside the 1800–2200 rpm critical band - do not hold the rotor there.` };
        return { ok: true };
      }
      if (action === 'load') {
        if (!isFinite(v)) return { ok: false };
        if (g.mode === 'SPEED') return { ok: false, msg: 'Generator breaker open: the governor is in speed control - change the speed target' };
        const from = g.Psp; g.Psp = clamp(v, 0, E.S);
        if (from === g.Psp) return { ok: false, msg: 'No change' };
        const [c, w] = this._judge('SIC-1001:load', from, g.Psp);
        this._mergeOrAct('SIC-1001', 'load', from, g.Psp, 2, 'MW', g.mode === 'DROOP' ? 'load reference (island)' : 'load setpoint', c, w);
        return { ok: true };
      }
      if (action === 'vsp') {
        if (!isFinite(v)) return { ok: false };
        const from = g.Vsp; g.Vsp = clamp(v, 9.5, 12.0);
        if (from === g.Vsp) return { ok: false, msg: 'No change' };
        this._mergeOrAct('G-1001', 'vsp', from, g.Vsp, 2, 'kV', 'AVR voltage setpoint', 'neutral', '');
        return { ok: true };
      }
      if (action === 'exc') {
        if (eq.EXC1001 && eq.CB1102) return { ok: false, msg: 'Open CB-1102 before switching off the field (loss of excitation)' };
        eq.EXC1001 = !eq.EXC1001;
        act(`G-1001 field breaker ${eq.EXC1001 ? 'ON - AVR building voltage' : 'OFF'}`, 'G-1001:exc');
        return { ok: true, info: eq.EXC1001 && g.N < 2500 ? 'Field on: voltage builds once the rotor is above 2500 rpm.' : '' };
      }
      return { ok: false };
    }

    // 11 kV breakers: CB-1101 TNB incomer, CB-1102 generator, CB-1103 non-essential feeder (check-synch relay 25 on CB-1101 / CB-1102)
    breaker(tag, close) {
      const key = tag.replace('-', ''), eq = this.eq, x = this.x, el = x.el, g = x.tg;
      if (!(key in eq) || eq[key] === close) return { ok: false };
      if (close && (tag === 'CB-1101' || tag === 'CB-1102')) {
        let liveA, liveB;
        if (tag === 'CB-1102') { liveA = g.Vg > 1 && g.N > 2000; liveB = el.Vbus > 1; if (!liveA) return { ok: false, msg: 'CB-1102 close refused: generator not running at speed with voltage (excite it first)' }; }
        else { liveA = el.Vbus > 1; liveB = el.gridOK; if (!liveB) return { ok: false, msg: 'CB-1101 close refused: TNB side dead (no grid)' }; }
        if (liveA && liveB) {   // live-live: check-synch relay
          if (el.sync !== tag) return { ok: false, msg: `${tag} close refused: synchroscope not on ${tag}` };
          const df = el.slip, dv = Math.abs(el.dV) / E.vNom * 100, ang = el.phi;
          if (Math.abs(df) > 0.2 || dv > 5 || Math.abs(ang) > 20) return { ok: false, msg: `${tag} close refused by check-synch relay (25): slip ${df >= 0 ? '+' : ''}${df.toFixed(2)} Hz (≤ 0.2), ΔV ${dv.toFixed(1)} % (≤ 5), angle ${ang.toFixed(0)}° (≤ 20)` };
          eq[key] = true;
          const rough = Math.abs(ang) > 10 || Math.abs(df) > 0.15;
          if (rough && this.marks.roughSync === null) this.marks.roughSync = this.t;
          if (rough) this._deviation(`${tag} closed with angle ${ang.toFixed(0)}° / slip ${df.toFixed(2)} Hz - rough synchronisation (aim for < 10° and +0.05 to +0.15 Hz)`);
          if (tag === 'CB-1102') { g.cbTrip = false; g.Psp = Math.max(0, g.Pm - 0.15); g.Pref = g.Psp; g.I = g.zv; }
          else { g.Psp = g.Pref = g.Pe; g.I = g.zv; if (this.marks.resync === null) this.marks.resync = this.t; }
          const [c, w] = this._judge(`${tag}:close`, 0, 0);
          this._action(tag, `${tag} closed by operator (synchronised: slip ${df >= 0 ? '+' : ''}${df.toFixed(2)} Hz, angle ${ang.toFixed(0)}°, ΔV ${dv.toFixed(1)} %)`, c, w, `${tag}:close`);
          return { ok: true, info: tag === 'CB-1102' ? 'Generator on the bus. Raise the load to at least 0.3 MW now (reverse power trip after 5 s).' : 'Plant back on the TNB grid. The governor returns to load control.' };
        }
        eq[key] = true;   // dead-bus close
        if (tag === 'CB-1102') { g.cbTrip = false; g.Psp = g.Pref = 0.2; }
        this._action(tag, `${tag} closed onto a dead bus by operator`, 'neutral', '', `${tag}:close`);
        return { ok: true, info: 'Bus energised. Restart the essential equipment (BFW, air, cooling water) first.' };
      }
      if (!close && tag === 'CB-1102' && g.Pe > 0.5) {   // load rejection: governor fast-closes to no-load
        g.Nsp = E.nNom; g.Nref = E.nNom; g.I = 5; g.zv = Math.min(g.zv, 8);
      }
      if (!close && tag === 'CB-1102') { g.Nsp = E.nNom; g.Nref = Math.min(g.N, E.nNom); g.I = Math.min(g.I, 6); }
      eq[key] = close;
      const [c, w] = this._judge(`${tag}:${close ? 'close' : 'open'}`, 0, 0);
      this._action(tag, `${tag} ${close ? 'closed' : 'opened'} by operator${!close && tag === 'CB-1102' ? ` at ${g.Pe.toFixed(2)} MW` : ''}`, c, w, `${tag}:${close ? 'close' : 'open'}`);
      return { ok: true };
    }
    setUfls(on) {
      if (this.eq.uflsArm === on) return { ok: false };
      this.eq.uflsArm = on;
      this._action('CB-1103', `UFLS relay (81U) ${on ? 'ARMED' : 'DISARMED'} by operator`, 'neutral', '', 'UFLS:arm');
      return { ok: true };
    }
    setDumpAuto(on) {
      if (this.eq.xv1208auto === on) return { ok: false };
      this.eq.xv1208auto = on;
      this._action('XV-1208', `XV-1208 condensate auto-dump ${on ? 'ARMED' : 'DISARMED'}`, 'neutral', '', 'XV-1208:auto');
      return { ok: true };
    }
    // demin trains: put in service, stand by, regenerate
    demin(train, action) {
      const tr = this.x.dm[train];
      if (!tr) return { ok: false };
      if (action === 'service') {
        if (tr.st === 'service') return { ok: false };
        if (tr.st === 'regen') return { ok: false, msg: `Train ${train} is regenerating (${Math.round(tr.regT)} / ${WT.regenT} s)` };
        tr.st = 'service';
        this._action('A-1205' + train, `Demin train ${train} put in service${tr.cap < 15 ? ' (resin nearly exhausted!)' : ''}`, ...this._judge(`A-1205${train}:service`, 0, 0), `A-1205${train}:service`);
        return { ok: true };
      }
      if (action === 'standby') {
        if (tr.st !== 'service') return { ok: false };
        tr.st = tr.cap < 15 ? 'exhausted' : 'standby';
        this._action('A-1205' + train, `Demin train ${train} taken out of service (${tr.st})`, 'neutral', '', `A-1205${train}:standby`);
        return { ok: true };
      }
      if (action === 'regen') {
        if (tr.st === 'service') return { ok: false, msg: `Take train ${train} out of service before regenerating it` };
        if (tr.st === 'regen') return { ok: false };
        tr.st = 'regen'; tr.regT = 0;
        this._action('A-1205' + train, `Demin train ${train} regeneration started (10 min: backwash, acid, rinse, caustic, rinse)`, 'neutral', '', `A-1205${train}:regen`);
        return { ok: true, info: 'Regeneration waste goes to the TK-1304 neutralisation pit: watch the pH control.' };
      }
      return { ok: false };
    }

    takeOver() {
      if (this.phase !== 'standby') return;
      this.phase = 'running';
      const start = { startup: 'Unit in cold shutdown - startup procedure begins.', shutdown: 'Unit at design rates - shutdown procedure begins.' }[this.scenario];
      this._log('SYS', 'SHIFT', `Operator took over shift (${SCENARIOS[this.scenario].name}). ${start || 'Unit at steady state.'}`);
    }

    // ---------- debrief ----------
    submit(ans) {
      if (this.phase !== 'running') return this.report;
      ans = ans || {};
      this._log('SYS', 'DEBRIEF', DRILLS.includes(this.scenario) ? 'Diagnosis submitted' : 'Session ended by operator for debrief');
      this.phase = 'debrief';
      const sc = this.scenario;
      this.report = sc === 'drill' ? this._score(ans) : sc === 'suction' ? this._scoreSuction(ans) : sc === 'relief' ? this._scoreRelief(ans) : NEW_DRILL[sc] ? this._scoreNew(ans)
        : this.proc ? this._scoreProc() : this._scoreSteady();
      this.report.scenario = sc;
      this.report.answers = ans;
      this.report.firstChanges = this.firstChanges();
      return this.report;
    }

    // Ordered list of key variables that moved away from their pre-fault baseline (what changed first).
    firstChanges() {
      const t0 = this.marks.onset;
      if (t0 == null) return [];
      const h = this.history, base = h.filter(r => r.t >= t0 - 30 && r.t < t0);
      if (!base.length) return [];
      const out = [];
      WATCH.forEach(w => {
        const b = base.reduce((s, r) => s + (r[w.k] || 0), 0) / base.length;
        let run = 0;
        for (const r of h) {
          if (r.t < t0) continue;
          const d = (r[w.k] || 0) - b;
          run = Math.abs(d) > w.thr ? run + 1 : 0;
          if (run >= 3) { out.push(Object.assign({}, w, { t: r.t - 2, dir: d > 0 ? 'up' : 'down', from: b, to: r[w.k] })); break; }
        }
      });
      return out.sort((a, b) => a.t - b.t);
    }

    // Same scenario and seed re-run with no operator actions (for the debrief comparison).
    noActionRun(tEnd) {
      const g = new Sim(Object.assign({}, this.opts, { seed: this.seed }));
      g.takeOver();
      g.advance(Math.max(1, tEnd));
      const h = g.history.filter(r => r.t >= 0), mx = k => Math.max(...h.map(r => r[k])), mn = k => Math.min(...h.map(r => r[k]));
      return { history: g.history, trip: g.marks.trip, k301trip: g.marks.k301trip, psvT: g.x.psvT, smokeT: g.x.smokeT, tOut: g.tOut, maxTr: mx('Tr'),
        marks: Object.assign({}, g.marks), violT: g.x.ww.violT, maxTds: mx('tds'), maxPcond: mx('Pcond'), minF: Math.min(...h.filter(r => r.fbus > 1).map(r => r.fbus).concat([50])), minPh5: mn('ph5'), unburnT: g.x.unburnT };
    }

    _keyTimeline(extra) {
      return this.events.filter(e => e.kind !== 'FAULT').concat(extra || []).sort((a, b) => a.t - b.t);
    }

    _faultEvent(msg) {
      const k = this.marks;
      return k.onset !== null ? [{ t: k.onset, kind: 'FAULT', tag: 'DRILL', msg: 'Hidden fault onset: ' + msg }] : [];
    }

    _catUnnecessary(max, each) {
      const unn = this.events.filter(e => e.kind === 'OPR' && e.assess === 'unnecessary');
      return { name: 'Unnecessary interventions', pts: Math.max(0, max - each * unn.length), max,
        notes: unn.length ? [`${unn.length} unnecessary or counter-productive action(s), −${each} each.`].concat(unn.map(e => `${clock(e.t)} ${e.msg} - ${e.reason}`)) : ['No unnecessary interventions.'] };
    }

    _isStable() {
      const x = this.x, recent = this.history.slice(-30);
      const rising = recent.length > 5 && (recent[recent.length - 1].Tr - recent[0].Tr) > 0.3;
      return x.Tr <= LIMITS.tHi && x.Tr >= LIMITS.tLo && !rising;
    }

    _scoreSuction(ans) {
      const x = this.x, k = this.marks, d = this.drill, kind = d.kind;
      const out = { drill: d, marks: Object.assign({}, k), tEnd: this.t, tOut: this.tOut, cats: [] };
      const role = SUCTION_ROLE[kind];
      const Q = DIAG.suction;
      out.correct = { role, root: kind, first: kind };
      let dg = 0; const dn = [];
      if (ans.role === role) { dg += 15; dn.push(`Classification correct: the high suction pressure was a ${role.toUpperCase()}.`); }
      else dn.push(`Classification incorrect: it was a ${role.toUpperCase()}, not ${(ans.role || 'unanswered').toUpperCase()}.`);
      if (ans.root === kind) { dg += 15; dn.push(`Root cause correct: ${Q[1].opts[kind]}.`); }
      else dn.push(`Root cause incorrect: it was ${Q[1].opts[kind]}.`);
      if (ans.first === kind) { dg += 10; dn.push(`First change correct: ${Q[2].opts[kind]}.`); }
      else dn.push(`First change incorrect: ${Q[2].opts[kind]}.`);
      out.cats.push({ name: 'Diagnosis', pts: dg, max: 40, notes: dn });

      let lim = Math.max(0, 25 - 0.15 * this.tOut);
      const ln = [`${Math.round(this.tOut)} s outside training limits (reactor ${LIMITS.tLo}–${LIMITS.tHi} °C, I/O ≥ ${LIMITS.ioLo}). −0.15 pt per second.`];
      if (k.trip !== null) { lim -= 10; ln.push('−10: TZHH-100 reactor trip.'); }
      if (k.k301trip !== null) { lim -= 5; ln.push('−5: K-301 tripped.'); }
      out.cats.push({ name: 'Time outside limits', pts: Math.max(0, Math.round(lim)), max: 25, notes: ln });
      out.cats.push(this._catUnnecessary(15, 3));

      const fixed = { speed: x.speedLim >= 95, recycle: x.zR < 20 && this.eq.K301, condenser: x.cw >= 80, load: x.Fo < 130 }[kind];
      const fixTxt = { speed: 'drive changed over to channel B', recycle: 'FV-302 closed with UIC-301 in MAN', condenser: 'standby CW pump P-303B started', load: 'olefin flow brought back under control (XV-101 / P-101)' }[kind];
      let oc = 0; const on = [];
      if (k.onset === null) on.push('Run ended before the fault developed.');
      else {
        if (fixed) { oc += 12; on.push(`Root cause corrected: ${fixTxt}.`); } else on.push(`Root cause not corrected (needed: ${fixTxt}).`);
        if (this._isStable()) { oc += 8; on.push('Reactor stable within limits at the end.'); } else on.push('Reactor not stable within limits at the end.');
      }
      out.cats.push({ name: 'Outcome', pts: oc, max: 20, notes: on });
      out.total = out.cats.reduce((s, c) => s + c.pts, 0);
      out.final = { Tr: x.Tr, Fo: x.Fo, Fi: x.Fi, cap: x.cap, tripped: this.eq.tripped };
      out.modelAnswer = {
        speed: 'CAUSE. K-301 speed (SI-301) fell first while PIC-301 kept demanding more - the VFD channel A fault capped the speed. Suction pressure rose because the compressor removed less vapour, the evaporating temperature rose, and the reactor followed. Motor current fell (less work), discharge pressure fell slightly, CW was normal. Fix: change over to VFD channel B; cut olefin while capacity recovers.',
        recycle: 'CAUSE. FV-302 recycle opened first and suction temperature TI-302 jumped (hot gas returning to suction). The calculated surge margin was large but UIC-301 read a failed-low FT-302 signal and held the valve open. Recycled vapour used up compressor capacity, so suction pressure rose even with K-301 at full speed and high motor current. Fix: UIC-301 to MAN and close FV-302 (watch the calculated surge margin); cut olefin if needed.',
        condenser: 'SYMPTOM. CW flow FI-303 fell and discharge pressure PI-303 rose first. Higher head reduced the flow K-301 can move at full speed, so suction pressure rose as a consequence and the reactor warmed. Fix: start standby CW pump P-303B to restore the condenser; cut olefin while pressure recovers.',
        load: 'RESPONSE. Olefin flow and reactor heat load rose first - FV-101 drove open regardless of FIC-101. More vapour reached K-301, which correctly sped up to 100 %; only when it ran out of speed did suction pressure rise. The compressor was healthy. Fix: stop the olefin excess (close XV-101 / stop P-101), then restore feed at a controlled rate.',
      }[kind];
      out.timeline = this._keyTimeline(this._faultEvent(this.faultDesc || ''));
      return out;
    }

    // column / boiler / flare / tank drills share one scoring layout
    _scoreNew(ans) {
      const sc = this.scenario, cfg = NEW_DRILL[sc], x = this.x, k = this.marks, Q = DIAG[sc], eq = this.eq;
      const out = { drill: this.drill, marks: Object.assign({}, k), tEnd: this.t, tOut: this.tOut, cats: [], correct: cfg.correct };
      let dg = 0; const dn = [];
      if (ans.root === cfg.correct.root) { dg += 20; dn.push(`Root cause correct: ${Q[0].opts[cfg.correct.root]}.`); } else dn.push(`Root cause incorrect: it was ${Q[0].opts[cfg.correct.root]}.`);
      if (ans.first === cfg.correct.first) { dg += 15; dn.push('First change correct.'); } else dn.push(`First change: ${Q[1].opts[cfg.correct.first]}.`);
      out.cats.push({ name: 'Diagnosis', pts: dg, max: 35, notes: dn });
      const h = this.history.filter(r => r.t >= 0), cnt = fn => h.filter(fn).length;
      let cq = 30; const cn = [];
      if (sc === 'colDrill') {
        const n = cnt(r => r.Pc > C5.pah); cq -= 0.1 * n; cn.push(`${n} s above PAH-502 (8.0 barg), −0.1/s.`);
        if (k.rebTrip !== null) { cq -= 10; cn.push('−10: PSHH-502 had to cut the reboiler steam.'); }
        if (x.psv['PSV-501'].lifts) { cq -= 10; cn.push('−10: PSV-501 lifted to the flare.'); }
      } else if (sc === 'blrDrill') {
        const n = cnt(r => r.Ldr < 30); cq -= 0.1 * n; cn.push(`${n} s with drum level below 30 %, −0.1/s.`);
        if (k.boilerTrip !== null) { cq -= 15; cn.push('−15: LALL-601 tripped the boiler - steam lost to the column and the flare.'); }
      } else if (sc === 'flrDrill') {
        const n = cnt(r => r.pilotsLit === 0); cq -= 0.1 * n; cn.push(`${n} s with no pilot lit, −0.1/s.`);
        cq -= 0.5 * x.unburnT; cn.push(`${Math.round(x.unburnT)} s of unburned hydrocarbon release, −0.5/s.`);
      } else if (sc === 'tankDrill') {
        const n = cnt(r => r.L901B > 90); cq -= 0.1 * n; cn.push(`${n} s with TK-901 above 90 % (radar), −0.1/s.`);
        if (k.tankTrip !== null) { cq -= 10; cn.push('−10: LAHH-901 had to trip the unloading pump.'); }
        if (x.psv['PSV-901'].lifts) { cq -= 15; cn.push('−15: PSV-901 lifted on hydraulic overfill.'); }
      } else if (sc === 'gridDrill') {
        const n = cnt(r => r.fbus > 1 && r.fbus < 49.8); cq -= 0.05 * n; cn.push(`${n} s with bus frequency below 49.8 Hz, −0.05/s.`);
        if (k.ufls !== null) { cq -= 5; cn.push('−5: under-frequency relay had to shed the non-essential feeder.'); }
        if (k.genTrip !== null) { cq -= 10; cn.push('−10: generator breaker tripped.'); }
        if (k.blackout !== null) { cq -= 20; cn.push('−20: PLANT BLACKOUT.'); }
        if (k.roughSync !== null) { cq -= 5; cn.push('−5: rough resynchronisation (angle > 10° or slip > 0.15 Hz).'); }
      } else if (sc === 'tgDrill') {
        const n = cnt(r => r.Pcond > 0.2); cq -= 0.05 * n; cn.push(`${n} s with condenser pressure above 0.20 bara, −0.05/s.`);
        if (k.tgTrip !== null) { cq -= 20; cn.push('−20: TG-1001 tripped on low vacuum - 2.2 MW lost, TNB import jumped.'); }
      } else if (sc === 'waterDrill') {
        const n = cnt(r => r.tds > 2500); cq -= 0.1 * n; cn.push(`${n} s with boiler water TDS above 2500 ppm, −0.1/s.`);
        const m = cnt(r => r.crCond > 20 && r.crDump < 1); cq -= 0.05 * m; cn.push(`${m} s with contaminated condensate going to the deaerator, −0.05/s.`);
        if (h.some(r => r.tds > 3500)) { cq -= 10; cn.push('−10: TDS above 3500 ppm - foaming and carryover into the steam.'); }
      } else if (sc === 'wwtDrill') {
        cq -= 0.5 * x.ww.violT; cn.push(`${Math.round(x.ww.violT)} s of off-spec effluent discharged to the outfall, −0.5/s.`);
        const n = cnt(r => r.ph4 < 6); cq -= 0.03 * n; cn.push(`${n} s with the neutralisation pit below pH 6, −0.03/s.`);
      }
      out.cats.push({ name: 'Consequences', pts: Math.max(0, Math.round(cq)), max: 30, notes: cn });
      out.cats.push(this._catUnnecessary(15, 3));
      let oc = 0; const on = [];
      const add = (ok, pts, yes, no) => { if (ok) { oc += pts; on.push(yes); } else on.push(no); };
      if (k.onset === null) on.push('Run ended before the fault developed.');
      else if (sc === 'colDrill') { add(eq.HV502, 12, 'CW bypass HV-502 open - condenser restored.', 'Condenser not restored (open bypass HV-502).'); add(x.Pc < 7.5, 8, 'Column pressure back below 7.5 barg.', 'Column pressure still high.'); }
      else if (sc === 'blrDrill') { add(eq.P601B || eq.P601A, 12, 'Feedwater restored.', 'Feedwater NOT restored (start P-601B).'); add(x.bms === 'FIRING' && x.LdrM > 35 && x.LdrM < 65, 8, 'Boiler firing with drum level in range.', 'Boiler tripped or drum level out of range.'); }
      else if (sc === 'flrDrill') { add(eq.HV404, 6, 'Backup pilot gas in service.', 'Backup pilot gas not opened.'); add(eq.pilots.every(Boolean), 10, 'All three pilots relit.', 'Not all pilots relit.'); add(x.flame !== 'unlit', 4, 'No unburned release at the end.', 'Flare still unlit.'); }
      else if (sc === 'tankDrill') { add(!eq.P901, 10, 'Unloading stopped.', 'Unloading pump still running.'); add(x.tk['TK-901'].L < 95 && !x.psv['PSV-901'].open, 10, 'TK-901 below the high-high level, PSV closed.', 'TK-901 overfilled.'); }
      else if (sc === 'gridDrill') { add(eq.CB1101 && eq.CB1102, 12, 'Plant resynchronised to the TNB grid with TG-1001 on the bus.', 'Plant not back on the grid (resynchronise CB-1101 once TNB is restored).'); add(x.el.f > 49.8 && x.el.f < 50.2 && x.el.Vbus > 5, 8, 'Bus frequency 49.8–50.2 Hz at the end.', 'Bus frequency out of range (or bus dead) at the end.'); }
      else if (sc === 'tgDrill') { add(eq.J1001B, 12, 'Standby ejector J-1001B in service.', 'Standby ejector not started.'); add(x.tg.latched && x.tg.Pcond < 0.15, 8, 'Turbine running with vacuum restored.', 'Turbine tripped or vacuum still poor.'); }
      else if (sc === 'waterDrill') { add(eq.XV1208, 12, 'Contaminated condensate dumped to wastewater (XV-1208).', 'Condensate still going to the deaerator.'); add(x.bw.tds < 2500, 8, 'Boiler water TDS back below 2500 ppm.', 'Boiler water TDS still high (raise CBD).'); }
      else if (sc === 'wwtDrill') { add(eq.P1304A || eq.P1304B, 10, 'Caustic dosing restored.', 'No caustic dosing pump running.'); add(!x.ww.offspec || !eq.XV1305, 10, 'No off-spec effluent going to the outfall at the end.', 'Off-spec effluent still discharging.'); }
      out.cats.push({ name: 'Outcome', pts: oc, max: 20, notes: on });
      out.total = out.cats.reduce((s, c) => s + c.pts, 0);
      out.final = { Tr: x.Tr, Fo: x.Fo, Fi: x.Fi, cap: x.cap, tripped: eq.tripped };
      out.modelAnswer = {
        colDrill: 'The E-502 cooling-water valve positioner failed and drove the valve closed, even though PIC-502 kept opening its output. The first sign was the valve feedback (ZI-502) falling while PIC-502 output rose; column pressure then climbed toward PAH-502, PSHH-502 (cuts reboiler steam at 8.6 barg) and PSV-501 (9.0 barg). Best response: open CW bypass HV-502 to restore the condenser, and cut reboiler steam (TIC-501 to MAN, lower output) to reduce vapour load until pressure recovers. Changing PIC-502 does nothing - the valve is not following it.',
        blrDrill: 'BFW pump P-601A tripped and standby P-601B did not auto-start, so feedwater flow FI-604 fell to zero first. The drum level then fell steadily toward LALL-601 (15 %), which would trip the burners and take steam away from the column reboiler and the flare. Best response: start P-601B immediately; lowering the firing rate buys time. LIC-601 changes cannot help with no pump running.',
        flrDrill: 'The pilot gas controller failed closed: pilot gas pressure fell (PAL-403) and the pilots went out one after another while steam and purge were normal. With no pilots, the vent from the upstream unit two minutes later would go to atmosphere unburned. Best response: open the backup pilot gas HV-404 and relight pilots A, B and C before the vent arrives.',
        gridDrill: 'A fault on the TNB 33 kV network tripped the incomer CB-1101 on loss of mains. TNB import dropped to zero and TG-1001 suddenly had to carry the whole plant load (about 3.3 MW instead of 2.2 MW): the frequency dipped and then settled near 49.4 Hz on the 4 % governor droop. Best response: raise the SIC-1001 island load reference until the bus is back at 50 Hz (shed the non-essential feeder CB-1103 if the generator runs out of capacity), keep the boiler following the extra steam demand, and when TNB confirms the grid is back, synchronise at CB-1101: trim the frequency to a small slip, match the voltage and close near 12 o\'clock. Opening CB-1102 or tripping the turbine in the island blacks out the plant.',
        tgDrill: 'Air ejector J-1001A lost its motive steam, so air leaking into the condenser was no longer removed. Condenser pressure PI-1001 rose (vacuum fell) while hotwell level, cooling water, inlet steam and governor valve stayed normal; the generator then lost output at constant steam flow and the governor opened further. Without action the low-vacuum trip (0.35 bara) stops the turbine and TNB import jumps by 2.2 MW. Best response: start standby ejector J-1001B and, if vacuum is still poor, unload the turbine.',
        waterDrill: 'A tube leak in reboiler E-501 let hydrocarbon and acid into the steam condensate. Condensate conductivity AI-1208 and oil AI-1209 rose first, and the XV-1208 auto-dump interlock did not operate. The contaminated condensate then raised the feedwater conductivity and the boiler water TDS climbed toward foaming and carryover. Best response: open XV-1208 to dump the condensate to wastewater (the deaerator make-up picks up from demin), increase continuous blowdown FIC-606, and arrange to isolate the leaking reboiler.',
        wwtDrill: 'Demin train B regeneration sent strong acid waste to the TK-1304 neutralisation pit at the same moment caustic dosing pump P-1304A tripped (P-1304B is not on auto-start). AIC-1304 went to full caustic output but no caustic flowed, so the pit pH fell first and the final effluent followed below the DOE limit of pH 5.5. Best response: start P-1304B, and close XV-1305 to recycle the final effluent to TK-1302 until the pH is back in range. Changing AIC-1304 does nothing without a running pump.',
        tankDrill: 'Level transmitter LT-901 froze during truck unloading: LI-901 stopped changing while the pump kept running and the independent radar LI-901B kept rising. Without action the tank reaches the LAHH-901 trip (95 %) and, if that failed, the vapour space compresses and PSV-901 lifts to the flare. Best response: compare both level readings, stop P-901, and finish the transfer only on the radar reading once the transmitter is checked.',
      }[sc];
      out.timeline = this._keyTimeline(this._faultEvent(cfg.desc));
      return out;
    }

    _scoreRelief(ans) {
      const x = this.x, k = this.marks, d = this.drill;
      const out = { drill: d, marks: Object.assign({}, k), tEnd: this.t, tOut: this.tOut, cats: [] };
      const layer = k.psvFirst !== null ? 'psv' : k.k301trip !== null ? 'pshh' : 'none';
      const Q = DIAG.relief;
      out.correct = { root: 'cw', first: 'cw', layer };
      let dg = 0; const dn = [];
      if (ans.root === 'cw') { dg += 10; dn.push('Root cause correct: loss of condenser cooling water.'); } else dn.push(`Root cause incorrect: it was ${Q[0].opts.cw}.`);
      if (ans.first === 'cw') { dg += 8; dn.push('First change correct: CW flow fell when P-303A stopped.'); } else dn.push('First change incorrect: CW flow FI-303 fell first (P-303A stopped), then discharge pressure rose.');
      if (ans.layer === layer) { dg += 7; dn.push(`Protection layer correct: ${Q[2].opts[layer]}.`); } else dn.push(`Protection layer incorrect: ${Q[2].opts[layer]}.`);
      out.cats.push({ name: 'Diagnosis', pts: dg, max: 25, notes: dn });

      const fp = Math.round(12 * Math.max(0, 1 - x.psvT / 300));
      const sp = Math.round(13 * Math.max(0, 1 - x.smokeT / 120));
      const lkMax = Math.max(...this.history.filter(r => r.t >= 0).map(r => r.Lko));
      const kp = lkMax > 75 ? 0 : lkMax > 50 ? 6 : 10;
      let fl = fp + sp + kp; const fn = [
        `PSV-301 open ${Math.round(x.psvT)} s (${x.psvLifts} lift${x.psvLifts === 1 ? '' : 's'}): ${fp}/12.`,
        `Flare smoking ${Math.round(x.smokeT)} s: ${sp}/13.`,
        `KO drum peak level ${lkMax.toFixed(0)} %: ${kp}/10${lkMax > 75 ? ' (liquid carryover risk)' : ''}.`];
      if (x.overT > 30) { fl -= 3; fn.push(`−3: flare over-steamed for ${Math.round(x.overT)} s.`); }
      out.cats.push({ name: 'Relief and flare', pts: Math.max(0, fl), max: 35, notes: fn });

      let lim = Math.max(0, 15 - 0.1 * this.tOut);
      const ln = [`${Math.round(this.tOut)} s reactor outside training limits. −0.1 pt per second.`];
      if (k.trip !== null) { lim -= 8; ln.push('−8: TZHH-100 reactor trip.'); }
      out.cats.push({ name: 'Reactor limits', pts: Math.max(0, Math.round(lim)), max: 15, notes: ln });
      out.cats.push(this._catUnnecessary(10, 2));

      let oc = 0; const on = [];
      if (x.cw >= 80) { oc += 6; on.push('Condenser cooling water restored.'); } else on.push('Condenser cooling water NOT restored (start P-303B).');
      if (!x.psvOpen) { oc += 4; on.push('PSV-301 closed at the end.'); } else on.push('PSV-301 still relieving at the end.');
      if (x.flame !== 'smoky') { oc += 3; on.push(`Flare ${x.flame} at the end.`); } else on.push('Flare still smoking at the end.');
      if (this._isStable() || x.Fo < 2) { oc += 2; on.push('Reactor stable or safely out of service.'); } else on.push('Reactor not stable at the end.');
      out.cats.push({ name: 'Outcome', pts: oc, max: 15, notes: on });
      out.total = out.cats.reduce((s, c) => s + c.pts, 0);
      out.final = { Tr: x.Tr, Fo: x.Fo, Fi: x.Fi, cap: x.cap, tripped: this.eq.tripped };
      out.layer = layer;
      out.modelAnswer = 'CW pump P-303A tripped and P-303B did not auto-start, so CW flow FI-303 fell first. E-301 could no longer condense the compressor discharge and PI-303 rose. PSHH-303, which would normally trip K-301 at ' + R.pshh + ' barg, was in bypass for calibration, so PSV-301 on D-301 was the last layer: it lifted at ' + R.psvSet + ' barg and sent refrigerant vapour (with some liquid) to the flare. Higher discharge pressure also cut K-301 capacity, so suction pressure and the reactor temperature rose. Best response: start P-303B immediately (removes the cause and lets the PSV reseat at ' + R.psvReseat + ' barg), raise flare assist steam or put FIC-402 in RATIO so the flame stays smokeless, start P-401 if D-401 level climbs, and cut olefin feed to protect the reactor while refrigeration recovers.';
      out.timeline = this._keyTimeline(this._faultEvent('P-303A CW pump tripped; P-303B failed to auto-start'));
      return out;
    }

    _scoreProc() {
      const p = this.proc, n = p.steps.length;
      const doneN = p.steps.filter(s => s.tDone != null).length;
      const out = { tEnd: this.t, tOut: this.tOut, cats: [], marks: Object.assign({}, this.marks), proc: p };
      out.cats.push({ name: 'Procedure completion', pts: Math.round(30 * doneN / n), max: 30,
        notes: [`${doneN} of ${n} steps completed.`].concat(doneN < n ? [`Stopped at step ${p.cur + 1}: ${p.steps[p.cur].title}.`] : []) });
      const frac = doneN / n;
      const fracNote = frac < 1 ? [`Scaled by procedure completion (${Math.round(frac * 100)} %).`] : [];
      const dev = p.deviations.length;
      out.cats.push({ name: 'Sequence and step size', pts: Math.round(Math.max(0, 25 - 5 * dev) * frac), max: 25,
        notes: (dev ? [`${dev} deviation(s), −5 each.`].concat(p.deviations.map(d => `${clock(d.t)} ${d.msg}`)) : ['All actions in the correct order and within step-size limits.']).concat(fracNote) });
      let lim = Math.max(0, 25 - 0.15 * this.tOut) * frac;
      const limNotes = [`${Math.round(this.tOut)} s outside training limits while olefin was in the reactor (4–11 °C, I/O ≥ ${LIMITS.ioLo}, acid circulating). −0.15 pt per second.`];
      if (this.marks.trip !== null) { lim = Math.max(0, lim - 10); limNotes.push('−10: TZHH-100 trip on high reactor temperature.'); }
      out.cats.push({ name: 'Time outside limits', pts: Math.round(lim), max: 25, notes: limNotes.concat(fracNote) });
      let tp = 0; const tNotes = [];
      if (p.done != null) {
        const dur = p.done;
        tp = dur <= p.target ? 20 : Math.max(0, Math.round(20 * (2 - dur / p.target)));
        tNotes.push(`Completed in ${mmss(dur)} (target ${p.target / 60} min, zero points at ${p.target / 30} min).`);
      } else tNotes.push('Procedure not completed - no time credit.');
      out.cats.push({ name: 'Time to complete', pts: tp, max: 20, notes: tNotes });
      out.total = out.cats.reduce((s, c) => s + c.pts, 0);
      out.final = { Tr: this.x.Tr, Fo: this.x.Fo, Fi: this.x.Fi, cap: this.x.cap, tripped: this.eq.tripped };
      out.timeline = this._keyTimeline();
      return out;
    }

    _scoreSteady() {
      const ops = this.events.filter(e => e.kind === 'OPR').length;
      const out = { tEnd: this.t, tOut: this.tOut, marks: Object.assign({}, this.marks), practice: true, total: null,
        cats: [{ name: 'Practice summary (not scored)', pts: null, max: null, notes: [
          `Session length ${mmss(this.t)}.`,
          `${Math.round(this.tOut)} s outside training limits.`,
          `${ops} operator action(s); ${this.events.filter(e => e.kind === 'ALM').length} alarm(s) raised.`,
          this.marks.trip !== null ? 'TZHH-100 trip occurred.' : 'No trips.'] }] };
      out.final = { Tr: this.x.Tr, Fo: this.x.Fo, Fi: this.x.Fi, cap: this.x.cap, tripped: this.eq.tripped };
      out.timeline = this._keyTimeline();
      return out;
    }

    _score(ans) {
      const x = this.x, k = this.marks, d = this.drill;
      const faultSeen = k.onset !== null;
      const out = { drill: d, marks: Object.assign({}, k), tEnd: this.t, tOut: this.tOut, cats: [] };
      out.correct = { cause: 'refrig', first: 'cooling' };
      let dg = 0; const dgNotes = [];
      if (ans.cause === 'refrig') { dg += 25; dgNotes.push('Root cause correct: loss of refrigeration capacity.'); }
      else if (ans.cause === 'tv_stuck') { dg += 8; dgNotes.push('Cooling-side problem identified, but TV-100 feedback (ZI-100) showed the valve opening fully - the refrigeration supply itself was lost.'); }
      else dgNotes.push(`Root cause incorrect (${CAUSES[ans.cause] || 'not selected'}).`);
      if (ans.first === 'cooling') { dg += 10; dgNotes.push('First indication correct: delivered cooling fell with feed steady while the controller called for more.'); }
      else dgNotes.push('First indication incorrect: delivered cooling duty fell (with K-301 suction pressure rising) while olefin feed was steady - before reactor temperature moved noticeably.');
      out.cats.push({ name: 'Diagnosis', pts: dg, max: 35, notes: dgNotes });

      let lim = Math.max(0, 30 - 0.15 * this.tOut);
      const limNotes = [`${Math.round(this.tOut)} s outside training limits (reactor ${LIMITS.tLo}–${LIMITS.tHi} °C, I/O ≥ ${LIMITS.ioLo}). −0.15 pt per second.`];
      if (k.trip !== null) { lim = Math.max(0, lim - 10); limNotes.push('−10: reactor reached the TZHH-100 trip point; the protective system acted instead of the operator.'); }
      out.cats.push({ name: 'Time outside limits', pts: Math.round(lim), max: 30, notes: limNotes });
      out.cats.push(this._catUnnecessary(15, 3));

      const olefinOut = x.Fo < 2;
      const circ = x.Fi > 500 && x.Facid > 300;
      const stable = this._isStable();
      const balanced = x.load <= x.qmaxNow + 0.02;
      const sustainable = Math.max(0, (x.qmaxNow - (x.load - x.qrxn)) / P.hRxn);
      const safeRight = sustainable < 55;   // below ~45 % of design rate is not worth running
      out.sustainableOlefin = sustainable;
      let oc = 0; const ocNotes = [];
      const capTxt = `${Math.round(d.finalCap * 100)} %`;
      if (!faultSeen) ocNotes.push('Run ended before the drill fault developed - no response to assess.');
      else if (k.trip !== null && olefinOut) { oc = 8; ocNotes.push('Unit reached a safe condition only because the TZHH-100 trip acted. Partial credit.'); }
      else if (olefinOut && circ && stable) {
        if (safeRight) { oc = 20; ocNotes.push(`Correct call: K-301 capacity fell to ${capTxt}, supporting only ≈ ${Math.round(sustainable)} kmol/h olefin, and you brought the unit to a safe state (olefin out, isobutane and acid circulating).`); }
        else { oc = 15; ocNotes.push(`Safe state reached. Acceptable but conservative: the remaining refrigeration could have held ≈ ${Math.round(Math.min(sustainable, 120))} kmol/h olefin.`); }
      } else if (olefinOut && !circ) { oc = 6; ocNotes.push('Olefin feed stopped, but isobutane and/or acid circulation was also lost - not the intended hot-standby safe state.'); }
      else if (!olefinOut && stable && balanced) {
        if (safeRight) { oc = 8; ocNotes.push(`Stable at reduced rate, but the remaining refrigeration supports only ≈ ${Math.round(sustainable)} kmol/h; a safe state was the better call.`); }
        else { oc = 20; ocNotes.push('Correct call: olefin rate cut to match the remaining refrigeration and the reactor is stable within limits.'); }
      } else ocNotes.push('Unit not stable at the end of the run (temperature out of limits or still rising).');
      if (ans.finalState) ocNotes.push(`You reported: ${FINAL[ans.finalState] || ans.finalState}.`);
      out.cats.push({ name: 'Outcome / safe state', pts: oc, max: 20, notes: ocNotes });
      out.total = out.cats.reduce((s, c) => s + c.pts, 0);
      out.safeRight = safeRight;
      out.final = { Tr: x.Tr, Fo: x.Fo, Fi: x.Fi, cap: x.cap, tripped: this.eq.tripped };
      out.modelAnswer =
        'K-301 lost refrigeration capacity. The first sign was delivered cooling duty (QI-100) falling while olefin feed was steady, ' +
        'with K-301 suction pressure rising and, once the compressor was at full speed, motor current falling. TIC-100 responded by opening TV-100, ' +
        'so cooling demand climbed while delivered duty kept falling; once the valve was wide open, reactor temperature rose unchecked. The correct response is to cut olefin feed (keep isobutane ' +
        'and acid circulating so the I/O ratio stays high) to bring heat load below the remaining cooling. ' +
        (safeRight ? `In this run the remaining refrigeration supports only ≈ ${Math.round(sustainable)} kmol/h olefin, so stopping olefin feed (safe state) was the right call.`
                   : `In this run the remaining refrigeration can hold ≈ ${Math.round(Math.min(sustainable, P.olefinDesign))} kmol/h olefin; a safe state is acceptable but conservative.`) +
        ' Setpoint or controller-mode changes on TIC-100 cannot help: the valve is already fully open.';
      const rev = [];
      if (k.onset !== null) rev.push({ t: k.onset, kind: 'FAULT', tag: 'K-301', msg: 'Hidden fault onset: refrigeration capacity starts falling' });
      if (k.opRise !== null) rev.push({ t: k.opRise, kind: 'KEY', tag: 'TIC-100', msg: 'Cooling demand (TIC-100 OP) passes 75 %' });
      if (k.opSat !== null) rev.push({ t: k.opSat, kind: 'KEY', tag: 'TIC-100', msg: 'TIC-100 output saturated at 100 % - controller cannot call for more' });
      if (k.dutyFall !== null) rev.push({ t: k.dutyFall, kind: 'KEY', tag: 'QI-100', msg: 'Delivered cooling duty falls 5 % below pre-fault level' });
      out.timeline = this._keyTimeline(rev);
      return out;
    }
  }

  global.Alky = { Sim, P, R, C5, U, E, WT, MOTOR_MW, psatW, tsatW, phOf, PSVS, TF, TANK_OF_PUMP, NEW_DRILL, psatI, tsatI, LIMITS, TRIP_T, CAUSES, FIRST, FINAL, SCENARIOS, PROCEDURES, DIAG, DRILLS, WATCH, clock, ALARMS, psat, tsat };
})(typeof window !== 'undefined' ? window : globalThis);
