# License Compliance Matrix

LLM context for dependency license scanning. Used by the Product Legal Auditor
to identify license compatibility issues in user projects.

## License Categories

### Permissive Licenses (Generally Safe)

These licenses allow commercial use, modification, and distribution with minimal restrictions.

| License | Key Obligation | Commercial Use |
|---------|---------------|----------------|
| MIT | Include license text | Yes |
| Apache-2.0 | Include license + NOTICE; patent grant | Yes |
| BSD-2-Clause | Include license text | Yes |
| BSD-3-Clause | Include license text; no endorsement clause | Yes |
| ISC | Include license text | Yes |
| Unlicense | None (public domain) | Yes |
| CC0-1.0 | None (public domain dedication) | Yes |
| 0BSD | None | Yes |
| WTFPL | None | Yes |

### Weak Copyleft (Caution Required)

Modifications to the library itself must be shared, but your application code is not affected if properly linked.

| License | Key Obligation | Risk Level |
|---------|---------------|------------|
| MPL-2.0 | File-level copyleft; modified files must be MPL | Low-Medium |
| LGPL-2.1 | Dynamic linking OK; static linking may trigger copyleft | Medium |
| LGPL-3.0 | Dynamic linking OK; static linking may trigger copyleft | Medium |
| EPL-2.0 | Modifications must be EPL; can combine with other code | Medium |

### Strong Copyleft (High Risk for Proprietary Software)

These licenses require the entire derivative work to be released under the same license.

| License | Key Obligation | Risk Level |
|---------|---------------|------------|
| GPL-2.0 | Entire derivative work must be GPL-2.0 | High |
| GPL-3.0 | Entire derivative work must be GPL-3.0; patent provisions | High |
| AGPL-3.0 | Network use triggers copyleft (SaaS risk) | Critical |
| SSPL | Server-side copyleft; must open-source service infrastructure | Critical |
| OSL-3.0 | Network copyleft similar to AGPL | Critical |
| CC-BY-SA-4.0 | Share-alike; derivatives must use same license | High |

## Compatibility Rules

### Detection Rules

1. **Project license is MIT/Apache/BSD and dependency is GPL/AGPL:**
   Severity: CRITICAL -- GPL copyleft infects the entire project

2. **Project license is MIT/Apache/BSD and dependency is AGPL-3.0:**
   Severity: CRITICAL -- AGPL triggers copyleft even for SaaS/network use

3. **Project license is not specified:**
   Severity: HIGH -- ambiguous IP ownership; defaults to "all rights reserved"

4. **Dependency has no license field:**
   Severity: HIGH -- no license means all rights reserved by author

5. **Dependency uses SSPL:**
   Severity: HIGH -- extremely restrictive server-side copyleft

6. **Multiple copyleft licenses in dependency tree:**
   Severity: MEDIUM -- potential license conflicts between dependencies

7. **Weak copyleft (MPL/LGPL) with static linking:**
   Severity: MEDIUM -- may trigger copyleft obligations depending on build

8. **Dependency uses CC-BY-NC (non-commercial):**
   Severity: HIGH -- incompatible with commercial products

## SaaS-Specific Risks

Products deployed as services (SaaS, API, cloud) have additional risks:

- **AGPL-3.0:** Network interaction counts as distribution; must provide source code
- **SSPL:** Must open-source the "management software, APIs, storage layers" used to run the service
- **OSL-3.0:** External deployment triggers copyleft

These licenses are particularly dangerous because traditional GPL does not trigger
on server-side use, but AGPL/SSPL/OSL explicitly do.

## Remediation Patterns

| Issue | Remediation |
|-------|-------------|
| GPL dependency in MIT project | Replace with permissive alternative or obtain commercial license |
| AGPL dependency in SaaS | Replace dependency or obtain commercial license; isolate via API boundary |
| No license on dependency | Contact author; fork with explicit license; or replace |
| Missing project license | Add LICENSE file with chosen license |
| License conflict between deps | Evaluate compatibility; may need to replace one |
