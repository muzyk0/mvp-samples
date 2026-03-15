import { Injectable } from '@nestjs/common';
import { ExportFilterDto, ExportRequestDto } from '../dto/export-request.dto';
import {
  ExportDataRow,
  ExportDataset,
} from '../interfaces/export-data.interface';

interface ExportDataSource {
  getRows(options: ExportRequestDto): Promise<ExportDataset>;
}

class InMemoryExportDataSource implements ExportDataSource {
  constructor(
    private readonly buildDataset: (options: ExportRequestDto) => ExportDataset,
  ) {}

  getRows(options: ExportRequestDto): Promise<ExportDataset> {
    return Promise.resolve(this.buildDataset(options));
  }
}

@Injectable()
export class DataGeneratorService {
  private readonly dataSource: ExportDataSource;

  constructor() {
    this.dataSource = new InMemoryExportDataSource((options) =>
      this.buildDataset(options),
    );
  }

  async getDataset(options: ExportRequestDto): Promise<ExportDataset> {
    return this.dataSource.getRows(options);
  }

  async *generateExportDataStream(
    optionsOrFilters?: ExportRequestDto | ExportFilterDto,
    limit?: number,
    batchSize?: number,
  ): AsyncGenerator<ExportDataRow[]> {
    const options = this.normalizeOptions(optionsOrFilters, limit, batchSize);
    const dataset = await this.getDataset(options);
    const chunkSize = options.batchSize ?? 500;

    for (let index = 0; index < dataset.rows.length; index += chunkSize) {
      yield dataset.rows.slice(index, index + chunkSize);
    }
  }

  async generateExportData(
    filters?: ExportFilterDto,
    limit: number = 10000,
  ): Promise<ExportDataset> {
    return this.getDataset({ filters, limit });
  }

  getColumnNames(): string[] {
    return [
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
    ];
  }

  private normalizeOptions(
    optionsOrFilters?: ExportRequestDto | ExportFilterDto,
    limit: number = 10000,
    batchSize: number = 500,
  ): ExportRequestDto {
    if (
      optionsOrFilters &&
      ('limit' in optionsOrFilters ||
        'columns' in optionsOrFilters ||
        'fileName' in optionsOrFilters ||
        'batchSize' in optionsOrFilters)
    ) {
      return {
        batchSize,
        ...optionsOrFilters,
      } as ExportRequestDto;
    }

    return {
      filters: optionsOrFilters,
      limit,
      batchSize,
    };
  }

  private buildDataset(options: ExportRequestDto): ExportDataset {
    const limit = options.limit ?? 10000;
    const offset = options.offset ?? 0;
    const seed = options.seed ?? 12345;
    const columns = options.columns?.length
      ? options.columns
      : this.getColumnNames();
    const rng = this.createMulberry32(seed);
    const rows: ExportDataRow[] = [];

    for (let index = 0; index < limit; index += 1) {
      const rowId = offset + index + 1;
      const row = this.generateRowObject(rowId, rng, options.filters);
      rows.push(this.pickColumns(row, columns));
    }

    return {
      columns,
      rows,
      total: rows.length,
      seed,
    };
  }

  private pickColumns(row: ExportDataRow, columns: string[]): ExportDataRow {
    return columns.reduce<ExportDataRow>((acc, column) => {
      acc[column] = row[column] ?? null;
      return acc;
    }, {});
  }

  generateRowObject(
    id: number,
    rng: () => number = this.createMulberry32(12345 + id),
    filters?: ExportFilterDto,
  ): ExportDataRow {
    const names = [
      'Алексей',
      'Дмитрий',
      'Екатерина',
      'Михаил',
      'Наталья',
      'Павел',
      'Светлана',
      'Татьяна',
      'Анна',
      'Иван',
    ];
    const surnames = [
      'Иванов',
      'Петров',
      'Сидоров',
      'Кузнецов',
      'Попов',
      'Васильев',
      'Соколов',
      'Михайлов',
      'Смирнов',
      'Федоров',
    ];
    const patronymics = [
      'Александрович',
      'Дмитриевич',
      'Сергеевич',
      'Андреевич',
    ];
    const positions = [
      'Junior Developer',
      'Middle Developer',
      'Senior Developer',
      'Team Lead',
      'Project Manager',
    ];
    const departments = [
      'Разработка',
      'Тестирование',
      'Аналитика',
      'Дизайн',
      'Маркетинг',
    ];
    const cities = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'];
    const employmentTypes = ['Полная занятость', 'Частичная занятость'];

    const firstName = this.pickOne(names, rng);
    const lastName = this.pickOne(surnames, rng);
    const position = filters?.position ?? this.pickOne(positions, rng);
    const department = filters?.department ?? this.pickOne(departments, rng);
    const baseSalary = this.pickSalary(rng, filters);
    const bonus = this.randomInt(rng, 5000, 50000);
    const birthDate = this.randomDate(
      rng,
      new Date('1975-01-01'),
      new Date('2000-12-31'),
    );
    const hireDate = this.randomDate(
      rng,
      new Date('2015-01-01'),
      new Date('2024-12-31'),
    );

    return {
      ID: id,
      Имя: firstName,
      Фамилия: lastName,
      Отчество: this.pickOne(patronymics, rng),
      'Email рабочий': `${this.translit(firstName)}.${this.translit(lastName)}.${id}@company.local`,
      'Телефон мобильный': `+7 9${this.randomInt(rng, 10, 99)} ${this.randomInt(rng, 100, 999)}-${this.randomInt(rng, 10, 99)}-${this.randomInt(rng, 10, 99)}`,
      Должность: position,
      Отдел: department,
      'Город проживания': this.pickOne(cities, rng),
      'Дата рождения': birthDate,
      Возраст: this.diffYears(birthDate, new Date('2026-01-01')),
      'Дата приема на работу': hireDate,
      'Стаж (лет)': this.diffYears(hireDate, new Date('2026-01-01')),
      'Тип занятости': this.pickOne(employmentTypes, rng),
      'Удаленная работа': rng() > 0.4,
      'Зарплата (базовая)': baseSalary,
      'Зарплата (бонусная)': bonus,
      'Зарплата (итоговая)': baseSalary + bonus,
      'Рейтинг производительности': Number((2.5 + rng() * 2.5).toFixed(1)),
      Активен: rng() > 0.15,
    };
  }

  private translit(value: string): string {
    return value
      .toLowerCase()
      .replace(/й/g, 'y')
      .replace(/ц/g, 'ts')
      .replace(/у/g, 'u')
      .replace(/к/g, 'k')
      .replace(/е/g, 'e')
      .replace(/н/g, 'n')
      .replace(/г/g, 'g')
      .replace(/ш/g, 'sh')
      .replace(/щ/g, 'sch')
      .replace(/з/g, 'z')
      .replace(/х/g, 'h')
      .replace(/ъ/g, '')
      .replace(/ф/g, 'f')
      .replace(/ы/g, 'y')
      .replace(/в/g, 'v')
      .replace(/а/g, 'a')
      .replace(/п/g, 'p')
      .replace(/р/g, 'r')
      .replace(/о/g, 'o')
      .replace(/л/g, 'l')
      .replace(/д/g, 'd')
      .replace(/ж/g, 'zh')
      .replace(/э/g, 'e')
      .replace(/я/g, 'ya')
      .replace(/ч/g, 'ch')
      .replace(/с/g, 's')
      .replace(/м/g, 'm')
      .replace(/и/g, 'i')
      .replace(/т/g, 't')
      .replace(/ь/g, '')
      .replace(/б/g, 'b')
      .replace(/ю/g, 'yu');
  }

  private pickSalary(rng: () => number, filters?: ExportFilterDto): number {
    const min = filters?.minSalary ?? 60000;
    const max = filters?.maxSalary ?? 240000;
    return this.randomInt(rng, min, max);
  }

  private pickOne<T>(items: T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)];
  }

  private randomInt(rng: () => number, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  private randomDate(rng: () => number, start: Date, end: Date): string {
    const value = new Date(
      start.getTime() + Math.floor(rng() * (end.getTime() - start.getTime())),
    );
    return value.toISOString().slice(0, 10);
  }

  private diffYears(isoDate: string, endDate: Date): number {
    const startDate = new Date(isoDate);
    let years = endDate.getUTCFullYear() - startDate.getUTCFullYear();
    const monthDelta = endDate.getUTCMonth() - startDate.getUTCMonth();

    if (
      monthDelta < 0 ||
      (monthDelta === 0 && endDate.getUTCDate() < startDate.getUTCDate())
    ) {
      years -= 1;
    }

    return years;
  }

  private createMulberry32(seed: number): () => number {
    let current = seed >>> 0;

    return () => {
      current += 0x6d2b79f5;
      let temp = current;
      temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
      temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
      return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
    };
  }
}
