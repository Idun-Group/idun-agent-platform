# Idun Agent Manager - Containerized Architecture

Welcome to the refactored, containerized version of the Idun Agent Manager. This new architecture uses Docker and Traefik to provide a secure, scalable, and isolated environment for each AI agent.

The old method of loading agents from a local file path using `importlib` has been **completely replaced** by a Docker-based deployment workflow.

## Prerequisites

-   Docker and Docker Compose installed and running on your machine.
-   Python 3.10+ (for interacting with the backend if needed).
-   A `.zip` file of your agent's code. The zip file should contain at minimum:
    -   `main.py`: A FastAPI application for your agent.
    -   `requirements.txt`: A list of your agent's Python dependencies.

## Setup and Installation

Follow these steps to set up the environment and run the application.

### 1. Initial Setup

Clone the repository and navigate to the project root directory.

### 2. Build and Start the Core Services

The first time you run the application, you need to build the main backend controller and start the Traefik proxy. This is done using `docker-compose`.

```bash
docker-compose up -d --build backend
```

-   `docker-compose up`: This command starts the services defined in `docker-compose.yml`.
-   `-d`: Runs the containers in detached mode (in the background).
-   `--build backend`: Forces a build of the `backend` service's Docker image before starting it.

After this step, you will have two services running:
-   **`idun-backend-controller`**: The main FastAPI application.
-   **`idun-traefik-proxy`**: The Traefik reverse proxy.

You can check the status of your containers with `docker ps`.

### 3. Verify the Setup

-   **Backend API**: The main controller's API should be accessible through Traefik at `http://localhost/api`. (Note: The root path of the backend isn't exposed through Traefik in this setup, but its endpoints under `/api` would be if configured).
-   **Traefik Dashboard**: You can view the Traefik dashboard to see configured routers and services at `http://localhost:8080/dashboard/`.

## New Workflow: Deploying an Agent

With the old `importlib` logic removed, here is the new, secure workflow for deploying an agent:

1.  **Prepare Your Agent**:
    Ensure your agent code is in a directory with a `main.py` (your FastAPI app for the agent) and a `requirements.txt`. Create a `.zip` archive of this directory.

2.  **Upload Your Agent**:
    Use an API client (like Postman, Insomnia, or a `curl` command) to send a `POST` request to the `/upload-agent` endpoint.

    **Example using `curl`:**
    ```bash
    curl -X POST "http://localhost:8000/upload-agent" \
         -F "agent_name=MyFirstAgent" \
         -F "file=@/path/to/your/agent.zip"
    ```
    *(Note: We are calling port 8000 directly here for simplicity, but in a production setup, this would also go through the Traefik proxy on port 80).*

3.  **Backend Orchestration**:
    When you send this request, the backend controller performs the following actions automatically:
    -   Creates a unique, isolated directory for your agent.
    -   Generates a `Dockerfile` tailored to your agent.
    -   Builds a new Docker image for your agent.
    -   Updates `docker-compose.yml` with a new service definition for your agent.
    -   Starts your agent as a new container.

4.  **Access Your Deployed Agent**:
    The API response will provide you with the URL to access your newly deployed agent, which will look something like this:
    `http://localhost/agents/agent-myfirstagent-abcdef`

    Traefik will automatically route requests to this path to your agent's container.

You can now interact with your agent's API securely at its unique URL. Each new agent you upload will get its own isolated container and URL.
