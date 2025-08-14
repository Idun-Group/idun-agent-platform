"""
Simple ADK Agent Example

This example demonstrates how to create a simple ADK agent with a basic tool.
"""


def get_weather(location: str) -> str:
    """
    Get the current weather for a location.

    Args:
        location: The city or location to get weather for

    Returns:
        A weather description string
    """
    # This is a mock weather function for demonstration
    weather_data = {
        "paris": "Sunny, 22°C",
        "london": "Cloudy, 15°C",
        "new york": "Rainy, 18°C",
        "tokyo": "Clear, 25°C",
        "sydney": "Partly cloudy, 20°C",
    }

    location_lower = location.lower()
    if location_lower in weather_data:
        return f"The weather in {location} is: {weather_data[location_lower]}"
    else:
        return f"Weather data not available for {location}. Try Paris, London, New York, Tokyo, or Sydney."


def calculate_sum(a: float, b: float) -> float:
    """
    Calculate the sum of two numbers.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    return a + b


# ADK Agent configuration
AGENT_CONFIG = {
    "name": "SimpleADKAgent",
    "model": "gemini-2.0-flash",
    "description": "A simple ADK agent that can check weather and do basic math",
    "instruction": """You are a helpful assistant that can:
1. Check the weather for different cities (Paris, London, New York, Tokyo, Sydney)
2. Calculate the sum of two numbers

Be friendly and helpful in your responses. When users ask about weather, use the get_weather tool.
When they ask for mathematical calculations involving addition, use the calculate_sum tool.""",
    "tools": [get_weather, calculate_sum],
}
