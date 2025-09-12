from haystack.components.agents import Agent
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.tools import Tool
from haystack.utils import Secret
import random
from typing import Dict, Any

def dice_roller(sides: int = 6, count: int = 1) -> Dict[str, Any]:
    if sides < 2:
        return {"error": "Dice must have at least 2 sides"}
    if count < 1 or count > 20:
        return {"error": "Must roll between 1 and 20 dice"}

    rolls = [random.randint(1, sides) for _ in range(count)]
    total = sum(rolls)

    return {
        "rolls": rolls,
        "total": total,
        "count": count,
        "sides": sides,
        "average": round(total / count, 2)
    }

<<<<<<< HEAD
SYSTEM_PROMPT = """You are a helpful assistant with access to a dice rolling tool. 
=======
SYSTEM_PROMPT = """You are a helpful assistant with access to a dice rolling tool.
>>>>>>> 7a79cf9 (feat: Haystach agent/pipeline integration with config.yaml change)

You should use the dice_roller tool when:
- The user asks you to roll dice (any number of sides, any quantity)
- The user wants to make a random choice between options (you can assign numbers to options and roll)
- The user needs a random number for games, decision-making, or probability exercises
- The user mentions terms like "roll", "dice", "random", "chance", "pick randomly", etc.

When using the dice roller:
- For standard dice, use 6 sides
- For choosing between N options, use N sides and roll once
- For more randomness in decisions, you can roll multiple dice
- Always explain what you're rolling and why

Be conversational and helpful. If the user doesn't need the dice tool, just respond normally without using it."""

def get_agent():
    dice_tool = Tool(
        name="dice_roller",
        description="Roll one or more dice with specified number of sides. Use for random number generation, decision making, or games.",
        function=dice_roller,
        parameters={
            "sides": {
                "type": "integer",
                "description": "Number of sides on each die (minimum 2, maximum 100)",
                "default": 6
            },
            "count": {
                "type": "integer",
                "description": "Number of dice to roll (minimum 1, maximum 20)",
                "default": 1
            }
        }
    )
<<<<<<< HEAD
    
=======

>>>>>>> 7a79cf9 (feat: Haystach agent/pipeline integration with config.yaml change)
    generator = OpenAIChatGenerator(
        api_key=Secret.from_token("KEY"),
        model="llama-3.3-70b-versatile",
        api_base_url="https://api.groq.com/openai/v1"
    )
<<<<<<< HEAD
    
=======

>>>>>>> 7a79cf9 (feat: Haystach agent/pipeline integration with config.yaml change)
    agent = Agent(
        chat_generator=generator,
        system_prompt=SYSTEM_PROMPT,
        tools=[dice_tool],
    )

    return agent

agent = get_agent()
