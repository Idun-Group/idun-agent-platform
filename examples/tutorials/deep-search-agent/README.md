# Deep Search Agent

Multi-agent research assistant built on Google ADK and served by Idun Engine. Plans, researches, evaluates, refines, and composes a cited Markdown report.

Based on the [Google ADK samples](https://github.com/google/adk-samples) (Apache 2.0).

## Pipeline

1. **Plan** — proposes a 5-point research plan, refines from user feedback.
2. **Research** — section planner outlines the report, section researcher runs `google_search` queries.
3. **Evaluate** — critic agent grades depth and emits follow-up queries.
4. **Refine** — iterative loop repeats search + evaluate until the critic passes.
5. **Compose** — turns findings into a cited report, replacing `<cite source="src-N" />` with hyperlinks.

Built from `LlmAgent`, `LoopAgent`, `SequentialAgent`, plus a custom `EscalationChecker` from `google.adk.agents`.

## Run

```bash
cp .env.example .env
# fill GOOGLE_API_KEY (https://aistudio.google.com/apikey)
# or configure Vertex AI per .env.example
pip install idun-agent-engine google-adk
idun init
```

Open `http://localhost:8000` and ask a research question. The agent responds with a plan first; reply `looks good, run it` (or similar) to start the pipeline.

`/admin/agent/graph/ascii` shows the full multi-agent tree.
