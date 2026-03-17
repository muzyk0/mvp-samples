import ExcelJS from 'exceljs';
import { PassThrough, Writable } from 'stream';
import { ExceljsExportService } from './exceljs-export.service';
import { ExportDatasetStreamPlan } from '../interfaces/export-data.interface';
import { describe, it, expect } from 'vitest';

describe('ExceljsExportService', () => {
  const service = new ExceljsExportService();
  const plan: ExportDatasetStreamPlan = {
    columns: ['ID', 'Name'],
    total: 2,
    seed: 42,
    batchSize: 1,
    effectiveLimit: 2,
    totalMatching: 2,
    startOffset: 0,
  };

  const createRows = () =>
    (async function* () {
      await Promise.resolve();
      yield [{ ID: 1, Name: 'Alice' }];
      yield [{ ID: 2, Name: 'Bob' }];
    })();

  it('exports a valid xlsx workbook with dataset metadata', async () => {
    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      createRows(),
      'exceljs-test.xlsx',
    );

    expect(result.variant).toBe('exceljs');
    expect(result.fileName).toBe('exceljs-test.xlsx');
    expect(result.contentType).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(2);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet('Data');

    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('ID');
    expect(worksheet?.getCell('B1').value).toBe('Name');
    expect(worksheet?.getCell('A2').value).toBe(1);
    expect(worksheet?.getCell('B2').value).toBe('Alice');
    expect(worksheet?.getCell('A3').value).toBe(2);
    expect(worksheet?.getCell('B3').value).toBe('Bob');
  });

  it('counts bytes correctly for writables without bytesWritten', async () => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const writableWithoutBytesWritten = new Writable({
      write(chunk, _encoding, callback) {
        sink.write(chunk, callback);
      },
      final(callback) {
        sink.end(callback);
      },
    });

    const result = await service.exportPlanToWritable(plan, createRows(), {
      writable: writableWithoutBytesWritten,
      fileName: 'exceljs-test.xlsx',
    });

    const buffer = Buffer.concat(chunks);
    expect(result.sizeBytes).toBe(buffer.length);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });
});
