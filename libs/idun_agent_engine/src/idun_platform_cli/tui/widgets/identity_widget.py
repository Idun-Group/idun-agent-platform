"""Identity configuration widget."""

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import DirectoryTree, Input, Markdown, OptionList, Static
from textual.widgets.option_list import Option

HELP_TEXT = """
**Quick Guide**

- **Name** : Name of your agent
- **Framework** : LangGraph/ADK/Haystack
- **Port** : Network port
- **Graph** : Select .py file + variable

[📚 Docs](https://idun-group.github.io/idun-agent-platform) | [💬 Help](https://discord.gg/KCZ6nW2jQe)
"""


class IdentityWidget(Widget):
    full_definition = reactive("")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.selected_file_path = ""

    def compose(self) -> ComposeResult:
        agent_info_section = Horizontal(
            classes="section section-split agent-info-section"
        )
        agent_info_section.border_title = "Agent Information"

        with agent_info_section:
            identity_container = Vertical(classes="form-fields-container")
            identity_container.border_title = "Identity"

            with identity_container:
                with Horizontal(classes="field-row"):
                    yield Static("Name:", classes="field-label")
                    yield Input(
                        value="my-agent", classes="field-input", id="name_input"
                    )

                with Horizontal(classes="field-row framework-row"):
                    yield Static("Framework:", classes="field-label")
                    yield OptionList(
                        Option("LANGGRAPH", id="LANGGRAPH"),
                        Option("ADK", id="ADK"),
                        Option("HAYSTACK", id="HAYSTACK"),
                        classes="field-input",
                        id="framework_select",
                    )

                with Horizontal(classes="field-row"):
                    yield Static("Port:", classes="field-label")
                    yield Input(value="8008", classes="field-input", id="port_input")

                yield Static("", classes="error-message", id="identity_error")

            with Vertical(classes="info-panel"):
                yield Markdown(HELP_TEXT, classes="help-markdown")

        graph_section = Vertical(classes="graph-definition-section")
        graph_section.border_title = "Graph Definition"

        with graph_section:
            with Horizontal(classes="graph-def-row"):
                tree_container = Vertical(classes="tree-container")
                tree_container.border_title = "Select Python File"
                with tree_container:
                    yield DirectoryTree(".", id="file_tree")

                var_container = Vertical(classes="var-container")
                var_container.border_title = "Select Variable"
                with var_container:
                    yield OptionList(
                        classes="var-list",
                        id="variable_list",
                    )

            path_container = Vertical(classes="path-display-container")
            path_container.border_title = "Agent Path"
            with path_container:
                yield Static(
                    "Select file and variable",
                    classes="full-definition-display",
                    id="full_definition",
                )

    def on_mount(self) -> None:
        option_list = self.query_one("#framework_select", OptionList)
        option_list.highlighted = 0
        self._update_section_labels()

    def watch_full_definition(self, value: str) -> None:
        self.query_one("#full_definition", Static).update(
            value if value else "Select file and variable"
        )

    def on_directory_tree_file_selected(
        self, event: DirectoryTree.FileSelected
    ) -> None:
        selected_path = str(event.path)

        if selected_path.endswith(".py"):
            self.selected_file_path = selected_path
            self._parse_python_file(selected_path)
            self._update_full_definition()
        else:
            self.app.notify("Please select a Python file", severity="warning")

    def _parse_python_file(self, file_path: str) -> None:
        import ast

        try:
            with open(file_path, "r") as f:
                tree = ast.parse(f.read())

            variables = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            variables.append(target.id)

            var_list = self.query_one("#variable_list", OptionList)
            var_list.clear_options()

            if variables:
                for var in variables:
                    var_list.add_option(Option(var, id=var))
                var_list.highlighted = 0
            else:
                var_list.add_option(Option("No variables found", id="none"))

        except Exception:
            self.app.notify("Error parsing file. Make sure it's a valid Python file.", severity="error")

    def on_option_list_option_highlighted(
        self, event: OptionList.OptionHighlighted
    ) -> None:
        if event.option_list.id == "variable_list":
            self._update_full_definition()
        elif event.option_list.id == "framework_select":
            self._update_section_labels()

    def _update_section_labels(self) -> None:
        framework_select = self.query_one("#framework_select", OptionList)
        if framework_select.highlighted is not None:
            framework_option = framework_select.get_option_at_index(framework_select.highlighted)
            framework = str(framework_option.id)

            graph_section = self.query_one(".graph-definition-section", Vertical)

            if framework == "LANGGRAPH":
                graph_section.border_title = "Graph Definition"
            elif framework == "ADK":
                graph_section.border_title = "Agent Definition"
            elif framework == "HAYSTACK":
                graph_section.border_title = "Pipeline Definition"

    def _update_full_definition(self) -> None:
        if not self.selected_file_path:
            self.full_definition = ""
            return

        var_list = self.query_one("#variable_list", OptionList)
        var_index = var_list.highlighted

        if var_index is not None and var_list.option_count > 0:
            try:
                variable_option = var_list.get_option_at_index(var_index)
                variable_name = str(variable_option.id)
                self.full_definition = f"{self.selected_file_path}:{variable_name}"
            except:
                self.full_definition = self.selected_file_path
        else:
            self.full_definition = self.selected_file_path

    def validate(self) -> bool:
        self.query_one("#identity_error", Static).update("")

        port = self.query_one("#port_input", Input).value
        name = self.query_one("#name_input", Input).value

        if not port or not name:
            self.query_one("#identity_error", Static).update(
                "Agent name or port is empty!"
            )
            self.app.notify("Agent name and port are required!", severity="error")
            return False

        var_list = self.query_one("#variable_list", OptionList)
        var_index = var_list.highlighted

        if not self.selected_file_path or var_index is None:
            self.query_one("#identity_error", Static).update(
                "Please select a file and variable"
            )
            self.app.notify("Graph definition incomplete!", severity="error")
            return False

        return True

    def get_data(self) -> dict:
        var_list = self.query_one("#variable_list", OptionList)
        var_index = var_list.highlighted

        variable_name = ""
        if var_index is not None and var_list.option_count > 0:
            variable_option = var_list.get_option_at_index(var_index)
            variable_name = str(variable_option.id)

        graph_definition = (
            f"{self.selected_file_path}:{variable_name}"
            if self.selected_file_path
            else ""
        )

        option_list = self.query_one("#framework_select", OptionList)
        index = option_list.highlighted
        framework = "LANGGRAPH"
        if index is not None:
            selected_option = option_list.get_option_at_index(index)
            framework = str(selected_option.id)

        return {
            "name": self.query_one("#name_input", Input).value,
            "framework": framework,
            "port": self.query_one("#port_input", Input).value,
            "graph_definition": graph_definition,
        }
