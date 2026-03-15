import { Injectable, Logger } from '@nestjs/common';
import { ExportData, ExportDataRow } from '../interfaces/export-data.interface';
import { ExportFilterDto } from '../dto/export-request.dto';

@Injectable()
export class DataGeneratorService {
    private readonly logger = new Logger(DataGeneratorService.name);

    // Генератор для потоковой передачи данных (возвращает массив объектов)
    async *generateExportDataStream(
        filters?: ExportFilterDto,
        limit: number = 10000,
        batchSize: number = 500
    ): AsyncGenerator<Record<string, any>[]> {
        this.logger.log(`Запуск потоковой генерации данных: ${limit} записей, batch: ${batchSize}`);

        let generated = 0;

        while (generated < limit) {
            const currentBatch = Math.min(batchSize, limit - generated);
            const batch: Record<string, any>[] = [];

            for (let i = 0; i < currentBatch; i++) {
                const row = this.generateRowObject(generated + i + 1, filters);
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

    // Генерация одной строки как объекта
    generateRowObject(id: number, filters?: ExportFilterDto): Record<string, any> {
        const names = ['Алексей', 'Дмитрий', 'Екатерина', 'Михаил', 'Наталья', 'Павел', 'Светлана', 'Татьяна', 'Анна', 'Иван'];
        const surnames = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Михайлов', 'Смирнов', 'Федоров'];
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
        const salary = filters?.minSalary
            ? filters.minSalary + Math.floor(Math.random() * (filters.maxSalary || 200000 - filters.minSalary))
            : 50000 + Math.floor(Math.random() * 150000);

        // Создаем объект с данными (аналогично ExcelJS worksheet.addRow)
        const row: Record<string, any> = {
            'ID': id,
            'Имя': name,
            'Фамилия': surname,
            'Отчество': ['Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич'][Math.floor(Math.random() * 4)],
            'Дата рождения': this.randomDate(new Date(1970, 0, 1), new Date(2000, 0, 1)),
            'Возраст': 20 + Math.floor(Math.random() * 40),
            'Пол': Math.random() > 0.5 ? 'Мужской' : 'Женский',
            'Email личный': `${name.toLowerCase()}.${surname.toLowerCase()}@gmail.com`,
            'Email рабочий': `${name.toLowerCase()}.${surname.toLowerCase()}@company.com`,
            'Телефон мобильный': `+7 999 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
            'Должность': position,
            'Отдел': department,
            'Зарплата (базовая)': salary,
            'Зарплата (бонусная)': Math.floor(Math.random() * 50000),
            'Зарплата (итоговая)': salary + Math.floor(Math.random() * 50000),
            'Дата приема на работу': this.randomDate(new Date(2015, 0, 1), new Date(2023, 0, 1)),
            'Стаж (лет)': Math.floor(Math.random() * 10),
            'Тип занятости': Math.random() > 0.5 ? 'Полная занятость' : 'Частичная занятость',
            'Удаленная работа': Math.random() > 0.5,
            'Город проживания': ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'][Math.floor(Math.random() * 4)],
            'Страна': 'Россия',
            'Образование': Math.random() > 0.7 ? 'Высшее' : 'Среднее специальное',
            'Иностранные языки': Math.random() > 0.5 ? 'Английский' : 'Немецкий',
            'Уровень английского': ['A1', 'A2', 'B1', 'B2', 'C1'][Math.floor(Math.random() * 5)],
            'Навыки (hard skills)': 'JavaScript, TypeScript, Node.js',
            'Навыки (soft skills)': 'Коммуникабельность, Работа в команде',
            'Опыт работы (лет)': Math.floor(Math.random() * 20),
            'Хобби': ['Чтение', 'Спорт', 'Путешествия'][Math.floor(Math.random() * 3)],
            'Спорт': ['Футбол', 'Бег', 'Плавание'][Math.floor(Math.random() * 3)],
            'Семейное положение': Math.random() > 0.5 ? 'Женат/Замужем' : 'Холост/Не замужем',
            'Дети (кол-во)': Math.floor(Math.random() * 4),
            'Корпоративный ноутбук': Math.random() > 0.5,
            'Корпоративный телефон': Math.random() > 0.3,
            'Активен': true,
            'Рейтинг производительности': parseFloat((Math.random() * 5).toFixed(1)),
            'Последняя оценка': this.randomDate(new Date(2023, 0, 1), new Date(2024, 0, 1)),
            'Дата следующей оценки': this.randomDate(new Date(2024, 0, 1), new Date(2025, 0, 1))
        };

        return row;
    }

    private randomDate(start: Date, end: Date): string {
        const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return date.toISOString().split('T')[0]; // Формат YYYY-MM-DD
    }

    getColumnNames(): string[] {
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
            'Должность',
            'Отдел',
            'Зарплата (базовая)',
            'Зарплата (бонусная)',
            'Зарплата (итоговая)',
            'Дата приема на работу',
            'Стаж (лет)',
            'Тип занятости',
            'Удаленная работа',
            'Город проживания',
            'Страна',
            'Образование',
            'Иностранные языки',
            'Уровень английского',
            'Навыки (hard skills)',
            'Навыки (soft skills)',
            'Опыт работы (лет)',
            'Хобби',
            'Спорт',
            'Семейное положение',
            'Дети (кол-во)',
            'Корпоративный ноутбук',
            'Корпоративный телефон',
            'Активен',
            'Рейтинг производительности',
            'Последняя оценка',
            'Дата следующей оценки'
        ];
    }

    // Для обратной совместимости
    async generateExportData(filters?: ExportFilterDto, limit: number = 10000): Promise<ExportData> {
        const rows: ExportDataRow[] = [];
        const columns = this.getColumnNames();

        for (let i = 1; i <= limit; i++) {
            const rowObj = this.generateRowObject(i, filters);
            rows.push(rowObj);
        }

        return { rows, total: rows.length, columns };
    }
}
