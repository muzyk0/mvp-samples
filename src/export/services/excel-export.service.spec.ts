import { HttpException, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExcelExportService } from './excel-export.service';

describe('ExcelExportService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createService = (
    exportWithWasm: (options: unknown) => Promise<{
      buffer: Buffer;
      fileName: string;
      contentType: string;
    }>,
    getDataset: (options: unknown) => Promise<{
      rows: Array<Record<string, unknown>>;
      total: number;
      columns: string[];
    }> = () => Promise.resolve({ rows: [], total: 0, columns: [] }),
  ) =>
    new ExcelExportService(
      {
        exportWithWasm,
      } as never,
      {
        getDataset,
      } as never,
      {
        sendBuffer: vi.fn(),
      } as never,
    );

  it('sends a successful export buffer to the response', async () => {
    const sendBuffer = vi.fn();
    const response = {} as never;
    const service = new ExcelExportService(
      {
        exportWithWasm: () =>
          Promise.resolve({
            buffer: Buffer.from('PK'),
            fileName: 'wasm.xlsx',
            contentType: 'application/test',
          }),
      } as never,
      {} as never,
      {
        sendBuffer,
      } as never,
    );

    await service.exportToResponse(response, { limit: 1 } as never);

    expect(sendBuffer).toHaveBeenCalledWith(
      response,
      Buffer.from('PK'),
      'wasm.xlsx',
      'application/test',
    );
  });

  it('rethrows any HttpException from the exporter', async () => {
    const expectedError = new HttpException('conflict', 409);
    const service = createService(() => Promise.reject(expectedError));

    await expect(
      service.exportToResponse({} as never, { limit: 1 } as never),
    ).rejects.toBe(expectedError);
  });

  it('wraps unexpected exporter errors as internal server errors', async () => {
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = createService(() => Promise.reject(new Error('boom')));

    await expect(
      service.exportToResponse({} as never, { limit: 1 } as never),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).message).toBe(
        'Ошибка при экспорте: boom',
      );
      return true;
    });

    expect(loggerError).toHaveBeenCalledWith(
      'WASM export failed: boom',
      expect.any(String),
    );
  });

  it('returns the exported buffer metadata', async () => {
    const service = createService(() =>
      Promise.resolve({
        buffer: Buffer.from('PK'),
        fileName: 'wasm-buffer.xlsx',
        contentType: 'application/test',
      }),
    );

    await expect(
      service.exportToBuffer({ limit: 1 } as never),
    ).resolves.toEqual({
      buffer: Buffer.from('PK'),
      fileName: 'wasm-buffer.xlsx',
    });
  });

  it('returns dataset preview data', async () => {
    const service = createService(
      () =>
        Promise.resolve({
          buffer: Buffer.from('PK'),
          fileName: 'unused.xlsx',
          contentType: 'application/test',
        }),
      () =>
        Promise.resolve({
          rows: [{ ID: 1 }],
          total: 1,
          columns: ['ID'],
        }),
    );

    await expect(service.getExportData({ limit: 1 } as never)).resolves.toEqual(
      {
        rows: [{ ID: 1 }],
        total: 1,
        columns: ['ID'],
      },
    );
  });

  it('validates export options', async () => {
    const service = createService(() =>
      Promise.resolve({
        buffer: Buffer.from('PK'),
        fileName: 'unused.xlsx',
        contentType: 'application/test',
      }),
    );

    await expect(
      service.validateExportOptions({
        limit: 0,
        filters: {
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-01-01'),
          minSalary: 20,
          maxSalary: 10,
        },
      } as never),
    ).resolves.toEqual({
      valid: false,
      errors: [
        'Лимит должен быть больше 0',
        'Дата начала не может быть позже даты окончания',
        'Минимальная зарплата не может быть больше максимальной',
      ],
    });

    await expect(
      service.validateExportOptions({
        limit: 10,
        filters: {
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-02-01'),
          minSalary: 10,
          maxSalary: 20,
        },
      } as never),
    ).resolves.toEqual({
      valid: true,
      errors: [],
    });
  });
});
