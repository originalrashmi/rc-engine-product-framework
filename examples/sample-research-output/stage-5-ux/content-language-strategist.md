# Content & Language Strategist

**Stage:** stage-5-ux
**LLM:** openai
**Mode:** autonomous
**Tokens:** 25319
**Generated:** 2026-02-13T04:05:08.037Z

---

# Content Strategy Document for Post-RC Security Gate

## 1. Terminology Glossary

- **RC Method:** A structured AI-assisted development process.
- **Post-RC Security Gate:** A security validation phase after code generation in the RC Method.
- **XSS (Cross-Site Scripting):** A vulnerability that allows injection of malicious scripts.
- **CWE (Common Weakness Enumeration):** A list of software vulnerabilities.
- **RAG (Retrieval-Augmented Generation):** A method to reduce token costs by selectively retrieving relevant context.
- **Override:** A developer action to bypass a security gate decision.
- **MCP (Method Control Protocol):** Extensions and tools used within the RC Method.

## 2. Voice & Tone Guidelines

- **Tone:** Neutral, authoritative, and precise. The language should instill confidence and clarity.
- **Voice:** Technical yet accessible, balancing detail with simplicity to ensure comprehension across varying expertise levels.

## 3. Naming Conventions

- **Components:** PascalCase (e.g., `SecurityGateOrchestrator`)
- **Events:** snake_case (e.g., `security_scan_requested`)
- **Variables/Fields:** camelCase (e.g., `scanId`, `commitSha`)

## 4. Error Message Framework

- **Format:** What happened, why, what to do.
- **Example:** "Security scan failed due to API timeout. Please retry or check network settings."

## 5. CLAUDE.md Recommendations

- **Languages:** TypeScript, Node.js for server-side; Python for AI components.
- **Frameworks:** Use OpenAI's GPT and Anthropic's Claude for AI tasks.
- **Naming Conventions:** Follow language-specific best practices; use descriptive naming.
- **Code Style:** Enforce consistent linting rules (e.g., ESLint for JavaScript/TypeScript).

## 6. User Story Format

- **Format:** "As a [persona], I want [action] so that [outcome]."
- **Example:** "As a developer, I want to override a security gate warning so that I can deploy my code without delay."

## 7. Content Hierarchy

- **Primary:** Critical security findings and actions to resolve.
- **Secondary:** Detailed explanations and remediation guidance.
- **Tertiary:** Background information and optional deep dives.

## 8. Localization Considerations

- **Translate:** UI text, error messages, and user guidance.
- **Universal:** Technical terms, code snippets, and acronyms (e.g., API, JWT).

## 9. Failure Mode to Avoid

- **Vague Language:** Use absolute terms (MUST, MUST NOT) instead of suggestions.
- **Over-Engineering:** Avoid overly complex prompts that could trigger excessive or irrelevant AI processing.

## Summary

The Post-RC Security Gate is positioned as a critical component within the RC Method, ensuring AI-generated code is secure before deployment. By maintaining clear and authoritative language, precise terminology, and a consistent naming convention, the product can effectively communicate its purpose and function to developers. The focus on RAG strategies, detailed error messaging, and a robust override system reflects a commitment to balancing security with developer efficiency. These guidelines will support the development of a product that not only enhances security but integrates seamlessly into existing workflows, minimizing friction and maximizing adoption.