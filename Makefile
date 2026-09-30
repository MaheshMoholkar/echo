# Echo: AI customer support (chat + voice) that runs entirely on one Mac.
# Needs Postgres with pgvector and Ollama; settings come from the root .env.
export PYDANTIC_AI_NO_BANNER := 1

# Next.js only reads env files from web/, so export the root .env for it.
LOAD_ENV := set -a; [ -f ../.env ] && . ../.env; set +a;

KOKORO_DIR := $(HOME)/.cache/pipecat/kokoro-onnx
KOKORO_RELEASE := https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0

.PHONY: setup migrate auth-migrate voice-models dev web api voice test check seed eval voice-eval voice-latency

setup:            ## install deps, create tables, fetch voice models
	cd api && uv sync
	cd voice && uv sync
	cd web && pnpm install
	$(MAKE) auth-migrate migrate voice-models

migrate:          ## apply app migrations (Alembic, `public` schema)
	cd api && uv run alembic upgrade head

auth-migrate:     ## create/update Better Auth's tables in the `auth` schema
	cd web && $(LOAD_ENV) psql "$$DATABASE_URL" -qc 'create schema if not exists auth'
	cd web && $(LOAD_ENV) pnpm dlx auth@1.7.6 migrate --config lib/auth.ts --yes

voice-models:     ## Kokoro voices + MLX weights (~340 MB), Whisper large-v3-turbo q4 (~460 MB); resumable
	mkdir -p $(KOKORO_DIR)
	curl -fL -C - -o $(KOKORO_DIR)/voices-v1.0.bin $(KOKORO_RELEASE)/voices-v1.0.bin
	cd voice && uv run python -c "from huggingface_hub import snapshot_download as d; from echo_voice import kokoro_mlx as k; print(d(k.MODEL, allow_patterns=k.MODEL_FILES)); print(d('mlx-community/whisper-large-v3-turbo-q4'))"

dev:              ## run web (:3000), api (:8000) and the voice bot (:8001) together
	$(MAKE) -j3 web api voice

web:
	cd web && $(LOAD_ENV) pnpm dev

api:
	cd api && uv run fastapi dev src/echo_api/main.py --host 127.0.0.1 --port 8000

voice:            ## the voice bot (no auto-reload: its models take seconds to load)
	cd voice && uv run echo-voice

seed:             ## a demo login, organization and the sample knowledge base (with make dev running)
	cd api && uv run python scripts/seed.py

test:             ## api + voice tests (need Postgres; the LLM, embeddings and OCR are faked)
	cd api && uv run pytest -q
	cd voice && uv run pytest -q

check:            ## lint, format and type checks
	cd api && uv run ruff check . && uv run ruff format --check .
	cd voice && uv run ruff check . && uv run ruff format --check .
	cd web && pnpm lint && pnpm typecheck

eval:             ## grounding eval with the real model: make eval ORG=<organization id> [RUNS=2]
	cd api && uv run python scripts/eval_grounding.py $(ORG) $(or $(RUNS),1)

voice-eval:       ## voice answers vs knowledge-base passages: make voice-eval ORG=<id> [RUNS=2]
	cd voice && uv run python scripts/eval_voice.py $(ORG) $(or $(RUNS),1)

voice-latency:    ## a scripted voice call, timed as heard: make voice-latency ORG=<id> [COLD=1]
	cd voice && uv run python scripts/call_latency.py $(ORG) $(if $(COLD),--cold)
