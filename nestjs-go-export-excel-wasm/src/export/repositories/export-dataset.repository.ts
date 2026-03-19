import { BadRequestException, Injectable } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_EXPORT_BATCH_SIZE,
  DEFAULT_EXPORT_LIMIT,
  DEFAULT_EXPORT_SEED,
  ExportFilterDto,
  ExportRequestDto,
} from '../dto/export-request.dto';
import {
  ExportDataRow,
  ExportDataset,
  ExportDatasetStreamPlan,
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
    const plan = await this.createStreamPlan(options);
    const rows: ExportDataRow[] = [];

    for await (const batch of this.streamRows(plan)) {
      rows.push(...batch);
    }

    return {
      columns: plan.columns,
      rows,
      total: rows.length,
      seed: plan.seed,
    };
  }

  async createStreamPlan(
    options: ExportRequestDto,
  ): Promise<ExportDatasetStreamPlan> {
    const columns = this.sanitizeColumns(options.columns);
    const effectiveLimit = options.limit ?? DEFAULT_EXPORT_LIMIT;
    const batchSize = options.batchSize ?? DEFAULT_EXPORT_BATCH_SIZE;
    const where = this.buildWhere(options.filters);
    const seed = options.seed ?? DEFAULT_EXPORT_SEED;
    const totalMatching = await this.prisma.employee.count({ where });

    if (totalMatching === 0) {
      return {
        columns,
        total: 0,
        seed,
        batchSize,
        effectiveLimit,
        totalMatching,
        startOffset: 0,
        where,
      };
    }

    const explicitOffset = options.offset ?? 0;
    const startOffset =
      (explicitOffset + (seed % totalMatching)) % totalMatching;

    return {
      columns,
      total: Math.min(effectiveLimit, totalMatching),
      seed,
      batchSize,
      effectiveLimit,
      totalMatching,
      startOffset,
      where,
    };
  }

  async *streamRows(
    plan: ExportDatasetStreamPlan,
  ): AsyncGenerator<ExportDataRow[]> {
    if (plan.total === 0) {
      return;
    }

    let remaining = plan.total;
    let lastTailId: number | undefined;
    let wrapBoundaryId: number | undefined;
    let tailComplete = false;
    let lastWrappedId: number | undefined;

    while (remaining > 0) {
      const take = Math.min(plan.batchSize, remaining);
      const fetchingWrappedRows = tailComplete;
      const where = fetchingWrappedRows
        ? this.buildWrappedWhere(plan.where, wrapBoundaryId, lastWrappedId)
        : this.buildTailWhere(plan.where, lastTailId);
      const skip = fetchingWrappedRows || lastTailId ? 0 : plan.startOffset;
      const rows = await this.prisma.employee.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take,
      });

      if (rows.length === 0) {
        if (fetchingWrappedRows) {
          break;
        }

        tailComplete = true;
        continue;
      }

      if (!fetchingWrappedRows && wrapBoundaryId === undefined) {
        wrapBoundaryId = rows[0]?.id;
      }

      remaining -= rows.length;

      if (fetchingWrappedRows) {
        lastWrappedId = rows.at(-1)?.id;
      } else {
        lastTailId = rows.at(-1)?.id;
        if (rows.length < take) {
          tailComplete = true;
        }
      }

      yield rows.map((row) =>
        this.pickColumns(this.mapEmployee(row), plan.columns),
      );
    }
  }

  getColumnNames(): string[] {
    return [...this.defaultColumns];
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

  private buildTailWhere(
    baseWhere: Prisma.EmployeeWhereInput | undefined,
    lastTailId?: number,
  ): Prisma.EmployeeWhereInput {
    if (lastTailId === undefined) {
      return baseWhere ?? {};
    }

    return {
      AND: [baseWhere ?? {}, { id: { gt: lastTailId } }],
    };
  }

  private buildWrappedWhere(
    baseWhere: Prisma.EmployeeWhereInput | undefined,
    wrapBoundaryId?: number,
    lastWrappedId?: number,
  ): Prisma.EmployeeWhereInput {
    const and: Prisma.EmployeeWhereInput[] = [baseWhere ?? {}];

    if (wrapBoundaryId !== undefined) {
      and.push({ id: { lt: wrapBoundaryId } });
    }

    if (lastWrappedId !== undefined) {
      and.push({ id: { gt: lastWrappedId } });
    }

    return and.length === 1 ? and[0] : { AND: and };
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

    if (sanitized.length === 0) {
      throw new BadRequestException(
        'At least one valid column must be requested when columns are provided',
      );
    }

    return sanitized;
  }

  private pickColumns(row: ExportDataRow, columns: string[]): ExportDataRow {
    return columns.reduce<ExportDataRow>((acc, column) => {
      acc[column] = row[column] ?? null;
      return acc;
    }, {});
  }
}
