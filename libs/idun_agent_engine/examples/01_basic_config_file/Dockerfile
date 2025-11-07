
        FROM python:3.13-slim

        RUN apt-get update
        RUN pip install uv

        WORKDIR /app

        RUN pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ --pre idun-agent-engine==0.2.1.dev20251107202749

        COPY requirements.txt .

        RUN pip install -r requirements.txt
        RUN echo 'Agent finished packaging'

        CMD ["idun", "agent", "serve", "--source=file --path config.yaml"]
        