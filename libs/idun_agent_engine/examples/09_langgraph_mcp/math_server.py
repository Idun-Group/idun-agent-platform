from fastmcp import FastMCP  # type: ignore[import-not-found]

mcp = FastMCP("Math")


@mcp.tool()
def double(n: int) -> int:
    """Double a number."""
    return n * 2


@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


if __name__ == "__main__":
    mcp.run(transport="stdio")
