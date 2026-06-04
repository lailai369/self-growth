import { describe, it, expect } from 'vitest';
import { validateSyncPath } from '../src/utils/validator';

describe('Sync Validation', () => {
  it('should validate correct path', () => {
    expect(validateSyncPath('memory/user_preferences.md')).toBe(true);
  });

  it('should reject path traversal', () => {
    expect(validateSyncPath('../etc/passwd')).toBe(false);
  });

  it('should reject empty path', () => {
    expect(validateSyncPath('')).toBe(false);
  });
});