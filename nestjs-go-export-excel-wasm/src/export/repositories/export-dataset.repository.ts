import { Injectable } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_EXPORT_LIMIT,
  DEFAULT_EXPORT_SEED,
  ExportFilterDto,
  ExportRequestDto,
} from '../dto/export-request.dto';
import {
  ExportDataRow,
  ExportDataset,
} from '../interfaces/export-data.interface';

@Injectable()
export class ExportDatasetRepository {
  private readonly defaultColumns = [
    'ID',
    'Имя',
    'Фамилия',
    'Отчество',
    'Email рабочий',
    'Телефон мобильный',
    'Должность',
    'Отдел',
    'Город проживания',
    'Дата рождения',
    'Возраст',
    'Дата приема на работу',
    'Стаж (лет)',
    'Тип занятости',
    'Удаленная работа',
    'Зарплата (базовая)',
    'Зарплата (бонусная)',
    'Зарплата (итоговая)',
    'Рейтинг производительности',
    'Активен',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  async getDataset(options: ExportRequestDto): Promise<ExportDataset> {
    const columns = this.sanitizeColumns(options.columns);
    const limit = options.limit ?? DEFAULT_EXPORT_LIMIT;
    const where = this.buildWhere(options.filters);
    const seed = options.seed ?? DEFAULT_EXPORT_SEED;

    const { totalMatching, rows } = await this.prisma.$transaction(
      async (tx) => {
        const totalMatching = await tx.employee.count({ where });

        if (totalMatching === 0) {
          return { totalMatching, rows: [] as Employee[] };
        }

        const explicitOffset = options.offset ?? 0;
        const startOffset =
          (explicitOffset + (seed % totalMatching)) % totalMatching;
        const rows = await this.getWindowedRows(
          tx,
          limit,
          startOffset,
          totalMatching,
          where,
        );

        return { totalMatching, rows };
      },
    );

    if (totalMatching === 0) {
      return {
        columns,
        rows: [],
        total: 0,
        seed,
      };
    }

    return {
      columns,
      rows: rows.map((row) => this.pickColumns(this.mapEmployee(row), columns)),
      total: rows.length,
      seed,
    };
  }

  getColumnNames(): string[] {
    return [...this.defaultColumns];
  }

  private async getWindowedRows(
    tx: Prisma.TransactionClient,
    limit: number,
    offset: number,
    totalMatching: number,
    where: Prisma.EmployeeWhereInput,
  ): Promise<Employee[]> {
    const firstTake = Math.min(limit, Math.max(totalMatching - offset, 0));

    const firstChunk = await tx.employee.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: offset,
      take: firstTake,
    });

    if (firstChunk.length >= limit || firstChunk.length === totalMatching) {
      return firstChunk;
    }

    const seenIds = new Set(firstChunk.map((row) => row.id));
    const remainder = Math.min(
      limit - firstChunk.length,
      totalMatching - seenIds.size,
    );

    const secondChunk = await tx.employee.findMany({
      where,
      orderBy: { id: 'asc' },
      take: remainder,
    });

    const dedupedSecondChunk = secondChunk.filter(
      (row) => !seenIds.has(row.id),
    );
    return [...firstChunk, ...dedupedSecondChunk];
  }

  private buildWhere(filters?: ExportFilterDto): Prisma.EmployeeWhereInput {
    if (!filters) {
      return {};
    }

    return {
      department: filters.department,
      position: filters.position,
      hireDate: this.buildDateRange(filters.startDate, filters.endDate),
      totalSalary: this.buildNumberRange(filters.minSalary, filters.maxSalary),
    };
  }

  private buildDateRange(
    startDate?: Date,
    endDate?: Date,
  ): Prisma.DateTimeFilter | undefined {
    if (!startDate && !endDate) {
      return undefined;
    }

    return {
      gte: startDate,
      lte: endDate,
    };
  }

  private buildNumberRange(
    min?: number,
    max?: number,
  ): Prisma.IntFilter | undefined {
    if (typeof min !== 'number' && typeof max !== 'number') {
      return undefined;
    }

    return {
      gte: min,
      lte: max,
    };
  }

  private mapEmployee(employee: Employee): ExportDataRow {
    return {
      ID: employee.id,
      Имя: employee.firstName,
      Фамилия: employee.lastName,
      Отчество: employee.patronymic,
      'Email рабочий': employee.workEmail,
      'Телефон мобильный': employee.mobilePhone,
      Должность: employee.position,
      Отдел: employee.department,
      'Город проживания': employee.city,
      'Дата рождения': employee.birthDate,
      Возраст: employee.age,
      'Дата приема на работу': employee.hireDate,
      'Стаж (лет)': employee.tenureYears,
      'Тип занятости': employee.employmentType,
      'Удаленная работа': employee.isRemote,
      'Зарплата (базовая)': employee.baseSalary,
      'Зарплата (бонусная)': employee.bonusSalary,
      'Зарплата (итоговая)': employee.totalSalary,
      'Рейтинг производительности': employee.performanceRating,
      Активен: employee.isActive,
    };
  }

  private sanitizeColumns(columns?: string[]): string[] {
    if (!columns?.length) {
      return [...this.defaultColumns];
    }

    const allowed = new Set<string>(this.defaultColumns);
    const sanitized = columns.filter((column) => allowed.has(column));

    return sanitized.length > 0 ? sanitized : [...this.defaultColumns];
  }

  private pickColumns(row: ExportDataRow, columns: string[]): ExportDataRow {
    return columns.reduce<ExportDataRow>((acc, column) => {
      acc[column] = row[column] ?? null;
      return acc;
    }, {});
  }
}
