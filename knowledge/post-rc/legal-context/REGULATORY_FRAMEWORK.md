# Regulatory Compliance Framework

LLM context for the Product Legal Auditor module. This file is loaded during
Layer 3 (LLM-based analysis) to identify regulatory compliance gaps in user products.

## GDPR (EU General Data Protection Regulation)

**Applies when:** Product targets EU users or processes EU resident data.

**Required elements:**
- Privacy policy with: data collected, purpose, legal basis, retention period, third-party sharing
- Consent mechanisms for data collection (opt-in, not pre-checked)
- Right to access (users can request their data)
- Right to erasure ("right to be forgotten")
- Right to data portability (export in machine-readable format)
- Data Processing Impact Assessment for high-risk processing
- Data Processing Agreement with third-party processors
- Cross-border transfer safeguards (Standard Contractual Clauses or adequacy decisions)
- Data breach notification process (72-hour requirement to supervisory authority)
- Data Protection Officer designation (if large-scale processing)

**Common gaps:**
- No cookie consent banner
- Pre-checked consent boxes
- No data export mechanism
- No account deletion flow
- Third-party analytics without DPA

## CCPA (California Consumer Privacy Act)

**Applies when:** Product targets California residents AND meets revenue/data thresholds.

**Required elements:**
- Privacy policy with CCPA-specific disclosures
- "Do Not Sell or Share My Personal Information" link
- Consumer request handling: access, deletion, opt-out
- Non-discrimination clause (cannot penalize users who exercise rights)
- Financial incentive disclosure (if offering benefits for data sharing)

**Common gaps:**
- No "Do Not Sell" link
- No consumer request form or process
- Vague privacy policy without CCPA categories

## HIPAA (Health Insurance Portability and Accountability Act)

**Applies when:** Product handles Protected Health Information (PHI) for covered entities.

**Required elements:**
- Business Associate Agreement (BAA) with all data processors
- Encryption at rest and in transit for PHI/ePHI
- Access controls with role-based permissions
- Audit logging for all PHI access
- Minimum necessary standard (limit PHI exposure)
- Breach notification procedures
- Employee training documentation
- Risk assessment documentation

**Trigger keywords:** health, medical, patient, diagnosis, prescription, treatment, clinical, EHR, PHI, ePHI, telehealth, telemedicine

**Common gaps:**
- No BAA with cloud provider
- PHI in application logs
- No audit trail for data access
- Missing encryption at rest

## PCI-DSS (Payment Card Industry Data Security Standard)

**Applies when:** Product processes, stores, or transmits credit card data.

**Required elements:**
- Tokenization (never store raw card numbers)
- Encryption for card data in transit
- Network segmentation
- Key management procedures
- Regular vulnerability scanning
- Access control to cardholder data
- Activity logging and monitoring
- Security testing

**Trigger keywords:** payment, credit card, debit card, card number, CVV, PAN, Stripe, payment processing, checkout, billing

**Common gaps:**
- Storing raw card numbers
- Card data in logs
- No PCI-compliant payment processor
- Missing SAQ documentation

## COPPA (Children's Online Privacy Protection Act)

**Applies when:** Product is directed at children under 13 or knowingly collects data from children under 13.

**Required elements:**
- Verifiable parental consent before data collection
- Privacy policy accessible to parents
- Data minimization (collect only what is necessary)
- No behavioral advertising to children
- Parental right to review and delete child's data
- Data retention limits
- Reasonable security measures

**Trigger keywords:** child, children, kid, minor, under 13, under thirteen, K-12, student, COPPA, parental consent, youth, teen (under 13)

**Common gaps:**
- No age gate or verification
- Behavioral tracking on children's content
- No parental consent mechanism
- Excessive data collection

## FERPA (Family Educational Rights and Privacy Act)

**Applies when:** Product handles student educational records for institutions receiving federal funding.

**Required elements:**
- Written consent for disclosure of education records
- Annual notification of rights
- Access rights for parents/eligible students
- Amendment process for records
- Logging of disclosures

**Trigger keywords:** student record, educational institution, FERPA, school, university, college, transcript, grade, enrollment

## ADA / WCAG Accessibility

**Applies when:** Product has a web or mobile user interface.

**Required elements (WCAG 2.1 AA minimum):**
- Perceivable: alt text, captions, color contrast (4.5:1), text resizing
- Operable: keyboard navigation, no seizure-inducing content, focus management
- Understandable: form labels, error identification, consistent navigation
- Robust: screen reader compatibility, valid HTML, ARIA attributes

**Trigger keywords:** web app, mobile app, user interface, UI, dashboard, portal, form

**Common gaps:**
- No alt text on images
- Missing form labels
- Insufficient color contrast
- No keyboard navigation
- No screen reader testing

## General Product Requirements (All Products)

**Always check for:**
- Terms of Service / Terms of Use
- Privacy Policy (required if any user data is collected)
- Cookie Policy (required for web products in EU)
- Copyright notice
- Limitation of liability clause
- Disclaimer of warranties
- Dispute resolution / arbitration clause
- Governing law clause

## AI-Specific Requirements

**If product uses AI/ML:**
- AI-generated output disclaimer ("content is AI-generated and may contain errors")
- Accuracy limitation disclosure
- Human review recommendation for critical decisions
- Training data provenance (if applicable)
- Bias and fairness disclosure
- Automated decision-making disclosure (GDPR Article 22)
