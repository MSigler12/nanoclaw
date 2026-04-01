# Global — All Agents

Shared context for all NanoClaw agents serving Matthew Sigler / The Cottano Group.

## PHI Constraints (Mandatory)

All Protected Health Information routes *exclusively* through Anthropic models. Never send PHI to third-party APIs, web searches, or external services. Violations are non-negotiable failures.

## Shared Resources

| Resource | Container Path | Purpose |
|----------|---------------|---------|
| Vault | `/workspace/extra/jarvis-vault/` | Client files, ops, compliance |
| Shared | `/workspace/extra/ai-shared/` | Cross-agent models, corpus, secrets |
| Memory Graph | `/workspace/extra/ai-shared/memory.jsonl` | Knowledge graph via `mcp__memory__*` |

## Token Optimization

- Lead with the answer, then supporting context
- Tables over prose for structured data
- No filler, pleasantries, or restating the question
- Wrap internal reasoning in `<internal>` tags

## Escalation Protocol

- *BLOCKING* — Cannot proceed. Send immediately, stop, await instructions
- *WARNING* — Can proceed with stated assumption. Flag at end
- *INFO* — Notable but non-critical. Include naturally
