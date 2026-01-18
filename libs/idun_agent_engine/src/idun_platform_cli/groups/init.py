import sys

import click

from idun_platform_cli.tui.main import IdunApp


@click.command("init")
def init_command() -> None:
    """Starts a terminal user interface that guides you through configuring and managing Idun agents."""
    try:
        app = IdunApp()
        app.run()
    except ImportError as e:
        print(f"[ERROR]: Missing required dependency for TUI: {e}")
        print("[INFO]: Make sure 'textual' is installed in your environment")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[INFO]: Initialization cancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"[ERROR]: Failed to launch the Idun TUI: {e}")
    sys.exit(1)
