# Zeroth

Full build specification: `docs/ZEROTH_BUILD_BRIEF_V2.md`
Read it before doing anything. It is the source of truth.

## Non-negotiable

- **No fabricated data.** Not in dev, not as a placeholder, not in a
  screenshot. Empty states say the run hasn't happened yet. One invented
  number and this project loses the only thing that makes it worth building.
- **Database connections use `zeroth_app`, never `postgres`.** Superusers
  bypass Row-Level Security silently — no error, no warning. Using
  `postgres` makes every Phase 3 security test pass for the wrong reason.
  `postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth`
- **Build one phase at a time.** Stop at each phase gate and report.
  Do not continue without explicit approval.
- **Environment is already verified** (brief §0.5). Do not re-test CUDA,
  PyTorch, Docker, Postgres, Ollama or vLLM.
- **vLLM on WSL2 requires** `--ipc=host` and
  `-e VLLM_WSL2_ENABLE_PIN_MEMORY=1`. Without them: `UVA is not available`.
- If the brief is wrong or stale, say so and propose a fix. Never
  silently substitute.

## Ports

Postgres 5433 · vLLM 8001 · Ollama 11435 · FastAPI 8010 · Next.js 3010

## Layout

Project root `~/projects/zeroth` inside WSL distro `zeroth`. Never `/mnt/c`.
Python: `source .venv/bin/activate` (3.11) · Node 20 via nvm
Shell alias `zeroth` sets up both.
