import { describe, expect, it, vi } from 'vitest';
import { ExportDatasetRepository } from './export-dataset.repository';

describe('ExportDatasetRepository', () => {
  it('wraps pagination without skipping or re-fetching rows', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      firstName: `Name-${index + 1}`,
      lastName: `Last-${index + 1}`,
      patronymic: null,
      workEmail: `user${index + 1}@example.com`,
      mobilePhone: `+700000000${index + 1}`,
      position: 'Developer',
      department: 'Engineering',
      city: 'Moscow',
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      age: 35,
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
      tenureYears: 5,
      employmentType: 'Full-time',
      isRemote: true,
      baseSalary: 100,
      bonusSalary: 10,
      totalSalary: 110,
      performanceRating: 5,
      isActive: true,
    }));

    const prisma = {
      employee: {
        count: vi.fn().mockResolvedValue(rows.length),
        findMany: vi
          .fn()
          .mockImplementation(
            ({
              where,
              skip = 0,
              take,
            }: {
              where?: { AND?: Array<{ id?: { gt?: number; lt?: number } }> };
              skip?: number;
              take: number;
            }) => {
              const conditions = where?.AND ?? [];
              const gt = conditions.find((item) => item.id?.gt !== undefined)
                ?.id?.gt;
              const lt = conditions.find((item) => item.id?.lt !== undefined)
                ?.id?.lt;
              const filtered = rows.filter((row) => {
                if (gt !== undefined && row.id <= gt) {
                  return false;
                }
                if (lt !== undefined && row.id >= lt) {
                  return false;
                }
                return true;
              });

              return Promise.resolve(filtered.slice(skip, skip + take));
            },
          ),
      },
    };

    const repository = new ExportDatasetRepository(prisma as never);
    const plan = await repository.createStreamPlan({
      limit: 5,
      batchSize: 2,
      offset: 0,
      seed: 8,
    });

    const batches: Array<Array<Record<string, unknown>>> = [];
    for await (const batch of repository.streamRows(plan)) {
      batches.push(batch);
    }

    const ids = batches.flat().map((row) => row.ID);
    expect(ids).toEqual([9, 10, 1, 2, 3]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
