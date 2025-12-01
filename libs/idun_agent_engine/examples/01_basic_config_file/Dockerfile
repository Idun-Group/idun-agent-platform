FROM python:3.12-slim
RUN apt-get update && pip install uv
# TODO: use fixed version from PyPI
# RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
#     --extra-index-url https://pypi.org/simple idun-agent-schema==0.2.1.dev20251118083710 \
#     --index-strategy unsafe-best-match --prerelease=allow

# RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
#     --extra-index-url https://pypi.org/simple idun-agent-engine==0.2.1.dev20251118083707 \
#     --index-strategy unsafe-best-match --prerelease=allow

RUN uv pip install idun-agent-schema==0.3.0 --system
RUN uv pip install idun-agent-engine==0.3.0 --system

COPY requirements.txt .
COPY config.yaml .
COPY . .
RUN uv pip install -r requirements.txt --system

CMD ["idun", "agent", "serve", "--source=manager"]
