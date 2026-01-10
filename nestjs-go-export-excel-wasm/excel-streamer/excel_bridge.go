package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"syscall/js"
	"time"

	"github.com/xuri/excelize/v2"
)

// ExportState хранит состояние экспорта
type ExportState struct {
	file         *excelize.File
	streamWriter *excelize.StreamWriter
	currentRow   int
	buffer       *bytes.Buffer
	writer       io.Writer
	chunkSize    int
	sentBytes    int
	totalChunks  int
	fileSize     int
	callback     js.Value
	headers      []string
	headerMap    map[string]int // Для быстрого доступа к индексам колонок
}

var state *ExportState

// initExport инициализирует экспорт Excel
// js: goInitExport(headers, callback)
func initExport(this js.Value, args []js.Value) interface{} {
	if len(args) < 2 {
		return js.ValueOf("Недостаточно аргументов: требуется headers и callback")
	}

	headers := args[0]
	callback := args[1]

	if headers.Type() != js.TypeObject {
		return js.ValueOf("Первый аргумент должен быть массивом заголовков")
	}

	if callback.Type() != js.TypeFunction {
		return js.ValueOf("Второй аргумент должен быть функцией callback")
	}

	// Создаем новый файл Excel
	f := excelize.NewFile()

	// Удаляем стандартный лист
	//f.DeleteSheet("Sheet1")

	// Создаем новый лист
	sheetName := "Sheet1"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка создания листа: "+err.Error()))
		return nil
	}

	f.SetActiveSheet(index)

	// Создаем потоковый writer
	streamWriter, err := f.NewStreamWriter(sheetName)
	if err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка создания StreamWriter: "+err.Error()))
		return nil
	}

	// Подготавливаем буфер
	buffer := &bytes.Buffer{}
	writer := io.Writer(buffer)

	// Сохраняем заголовки
	goHeaders := make([]string, headers.Length())
	headerMap := make(map[string]int)

	// Подготавливаем заголовки для записи в Excel
	headerValues := make([]interface{}, headers.Length())

	for i := 0; i < headers.Length(); i++ {
		header := headers.Index(i).String()
		goHeaders[i] = header
		headerMap[header] = i
		headerValues[i] = header
	}

	// Записываем заголовки в первую строку
	cell, _ := excelize.CoordinatesToCellName(1, 1)
	if err := streamWriter.SetRow(cell, headerValues); err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка записи заголовков: "+err.Error()))
		return nil
	}

	// Сохраняем состояние
	state = &ExportState{
		file:         f,
		streamWriter: streamWriter,
		currentRow:   2, // Начинаем со второй строки (после заголовков)
		buffer:       buffer,
		writer:       writer,
		chunkSize:    64 * 1024, // 64KB чанки по умолчанию
		callback:     callback,
		headers:      goHeaders,
		headerMap:    headerMap,
	}

	// Отправляем подтверждение инициализации
	callback.Invoke(js.Null(), js.ValueOf("INIT_OK"))
	fmt.Println("[GO] Экспорт инициализирован с", len(goHeaders), "колонками")

	return nil
}

// writeRows записывает строки данных из массива объектов
// js: goWriteRows(jsonArrayOfObjects)
func writeRows(this js.Value, args []js.Value) interface{} {
	if state == nil {
		return js.ValueOf("Экспорт не инициализирован. Вызовите goInitExport сначала.")
	}

	if len(args) < 1 {
		return js.ValueOf("Требуется аргумент: массив объектов в формате JSON")
	}

	jsonData := args[0].String()

	// Парсим JSON как массив объектов
	var rows []map[string]interface{}
	if err := json.Unmarshal([]byte(jsonData), &rows); err != nil {
		return js.ValueOf("Ошибка парсинга JSON (ожидается массив объектов): " + err.Error())
	}

	fmt.Printf("[GO] Получено %d объектов для записи\n", len(rows))

	// Записываем каждый объект как строку
	for _, row := range rows {
		// Преобразуем объект в массив значений в порядке заголовков
		rowValues := make([]interface{}, len(state.headers))

		for i, header := range state.headers {
			if value, exists := row[header]; exists {
				// Преобразуем значение для Excel
				rowValues[i] = convertValueForExcel(value)
			} else {
				// Если поле отсутствует, оставляем пустую ячейку
				rowValues[i] = nil
			}
		}

		// Определяем ячейку для текущей строки
		cell, _ := excelize.CoordinatesToCellName(1, state.currentRow)

		// Записываем строку в Excel
		if err := state.streamWriter.SetRow(cell, rowValues); err != nil {
			return js.ValueOf("Ошибка записи строки " + fmt.Sprint(state.currentRow) + ": " + err.Error())
		}

		state.currentRow++
	}

	// Периодически сбрасываем данные (каждые 100 строк)
	if state.currentRow%100 == 0 {
		if err := state.streamWriter.Flush(); err != nil {
			return js.ValueOf("Ошибка при сбросе данных: " + err.Error())
		}
		fmt.Printf("[GO] Записано %d строк\n", state.currentRow-2)
	}

	return nil
}

// convertValueForExcel преобразует значение для корректного отображения в Excel
func convertValueForExcel(value interface{}) interface{} {
	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case string:
		return v
	case int, int8, int16, int32, int64:
		return v
	case uint, uint8, uint16, uint32, uint64:
		return v
	case float32, float64:
		return v
	case bool:
		if v {
			return "Да"
		}
		return "Нет"
	case time.Time:
		return v.Format("2006-01-02 15:04:05")
	case map[string]interface{}:
		// Если это объект, преобразуем в JSON строку
		if jsonStr, err := json.Marshal(v); err == nil {
			return string(jsonStr)
		}
		return fmt.Sprintf("%v", v)
	case []interface{}:
		// Если это массив, преобразуем в JSON строку
		if jsonStr, err := json.Marshal(v); err == nil {
			return string(jsonStr)
		}
		return fmt.Sprintf("%v", v)
	default:
		// Для всех остальных типов используем строковое представление
		return fmt.Sprintf("%v", v)
	}
}

// setChunkSize устанавливает размер чанка для потоковой передачи
func setChunkSize(this js.Value, args []js.Value) interface{} {
	if state != nil && len(args) > 0 {
		state.chunkSize = args[0].Int()
		fmt.Printf("[GO] Установлен размер чанка: %d байт\n", state.chunkSize)
	}
	return nil
}

// getProgress возвращает текущий прогресс
func getProgress(this js.Value, args []js.Value) interface{} {
	if state == nil {
		return js.ValueOf("0")
	}
	// Возвращаем количество записанных строк данных (без заголовков)
	return js.ValueOf(fmt.Sprintf("%d", state.currentRow-2))
}

// finalizeExport завершает экспорт и отправляет файл
// js: goFinalizeExport()
func finalizeExport(this js.Value, args []js.Value) interface{} {
	if state == nil {
		return js.ValueOf("Экспорт не инициализирован")
	}

	fmt.Println("[GO] Завершение экспорта...")

	// Завершаем потоковую запись
	if err := state.streamWriter.Flush(); err != nil {
		state.callback.Invoke(js.Null(), js.ValueOf("Ошибка завершения записи: "+err.Error()))
		return nil
	}

	// Авторазмер колонок (опционально, можно настраивать)
	state.streamWriter.SetColWidth(1, len(state.headers), 20)

	// Сохраняем файл в буфер
	state.buffer.Reset()
	if err := state.file.Write(state.buffer); err != nil {
		state.callback.Invoke(js.Null(), js.ValueOf("Ошибка сохранения файла: "+err.Error()))
		return nil
	}

	data := state.buffer.Bytes()
	state.fileSize = len(data)

	fmt.Printf("[GO] Файл сохранен, размер: %d байт\n", state.fileSize)

	// Отправляем файл чанками
	chunkSize := state.chunkSize
	totalChunks := (state.fileSize + chunkSize - 1) / chunkSize
	state.totalChunks = totalChunks

	fmt.Printf("[GO] Отправка %d чанков по %d байт\n", totalChunks, chunkSize)

	for i := 0; i < totalChunks; i++ {
		start := i * chunkSize
		end := start + chunkSize
		if end > state.fileSize {
			end = state.fileSize
		}
		chunk := data[start:end]

		// Создаем Uint8Array в JS
		jsArray := js.Global().Get("Uint8Array").New(len(chunk))
		js.CopyBytesToJS(jsArray, chunk)

		// Отправляем чанк с информацией о прогрессе
		status := fmt.Sprintf("CHUNK:%d:%d:%d", i+1, totalChunks, state.fileSize)
		state.callback.Invoke(jsArray, js.ValueOf(status))
	}

	// Отправляем сигнал завершения
	state.callback.Invoke(js.Null(), js.ValueOf("COMPLETE"))
	fmt.Println("[GO] Экспорт завершен успешно")

	// Очищаем состояние
	state.file.Close()
	state = nil

	return nil
}

func main() {
	// Экспортируем функции в JavaScript
	js.Global().Set("goInitExport", js.FuncOf(initExport))
	js.Global().Set("goWriteRows", js.FuncOf(writeRows))
	js.Global().Set("goFinalizeExport", js.FuncOf(finalizeExport))
	js.Global().Set("goSetChunkSize", js.FuncOf(setChunkSize))
	js.Global().Set("goGetProgress", js.FuncOf(getProgress))

	fmt.Println("[GO] WASM модуль загружен и готов к работе")

	// Блокируем main, чтобы модуль не завершился
	select {}
}
