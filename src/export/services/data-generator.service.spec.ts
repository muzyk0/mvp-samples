import { describe, expect, it, vi } from 'vitest';
import { DataGeneratorService } from './data-generator.service';
import { ExportDatasetRepository } from '../repositories/export-dataset.repository';

describe('DataGeneratorService', () => {
  function createService() {
    const getDataset = vi.fn();
    const createStreamPlan = vi.fn();
    const streamRows = vi.fn();
    const getColumnNames = vi.fn();
    const repository = {
      getDataset,
      createStreamPlan,
      streamRows,
      getColumnNames,
    } as unknown as ExportDatasetRepository;

    return {
      service: new DataGeneratorService(repository),
      repository,
      getDataset,
      createStreamPlan,
      streamRows,
      getColumnNames,
    };
  }

  it('passes through dataset access helpers', async () => {
    const { service, getDataset, getColumnNames } = createService();
    const dataset = { total: 2, seed: 7, columns: ['ID'], rows: [{ ID: 1 }] };
    getDataset.mockResolvedValue(dataset);
    getColumnNames.mockReturnValue(['ID', 'Name']);

    await expect(service.getDataset({ limit: 2 })).resolves.toEqual(dataset);
    await expect(
      service.generateExportData({ department: 'IT' }, 2),
    ).resolves.toEqual(dataset);
    expect(service.getColumnNames()).toEqual(['ID', 'Name']);
  });

  it('normalizes filter-based stream generation options before delegating', async () => {
    const { service, createStreamPlan, streamRows } = createService();
    const plan = { id: 'plan-from-filters' };
    const streamedBatches = [[{ ID: 1 }], [{ ID: 2 }]];

    createStreamPlan.mockResolvedValue(plan);
    streamRows.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield* streamedBatches;
      })(),
    );

    const received = [];
    for await (const batch of service.generateExportDataStream(
      { department: 'IT' },
      25,
      10,
    )) {
      received.push(batch);
    }

    expect(createStreamPlan).toHaveBeenCalledWith({
      filters: { department: 'IT' },
      limit: 25,
      batchSize: 10,
    });
    expect(streamRows).toHaveBeenCalledWith(plan);
    expect(received).toEqual(streamedBatches);
  });

  it('preserves explicit ExportRequestDto values when generating stream data', async () => {
    const { service, createStreamPlan, streamRows } = createService();
    const plan = { id: 'plan-from-request' };
    createStreamPlan.mockResolvedValue(plan);
    streamRows.mockReturnValue(
      (async function* () {
        await Promise.resolve();
        yield [{ ID: 1 }];
      })(),
    );

    const received = [];
    for await (const batch of service.generateExportDataStream({
      limit: 5,
      batchSize: 2,
      seed: 9,
      columns: ['ID'],
      fileName: 'rows.xlsx',
      filters: { department: 'Ops' },
    })) {
      received.push(batch);
    }

    expect(createStreamPlan).toHaveBeenCalledWith({
      limit: 5,
      batchSize: 2,
      seed: 9,
      columns: ['ID'],
      fileName: 'rows.xlsx',
      filters: { department: 'Ops' },
    });
    expect(received).toEqual([[{ ID: 1 }]]);
  });
});
