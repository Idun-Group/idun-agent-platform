FROM python:3.12-slim
RUN apt-get update && pip install uv
WORKDIR /app
# TODO: use fixed version from PyPI
RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
    --extra-index-url https://pypi.org/simple idun-agent-schema==0.2.1.dev194467807151 \
    --index-strategy unsafe-best-match --prerelease=allow

RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
    --extra-index-url https://pypi.org/simple idun-agent-engine==0.2.1.dev194467807051 \
    --index-strategy unsafe-best-match --prerelease=allow

COPY requirements.txt ./
COPY config.yaml ./
COPY agent/ ./agent/
RUN uv pip install -r requirements.txt --system

CMD ["idun", "agent", "serve", "--source=file", "--path", "config.yaml"]
