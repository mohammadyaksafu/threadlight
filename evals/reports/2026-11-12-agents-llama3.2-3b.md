# Agent-framework bench, 2026-11-12

Model `llama3.2:3b`. Local Ollama on a laptop CPU (AMD64), temperature 0, one run per framework.
Expected: coverage 29, risk index 63, top three R1 R8 R6.

| Framework | Version | Tool calls | Checks failed | Passed | Seconds |
|---|---|---|---|---|---|
| LangGraph | 1.2.20 | get_scores → list_open_findings | none | 4/4 | 44.6 |
| Pydantic AI | 2.54.0 | error | called_tools, ids_are_open_findings, ranking_matches_rules, numbers_match_engine | 0/4 | 61.7 |
| OpenAI Agents SDK | 0.24.0 | none | called_tools, ids_are_open_findings, ranking_matches_rules, numbers_match_engine | 0/4 | 15.2 |
| smolagents | 1.26.0 | get_scores → list_open_findings → get_scores → list_open_findings → get_scores → list_open_findings → get_scores → list_open_findings → get_scores → list_open_findings → get_scores → list_open_findings | ids_are_open_findings, ranking_matches_rules, numbers_match_engine | 1/4 | 257.2 |
| AutoGen | 0.7.5 | get_scores → list_open_findings | none | 4/4 | 83.8 |
| Agno | 3.1.12 | get_scores | called_tools, ids_are_open_findings, ranking_matches_rules, numbers_match_engine | 0/4 | 51.4 |
| DSPy | 3.5.0 | error | called_tools, ids_are_open_findings, ranking_matches_rules, numbers_match_engine | 0/4 | 361.4 |
