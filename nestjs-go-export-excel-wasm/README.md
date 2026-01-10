Вот полная реализация контроллера, сервисов и модулей для NestJS с экспортом Excel через WASM:

## **1. Структура проекта**

```
nestjs-go-export-excel-wasm/
├── src/
│   ├── export/
│   │   ├── controllers/
│   │   │   └── excel-export.controller.ts
│   │   ├── services/
│   │   │   ├── excel-export.service.ts
│   │   │   ├── wasm-excel.service.ts
│   │   │   ├── data-generator.service.ts
│   │   │   └── stream-response.service.ts
│   │   ├── dto/
│   │   │   └── export-request.dto.ts
│   │   ├── interfaces/
│   │   │   ├── export-data.interface.ts
│   │   │   └── wasm-callback.interface.ts
│   │   └── excel-export.module.ts
│   ├── shared/
│   │   └── wasm/
│   │       ├── excel_bridge.wasm
│   │       └── wasm_exec.js
│   └── main.ts
├── test/
│   └── export.test.js
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## **2. Интерфейсы и DTO**

### **`src/export/interfaces/export-data.interface.ts`**
```typescript
export interface ExportDataRow {
  [key: string]: string | number | boolean | Date | null;
}

export interface ExportData {
  rows: ExportDataRow[];
  total: number;
  columns: string[];
}

export interface ExportOptions {
  fileName?: string;
  sheetName?: string;
  chunkSize?: number;
  includeHeaders?: boolean;
}

export interface WasmProgress {
  current: number;
  total: number;
  percentage: number;
}
```

### **`src/export/interfaces/wasm-callback.interface.ts`**
```typescript
export interface WasmChunkCallback {
  (chunk: Uint8Array, status: string): void;
}

export interface WasmExportResult {
  success: boolean;
  error?: string;
  size?: number;
  duration?: number;
}
```

### **`src/export/dto/export-request.dto.ts`**
```typescript
import { IsOptional, IsString, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExportFilterDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  minSalary?: number;

  @IsOptional()
  @IsNumber()
  maxSalary?: number;
}

export class ExportRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFilterDto)
  filters?: ExportFilterDto;

  @IsOptional()
  @IsNumber()
  limit?: number = 10000;

  @IsOptional()
  @IsNumber()
  offset?: number = 0;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsString()
  fileName?: string = 'export.xlsx';

  @IsOptional()
  @IsString()
  sheetName?: string = 'Data';

  @IsOptional()
  @IsBoolean()
  includeHeaders?: boolean = true;
}
```

## **3. Сервисы**

### **`src/export/services/data-generator.service.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ExportData, ExportDataRow } from '../interfaces/export-data.interface';
import { ExportFilterDto } from '../dto/export-request.dto';

@Injectable()
export class DataGeneratorService {
  private readonly logger = new Logger(DataGeneratorService.name);

  // В реальном приложении здесь будет запрос к другому сервису или БД
  async generateExportData(filters?: ExportFilterDto, limit: number = 10000): Promise<ExportData> {
    this.logger.log(`Генерация данных для экспорта: ${limit} записей`);
    
    const rows: ExportDataRow[] = [];
    const columns = this.getColumnNames();
    
    // Генерация тестовых данных
    for (let i = 1; i <= limit; i++) {
      const row = this.generateRow(i, filters);
      rows.push(row);
      
      // Логирование прогресса каждые 1000 записей
      if (i % 1000 === 0) {
        this.logger.debug(`Сгенерировано ${i} из ${limit} записей`);
      }
    }
    
    return {
      rows,
      total: rows.length,
      columns
    };
  }

  // Генератор для потоковой передачи данных
  async *generateExportDataStream(filters?: ExportFilterDto, limit: number = 10000, batchSize: number = 500): AsyncGenerator<ExportDataRow[]> {
    this.logger.log(`Запуск потоковой генерации данных: ${limit} записей, batch: ${batchSize}`);
    
    const columns = this.getColumnNames();
    let generated = 0;
    
    while (generated < limit) {
      const currentBatch = Math.min(batchSize, limit - generated);
      const batch: ExportDataRow[] = [];
      
      for (let i = 0; i < currentBatch; i++) {
        const row = this.generateRow(generated + i + 1, filters);
        batch.push(row);
      }
      
      generated += currentBatch;
      
      // Логирование прогресса
      if (generated % 5000 === 0 || generated === limit) {
        this.logger.debug(`Сгенерировано ${generated} из ${limit} записей`);
      }
      
      yield batch;
    }
    
    this.logger.log(`Завершена генерация ${generated} записей`);
  }

  private getColumnNames(): string[] {
    return [
      'ID',
      'Имя',
      'Фамилия',
      'Отчество',
      'Дата рождения',
      'Возраст',
      'Пол',
      'Email личный',
      'Email рабочий',
      'Телефон мобильный',
      'Телефон рабочий',
      'Телефон домашний',
      'Город проживания',
      'Страна',
      'Адрес',
      'Индекс',
      'Должность',
      'Отдел',
      'Проект',
      'Руководитель',
      'Дата приема на работу',
      'Стаж (лет)',
      'Тип занятости',
      'График работы',
      'Удаленная работа',
      'Зарплата (базовая)',
      'Зарплата (бонусная)',
      'Зарплата (итоговая)',
      'Валюта зарплаты',
      'Банковский счет',
      'Банк',
      'ИНН',
      'СНИЛС',
      'Паспорт серия',
      'Паспорт номер',
      'Паспорт выдан',
      'Паспорт дата выдачи',
      'Семейное положение',
      'Дети (кол-во)',
      'Образование',
      'ВУЗ',
      'Год окончания',
      'Специальность',
      'Ученая степень',
      'Иностранные языки',
      'Уровень английского',
      'Водительские права',
      'Категории прав',
      'Навыки (hard skills)',
      'Навыки (soft skills)',
      'Опыт работы (лет)',
      'Предыдущая компания',
      'Должность на предыдущем месте',
      'Период работы',
      'Рекомендации',
      'Хобби',
      'Спорт',
      'Группа крови',
      'Аллергии',
      'Хронические заболевания',
      'Примечания',
      'Статус сотрудника',
      'Дата увольнения',
      'Причина увольнения',
      'Рейтинг производительности',
      'Последняя оценка',
      'Дата следующей оценки',
      'Курсы повышения квалификации',
      'Сертификаты',
      'Уровень доступа',
      'Корпоративный ноутбук',
      'Корпоративный телефон',
      'Дополнительное оборудование',
      'Логин в системе',
      'Пароль (хэш)',
      'Роль в системе',
      'Дата создания аккаунта',
      'Последний вход',
      'Активен'
    ];
  }

  private generateRow(id: number, filters?: ExportFilterDto): ExportDataRow {
    // Массивы для генерации данных
    const names = ['Алексей', 'Дмитрий', 'Екатерина', 'Михаил', 'Наталья', 'Павел', 'Светлана', 'Татьяна', 'Анна', 'Иван'];
    const surnames = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Михайлов', 'Смирнов', 'Федоров'];
    const patronymics = ['Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич', 'Владимирович', 'Игоревич'];
    const cities = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань'];
    const positions = ['Junior Developer', 'Middle Developer', 'Senior Developer', 'Team Lead', 'Project Manager'];
    const departments = ['Разработка', 'Тестирование', 'Аналитика', 'Дизайн', 'Маркетинг'];
    
    // Применяем фильтры если есть
    let department = departments[Math.floor(Math.random() * departments.length)];
    let position = positions[Math.floor(Math.random() * positions.length)];
    
    if (filters?.department) {
      department = filters.department;
    }
    
    if (filters?.position) {
      position = filters.position;
    }
    
    const name = names[Math.floor(Math.random() * names.length)];
    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const birthYear = 1960 + Math.floor(Math.random() * 40);
    const age = new Date().getFullYear() - birthYear;
    const salary = filters?.minSalary 
      ? filters.minSalary + Math.floor(Math.random() * (filters.maxSalary || 200000 - filters.minSalary))
      : 50000 + Math.floor(Math.random() * 150000);
    
    const hireYear = filters?.startDate 
      ? filters.startDate.getFullYear() + Math.floor(Math.random() * 5)
      : 2015 + Math.floor(Math.random() * 10);
    
    return {
      'ID': id,
      'Имя': name,
      'Фамилия': surname,
      'Отчество': patronymics[Math.floor(Math.random() * patronymics.length)],
      'Дата рождения': `${birthYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Возраст': age,
      'Пол': Math.random() > 0.5 ? 'Мужской' : 'Женский',
      'Email личный': `${name.toLowerCase()}.${surname.toLowerCase()}@gmail.com`,
      'Email рабочий': `${name.toLowerCase()}.${surname.toLowerCase()}@company.com`,
      'Телефон мобильный': `+7 999 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
      'Телефон рабочий': `+7 495 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
      'Телефон домашний': `+7 812 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
      'Город проживания': cities[Math.floor(Math.random() * cities.length)],
      'Страна': 'Россия',
      'Адрес': `ул. ${['Ленина', 'Пушкина', 'Гагарина'][Math.floor(Math.random() * 3)]}, д. ${Math.floor(Math.random() * 100) + 1}`,
      'Индекс': Math.floor(100000 + Math.random() * 900000),
      'Должность': position,
      'Отдел': department,
      'Проект': `Проект ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`,
      'Руководитель': `${names[Math.floor(Math.random() * names.length)]} ${surnames[Math.floor(Math.random() * surnames.length)]}`,
      'Дата приема на работу': `${hireYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Стаж (лет)': new Date().getFullYear() - hireYear,
      'Тип занятости': ['Полная занятость', 'Частичная занятость'][Math.floor(Math.random() * 2)],
      'График работы': ['5/2', '2/2', 'Гибкий график'][Math.floor(Math.random() * 3)],
      'Удаленная работа': Math.random() > 0.5 ? 'Да' : 'Нет',
      'Зарплата (базовая)': salary,
      'Зарплата (бонусная)': Math.floor(Math.random() * 50000),
      'Зарплата (итоговая)': salary + Math.floor(Math.random() * 50000),
      'Валюта зарплаты': 'RUB',
      'Банковский счет': `40817${String(Math.floor(Math.random() * 1000000000)).padStart(10, '0')}`,
      'Банк': ['Сбербанк', 'ВТБ', 'Альфа-Банк'][Math.floor(Math.random() * 3)],
      'ИНН': `${Math.floor(Math.random() * 100000000000)}`.padStart(12, '0'),
      'СНИЛС': `${Math.floor(Math.random() * 100000000000)}`.padStart(11, '0'),
      'Паспорт серия': Math.floor(1000 + Math.random() * 9000),
      'Паспорт номер': Math.floor(100000 + Math.random() * 900000),
      'Паспорт выдан': 'ОУФМС России',
      'Паспорт дата выдачи': `${2010 + Math.floor(Math.random() * 15)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Семейное положение': ['Холост/Не замужем', 'Женат/Замужем'][Math.floor(Math.random() * 2)],
      'Дети (кол-во)': Math.floor(Math.random() * 5),
      'Образование': ['Высшее', 'Среднее специальное'][Math.floor(Math.random() * 2)],
      'ВУЗ': ['МГУ', 'МФТИ', 'ВШЭ'][Math.floor(Math.random() * 3)],
      'Год окончания': 2000 + Math.floor(Math.random() * 25),
      'Специальность': 'Информационные технологии',
      'Ученая степень': Math.random() > 0.8 ? 'Кандидат наук' : 'Нет',
      'Иностранные языки': 'Английский (B2)',
      'Уровень английского': ['A1', 'A2', 'B1', 'B2', 'C1'][Math.floor(Math.random() * 5)],
      'Водительские права': Math.random() > 0.7 ? 'Да' : 'Нет',
      'Категории прав': 'B',
      'Навыки (hard skills)': 'JavaScript, TypeScript, Node.js, React',
      'Навыки (soft skills)': 'Коммуникабельность, Работа в команде',
      'Опыт работы (лет)': Math.floor(Math.random() * 20),
      'Предыдущая компания': `Компания ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`,
      'Должность на предыдущем месте': positions[Math.floor(Math.random() * positions.length)],
      'Период работы': `${hireYear - Math.floor(Math.random() * 5)}-${hireYear}`,
      'Рекомендации': Math.random() > 0.5 ? 'Есть' : 'Нет',
      'Хобби': ['Чтение', 'Спорт', 'Путешествия'][Math.floor(Math.random() * 3)],
      'Спорт': ['Футбол', 'Бег', 'Плавание'][Math.floor(Math.random() * 3)],
      'Группа крови': ['I (0)', 'II (A)', 'III (B)', 'IV (AB)'][Math.floor(Math.random() * 4)],
      'Аллергии': 'Нет',
      'Хронические заболевания': Math.random() > 0.7 ? 'Есть' : 'Нет',
      'Примечания': 'Дополнительная информация',
      'Статус сотрудника': 'Активен',
      'Дата увольнения': '',
      'Причина увольнения': '',
      'Рейтинг производительности': (Math.random() * 5).toFixed(1),
      'Последняя оценка': `${2024}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Дата следующей оценки': `${2025}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Курсы повышения квалификации': Math.floor(Math.random() * 3),
      'Сертификаты': Math.floor(Math.random() * 5),
      'Уровень доступа': ['Пользователь', 'Администратор'][Math.floor(Math.random() * 2)],
      'Корпоративный ноутбук': Math.random() > 0.5 ? 'Да' : 'Нет',
      'Корпоративный телефон': Math.random() > 0.5 ? 'Да' : 'Нет',
      'Дополнительное оборудование': Math.random() > 0.3 ? 'Монитор, клавиатура, мышь' : 'Нет',
      'Логин в системе': `${name.toLowerCase()}.${surname.toLowerCase()}`,
      'Пароль (хэш)': '********',
      'Роль в системе': ['Пользователь', 'Администратор'][Math.floor(Math.random() * 2)],
      'Дата создания аккаунта': `${hireYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Последний вход': `${2025}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      'Активен': 'Да'
    };
  }
}
```

### **`src/export/services/wasm-excel.service.ts`**
```typescript
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { WasmChunkCallback, WasmExportResult } from '../interfaces/wasm-callback.interface';
import { WasmProgress } from '../interfaces/export-data.interface';

// Динамически загружаем wasm_exec.js
declare const Go: any;

@Injectable()
export class WasmExcelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WasmExcelService.name);
  private wasmBuffer: Buffer;
  private goInstance: any;
  private isInitialized = false;
  private wasmModulePath = join(__dirname, '../../../shared/wasm/excel_bridge.wasm');
  private wasmExecPath = join(__dirname, '../../../shared/wasm/wasm_exec.js');

  constructor() {
    this.initializeWasm();
  }

  async onModuleInit() {
    await this.initializeWasm();
  }

  onModuleDestroy() {
    this.cleanup();
  }

  private initializeWasm(): void {
    try {
      // Загружаем wasm_exec.js
      const wasmExecCode = readFileSync(this.wasmExecPath, 'utf8');
      eval(wasmExecCode);

      // Загружаем WASM бинарник
      this.wasmBuffer = readFileSync(this.wasmModulePath);
      
      this.logger.log('WASM файлы загружены');
    } catch (error) {
      this.logger.error(`Ошибка загрузки WASM файлов: ${error.message}`);
      throw error;
    }
  }

  async initializeExport(headers: string[]): Promise<boolean> {
    try {
      if (!this.wasmBuffer) {
        throw new Error('WASM не инициализирован');
      }

      // Создаем экземпляр Go
      this.goInstance = new (Go as any)();
      
      // Компилируем и инстанцируем WASM модуль
      const { instance } = await WebAssembly.instantiate(this.wasmBuffer, this.goInstance.importObject);
      
      // Запускаем Go runtime
      this.goInstance.run(instance);
      
      // Ждем инициализации
      await new Promise(resolve => setTimeout(resolve, 500));

      // Проверяем экспортированные функции
      if (typeof (global as any).goInitExport === 'undefined') {
        throw new Error('Go функции не экспортированы');
      }

      this.isInitialized = true;
      this.logger.log(`WASM экспорт инициализирован с ${headers.length} колонками`);
      
      return true;
    } catch (error) {
      this.logger.error(`Ошибка инициализации WASM: ${error.message}`);
      this.isInitialized = false;
      return false;
    }
  }

  async exportToStream(
    dataGenerator: AsyncGenerator<any[]>,
    headers: string[],
    onProgress?: (progress: WasmProgress) => void
  ): Promise<Readable> {
    if (!this.isInitialized) {
      await this.initializeExport(headers);
    }

    const startTime = Date.now();
    let totalRows = 0;
    let exportedRows = 0;
    
    // Создаем Readable stream для отправки данных клиенту
    const readableStream = new Readable({
      read() {} // Реализация будет через push
    });

    // Callback для получения чанков от WASM
    const chunkCallback: WasmChunkCallback = (chunk: Uint8Array, status: string) => {
      if (status === 'COMPLETE') {
        readableStream.push(null); // Завершаем поток
        this.logger.log(`Экспорт завершен: ${exportedRows} строк, время: ${Date.now() - startTime}ms`);
      } else if (status && status.startsWith('CHUNK:')) {
        // Парсим информацию о чанке
        const parts = status.split(':');
        const currentChunk = parseInt(parts[1]);
        const totalChunks = parseInt(parts[2]);
        const fileSize = parseInt(parts[3]);
        
        // Отправляем чанк в поток
        readableStream.push(Buffer.from(chunk));
        
        // Вызываем callback прогресса если есть
        if (onProgress && totalChunks > 0) {
          const percentage = Math.round((currentChunk / totalChunks) * 100);
          onProgress({
            current: currentChunk,
            total: totalChunks,
            percentage
          });
        }
      } else if (status && status !== '') {
        // Ошибка
        readableStream.destroy(new Error(`Ошибка WASM: ${status}`));
      }
    };

    try {
      // Инициализируем экспорт в WASM
      (global as any).goInitExport(headers, chunkCallback);

      // Перебираем данные и отправляем в WASM
      for await (const batch of dataGenerator) {
        totalRows += batch.length;
        
        // Конвертируем batch в JSON строку для WASM
        const jsonData = JSON.stringify(batch);
        
        // Отправляем данные в WASM
        const result = (global as any).goWriteRows(jsonData);
        
        if (result && result.toString().includes('Ошибка')) {
          throw new Error(`Ошибка записи в WASM: ${result}`);
        }
        
        exportedRows += batch.length;
        
        // Логирование прогресса
        if (exportedRows % 5000 === 0) {
          this.logger.debug(`Экспортировано ${exportedRows} строк`);
        }
      }

      // Завершаем экспорт и получаем файл
      const finalizeResult = (global as any).goFinalizeExport(chunkCallback);
      
      if (finalizeResult && finalizeResult.toString().includes('Ошибка')) {
        throw new Error(`Ошибка завершения экспорта: ${finalizeResult}`);
      }

      return readableStream;
    } catch (error) {
      readableStream.destroy(error);
      throw error;
    }
  }

  async exportToBuffer(
    dataGenerator: AsyncGenerator<any[]>,
    headers: string[]
  ): Promise<{ buffer: Buffer; result: WasmExportResult }> {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    
    const stream = await this.exportToStream(dataGenerator, headers, (progress) => {
      this.logger.debug(`Прогресс: ${progress.current}/${progress.total} (${progress.percentage}%)`);
    });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const result: WasmExportResult = {
          success: true,
          size: totalSize,
          duration: 0 // Можно добавить расчет времени
        };
        resolve({ buffer, result });
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  private cleanup(): void {
    this.isInitialized = false;
    this.goInstance = null;
    this.logger.log('WASM ресурсы очищены');
  }

  getStatus(): { isInitialized: boolean } {
    return {
      isInitialized: this.isInitialized
    };
  }
}
```

### **`src/export/services/excel-export.service.ts`**
```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { WasmExcelService } from './wasm-excel.service';
import { DataGeneratorService } from './data-generator.service';
import { ExportRequestDto, ExportFilterDto } from '../dto/export-request.dto';
import { ExportData, WasmProgress } from '../interfaces/export-data.interface';

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  constructor(
    private readonly wasmExcelService: WasmExcelService,
    private readonly dataGeneratorService: DataGeneratorService,
  ) {}

  async exportToResponse(
    response: Response,
    options: ExportRequestDto
  ): Promise<void> {
    this.logger.log(`Начало экспорта в Excel: ${JSON.stringify(options)}`);

    const startTime = Date.now();
    
    try {
      // Устанавливаем заголовки ответа
      response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      response.setHeader('Content-Disposition', `attachment; filename="${options.fileName}"`);
      response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      
      // Получаем колонки для экспорта
      const columns = options.columns || this.dataGeneratorService.getColumnNames();
      
      // Создаем генератор данных
      const dataStream = this.dataGeneratorService.generateExportDataStream(
        options.filters,
        options.limit,
        500 // batch size
      );

      // Настраиваем callback для прогресса
      const onProgress = (progress: WasmProgress) => {
        this.logger.debug(`Прогресс экспорта: ${progress.percentage}%`);
        // Здесь можно отправлять прогресс через WebSocket или сохранять в базу
      };

      // Получаем поток с данными Excel из WASM
      const excelStream = await this.wasmExcelService.exportToStream(
        dataStream,
        columns,
        onProgress
      );

      // Отправляем поток клиенту
      excelStream.pipe(response);

      // Обработка завершения
      excelStream.on('end', () => {
        const duration = Date.now() - startTime;
        this.logger.log(`Экспорт завершен за ${duration}ms`);
        response.end();
      });

      excelStream.on('error', (error) => {
        this.logger.error(`Ошибка при экспорте: ${error.message}`);
        response.status(500).json({
          error: 'Ошибка при экспорте',
          message: error.message
        });
      });

    } catch (error) {
      this.logger.error(`Ошибка в exportToResponse: ${error.message}`);
      throw new BadRequestException(`Ошибка при экспорте: ${error.message}`);
    }
  }

  async exportToBuffer(options: ExportRequestDto): Promise<{ buffer: Buffer; fileName: string }> {
    this.logger.log(`Начало экспорта в буфер: ${JSON.stringify(options)}`);

    const startTime = Date.now();
    
    try {
      // Получаем колонки для экспорта
      const columns = options.columns || this.dataGeneratorService.getColumnNames();
      
      // Создаем генератор данных
      const dataStream = this.dataGeneratorService.generateExportDataStream(
        options.filters,
        options.limit,
        500 // batch size
      );

      // Экспортируем в буфер через WASM
      const { buffer } = await this.wasmExcelService.exportToBuffer(
        dataStream,
        columns
      );

      const duration = Date.now() - startTime;
      this.logger.log(`Экспорт в буфер завершен за ${duration}ms, размер: ${buffer.length} байт`);

      return {
        buffer,
        fileName: options.fileName
      };
    } catch (error) {
      this.logger.error(`Ошибка при экспорте в буфер: ${error.message}`);
      throw new BadRequestException(`Ошибка при экспорте: ${error.message}`);
    }
  }

  async getExportData(options: ExportRequestDto): Promise<ExportData> {
    this.logger.log(`Получение данных для экспорта: ${JSON.stringify(options)}`);

    try {
      // В реальном приложении здесь будет запрос к другому сервису
      return await this.dataGeneratorService.generateExportData(
        options.filters,
        options.limit
      );
    } catch (error) {
      this.logger.error(`Ошибка при получении данных: ${error.message}`);
      throw new BadRequestException(`Ошибка при получении данных: ${error.message}`);
    }
  }

  async validateExportOptions(options: ExportRequestDto): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Проверка лимита
    if (options.limit && options.limit > 100000) {
      errors.push('Лимит не может превышать 100000 записей');
    }

    // Проверка дат
    if (options.filters?.startDate && options.filters?.endDate) {
      if (options.filters.startDate > options.filters.endDate) {
        errors.push('Дата начала не может быть позже даты окончания');
      }
    }

    // Проверка зарплаты
    if (options.filters?.minSalary && options.filters?.maxSalary) {
      if (options.filters.minSalary > options.filters.maxSalary) {
        errors.push('Минимальная зарплата не может быть больше максимальной');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### **`src/export/services/stream-response.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';

@Injectable()
export class StreamResponseService {
  /**
   * Отправляет Readable stream в HTTP response
   */
  async pipeStreamToResponse(
    readableStream: Readable,
    response: Response,
    fileName: string,
    contentType: string = 'application/octet-stream'
  ): Promise<void> {
    // Устанавливаем заголовки
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('Transfer-Encoding', 'chunked');

    // Pipe stream в response
    readableStream.pipe(response);

    // Обработка ошибок
    readableStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!response.headersSent) {
        response.status(500).json({ error: 'Stream error', message: error.message });
      } else {
        response.end();
      }
    });

    // Завершение
    readableStream.on('end', () => {
      response.end();
    });
  }

  /**
   * Создает прогрессивный stream с информацией о прогрессе
   */
  createProgressStream(
    dataStream: AsyncGenerator<any>,
    totalItems: number,
    onProgress?: (percentage: number) => void
  ): Readable {
    let processed = 0;
    
    return new Readable({
      objectMode: true,
      async read() {
        try {
          const { value, done } = await dataStream.next();
          
          if (done) {
            this.push(null); // Завершаем stream
            return;
          }

          processed += Array.isArray(value) ? value.length : 1;
          
          // Вызываем callback прогресса
          if (onProgress && totalItems > 0) {
            const percentage = Math.round((processed / totalItems) * 100);
            onProgress(percentage);
          }

          this.push(value);
        } catch (error) {
          this.destroy(error);
        }
      }
    });
  }
}
```

## **4. Контроллер**

### **`src/export/controllers/excel-export.controller.ts`**
```typescript
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Query, 
  Res, 
  HttpStatus, 
  Logger, 
  UseInterceptors,
  StreamableFile,
  Header,
  Param
} from '@nestjs/common';
import { Response } from 'express';
import { ExcelExportService } from '../services/excel-export.service';
import { WasmExcelService } from '../services/wasm-excel.service';
import { ExportRequestDto } from '../dto/export-request.dto';
import { Readable } from 'stream';

@Controller('export')
export class ExcelExportController {
  private readonly logger = new Logger(ExcelExportController.name);

  constructor(
    private readonly excelExportService: ExcelExportService,
    private readonly wasmExcelService: WasmExcelService,
  ) {}

  /**
   * Экспорт данных в Excel с потоковой передачей
   */
  @Post('excel/stream')
  async exportExcelStream(
    @Body() exportRequest: ExportRequestDto,
    @Res() response: Response
  ) {
    this.logger.log(`Запрос на экспорт Excel (stream): ${JSON.stringify(exportRequest)}`);
    
    // Валидация параметров
    const validation = await this.excelExportService.validateExportOptions(exportRequest);
    if (!validation.valid) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    try {
      // Экспортируем данные в поток
      await this.excelExportService.exportToResponse(response, exportRequest);
    } catch (error) {
      this.logger.error(`Ошибка экспорта: ${error.message}`);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Export failed',
        message: error.message
      });
    }
  }

  /**
   * Экспорт данных в Excel с возвратом файла
   */
  @Post('excel/download')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="export.xlsx"')
  async exportExcelDownload(
    @Body() exportRequest: ExportRequestDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    this.logger.log(`Запрос на скачивание Excel: ${JSON.stringify(exportRequest)}`);

    // Валидация параметров
    const validation = await this.excelExportService.validateExportOptions(exportRequest);
    if (!validation.valid) {
      response.status(HttpStatus.BAD_REQUEST);
      throw new Error(validation.errors.join(', '));
    }

    try {
      // Экспортируем в буфер
      const { buffer } = await this.excelExportService.exportToBuffer(exportRequest);
      
      // Создаем stream из буфера
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      // Устанавливаем имя файла в заголовке
      response.setHeader('Content-Disposition', `attachment; filename="${exportRequest.fileName}"`);
      
      return new StreamableFile(stream);
    } catch (error) {
      this.logger.error(`Ошибка скачивания: ${error.message}`);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR);
      throw error;
    }
  }

  /**
   * Получение данных для экспорта (без файла)
   */
  @Post('data')
  async getExportData(@Body() exportRequest: ExportRequestDto) {
    this.logger.log(`Запрос данных для экспорта: ${JSON.stringify(exportRequest)}`);
    
    const validation = await this.excelExportService.validateExportOptions(exportRequest);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    try {
      const data = await this.excelExportService.getExportData(exportRequest);
      return {
        success: true,
        data: {
          rows: data.rows.slice(0, 100), // Возвращаем только первые 100 строк для предпросмотра
          total: data.total,
          columns: data.columns
        }
      };
    } catch (error) {
      this.logger.error(`Ошибка получения данных: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Проверка статуса WASM модуля
   */
  @Get('wasm/status')
  getWasmStatus() {
    const status = this.wasmExcelService.getStatus();
    return {
      success: true,
      status,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Инициализация WASM модуля
   */
  @Post('wasm/initialize')
  async initializeWasm() {
    this.logger.log('Запрос на инициализацию WASM модуля');
    
    try {
      // Инициализируем с тестовыми заголовками
      const headers = ['ID', 'Имя', 'Email', 'Должность', 'Отдел'];
      const initialized = await this.wasmExcelService.initializeExport(headers);
      
      return {
        success: initialized,
        message: initialized ? 'WASM модуль инициализирован' : 'Ошибка инициализации WASM'
      };
    } catch (error) {
      this.logger.error(`Ошибка инициализации WASM: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Быстрый экспорт с параметрами по умолчанию
   */
  @Get('quick/:limit?')
  async quickExport(
    @Param('limit') limit: number = 1000,
    @Res() response: Response
  ) {
    this.logger.log(`Быстрый экспорт ${limit} записей`);
    
    const exportRequest: ExportRequestDto = {
      limit,
      fileName: `quick_export_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Быстрый экспорт'
    };

    try {
      await this.excelExportService.exportToResponse(response, exportRequest);
    } catch (error) {
      this.logger.error(`Ошибка быстрого экспорта: ${error.message}`);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Export failed',
        message: error.message
      });
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'excel-export',
      timestamp: new Date().toISOString(),
      wasm: this.wasmExcelService.getStatus()
    };
  }
}
```

## **5. Модуль**

### **`src/export/excel-export.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { ExcelExportController } from './controllers/excel-export.controller';
import { ExcelExportService } from './services/excel-export.service';
import { WasmExcelService } from './services/wasm-excel.service';
import { DataGeneratorService } from './services/data-generator.service';
import { StreamResponseService } from './services/stream-response.service';

@Module({
  controllers: [ExcelExportController],
  providers: [
    ExcelExportService,
    WasmExcelService,
    DataGeneratorService,
    StreamResponseService
  ],
  exports: [
    ExcelExportService,
    WasmExcelService
  ]
})
export class ExcelExportModule {}
```

## **6. Основной модуль приложения**

### **`src/main.ts`**
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Глобальная валидация
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  // Включаем CORS
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`Приложение запущено на порту ${port}`);
  logger.log(`Эндпоинт экспорта: http://localhost:${port}/export`);
}

bootstrap();
```

### **`src/app.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelExportModule } from './export/excel-export.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    ExcelExportModule
  ],
})
export class AppModule {}
```

## **7. Тестовый файл для проверки**

### **`test/export.test.js`**
```javascript
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';

async function testExport() {
  console.log('🚀 Тестирование экспорта Excel через WASM\n');

  try {
    // 1. Проверка health
    console.log('1. Проверка health...');
    const health = await axios.get(`${BASE_URL}/export/health`);
    console.log(`   ✅ Health: ${JSON.stringify(health.data)}\n`);

    // 2. Инициализация WASM
    console.log('2. Инициализация WASM модуля...');
    const wasmInit = await axios.post(`${BASE_URL}/export/wasm/initialize`);
    console.log(`   ✅ WASM init: ${JSON.stringify(wasmInit.data)}\n`);

    // 3. Получение данных для предпросмотра
    console.log('3. Получение данных для экспорта...');
    const previewData = await axios.post(`${BASE_URL}/export/data`, {
      limit: 100,
      columns: ['ID', 'Имя', 'Email', 'Должность', 'Отдел', 'Зарплата (итоговая)']
    });
    console.log(`   ✅ Данные получены: ${previewData.data.data.rows.length} строк\n`);

    // 4. Быстрый экспорт
    console.log('4. Быстрый экспорт 1000 записей...');
    const quickExport = await axios.get(`${BASE_URL}/export/quick/1000`, {
      responseType: 'stream'
    });

    // Сохраняем файл
    const outputPath = path.join(__dirname, 'quick_export.xlsx');
    const writer = fs.createWriteStream(outputPath);
    quickExport.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(outputPath);
    console.log(`   ✅ Файл сохранен: ${outputPath}`);
    console.log(`   📏 Размер: ${(stats.size / 1024 / 1024).toFixed(2)}MB\n`);

    // 5. Полный экспорт с фильтрами
    console.log('5. Полный экспорт с фильтрами...');
    const exportRequest = {
      filters: {
        department: 'Разработка',
        minSalary: 80000,
        maxSalary: 200000
      },
      limit: 5000,
      columns: [
        'ID',
        'Имя',
        'Фамилия',
        'Должность',
        'Отдел',
        'Зарплата (итоговая)',
        'Дата приема на работу',
        'Стаж (лет)'
      ],
      fileName: 'developers_export.xlsx',
      sheetName: 'Разработчики',
      includeHeaders: true
    };

    const fullExport = await axios.post(
      `${BASE_URL}/export/excel/stream`,
      exportRequest,
      {
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const fullOutputPath = path.join(__dirname, 'developers_export.xlsx');
    const fullWriter = fs.createWriteStream(fullOutputPath);
    fullExport.data.pipe(fullWriter);

    await new Promise((resolve, reject) => {
      fullWriter.on('finish', resolve);
      fullWriter.on('error', reject);
    });

    const fullStats = fs.statSync(fullOutputPath);
    console.log(`   ✅ Файл сохранен: ${fullOutputPath}`);
    console.log(`   📏 Размер: ${(fullStats.size / 1024 / 1024).toFixed(2)}MB\n`);

    console.log('🎉 Все тесты пройдены успешно!\n');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
    }
    process.exit(1);
  }
}

// Запуск теста
testExport();
```

## **8. package.json**

```json
{
  "name": "nestjs-go-export-excel-wasm",
  "version": "1.0.0",
  "description": "NestJS приложение для экспорта Excel через Go WASM",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:export": "node test/export.test.js",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "wasm:build": "cd shared/wasm && GOOS=js GOARCH=wasm go build -o excel_bridge.wasm excel_bridge.go",
    "wasm:copy": "cp \"$(go env GOROOT)/misc/wasm/wasm_exec.js\" shared/wasm/"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@nestjs/testing": "^10.0.0",
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.42.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "prettier": "^3.0.0",
    "source-map-support": "^0.5.21",
    "ts-jest": "^29.1.0",
    "ts-loader": "^9.4.3",
    "ts-node": "^10.9.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.1.3"
  },
  "jest": {
    "moduleFileExtensions": [
      "js",
      "json",
      "ts"
    ],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

## **9. Пример использования**

### **Пример запроса через curl:**
```bash
# 1. Быстрый экспорт
curl -X GET "http://localhost:3000/export/quick/5000" \
  -H "Content-Type: application/json" \
  --output "export.xlsx"

# 2. Экспорт с фильтрами
curl -X POST "http://localhost:3000/export/excel/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "department": "Разработка",
      "minSalary": 100000
    },
    "limit": 10000,
    "fileName": "developers.xlsx",
    "columns": ["ID", "Имя", "Должность", "Зарплата"]
  }' \
  --output "developers.xlsx"

# 3. Получение данных для предпросмотра
curl -X POST "http://localhost:3000/export/data" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 100,
    "columns": ["ID", "Имя", "Email"]
  }'
```

### **Пример использования в фронтенде:**
```javascript
// 1. Экспорт через fetch
async function exportToExcel(filters) {
  const response = await fetch('http://localhost:3000/export/excel/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters,
      limit: 10000,
      fileName: 'data_export.xlsx'
    })
  });

  // Создаем blob и скачиваем
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data_export.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 2. Мониторинг прогресса через WebSocket
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'export_progress') {
    console.log(`Прогресс: ${data.progress}%`);
    updateProgressBar(data.progress);
  }
};
```

## **Ключевые особенности:**

1. **Полная интеграция с NestJS** - модули, сервисы, контроллеры
2. **Потоковая передача данных** - без загрузки всего файла в память
3. **Поддержка фильтров и параметров** - гибкая настройка экспорта
4. **Валидация входных данных** - через class-validator
5. **Прогресс экспорта** - возможность отслеживания процесса
6. **Поддержка больших файлов** - до 100,000+ записей
7. **Модульная архитектура** - легко расширять и модифицировать
8. **Готовые тесты** - примеры для проверки работы

## **Инструкция по запуску:**

```bash
# 1. Установите зависимости
npm install

# 2. Соберите WASM модуль
npm run wasm:build
npm run wasm:copy

# 3. Запустите приложение
npm run start:dev

# 4. Протестируйте API
npm run test:export

# Или через curl
curl http://localhost:3000/export/health
```

Эта реализация предоставляет полное решение для экспорта данных в Excel через Go WASM в NestJS приложении с поддержкой потоковой передачи, фильтрации и мониторинга прогресса.
