import { describe, expect, it } from 'vitest';
import {
  buildEmployeeSeedRecord,
  createMulberry32,
} from './employee-generator';

describe('employee-generator', () => {
  it('produces deterministic pseudo-random sequences', () => {
    const first = createMulberry32(12345);
    const second = createMulberry32(12345);
    const third = createMulberry32(54321);

    const firstValues = [first(), first(), first()];
    const secondValues = [second(), second(), second()];
    const thirdValues = [third(), third(), third()];

    expect(firstValues).toEqual(secondValues);
    expect(thirdValues).not.toEqual(firstValues);
    expect(firstValues.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('builds consistent employee seed records from the rng stream', () => {
    const rng = createMulberry32(42);

    const record = buildEmployeeSeedRecord(7, rng);

    expect(record.id).toBe(7);
    expect(record.workEmail).toContain('.7@company.local');
    expect(record.workEmail).toMatch(/^[a-z.0-9@_-]+$/);
    expect(record.mobilePhone).toMatch(/^\+7 9\d{2} \d{3}-\d{2}-\d{2}$/);
    expect(record.baseSalary).toBeGreaterThanOrEqual(70_000);
    expect(record.baseSalary).toBeLessThanOrEqual(280_000);
    expect(record.totalSalary).toBe(record.baseSalary + record.bonusSalary);
    expect(record.birthDate.toISOString()).toMatch(/^(19\d{2}|2000)-/);
    expect(record.hireDate.getFullYear()).toBeGreaterThanOrEqual(2015);
    expect(record.hireDate.getFullYear()).toBeLessThanOrEqual(2024);
    expect(record.age).toBeGreaterThanOrEqual(25);
    expect(record.tenureYears).toBeGreaterThanOrEqual(1);
    expect(typeof record.isRemote).toBe('boolean');
    expect(typeof record.isActive).toBe('boolean');
    expect(record.performanceRating).toBeGreaterThanOrEqual(2.5);
    expect(record.performanceRating).toBeLessThanOrEqual(5);
  });
});
