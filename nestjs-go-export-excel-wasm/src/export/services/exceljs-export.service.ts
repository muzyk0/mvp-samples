import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  ExportDataset,
  ExportExecutionResult,
} from '../interfaces/export-data.interface';

@Injectable()
export class ExceljsExportService {
  async exportDataset(
    dataset: ExportDataset,
    fileName: string,
    sheetName: string = 'Data',
  ): Promise<ExportExecutionResult> {
    const startTime = process.hrtime.bigint();
    const memoryBefore = process.memoryUsage().heapUsed;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OpenClaw';
    workbook.created = new Date('2026-03-15T00:00:00.000Z');
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = dataset.columns.map((column) => ({
      header: column,
      key: column,
      width: 22,
    }));
    worksheet.addRows(dataset.rows);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const memoryAfter = process.memoryUsage().heapUsed;
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    return {
      variant: 'exceljs',
      buffer,
      fileName,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      durationMs: Number(durationMs.toFixed(2)),
      sizeBytes: buffer.length,
      rowCount: dataset.total,
      columnCount: dataset.columns.length,
      memoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
    };
  }
}
