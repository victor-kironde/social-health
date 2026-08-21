# Social Health Score: Model Specification (v0.2.0)

The score is an experimental, interpretable measure for personal reflection. It
is **not** a clinical or validated measure. All parameters live in
`DEFAULT_CONFIG` (`packages/score-engine/src/config.ts`) and are user-visible
model assumptions. v0.2 adds two weighted terms suggested in the proposal
feedback: passive call-log metadata and frecency.

## Inputs

An append-only `EventLog`: relationship attribute changes, interactions (with one
or more participants), support self-reports, logging activity, global pauses,
and, when connected, call records from the phone's call log. The score at time
`t` is a pure function of `(log, config, t)` using only events with `ts <= t`.
Historical scores are recomputed, not stored, so changing a weight re-derives
the whole history consistently. Every result carries `modelVersion`.

Two sources of contact are kept apart on purpose:

- **Logged contact** (self-report): what the user records. Feeds rhythm and coverage.
- **Call metadata** (passive): time, duration and direction of calls, matched to
  people on the device. Feeds its own component.

Both feed frecency. Separating them limits how much the score depends on either
(self-report bias on one side; incomplete or noisy metadata on the other).

## Per-relationship quantities

For relationship *i* at time *t*:

| Symbol | Definition |
|---|---|
| `I_i` | Expected interval in days from its rhythm (weekly 7 … yearly 365), ×2 if `long_distance`. None for `occasional` or `paused`. |
| `age(x)` | Days from event *x* to *t*, **excluding globally paused time**. |
| `m_i` | Quality multiplier: unrated 1; rated 1→0, 2→0.4, 3→0.75, 4→0.9, 5→1. |
| `E_i` | Σ over logged interactions *x* with *i*: `w(type) · m_i · 0.5^(age(x)/H_i)`, `H_i = I_i` (or 365 days if no rhythm). Weights: in person 1, video 0.7, voice 0.5, message 0.2. |
| `L_i` (level) | `1 − exp(−E_i / k)`, k = 1. Saturating, so repeated contact has diminishing returns. |
| `S_i` (on rhythm) | 1 if last logged contact within `I_i`, falling linearly to 0 at `2·I_i`; 0 if never. |
| `C_i` (call level) | `1 − exp(−Σ_calls c(call) · m_i · 0.5^(age/H_i) / k)`; `c` = 1 for answered calls ≥ 60 s, 0.3 for shorter, 0 for missed. Null if the call log is not connected. |
| `F_i` (frecency) | Σ over every logged interaction and call: `w · 0.5^(age / 30 days)`. Unbounded; used to rank people by how much and how recently they have been in touch. |

A relationship is **included** unless it is `archived`, `in_memoriam` or rated
quality 1 (harmful). Contact with excluded relationships never raises the score.

## Components (each 0–1, or null if undefined)

| Component | Weight | Definition |
|---|---|---|
| Rhythm | 0.25 | importance-weighted mean of `L_i` over included relationships with an expected interval |
| Coverage | 0.20 | importance-weighted mean of `S_i` over those with importance ≥ 4 |
| Quality and support | 0.10 | importance-weighted mean of each non-retired relationship's latest quality rating and support report (1–5 → 0–1); old reports are kept, not expired |
| Diversity | 0.10 | mean over the user's categories of `sqrt(importance-weighted mean L_i)`: rewards *balance across the categories the user has*, not having more of them |
| Calls | 0.25 | importance-weighted mean of `C_i`; **null (left out) when the call log is not connected** |
| Frecency | 0.10 | importance-weighted mean of `min(1, F_i / F*_i)`, where `F*_i = 1 / (1 − 0.5^(I_i / 30))` is the frecency of one full-weight contact every `I_i` days (geometric series). The cap means contacting one person a lot cannot make up for neglecting others. |

**Total** = 100 × weighted mean of the non-null components. Null components
have their weight redistributed. A weighted arithmetic mean was chosen for
interpretability; the components are always shown alongside the total so a
strong component cannot silently hide a weak one.

## Confidence

The share of the expected number of days (4 per 28-day window, scaled by the
unpaused part of the window) on which anything was logged, using `loggedAt`
rather than interaction time. If less than one day was expected (the window was
almost all paused), confidence is 1. `lowData` is set below 0.5, and the UI
shows the score as uncertain rather than as a decline.

## Smoothing

`smoothedScore` averages the raw total at *t*, *t*−7d and *t*−14d for display.
Properties are specified on the raw score.

## Properties (tests in `packages/score-engine/test/properties.test.ts`)

P1 bounded · P2 deterministic · P3 adding contact never lowers the score ·
P4 time passing without new data never raises it · P5 diminishing returns per
person · P6 invariant to relabelling and record order · P7 moving contact to a
neglected equally important person raises coverage · P8 contact with excluded
relationships never raises it · P9 adding a pause never lowers it ·
P10 empty network = 0 · **P11** an answered call never lowers the score ·
**P12** a missed call changes nothing · **P13** diminishing returns for calls ·
**P14** an unconnected call source is left out, a connected empty one counts as
no calls · **P15** frecency cannot be inflated by contacting one person a lot ·
**P16** frecency ranks frequent recent contact above one old contact.

## Scenario orderings (tests in `packages/synth/test/orderings.test.ts`)

O1 close-knit on rhythm > large but neglected · O2 balanced > concentrated ·
O3 active > inactive · O4 in person > message only · O5 in memoriam removes the
neglect penalty · O6 batch logging lowers confidence · O7 harmful contact does
not help · O8 paused gap > unpaused gap · O9 single-category not heavily
penalised · O10 healthy ≥ 60, neglected ≤ 40 · **O11** regular calls > no calls ·
**O12** calls spread across people > the same calls with one person ·
**O13** calls alone cannot stand in for logged contact · **O14** good,
supportive relationships > strained ones · **O15** proper calls > very brief ones.

## Sensitivity

`npm run sensitivity` regenerates `docs/evaluation/score-sensitivity.md`:
ablation of each component, weight and parameter perturbation, and a
variance-share dominance check over 500 seeded random networks. Reference
values for the named scenarios are in its section A.

## Known limitations / open questions

- Interaction duration is recorded but not used (call duration is).
- Diversity is derived from the same contact levels as rhythm, so it accounts
  for more of the score's variance (0.25) than its weight (0.10) suggests.
- Weights and decay constants are design assumptions, examined by the
  sensitivity analysis rather than validated against wellbeing outcomes.
