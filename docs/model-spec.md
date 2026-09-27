# Social Health Score: Model Specification (v0.4.0)

The score is an experimental, interpretable measure for personal reflection. It
is **not** a clinical or validated measure. All parameters live in
`DEFAULT_CONFIG` (`packages/score-engine/src/config.ts`) and are user-visible
model assumptions. v0.2 adds two weighted terms suggested in the proposal
feedback: passive call-log metadata and frecency. v0.3 adds a per-relationship
**ideal**: how close the user hopes each relationship to be. v0.4 simplifies: importance
is 1–10 (default 1, optional; labels are guides for ranges), the coverage component is
removed (a score filtered to importance 7+ shows the same thing), and every relationship
type defaults to at least once a month, changeable by the user.

## Inputs

An append-only `EventLog`: relationship attribute changes, interactions (with one
or more participants), support self-reports, logging activity, global pauses,
and, when connected, call records from the phone's call log. The score at time
`t` is a pure function of `(log, config, t)` using only events with `ts <= t`.
Historical scores are recomputed, not stored, so changing a weight re-derives
the whole history consistently. Every result carries `modelVersion`.

Two sources of contact are kept apart on purpose:

- **Logged contact** (self-report): what the user records. Feeds rhythm.
- **Call metadata** (passive): time, duration and direction of calls, matched to
  people on the device. Feeds its own component.

Both feed frecency. Separating them limits how much the score depends on either
(self-report bias on one side; incomplete or noisy metadata on the other).

**Groups.** A group (for example a team, a class, or a doctor's patients) is a
`Person` with `kind: 'group'` and is scored like any other relationship, with its
own importance, ideal, rhythm and quality. A group catch-up lists the group as a
participant alongside any named people, so it counts once for the group and once
for each named person. Others there who are not named (new faces, distant relatives) are recorded only as a count
(`Interaction.newPeople`), which the engine stores but does not score. Anyone
named at a group catch-up becomes a member automatically (app-side), and members
can also be chosen by hand. Group membership affects the graph (member links,
collapse/expand) but not the score.

## Per-relationship quantities

For relationship *i* at time *t*:

| Symbol | Definition |
|---|---|
| `I_i` | Expected interval in days from its rhythm (default for everyone: at least once a month, i.e. monthly, changeable by the user to any preset or custom frequency; people who have not had a rhythm chosen follow it) (weekly 7 … yearly 365), or from a **custom minimum frequency** "at least N times a day/week/month/year" as period ÷ N (periods 1, 7, 30, 365 days, so "at least once a month" equals the monthly preset; P21). ×2 if `long_distance`. None for `occasional` or `paused`. The latest choice wins: picking a preset clears a custom frequency. Contact more often than the minimum is never penalised by rhythm terms (the ideal handles "closer than hoped"). |
| `age(x)` | Days from event *x* to *t*, **excluding globally paused time**, multiplied by *r_i*: 0.1 for someone marked as living or working with the user (time apart counts a tenth as much: decay, on-rhythm and lost-touch all slow tenfold), otherwise 1. The displayed time since the last catch-up stays real. |
| `m_i` | Quality multiplier: unrated 1; rated 1→0, 2→0.4, 3→0.75, 4→0.9, 5→1. |
| `E_i` | Σ over logged interactions *x* with *i*: `w(type) · m_i · 0.5^(age(x)/H_i)`, `H_i = I_i` (or 365 days if no rhythm). Weights: in person 1, video 0.7, voice 0.5, message 0.2. |
| `L_i` (level) | `1 − exp(−E_i / k)`, k = 1. Saturating, so repeated contact has diminishing returns. |
| `S_i` (on rhythm) | 1 if last logged contact within `I_i`, falling linearly to 0 at `2·I_i`; 0 if never. |
| `C_i` (call level) | `1 − exp(−Σ_calls c(call) · m_i · 0.5^(age/H_i) / k)`; `c` = 1 for answered calls ≥ 60 s, 0.3 for shorter, 0 for missed. Null if the call log is not connected. |
| `F_i` (frecency) | Σ over every logged interaction and call: `w · 0.5^(age / 30 days)`. Unbounded; used to rank people by how much and how recently they have been in touch. |

A relationship is **included** unless it is `archived`, `in_memoriam`, rated
quality 1 (harmful), or set to "don't mind". Contact with excluded relationships never raises the score.

## Ideals (v0.3)

Each relationship has an ideal *g_i* ∈ {1, …, 10} (default 10) or **don't mind**.
The standard model assumed every relationship should be as close as possible; the
ideal replaces that assumption per relationship (for example *g* = 3 for an ex-partner
one co-parents with).

- Target *t_i* = (*g_i* − 1) / 9.
- Fit of a per-relationship value *x* ∈ [0, 1]: `fit(x, g) = 1 − |x − t| / max(t, 1 − t)`,
  clamped to [0, 1]. It is 1 at the target and falls linearly to 0 at the far end of the
  scale, symmetrically: too distant and closer than hoped count the same.
- With *g* = 10, *t* = 1 and `fit(x, 10) = x`: **the standard model is the special case**,
  so existing scores are unchanged until an ideal is lowered (property P17).
- The contact-based values (*L_i* in rhythm and diversity, *C_i* in
  calls, the frecency ratio) are replaced by their fit before averaging. These are the
  same measures a relationship's own 1–10 score is made of, so the ideal is in effect a
  target for that score. The quality and support component is **not** fitted: a
  relationship going well is never a problem, whatever closeness the user hopes for.
- **Don't mind**: the relationship is not included in any component, so nothing about
  it can change the score (P18).

## Components (each 0–1, or null if undefined)

| Component | Weight | Definition |
|---|---|---|
| Rhythm | 0.25 | importance-weighted (importance 1–10) mean of `L_i` over included relationships with an expected interval |
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

## Display (app, not engine)

**Terminology.** The model's *interactions* (logged contact of any kind: in person, call, message,
with one or several people) are called **catch-ups** in the interface ("Log a catch-up",
"Last catch-up 3 days ago"), so that "contacts" only ever means the phone's address book
(used for importing names and matching calls).

The engine's total stays on 0–100. The app shows it as an integer from 1 to 10,
`1 + round(total × 9 / 100)`, inside a ring that fills to the score and is coloured
red (1–2) → green (9–10). Component bars are shown on the same 0–10 scale, and
change explanations are worded in tenths ("rose by 1.2 out of 10").

Per-relationship health (graph colours, `apps/mobile/src/data/health.ts`) is a
separate, display-only classification and does not feed the score:

- **lost touch** (grey): never contacted, no contact for more than 3× the expected
  interval (and at least 30 days, so frequent rhythms do not lose touch in days), or paused;
- otherwise `min(quality ?? 5, rhythmBand)`, where `rhythmBand` is 5/4/3/2 for
  onRhythm ≥ 0.75 / 0.5 / 0.25 / below. A relationship is as healthy as its weaker side.
- Bands are named by closeness, never as a verdict: 5 Close, 4 Connected, 3 Drifting a
  little, 2 Distant, 1 Strained, and Lost touch (grey). A relationship's own 1–10 score
  is kept inside its band (Close 9–10 … Strained or Lost touch 1–2).

Node size uses five discrete steps from the contact-frequency tiers (never
contacted, then frecency quartiles among the rest).

## Properties (tests in `packages/score-engine/test/properties.test.ts`)

P1 bounded · P2 deterministic · P3 adding contact never lowers the score ·
P4 time passing without new data never raises it · P5 diminishing returns per
person · P6 invariant to relabelling and record order · P7 moving contact to a
neglected equally important person raises the rhythm part · P8 contact with excluded
relationships never raises it · P9 adding a pause never lowers it ·
P10 empty network = 0 · **P11** an answered call never lowers the score ·
**P12** a missed call changes nothing · **P13** diminishing returns for calls ·
**P14** an unconnected call source is left out, a connected empty one counts as
no calls · **P15** frecency cannot be inflated by contacting one person a lot ·
**P16** frecency ranks frequent recent contact above one old contact ·
**P17** setting every ideal to the default 10 changes nothing · **P18** a "don't mind"
relationship never changes the score · **P19** fit is 1 at the ideal and never rises
moving away from it, in either direction · **P20** for a relationship hoped to be
distant, a lot of contact eventually lowers the score · **P21** a custom frequency equal
to a preset ("at least once a week/month/year") scores exactly like it · **P22** marking someone
as living or working together never lowers the score (default ideals) · **P23** marking everyone
as not together changes nothing.

P3, P4, P5, P9, P11, P13 and P14 describe the standard model and are tested on
networks with default ideals: with a lower ideal, drifting towards it raises the score
and contact far beyond it lowers it, by design. The others are tested on random
networks that include random ideals and "don't mind".

## Scenario orderings (tests in `packages/synth/test/orderings.test.ts`)

O1 close-knit on rhythm > large but neglected · O2 balanced > concentrated ·
O3 active > inactive · O4 in person > message only · O5 in memoriam removes the
neglect penalty · O6 batch logging lowers confidence · O7 harmful contact does
not help · O8 paused gap > unpaused gap · O9 single-category not heavily
penalised · O10 healthy ≥ 60, neglected ≤ 40 · **O11** regular calls > no calls ·
**O12** calls spread across people > the same calls with one person ·
**O13** calls alone cannot stand in for logged contact · **O14** good,
supportive relationships > strained ones · **O15** proper calls > very brief ones · **O16** a relationship kept distant on purpose
scores higher once its ideal says so (co-parenting, ideal 3 > ideal 10) · **O17** with a
distant ideal, sparse contact > weekly closeness.

## Sensitivity

`npm run sensitivity` regenerates `docs/evaluation/score-sensitivity.md`:
ablation of each component, weight and parameter perturbation, and a
variance-share dominance check over 500 seeded random networks. Reference
values for the named scenarios are in its section A.

## Known limitations / open questions

- The ideal targets contact relative to the relationship's own rhythm: for a distant ideal, keeping strictly to a frequent rhythm also counts as closer than hoped.
- Fit is symmetric; some users may mind being too distant more than too close.

- Interaction duration is recorded but not used (call duration is).
- Diversity is derived from the same contact levels as rhythm, so it accounts
  for more of the score's variance (0.25) than its weight (0.10) suggests.
- Weights and decay constants are design assumptions, examined by the
  sensitivity analysis rather than validated against wellbeing outcomes.
