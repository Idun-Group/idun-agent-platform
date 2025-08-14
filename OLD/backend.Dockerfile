# Use an official Python runtime as a parent image
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container at /app
COPY pyproject.toml poetry.lock ./

# Install poetry and dependencies
RUN pip install poetry
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --no-root

# Copy the application code into the container at /app
COPY idun_agent_manager ./idun_agent_manager/
COPY engine ./engine/
# Copy the docker-compose file into the container at /app
COPY docker-compose.yml ./

# Expose the port the app runs on
EXPOSE 8000

# Define the command to run the application
CMD ["poetry", "run", "uvicorn", "idun_agent_engine.server.main:app", "--host", "0.0.0.0", "--port", "8000"]
