
        FROM python:3.13-slim
        RUN apt-get update
        RUN pip install uv
        WORKDIR /app


        RUN uv pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
            --extra-index-url https://pypi.org/simple idun-agent-engine==0.2.1.dev20251117114240 \
            --index-strategy unsafe-best-match --prerelease=allow

        RUN uv  pip install --system --no-cache-dir --index-url https://test.pypi.org/simple/ \
            --extra-index-url https://pypi.org/simple idun-agent-engine \
            --index-strategy unsafe-best-match --prerelease=allow

        COPY requirements.txt ./
        RUN uv pip install -r requirements.txt --system
        RUN echo 'Agent finished packaging'

        CMD ["idun", "agent", "serve", "--source=file --path config.yaml"]
        