# Social Health Score: Model Specification (v0.1.0)

The score is an experimental, interpretable measure for personal reflection. It
is **not** a clinical or validated measure. All parameters live in
`DEFAULT_CONFIG` (`packages/score-engine/src/config.ts`) and are user-visible
model assumptions.

## Inputs

An append-only `EventLog`: relationship attribute changes, interactions (with one
or more participants), support self-reports, logging activity and global pauses.
The score at time `t` is a pure function of `(log, config, t)` using only events
with `ts <= t`. Historical scores are recomputed, not stored, so changing a
weight re-derives the whole history consistently. Every result carries
`modelVersion`.

## Per-relationship quantities

For relationship *i* at time *t*:

| Symbol | Definition |
|---|---|
| `I_i` | Expected interval in days from its rhythm (weekly 7 … yearly 365), x2 if `long_distance`. None for `occasional` or `paused`. |
| `age(x)` | Days from interaction *x* to *t*, **excluding globally paused time**. |
| `m_i` | Quality multiplier: unrated 1; rated 1→0, 2→0.4, 3→0.75, 4→0.9, 5→1. |
| `E_i` | Σ over interactions *x* with *i*: `w(type) · m_i · 0.5^(age(x)/H_i)`, with `H_i = I_i` (or 365 days if no rhythm). Weights: in person 1, video 0.7, voice 0.5, message 0.2. |
| `L_i` (level) | `1 − exp(−E_i / k)`, k = 1. Saturating, so repeated contact has diminishing returns. |
| `S_i` (on rhythm) | 1 if last contact within `I_i`, falling linearly to 0 at `2·I_i`; 0 if never contacted. |

A relationship is **included** unless it is `archived`, `in_memoriam` or rated
quality 1 (harmful). Contact with excluded relationships never raises the score.

## Components (each 0–1, or null if undefined)

- **Rhythm**: importance-weighted mean of `L_i` over included relationships with an expected interval.
- **Coverage**: importance-weighted mean of `S_i` over those with importance ≥ 4.
- **Diversity**: mean over the user's categories of `sqrt(importance-weighted mean L_i in that category)`.
  The square root rewards *balance across the categories the user has*. It does
  **not** reward having more categories, so a family-only network is judged only
  on that category. (Design decision: avoids assuming a "correct" network shape.)
- **Quality and support**: importance-weighted mean of each non-retired
  relationship's latest quality rating and support report, mapped 1–5 → 0–1.
  Old reports are kept rather than expired, so the score cannot jump when they age.

**Total** = 100 × weighted mean of the non-null components (default weights
rhythm 0.4, coverage 0.3, quality 0.2, diversity 0.1). Null components have
their weight redistributed. A weighted arithmetic mean was chosen for
interpretability; the components are always shown alongside the total so a
strong component cannot silently hide a weak one.

## Confidence

The share of the expected number of days (4 per 28-day window, scaled by the
unpaused part of the window) on which anything was logged, using `loggedAt`
rather than interaction time. If less than one day was expected (the window was
almost all paused), confidence is 1. `lowData` is set below 0.5, and the UI
should show the score as uncertain rather than as a decline.

## Smoothing

`smoothedScore` averages the raw total at *t*, *t*−7d and *t*−14d for display.
Properties are specified on the raw score.

## Properties (tests in `packages/score-engine/test/properties.test.ts`)

P1 bounded · P2 deterministic · P3 adding contact never lowers the score ·
P4 time passing without new data never raises it · P5 diminishing returns per
person · P6 invariant to relabelling and record order · P7 moving contact to a
neglected equally important person raises coverage · P8 contact with excluded
relationships never raises it · P9 adding a pause never lowers it ·
P10 empty network = 0.

## Scenario orderings (tests in `packages/synth/test/orderings.test.ts`)

O1 close-knit on rhythm > large but neglected · O2 balanced > concentrated ·
O3 active > inactive · O4 in person > message only · O5 in memoriam removes the
neglect penalty · O6 batch logging lowers confidence · O7 harmful contact does
not help · O8 paused gap > unpaused gap · O9 single-category not heavily
penalised · O10 healthy ≥ 60, neglected ≤ 40.

## Reference values (v0.1.0)

| Scenario | Total | Rhythm | Coverage | Diversity |
|---|---|---|---|---|
| Close-knit, in person | 90.7 | 0.83 | 1.00 | 0.91 |
| Close-knit, messages only | 59.5 | 0.30 | 1.00 | 0.55 |
| Balanced (6 people) | 87.2 | 0.77 | 1.00 | 0.88 |
| Concentrated (same contact, 1 person) | 18.2 | 0.17 | 0.17 | 0.29 |
| Large, important people neglected | 31.8 | 0.46 | 0.00 | 0.70 |
| Inactive 90 days | 16.5 | 0.21 | 0.00 | 0.46 |

## Known limitations / open questions

- Interaction duration is recorded but not yet used.
- The interaction weights, decay half-life (= expected interval) and saturation
  constant are assumptions to be examined in the Phase 6 sensitivity analysis.
- Diversity does not reward breadth (see above); revisit if evaluation suggests otherwise.
