import { describe, it, expect } from 'vitest';
import { getPlanPrice, getPlanDisplayName } from '../src/payment/payment.model';

describe('Payment Plans', () => {
  it('free plan should be 0', () => {
    expect(getPlanPrice('free')).toBe(0);
  });

  it('pro plan should be 15', () => {
    expect(getPlanPrice('pro')).toBe(15);
  });

  it('enterprise plan should be 3000', () => {
    expect(getPlanPrice('enterprise')).toBe(3000);
  });

  it('should return plan display name', () => {
    expect(getPlanDisplayName('pro')).toBe('专业版');
  });
});