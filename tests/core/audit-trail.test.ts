import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditTrail } from '../../src/core/collaboration/audit-trail.js';

describe('AuditTrail', () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = new AuditTrail(':memory:');
  });

  afterEach(() => {
    trail.close();
  });

  describe('logging', () => {
    it('records audit entries', () => {
      const id = trail.log({
        userId: 'user-1',
        userName: 'Alice',
        action: 'gate.approve',
        domain: 'rc',
        phase: 'Architect',
        projectPath: '/projects/myapp',
        details: { feedback: 'Looks good' },
      });

      expect(id).toBeGreaterThan(0);
    });

    it('queries by project path', () => {
      trail.log({ action: 'project.create', projectPath: '/proj/a', userName: 'Alice' });
      trail.log({ action: 'project.create', projectPath: '/proj/b', userName: 'Bob' });
      trail.log({ action: 'phase.start', projectPath: '/proj/a', domain: 'rc' });

      const entries = trail.query({ projectPath: '/proj/a' });
      expect(entries).toHaveLength(2);
    });

    it('queries by action type', () => {
      trail.log({ action: 'gate.approve', projectPath: '/proj/a' });
      trail.log({ action: 'gate.reject', projectPath: '/proj/a' });
      trail.log({ action: 'gate.approve', projectPath: '/proj/a' });

      const approvals = trail.query({ action: 'gate.approve' });
      expect(approvals).toHaveLength(2);
    });

    it('queries by user', () => {
      trail.log({ userId: 'alice', userName: 'Alice', action: 'phase.start' });
      trail.log({ userId: 'bob', userName: 'Bob', action: 'phase.start' });
      trail.log({ userId: 'alice', userName: 'Alice', action: 'phase.complete' });

      const aliceActions = trail.query({ userId: 'alice' });
      expect(aliceActions).toHaveLength(2);
    });

    it('returns entries in reverse chronological order', () => {
      trail.log({ action: 'phase.start', details: { order: 1 } });
      trail.log({ action: 'phase.complete', details: { order: 2 } });

      const entries = trail.query({});
      expect(entries[0].action).toBe('phase.complete'); // Most recent first
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        trail.log({ action: 'artifact.create', details: { num: i } });
      }

      const entries = trail.query({ limit: 3 });
      expect(entries).toHaveLength(3);
    });

    it('uses default user when not specified', () => {
      trail.log({ action: 'project.create' });

      const entries = trail.query({});
      expect(entries[0].userId).toBe('anonymous');
      expect(entries[0].userName).toBe('Anonymous');
    });
  });

  describe('comments', () => {
    it('adds and retrieves comments', () => {
      const id = trail.addComment({
        userId: 'alice',
        userName: 'Alice',
        targetType: 'artifact',
        targetId: 'rc-method/prds/PRD-myapp.md',
        projectPath: '/proj/a',
        content: 'The requirements section needs more detail.',
      });

      expect(id).toBeGreaterThan(0);

      const comments = trail.getComments('/proj/a', 'artifact', 'rc-method/prds/PRD-myapp.md');
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe('The requirements section needs more detail.');
      expect(comments[0].userName).toBe('Alice');
    });

    it('supports multiple comment types', () => {
      trail.addComment({
        targetType: 'gate',
        targetId: 'rc-gate-3',
        projectPath: '/proj/a',
        content: 'Why was this rejected?',
      });
      trail.addComment({
        targetType: 'finding',
        targetId: 'SEC-001',
        projectPath: '/proj/a',
        content: 'This is a false positive.',
      });
      trail.addComment({
        targetType: 'task',
        targetId: 'TASK-005',
        projectPath: '/proj/a',
        content: 'Needs API integration.',
      });

      const gateComments = trail.getComments('/proj/a', 'gate', 'rc-gate-3');
      expect(gateComments).toHaveLength(1);

      const allComments = trail.getProjectComments('/proj/a');
      expect(allComments).toHaveLength(3);
    });

    it('also logs comments to audit trail', () => {
      trail.addComment({
        userId: 'bob',
        userName: 'Bob',
        targetType: 'finding',
        targetId: 'SEC-002',
        projectPath: '/proj/a',
        content: 'Accepted risk.',
      });

      const entries = trail.query({ action: 'comment.add' });
      expect(entries).toHaveLength(1);
      expect(entries[0].details?.targetId).toBe('SEC-002');
    });
  });

  describe('activity', () => {
    it('getRecentActivity returns project-scoped entries', () => {
      trail.log({ action: 'project.create', projectPath: '/proj/a' });
      trail.log({ action: 'phase.start', projectPath: '/proj/a', domain: 'pre-rc' });
      trail.log({ action: 'project.create', projectPath: '/proj/b' });

      const activity = trail.getRecentActivity('/proj/a');
      expect(activity).toHaveLength(2);
    });

    it('getUserActivity returns user-scoped entries', () => {
      trail.log({ userId: 'alice', action: 'gate.approve' });
      trail.log({ userId: 'bob', action: 'gate.reject' });

      const alice = trail.getUserActivity('alice');
      expect(alice).toHaveLength(1);
      expect(alice[0].action).toBe('gate.approve');
    });
  });

  describe('summary', () => {
    it('returns correct summary', () => {
      trail.log({ userId: 'alice', action: 'project.create', projectPath: '/proj/a' });
      trail.log({ userId: 'bob', action: 'gate.approve', projectPath: '/proj/a' });
      trail.addComment({
        userId: 'alice',
        targetType: 'general',
        targetId: 'general',
        projectPath: '/proj/a',
        content: 'Hello',
      });

      const summary = trail.getSummary('/proj/a');
      expect(summary.totalEntries).toBe(3); // 2 logs + 1 from addComment
      expect(summary.totalComments).toBe(1);
      expect(summary.uniqueUsers).toBe(2);
      expect(summary.recentActions).toHaveLength(3);
    });

    it('returns global summary when no project specified', () => {
      trail.log({ action: 'project.create', projectPath: '/proj/a' });
      trail.log({ action: 'project.create', projectPath: '/proj/b' });

      const summary = trail.getSummary();
      expect(summary.totalEntries).toBe(2);
    });
  });
});
