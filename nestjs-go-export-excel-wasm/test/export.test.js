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
