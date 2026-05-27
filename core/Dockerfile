ARG DEFAULT_REGISTRY=docker.io
ARG DEFAULT_IMAGE=python
ARG DEFAULT_TAG=3.10-slim
FROM ${DEFAULT_REGISTRY}/${DEFAULT_IMAGE}:${DEFAULT_TAG} AS sdk-builder

# ----- Build DAO wheel -----
# hadolint ignore=DL3013
RUN pip install --no-cache-dir hatchling
COPY SDKs/DAO /tmp/daolib
RUN pip wheel --no-deps --wheel-dir /tmp/dao-wheel /tmp/daolib


FROM ${DEFAULT_REGISTRY}/${DEFAULT_IMAGE}:${DEFAULT_TAG}

# ----- Environment Setup -----
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/root/.local/bin:$PATH"

# ----- Install system dependencies -----
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        build-essential \
        libpq-dev \
        sqlite3 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ----- Install uv -----
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

WORKDIR /app

# ----- Install DAO wheel from builder stage -----
COPY --from=sdk-builder /tmp/dao-wheel /tmp/dao-wheel
RUN uv pip install --system /tmp/dao-wheel/*.whl && rm -rf /tmp/dao-wheel

# ----- Copy and install application dependencies -----
COPY pyproject.toml /app/
RUN uv pip install --system -r pyproject.toml

# ----- Copy application code -----
COPY core/ /app/

# ----- Create directory for SQLite database -----
RUN mkdir -p /app/data && chmod 755 /app/data

# ----- Expose port -----
EXPOSE 8000

# ----- Health check -----
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# ----- Default command -----
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
