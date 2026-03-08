/**
 * Email Transport -- Sends magic link emails for RC Engine authentication.
 *
 * Supports multiple providers via environment variables:
 *   1. Console (default) -- logs to console for development
 *   2. SMTP -- generic SMTP via nodemailer (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
 *   3. Resend -- modern email API (set RESEND_API_KEY)
 *
 * Usage:
 *   import { sendMagicLinkEmail } from './email.js';
 *   await sendMagicLinkEmail('user@example.com', token, 'http://localhost:3100');
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface EmailResult {
  success: boolean;
  provider: string;
  error?: string;
}

type EmailProvider = 'console' | 'smtp' | 'resend';

// ── Provider Detection ──────────────────────────────────────────────────────

function detectProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'console';
}

// ── Email Content ───────────────────────────────────────────────────────────

function buildMagicLinkHtml(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, sans-serif; background: #0D1B2A; color: #E2E8F0; padding: 40px;">
  <div style="max-width: 480px; margin: 0 auto; background: #1B2A3E; border-radius: 12px; padding: 32px; border: 1px solid #2D3E50;">
    <h1 style="font-size: 24px; margin: 0 0 8px;">
      <span style="color: #C9A962;">RC</span>
      <span style="color: #CBD5E1;"> Engine</span>
    </h1>
    <p style="color: #94A3B8; font-size: 14px; margin: 0 0 24px;">Sign in to your account</p>

    <p style="color: #CBD5E1; font-size: 15px; line-height: 1.6;">
      Click the button below to sign in. This link expires in 15 minutes.
    </p>

    <a href="${verifyUrl}"
       style="display: inline-block; background: #C9A962; color: #0D1B2A; font-weight: 600;
              padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;
              margin: 24px 0;">
      Sign In
    </a>

    <p style="color: #64748B; font-size: 12px; margin-top: 24px; line-height: 1.5;">
      If you didn't request this email, you can safely ignore it.
      <br>
      Or copy this link: <a href="${verifyUrl}" style="color: #2D9CDB;">${verifyUrl}</a>
    </p>
  </div>
</body>
</html>`;
}

// ── Send Functions ──────────────────────────────────────────────────────────

async function sendViaConsole(email: string, token: string, baseUrl: string): Promise<EmailResult> {
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
  console.log(`\n[email] Magic link for ${email}:`);
  console.log(`  ${verifyUrl}\n`);
  return { success: true, provider: 'console' };
}

async function sendViaSmtp(email: string, token: string, baseUrl: string): Promise<EmailResult> {
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || 'RC Engine <noreply@rc-engine.dev>',
      to: email,
      subject: 'Sign in to RC Engine',
      html: buildMagicLinkHtml(verifyUrl),
    });

    return { success: true, provider: 'smtp' };
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[email] SMTP send failed: ${errorMsg}`);
    return { success: false, provider: 'smtp', error: errorMsg };
  }
}

async function sendViaResend(email: string, token: string, baseUrl: string): Promise<EmailResult> {
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, provider: 'resend', error: 'RESEND_API_KEY not set' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'RC Engine <noreply@rc-engine.dev>',
        to: [email],
        subject: 'Sign in to RC Engine',
        html: buildMagicLinkHtml(verifyUrl),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, provider: 'resend', error: `HTTP ${response.status}: ${text}` };
    }

    return { success: true, provider: 'resend' };
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`[email] Resend send failed: ${errorMsg}`);
    return { success: false, provider: 'resend', error: errorMsg };
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a magic link email to the given address.
 * Automatically picks the best available provider.
 * Falls back to console logging if no email provider is configured.
 */
export async function sendMagicLinkEmail(email: string, token: string, baseUrl: string): Promise<EmailResult> {
  const provider = detectProvider();

  switch (provider) {
    case 'resend':
      return sendViaResend(email, token, baseUrl);
    case 'smtp':
      return sendViaSmtp(email, token, baseUrl);
    default:
      return sendViaConsole(email, token, baseUrl);
  }
}

/** Get the currently active email provider name. */
export function getEmailProvider(): EmailProvider {
  return detectProvider();
}
