"""
Petrov API on Modal: the existing Node server (apps/server), unchanged,
running in one always-on container with a persistent Volume for data.

Deploy (from the repo root):
    modal deploy deploy/modal/petrov_api.py

Needs a Modal secret named "petrov-secrets" with at least:
    AXIOM_ACCESS_TOKEN   long random string shared by the app and web clients
    META_API_KEY         your Meta Model API key (optional: keys can also be
                         added later from Settings, they are saved on the Volume)
"""

from pathlib import Path

import modal

REPO = Path(__file__).resolve().parents[2]
PORT = 8787

# Never ship local data, keys or build junk into the image.
IGNORE = [
    ".git",
    "**/node_modules",
    "**/.turbo",
    "**/*.tsbuildinfo",
    "**/data",
    "**/auth.json",
    "**/*credentials.json*",
    "**/.env*",
    "mobile",
    "docs",
    "deploy",
    "apps/legacy/build",
    "apps/legacy/dist",
]

image = (
    modal.Image.from_registry("node:24-bookworm-slim", add_python="3.12")
    .env(
        {
            # The repo includes the Electron desktop shell; the server never needs it.
            "ELECTRON_SKIP_BINARY_DOWNLOAD": "1",
            "PUPPETEER_SKIP_DOWNLOAD": "1",
        }
    )
    .add_local_dir(str(REPO), "/app", copy=True, ignore=IGNORE)
    .run_commands("cd /app && npm ci --no-audit --no-fund")
)

app = modal.App("petrov")
volume = modal.Volume.from_name("petrov-data", create_if_missing=True)


@app.function(
    image=image,
    volumes={"/data": volume},
    secrets=[modal.Secret.from_name("petrov-secrets")],
    # Exactly one container: live turns and the events channel are in memory,
    # and two containers writing the same files would corrupt them.
    min_containers=1,
    max_containers=1,
    cpu=0.5,
    memory=1024,
    timeout=24 * 60 * 60,
)
@modal.concurrent(max_inputs=200)
@modal.web_server(port=PORT, startup_timeout=180)
def api():
    import os
    import subprocess

    env = {
        **os.environ,
        "HOST": "0.0.0.0",
        "PORT": str(PORT),
        "NODE_ENV": "production",
        # Everything mutable lives on the Volume so it survives restarts.
        "LH_DATA_DIR": "/data/app",
        "LH_AUTH_FILE": "/data/auth.json",
    }
    subprocess.Popen(["npx", "tsx", "src/index.ts"], cwd="/app/apps/server", env=env)
