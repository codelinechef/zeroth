# ZEROTH — Environment Setup, Documented

Everything installed on this machine, why it's there, and every command used to get it. Written to be readable months from now, or by someone who has never done this.

**Machine:** HP Omen an0015TX — Intel Core Ultra 7 255H, RTX 5060 Laptop (8GB), 24GB DDR5, 1TB SSD split into C: (577GB free) and D: (200GB free), Windows.

**Completed:** 22 August 2026.

---

## Part 1 — The mental model

Before any commands, the shape of what was built. Four nested layers, each isolating the one inside it.

```
┌─ Windows ──────────────────────────────────────────────┐
│  NVIDIA driver 610.88 lives here. Only here.           │
│                                                        │
│  ┌─ WSL 2 ──────────────────────────────────────────┐  │
│  │  A real Linux kernel running inside Windows.     │  │
│  │                                                  │  │
│  │  ├── Ubuntu       (existing work — untouched)    │  │
│  │  ├── docker-desktop (Docker Desktop's own)       │  │
│  │  └── zeroth  ←  this project, on D:              │  │
│  │        │                                         │  │
│  │        ├─ Docker Engine (its own daemon)         │  │
│  │        │    ├─ Postgres + pgvector container     │  │
│  │        │    └─ vLLM container                    │  │
│  │        │                                         │  │
│  │        ├─ Ollama (systemd service)               │  │
│  │        │                                         │  │
│  │        └─ ~/projects/zeroth                      │  │
│  │              └─ .venv  (Python 3.11 isolated)    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Why so many layers.** Each one answers "what happens when this breaks?"

- **A separate WSL distro** means a CUDA upgrade for this project can't break the Switchboard work in the `Ubuntu` distro. `wsl --unregister zeroth` deletes everything with one command and touches nothing else.
- **Docker Engine inside the distro** rather than Docker Desktop means this project's containers and images belong to this distro, and vanish with it. Docker Desktop shares one daemon across every distro — the opposite of what's wanted.
- **A Python virtual environment** means installing PyTorch here can't break the system Python that Ubuntu's own tooling (`apt`, among others) depends on.
- **Containers for Postgres and vLLM** mean no database is installed on the system. Delete a container, the mess goes with it.

**The one rule that must never be broken:** the NVIDIA *driver* is installed on Windows only. Linux gets the *toolkit*. Installing a driver inside WSL overwrites the shared interface and destroys GPU access entirely.

---

## Part 2 — Windows preparation

### 2.1 Verify the GPU driver

```powershell
nvidia-smi
```

**Why first:** the driver is the foundation. Linux borrows GPU access through it. Debugging Linux for a Windows-side problem wastes hours.

**Result:** `NVIDIA GeForce RTX 5060`, driver `610.88`, `CUDA UMD Version: 13.3`, `8151MiB` memory.

`CUDA UMD Version` is the *highest* CUDA the driver supports — not what's installed. This distinction matters in Part 5.

### 2.2 Update WSL

```powershell
wsl --update
wsl --version
wsl -l -v
```

**Why:** WSL 2.4.4+ supports `wsl --install --name`, which creates a second instance of a distro directly. Older versions need an export/import workaround.

**Result:** WSL 2.7.12 — new enough.

`wsl -l -v` lists distros. Before starting: `Ubuntu` and `docker-desktop`.

### 2.3 Set the resource budget

Create `C:\Users\asind\.wslconfig`:

```ini
[wsl2]
memory=16GB
processors=12
swap=8GB
```

**Why:** WSL claims up to half the host RAM by default. This project runs Postgres, an embedding model, a reranker and a generator concurrently — it needs a deliberate allocation, leaving 8GB for Windows.

**Limitation worth knowing:** this file is **global**. It applies to every WSL distro, not per-distro. There is no per-distro memory cap. Acceptable because only one heavy project runs at a time, but it is the one resource the distros genuinely share.

```powershell
wsl --shutdown
```

Required for the config to take effect.

### 2.4 Disable Docker Desktop's integration for this distro

**Docker Desktop → Settings → Resources → WSL Integration → `zeroth` OFF.**

**Why:** Docker Desktop injects a shared Docker daemon into whichever distros you enable. That shared daemon is exactly what defeats the isolation. With it off, Docker Engine installed inside `zeroth` owns the socket at `/var/run/docker.sock` without conflict.

**Verify in Linux** — this should print nothing:
```bash
which docker
```

---

## Part 3 — Creating the distro

### 3.1 Remove any previous attempt

```powershell
wsl --shutdown
wsl --unregister zeroth
wsl -l -v
Remove-Item -Recurse -Force D:\wsl\zeroth
```

`wsl --unregister` deletes the distro and its virtual disk. The `Remove-Item` is belt-and-braces; if it reports *"cannot find path"*, unregister already cleaned up. That's the desired outcome, not an error.

### 3.2 Audit where distros live

```powershell
Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss |
  ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    [PSCustomObject]@{ Name = $p.DistributionName; Path = $p.BasePath }
  } | Format-Table -AutoSize
```

**Why:** WSL records distro locations in the registry. This is the authoritative answer to "where is my distro actually stored."

**Result:** `Ubuntu` at `C:\Users\asind\AppData\Local\wsl\{054129e9-...}` (25.15GB), `docker-desktop` at `C:\Users\asind\AppData\Local\Docker\wsl\main` (0.09GB). Both in `AppData` — the normal location for Store-installed distros, not a mistake.

### 3.3 Create it on D:

```powershell
mkdir D:\wsl\zeroth -Force
wsl --install Ubuntu-24.04 --name zeroth --location D:\wsl\zeroth
```

- `Ubuntu-24.04` — the base image
- `--name zeroth` — what this instance is called, independent of the existing `Ubuntu`
- `--location` — where the virtual disk lives
- `-Force` on mkdir — creates parent folders, doesn't error if it exists

**The installer prompts for a username and password.** Entered `anant`. This is why manually running `adduser` failed on the first attempt — the user already existed.

**It also writes `/etc/wsl.conf` automatically:**
```ini
[user]
default=anant
[boot]
systemd=true
```

`systemd=true` matters — it's Linux's service manager, and Docker, Postgres and Ollama all expect it running. WSL leaves it off by default; the `--name` installer turns it on.

### 3.4 Verify

```bash
cd ~
pwd                           # /home/anant
whoami                        # anant
sudo whoami                   # root
lsb_release -a                # Ubuntu 24.04.4 LTS
systemctl is-system-running   # degraded
cat /etc/wsl.conf
nvidia-smi
```

**`degraded` is normal in WSL** — one or two systemd units always fail there. It means systemd is running. `offline` would be the problem.

**`nvidia-smi` working inside Linux is the gate.** It proves the GPU bridge from the Windows driver reaches this distro. Nothing downstream works without it.

**Habit:** WSL drops you wherever PowerShell was — often `/mnt/c/Users/asind`. Always `cd ~` first. `/mnt/c` is the Windows filesystem, roughly ten times slower for the many-small-file operations this project performs constantly.

### 3.5 Sparse mode

```powershell
wsl --shutdown
wsl --manage zeroth --set-sparse true
```

**Why:** the distro's entire filesystem is one file — `D:\wsl\zeroth\ext4.vhdx`. By default it **grows but never shrinks**. Delete 40GB inside Linux and Linux correctly reports the space free, but the file on Windows stays the same size. Windows never gets it back.

With only 200GB on D: and a project that churns Docker images, model downloads and embedding caches, that would fill the drive within weeks. Sparse mode returns freed blocks automatically.

The shutdown is required — the disk can't be modified while mounted.

---

## Part 4 — Base system packages

### 4.1 Update and install

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y build-essential curl wget git ca-certificates gnupg \
                    lsb-release software-properties-common unzip jq htop
```

**What each package is for:**

| Package | Purpose |
|---|---|
| `build-essential` | GCC, G++, make. Several Python packages compile C extensions at install time |
| `curl` | Downloads installers piped into shells — uv, nvm, Ollama all use this pattern |
| `wget` | Downloads files to disk. Used for the CUDA keyring |
| `git` | Version control. The repo, and Cowork's commits |
| `ca-certificates` | Root certificates so HTTPS downloads can be verified |
| `gnupg` | Verifies package signatures for the Docker and NVIDIA repositories |
| `lsb-release` | Reports the distro version. Repository setup scripts read it |
| `software-properties-common` | Tools for managing apt repositories |
| `unzip` | Extracts archives |
| `jq` | Formats JSON in the terminal. Used to read API responses readably |
| `htop` | Process and memory monitor |

### 4.2 The partial failure

**This install silently dropped four packages.** `gcc`, `jq`, `unzip` and `htop` were all missing afterwards despite `apt` reporting no error — most likely a mirror hiccup mid-transaction.

**Lesson:** `apt install -y` with many packages can partially fail without an obvious error. Verify afterwards:

```bash
for p in build-essential curl wget git ca-certificates gnupg lsb-release \
         software-properties-common unzip jq htop zstd; do
  dpkg -s "$p" &>/dev/null && echo "ok   $p" || echo "MISS $p"
done
```

Reinstall anything missing individually:
```bash
sudo apt install -y build-essential
sudo apt install -y jq unzip htop
```

### 4.3 Git identity

```bash
git config --global user.name "Anant Sharma"
git config --global user.email "asindia23@gmail.com"
git config --global init.defaultBranch main
```

Set now because commits happen constantly, and the Phase 1 golden set is the one asset in this project that cannot be regenerated if lost.

### 4.4 zstd (added later)

```bash
sudo apt install -y zstd
```

A compression format. Ollama's installer needs it for extraction and fails with an explicit error without it.

---

## Part 5 — CUDA toolkit

### 5.1 What CUDA is, and why the toolkit is separate

`nvidia-smi` working proves Linux can *see* the GPU. The **toolkit** is the compiler and libraries that let programs *compute* on it. Two different things, and the toolkit is installed **per distro** — having it in the other `Ubuntu` distro means nothing here.

### 5.2 Install

```bash
cd /tmp
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install -y cuda-toolkit-12-8
```

**Three deliberate choices:**

**The `wsl-ubuntu` repository, not the generic Linux one.** The standard CUDA package bundles a driver. Installing a driver inside WSL destroys the bridge. This repository ships the toolkit alone.

**Version 12.8, not 13.x** — even though the driver supports up to 13.3. PyTorch's stable Blackwell wheels and vLLM's prebuilt kernels are both built against 12.8. The RTX 5060 is already a new GPU generation; a brand-new CUDA major version on top is two unknowns instead of one.

**Not `nvidia-cuda-toolkit`.** That package appears in `apt-cache search` and is Ubuntu's own packaging — older, and it pulls driver-adjacent dependencies that can break the bridge.

**What `cuda-keyring` does:** installs NVIDIA's GPG signing key and adds their repository to apt's source list. Without it, apt has no idea NVIDIA's packages exist and no way to verify them.

**Result:** CUDA 12.8.93, ~3GB.

### 5.3 Check where it landed

```bash
ls -la /usr/local/ | grep cuda
readlink -f /usr/local/cuda
```

**Result:**
```
cuda    -> /etc/alternatives/cuda
cuda-12 -> /etc/alternatives/cuda-12
cuda-12.8/
```
`readlink -f` resolves the chain → `/usr/local/cuda-12.8`.

### 5.4 Set the PATH

```bash
cat >> ~/.bashrc <<'EOF'

# CUDA 12.8
export CUDA_HOME=/usr/local/cuda-12.8
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH
EOF

source ~/.bashrc
```

**What each variable does:**
- `CUDA_HOME` — build tools read this to locate CUDA headers and libraries
- `PATH` — makes `nvcc` (the CUDA compiler) findable
- `LD_LIBRARY_PATH` — where the dynamic linker looks for CUDA shared libraries at runtime

**Why the explicit `cuda-12.8` rather than the generic `cuda` symlink:** the generic one routes through `/etc/alternatives`, which a package install can silently repoint. If CUDA 13 were ever added, builds would start compiling against a different toolkit with no obvious cause.

**Syntax notes:** `>>` appends (`>` would overwrite `.bashrc` entirely). Quoting `'EOF'` prevents the shell expanding `$CUDA_HOME` while writing — the literal text is wanted in the file. `source` runs the script in the *current* shell so changes stick; executing it would change a child shell that then exits.

### 5.5 Verify

```bash
echo $CUDA_HOME
nvcc --version
```

**Result:** `release 12.8, V12.8.93`.

`nvcc` says 12.8 while `nvidia-smi` says 13.3. **Both correct** — installed version vs driver ceiling.

---

## Part 6 — Python and PyTorch

### 6.1 uv and Python 3.11

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
uv --version
uv python install 3.11
```

**Why `uv`:** a fast Python package manager that also manages Python versions. It installs 3.11 alongside Ubuntu's system 3.12 without touching it — important because Ubuntu's own tooling depends on the system Python, and breaking it breaks `apt`.

**Why 3.11 and not newer:** vLLM's prebuilt wheels track it most reliably. A version mismatch means vLLM falls back to compiling from source, which is the pain this whole approach avoids.

`curl` flags: `-L` follows redirects, `-s` silent, `-S` show errors anyway, `-f` fail on HTTP errors instead of saving an error page as a script.

**Result:** uv 0.12.5, Python 3.11.16.

### 6.2 Project and virtual environment

```bash
mkdir -p ~/projects/zeroth
cd ~/projects/zeroth
uv venv --python 3.11
source .venv/bin/activate
```

**Why a virtual environment:** the innermost isolation layer. Project packages live in `.venv/` inside the project folder. Nothing installed here can affect the distro's Python.

**Why `~/projects/` and never `/mnt/c/`:** the Windows mount is roughly ten times slower for many-small-file operations. This is the difference between a 12-minute corpus ingest and a two-hour one.

The prompt gains a `(zeroth)` prefix when active. **It is not permanent** — every new terminal needs reactivation.

### 6.3 PyTorch

```bash
UV_HTTP_TIMEOUT=600 uv pip install torch torchvision \
  --index-url https://download.pytorch.org/whl/cu128
```

**Why the `cu128` index URL — the most important detail in this whole setup:** PyTorch publishes separate builds per CUDA version. The default build has **no compiled kernels for Blackwell**. It installs fine, imports fine, and reports `cuda available: True` — then every computation fails with `no kernel image is available for execution on the device`. People lose days to this because every surface check passes.

PyTorch 2.7.0 was the first stable release with native `sm_120` support, shipping CUDA 12.8 wheels. `sm_120` is the RTX 5060's compute capability.

**Why `UV_HTTP_TIMEOUT=600`:** the first attempt failed — `nvidia-cuda-cupti-cu12` timed out after three retries against `pypi.nvidia.com`. Those wheels are large and NVIDIA's CDN is slow from India. Raising the timeout to 600 seconds fixed it. uv caches partial downloads, so retries resume rather than restart.

**Result:** 32 packages, `torch==2.11.0+cu128`. The `+cu128` suffix is the confirmation.

**What came with it:** `nvidia-cublas-cu12` (linear algebra), `nvidia-cudnn-cu12` (deep learning primitives), `nvidia-nccl-cu12` (multi-GPU communication), `nvidia-cufft-cu12` (FFTs), `triton` (GPU kernel compiler), `numpy`, `sympy`, `networkx`, `pillow`, `filelock`, `fsspec`, `jinja2`. All pulled automatically.

### 6.4 The compute gate

```bash
cat > /tmp/gpu_check.py <<'EOF'
import torch
print("torch         :", torch.__version__)
print("cuda built    :", torch.version.cuda)
print("cuda available:", torch.cuda.is_available())
print("device        :", torch.cuda.get_device_name(0))
print("capability    :", torch.cuda.get_device_capability(0))
a = torch.randn(2000, 2000, device="cuda")
b = torch.randn(2000, 2000, device="cuda")
c = a @ b
torch.cuda.synchronize()
print("matmul        : OK", tuple(c.shape))
free, total = torch.cuda.mem_get_info()
print(f"vram          : {free/1e9:.2f} GB free of {total/1e9:.2f} GB")
EOF

python /tmp/gpu_check.py
```

**Why the matmul specifically:** it's the only line that can't pass by accident. Multiplying two 2000×2000 matrices on the GPU requires the Blackwell kernels to genuinely exist. Version checks can all be green while computation is broken.

**Why `torch.cuda.synchronize()`:** GPU work is asynchronous. Without it, Python prints "OK" before the multiplication has actually run, and a failure would be missed.

**Result:**
```
torch         : 2.11.0+cu128
cuda built    : 12.8
cuda available: True
device        : NVIDIA GeForce RTX 5060 Laptop GPU
capability    : (12, 0)
matmul        : OK (2000, 2000)
vram          : 7.29 GB free of 8.55 GB
```

**`7.29 GB free of 8.55 GB`** is the number every later model-fitting decision refers to. The 1.26GB gap is Windows using the GPU for display.

---

## Part 7 — Docker

### 7.1 Install Engine

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin
```

**What the repository setup does:** downloads Docker's GPG signing key, then writes an apt source line that says "trust packages from this URL if signed by that key." `$(dpkg --print-architecture)` fills in `amd64`; `$(. /etc/os-release && echo "$VERSION_CODENAME")` fills in `noble` (Ubuntu 24.04's codename).

**The packages:**

| Package | Purpose |
|---|---|
| `docker-ce` | The daemon — the background process that runs containers |
| `docker-ce-cli` | The `docker` command you type |
| `containerd.io` | Lower-level container runtime that Docker builds on |
| `docker-buildx-plugin` | Extended build features |
| `docker-compose-plugin` | Provides `docker compose` for multi-container setups |

**Result:** Docker 29.7.2, Compose v5.5.0.

### 7.2 Run without sudo

```bash
sudo usermod -aG docker $USER
```

Adds your user to the `docker` group, which owns the daemon socket.

**Group membership only applies to new sessions:**
```powershell
wsl --terminate zeroth
wsl -d zeroth
```

Verify:
```bash
docker run --rm hello-world
```
`--rm` deletes the container after it exits, so tests don't accumulate.

### 7.3 GPU access for containers

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit

sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

**Why:** containers are isolated from host hardware by default. The `hello-world` container had no idea a GPU existed. This toolkit is the bridge.

**Why it matters:** vLLM runs as a container. Without this it starts, finds no GPU, and either crashes or silently falls back to CPU — unusably slow and not obviously wrong at first glance.

**What `gpg --dearmor` does:** converts an ASCII-armoured key to binary form, which is what apt expects. The `sed` command rewrites NVIDIA's repository line to reference the key file just created.

**What `nvidia-ctk runtime configure` does:** edits `/etc/docker/daemon.json` to register the NVIDIA runtime. Docker only reads that file at startup, so the restart is mandatory.

Verify:
```bash
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

**Result:** RTX 5060 reported from inside a container. `nvidia-container-toolkit` 1.19.0.

---

## Part 8 — Port allocation

Decided before configuring anything, because all WSL distros share the network with Windows. A collision causes a silent failure to start, and renaming ports once they're in six config files is miserable.

| Service | Other distro | zeroth |
|---|---|---|
| Postgres | 5432 | **5433** |
| vLLM | — | **8001** |
| Ollama | 11434 | **11435** |
| FastAPI | 8000 | **8010** |
| Next.js | 3000 | **3010** |

---

## Part 9 — Postgres with pgvector

### 9.1 The container

```bash
cd ~/projects/zeroth

cat > docker-compose.yml <<'EOF'
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: zeroth-db
    restart: unless-stopped
    ports: ["5433:5432"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: local_dev_only
      POSTGRES_DB: zeroth
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
EOF

docker compose up -d
docker compose ps
```

**Why Postgres and not a dedicated vector database:** Row-Level Security is a Postgres feature. It enforces access control *inside* the query rather than filtering results afterwards. Pinecone and Chroma have no equivalent. The entire security phase of this project is only possible because the vectors live in Postgres.

**Why the `pgvector/pgvector:pg16` image:** ships with the extension already compiled, avoiding a manual build.

**Line by line:**
- `restart: unless-stopped` — comes back automatically after a WSL restart
- `ports: ["5433:5432"]` — host 5433 → container 5432. Postgres still thinks it's on its normal port; only the outside sees 5433
- `volumes: pgdata:/var/...` — database files live in a Docker-managed volume, not inside the container. `docker compose down` and back up doesn't lose data. Deliberate: after Phase 1 that database holds 36,000 chunks nobody wants to re-embed
- `healthcheck` — Docker reports `healthy` rather than merely `running`, so you know Postgres is actually accepting connections

`-d` means detached — runs in the background.

### 9.2 Enable the extension

```bash
docker compose exec db psql -U postgres -d zeroth -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose exec db psql -U postgres -d zeroth -c "SELECT extversion FROM pg_extension WHERE extname='vector';"
```

`docker compose exec db` runs a command inside the running `db` container. `psql` is Postgres's command-line client; `-c` runs one statement and exits.

**Result:** pgvector 0.8.6.

### 9.3 The restricted role — the most consequential step

```bash
docker compose exec -T db psql -U postgres -d zeroth <<'EOF'
CREATE ROLE zeroth_app LOGIN PASSWORD 'local_dev_only' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE zeroth TO zeroth_app;
GRANT USAGE ON SCHEMA public TO zeroth_app;
GRANT CREATE ON SCHEMA public TO zeroth_app;
EOF
```

**Note the `-T` flag.** Without it, `docker compose exec` allocates a terminal, which conflicts with piping input. The first attempt failed with *"cannot attach stdin to a TTY-enabled container."*

**Why this is the most consequential five lines in the setup:**

Phase 3 writes Row-Level Security policies — rules making Postgres filter rows by tenant and role *inside* the query, so a user physically cannot retrieve a document they aren't entitled to. That's the security claim on the résumé and the hardest part of this project to fake.

**Postgres superusers bypass RLS entirely.** Not mostly — entirely. Policies still exist, `\d` still lists them, no warning appears. They simply do not apply.

So connecting as `postgres` would mean: policies written, 142 red-team tests written, every test passing, a published security page reporting zero cross-tenant leakage — and none of it ever enforced. A security system that does nothing, with a full green test suite saying it works. There is no error to catch. The only defence is connecting as a role that *can't* bypass.

**What each grant does:** `CONNECT` allows connecting to the database, `USAGE ON SCHEMA` allows seeing objects in it, `CREATE ON SCHEMA` allows creating tables — so migrations run as this role rather than needing `postgres` and switching later.

Verify:
```bash
docker compose exec db psql -U postgres -d zeroth -c \
  "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('postgres','zeroth_app');"
```

**Result:**
```
 postgres   | t | t | t
 zeroth_app | f | f | t
```

Can log in, cannot bypass RLS. The `postgres` row beside it is the contrast that makes the point.

---

## Part 10 — Ollama

### 10.1 Install

```bash
sudo apt install -y zstd
curl -fsSL https://ollama.com/install.sh | sh
```

**Why Ollama when the architecture specifies vLLM:** vLLM remains the target — it's architecturally faithful to the original system. But vLLM compiles GPU kernels at runtime, a path with known problems on Blackwell. Ollama uses a different runtime with no such dependency. Having it working *before* it's needed means a vLLM problem never blocks the whole project.

The first attempt failed: *"This version requires zstd for extraction."*

The installer detects the GPU and registers a systemd service — which works because systemd is enabled.

### 10.2 Move to port 11435

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d

sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11435"
Environment="OLLAMA_KEEP_ALIVE=5m"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama

echo 'export OLLAMA_HOST=127.0.0.1:11435' >> ~/.bashrc
source ~/.bashrc
```

**Why a drop-in override rather than editing the service file:** package updates overwrite `/etc/systemd/system/ollama.service`. Files in the `.d/` directory survive.

**`OLLAMA_KEEP_ALIVE=5m` matters more than it looks.** By default Ollama holds a model in VRAM indefinitely. With 7.29GB total, an idle 3B generator squatting in memory blocks the embedding model and reranker from loading — and the failure surfaces as an unrelated out-of-memory error somewhere else entirely. Five minutes idle, then it releases.

`systemctl daemon-reload` makes systemd re-read unit files after a change.

### 10.3 Pull a model and verify GPU use

```bash
ollama pull qwen2.5:3b-instruct-q4_K_M
ollama run qwen2.5:3b-instruct-q4_K_M "Reply with exactly: setup ok"
curl -s http://127.0.0.1:11435/api/tags | jq .
```

**Reading the model name:** `qwen2.5` family, `3b` = 3 billion parameters, `instruct` = tuned for following instructions, `q4_K_M` = 4-bit quantisation. Quantisation compresses weights from 16-bit to 4-bit — roughly a quarter the memory for a small quality loss. Essential on 8GB.

**Confirmation from the service log:**
```
Listening on 127.0.0.1:11435 (version 0.32.15)
inference compute id=0 library=CUDA compute=12.0 name=CUDA0 available="6.9 GiB"
```

`compute=12.0` is the key line — Ollama compiled for Blackwell correctly.

---

## Part 11 — vLLM

### 11.1 The first failure

```bash
docker run --rm --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8001:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-3B-Instruct-AWQ \
  --quantization awq --max-model-len 4096 --gpu-memory-utilization 0.70
```

Crashed with:
```
File ".../vllm/v1/worker/gpu/buffer_utils.py", line 47, in __init__
    raise RuntimeError("UVA is not available")
```

**What UVA is:** Unified Virtual Addressing — it lets the GPU directly access page-locked ("pinned") host memory. vLLM's V2 model runner allocates UVA buffers for request state during worker init.

**Why it failed:** WSL2 disables pinned memory by default. No pinned memory, no UVA, so the allocation fails. This is a known WSL2 issue, unrelated to Blackwell and unrelated to VRAM.

### 11.2 The fix

```bash
docker run --rm --gpus all --ipc=host \
  -e VLLM_WSL2_ENABLE_PIN_MEMORY=1 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8001:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-3B-Instruct-AWQ \
  --quantization awq --max-model-len 4096 --gpu-memory-utilization 0.70
```

**`VLLM_WSL2_ENABLE_PIN_MEMORY=1`** re-enables pinned memory on WSL2.
**`--ipc=host`** gives the container access to host shared memory, which pinned allocations need.

**Flags explained:**
- `-v ~/.cache/huggingface:/root/.cache/huggingface` — mounts the host model cache into the container, so models download once and are shared with the non-container tooling
- `-p 8001:8000` — host 8001 → container 8000
- `--quantization awq` — Activation-aware Weight Quantization, 4-bit
- `--max-model-len 4096` — maximum context length. Lower means less KV cache memory
- `--gpu-memory-utilization 0.70` — cap vLLM at 70% of VRAM. **vLLM pre-allocates its entire budget at startup regardless of need**, so this cap is the only thing standing between it and the rest of the pipeline

**Result:** `Application startup complete`, serving on 8001.

### 11.3 What the startup log revealed

| Measurement | Value |
|---|---|
| Model weights | 2.23 GiB |
| Peak activation | 0.56 GiB |
| CUDA graphs | 0.39 GiB |
| KV cache | 2.23 GiB → 65,056 tokens, 15.88× concurrency |
| **Total actual** | **2.77 GiB** of a 5.57 GiB budget |
| Cold start | 166 seconds |

vLLM itself suggested `--kv-cache-memory=1819675341` to fit the requested budget. **0.70 is over-provisioned** — dropping to ~0.50 in Phase 4 frees headroom.

**The 166-second cold start is almost entirely `torch.compile` and CUDA graph capture.** It caches to `/root/.cache/vllm` *inside* the container, which `--rm` discards. Nine benchmark runs would pay 25 minutes of pure recompilation. **Mount that cache as a volume in Phase 4.**

### 11.4 A port conflict along the way

```bash
docker ps -a
docker stop <container-id>
docker container prune -f
ss -tlnp | grep 8001
```

After the UVA crash, the API server process stayed alive holding port 8001, so the retry failed with *"port is already allocated."* `docker container prune` only removes **stopped** containers — the crashed one was still `Up`, so it had to be stopped explicitly.

`ss -tlnp` lists listening sockets: `-t` TCP, `-l` listening, `-n` numeric ports, `-p` show the process.

---

## Part 12 — Co-residency test

The question that determined whether the architecture works as designed: can the generator, embedding model and reranker all be resident simultaneously on 8GB?

```bash
uv pip install sentence-transformers
ollama run qwen2.5:3b-instruct-q4_K_M "hi" > /dev/null

python - <<'EOF'
import torch
from sentence_transformers import SentenceTransformer, CrossEncoder
emb = SentenceTransformer("BAAI/bge-small-en-v1.5", device="cuda")
rer = CrossEncoder("BAAI/bge-reranker-base", device="cuda")
print("embed :", emb.encode(["hello world"]).shape)
print("rerank:", rer.predict([("what is http", "HTTP is a protocol")]))
free, total = torch.cuda.mem_get_info()
print(f"vram free with all three: {free/1e9:.2f} GB of {total/1e9:.2f} GB")
EOF
```

**The two models:**
- **`bge-small-en-v1.5`** — an *embedding* model. Turns text into a 384-dimensional vector. Similar meanings produce nearby vectors, which is what makes semantic search work
- **`bge-reranker-base`** — a *cross-encoder*. Reads a question and a candidate passage **together** and scores the match. Far more accurate than comparing vectors, far slower — so it's used on ~50 candidates after retrieval, not across the whole corpus

**Result:**
```
embed : (1, 384)
rerank: [0.9992331]
vram free with all three: 6.03 GB of 8.55 GB
```

**All three co-resident with 6.03 GB free.** The embedder and reranker together cost roughly 500MB. No model sequencing needed — and there's room for a 7B or 8B generator later.

---

## Part 13 — Node

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
```

**Why nvm rather than `apt install nodejs`:** Ubuntu's packaged Node is often a major version or two behind. Next.js needs Node 20+. nvm installs into your home directory and allows switching versions without touching the system.

**Result:** Node v20.20.2, npm v10.8.2.

### 13.1 The PATH conflict, and the `zeroth` alias

Node worked, then vanished after activating the venv. The venv's `activate` script rewrites `PATH` to put `.venv/bin` first, and in doing so dropped nvm's node path.

Fixed with one alias that sets up both, in the right order:

```bash
cat >> ~/.bashrc <<'EOF'

# zeroth project shortcut — loads nvm after venv activation
alias zeroth='cd ~/projects/zeroth && source .venv/bin/activate && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
EOF

source ~/.bashrc
```

**Now `zeroth` is the only command needed to enter a fully configured shell.**

---

## Part 14 — Credentials

### 14.1 Hugging Face token

```bash
uv pip install "huggingface_hub[cli]"
hf auth login
hf auth whoami
```

**Why:** anonymous Hub downloads are rate-limited and slow. Phase 1 pulls several GB.

**A read token is all that's needed.** Never put a write token in a project `.env` — this repo goes public, and a leaked read token is an inconvenience while a leaked write token is a real problem.

**Incident during setup:** `cat ~/.cache/huggingface/token` was run and screenshotted, exposing an `hf_oauth_` session token. It was revoked and replaced. **Habit to build:** before screenshotting a terminal, scan for `hf_`, `gsk_`, `AIza`, `sk-`, `ghp_`, or `postgresql://user:password@`. To check a token exists without exposing it:

```bash
head -c 12 ~/.cache/huggingface/token; echo "...(length: $(wc -c < ~/.cache/huggingface/token))"
```

### 14.2 SSH key for GitHub

```bash
ssh-keygen -t ed25519 -C "asindia23@gmail.com"
cat ~/.ssh/id_ed25519.pub
ssh -T git@github.com
```

**The command:** `-t ed25519` selects a modern elliptic-curve algorithm — ~80 characters versus RSA's ~3,000, faster, at least as strong. `-C` adds a comment, which does nothing cryptographically; it's a label for identifying the key later. Naming it after the *machine* (`zeroth-wsl-omen`) is more useful than an email.

**Two files produced:**
- `~/.ssh/id_ed25519` — private key. Never leaves the machine
- `~/.ssh/id_ed25519.pub` — public key. Pasted into GitHub

**Why sharing the public key is safe:** they're mathematically linked one way only. On push, GitHub sends a challenge, the private key signs it, GitHub verifies with the public key. **The private key is never transmitted** — which is why it beats a token, where the secret itself crosses the network every time.

Added at github.com/settings/keys → New SSH key → Authentication Key.

**Result:** `Hi codelinechef! You've successfully authenticated, but GitHub does not provide shell access.` The second clause reads like an error but is correct — nobody gets a shell on GitHub.

### 14.3 Environment file

```bash
cat > .env.example <<'EOF'
# Database — always the restricted role, never postgres
DATABASE_URL=postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth

# Model serving
VLLM_BASE_URL=http://127.0.0.1:8001/v1
OLLAMA_HOST=http://127.0.0.1:11435
VLLM_WSL2_ENABLE_PIN_MEMORY=1

# LLM providers for golden-set drafting and judging
GROQ_API_KEY=
GEMINI_API_KEY=

HF_TOKEN=

# SEC EDGAR requires an identifying contact in the User-Agent
EDGAR_USER_AGENT=Anant Sharma asindia23@gmail.com
EOF

cp .env.example .env
nano .env
```

**Why two files:** `.env.example` is committed so anyone cloning the public repo knows which variables are needed. `.env` holds real secrets and is never committed.

**Why `HF_TOKEN` is in `.env` when `hf auth login` was already run:** the login writes to `~/.cache/huggingface/token`, which covers interactive work. When code runs inside a container or in CI, that file isn't present — libraries read `HF_TOKEN` from the environment instead. Same token, two places, two execution contexts.

**`EDGAR_USER_AGENT`:** the SEC blocks bulk requests that don't identify themselves with a contact email. Without it every EDGAR request returns 403 and Phase 1 can't fetch its primary corpus.

```bash
cat > .gitignore <<'EOF'
.env
.venv/
__pycache__/
*.pyc
node_modules/
.next/
out/
data/corpus/raw/
*.log
.DS_Store
EOF

git init
git add -A
git status --short
```

**Result:** `.env.example`, `.gitignore`, `docker-compose.yml` staged. **`.env` absent** — the check that matters, because a key in a public repo's history is genuinely painful to remove.

---

## Part 15 — Snapshot

```powershell
mkdir C:\wsl-backups -Force
wsl --shutdown
wsl --export zeroth C:\wsl-backups\zeroth-clean-base.tar
```

**Why this is the highest-value five minutes here:** CUDA on a new GPU generation is the most likely thing to break on a future upgrade. A verified-working backup turns a lost weekend into a coffee break.

**Why on C:** it has 577GB free versus D:'s 200GB. The distro will grow toward 120GB; keeping a 20–40GB snapshot on the same drive would squeeze it.

**Restore:**
```powershell
wsl --unregister zeroth
wsl --import zeroth D:\wsl\zeroth C:\wsl-backups\zeroth-clean-base.tar --version 2
```

**Snapshot again after Phase 1** — the golden set will be inside, and it's the one thing in this project that cannot be regenerated.

---

## Part 16 — All important paths

### Inside the distro

| Path | What it is |
|---|---|
| `/home/anant` | Home directory. `~` expands to this |
| `~/projects/zeroth` | **Project root.** Everything lives here |
| `~/projects/zeroth/.venv` | Python 3.11 virtual environment |
| `~/projects/zeroth/.env` | Real secrets. Never committed |
| `~/projects/zeroth/.env.example` | Template. Committed |
| `~/projects/zeroth/docker-compose.yml` | Postgres container definition |
| `~/projects/zeroth/docs/` | Build brief and tracker |
| `~/projects/zeroth/CLAUDE.md` | Constraints Claude Code reads every session |
| `~/.bashrc` | Shell config — CUDA vars, `OLLAMA_HOST`, nvm, the `zeroth` alias |
| `~/.cache/huggingface` | Model cache. Mounted into the vLLM container |
| `~/.cache/huggingface/token` | HF auth token |
| `~/.ollama/models` | Ollama's model store (separate from HF's) |
| `~/.ssh/id_ed25519` | Private SSH key |
| `~/.ssh/id_ed25519.pub` | Public SSH key |
| `~/.nvm` | nvm and installed Node versions |
| `~/.local/bin` | Where `uv` installed itself |
| `/usr/local/cuda-12.8` | CUDA toolkit. `CUDA_HOME` points here |
| `/usr/local/cuda` | Symlink via `/etc/alternatives` |
| `/etc/wsl.conf` | Distro config — default user, systemd |
| `/etc/docker/daemon.json` | Docker config, holds the NVIDIA runtime registration |
| `/etc/systemd/system/ollama.service.d/override.conf` | Ollama port and keep-alive |
| `/etc/apt/keyrings/docker.asc` | Docker's signing key |
| `/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg` | NVIDIA container toolkit key |
| `/etc/apt/sources.list.d/` | Added repositories — docker, nvidia-container-toolkit, cuda |
| `/mnt/c`, `/mnt/d` | Windows drives. **Never put the project here** |

### On Windows

| Path | What it is |
|---|---|
| `C:\Users\asind\.wslconfig` | Global WSL memory/CPU budget |
| `D:\wsl\zeroth\ext4.vhdx` | The distro's entire filesystem, one file |
| `C:\wsl-backups\zeroth-clean-base.tar` | Verified snapshot |
| `\\wsl.localhost\zeroth\home\anant\projects\zeroth` | The project, seen from Windows Explorer |

Note: `\\wsl.localhost\zeroth` alone is the Linux **root** (`/`), which is why `projects` isn't visible there — the full path is needed.

### Docker volumes

| Volume | What it holds |
|---|---|
| `zeroth_pgdata` | Postgres data. Survives `docker compose down` |

---

## Part 17 — Daily commands

### Starting work

```powershell
wsl -d zeroth                     # enter the distro
```
```bash
zeroth                            # cd + venv + nvm, all in one
docker compose up -d              # start Postgres
docker compose ps                 # confirm healthy
```

### Checking state

```bash
nvidia-smi                        # GPU use and what's holding VRAM
docker ps                         # running containers
docker compose logs -f db         # follow Postgres logs
sudo systemctl status ollama      # Ollama service state
curl -s http://127.0.0.1:11435/api/tags | jq .   # Ollama models
df -h ~                           # disk use inside the distro
free -h                           # RAM
htop                              # processes
```

### Database

```bash
docker compose exec db psql -U zeroth_app -d zeroth      # app role — use this
docker compose exec db psql -U postgres -d zeroth        # admin only
```

Inside `psql`: `\dt` list tables · `\d tablename` describe · `\q` quit

### Models

```bash
ollama list                                    # installed models
ollama pull <model>                            # download
ollama run <model> "prompt"                    # one-off query
ollama ps                                      # what's loaded in VRAM now

docker run --rm --gpus all --ipc=host \
  -e VLLM_WSL2_ENABLE_PIN_MEMORY=1 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8001:8000 vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-3B-Instruct-AWQ \
  --quantization awq --max-model-len 4096 --gpu-memory-utilization 0.70
```

### Python

```bash
uv pip install <package>          # install into the venv
uv pip list                       # what's installed
uv pip freeze > requirements.txt  # pin versions
```

### Git

```bash
git status --short
git add -A
git commit -m "message"
git push
```

### Stopping

```bash
docker compose down               # stop Postgres (data survives in the volume)
```
```powershell
wsl --shutdown                    # stop all WSL, frees the RAM
```

### Maintenance

```bash
docker system df                  # how much disk Docker is using
docker system prune -a            # remove unused images and containers — frees a lot
du -sh ~/.cache/huggingface       # model cache size
```
```powershell
Get-Item D:\wsl\zeroth\ext4.vhdx | Select-Object Name, @{n='SizeGB';e={[math]::Round($_.Length/1GB,2)}}
wsl --export zeroth C:\wsl-backups\zeroth-<label>.tar    # new snapshot
```

---

## Part 18 — Complete package inventory

### apt packages

| Package | Why |
|---|---|
| `build-essential` | GCC/G++/make — Python packages compile C extensions |
| `curl`, `wget` | Downloading installers and files |
| `git` | Version control |
| `ca-certificates` | Root certs for HTTPS verification |
| `gnupg` | Verifying repository signatures |
| `lsb-release` | Reports distro version for repo setup scripts |
| `software-properties-common` | apt repository management |
| `unzip` | Archive extraction |
| `jq` | JSON formatting in the terminal |
| `htop` | Process/memory monitor |
| `zstd` | Compression — required by Ollama's installer |
| `cuda-toolkit-12-8` | CUDA compiler and libraries |
| `docker-ce` | Docker daemon |
| `docker-ce-cli` | The `docker` command |
| `containerd.io` | Low-level container runtime |
| `docker-buildx-plugin` | Extended build features |
| `docker-compose-plugin` | `docker compose` |
| `nvidia-container-toolkit` | GPU access inside containers |

### Installed via script

| Tool | Method | Why |
|---|---|---|
| `uv` | astral.sh install script | Fast Python package and version manager |
| Python 3.11.16 | `uv python install` | vLLM's most reliable version |
| Ollama | ollama.com install script | Fallback local model server |
| nvm + Node 20.20.2 | nvm install script | Newer than Ubuntu's packaged Node |

### Python packages

| Package | Why |
|---|---|
| `torch`, `torchvision` (cu128) | Deep learning framework with Blackwell kernels |
| `sentence-transformers` | Embedding and cross-encoder models |
| `huggingface_hub[cli]` | Model downloads and auth |

Pulled automatically with PyTorch: `nvidia-cublas-cu12`, `nvidia-cudnn-cu12`, `nvidia-nccl-cu12`, `nvidia-cufft-cu12`, `nvidia-cusolver-cu12`, `nvidia-cusparse-cu12`, `nvidia-curand-cu12`, `nvidia-cuda-cupti-cu12`, `nvidia-cuda-nvrtc-cu12`, `nvidia-cuda-runtime-cu12`, `nvidia-nvtx-cu12`, `nvidia-nvjitlink-cu12`, `nvidia-nvshmem-cu12`, `nvidia-cufile-cu12`, `nvidia-cusparselt-cu12`, `cuda-bindings`, `cuda-pathfinder`, `cuda-toolkit`, `triton`, `numpy`, `sympy`, `mpmath`, `networkx`, `jinja2`, `markupsafe`, `filelock`, `fsspec`, `pillow`, `setuptools`, `typing-extensions`.

### Docker images

| Image | Why |
|---|---|
| `pgvector/pgvector:pg16` | Postgres 16 with pgvector precompiled |
| `vllm/vllm-openai:latest` | vLLM with prebuilt CUDA kernels |
| `nvidia/cuda:12.8.0-base-ubuntu24.04` | GPU passthrough test |

### Models

| Model | Size | Role |
|---|---|---|
| `qwen2.5:3b-instruct-q4_K_M` (Ollama) | 1.9GB | Fallback generator |
| `Qwen/Qwen2.5-3B-Instruct-AWQ` (vLLM) | ~2GB | Primary generator |
| `BAAI/bge-small-en-v1.5` | 133MB | Embeddings, 384-dim |
| `BAAI/bge-reranker-base` | 1.11GB | Cross-encoder reranking |

---

## Part 19 — Verified state

| Component | Version | Where |
|---|---|---|
| Windows NVIDIA driver | 610.88 (CUDA UMD 13.3) | Windows |
| WSL | 2.7.12 | Windows |
| Distro | Ubuntu 24.04.4, `zeroth` | `D:\wsl\zeroth` |
| CUDA toolkit | 12.8.93 | `/usr/local/cuda-12.8` |
| PyTorch | 2.11.0+cu128, sm_120 verified | `.venv` |
| Python | 3.11.16 | `.venv` |
| uv | 0.12.5 | `~/.local/bin` |
| Docker | 29.7.2 / Compose v5.5.0 | own daemon |
| nvidia-container-toolkit | 1.19.0 | registered with Docker |
| Postgres | 16 + pgvector 0.8.6 | container, port 5433 |
| Ollama | 0.32.15 | systemd, port 11435 |
| vLLM | 0.27.1 | container, port 8001 |
| Node | 20.20.2 / npm 10.8.2 | nvm |
| VRAM | 8.55 GB total, 7.29 GB free idle | — |
| Co-residency | 3 models, 6.03 GB free | confirmed |

**Running cost: ₹0/month.**

---

## Part 20 — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `nvidia-smi` fails in Linux | Driver installed inside WSL, or stale session | Never install a driver in Linux; `wsl --shutdown` |
| `no kernel image is available` | PyTorch lacks sm_120 | Reinstall from the cu128 index |
| `nvcc: command not found` | PATH not set | Re-add the CUDA block to `~/.bashrc` |
| `UVA is not available` (vLLM) | WSL2 pinned memory disabled | `--ipc=host` + `VLLM_WSL2_ENABLE_PIN_MEMORY=1` |
| `port is already allocated` | Crashed container still holding it | `docker ps -a` → `docker stop <id>` |
| Docker permission denied | Group change not applied | `wsl --terminate zeroth`, reopen |
| Docker socket conflicts | Docker Desktop integration still on | Turn `zeroth` off in Docker Desktop settings |
| `node: command not found` after venv | venv `activate` rewrote PATH | Use the `zeroth` alias |
| Ollama on CPU | GPU not detected at service start | `journalctl -u ollama -n 50`, restart |
| vLLM OOM | Taking all VRAM | Lower `--gpu-memory-utilization` or `--max-model-len` |
| Download timeouts | Slow CDN | `UV_HTTP_TIMEOUT=600`, retry — partial downloads resume |
| apt install silently incomplete | Mirror hiccup mid-transaction | Verify with `dpkg -s`, reinstall individually |
| Everything slow | Project on `/mnt/c` | Move to `~/projects/` |
| D: filling up | WSL disk grows, never shrinks | `wsl --manage zeroth --set-sparse true` |
| `cannot attach stdin to a TTY` | heredoc into `docker compose exec` | Add `-T` |
| Explorer can't find `~/projects/zeroth` | `~` isn't a Windows concept | Use `\\wsl.localhost\zeroth\home\anant\projects\zeroth` |

**Total reset:**
```powershell
wsl --unregister zeroth
```
The other distro, Switchboard work, and Windows are untouched. That is the entire point of the isolation.
