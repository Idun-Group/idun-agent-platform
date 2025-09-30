def _parse_component_definition(component_definition: str) -> tuple[str, str]:
    try:
        if ":" not in component_definition:
            raise ValueError(
                f" component_definition must be in format: 'path/to/my/module.py:component_variable_name"
                f"got: {component_definition}"
            )
        module_path, component_variable_name = component_definition.rsplit(":", 1)
        return module_path, component_variable_name
    except Exception as e:
        raise ValueError(
            f"Invalid Component Definition format: {component_definition}"
        ) from e
