# Petrov API on Modal

Runs the existing `apps/server` in one always-on Modal container. Sessions, the knowledge graph and keys live on the `petrov-data` Volume, so they survive restarts and redeploys.

## One-time setup

1. Install the CLI and log in:

   ```bash
   pip install modal
   modal setup
   ```

2. Create the secret. Use a long random token and share it only with your teammate:

   ```bash
   modal secret create petrov-secrets AXIOM_ACCESS_TOKEN=<long-random-string> META_API_KEY=<your-meta-key>
   ```

   `META_API_KEY` is optional; keys added later from Settings are saved on the Volume.

3. Deploy from the repo root:

   ```bash
   modal deploy deploy/modal/petrov_api.py
   ```

   Modal prints the URL (like `https://<workspace>--petrov-api.modal.run`). Check it with `<url>/health`.

## Clients

- **Mobile app:** enter the URL and the token on the app's connect screen.
- **Web app:** send `Authorization: Bearer <token>` on API calls. For `EventSource` and WebSocket, which can't set headers, add `?access_token=<token>` to the URL. If the web app runs on another origin, add `AXIOM_CORS_ORIGINS=https://your-web-origin` to the secret.

## Cost

One container with 0.5 CPU and 1 GB of memory, always on, costs roughly $15–20 a month. To save credits while idle, set `min_containers=0`; the trade-off is a cold start of about 10–20 seconds after a quiet period.

## Known limits

- Research tools that drive a headless Chrome have no browser in this image.
- Keep `max_containers=1`. Live turns are held in memory, and two containers would write to the same files.
