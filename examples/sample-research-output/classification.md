# Cynefin Classification Report

**Domain:** complicated
**Confidence:** 85%
**Product Class:** Developer Security Tool

## Reasoning

This is a security tooling integration with well-understood problem domains (SAST, vulnerability detection, CI/CD gates) but requires expert analysis across multiple dimensions: static analysis engine design, false positive management, MCP server architecture, and token optimization strategies. The core security patterns are documented (CWE catalog, OWASP), but the implementation requires specialized expertise in compiler design, security tooling, and LLM context management.

## Complexity Factors

- Integration with existing MCP server architecture (passthrough vs autonomous modes)
- Token budget optimization for 165K token knowledge base consumption
- False positive management without creating developer friction
- Multi-severity risk scoring and configurable gate policies per project
- Hybrid approach balancing AI-based pattern matching with traditional SAST tooling

## Persona Impact

- **Personas activated:** 15
- **Personas skipped:** 5
