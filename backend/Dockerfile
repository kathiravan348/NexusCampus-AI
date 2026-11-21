# NexusCampus API and worker image (NEX-064). One image, two commands: the API (default) and `nexus-worker`.
# Build from the repository root:  docker build -f backend/Dockerfile -t nexuscampus-api backend
# Multi-stage, non-root, dependencies locked by uv.lock; base images pinned by digest.

FROM ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc AS uv

FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin nexus
WORKDIR /app
COPY --from=build --chown=nexus:nexus /app/.venv /app/.venv
COPY --chown=nexus:nexus alembic.ini ./
COPY --chown=nexus:nexus migrations ./migrations
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 NEXUS_HOST=0.0.0.0 NEXUS_PORT=8000
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"
CMD ["uvicorn", "nexus.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
