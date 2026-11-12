"""One adapter per agent framework. Each runs the same task with the same tools on the same local model
and returns the framework's final output (text, dict or Brief). Imports are local so one broken package
does not stop the others. Each adapter uses the feature its framework is known for, and each is capped at
about six model or tool steps so a looping model ends the run instead of hanging it.
"""

import asyncio
import json

from pydantic import BaseModel

from agent_bench.tools import JSON_HINT, SYSTEM, TASK, TOOLS

class Priority(BaseModel):
    requirement: str
    reason: str


class Brief(BaseModel):
    coverage: int
    risk_index: int
    priorities: list[Priority]


OLLAMA = "http://localhost:11434"
V1 = OLLAMA + "/v1"


def langgraph(model: str):
    """Hand-built tool loop as a StateGraph (the same library as the production document pipeline)."""
    from typing import TypedDict

    import httpx
    from langgraph.graph import END, START, StateGraph

    by_name = {f.__name__: f for f in TOOLS}
    specs = [{"type": "function", "function": {
        "name": f.__name__, "description": f.__doc__.split("\n")[0],
        "parameters": {"type": "object", "properties": {a: {"type": "string"} for a in f.__annotations__ if a != "return"},
                       "required": [a for a in f.__annotations__ if a != "return"]}}} for f in TOOLS]

    class S(TypedDict):
        messages: list
        steps: int

    def call_model(s: S) -> dict:
        r = httpx.post(OLLAMA + "/api/chat", timeout=900, json={
            "model": model, "messages": s["messages"], "tools": specs, "stream": False, "options": {"temperature": 0}})
        r.raise_for_status()
        return {"messages": s["messages"] + [r.json()["message"]], "steps": s["steps"] + 1}

    def run_tools(s: S) -> dict:
        out = []
        for c in s["messages"][-1]["tool_calls"]:
            fn, args = c["function"]["name"], c["function"].get("arguments") or {}
            try:
                out.append({"role": "tool", "tool_name": fn, "content": by_name[fn](**args)})
            except Exception as e:  # unknown tool or bad arguments go back to the model as an error
                out.append({"role": "tool", "tool_name": fn, "content": json.dumps({"error": str(e)[:200]})})
        return {"messages": s["messages"] + out}

    g = StateGraph(S)
    g.add_node("model", call_model)
    g.add_node("tools", run_tools)
    g.add_edge(START, "model")
    g.add_conditional_edges("model", lambda s: "tools" if s["messages"][-1].get("tool_calls") and s["steps"] < 6 else END,
                            {"tools": "tools", END: END})
    g.add_edge("tools", "model")
    final = g.compile().invoke({"messages": [{"role": "system", "content": SYSTEM},
                                             {"role": "user", "content": TASK + JSON_HINT}], "steps": 0})
    return final["messages"][-1].get("content", "")


def pydantic_ai(model: str):
    """Typed output: the run only ends when the answer validates as a Brief (retries on a schema failure)."""
    from pydantic_ai import Agent
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.ollama import OllamaProvider
    from pydantic_ai.usage import UsageLimits

    agent = Agent(OpenAIChatModel(model, provider=OllamaProvider(base_url=V1)), output_type=Brief,
                  instructions=SYSTEM, tools=TOOLS, retries=2, model_settings={"temperature": 0})
    return agent.run_sync(TASK, usage_limits=UsageLimits(request_limit=8)).output


def openai_agents(model: str):
    """Handoff: a triage agent with no tools passes the request to the gap analyst, which owns the tools."""
    from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner, function_tool, set_tracing_disabled
    from openai import AsyncOpenAI

    set_tracing_disabled(True)
    m = OpenAIChatCompletionsModel(model=model, openai_client=AsyncOpenAI(base_url=V1, api_key="ollama"))
    settings = ModelSettings(temperature=0)
    analyst = Agent(name="Gap analyst", handoff_description="Writes the audit-prep brief from the rules engine's results.",
                    instructions=SYSTEM + JSON_HINT, tools=[function_tool(f) for f in TOOLS], model=m, model_settings=settings)
    triage = Agent(name="Triage", instructions="You route requests. Hand every audit-prep request to the Gap analyst.",
                   handoffs=[analyst], model=m, model_settings=settings)
    r = Runner.run_sync(triage, TASK, max_turns=8)
    return {"text": r.final_output, "last_agent": r.last_agent.name}


def smolagents(model: str):
    """ToolCallingAgent: multi-step loop that ends through the built-in final_answer tool."""
    from smolagents import OpenAIServerModel, ToolCallingAgent, tool

    agent = ToolCallingAgent(tools=[tool(f) for f in TOOLS], max_steps=6, verbosity_level=0,
                             model=OpenAIServerModel(model_id=model, api_base=V1, api_key="ollama", temperature=0))
    return str(agent.run(SYSTEM + "\n\n" + TASK + JSON_HINT))


def autogen(model: str):
    """Two-agent conversation: the analyst writes the brief, a reviewer without tools replies once."""
    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.conditions import MaxMessageTermination
    from autogen_agentchat.teams import RoundRobinGroupChat
    from autogen_ext.models.openai import OpenAIChatCompletionClient

    client = OpenAIChatCompletionClient(model=model, base_url=V1, api_key="ollama", temperature=0, model_info={
        "vision": False, "function_calling": True, "json_output": True, "family": "unknown", "structured_output": False})
    analyst = AssistantAgent("analyst", model_client=client, tools=TOOLS, system_message=SYSTEM + JSON_HINT,
                             reflect_on_tool_use=True, max_tool_iterations=5)
    reviewer = AssistantAgent("reviewer", model_client=client, system_message=(
        "You review an audit-prep brief. In one sentence, say whether every number and requirement id in it "
        "appears in the tool results above. You cannot approve evidence."))

    async def go():
        team = RoundRobinGroupChat([analyst, reviewer], termination_condition=MaxMessageTermination(3))
        res = await team.run(task=TASK)
        await client.close()
        return res

    msgs = [m for m in asyncio.run(go()).messages if isinstance(getattr(m, "content", None), str)]
    said = lambda who: next((m.content for m in reversed(msgs) if m.source == who), "")
    return {"text": said("analyst"), "reviewer": said("reviewer")[:400]}


def agno(model: str):
    """Single agent on Agno's native Ollama model class with plain Python functions as tools."""
    from agno.agent import Agent
    from agno.models.ollama import Ollama

    agent = Agent(model=Ollama(id=model, options={"temperature": 0, "num_predict": 800}), tools=TOOLS, instructions=SYSTEM + JSON_HINT,
                  markdown=False, telemetry=False, tool_call_limit=6)
    return str(agent.run(TASK).content)


def dspy(model: str):
    """ReAct module over a typed signature: DSPy writes the prompt from the signature, not from a hand-written string."""
    import dspy as d

    class AuditBrief(d.Signature):
        __doc__ = SYSTEM

        task: str = d.InputField()
        coverage: int = d.OutputField(desc="evidence coverage in percent, from get_scores")
        risk_index: int = d.OutputField(desc="risk index, from get_scores")
        priorities: list[str] = d.OutputField(desc="the three requirement ids to fix first, most urgent first")

    d.configure(lm=d.LM("openai/" + model, api_base=V1, api_key="ollama", temperature=0, cache=False, max_tokens=1200))
    p = d.ReAct(AuditBrief, tools=TOOLS, max_iters=5)(task=TASK)
    return {"coverage": p.coverage, "risk_index": p.risk_index, "priorities": p.priorities}


ADAPTERS = [
    # id, display name, package on PyPI, run function, pattern shown
    ("langgraph", "LangGraph", "langgraph", langgraph, "Graph-based tool loop"),
    ("pydantic-ai", "Pydantic AI", "pydantic-ai-slim", pydantic_ai, "Typed, validated output"),
    ("openai-agents", "OpenAI Agents SDK", "openai-agents", openai_agents, "Triage to specialist handoff"),
    ("smolagents", "smolagents", "smolagents", smolagents, "Multi-step tool-calling agent"),
    ("autogen", "AutoGen", "autogen-agentchat", autogen, "Analyst and reviewer conversation"),
    ("agno", "Agno", "agno", agno, "Single agent, native Ollama client"),
    ("dspy", "DSPy", "dspy", dspy, "ReAct over a typed signature"),
]
