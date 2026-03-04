/**
 * Tests for the Product Legal Auditor module (Agent 2).
 *
 * Tests static pattern detection for privacy, regulatory, and license compliance.
 */

import { describe, it, expect } from 'vitest';
import {
  USER_DATA_PATTERNS,
  PII_FIELD_PATTERNS,
  HEALTHCARE_PATTERNS,
  FINANCE_PATTERNS,
  CHILDREN_PATTERNS,
  EDUCATION_PATTERNS,
  UI_PRODUCT_PATTERNS,
  PRIVACY_POLICY_PATTERNS,
  TOS_PATTERNS,
  ACCESSIBILITY_PATTERNS,
  AI_COMPONENT_PATTERNS,
} from '../../src/domains/post-rc/modules/legal/legal-patterns.js';

// ── Pattern Detection Tests ──────────────────────────────────────────────────

describe('Legal Pattern Detection', () => {
  describe('User Data Collection Patterns', () => {
    it('detects user account references', () => {
      expect(USER_DATA_PATTERNS.test('user account management')).toBe(true);
      expect(USER_DATA_PATTERNS.test('user login flow')).toBe(true);
      expect(USER_DATA_PATTERNS.test('user signup page')).toBe(true);
      expect(USER_DATA_PATTERNS.test('user registration form')).toBe(true);
    });

    it('detects data collection language', () => {
      expect(USER_DATA_PATTERNS.test('collects personal data')).toBe(true);
      expect(USER_DATA_PATTERNS.test('collecting user information')).toBe(true);
    });

    it('does not false positive on unrelated text', () => {
      expect(USER_DATA_PATTERNS.test('display product catalog')).toBe(false);
      expect(USER_DATA_PATTERNS.test('render the homepage')).toBe(false);
    });
  });

  describe('PII Field Patterns', () => {
    it('detects common PII fields', () => {
      expect(PII_FIELD_PATTERNS.test('email address field')).toBe(true);
      expect(PII_FIELD_PATTERNS.test('phone number input')).toBe(true);
      expect(PII_FIELD_PATTERNS.test('credit card form')).toBe(true);
      expect(PII_FIELD_PATTERNS.test('social security number')).toBe(true);
      expect(PII_FIELD_PATTERNS.test('date of birth picker')).toBe(true);
    });
  });

  describe('Healthcare Domain Patterns', () => {
    it('detects healthcare keywords', () => {
      expect(HEALTHCARE_PATTERNS.test('patient records system')).toBe(true);
      expect(HEALTHCARE_PATTERNS.test('medical data storage')).toBe(true);
      expect(HEALTHCARE_PATTERNS.test('HIPAA compliance')).toBe(true);
      expect(HEALTHCARE_PATTERNS.test('telehealth platform')).toBe(true);
      expect(HEALTHCARE_PATTERNS.test('PHI encryption')).toBe(true);
    });

    it('does not false positive', () => {
      expect(HEALTHCARE_PATTERNS.test('healthy eating app')).toBe(false);
    });
  });

  describe('Finance Domain Patterns', () => {
    it('detects payment keywords', () => {
      expect(FINANCE_PATTERNS.test('payment processing')).toBe(true);
      expect(FINANCE_PATTERNS.test('Stripe integration')).toBe(true);
      expect(FINANCE_PATTERNS.test('credit card form')).toBe(true);
      expect(FINANCE_PATTERNS.test('checkout flow')).toBe(true);
      expect(FINANCE_PATTERNS.test('PCI compliance')).toBe(true);
    });
  });

  describe('Children Domain Patterns', () => {
    it('detects children-related keywords', () => {
      expect(CHILDREN_PATTERNS.test('children under 13')).toBe(true);
      expect(CHILDREN_PATTERNS.test('COPPA compliance')).toBe(true);
      expect(CHILDREN_PATTERNS.test('K-12 education')).toBe(true);
      expect(CHILDREN_PATTERNS.test('parental consent')).toBe(true);
    });
  });

  describe('Education Domain Patterns', () => {
    it('detects education keywords', () => {
      expect(EDUCATION_PATTERNS.test('student record system')).toBe(true);
      expect(EDUCATION_PATTERNS.test('FERPA compliance')).toBe(true);
      expect(EDUCATION_PATTERNS.test('university enrollment')).toBe(true);
    });
  });

  describe('UI Product Patterns', () => {
    it('detects web/mobile UI references', () => {
      expect(UI_PRODUCT_PATTERNS.test('React dashboard')).toBe(true);
      expect(UI_PRODUCT_PATTERNS.test('mobile app interface')).toBe(true);
      expect(UI_PRODUCT_PATTERNS.test('Next.js landing page')).toBe(true);
      expect(UI_PRODUCT_PATTERNS.test('web app portal')).toBe(true);
    });
  });

  describe('Privacy Policy Patterns', () => {
    it('detects privacy policy references', () => {
      expect(PRIVACY_POLICY_PATTERNS.test('include privacy policy')).toBe(true);
      expect(PRIVACY_POLICY_PATTERNS.test('GDPR compliance')).toBe(true);
      expect(PRIVACY_POLICY_PATTERNS.test('data protection policy')).toBe(true);
    });
  });

  describe('Terms of Service Patterns', () => {
    it('detects ToS references', () => {
      expect(TOS_PATTERNS.test('terms of service page')).toBe(true);
      expect(TOS_PATTERNS.test('terms of use agreement')).toBe(true);
      expect(TOS_PATTERNS.test('EULA acceptance')).toBe(true);
    });
  });

  describe('Accessibility Patterns', () => {
    it('detects accessibility references', () => {
      expect(ACCESSIBILITY_PATTERNS.test('WCAG 2.1 AA')).toBe(true);
      expect(ACCESSIBILITY_PATTERNS.test('screen reader support')).toBe(true);
      expect(ACCESSIBILITY_PATTERNS.test('accessibility audit')).toBe(true);
      expect(ACCESSIBILITY_PATTERNS.test('ARIA attributes')).toBe(true);
    });
  });

  describe('AI Component Patterns', () => {
    it('detects AI/ML references', () => {
      expect(AI_COMPONENT_PATTERNS.test('AI-powered recommendations')).toBe(true);
      expect(AI_COMPONENT_PATTERNS.test('machine learning model')).toBe(true);
      expect(AI_COMPONENT_PATTERNS.test('LLM integration')).toBe(true);
      expect(AI_COMPONENT_PATTERNS.test('GPT-based chatbot')).toBe(true);
    });
  });
});

// ── Regulatory Trigger Scenarios ─────────────────────────────────────────────

describe('Regulatory Trigger Scenarios', () => {
  it('healthcare PRD triggers HIPAA check', () => {
    const prdText = 'A telehealth platform for patient consultations with medical record storage';
    expect(HEALTHCARE_PATTERNS.test(prdText)).toBe(true);
  });

  it('e-commerce PRD triggers PCI-DSS check', () => {
    const prdText = 'An online store with checkout flow, credit card payment, and Stripe integration';
    expect(FINANCE_PATTERNS.test(prdText)).toBe(true);
  });

  it('kids app triggers COPPA check', () => {
    const prdText = 'An educational app for children under 13 with progress tracking';
    expect(CHILDREN_PATTERNS.test(prdText)).toBe(true);
  });

  it('school platform triggers FERPA check', () => {
    const prdText = 'A student record management system for university enrollment';
    expect(EDUCATION_PATTERNS.test(prdText)).toBe(true);
  });

  it('SaaS with user data triggers privacy requirements', () => {
    const prdText = 'A SaaS dashboard with user registration, email collection, and user profile management';
    expect(USER_DATA_PATTERNS.test(prdText)).toBe(true);
    expect(PII_FIELD_PATTERNS.test(prdText)).toBe(true);
  });

  it('web app without accessibility reference triggers a11y check', () => {
    const prdText = 'A React dashboard with real-time charts and data visualization';
    expect(UI_PRODUCT_PATTERNS.test(prdText)).toBe(true);
    expect(ACCESSIBILITY_PATTERNS.test(prdText)).toBe(false);
  });
});
