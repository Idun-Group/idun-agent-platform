import asyncio
import random
import string

import httpx

API_BASE = "http://agent-manager-dev:8000"
ENDPOINT = f"{API_BASE}/api/v1/agents/"  # trailing slash is required


def rand_suffix(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def make_payload(i: int) -> dict:
    kind = ["langgraph", "crewai", "custom"][i % 3]
    base_name = {
        "langgraph": "LG",
        "crewai": "Crew",
        "custom": "Custom",
    }[kind]
    name = f"{base_name} Agent {i:02d}-{rand_suffix()}"
    desc = f"Seeded {kind} agent #{i}"

    if kind == "langgraph":
        agent_config = {
            "type": "langgraph",
            "config": {
                "name": name,
                "graph_definition": "./examples/01_basic_config_file/example_agent.py:app",
            },
        }
    elif kind == "crewai":
        agent_config = {
            "type": "crewai",
            "config": {
                "name": name,
                "crew_definition": "./path/to/crew.py:crew",
            },
        }
    else:
        agent_config = {
            "type": "custom",
            "config": {
                "name": name,
                "entrypoint": "./path/to/entry.py:main",
            },
        }

    return {
        "name": name,
        "description": desc,
        "config": {"agent": agent_config},
    }


async def seed(n: int = 50) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        successes = 0
        for i in range(n):
            payload = make_payload(i)
            resp = await client.post(ENDPOINT, json=payload)
            if resp.status_code == 201:
                data = resp.json()
                print(f"[{i+1}/{n}] Created: {data.get('id')} - {data.get('name')}")
                successes += 1
            else:
                print(f"[{i+1}/{n}] Failed {resp.status_code}: {resp.text}")
        print(f"Done. Created {successes}/{n} agents.")


if __name__ == "__main__":
    asyncio.run(seed(50))
