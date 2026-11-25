import { describe, expect, it } from 'vitest';
import { canAccessClass } from '@/lib/enrollment';

describe('canAccessClass', () => {
  it('blocks students with no active enrollment', () => {
    expect(canAccessClass(new Set(), null)).toBe(false);
    expect(canAccessClass(new Set(), 'class-1')).toBe(false);
  });

  it('allows enrolled students for class-wide activities', () => {
    expect(canAccessClass(new Set(['class-1']), null)).toBe(true);
  });

  it('allows only students enrolled in the activity class', () => {
    expect(canAccessClass(new Set(['class-1']), 'class-1')).toBe(true);
    expect(canAccessClass(new Set(['class-1']), 'class-2')).toBe(false);
  });
});
