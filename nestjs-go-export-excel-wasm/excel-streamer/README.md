# 1. Перейдите в директорию с проектом
cd nestjs-go-export-excel-wasm/excel-streamer

# 2. Установите зависимости Go
go mod tidy

# 3. Соберите WASM файл
GOOS=js GOARCH=wasm go build -o excel_bridge.wasm excel_bridge.go

# 4. Скопируйте wasm_exec.js (если еще нет)
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" .

# 5. Установите Node.js зависимости (если нужно проверять Excel)
npm install adm-zip  # опционально

# 6. Запустите тест
node test_streaming.js
