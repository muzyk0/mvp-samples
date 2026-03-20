import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  BenchmarkRequestDto,
  DEFAULT_BENCHMARK_OPTIONS,
  DEFAULT_EXPORT_BATCH_SIZE,
  DEFAULT_EXPORT_LIMIT,
  DEFAULT_EXPORT_OFFSET,
  DEFAULT_EXPORT_SEED,
  ExportRequestDto,
  MAX_EXPORT_BATCH_SIZE,
} from './export-request.dto';

describe('ExportRequestDto', () => {
  it('exposes the documented default constants', () => {
    expect(DEFAULT_EXPORT_LIMIT).toBe(10_000);
    expect(DEFAULT_EXPORT_OFFSET).toBe(0);
    expect(DEFAULT_EXPORT_BATCH_SIZE).toBe(500);
    expect(DEFAULT_EXPORT_SEED).toBe(12_345);
    expect(MAX_EXPORT_BATCH_SIZE).toBe(10_000);
    expect(DEFAULT_BENCHMARK_OPTIONS).toEqual({
      limit: 2000,
      seed: DEFAULT_EXPORT_SEED,
      fileName: 'benchmark.xlsx',
      includeMemory: true,
    });
  });

  it('initializes request defaults on class instances', () => {
    const request = new ExportRequestDto();
    const benchmark = new BenchmarkRequestDto();

    expect(request.limit).toBe(DEFAULT_EXPORT_LIMIT);
    expect(request.offset).toBe(DEFAULT_EXPORT_OFFSET);
    expect(request.batchSize).toBe(DEFAULT_EXPORT_BATCH_SIZE);
    expect(request.seed).toBe(DEFAULT_EXPORT_SEED);
    expect(request.fileName).toBe('export.xlsx');
    expect(request.sheetName).toBe('Data');
    expect(request.includeHeaders).toBe(true);
    expect(benchmark.includeMemory).toBe(true);
  });

  it('transforms and validates a valid payload', () => {
    const request = plainToInstance(ExportRequestDto, {
      limit: '25',
      offset: '5',
      batchSize: '10',
      seed: '99',
      columns: ['ID', 'Name'],
      fileName: 'report.xlsx',
      sheetName: 'Employees',
      includeHeaders: true,
      filters: {
        department: 'IT',
        position: 'Developer',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-02-01T00:00:00.000Z',
        minSalary: 1000,
        maxSalary: 5000,
      },
    });

    const errors = validateSync(request);

    expect(errors).toEqual([]);
    expect(request.limit).toBe(25);
    expect(request.offset).toBe(5);
    expect(request.batchSize).toBe(10);
    expect(request.seed).toBe(99);
    expect(request.filters?.startDate).toBeInstanceOf(Date);
    expect(request.filters?.endDate).toBeInstanceOf(Date);
  });

  it('rejects invalid numeric and boolean values', () => {
    const request = plainToInstance(BenchmarkRequestDto, {
      limit: 0,
      offset: -1,
      batchSize: MAX_EXPORT_BATCH_SIZE + 1,
      seed: -1,
      columns: ['ID', 1],
      fileName: 100,
      sheetName: 200,
      includeHeaders: 'yes',
      includeMemory: 'no',
    });

    const errors = validateSync(request);
    const errorProperties = errors.map((error) => error.property);

    expect(errorProperties).toEqual(
      expect.arrayContaining([
        'limit',
        'offset',
        'batchSize',
        'seed',
        'columns',
        'fileName',
        'sheetName',
        'includeHeaders',
        'includeMemory',
      ]),
    );
  });
});
