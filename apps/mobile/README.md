# Petrov (Android app)

The phone app for the Kapany tutor, built with Expo and React Native. It talks to the same backend as the web app (`apps/server`), locally or on Modal.

## Run it on your phone

1. Install **Expo Go** from the Play Store.
2. Install from the repo root (Petrov is an npm workspace), then start the dev server:

   ```bash
   npm install
   cd apps/mobile
   npx expo start
   ```

   If your phone can't load the app, Expo may have put the wrong network address in the QR code. Set it yourself: `REACT_NATIVE_PACKAGER_HOSTNAME=<your-computer's-LAN-IP> npx expo start`.

3. Scan the QR code with Expo Go. The phone and the computer must be on the same Wi-Fi.
4. On the connect screen, enter:
   - **Server URL:** the Modal URL (see `deploy/modal/README.md`), or `http://<your-computer's-LAN-IP>:8787` for a local server. A local server must listen on the network, so start it with `HOST=0.0.0.0 AXIOM_ACCESS_TOKEN=<token> npm run dev:server`.
   - **Access token:** the shared `AXIOM_ACCESS_TOKEN`.

The URL and token are saved in the phone's secure storage. Change them later under Settings.

## How it's built

- **UI:** Astryx components (https://astryx.atmeta.com/components), implemented natively in `src/components/astryx/` and `src/components/ui.tsx` with the same names and props as the Astryx specs (`npx astryx component <Name>`). Colors, spacing and radius come from the Astryx neutral theme (`src/theme.ts`). Astryx's own package renders HTML and CSS, which Android can't display, so it's installed only for its CLI docs and theme values.
- **Sessions:** the web app's session state machine (`apps/web/components/session-core.ts`) and the engine's browser-safe core (`packages/engine/src/core`) are imported directly, not copied (see `metro.config.js`). Live tutor replies stream over `expo/fetch`.
- **Server events:** `src/lib/events.tsx` listens to `/api/events` and reconnects when the phone wakes up or changes networks.

## Not in this version yet

Knowledge graph view, voice dictation, model and key management (use the web app's Settings), and full research, demo and visual artifacts (shown as status cards). Math renders as readable text, not typeset formulas.

## Checks

```bash
npm run typecheck
npx expo export --platform android
```
