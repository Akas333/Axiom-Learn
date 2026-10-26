<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lh_banner_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/lh_banner_light.png">
    <img src="docs/assets/lh_banner_light.png" alt="Axiom Learn" width="640">
  </picture>
</p>

<p align="center"><strong>An AI tutor that finds where your understanding ends, and teaches from there.</strong></p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#built-with-meta-models">Meta models</a> ·
  <a href="#run-it-locally">Run it</a> ·
  <a href="#architecture">Architecture</a>
</p>

Most AI tutors explain. Axiom Learn first measures what *you* already understand, plans a path from there to your goal, and teaches one reasoning step at a time, changing the plan as soon as your answers show it was wrong about you. Two people asking the same question get two different lessons, and the app shows why.

Built on Meta's Muse models for the **Meta Global AI Developer Hackathon**.

![A teaching session: Muse Spark plans a Kirchhoff's law lesson from what the learner already knows](docs/assets/web-teaching-session.png)

## How it works

1. **Measure.** Before teaching, the agent probes each idea the goal depends on. Your answers, your confidence and your own explanation of your thinking show it where your understanding ends.
2. **Plan.** It builds a visible dependency map from that starting point to the goal. In the session above, it anchors on what the learner already holds ("charge doesn't vanish in wires") and targets the part they were unsure about (signs of voltage rises and drops).
3. **Teach.** Each step builds on something you already understand. You predict, get an explanation, then check your understanding. Confusions are repaired before anything is built on them, and the plan changes when your answers surprise it.
4. **Practice.** Separate sessions pose varied problems where you must recall the right idea without being told which one. Hints adapt to how you reason.

**Think out loud.** Every question has a thinking field for your reasoning and doubts, typed or dictated. That gives the agent a picture of *how* you think, not just a record of right and wrong answers.

## Knowledge that carries forward

Everything you learn is stored as claims and the reasoning chains that connect them, linked back to the session where you learned them. Later lessons read this knowledge graph instead of starting from scratch, and practice sessions draw their problems from it. You can also import your own notes.

![The home screen: the knowledge graph and a new lesson prompt](docs/assets/web-home.png)

## Built with Meta models

Each Meta model does a separate job in the teaching loop. All of them go through one Meta Model API key.

| Model | Role in Axiom Learn | Status |
|---|---|---|
| **Muse Spark 1.3** | The tutor: measures understanding, plans, teaches, runs practice | Working |
| **Muse Spark 1.3 Contributor** | Low-cost background agents: building the knowledge graph, grading, research | Working (pick it for the background model slot) |
| **Muse Wonder** | Optional upgrade for the hardest planning | Available in the model picker |
| **Muse Voice Transcribe** | Dictation: speak your answers and thinking. Streamed in real time, sentence by sentence | Working |
| **SAM 3.1** | "Tap the part that…" questions on diagrams, graded against the real outline | In progress |
| **Muse Image** | Pictures drawn for the learner's specific confusion, checked by Muse Spark before they're shown | In progress |
| **Meta open-weights models** | The same tutor running fully offline on your laptop | In progress |

Other providers still work. Axiom Learn supports 30+ model providers (OpenAI, Anthropic, Google, DeepSeek, OpenRouter and more) through your own keys.

## Run it locally

You need **Node.js 22+** and a [Meta Model API key](https://dev.meta.ai/docs/overview).

```bash
git clone https://github.com/Akas333/Axiom-Learn.git
cd Axiom-Learn
npm install
```

Start the API server and the web app, each in its own terminal:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Open http://localhost:5173, then:

1. Open **Settings → Providers → Add provider key**, choose **Meta**, and paste your key.
2. Open **Settings → Agent** and pick models for the three slots, for example `muse-spark-1.3` for the main tutor.
3. Type what you want to learn and press Enter.

Keys are saved on your machine only, in `packages/engine/auth.json`, which git ignores. You can also set `META_API_KEY` as an environment variable instead.

## Architecture

```
Browser ── apps/web (React + Vite) ──/api──▶ apps/server (Hono) ──▶ packages/engine ──▶ Meta Model API
                                     ws:/api/stt/realtime ─────────────────────────────▶ Muse Voice Transcribe
```

The repo is an npm-workspaces monorepo, built with Turborepo:

| Folder | What it is |
|---|---|
| [`packages/engine`](packages/engine) | The backend: domain core, teaching agents and prompts, stores, and every `/api` route handler ([`src/http`](packages/engine/src/http/index.ts)) |
| [`apps/server`](apps/server) | Hono server that mounts the engine's routes, plus the live dictation relay to Meta |
| [`apps/web`](apps/web) | The front end: React, Vite, Tailwind and React Router. Used for the web version, and next for desktop |
| [`apps/legacy`](apps/legacy) | The previous Next.js UI and Electron desktop shell, being replaced by `apps/web` |

The engine is transport-neutral: each API route is a plain `Request → Response` function, so any server can mount the same code. Your API key never reaches the browser. Dictation audio goes through the server, which adds the key when it connects to Meta.

```bash
npm test             # every package; deterministic, no model calls, no network
npm run typecheck
npm run lint
```

More detail: [architecture](docs/architecture.md), [teaching method](docs/teaching-methodology.md), [development guide](docs/development.md).

## Your keys, your data

- **Your keys and models.** No subscription or markup. You pay providers for what you use, and a live meter shows the cost of each session.
- **Stored locally.** Sessions, the knowledge graph, settings and keys live on your machine as plain files you can inspect.
- **What leaves your machine.** Model requests send the context each task needs to your chosen provider. Dictation sends audio to Meta. Web research contacts search providers.
- **Inspectable.** The system prompts are visible and editable in Settings.

## License

[AGPL-3.0](LICENSE)
