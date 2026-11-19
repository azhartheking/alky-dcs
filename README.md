# ALKY-1 DCS Trainer

A browser-based training simulator for a sulfuric acid alkylation unit and its utilities: reactor, refrigeration, flare, fractionator, steam, power generation, water treatment and wastewater.
**Simplified dynamic model with fictional training values. It is not for real plant use.**

## Launch

There is nothing to install. Either:

- **Double-click `index.html`.** It opens in Chrome, Edge or Firefox.
- Or serve the folder and open http://localhost:8000:

```bash
python -m http.server 8000
```

Run that command from inside the `Refinery Simulator` folder.

## Eleven linked DCS pages

All eleven pages show **one** live simulation, so you can follow a single event across the plant. The process follows the flowsheet: olefin (x1), fresh acid (x3), isobutane make-up (x5) and isobutane recycle (x2) go to the reactor; spent acid leaves the settler; the hydrocarbon product goes to the fractionator, which returns isobutane to the reactor and sends alkylate (x4) out as product.

| Page | Shows |
|---|---|
| **1 · Reactor R-101** | Feeds, XV-101, E-101 pre-cooler, R-101, D-102 settler and acid return, TIC-100, reactor pressure PIC-103 (PV-103 to T-501), PSV-101 |
| **2 · Refrigeration K-301** | D-302 suction drum, K-301 with VFD speed (PIC-301), anti-surge recycle FV-302 (UIC-301), E-301 condenser with CW pumps P-303A/B, D-301 accumulator, PSV-301 / PSV-302, PSHH-303 trip and bypass, available cooling duty |
| **3 · Flare F-401** | Flare header (relief from PSV-101, -301, -302, -501), D-401 knockout drum and P-401, steam-assisted stack with visible flame, smoke and three pilots, FIC-402 assist steam, N₂ purge |
| **4 · Fractionator T-501** | Deisobutanizer: TIC-501 tray temperature → reboiler E-501 steam, PIC-502 pressure → condenser E-502 cooling water, FIC-502 reflux, LIC-502 reflux drum → isobutane recycle to the reactor, LIC-501 bottoms → alkylate product, quality analysers AI-502 / AI-503, PSHH-502 steam trip, PSV-501 |
| **5 · Steam B-601** | Water-tube boiler (steam drum, mud drum, furnace, stack) supplying the MP steam header for the reboiler, flare and other users. PIC-601 firing on header pressure, FIC-602 combustion air with fuel/air cross-limit, O₂, LIC-601 drum level with swell/shrink, BFW pumps, FD fan K-601, burner management (purge → light-off, trips), PSV-601 |
| **6 · Air & N₂** | Air compressors K-701 / K-702 (load/unload, standby auto-start), receiver D-701 and PSV-701, dryer A-701 and the instrument-air header, PV-702 plant-air priority valve, liquid N₂ tank TK-801, vaporizer, N₂ header and PSV-801, flare purge HV-801, column purge HV-802 |
| **7 · Tank farm** | Feed bullets TK-901 (olefin) and TK-902 (isobutane) with PSV-901 / -902 to the flare. Atmospheric tanks TK-903 (alkylate), TK-904 (fresh acid) and TK-905 (spent acid) with N₂ blanket PCVs. Truck bay U-1 (call a truck, unload or load with P-901 to P-905). LAHH and LALL trips on the tanks. |
| **8 · Turbine TG-1001** | Condensing steam turbine on the MP header (trip and throttle valve, governor valve GV-1001, SIC-1001 governor in SPEED / LOAD / DROOP mode, critical speed band 1800–2200 rpm, vibration, turning gear), G-1001 generator 3.5 MVA 11 kV, E-1001 surface condenser with air ejectors J-1001A/B, hotwell LIC-1001 and condensate pumps P-1001A/B, exhaust relief PSV-1001 |
| **9 · Electrical / TNB** | 11 kV single-line diagram: TNB 33 kV grid and TR-1101, incomer CB-1101, generator breaker CB-1102, non-essential feeder CB-1103 with UFLS relay, MCC feeders, plant load, TNB import vs maximum demand, and a **synchroscope** with check-synch relay |
| **10 · Deaerator & demin** | Demin trains A-1205A/B (service, standby, regeneration), TK-1204 demin tank, transfer pumps P-1206A/B, D-1201 deaerator with LIC-1201 make-up and PIC-1201 pegging steam, O₂ analyser, chemical dosing P-1210, condensate receiver TK-1207 with conductivity / oil analysers and the XV-1208 dump valve, PSV-1201 |
| **11 · Wastewater** | D-1301 blowdown flash drum and TIC-1301 quench (CBD / IBD from B-601, dumped condensate), TK-1302 equalisation, S-1303 CPI oil separator with skimmer, TK-1304 neutralisation pit with split-range pH control AIC-1304 (caustic P-1304A/B, acid P-1306), TK-1305 guard basin, final effluent analysers and the XV-1305 outfall / recycle valve (DOE Standard B: pH 5.5–9.0, oil ≤ 10 mg/L, ≤ 40 °C) |

Every vessel holding liquid has a level that rises and falls with its material balance: reactor, settler, drums, column, boiler drum and tanks. Feed is drawn from the tanks, product goes back to them, and trucks bring feed in and take product away.

**How the utilities affect the process:**
- **Steam:** the boiler supplies reboiler, flare, turbine and deaerator steam (about 47 t/h). A boiler trip starves the reboiler (alkylate off-spec), unloads and then trips the turbine, and the plant imports everything from TNB.
- **Power:** TG-1001 makes 2.2 MW and TNB supplies the rest of the 3.3 MW plant load. If the grid fails, the plant islands on TG-1001; if the bus goes dead, every motor stops (blackout).
- **Water:** the BFW pumps take suction from the deaerator, which is fed by demin make-up, turbine condensate and process condensate. Contaminated condensate raises boiler water TDS; CBD controls TDS and IBD removes mud-drum sludge (both go to the wastewater plant).
- **Instrument air:** if instrument air falls below 3.5 barg, every control valve on every page goes to its fail-safe position:
  - Olefin valve FV-101 closes.
  - TV-100 and the flare steam valve open.
  - Reboiler steam FV-501 closes.
  - The boiler fuel valve closes, so the boiler trips.
- **Combustion air:** comes from the boiler's FD fan K-601, not from the plant-air system. The fan also supplies the furnace purge air.

To move between pages:

- Use the **page tabs** under the top bar. Each tab shows a red badge with that page's unacknowledged alarms.
- Click an **off-page connector** on a graphic (for example **▶ P2 · K-301 DETAIL** or **▶ P3 TO FLARE**).
- Click an **alarm row**. This jumps to that alarm's page and opens its faceplate.

The alarm summary, event history and debrief show a **Pg** column, so you can see where each event happened. The trends switch to the strip set for the page you are on.

## Plant conditions (choose on the handover screen)

| Condition | Starts on | What you do |
|---|---|---|
| **Steady state** | Page 1 | Free practice, no upset (summary only) |
| **Upset: loss of refrigeration** | Page 1 | Unannounced K-301 capacity loss. Diagnose it, cut feed or go to a safe state. |
| **Upset: high K-301 suction pressure** | Page 2 | High suction pressure and rising reactor temperature together. Decide whether it is a **cause**, a **symptom** or a **response**, then fix it. The root cause is randomised (drive fault, recycle fault, condenser CW loss or reactor feed upset). |
| **Upset: overpressure relief to flare** | Page 3 | CW pump trip with PSHH-303 in bypass, so PSV-301 lifts to the flare. Keep the flare smokeless (assist steam), watch the KO drum, restore the condenser and protect the reactor. |
| **Upset: column condenser failure** | Page 4 | The condenser CW valve sticks shut and column pressure rises. Open the HV-502 bypass before PSHH-502 trips. |
| **Upset: boiler feedwater loss** | Page 5 | BFW pump P-601A fails and the drum level falls. Start P-601B before the low-level trip. |
| **Upset: flare pilot gas failure** | Page 3 | Pilots go out one by one. Line up backup HV-404 and relight before gas reaches an unlit stack. |
| **Upset: tank overfill during unloading** | Page 7 | LT-901 freezes while a truck unloads. Spot it from the radar and pressure, then stop P-901. |
| **Upset: TNB grid failure (islanding)** | Page 9 | CB-1101 trips on loss of mains. Hold 50 Hz on TG-1001 (raise the island load reference, shed load if needed), then resynchronise at CB-1101 when TNB is restored. |
| **Upset: turbine condenser vacuum loss** | Page 8 | Air ejector J-1001A loses motive steam. Spot the rising condenser pressure and start J-1001B before the low-vacuum trip. |
| **Upset: contaminated condensate** | Page 10 | A reboiler tube leak contaminates the returned condensate and the auto-dump fails. Dump it (XV-1208) and raise CBD before the boiler water foams. |
| **Upset: wastewater pH excursion** | Page 11 | Caustic dosing pump trips during a demin regeneration. Start P-1304B and recycle the off-spec effluent. |
| **Startup: full plant, reactor, column, boiler, turbine + grid sync, flare** | Varies | Follow the procedure on the **Procedure** tab. Full plant chains flare → deaerator → boiler → turbine → column → reactor from cold. |
| **Shutdown: full plant, reactor, column, turbine, boiler, flare** | Varies | Follow the shutdown procedure. Full plant shuts down reactor → column → turbine → boiler, with the flare kept in service. |

The written procedures are in [PROCEDURES.md](PROCEDURES.md). [MODEL_REVIEW.md](MODEL_REVIEW.md) explains:

- which refrigeration equipment and controls were added
- what each one contributes to the drills
- how the cause, symptom and response signatures differ
- why flare steam comes from the utility header rather than a dedicated boiler

## Running a drill

1. Pick a condition on the handover card and press **Take over shift**. The trends already show the last 5 minutes. Use **2× / 5× / 10×** to fast-forward, and **Pause** at any time.
2. The fault starts 1–3 minutes after takeover, unannounced. Click any equipment or tag to open its faceplate. Stop, Close, bypass and Reset actions need a second click to confirm.
3. Corrective actions available:

   | Area | Actions |
   |---|---|
   | Reactor | Setpoints, AUTO/MAN and output for TIC-100, FIC-101 and FIC-102; XV-101; pumps |
   | Compressor | K-301 start/stop, VFD changeover A → B, PSHH-303 bypass, PIC-301 and UIC-301 faceplates, CW pumps P-303A/B |
   | Flare | FIC-402 assist steam in AUTO, MAN or **RATIO** (steam follows hydrocarbon flow), P-401 pump-out, pilot relight |
   | Turbine / power | TG-1001 latch, trip and turning gear; SIC-1001 speed target and load setpoint (▲▼ for fine trim when synchronising); G-1001 field breaker and AVR voltage; CB-1101 / CB-1102 / CB-1103 open and close (check-synch relay on live-live closing); UFLS arm; ejectors and condensate pumps |
   | Water | Demin trains: put in service, take out, regenerate; LIC-1201, PIC-1201, LIC-1207; XV-1208 condensate dump and auto-dump arming; CBD FIC-606 and IBD HV-607 on page 5 |
   | Wastewater | TIC-1301 quench, LIC-1302, AIC-1304 pH, dosing pumps, oil skimmer, XV-1305 outfall / recycle |

4. **Sound.** Press **🔈 Enable sound** in the alarm bar. Browsers need a click before they play audio, and the page remembers your choice. **Mute** and the **Vol** slider control everything.
   - The **alarm horn** sounds until alarms are acknowledged. **Silence** quiets it until the next new alarm.
   - **K-301 start:** a contactor clunk, then a motor whine that rises with the real speed.
   - **K-301 running:** a hum and whine. Pitch follows speed and loudness follows motor load.
   - **K-301 normal stop:** the pitch falls slowly with the VFD ramp-down (about 15 s).
   - **K-301 trip:** a clunk and a much quicker drop.
   - **Any relief valve (PSV) lifting:** a metallic **KLAK**, then a muffled rush whose loudness follows the relief flow. On reseat the rush fades quickly and a softer clack plays.
   - Sounds follow the simulated equipment on every page. A refused start makes no sound, Pause and debrief go quiet, and Reset stops everything.
5. Press **Submit diagnosis** and answer the drill's questions, then explain your response.
6. The **debrief** shows:
   - **Score** with the reason for every point, and **your answers vs. the model answer**.
   - **What changed first**: the measurements that moved away from their pre-fault value, in time order and tagged by page. Click one to jump the replay there.
   - **Effect of your actions**: the same drill re-run with **no operator action**, compared with your run. This covers peak reactor temperature, time outside limits, trips, PSV open time and flare smoking time.
   - **Replay** for any page, with fault, first-change, corrective-action, PSV and trip markers. The **dashed grey line** is the no-action run, so you can see exactly where your actions changed the outcome.
   - The full **event sequence** across all pages, with each operator action assessed.
7. Press **Run again** for a new random timing and fault.

## Instructor / repeatable runs

You can add URL parameters to fix a scenario, for example:

- `index.html?scenario=suction&kind=condenser&seed=7&onset=40`
- `index.html?scenario=relief&onset=30`
- `index.html?scenario=drill&cap=0.25&ramp=90`

The parameters are:

| Parameter | Values / meaning |
|---|---|
| `scenario` | `steady`, `drill`, `suction`, `relief`, `colDrill`, `blrDrill`, `flrDrill`, `tankDrill`, `gridDrill`, `tgDrill`, `waterDrill`, `wwtDrill`, `plantStart`, `plantStop`, `startup`, `shutdown`, `columnStart`, `columnStop`, `boilerStart`, `boilerStop`, `tgStart`, `tgStop`, `flareStart` or `flareStop` |
| `kind` | The suction-drill root cause: `speed`, `recycle`, `condenser` or `load` |
| `onset` | Fault start, in seconds after takeover |
| `cap` | Final capacity fraction for the loss-of-refrigeration drill |
| `ramp` | Seconds the capacity takes to fall |
| `seed` | Repeats the same random run |

## Limits and protection (training values)

- Reactor temperature 4–11 °C. TAH 11 °C, TAHH 13.5 °C. **TZHH-100 at 15 °C** closes XV-101.
- I/O ratio ≥ 7.
- K-301 suction: normal 3.1 barg (≈ −5 °C). PAH-301 at 3.6 barg.
- K-301 discharge: normal 12.4 barg. PAH-303 at 14.5 barg. **PSHH-303 trip at 16.8 barg**.
- **PSV-301** (D-301) set 17.5 barg, reseat 16.3 barg.
- Flare: smokeless at steam/hydrocarbon ratio 0.3–1.5. Header PAH-401 at 0.5 barg. KO drum LAH 50 %, LAHH 75 %.

## Files

| File | Contents |
|---|---|
| `index.html` | Layout, the eleven process graphics (SVG) and dialogs |
| `css/style.css` | Styling, light and dark themes, flame and smoke animation |
| `js/model.js` | Process model (reactor, refrigeration loop, PSV, flare), controllers, scenarios, procedures, drill faults, alarms, event log, scoring, first-change detector and no-action re-run. It does not touch the page. |
| `js/trend.js` | Trend and replay charts (per-page strip sets, no-action overlay) |
| `js/sound.js` | Synthesized alarm horn, compressor and relief-valve sounds (Web Audio, no audio files) |
| `js/ui.js` | Pages, graphic tags, faceplates, alarm and event lists, diagnosis form and debrief |
| `tests/model-check.html` | Open in a browser to run 49 headless checks of every scenario, procedure and utility interaction |
| `tests/procedure-robot.js` | Scripted operator that runs each startup/shutdown procedure for the checks |
| `PROCEDURES.md` | Startup and shutdown procedures for the reactor, every unit and the full plant |
| `MODEL_REVIEW.md` | Model review and equipment rationale |
