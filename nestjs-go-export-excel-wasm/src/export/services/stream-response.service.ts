import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

@Injectable()
export class StreamResponseService {
  sendBuffer(
    response: Response,
    buffer: Buffer,
    fileName: string,
    contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ): void {
    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.sanitizeFileName(fileName)}"`,
    );
    response.setHeader('Content-Length', buffer.length);
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Length',
    );
    response.end(buffer);
  }

  private sanitizeFileName(fileName: string): string {
    const withoutUnsafeChars = Array.from(fileName.normalize('NFKC'))
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 0x20 && code !== 0x7f;
      })
      .join('');

    const normalized = withoutUnsafeChars
      .replace(/[\r\n"]/g, '')
      .replace(/[\\/]+/g, '-')
      .replace(/;+|,+/g, '-')
      .trim();

    return normalized || 'export.xlsx';
  }
}
