"""Provider-quirk regression tests for the OpenInference attr extractor."""

from __future__ import annotations

from idun_agent_standalone.infrastructure.traces import _attrs


class TestProviderQuirks:
    def test_openai_streaming_drops_detail_buckets(self):
        """Streaming spans emit None for detail buckets; cost computed from prompt only."""
        attrs = {
            "openinference.span.kind": "LLM",
            "llm.system": "openai",
            "llm.provider": "openai",
            "llm.model_name": "gpt-4o",
            "llm.token_count.prompt": 1000,
            "llm.token_count.completion": 500,
            # Note: no *_details — streaming drops them
        }
        extracted = _attrs.extract_llm_span(attrs, streaming=True)
        assert extracted["model"] == "gpt-4o"
        assert extracted["provider"] == "openai"
        assert extracted["prompt_tokens"] == 1000
        assert extracted["completion_tokens"] == 500
        assert extracted["cache_read_tokens"] is None
        assert extracted["cache_write_tokens"] is None

    def test_openrouter_provider_inferred_from_model(self):
        """OpenRouter has llm.provider unset → fallback parses model."""
        attrs = {
            "openinference.span.kind": "LLM",
            "llm.model_name": "openrouter/anthropic/claude-3.5-sonnet",
        }
        extracted = _attrs.extract_llm_span(attrs)
        assert extracted["provider"] == "openrouter"

    def test_vertexai_system_with_gemini_model(self):
        """llm.system=vertexai is misleading — llm.provider is the truth."""
        attrs = {
            "openinference.span.kind": "LLM",
            "llm.system": "vertexai",
            "llm.provider": "google",
            "llm.model_name": "gemini-pro",
        }
        extracted = _attrs.extract_llm_span(attrs)
        assert extracted["provider"] == "google"

    def test_tool_arguments_from_output_value_when_unset(self):
        """tool.parameters never populated — args live in output.value JSON."""
        attrs = {
            "openinference.span.kind": "TOOL",
            "tool.name": "search",
            "output.value": '{"tool_call":{"function":{"arguments":{"q":"x"}}}}',
        }
        extracted = _attrs.extract_tool_span(attrs)
        assert extracted["tool_arguments"] == '{"q": "x"}'

    def test_empty_tool_arguments_safe(self):
        """Empty {} arguments drop the attr entirely; read defensively."""
        attrs = {
            "openinference.span.kind": "TOOL",
            "tool.name": "noop",
            "output.value": '{"tool_call":{"function":{}}}',
        }
        extracted = _attrs.extract_tool_span(attrs)
        # Implementation chooses: "{}" sentinel or None. The test just asserts no crash.
        assert "tool_arguments" in extracted

    def test_gemini_under_langchain_google_genai_warns(self, caplog):
        """Gemini via langchain-google-genai emits zero detail buckets — log a warning."""
        import logging

        # Alembic's ``fileConfig()`` (run by upstream integration tests) sets
        # ``disable_existing_loggers=True`` by default, which silently turns
        # ``disabled=True`` on every already-imported module logger. caplog
        # cannot capture from a disabled logger regardless of level or
        # propagation, so we re-enable the specific logger the source module
        # uses before exercising it.
        _attrs.logger.disabled = False
        _attrs.logger.propagate = True

        attrs = {
            "openinference.span.kind": "LLM",
            "llm.system": "google",
            "llm.provider": "google",
            "llm.model_name": "gemini-pro",
            "llm.token_count.prompt": 100,
        }
        with caplog.at_level(logging.WARNING, logger=_attrs.logger.name):
            _attrs.extract_llm_span(attrs)
        # Log line must mention recommending the native google-genai instrumentor.
        assert any("google-genai" in r.message for r in caplog.records)
