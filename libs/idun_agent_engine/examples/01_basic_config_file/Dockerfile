
        FROM python:3.13-slim
        RUN apt-get update
        RUN pip install uv
        WORKDIR /app

        # Temp, until we push the cli with the engine
        COPY ../../idun_platform_cli /tmp/idun_platform_cli
        RUN uv pip install --system /tmp/idun_platform_cli

        COPY requirements.txt ./
        RUN uv pip install -r requirements.txt --system
        RUN echo 'Agent finished packaging'

        CMD ["idun", "agent", "serve", "--source=manager"]
        