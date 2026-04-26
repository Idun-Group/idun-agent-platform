"""Phase 2 P2.6: Theme runtime config must deep-merge persisted overrides.

The previous shallow merge clobbered nested dicts: overriding a single
``colors.light.accent`` token wiped the other 17 light tokens AND the
entire dark-mode scheme. The fix recursively merges dicts; scalars and
lists override (per spec D6 — saved ``starterPrompts`` replaces the
default, not extend it).
"""

from __future__ import annotations

from idun_agent_standalone.theme.runtime_config import (
    DEFAULT_THEME,
    _deep_merge,
    merge_theme,
)


def test_partial_color_override_preserves_unset_keys() -> None:
    """Overriding one nested token must keep all sibling tokens intact."""
    override = {"colors": {"light": {"accent": "#ff0000"}}}
    merged = merge_theme(DEFAULT_THEME, override)

    # The override took effect.
    assert merged["colors"]["light"]["accent"] == "#ff0000"

    # Every other light-mode token still present.
    light_default = DEFAULT_THEME["colors"]["light"]
    assert set(merged["colors"]["light"].keys()) == set(light_default.keys())

    # Dark scheme entirely untouched.
    assert merged["colors"]["dark"] == DEFAULT_THEME["colors"]["dark"]

    # Top-level keys still present.
    assert merged["appName"] == DEFAULT_THEME["appName"]
    assert merged["greeting"] == DEFAULT_THEME["greeting"]


def test_starter_prompts_list_replaced_not_extended() -> None:
    """Lists override entirely (D6 in spec) — never extend."""
    override = {"starterPrompts": ["only this"]}
    merged = merge_theme(
        {"starterPrompts": ["a", "b"]},
        override,
    )
    assert merged["starterPrompts"] == ["only this"]


def test_scalar_override_replaces_value() -> None:
    """Scalar overrides win over the default."""
    merged = merge_theme(DEFAULT_THEME, {"appName": "Custom"})
    assert merged["appName"] == "Custom"
    # Untouched scalars retained.
    assert merged["greeting"] == DEFAULT_THEME["greeting"]


def test_empty_override_is_identity() -> None:
    merged = merge_theme(DEFAULT_THEME, {})
    assert merged == DEFAULT_THEME


def test_none_override_handled() -> None:
    merged = merge_theme(DEFAULT_THEME, None)
    assert merged == DEFAULT_THEME


def test_merge_does_not_mutate_default() -> None:
    """``_deep_merge`` must return a fresh dict — DEFAULT_THEME is module-level."""
    snapshot_accent = DEFAULT_THEME["colors"]["light"]["accent"]
    override = {"colors": {"light": {"accent": "#deadbe"}}}
    merge_theme(DEFAULT_THEME, override)
    assert DEFAULT_THEME["colors"]["light"]["accent"] == snapshot_accent


def test_logo_dict_partial_override() -> None:
    """The ``logo`` dict carries text + optional imageUrl — partial override
    must not drop the unspecified field."""
    override = {"logo": {"imageUrl": "https://example.com/logo.png"}}
    merged = merge_theme(DEFAULT_THEME, override)
    assert merged["logo"]["imageUrl"] == "https://example.com/logo.png"
    assert merged["logo"]["text"] == DEFAULT_THEME["logo"]["text"]


def test_deep_merge_works_at_three_levels() -> None:
    """Nested-of-nested dicts merge through every depth."""
    default = {"a": {"b": {"c": 1, "d": 2}}}
    override = {"a": {"b": {"c": 99}}}
    merged = _deep_merge(default, override)
    assert merged == {"a": {"b": {"c": 99, "d": 2}}}


def test_dict_replaces_scalar_when_types_differ() -> None:
    """If override is a dict but default is a scalar, override wins (no merge)."""
    default = {"x": "scalar"}
    override = {"x": {"a": 1}}
    merged = _deep_merge(default, override)
    assert merged == {"x": {"a": 1}}


def test_scalar_replaces_dict_when_types_differ() -> None:
    """If override is a scalar but default is a dict, override wins (no merge)."""
    default = {"x": {"a": 1}}
    override = {"x": "scalar"}
    merged = _deep_merge(default, override)
    assert merged == {"x": "scalar"}
