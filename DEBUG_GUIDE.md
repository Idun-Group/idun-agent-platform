# Debugging Idun Agent Manager with Docker

This guide explains how to debug the `idun-agent-manager` service running inside Docker using VS Code.

## Prerequisites

1.  Ensure you have the `docker-compose.debug.yml` file in your root directory.
2.  Ensure you have the `Docker: Attach to Manager` configuration in your `.vscode/launch.json`.

## Steps

### 1. Start the Docker Stack in Debug Mode

If you have existing containers running, stop them first (Ctrl+C).

Run the following command to start the stack with the debug configuration enabled:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.debug.yml up --build
```

This command:
- Starts the services defined in `docker-compose.dev.yml`.
- Overrides the `manager` service with configurations from `docker-compose.debug.yml`.
- Installs `debugpy` and starts the server waiting for a debugger connection on port `5678`.
- **Note**: Hot-reload is disabled in this mode to ensure stable debugging. The service will pause at startup until you attach the debugger.

### 2. Attach the VS Code Debugger

1.  Open VS Code.
2.  Go to the **Run and Debug** view (Sidebar or `Cmd+Shift+D` / `Ctrl+Shift+D`).
3.  Select **"Docker: Attach to Manager"** from the dropdown menu.
4.  Click the **Play** button (green triangle) or press **F5**.

### 3. Debugging

- The debugger should connect to the running Docker container.
- You can now set breakpoints in your code (e.g., in `services/idun_agent_manager/src` or `libs/idun_agent_schema`).
- Trigger the code path (e.g., via API request), and the execution will pause at your breakpoints.

## Troubleshooting

-   **Connection Refused**: Ensure the Docker container is fully started and you see a log message indicating `uvicorn` (or `debugpy`) is listening.
-   **Changes not showing**: The configuration uses hot-reloading (`--reload`), but sometimes a container restart is needed for dependency changes.
