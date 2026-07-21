# Social Graph

A privacy-preserving personal social graph and an interpretable Social Health
Score: a personal-informatics tool for reflecting on social connectedness.
CSM500 project.

## Layout

```
packages/score-engine   Pure TypeScript scoring model (no React Native imports)
packages/synth          Synthetic scenarios, scenario builder and fast-check arbitraries
docs/model-spec.md      Formula, properties, orderings and reference values
```

Planned: `apps/mobile` (Expo dev build, Android) and an optional `apps/server` (Fastify).

## Commands

```sh
npm install
npm test           # property tests, scenario orderings, explanation tests
npm run typecheck
```

## Method

The score's properties and scenario orderings were committed before the
formula (see the first commit) and act as its specification. If a candidate
formula fails one, the formula is changed rather than the test.
