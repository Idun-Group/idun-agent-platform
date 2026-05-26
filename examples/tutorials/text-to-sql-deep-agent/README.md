# Text-to-SQL Deep Agent

Natural-language to SQL agent served by Idun Engine. Runs read-only SELECT queries against a sample SQLite database (the [Chinook](https://github.com/lerocha/chinook-database) digital media store) and explains the results.

Based on the [LangChain Deep Agents text-to-sql example](https://github.com/langchain-ai/deepagents/tree/main/examples/text-to-sql-agent).

## Skills

The agent picks up two skills from the local `skills/` directory:

- **`query-writing`** — simple SELECTs, multi-table JOINs, aggregations, subqueries.
- **`schema-exploration`** — listing tables, inspecting columns, mapping foreign-key relationships.

Surfaced to the model via the Deep Agents `skills=[...]` argument.

## Database

The agent queries `chinook.db`. It is not committed; fetch it once:

```bash
curl -L -o chinook.db https://github.com/lerocha/chinook-database/raw/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite
```

## Run

```bash
cp .env.example .env
# fill GEMINI_API_KEY (https://aistudio.google.com/apikey)
pip install idun-agent-engine deepagents langchain langchain-anthropic langchain-community langchain-google-genai langgraph sqlalchemy
idun init
```

Open `http://localhost:8000` and try:

- *"How many customers are from Canada?"* — simple aggregate
- *"Which employee generated the most revenue and from which countries?"* — multi-table join with `write_todos` planning

## Safety

The managed prompt `agents-md` in `config.yaml` restricts the agent to `SELECT` only. `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, and `CREATE` are forbidden.
