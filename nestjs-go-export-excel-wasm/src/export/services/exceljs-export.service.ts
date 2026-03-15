import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import {
  ExportDatasetStreamPlan,
  ExportExecutionResult,
  StreamExportExecutionOptions,
} from '../interfaces/export-data.interface';

@Injectable()
export class ExceljsExportService {
  async exportPlanToWritable(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    options: StreamExportExecutionOptions,
  ): Promise<ExportExecutionResult> {
    const startTime = process.hrtime.bigint();
    const memoryBefore = process.memoryUsage().heapUsed;

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: options.writable,
      useStyles: false,
      useSharedStrings: false,
    });
    workbook.creator = 'OpenClaw';
    workbook.created = new Date('2026-03-15T00:00:00.000Z');

    const worksheet = workbook.addWorksheet(options.sheetName ?? 'Data');
    worksheet.columns = plan.columns.map((column) => ({
      header: column,
      key: column,
      width: 22,
    }));

    let rowCount = 0;
    for await (const batch of rows) {
      for (const row of batch) {
        worksheet.addRow(row).commit();
        rowCount += 1;
      }
    }

    worksheet.commit();
    await workbook.commit();

    const memoryAfter = process.memoryUsage().heapUsed;
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const sizeBytes = Number((options.writable as NodeJS.WritableStream & { bytesWritten?: number }).bytesWritten ?? 0);

    return {
      variant: 'exceljs',
      fileName: options.fileName,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      durationMs: Number(durationMs.toFixed(2)),
      sizeBytes,
      rowCount,
      columnCount: plan.columns.length,
      memoryDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
    };
  }

  async exportPlanToBuffer(
    plan: ExportDatasetStreamPlan,
    rows: AsyncGenerator<Record<string, any>[]>,
    fileName: string,
    sheetName?: string,
  ): Promise<{ result: ExportExecutionResult; buffer: Buffer }> {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const result = await this.exportPlanToWritable(plan, rows, {
      writable: stream,
      fileName,
      sheetName,
    });
    const buffer = Buffer.concat(chunks);

    return {
      result: {
        ...result,
        sizeBytes: buffer.length,
      },
      buffer,
    };
  }
}
