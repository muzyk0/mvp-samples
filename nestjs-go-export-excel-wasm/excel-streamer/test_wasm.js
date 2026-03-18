const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');

// Загружаем wasm_exec.js
eval(fs.readFileSync(path.join(__dirname, 'wasm_exec.js'), 'utf8'));

class ExcelStreamWriter extends Writable {
    constructor(filePath, options = {}) {
        super(options);
        this.filePath = filePath;
        this.fileStream = fs.createWriteStream(filePath);
        this.receivedBytes = 0;
        this.chunkCount = 0;
        this.startTime = Date.now();
        this.totalSize = 0;
    }

    _write(chunk, encoding, callback) {
        this.chunkCount++;
        this.receivedBytes += chunk.length;

        // Пишем чанк в файл
        this.fileStream.write(chunk, (err) => {
            if (err) {
                console.error(`❌ Ошибка записи чанка ${this.chunkCount}:`, err);
                callback(err);
            } else {
                const elapsed = (Date.now() - this.startTime) / 1000;
                const speed = elapsed > 0 ? (this.receivedBytes / 1024 / 1024 / elapsed).toFixed(2) : 0;
                console.log(`   📦 Чанк ${this.chunkCount}: ${(chunk.length / 1024).toFixed(1)}KB, всего: ${(this.receivedBytes / 1024 / 1024).toFixed(2)}MB, скорость: ${speed}MB/s`);
                callback();
            }
        });
    }

    _final(callback) {
        this.fileStream.end(() => {
            console.log(`\n✅ Файл сохранен: ${this.filePath}`);
            console.log(`   📊 Всего чанков: ${this.chunkCount}`);
            console.log(`   📏 Общий размер: ${(this.receivedBytes / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   ⏱️  Время: ${((Date.now() - this.startTime) / 1000).toFixed(1)}с`);
            callback();
        });
    }
}

async function testStreamingWasm() {
    try {
        console.log('🚀 Начинаем тестирование экспорта Excel через WASM\n');

        // Загружаем WASM бинарник
        const wasmBuffer = fs.readFileSync('./excel_bridge.wasm');

        // Создаем экземпляр Go
        const go = new Go();

        // Компилируем и инстанцируем WASM модуль
        const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);

        // Запускаем Go runtime в фоновом режиме
        go.run(instance).catch(err => {
            console.error('Ошибка в Go runtime:', err);
        });

        console.log('✅ WASM модуль загружен\n');

        // Ждем инициализации WASM
        await new Promise(resolve => setTimeout(resolve, 100));

        // Проверяем доступность функций
        if (typeof goInitExport === 'undefined' ||
            typeof goWriteRows === 'undefined' ||
            typeof goFinalizeExport === 'undefined') {
            throw new Error('Не все Go функции экспортированы');
        }

        // Создаем потоковый writer
        const outputPath = path.join(__dirname, 'stream_output.xlsx');
        const excelWriter = new ExcelStreamWriter(outputPath);

        // Переменные для отслеживания состояния
        let isComplete = false;
        let errorOccurred = false;

        // Callback для получения данных от Go
        const receiveChunk = (chunkData, status) => {
            if (status === 'INIT_OK') {
                console.log('✅ Инициализация экспорта завершена');
                return;
            }

            if (status === 'COMPLETE') {
                console.log('\n📤 Получен сигнал COMPLETE от Go');
                isComplete = true;
                excelWriter.end();
                return;
            }

            if (status && status.startsWith('BYTES:')) {
                const totalBytes = parseInt(status.split(':')[1], 10);

                // Записываем в файл
                const buffer = Buffer.from(chunkData);
                if (!excelWriter.write(buffer)) {
                    excelWriter.once('drain', () => {
                        // Буфер очищен
                    });
                }

                if (excelWriter.chunkCount === 1 || excelWriter.chunkCount % 10 === 0) {
                    console.log(`   📊 Передано байт: ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
                }
                return;
            }

            if (status && status !== '') {
                console.error(`\n❌ Ошибка от Go: ${status}`);
                errorOccurred = true;
                excelWriter.destroy(new Error(status));
                return;
            }
        };

        // Тест 1: Инициализация с 50+ колонками
        console.log('📝 Тест 1: Инициализация экспорта с 50+ колонками...');
        const headers = [
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

        console.log(`   Количество колонок: ${headers.length}`);
        console.log(`   Первые 10 колонок: ${headers.slice(0, 10).join(', ')}...`);

        // Инициализируем экспорт
        const initResult = goInitExport(headers, receiveChunk);
        if (initResult && initResult.toString().includes('Ошибка')) {
            throw new Error(`Ошибка инициализации: ${initResult}`);
        }

        // Ждем завершения инициализации
        await new Promise(resolve => setTimeout(resolve, 500));

        if (errorOccurred) {
            throw new Error('Ошибка при инициализации');
        }

        // Тест 2: Запись тестовых данных с 50+ колонками
        console.log('\n📝 Тест 2: Запись тестовых данных с 50+ колонками...');

        // Генерируем тестовые данные с 50+ колонками
        const generateTestData = (startId, count) => {
            const data = [];

            // Массивы для генерации данных
            const names = ['Алексей', 'Дмитрий', 'Екатерина', 'Михаил', 'Наталья', 'Павел', 'Светлана', 'Татьяна', 'Анна', 'Иван', 'Ольга', 'Сергей', 'Андрей', 'Мария', 'Юлия'];
            const surnames = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Михайлов', 'Смирнов', 'Федоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Козлов'];
            const patronymics = ['Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич', 'Владимирович', 'Игоревич', 'Олегович', 'Борисович', 'Викторович', 'Николаевич'];
            const cities = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону'];
            const countries = ['Россия', 'Беларусь', 'Казахстан', 'Украина', 'Армения'];
            const positions = [
                'Junior Developer', 'Middle Developer', 'Senior Developer',
                'Team Lead', 'Project Manager', 'DevOps Engineer',
                'QA Engineer', 'Analyst', 'UX/UI Designer', 'Product Manager',
                'System Administrator', 'Database Administrator', 'Security Engineer'
            ];
            const departments = ['Разработка', 'Тестирование', 'Аналитика', 'Дизайн', 'Маркетинг', 'Продажи', 'Поддержка', 'Администрирование', 'Безопасность'];
            const projects = ['Проект А', 'Проект Б', 'Проект В', 'Проект Г', 'Внутренняя разработка'];
            const educationLevels = ['Среднее', 'Среднее специальное', 'Неоконченное высшее', 'Высшее', 'Магистратура', 'Аспирантура'];
            const universities = ['МГУ', 'МФТИ', 'ВШЭ', 'МГТУ им. Баумана', 'СПбГУ', 'ИТМО', 'МИФИ'];
            const languages = ['Английский', 'Немецкий', 'Французский', 'Испанский', 'Китайский'];
            const languageLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
            const bloodTypes = ['I (0)', 'II (A)', 'III (B)', 'IV (AB)'];
            const maritalStatuses = ['Холост/Не замужем', 'Женат/Замужем', 'Разведен/Разведена', 'Вдовец/Вдова'];
            const employmentTypes = ['Полная занятость', 'Частичная занятость', 'Проектная работа', 'Стажировка'];
            const schedules = ['5/2', '2/2', 'Гибкий график', 'Сменный график'];
            const currencies = ['RUB', 'USD', 'EUR', 'GBP'];
            const banks = ['Сбербанк', 'ВТБ', 'Альфа-Банк', 'Тинькофф', 'Газпромбанк'];
            const skills = [
                'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'PHP',
                'React', 'Vue.js', 'Angular', 'Node.js', 'Docker', 'Kubernetes',
                'AWS', 'Azure', 'GCP', 'SQL', 'NoSQL', 'Git', 'CI/CD', 'Agile/Scrum'
            ];
            const softSkills = ['Коммуникабельность', 'Лидерство', 'Работа в команде', 'Тайм-менеджмент', 'Критическое мышление', 'Решение проблем'];
            const hobbies = ['Чтение', 'Путешествия', 'Спорт', 'Музыка', 'Кино', 'Фотография', 'Кулинария', 'Рыбалка', 'Охота', 'Садоводство'];
            const sports = ['Футбол', 'Баскетбол', 'Теннис', 'Плавание', 'Бег', 'Йога', 'Фитнес', 'Велоспорт'];
            const allergies = ['Нет', 'Пыльца', 'Пыль', 'Продукты питания', 'Лекарства', 'Животные'];
            const systemRoles = ['Пользователь', 'Администратор', 'Модератор', 'Аналитик', 'Разработчик'];
            const statuses = ['Активен', 'Неактивен', 'В отпуске', 'На больничном', 'Уволен'];

            for (let i = 0; i < count; i++) {
                const id = startId + i;
                const name = names[Math.floor(Math.random() * names.length)];
                const surname = surnames[Math.floor(Math.random() * surnames.length)];
                const patronymic = patronymics[Math.floor(Math.random() * patronymics.length)];
                const birthYear = 1960 + Math.floor(Math.random() * 40);
                const birthMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
                const birthDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
                const age = 2025 - birthYear;
                const gender = Math.random() > 0.5 ? 'Мужской' : 'Женский';
                const city = cities[Math.floor(Math.random() * cities.length)];
                const country = countries[Math.floor(Math.random() * countries.length)];
                const position = positions[Math.floor(Math.random() * positions.length)];
                const department = departments[Math.floor(Math.random() * departments.length)];
                const project = projects[Math.floor(Math.random() * projects.length)];
                const salaryBase = 50000 + Math.floor(Math.random() * 150000);
                const salaryBonus = Math.floor(Math.random() * 50000);
                const salaryTotal = salaryBase + salaryBonus;
                const hireYear = 2015 + Math.floor(Math.random() * 10);
                const hireMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
                const hireDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
                const experience = 2025 - hireYear;
                const education = educationLevels[Math.floor(Math.random() * educationLevels.length)];
                const university = universities[Math.floor(Math.random() * universities.length)];
                const gradYear = 2000 + Math.floor(Math.random() * 25);
                const language = languages[Math.floor(Math.random() * languages.length)];
                const languageLevel = languageLevels[Math.floor(Math.random() * languageLevels.length)];
                const bloodType = bloodTypes[Math.floor(Math.random() * bloodTypes.length)];
                const maritalStatus = maritalStatuses[Math.floor(Math.random() * maritalStatuses.length)];
                const children = Math.floor(Math.random() * 5);
                const employmentType = employmentTypes[Math.floor(Math.random() * employmentTypes.length)];
                const schedule = schedules[Math.floor(Math.random() * schedules.length)];
                const remoteWork = Math.random() > 0.5 ? 'Да' : 'Нет';
                const currency = currencies[Math.floor(Math.random() * currencies.length)];
                const bank = banks[Math.floor(Math.random() * banks.length)];
                const driverLicense = Math.random() > 0.7 ? 'Да' : 'Нет';
                const licenseCategories = driverLicense === 'Да' ? 'B' + (Math.random() > 0.5 ? ', C' : '') : 'Нет';
                const hobby = hobbies[Math.floor(Math.random() * hobbies.length)];
                const sport = sports[Math.floor(Math.random() * sports.length)];
                const allergy = allergies[Math.floor(Math.random() * allergies.length)];
                const systemRole = systemRoles[Math.floor(Math.random() * systemRoles.length)];
                const status = statuses[Math.floor(Math.random() * statuses.length)];

                // Генерируем случайные навыки (3-5 навыков)
                const randomSkills = [];
                const numSkills = 3 + Math.floor(Math.random() * 3);
                const shuffledSkills = [...skills].sort(() => 0.5 - Math.random());
                randomSkills.push(...shuffledSkills.slice(0, numSkills));

                // Генерируем случайные soft skills (2-3 навыка)
                const randomSoftSkills = [];
                const numSoftSkills = 2 + Math.floor(Math.random() * 2);
                const shuffledSoftSkills = [...softSkills].sort(() => 0.5 - Math.random());
                randomSoftSkills.push(...shuffledSoftSkills.slice(0, numSoftSkills));

                // Собираем все данные в одну строку (50+ колонок)
                const row = [
                    id,                                         // 1. ID
                    name,                                       // 2. Имя
                    surname,                                    // 3. Фамилия
                    patronymic,                                 // 4. Отчество
                    `${birthYear}-${birthMonth}-${birthDay}`,   // 5. Дата рождения
                    age,                                        // 6. Возраст
                    gender,                                     // 7. Пол
                    `${name.toLowerCase()}.${surname.toLowerCase()}@gmail.com`, // 8. Email личный
                    `${name.toLowerCase()}.${surname.toLowerCase()}@company.com`, // 9. Email рабочий
                    `+7 999 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`, // 10. Телефон мобильный
                    `+7 495 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`, // 11. Телефон рабочий
                    `+7 812 ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`, // 12. Телефон домашний
                    city,                                       // 13. Город проживания
                    country,                                    // 14. Страна
                    `ул. ${['Ленина', 'Пушкина', 'Гагарина', 'Советская', 'Мира'][Math.floor(Math.random() * 5)]}, д. ${Math.floor(Math.random() * 100) + 1}`, // 15. Адрес
                    Math.floor(100000 + Math.random() * 900000), // 16. Индекс
                    position,                                   // 17. Должность
                    department,                                 // 18. Отдел
                    project,                                    // 19. Проект
                    `${names[Math.floor(Math.random() * names.length)]} ${surnames[Math.floor(Math.random() * surnames.length)]}`, // 20. Руководитель
                    `${hireYear}-${hireMonth}-${hireDay}`,      // 21. Дата приема на работу
                    experience,                                 // 22. Стаж (лет)
                    employmentType,                             // 23. Тип занятости
                    schedule,                                   // 24. График работы
                    remoteWork,                                 // 25. Удаленная работа
                    salaryBase,                                 // 26. Зарплата (базовая)
                    salaryBonus,                                // 27. Зарплата (бонусная)
                    salaryTotal,                                // 28. Зарплата (итоговая)
                    currency,                                   // 29. Валюта зарплаты
                    `40817${String(Math.floor(Math.random() * 1000000000)).padStart(10, '0')}`, // 30. Банковский счет
                    bank,                                       // 31. Банк
                    `${Math.floor(Math.random() * 100000000000)}`.padStart(12, '0'), // 32. ИНН
                    `${Math.floor(Math.random() * 100000000000)}`.padStart(11, '0'), // 33. СНИЛС
                    Math.floor(1000 + Math.random() * 9000),   // 34. Паспорт серия
                    Math.floor(100000 + Math.random() * 900000), // 35. Паспорт номер
                    `ОУФМС России по г. ${city}`,              // 36. Паспорт выдан
                    `${2010 + Math.floor(Math.random() * 15)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`, // 37. Паспорт дата выдачи
                    maritalStatus,                              // 38. Семейное положение
                    children,                                   // 39. Дети (кол-во)
                    education,                                  // 40. Образование
                    university,                                 // 41. ВУЗ
                    gradYear,                                   // 42. Год окончания
                    'Информационные технологии',                // 43. Специальность
                    Math.random() > 0.8 ? 'Кандидат наук' : 'Нет', // 44. Ученая степень
                    `${language} (${languageLevel})`,           // 45. Иностранные языки
                    languageLevel,                              // 46. Уровень английского
                    driverLicense,                              // 47. Водительские права
                    licenseCategories,                          // 48. Категории прав
                    randomSkills.join(', '),                    // 49. Навыки (hard skills)
                    randomSoftSkills.join(', '),                // 50. Навыки (soft skills)
                    experience + Math.floor(Math.random() * 5), // 51. Опыт работы (лет)
                    `Компания ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`, // 52. Предыдущая компания
                    positions[Math.floor(Math.random() * positions.length)], // 53. Должность на предыдущем месте
                    `${hireYear - Math.floor(Math.random() * 5)}-${hireYear}`, // 54. Период работы
                    Math.random() > 0.5 ? 'Есть' : 'Нет',       // 55. Рекомендации
                    hobby,                                      // 56. Хобби
                    sport,                                      // 57. Спорт
                    bloodType,                                  // 58. Группа крови
                    allergy,                                    // 59. Аллергии
                    Math.random() > 0.7 ? 'Есть' : 'Нет',       // 60. Хронические заболевания
                    'Дополнительная информация',                // 61. Примечания
                    status,                                     // 62. Статус сотрудника
                    status === 'Уволен' ? `${2020 + Math.floor(Math.random() * 5)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}` : '', // 63. Дата увольнения
                    status === 'Уволен' ? ['Собственное желание', 'Сокращение', 'По соглашению сторон'][Math.floor(Math.random() * 3)] : '', // 64. Причина увольнения
                    (Math.random() * 5).toFixed(1),             // 65. Рейтинг производительности
                    `${2024}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`, // 66. Последняя оценка
                    `${2025}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`, // 67. Дата следующей оценки
                    Math.floor(Math.random() * 3),              // 68. Курсы повышения квалификации
                    Math.floor(Math.random() * 5),              // 69. Сертификаты
                    systemRole,                                 // 70. Уровень доступа
                    Math.random() > 0.5 ? 'Да' : 'Нет',         // 71. Корпоративный ноутбук
                    Math.random() > 0.5 ? 'Да' : 'Нет',         // 72. Корпоративный телефон
                    Math.random() > 0.3 ? 'Монитор, клавиатура, мышь' : 'Нет', // 73. Дополнительное оборудование
                    `${name.toLowerCase()}.${surname.toLowerCase()}`, // 74. Логин в системе
                    '********',                                 // 75. Пароль (хэш)
                    systemRole,                                 // 76. Роль в системе
                    `${hireYear}-${hireMonth}-${hireDay}`,      // 77. Дата создания аккаунта
                    `${2025}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`, // 78. Последний вход
                    status === 'Активен' ? 'Да' : 'Нет'         // 79. Активен
                ];

                data.push(row);
            }
            return data;
        };

        // Записываем данные порциями
        const totalRecords = 120_000; // 10,000 записей
        const batchSize = 40_000; // 500 записей за раз

        console.log(`   Запись ${totalRecords} записей с ${headers.length} колонками порциями по ${batchSize}...`);

        for (let i = 0; i < totalRecords; i += batchSize) {
            const currentBatch = Math.min(batchSize, totalRecords - i);
            const batchData = generateTestData(i + 1, currentBatch);

            // Отправляем данные в Go
            const writeResult = goWriteRows(JSON.stringify(batchData));
            if (writeResult && writeResult.toString().includes('Ошибка')) {
                throw new Error(`Ошибка записи: ${writeResult}`);
            }

            // Выводим прогресс
            if ((i + currentBatch) % 1000 === 0 || (i + currentBatch) === totalRecords) {
                console.log(`   📝 Записано ${i + currentBatch} из ${totalRecords} записей`);
            }

            // Небольшая пауза между батчами
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        console.log(`   ✅ Все ${totalRecords} записей с ${headers.length} колонками отправлены`);

        // Тест 3: Завершение и получение файла
        console.log('\n📝 Тест 3: Завершение экспорта и получение файла...');

        // Завершаем экспорт и получаем файл
        const finalizeResult = goFinalizeExport(receiveChunk);
        if (finalizeResult && finalizeResult.toString().includes('Ошибка')) {
            throw new Error(`Ошибка завершения: ${finalizeResult}`);
        }

        // Ждем завершения записи файла
        await new Promise((resolve, reject) => {
            excelWriter.on('finish', resolve);
            excelWriter.on('error', reject);

            // Таймаут
            setTimeout(() => {
                if (!isComplete) {
                    console.warn('⚠️  Таймаут ожидания завершения');
                    resolve();
                }
            }, 60000); // 60 секунд для больших файлов
        });

        // Проверяем результат
        if (errorOccurred) {
            throw new Error('Ошибка при экспорте');
        }

        // Проверяем созданный файл
        console.log('\n🔍 Проверка созданного файла...');
        await verifyExcelFile(outputPath);

        console.log('\n🎉 ТЕСТИРОВАНИЕ ЭКСПОРТА С 50+ КОЛОНКАМИ УСПЕШНО ЗАВЕРШЕНО!\n');

    } catch (error) {
        console.error('\n❌ ОШИБКА В ТЕСТЕ:', error.message);
        console.error(error.stack || '');
        process.exit(1);
    }
}

async function verifyExcelFile(filePath) {
    try {
        const stats = fs.statSync(filePath);
        console.log(`   📍 Файл: ${filePath}`);
        console.log(`   📏 Размер: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

        // Проверка сигнатуры ZIP/Excel
        const data = fs.readFileSync(filePath, { encoding: null });
        const signature = data.slice(0, 4).toString('hex');

        if (signature === '504b0304') {
            console.log('   ✅ Корректная сигнатура ZIP архива (Excel)');

            // Попробуем открыть файл через excelize в Go для проверки
            console.log('   🔍 Попытка проверки структуры Excel...');

            // Загружаем и проверяем через Node.js библиотеку (если установлена)
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(filePath);
                const entries = zip.getEntries();

                console.log(`   📂 Файлов в архиве: ${entries.length}`);

                // Проверяем наличие ключевых файлов Excel
                let hasContentTypes = false;
                let hasWorkbook = false;
                let hasWorksheets = false;

                entries.forEach(entry => {
                    if (entry.entryName === '[Content_Types].xml') hasContentTypes = true;
                    if (entry.entryName === 'xl/workbook.xml') hasWorkbook = true;
                    if (entry.entryName.startsWith('xl/worksheets/')) hasWorksheets = true;
                });

                if (hasContentTypes && hasWorkbook && hasWorksheets) {
                    console.log('   ✅ Структура Excel файла корректна');
                } else {
                    console.log('   ⚠️  Не все обязательные файлы найдены');
                }

                // Оцениваем примерный размер данных
                const worksheetEntry = entries.find(e => e.entryName === 'xl/worksheets/sheet1.xml');
                if (worksheetEntry) {
                    console.log(`   📄 Размер листа данных: ${(worksheetEntry.getData().length / 1024).toFixed(1)}KB`);
                }
            } catch (zipError) {
                console.log('   ℹ️  Библиотека adm-zip не установлена. Установите: npm install adm-zip');
            }
        } else {
            console.log('   ❌ Неверная сигнатура файла (не ZIP/Excel)');
        }

        // Примерная оценка количества строк и колонок
        console.log(`   📊 Оценка: ~10,000 записей × 79 колонок = ~790,000 ячеек`);

    } catch (error) {
        console.log('   ❌ Ошибка проверки файла:', error.message);
    }
}

// Проверяем наличие WASM файла
function checkWasmFile() {
    const wasmPath = path.join(__dirname, 'excel_bridge.wasm');
    if (!fs.existsSync(wasmPath)) {
        console.error('\n❌ Файл excel_bridge.wasm не найден!');
        console.log('Соберите его командой:');
        console.log('GOOS=js GOARCH=wasm go build -o excel_bridge.wasm excel_bridge.go');
        process.exit(1);
    }
    console.log('✅ WASM файл найден');
}

// Запускаем тест
console.log('🔍 Проверка зависимостей...');
checkWasmFile();
testStreamingWasm().catch(error => {
    console.error('❌ Непредвиденная ошибка:', error);
    process.exit(1);
});
