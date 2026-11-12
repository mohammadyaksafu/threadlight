# Agent frameworks: what is used where

ThreadLight uses one agent framework in the product and benchmarks six more on the same task. This page
says which is which, how the bench works and what it measured. The numbers are in
`evals/reports/<date>-agents.json`; the web app's **Agent frameworks** page (`#/agents`) reads that file
at build time.

## In the product

| Framework | Where | What it does |
|---|---|---|
| LangGraph | `backend/pipeline/graph.py`, `backend/pipeline/runner.py` | The document pipeline: 14 nodes, state checkpointed in Postgres, and two `interrupt()` steps where the graph waits for a person (field review, officer approval). |

Nothing else in this list is imported by `backend/` or built into the Docker images.

## In the bench (`agent_bench/`)

Each framework gets the same system prompt, the same task, the same four tools and the same local model through
Ollama at temperature 0. The main run uses `qwen2.5:7b`; a second run uses `llama3.2:3b`. The tools are read-only views of the rules engine over
`data/sample.json`:

| Tool | Returns |
|---|---|
| `get_scores()` | days to audit, coverage, risk index, open findings |
| `list_open_findings()` | open findings in the rules engine's priority order |
| `get_requirement(requirement_id)` | status and reasons for one requirement |
| `what_if_valid_until(document_id, valid_until)` | scores if a document expired on another date; changes nothing |

There is no approve, close or write tool. `tests/test_agent_bench.py` asserts that.

The task is to write an audit-prep brief: coverage, risk index and the three requirements to fix first.
Each adapter uses the feature its framework is known for:

| Framework | Package | Pattern in the adapter |
|---|---|---|
| LangGraph | `langgraph` | hand-built `StateGraph` tool loop (model node, tool node, conditional edge) |
| Pydantic AI | `pydantic-ai-slim` | `output_type=Brief`: the run ends only when the answer validates |
| OpenAI Agents SDK | `openai-agents` | a triage agent hands off to a gap analyst that owns the tools; local model through `OpenAIChatCompletionsModel` |
| smolagents | `smolagents` | `ToolCallingAgent` (not `CodeAgent`: no model-written code is executed) |
| AutoGen | `autogen-agentchat` | `RoundRobinGroupChat` of an analyst and a reviewer |
| Agno | `agno` | one agent on Agno's Ollama model class |
| DSPy | `dspy` | `dspy.ReAct` over a typed signature |

## Scoring

Plain code in `agent_bench/tools.py` checks every run. A model's own claim of success counts for nothing.

1. **called_tools**: it called both `get_scores` and `list_open_findings`.
2. **ids_are_open_findings**: every requirement id it cites is an open finding.
3. **ranking_matches_rules**: its top three are R1, R8, R6, the engine's order.
4. **numbers_match_engine**: coverage is 29 and the risk index is 63.

## Results

Two models, one run per framework each, on 2026-11-12. Main run: `qwen2.5:7b`
(`evals/reports/2026-11-12-agents.json` and `.md`). Second run: `llama3.2:3b`
(`evals/reports/2026-11-12-agents-llama3.2-3b.json` and `.md`).

| Framework | qwen2.5:7b checks | qwen2.5:7b seconds | llama3.2:3b checks | What went wrong |
|---|---|---|---|---|
| LangGraph | 4/4 | 241.9 | 4/4 | nothing |
| Pydantic AI | 4/4 | 78.2 | 0/4 (error) | 3B: the model wrote a tool call as text into the Brief field; the run stopped after 2 output retries |
| OpenAI Agents SDK | 3/4 | 142.5 | 0/4 | 7B: handed off correctly, but ranked R1 R4 R5 instead of R1 R8 R6. 3B: the triage agent never handed off and invented coverage 85 |
| smolagents | 1/4 | 262.6 | 1/4 | 7B: called only `get_scores` and invented ids R001-R003. 3B: looped on the same two tools until the step limit |
| AutoGen | 3/4 | 921.2 | 4/4 | 7B: ranked R1 R4 R8; the reviewer agent accepted that wrong order |
| Agno | 4/4 | 633.2 | 0/4 | 3B: called `list_open_findings` with an argument it does not take, then answered without its result |
| DSPy | 4/4 | 561.8 | 0/4 (error) | 3B: ReAct could not produce its final structured output |

Neither model got all seven frameworks through. On `qwen2.5:7b` four of seven passed all four checks
(LangGraph, Pydantic AI, Agno, DSPy); on `llama3.2:3b` two did (LangGraph, AutoGen). The only one to pass on
both is LangGraph, the framework the product already uses, but with one run per model that is a
consistency signal, not proof.

Two observations worth more than the scores:

- **A reviewer agent is not a check.** AutoGen's reviewer read the tool output and still approved a
  ranking that differed from it. Only the code check caught it. This is why ThreadLight's approvals go
  to people and its statuses come from rules.
- **Wrong answers looked right.** smolagents on 7B returned correct numbers with invented requirement
  ids in valid JSON. A format check would have passed it.

Run notes, so the numbers can be read correctly:

- The first `qwen2.5:7b` Agno run got stuck in one generation and was stopped by hand after 851 s
  (recorded as 1/4). The adapter then got an 800-token output cap (`num_predict`) and Agno and DSPy were
  re-run; the table shows the re-run. The `llama3.2:3b` Agno run used the adapter without the cap.
- The first DSPy runs failed on configuration (a missing key, then a 404 on Ollama's native route). The
  adapter now uses Ollama's OpenAI-compatible endpoint; both DSPy rows above are from that version.
- Times vary a lot with how many model calls a framework makes and with the laptop's load; AutoGen's 921 s
  includes one 140 s call.

## Limits

- One run per framework per model, two small models, one task. This is a smoke test of each framework's tool loop
  on local hardware, not a ranking of the frameworks.
- Within a run all seven share one small model, so a failed check usually shows how a framework's prompt
  format and parsing suit that model, not what the framework can do with a larger one. The 3B and 7B
  results differ more between models than between most frameworks.
- Times are wall-clock seconds on a CPU-only laptop and include every model call the framework chose
  to make.
- The bench calls Ollama directly. It is an evaluation harness outside `backend/`, so it does not go
  through `backend/llm/router`; product model calls still must.

## Run it

```
uv venv .venv-agents --python 3.10
uv pip install --python .venv-agents/Scripts/python.exe -r agent_bench/requirements.txt
ollama pull qwen2.5:7b && ollama pull llama3.2:3b
.venv-agents/Scripts/python -m agent_bench.run            # all seven on qwen2.5:7b
.venv-agents/Scripts/python -m agent_bench.run --model llama3.2:3b --tag llama3.2-3b
.venv-agents/Scripts/python -m agent_bench.run --only dspy # re-run one, keep the others from today's report
python -m unittest tests.test_agent_bench                  # scorer and tools, no model needed
```
