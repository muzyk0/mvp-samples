import ExcelJS from 'exceljs';
import { ExceljsExportService } from './exceljs-export.service';
import { ExportDatasetStreamPlan } from '../interfaces/export-data.interface';

describe('ExceljsExportService', () => {
  const service = new ExceljsExportService();

  it('exports a valid xlsx workbook with dataset metadata', async () => {
    const plan: ExportDatasetStreamPlan = {
      columns: ['ID', 'Name'],
      total: 2,
      seed: 42,
      batchSize: 1,
      effectiveLimit: 2,
      totalMatching: 2,
      startOffset: 0,
    };

    const rows = (async function* () {
      yield [{ ID: 1, Name: 'Alice' }];
      yield [{ ID: 2, Name: 'Bob' }];
    })();

    const { result, buffer } = await service.exportPlanToBuffer(
      plan,
      rows,
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
});
