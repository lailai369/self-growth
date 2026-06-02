import { describe, it, expect } from 'vitest';
import { validateEmail, validatePassword, validateUsername } from '../src/utils/validator';

describe('Auth Validation', () => {
  it('should validate correct email', () => {
    expect(validateEmail('user@yunlailai.com')).toBe(true);
  });

  it('should reject invalid email', () => {
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  it('should validate correct password', () => {
    expect(validatePassword('123456')).toBe(true);
    expect(validatePassword('a'.repeat(128))).toBe(true);
  });

  it('should reject short password', () => {
    expect(validatePassword('12345')).toBe(false);
  });

  it('should validate correct username', () => {
    expect(validateUsername('user_123')).toBe(true);
  });

  it('should reject invalid username', () => {
    expect(validateUsername('ab')).toBe(false);
    expect(validateUsername('user@name')).toBe(false);
  });
});