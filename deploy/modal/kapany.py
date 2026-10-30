"""
Kapany's hosted app on Modal: one container that serves the web app and
the API (apps/server) in hosted, multi-user mode.

    modal deploy deploy/modal/kapany.py

Why one container (max_containers=1): live lessons, background jobs and
event streams are held in the server's memory, and user data lives as
files on the attached Volume. Phase 2 moves both to Supabase; then this can
scale out. One container with concurrent inputs handles many users.

Setup (once): see docs/hosting.md.
"""

import os
import subprocess
import threading
import time
from pathlib import Path

import modal

REPO = Path(__file__).resolve().parents[2]
PORT = 8787
DATA_DIR = "/data"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates", "gnupg")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
    )
    .add_local_dir(
        REPO,
        "/app",
        copy=True,
        ignore=[
            "**/node_modules",
            "**/node_modules/**",
            ".git",
            "**/.turbo",
            "**/dist",
            "**/*.tsbuildinfo",
            "data",
            "packages/engine/data",
            "auth.json",
            "**/.env*",
            "**/.DS_Store",
            "apps/mobile",
        ],
    )
    .env({"ELECTRON_SKIP_BINARY_DOWNLOAD": "1", "PUPPETEER_SKIP_DOWNLOAD": "1"})
    .run_commands(
        # Only the server, the web app and the engine; the legacy Electron
        # app and the mobile app are not part of the hosted build.
        "cd /app && npm ci --workspace @axiom/server --workspace @axiom/web --workspace @axiom/engine --include-workspace-root",
        "cd /app && npm run build -w @axiom/web",
    )
)

app = modal.App("kapany")
volume = modal.Volume.from_name("kapany-data", create_if_missing=True)


def _commit_forever() -> None:
    """Save Volume writes regularly so other reads and restarts see them."""
    while True:
        time.sleep(30)
        try:
            volume.commit()
        except Exception as err:  # keep serving; the next commit retries
            print(f"[kapany] volume commit failed: {err}")


@app.function(
    image=image,
    volumes={DATA_DIR: volume},
    secrets=[modal.Secret.from_name("kapany-secrets")],
    cpu=2.0,
    memory=4096,
    min_containers=1,
    max_containers=1,
    timeout=24 * 60 * 60,
)
@modal.concurrent(max_inputs=500)
@modal.web_server(PORT, startup_timeout=120)
def web() -> None:
    env = {
        **os.environ,
        "NODE_ENV": "production",
        "KAPANY_HOSTED": "1",
        "HOST": "0.0.0.0",
        "PORT": str(PORT),
        "LH_DATA_DIR": DATA_DIR,
        "KAPANY_WEB_DIR": "/app/apps/web/dist",
    }
    subprocess.Popen(["npx", "tsx", "apps/server/src/index.ts"], cwd="/app", env=env)
    threading.Thread(target=_commit_forever, daemon=True).start()
