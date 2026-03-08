/**
 * Auth Layer -- Simple session-based authentication for RC Engine Web UI.
 *
 * MVP approach: email + magic link (no password).
 * Sessions stored in SQLite for persistence across server restarts.
 *
 * Flow:
 *   1. User enters email at /login
 *   2. Server generates a magic token, stores it, and "sends" it
 *      (in MVP: logged to console; production: email via SendGrid/SES)
 *   3. User clicks /auth/verify?token=X
 *   4. Server creates a session, sets a cookie
 *   5. Subsequent requests include the session cookie
 *
 * For MVP, we also support a local dev mode where auth is bypassed
 * and a default user is assumed (RC_AUTH_BYPASS=true).
 */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Request, Response, NextFunction } from 'express';
import { logger, pseudonymize } from './security.js';

// Simple cookie parser (avoids extra dependency)
function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const [key, ...vals] = pair.trim().split('=');
    if (key) cookies[key.trim()] = vals.join('=').trim();
  }
  return cookies;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
  tier: string; // TierId from pricing
  orgId?: string;
  role: string; // 'owner' | 'admin' | 'member'
  createdAt: string;
  lastLoginAt: string;
  apiKeys?: Record<string, boolean>; // which API keys they've configured
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  tier: string;
  maxSeats: number;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

interface MagicToken {
  token: string;
  email: string;
  expiresAt: number;
}

// ── SQLite Store ─────────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_TOKEN_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    max_seats INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    tier TEXT NOT NULL DEFAULT 'free',
    org_id TEXT REFERENCES organizations(id),
    role TEXT NOT NULL DEFAULT 'member',
    api_keys_json TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS magic_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS org_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL,
    invited_by TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_email TEXT,
    target_type TEXT,
    target_id TEXT,
    detail TEXT,
    ip TEXT,
    success INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit_events(actor_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action
    ON audit_events(action);
`;

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const dataDir = path.join(process.cwd(), '.rc-engine');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(path.join(dataDir, 'auth.db'));
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_DDL);
  return _db;
}

// Default dev user for bypass mode
const DEV_USER: User = {
  id: 'dev-user',
  email: 'dev@localhost',
  name: 'Developer',
  tier: 'pro',
  role: 'owner',
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};

// ── Audit Logging ───────────────────────────────────────────────────────────

export interface AuditEvent {
  action: string;
  actorId?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ip?: string;
  success?: boolean;
}

/**
 * Record a structured audit event. Persisted to SQLite for compliance and forensics.
 * Call this for: auth events, tier changes, org mutations, privileged tool executions.
 */
export function auditLog(event: AuditEvent): void {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO audit_events (id, timestamp, action, actor_id, actor_email, target_type, target_id, detail, ip, success)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      timestamp,
      event.action,
      event.actorId || null,
      event.actorEmail || null,
      event.targetType || null,
      event.targetId || null,
      event.detail || null,
      event.ip || null,
      event.success !== false ? 1 : 0,
    );
  } catch (err) {
    // Audit logging must never crash the server
    logger.error('Failed to write audit event', { error: (err as Error).message });
  }
}

/**
 * Query recent audit events (for admin dashboard / compliance).
 */
export function getAuditEvents(limit: number = 100, action?: string): Array<AuditEvent & { id: string; timestamp: string }> {
  const db = getDb();
  if (action) {
    return db.prepare(
      `SELECT id, timestamp, action, actor_id as actorId, actor_email as actorEmail, target_type as targetType, target_id as targetId, detail, ip, success
       FROM audit_events WHERE action = ? ORDER BY timestamp DESC LIMIT ?`,
    ).all(action, limit) as Array<AuditEvent & { id: string; timestamp: string }>;
  }
  return db.prepare(
    `SELECT id, timestamp, action, actor_id as actorId, actor_email as actorEmail, target_type as targetType, target_id as targetId, detail, ip, success
     FROM audit_events ORDER BY timestamp DESC LIMIT ?`,
  ).all(limit) as Array<AuditEvent & { id: string; timestamp: string }>;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Check if auth bypass is enabled (for local development). */
export function isAuthBypassed(): boolean {
  // Only bypass when explicitly set -- NODE_ENV=development alone is not enough
  return process.env.RC_AUTH_BYPASS === 'true';
}

/**
 * Request a magic link for the given email.
 * Returns the token (in production, this would be emailed instead).
 */
export function requestMagicLink(email: string): string {
  const normalized = email.toLowerCase().trim();
  const db = getDb();

  // Create user if not found
  if (!findUserByEmail(normalized)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO users (id, email, tier, created_at, last_login_at) VALUES (?, ?, 'free', ?, ?)`).run(
      id,
      normalized,
      now,
      now,
    );
  }

  // Generate token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + MAGIC_TOKEN_DURATION_MS;
  db.prepare(`INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)`).run(token, normalized, expiresAt);

  // Log the event with pseudonymized email (GDPR compliant)
  auditLog({ action: 'magic_link_requested', actorEmail: pseudonymize(normalized) });

  // Only log token to console in development (never in production)
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Magic link generated', { email: pseudonymize(normalized) });
  }

  return token;
}

/**
 * Verify a magic link token and create a session.
 * Returns the session ID (to be set as a cookie) or null if invalid.
 */
export function verifyMagicLink(token: string): { sessionId: string; user: User } | null {
  const db = getDb();

  const row = db.prepare(`SELECT token, email, expires_at FROM magic_tokens WHERE token = ?`).get(token) as
    | MagicToken
    | undefined;
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    db.prepare(`DELETE FROM magic_tokens WHERE token = ?`).run(token);
    return null;
  }

  // Consume the token
  db.prepare(`DELETE FROM magic_tokens WHERE token = ?`).run(token);

  // Find user
  const user = findUserByEmail(row.email);
  if (!user) return null;

  // Update last login
  const now = new Date().toISOString();
  db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, user.id);
  user.lastLoginAt = now;

  // Create session
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`).run(sessionId, user.id, expiresAt);

  auditLog({ action: 'login_success', actorId: user.id, actorEmail: pseudonymize(user.email) });

  return { sessionId, user };
}

/**
 * Get the current user from a session ID.
 */
export function getUserFromSession(sessionId: string): User | null {
  if (isAuthBypassed()) return DEV_USER;

  const db = getDb();
  const session = db.prepare(`SELECT id, user_id, expires_at FROM sessions WHERE id = ?`).get(sessionId) as
    | { id: string; user_id: string; expires_at: string }
    | undefined;
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
    return null;
  }

  return getUserById(session.user_id);
}

/**
 * Destroy a session (logout).
 */
export function destroySession(sessionId: string): void {
  // Look up who is logging out before deleting
  const session = getDb().prepare(`SELECT user_id FROM sessions WHERE id = ?`).get(sessionId) as { user_id: string } | undefined;
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  if (session) {
    auditLog({ action: 'logout', actorId: session.user_id });
  }
}

/**
 * Update user's tier in the database and write tier.json to all user project directories.
 * This ensures MCP-only clients see the correct tier via `.rc-engine/tier.json`.
 */
export function updateUserTier(userId: string, tier: string): boolean {
  const user = getUserById(userId);
  const oldTier = user?.tier || 'unknown';
  const result = getDb().prepare(`UPDATE users SET tier = ? WHERE id = ?`).run(tier, userId);
  if (result.changes > 0) {
    writeTierToProjects(userId, tier);
    auditLog({
      action: 'tier_change',
      actorId: userId,
      actorEmail: user ? pseudonymize(user.email) : undefined,
      detail: `${oldTier} -> ${tier}`,
      targetType: 'user',
      targetId: userId,
    });
  }
  return result.changes > 0;
}

/**
 * Write `.rc-engine/tier.json` to the user's project directories.
 * This bridges the gap between web-based tier management and MCP-level enforcement.
 */
function writeTierToProjects(userId: string, tier: string): void {
  try {
    const baseDir = process.env.RC_PROJECTS_DIR || path.join(process.env.HOME || '/tmp', 'rc-projects');
    const userDir = path.join(baseDir, userId);
    if (!fs.existsSync(userDir)) return;

    // Scan for project directories (those with .rc-engine or any domain dir)
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const projectPath = path.join(userDir, entry.name);
      const rcDir = path.join(projectPath, '.rc-engine');
      // Only write to directories that look like RC Engine projects
      const isProject =
        fs.existsSync(path.join(projectPath, 'pre-rc-research')) ||
        fs.existsSync(path.join(projectPath, '.rc-method')) ||
        fs.existsSync(rcDir);
      if (!isProject) continue;

      fs.mkdirSync(rcDir, { recursive: true });
      fs.writeFileSync(
        path.join(rcDir, 'tier.json'),
        JSON.stringify({ tier, updatedAt: new Date().toISOString() }, null, 2),
        'utf-8',
      );
    }
  } catch (err) {
    logger.error('Failed to write tier.json to projects', { error: (err as Error).message });
  }
}

/**
 * Get a user by ID.
 */
export function getUser(userId: string): User | null {
  if (isAuthBypassed()) return DEV_USER;
  return getUserById(userId);
}

// ── Express Middleware ──────────────────────────────────────────────────────

/** Extend Express Request to include user. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Auth middleware -- attaches user to request if session exists.
 * Does NOT block unauthenticated requests (use requireAuth for that).
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (isAuthBypassed()) {
    req.user = DEV_USER;
    next();
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.rc_session;
  if (sessionId && typeof sessionId === 'string') {
    const user = getUserFromSession(sessionId);
    if (user) {
      req.user = user;
    }
  }

  next();
}

/**
 * Require authentication -- returns 401 if no valid session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthBypassed()) {
    req.user = DEV_USER;
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  next();
}

// ── Internal ────────────────────────────────────────────────────────────────

function findUserByEmail(email: string): User | undefined {
  const row = getDb()
    .prepare(
      `SELECT id, email, name, tier, org_id, role, api_keys_json, created_at, last_login_at FROM users WHERE email = ?`,
    )
    .get(email) as UserRow | undefined;
  if (!row) return undefined;
  return rowToUser(row);
}

function getUserById(userId: string): User | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, name, tier, org_id, role, api_keys_json, created_at, last_login_at FROM users WHERE id = ?`,
    )
    .get(userId) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  org_id: string | null;
  role: string;
  api_keys_json: string | null;
  created_at: string;
  last_login_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    tier: row.tier,
    orgId: row.org_id ?? undefined,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    apiKeys: row.api_keys_json ? JSON.parse(row.api_keys_json) : undefined,
  };
}

/** Clean up expired sessions and tokens (call periodically or on startup). */
export function cleanupExpired(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now);
  db.prepare(`DELETE FROM magic_tokens WHERE expires_at < ?`).run(Date.now());
}

// ── Organization Management ─────────────────────────────────────────────────

/** Create a new organization. The creator becomes the owner. */
export function createOrganization(userId: string, orgName: string, requestedTier?: string): Organization {
  const db = getDb();

  // Use the creator's ACTUAL tier, not any requested tier (prevents escalation)
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');
  const tier = user.tier === 'free' ? 'free' : user.tier;
  if (requestedTier && requestedTier !== tier) {
    auditLog({
      action: 'org_create_tier_mismatch',
      actorId: userId,
      actorEmail: pseudonymize(user.email),
      detail: `Requested ${requestedTier} but user tier is ${tier}`,
      success: false,
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const maxSeats = tier === 'enterprise' ? 999 : tier === 'pro' ? 10 : tier === 'starter' ? 5 : 1;

  db.prepare(
    `INSERT INTO organizations (id, name, owner_id, tier, max_seats, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, orgName, userId, tier, maxSeats, now);

  // Update the user's org_id and role
  db.prepare(`UPDATE users SET org_id = ?, role = 'owner' WHERE id = ?`).run(id, userId);

  auditLog({
    action: 'org_created',
    actorId: userId,
    actorEmail: pseudonymize(user.email),
    targetType: 'organization',
    targetId: id,
    detail: `tier=${tier}, seats=${maxSeats}`,
  });

  return { id, name: orgName, ownerId: userId, tier, maxSeats, createdAt: now };
}

/** Get organization by ID. */
export function getOrganization(orgId: string): Organization | null {
  const row = getDb()
    .prepare(`SELECT id, name, owner_id, tier, max_seats, created_at FROM organizations WHERE id = ?`)
    .get(orgId) as
    | { id: string; name: string; owner_id: string; tier: string; max_seats: number; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    tier: row.tier,
    maxSeats: row.max_seats,
    createdAt: row.created_at,
  };
}

/** List members of an organization. */
export function getOrgMembers(orgId: string): User[] {
  const rows = getDb()
    .prepare(
      `SELECT id, email, name, tier, org_id, role, api_keys_json, created_at, last_login_at FROM users WHERE org_id = ?`,
    )
    .all(orgId) as UserRow[];
  return rows.map(rowToUser);
}

/** Invite a user to an organization (creates an invite record). */
export function inviteToOrg(orgId: string, inviterUserId: string, email: string): string {
  const db = getDb();

  // Check seat limit
  const org = getOrganization(orgId);
  if (!org) throw new Error('Organization not found');
  const members = getOrgMembers(orgId);
  if (members.length >= org.maxSeats) {
    throw new Error(`Organization seat limit reached (${org.maxSeats} seats). Upgrade to add more members.`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const normalizedEmail = email.toLowerCase().trim();
  db.prepare(
    `INSERT INTO org_invites (id, org_id, email, invited_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, orgId, normalizedEmail, inviterUserId, expiresAt, now);

  auditLog({
    action: 'org_invite_sent',
    actorId: inviterUserId,
    targetType: 'organization',
    targetId: orgId,
    detail: `invited ${pseudonymize(normalizedEmail)}`,
  });

  return id;
}

/** Accept an org invite (adds user to organization). */
export function acceptOrgInvite(inviteId: string, userId: string): boolean {
  const db = getDb();
  const invite = db.prepare(`SELECT id, org_id, email, expires_at FROM org_invites WHERE id = ?`).get(inviteId) as
    | { id: string; org_id: string; email: string; expires_at: string }
    | undefined;

  if (!invite) return false;
  if (new Date(invite.expires_at) < new Date()) {
    db.prepare(`DELETE FROM org_invites WHERE id = ?`).run(inviteId);
    return false;
  }

  // Verify the accepting user's email matches the invite (prevents invite hijacking)
  const user = getUserById(userId);
  if (!user) return false;
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    auditLog({
      action: 'org_invite_rejected',
      actorId: userId,
      actorEmail: pseudonymize(user.email),
      targetType: 'org_invite',
      targetId: inviteId,
      detail: `Email mismatch: user=${pseudonymize(user.email)}, invite=${pseudonymize(invite.email)}`,
      success: false,
    });
    return false;
  }

  // Add user to org
  const org = getOrganization(invite.org_id);
  if (!org) return false;

  db.prepare(`UPDATE users SET org_id = ?, role = 'member', tier = ? WHERE id = ?`).run(
    invite.org_id,
    org.tier,
    userId,
  );
  db.prepare(`DELETE FROM org_invites WHERE id = ?`).run(inviteId);

  auditLog({
    action: 'org_invite_accepted',
    actorId: userId,
    actorEmail: pseudonymize(user.email),
    targetType: 'organization',
    targetId: invite.org_id,
  });

  return true;
}
