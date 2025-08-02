
FROM python:3.13-slim
WORKDIR /agent
COPY . .
RUN if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
CMD ["uvicorn", "simple_graph:simple_test_graph", "--host", "0.0.0.0", "--port", "8001"]
