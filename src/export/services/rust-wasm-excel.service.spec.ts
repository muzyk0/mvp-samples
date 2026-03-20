import ExcelJS from 'exceljs';
import { Writable } from 'stream';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExportDatasetStreamPlan } from '../interfaces/export-data.interface';
import { RustWasmExcelService } from './rust-wasm-excel.service';

class MissingAssetRustWasmExcelService extends RustWasmExcelService {
  protected getRustAssetsDir(): string {
    return '/tmp/rust-wasm-missing-assets';
  }
}

describe('RustWasmExcelService', () => {
  let service: RustWasmExcelService;

  beforeEach(() => {
    service = new RustWasmExcelService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  function createPlan(
    columns: string[],
    total: number,
  ): ExportDatasetStreamPlan {
    return {
      columns,
      total,
      seed: 42,
      batchSize: Math.min(total, 250),
      effectiveLimit: total,
      totalMatching: total,
      startOffset: 0,
    };
  }

  it('exports a valid xlsx workbook with dataset metadata', async () => {
    const plan = createPlan(['ID', 'Name', 'JoinedAt'], 2);

    const rows = (async function* () {
      await Promise.resolve();
      yield [
        {
          ID: 1,
          Name: 'Alice',
          JoinedAt: new Date('2026-03-15T00:00:00.000Z'),
        },
      ];
      yield [{ ID: 2, Name: 'Bob', JoinedAt: null }];
    })();

    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      rows,
      'rust-wasm-test.xlsx',
      'Employees',
    );

    expect(result.variant).toBe('rust-wasm');
    expect(result.fileName).toBe('rust-wasm-test.xlsx');
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(3);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    const worksheet = workbook.getWorksheet('Employees');

    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('ID');
    expect(worksheet?.getCell('B1').value).toBe('Name');
    expect(worksheet?.getCell('C1').value).toBe('JoinedAt');
    expect(worksheet?.getCell('A2').value).toBe(1);
    expect(worksheet?.getCell('B2').value).toBe('Alice');
    expect(worksheet?.getCell('C2').value).toBe('2026-03-15T00:00:00.000Z');
    expect(worksheet?.getCell('A3').value).toBe(2);
    expect(worksheet?.getCell('B3').value).toBe('Bob');
    expect(worksheet?.getCell('C3').value).toBeNull();
  });

  it('reports generated asset availability in status', () => {
    expect(service.getStatus()).toEqual({
      queued: false,
      hasPackage: true,
      hasBinary: true,
    });
  });

  it('fails explicitly when runtime artifacts are missing', async () => {
    const missingAssetService = new MissingAssetRustWasmExcelService();

    const plan = createPlan(['ID'], 1);

    await expect(
      missingAssetService.exportPlanToBuffer(
        plan,
        (async function* () {
          await Promise.resolve();
          yield [{ ID: 1 }];
        })(),
        'missing.xlsx',
      ),
    ).rejects.toThrow(/Rust WASM assets are not available yet/);
  });

  it('exports larger datasets without breaking workbook correctness', async () => {
    const totalRows = 1500;
    const plan = createPlan(['ID', 'Name', 'Active'], totalRows);

    const rows = (async function* () {
      await Promise.resolve();

      for (let offset = 0; offset < totalRows; offset += 250) {
        yield Array.from(
          { length: Math.min(250, totalRows - offset) },
          (_, index) => {
            const id = offset + index + 1;
            return {
              ID: id,
              Name: `Employee ${id}`,
              Active: id % 2 === 0,
            };
          },
        );
      }
    })();

    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      rows,
      'rust-wasm-large.xlsx',
      'Employees',
    );

    expect(result.rowCount).toBe(totalRows);
    expect(result.columnCount).toBe(3);
    expect(result.sizeBytes).toBeGreaterThan(20_000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    const worksheet = workbook.getWorksheet('Employees');

    expect(worksheet).toBeDefined();
    expect(worksheet?.rowCount).toBe(totalRows + 1);
    expect(worksheet?.getCell('A1501').value).toBe(totalRows);
    expect(worksheet?.getCell('B1501').value).toBe(`Employee ${totalRows}`);
    expect(worksheet?.getCell('C1501').value).toBe(true);
  });

  it('handles writable backpressure while streaming final workbook bytes', async () => {
    const plan = createPlan(['ID', 'Name'], 512);

    const rows = (async function* () {
      await Promise.resolve();
      yield Array.from({ length: 512 }, (_, index) => ({
        ID: index + 1,
        Name: `Employee ${index + 1}`,
      }));
    })();

    const chunks: Buffer[] = [];
    const writable = new Writable({
      highWaterMark: 16,
      write(chunk, _encoding, callback) {
        setTimeout(() => {
          chunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
          );
          callback();
        }, 1);
      },
    });

    const result = await service.exportPlanToWritable(plan, rows, {
      writable,
      fileName: 'rust-wasm-backpressure.xlsx',
      sheetName: 'Employees',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(chunks));

    expect(result.sizeBytes).toBe(Buffer.concat(chunks).length);
    expect(result.rowCount).toBe(512);
    expect(workbook.getWorksheet('Employees')?.getCell('B513').value).toBe(
      'Employee 512',
    );
  });

  it('destroys the writable when export output cannot be written', async () => {
    const plan = createPlan(['ID'], 1);
    let destroyed = false;

    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('write failed'));
      },
      destroy(error, callback) {
        destroyed = true;
        callback(error);
      },
    });

    await expect(
      service.exportPlanToWritable(
        plan,
        (async function* () {
          await Promise.resolve();
          yield [{ ID: 1 }];
        })(),
        {
          writable,
          fileName: 'rust-wasm-error.xlsx',
        },
      ),
    ).rejects.toThrow(/write failed/);

    expect(destroyed).toBe(true);
    expect(writable.destroyed).toBe(true);
  });
});
