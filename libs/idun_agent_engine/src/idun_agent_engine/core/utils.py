"""Engine utility functions."""

from .._version import __version__

_ART = r"""    ____    __               ___                    __     ____  __      __  ____
   /  _/___/ /_  ______     /   | ____ ____  ____  / /_   / __ \/ /___ _/ /_/ __/___  _________ ___
   / // __  / / / / __ \   / /| |/ __ `/ _ \/ __ \/ __/  / /_/ / / __ `/ __/ /_/ __ \/ ___/ __ `__ \
 _/ // /_/ / /_/ / / / /  / ___ / /_/ /  __/ / / / /_   / ____/ / /_/ / /_/ __/ /_/ / /  / / / / / /
/___/\__,_/\__,_/_/ /_/  /_/  |_\__, /\___/_/ /_/\__/  /_/   /_/\__,_/\__/_/  \____/_/  /_/ /_/ /_/
                               /____/"""

_WIDTH = max(len(line) for line in _ART.splitlines()) + 4

# ANSI colors
_YELLOW = "\033[33m"
_RED = "\033[31m"
_PURPLE = "\033[35m"
_GREEN = "\033[32m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RESET = "\033[0m"

_COLORS = [_YELLOW, _RED, _PURPLE, _GREEN]


def _colorize_line(line: str) -> str:
    """Apply a gradient of 4 colors across a single line."""
    if not line.strip():
        return line
    chunk_size = max(1, len(line) // len(_COLORS))
    result = ""
    for i, color in enumerate(_COLORS):
        start = i * chunk_size
        end = (i + 1) * chunk_size if i < len(_COLORS) - 1 else len(line)
        result += f"{_BOLD}{color}{line[start:end]}{_RESET}"
    return result


def print_banner() -> None:
    """Print the Idun Agent Platform startup banner."""
    lines = _ART.splitlines()
    border_color = _PURPLE

    output = f"{border_color}╔{'═' * _WIDTH}╗{_RESET}\n"
    output += f"{border_color}║{' ' * _WIDTH}║{_RESET}\n"

    for line in lines:
        padded = f"{line:<{_WIDTH - 2}}"
        colored = _colorize_line(padded)
        output += f"{border_color}║{_RESET} {colored} {border_color}║{_RESET}\n"

    output += f"{border_color}║{' ' * _WIDTH}║{_RESET}\n"
    output += (
        f"{border_color}║{_RESET} "
        f"{_DIM}{'v' + __version__:>{_WIDTH - 2}}{_RESET} "
        f"{border_color}║{_RESET}\n"
    )
    output += f"{border_color}╚{'═' * _WIDTH}╝{_RESET}"

    print(output)  # noqa: T201
