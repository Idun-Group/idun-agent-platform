"""MCPs validation logic."""

from idun_agent_schema.engine.mcp_server import MCPServer


def validate_mcp_servers(
    mcp_servers_data: list[dict],
) -> tuple[list[MCPServer] | None, str]:
    if not mcp_servers_data:
        return [], "ok"

    try:
        validated_servers = []
        seen_names = set()

        for idx, server_data in enumerate(mcp_servers_data):
            name = server_data.get("name", "")
            if not name:
                return None, f"Server {idx + 1}: Name is required"

            if name in seen_names:
                return None, f"Duplicate server name: {name}"
            seen_names.add(name)

            transport = server_data.get("transport", "streamable_http")

            if transport == "stdio":
                if not server_data.get("command"):
                    return (
                        None,
                        f"Server '{name}': command is required for stdio transport",
                    )
            elif transport in [
                "sse",
                "streamable_http",
                "websocket",
            ] and not server_data.get("url"):
                return (
                    None,
                    f"Server '{name}': url is required for {transport} transport",
                )

            args = server_data.get("args", [])
            if isinstance(args, str):
                args = [a.strip() for a in args.split("\n") if a.strip()]

            headers = server_data.get("headers", {})
            if isinstance(headers, str):
                import json

                try:
                    headers = json.loads(headers) if headers.strip() else {}
                except json.JSONDecodeError:
                    return None, f"Server '{name}': Invalid JSON for headers"

            env = server_data.get("env", {})
            if isinstance(env, str):
                import json

                try:
                    env = json.loads(env) if env.strip() else {}
                except json.JSONDecodeError:
                    return None, f"Server '{name}': Invalid JSON for env"

            server_config = {
                "name": name,
                "transport": transport,
            }

            if server_data.get("url"):
                server_config["url"] = server_data["url"]
            if headers:
                server_config["headers"] = headers
            if server_data.get("command"):
                server_config["command"] = server_data["command"]
            if args:
                server_config["args"] = args
            if env:
                server_config["env"] = env

            validated_server = MCPServer.model_validate(server_config)
            validated_servers.append(validated_server)

        return validated_servers, "ok"

    except Exception as e:
        return None, f"Validation error: {str(e)}"
