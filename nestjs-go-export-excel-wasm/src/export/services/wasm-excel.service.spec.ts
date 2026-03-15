import ExcelJS from 'exceljs';
import { WasmExcelService } from './wasm-excel.service';
import { ExportDataset } from '../interfaces/export-data.interface';

describe('WasmExcelService', () => {
  const dataset: ExportDataset = {
    columns: ['ID', 'Name'],
    rows: [
      { ID: 1, Name: 'Alice' },
      { ID: 2, Name: 'Bob' },
    ],
    total: 2,
    seed: 42,
  };

  let service: WasmExcelService;

  beforeEach(() => {
    service = new WasmExcelService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('exports a valid xlsx workbook with dataset metadata', async () => {
    const result = await service.exportDataset(dataset, 'wasm-test.xlsx');

    expect(result.variant).toBe('wasm');
    expect(result.fileName).toBe('wasm-test.xlsx');
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(2);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const worksheet = workbook.worksheets[0];

    expect(worksheet).toBeDefined();
    expect(worksheet.getCell('A1').value).toBe('ID');
    expect(worksheet.getCell('B1').value).toBe('Name');
    expect(worksheet.getCell('A2').value).toBe(1);
    expect(worksheet.getCell('B2').value).toBe('Alice');
    expect(worksheet.getCell('A3').value).toBe(2);
    expect(worksheet.getCell('B3').value).toBe('Bob');
  });

  it('reports binary availability in status', () => {
    expect(service.getStatus()).toEqual({
      queued: true,
      hasBinary: true,
    });
  });
});
