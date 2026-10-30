# Kapany × Meta — hackathon plan

Meta Global AI Developer Hackathon, Oct 26 – Nov 4, 2026 (submissions close Nov 4, 9:00 PM ET).
Track: **Indie developer**. Theme: **Build for Your World** (learning). Audience: anyone who wants to understand
something deeply.

## The headline: adaptive teaching

> Most AI tutors explain. Kapany first finds where *your* understanding ends, plans a path from there to your
> goal, and teaches one reasoning step at a time, changing the plan as soon as your answers show it was wrong
> about you.

The judges should remember: **two people asking the same question get two different lessons, and the app can show
why.**

Every Meta model in the project serves that one idea:

| Meta model | Role in adaptive teaching |
|---|---|
| **Muse Spark** (Meta Model API) | The online teacher: measures understanding, builds the plan, teaches, runs practice |
| **Meta open weights** (local) | The same adaptive teacher running **offline** on the learner's laptop |
| **Meta open weights** (Baseten / Fireworks) | Fast, cheap background agents: grading, concept extraction into the knowledge graph |
| **Muse Image** | Pictures made for *this learner's* specific confusion, checked by Muse Spark before they're shown |
| **SAM 3.1** | "Tap the part that…" questions on diagrams: another way to measure understanding, beyond text answers |

## Tech stack (decided)

| Piece | Choice |
|---|---|
| Repo | pnpm workspaces + Turborepo monorepo |
| Front end (one codebase for web + desktop) | React 19, Vite, TypeScript, TanStack Router + Query, Zustand, Tailwind v4 + shadcn/ui |
| Reused UI libraries | streamdown (markdown/math), @xyflow/react + d3 (knowledge graph) |
| Backend | Existing `src/core`, `src/agent`, `src/server`, served by **Hono** on Node (routes are already Request→Response) |
| Desktop | Electron wrapping the same front end; runs the backend locally |
| Web | Same front end + Hono backend, hosted (Fly.io or Railway) |
| Online models | pi-ai (Meta provider already built in) + small direct clients for Muse Image and SAM 3.1 |
| Offline models | New `local` provider: bundled **node-llama-cpp**, or **Ollama** if already installed (both OpenAI-compatible) |
| Mobile | After the hackathon (React Native / Expo, sharing the API client) |
| Tests | Node test runner (backend, existing), Vitest + Playwright (front end) |

```
apps/web         React front end (web + desktop)
apps/desktop     Electron shell + offline model runtime
apps/server      Hono server for the hosted version
packages/core    current src/core
packages/agent   current src/agent
packages/server  current src/server
packages/client  typed API + live-event client
```

**Web ↔ desktop for the demo.** The desktop app has two modes: **Online** connects to the hosted server (same
sessions as the web version); **Offline** runs the backend and a Meta open-weights model on the laptop. The hosted
server is a single-user demo protected by an access token. Real user accounts, and syncing offline sessions back
online, come after the hackathon.

## Schedule

Meta API credits arrive around Oct 28. Days before that use Baseten / Fireworks (if approved) or local models.

| Day | Date | Work | Cuttable? |
|---|---|---|---|
| 1 | Oct 26–27 | Git init + first commit. Monorepo; existing backend running on Hono; all backend tests pass | No |
| 2 | Oct 27 | New front end shell: layout, chat screen with live streaming, settings, keys, models | No |
| 3 | Oct 28 | Meta credits. Muse Spark preset. Full adaptive loop in the new UI: measure → plan tree → teach → questions | No |
| 4 | Oct 29 | Offline mode: `local` provider, node-llama-cpp + Ollama detection, model download screen, Electron online/offline switch | No |
| 5 | Oct 30 | Practice sessions + knowledge graph view in the new UI. Deploy hosted server; desktop Online mode connects to it | No |
| 6 | Oct 31 | Muse Image in the visual-maker (pictures for the learner's confusion). SAM 3.1 tap-to-answer questions | SAM first |
| 7 | Nov 1 | If Modal approved: fine-tune a small Llama on teaching transcripts for offline. Otherwise test offline teaching quality and polish | Fine-tune |
| 8 | Nov 2 | Demo script, record video, README and submission text | No |
| 9 | Nov 3 | Buffer: fixes, re-record, signed desktop build | No |
| 10 | Nov 4 | Submit (aim for noon ET, deadline 9:00 PM ET) | — |

## Demo video (2–3 min): web, then desktop

1. **Same question, two learners** (web). Two people ask "Why does the moon cause tides?" One knows gravity well,
   one doesn't. Side by side, the app measures each and builds **two different plan trees**. This is the headline.
2. **Teaching that adapts.** A learner answers wrong; the plan changes on screen, and a Muse Image picture is made for
   that exact confusion.
3. **A diagram question.** "Tap the part that…" on a diagram (SAM 3.1), graded against the real outline.
4. **Desktop, online.** The same session continues in the desktop app.
5. **Desktop, offline.** Wi-Fi off. A new lesson still adapts, running on a Meta open-weights model on the laptop.
6. **Knowledge graph.** Everything learned, connected, ready for the next lesson. End with which Meta model did what.

## How this maps to judging

- **Impact (30%)**: anyone learning anything; offline mode reaches people with poor internet.
- **Use of Meta tooling (25%)**: Muse Spark, Meta open weights (local + hosted), Muse Image and SAM 3.1, each doing a
  different job in one teaching loop. SAM masks used as a way to *answer* questions.
- **Technical depth (20%)**: existing tested backend, answers committed before questions, grading in code, clean
  online/offline switch.
- **Demo (25%)**: the side-by-side "two learners, two lessons" opening shows adaptivity in seconds.

## Open questions and risks

- **New front end in 9 days.** Biggest risk. Days 1–3 must end with the full adaptive loop working in the new UI; if
  not, cut SAM and fine-tuning first.
- **Offline quality.** Small local models may struggle with the long teaching prompts. Test early (day 4) and pick the
  smallest model that still teaches well.
- **API shapes.** Confirm SAM 3.1 and Muse Image request formats on dev.meta.ai before day 6. Meta's docs name the key
  `MODEL_API_KEY`; pi-ai reads `META_API_KEY`, so map one to the other.
- **Credits.** Meta $150, Baseten $100, Modal $100, Fireworks $25 (partners not guaranteed). Keep Muse Wonder off.
