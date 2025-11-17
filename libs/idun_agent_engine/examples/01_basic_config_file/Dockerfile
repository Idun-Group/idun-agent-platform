FROM python:3.13-slim
RUN apt-get update && pip install uv
WORKDIR /app

RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
    --extra-index-url https://pypi.org/simple idun-agent-engine \
    --index-strategy unsafe-best-match --prerelease=allow

COPY requirements.txt ./
COPY config.yaml ./
RUN uv pip install -r requirements.txt --system

CMD ["idun", "agent", "serve", "--source=file", "--path", "config.yaml"]
