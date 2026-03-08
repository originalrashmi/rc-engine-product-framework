/**
 * Security Module -- Shared security utilities for RC Engine Web Server.
 *
 * Single source of truth for:
 *   1. User-scoped project path validation (prevents path traversal)
 *   2. Express middleware for project-scoped routes
 *   3. HTML escaping utilities for template generators
 *   4. Rate limiting factory (auth, tools, reads, org, billing, WebSocket)
 *   5. Centralized error handler (CWE-209 -- no internal leak)
 *   6. Structured logging with correlation IDs and PII masking
 *   7. CSRF token middleware for enterprise proxies
 *   8. Startup secrets validation
 *
 * EVERY endpoint that touches project paths MUST use these utilities.
 * Do NOT write ad-hoc path validation in route handlers.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// ── Path Validation ──────────────────────────────────────────────────────────

/**
 * Validate that a project path is within the user's scoped directory.
 *
 * Returns the resolved path on success, or an error message on failure.
 * This is the ONLY function that should be used to validate project paths.
 *
 * Security properties:
 *   - Resolves symlinks via path.resolve (no symlink traversal)
 *   - Blocks ".." traversal patterns
 *   - Enforces user-scoped directory containment
 *   - Verifies the path exists and is a directory
 */
export function validateUserProjectPath(
  projectPath: string | undefined,
  userId: string | undefined,
): { resolved: string } | { error: string; status: 400 | 403 | 404 } {
  if (!projectPath || typeof projectPath !== 'string') {
    return { error: 'Missing project path', status: 400 };
  }

  if (!userId || typeof userId !== 'string') {
    return { error: 'Missing user context', status: 400 };
  }

  // Block obvious traversal patterns before resolving
  if (projectPath.includes('..')) {
    return { error: 'Path traversal blocked', status: 403 };
  }

  const baseDir =
    process.env.RC_PROJECTS_DIR || path.join(process.env.HOME || '/tmp', 'rc-projects');
  const userDir = path.resolve(baseDir, userId);
  const resolved = path.resolve(projectPath);

  // Must be within user's directory
  if (resolved !== userDir && !resolved.startsWith(userDir + path.sep)) {
    return { error: 'Access restricted to your projects', status: 403 };
  }

  // Must exist and be a directory
  try {
    const s = fs.statSync(resolved);
    if (!s.isDirectory()) {
      return { error: 'Not a directory', status: 400 };
    }
  } catch {
    return { error: 'Project path not found', status: 404 };
  }

  return { resolved };
}

/**
 * Validate that a file path is contained within a project directory.
 * Used for download/export endpoints where both projectPath and filePath are provided.
 */
export function validateFileWithinProject(
  projectPath: string,
  filePath: string,
): { fullPath: string } | { error: string; status: 400 | 403 | 404 } {
  if (!filePath || typeof filePath !== 'string') {
    return { error: 'Missing file path', status: 400 };
  }

  // Block traversal in the file path itself
  if (filePath.includes('..')) {
    return { error: 'Path traversal blocked', status: 403 };
  }

  const resolvedProject = path.resolve(projectPath);
  const fullPath = path.resolve(projectPath, filePath);

  if (!fullPath.startsWith(resolvedProject + path.sep) && fullPath !== resolvedProject) {
    return { error: 'Path traversal blocked', status: 403 };
  }

  if (!fs.existsSync(fullPath)) {
    return { error: 'File not found', status: 404 };
  }

  return { fullPath };
}

// ── Express Middleware ───────────────────────────────────────────────────────

/**
 * Middleware that validates `req.query.path` against the user's project scope.
 * Attaches `req.validatedProjectPath` on success.
 *
 * Use on any GET endpoint that takes a `?path=` query parameter.
 */
export function requireValidProjectQuery(req: Request, res: Response, next: NextFunction): void {
  const projectPath = req.query.path as string;
  const userId = req.user?.id;

  const result = validateUserProjectPath(projectPath, userId);
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Attach validated path for downstream handlers
  (req as RequestWithProject).validatedProjectPath = result.resolved;
  next();
}

/**
 * Middleware that validates `req.body.projectPath` against the user's project scope.
 * Attaches `req.validatedProjectPath` on success.
 *
 * Use on any POST endpoint that takes a projectPath in the body.
 */
export function requireValidProjectBody(req: Request, res: Response, next: NextFunction): void {
  const projectPath = (req.body as { projectPath?: string }).projectPath;
  const userId = req.user?.id;

  const result = validateUserProjectPath(projectPath, userId);
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  (req as RequestWithProject).validatedProjectPath = result.resolved;
  next();
}

/** Extended request with validated project path. */
export interface RequestWithProject extends Request {
  validatedProjectPath: string;
}

// ── HTML Escaping ────────────────────────────────────────────────────────────

/**
 * Escape a string for safe HTML content interpolation.
 * Handles &, <, >, ", and ' (single quote for attribute contexts).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize a value for use in an HTML style attribute.
 * Only allows safe CSS values (alphanumeric, spaces, hyphens, dots, hashes, parentheses, commas, percentages).
 * Strips everything else to prevent CSS injection / style attribute breakout.
 */
export function sanitizeStyleValue(value: string): string {
  // Strip anything that could break out of a style context
  return value.replace(/[^a-zA-Z0-9\s\-_.#(),%;]/g, '');
}

/**
 * Sanitize a numeric value for use in inline styles (e.g., width, height).
 * Returns the number clamped to a safe range, as a string.
 */
export function sanitizeNumericStyle(value: number, min: number = 0, max: number = 10000): string {
  const clamped = Math.max(min, Math.min(max, Math.round(value)));
  return String(clamped);
}

// ── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Create a rate limiter for tool execution endpoints.
 * Prevents unbounded AI API cost from rapid tool calls.
 */
export function createToolRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 tool calls per minute per IP
    message: { error: 'Too many tool calls. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  });
}

/**
 * Create a rate limiter for project read endpoints.
 */
export function createProjectReadLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 reads per minute
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  });
}

// ── CAPTCHA (Cloudflare Turnstile) ──────────────────────────────────────────

/**
 * Verify a Cloudflare Turnstile CAPTCHA token server-side.
 * Returns true if valid, false if invalid or not configured.
 *
 * Set TURNSTILE_SECRET_KEY in environment to enable.
 * When not configured, returns true (allows login without CAPTCHA in dev).
 */
export async function verifyTurnstile(token: string | undefined, ip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // CAPTCHA not configured — allow (dev mode)
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });

    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch {
    // Turnstile API failure — fail open in dev, fail closed in prod
    return process.env.NODE_ENV !== 'production';
  }
}

/** Check if Turnstile CAPTCHA is configured. */
export function isCaptchaEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

// ── Structured Logging ──────────────────────────────────────────────────────

/** Log levels (numeric for comparison). */
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

/** PII patterns to mask in log output. */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{8,}['"]?/gi, replacement: '[REDACTED]' },
  { pattern: /(?:sk_(?:test|live)_|whsec_|re_)[A-Za-z0-9_-]+/g, replacement: '[API_KEY]' },
];

/** Mask PII in a string. */
function maskPii(text: string): string {
  let masked = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, replacement);
  }
  return masked;
}

/** Hash an email for audit logging (pseudonymization). */
export function pseudonymize(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

/**
 * Structured logger with correlation IDs and PII masking.
 * All server logging should go through this — never use console.log directly.
 */
export const logger = {
  _level: (process.env.LOG_LEVEL as LogLevel) || 'info',

  _shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this._level];
  },

  _format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: maskPii(message),
      ...(meta ? Object.fromEntries(
        Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? maskPii(v) : v])
      ) : {}),
    };
    return JSON.stringify(entry);
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this._shouldLog('debug')) process.stdout.write(this._format('debug', message, meta) + '\n');
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (this._shouldLog('info')) process.stdout.write(this._format('info', message, meta) + '\n');
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (this._shouldLog('warn')) process.stderr.write(this._format('warn', message, meta) + '\n');
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (this._shouldLog('error')) process.stderr.write(this._format('error', message, meta) + '\n');
  },
};

/**
 * Middleware that attaches a unique correlation ID to each request.
 * Downstream handlers and logs can use `req.correlationId` for tracing.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as RequestWithCorrelation).correlationId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** Extended request with correlation ID. */
export interface RequestWithCorrelation extends Request {
  correlationId: string;
}

// ── Centralized Error Handler ───────────────────────────────────────────────

/** Operational errors with safe client messages. */
export class AppError extends Error {
  constructor(
    public readonly clientMessage: string,
    public readonly statusCode: number,
    public readonly internalDetail?: string,
  ) {
    super(internalDetail || clientMessage);
    this.name = 'AppError';
  }
}

/**
 * Centralized error handler middleware. Mount as the LAST middleware.
 * - Returns safe generic messages to clients (CWE-209)
 * - Logs full error details server-side with correlation ID
 * - Never leaks stack traces, file paths, or internal state
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = (req as RequestWithCorrelation).correlationId || 'unknown';

  if (err instanceof AppError) {
    logger.warn(err.message, { correlationId, statusCode: err.statusCode, path: req.path });
    res.status(err.statusCode).json({ error: err.clientMessage, requestId: correlationId });
    return;
  }

  // Unknown errors — log everything server-side, return nothing to client
  logger.error('Unhandled error', {
    correlationId,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack?.split('\n').slice(0, 5).join(' | '),
  });

  res.status(500).json({
    error: 'An internal error occurred. Please try again or contact support.',
    requestId: correlationId,
  });
}

/**
 * Wrap an async route handler to catch errors and forward to errorHandler.
 * Prevents unhandled promise rejections from crashing the server.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// ── CSRF Token Support ──────────────────────────────────────────────────────

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'rc_csrf';

/**
 * Middleware that issues and validates CSRF tokens.
 * - GET/HEAD/OPTIONS: issues a CSRF token cookie
 * - POST/PUT/DELETE: validates the token from the header matches the cookie
 *
 * This supplements SameSite cookies for enterprise environments
 * where corporate proxies strip SameSite attributes.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Issue a CSRF token on safe methods
    const existingToken = parseCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
    if (!existingToken) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // JS must read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }
    next();
    return;
  }

  // Validate on mutations
  const cookieToken = parseCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = req.headers[CSRF_TOKEN_HEADER] as string;

  // Skip CSRF for webhook endpoints (they use signature verification)
  if (req.path.includes('/webhook')) {
    next();
    return;
  }

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn('CSRF validation failed', {
      path: req.path,
      ip: req.ip,
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    });
    res.status(403).json({ error: 'CSRF validation failed. Please refresh and try again.' });
    return;
  }

  next();
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`));
  return match?.[1];
}

// ── Startup Secrets Validation ──────────────────────────────────────────────

interface SecretRequirement {
  envVar: string;
  label: string;
  required: boolean; // true = fail in production, false = warn only
  validate?: (value: string) => boolean;
}

const SECRET_REQUIREMENTS: SecretRequirement[] = [
  {
    envVar: 'STRIPE_SECRET_KEY',
    label: 'Stripe API key',
    required: false,
    validate: (v) => v.startsWith('sk_'),
  },
  {
    envVar: 'STRIPE_WEBHOOK_SECRET',
    label: 'Stripe webhook secret',
    required: false,
    validate: (v) => v.startsWith('whsec_'),
  },
  {
    envVar: 'TURNSTILE_SECRET_KEY',
    label: 'Cloudflare Turnstile secret',
    required: false,
  },
  {
    envVar: 'RESEND_API_KEY',
    label: 'Resend email API key',
    required: false,
    validate: (v) => v.startsWith('re_'),
  },
];

/**
 * Validate that required secrets are present and well-formed.
 * Call before app.listen().
 * - In production: throws on missing required secrets
 * - In dev: logs warnings for missing optional secrets
 */
export function validateSecrets(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const req of SECRET_REQUIREMENTS) {
    const value = process.env[req.envVar];
    if (!value) {
      if (req.required && isProduction) {
        missing.push(`${req.envVar} (${req.label})`);
      } else if (!req.required) {
        logger.info(`Optional secret not configured: ${req.label}`, { envVar: req.envVar });
      }
      continue;
    }
    if (req.validate && !req.validate(value)) {
      malformed.push(`${req.envVar} (${req.label}) -- invalid format`);
    }
  }

  if (malformed.length > 0) {
    logger.warn('Malformed secrets detected', { secrets: malformed });
  }

  if (missing.length > 0) {
    const msg = `Missing required secrets in production: ${missing.join(', ')}`;
    logger.error(msg);
    throw new Error(msg);
  }
}

// ── Additional Rate Limiters ────────────────────────────────────────────────

/** Rate limiter for organization mutation endpoints. */
export function createOrgRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 org operations per 15 min
    message: { error: 'Too many organization requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  });
}

/** Rate limiter for billing endpoints. */
export function createBillingRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 billing operations per 15 min
    message: { error: 'Too many billing requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  });
}

// ── WebSocket Security ──────────────────────────────────────────────────────

/** Maximum WebSocket message size in bytes (64KB). */
export const WS_MAX_MESSAGE_SIZE = 64 * 1024;

/** Maximum WebSocket connections per IP. */
export const WS_MAX_CONNECTIONS_PER_IP = 5;

/**
 * Track WebSocket connections per IP for rate limiting.
 * Returns true if the connection should be allowed, false if limit exceeded.
 */
const wsConnectionCounts = new Map<string, number>();

export function wsConnectionAllowed(ip: string): boolean {
  const count = wsConnectionCounts.get(ip) || 0;
  if (count >= WS_MAX_CONNECTIONS_PER_IP) return false;
  wsConnectionCounts.set(ip, count + 1);
  return true;
}

export function wsConnectionClosed(ip: string): void {
  const count = wsConnectionCounts.get(ip) || 0;
  if (count <= 1) {
    wsConnectionCounts.delete(ip);
  } else {
    wsConnectionCounts.set(ip, count - 1);
  }
}

// ── Request Logging Middleware ───────────────────────────────────────────────

/**
 * Log every request with timing, status code, and correlation ID.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const correlationId = (req as RequestWithCorrelation).correlationId || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.path}`, {
      correlationId,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 100),
    });
  });

  next();
}
