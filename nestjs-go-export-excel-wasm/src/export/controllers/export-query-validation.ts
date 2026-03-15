import { BadRequestException } from '@nestjs/common';

const QUICK_EXPORT_LIMIT_MAX = 100000;

function parseFiniteInteger(value: string, field: string): number {
  if (!/^[-+]?\d+$/.test(value)) {
    throw new BadRequestException(`${field} must be a finite integer string`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`${field} must be finite`);
  }

  return parsed;
}

export function parseQuickExportQuery(limitRaw: string, seedRaw: string) {
  const limit = parseFiniteInteger(limitRaw, 'limit');
  const seed = parseFiniteInteger(seedRaw, 'seed');

  if (limit < 1) {
    throw new BadRequestException('limit must be at least 1');
  }

  if (limit > QUICK_EXPORT_LIMIT_MAX) {
    throw new BadRequestException(
      `limit must not exceed ${QUICK_EXPORT_LIMIT_MAX}`,
    );
  }

  if (seed < 0) {
    throw new BadRequestException('seed must be greater than or equal to 0');
  }

  return { limit, seed };
}
