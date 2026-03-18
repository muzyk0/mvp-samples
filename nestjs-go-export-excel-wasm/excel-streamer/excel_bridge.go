package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"
	"time"

	"github.com/xuri/excelize/v2"
)

type callbackChunkWriter struct {
	exportState *ExportState
}

func (w *callbackChunkWriter) Write(p []byte) (int, error) {
	s := w.exportState
	if s == nil || s.callback.IsUndefined() || s.callback.IsNull() {
		return 0, fmt.Errorf("callback is not initialized")
	}

	jsArray := js.Global().Get("Uint8Array").New(len(p))
	js.CopyBytesToJS(jsArray, p)
	s.sentBytes += len(p)
	status := fmt.Sprintf("BYTES:%d", s.sentBytes)
	s.callback.Invoke(jsArray, js.ValueOf(status))
	return len(p), nil
}

type ExportState struct {
	file              *excelize.File
	streamWriter      *excelize.StreamWriter
	currentRow        int
	sentBytes         int
	callback          js.Value
	headers           []string
	totalRows         int
	expectedTotalRows int
}

var state *ExportState

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

	f := excelize.NewFile()
	sheetName := "Sheet1"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка создания листа: "+err.Error()))
		return nil
	}

	f.SetActiveSheet(index)
	streamWriter, err := f.NewStreamWriter(sheetName)
	if err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка создания StreamWriter: "+err.Error()))
		return nil
	}

	goHeaders := make([]string, headers.Length())
	headerValues := make([]interface{}, headers.Length())
	expectedTotalRows := 0

	for i := 0; i < headers.Length(); i++ {
		header := headers.Index(i).String()
		goHeaders[i] = header
		headerValues[i] = header
	}

	if len(args) > 2 && args[2].Type() == js.TypeNumber {
		expectedTotalRows = args[2].Int()
	}

	if err := streamWriter.SetColWidth(1, len(goHeaders), 20); err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка настройки ширины столбцов: "+err.Error()))
		return nil
	}

	cell, _ := excelize.CoordinatesToCellName(1, 1)
	if err := streamWriter.SetRow(cell, headerValues); err != nil {
		callback.Invoke(js.Null(), js.ValueOf("Ошибка записи заголовков: "+err.Error()))
		return nil
	}

	state = &ExportState{
		file:              f,
		streamWriter:      streamWriter,
		currentRow:        2,
		callback:          callback,
		headers:           goHeaders,
		totalRows:         0,
		expectedTotalRows: expectedTotalRows,
	}

	callback.Invoke(js.Null(), js.ValueOf("INIT_OK"))
	return nil
}

func writeRows(this js.Value, args []js.Value) interface{} {
	if state == nil {
		return js.ValueOf("Экспорт не инициализирован. Вызовите goInitExport сначала.")
	}

	if len(args) < 1 {
		return js.ValueOf("Требуется аргумент: массив объектов в формате JSON")
	}

	jsonData := args[0].String()
	var rows []map[string]interface{}
	if err := json.Unmarshal([]byte(jsonData), &rows); err != nil {
		return js.ValueOf("Ошибка парсинга JSON (ожидается массив объектов): " + err.Error())
	}

	for _, row := range rows {
		rowValues := make([]interface{}, len(state.headers))

		for i, header := range state.headers {
			if value, exists := row[header]; exists {
				rowValues[i] = convertValueForExcel(value)
			} else {
				rowValues[i] = nil
			}
		}

		cell, _ := excelize.CoordinatesToCellName(1, state.currentRow)
		if err := state.streamWriter.SetRow(cell, rowValues); err != nil {
			return js.ValueOf("Ошибка записи строки " + fmt.Sprint(state.currentRow) + ": " + err.Error())
		}

		state.currentRow++
		state.totalRows++
	}

	totalForProgress := state.expectedTotalRows
	if totalForProgress <= 0 || totalForProgress < state.totalRows {
		totalForProgress = state.totalRows
	}

	status := fmt.Sprintf("ROW_PROGRESS:%d:%d", state.totalRows, totalForProgress)
	state.callback.Invoke(js.Null(), js.ValueOf(status))
	return nil
}

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
		if jsonStr, err := json.Marshal(v); err == nil {
			return string(jsonStr)
		}
		return fmt.Sprintf("%v", v)
	case []interface{}:
		if jsonStr, err := json.Marshal(v); err == nil {
			return string(jsonStr)
		}
		return fmt.Sprintf("%v", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func finalizeExport(this js.Value, args []js.Value) interface{} {
	if state == nil {
		return js.ValueOf("Экспорт не инициализирован")
	}

	s := state
	defer func() {
		if s != nil && s.file != nil {
			_ = s.file.Close()
		}
		if state == s {
			state = nil
		}
	}()

	if err := s.streamWriter.Flush(); err != nil {
		s.callback.Invoke(js.Null(), js.ValueOf("Ошибка завершения записи: "+err.Error()))
		return nil
	}

	writer := &callbackChunkWriter{exportState: s}
	if err := s.file.Write(writer); err != nil {
		s.callback.Invoke(js.Null(), js.ValueOf("Ошибка сохранения файла: "+err.Error()))
		return nil
	}

	if err := s.file.Close(); err != nil {
		s.callback.Invoke(js.Null(), js.ValueOf("Ошибка закрытия файла: "+err.Error()))
		return nil
	}
	s.file = nil

	s.callback.Invoke(js.Null(), js.ValueOf("COMPLETE"))
	return nil
}

func main() {
	js.Global().Set("goInitExport", js.FuncOf(initExport))
	js.Global().Set("goWriteRows", js.FuncOf(writeRows))
	js.Global().Set("goFinalizeExport", js.FuncOf(finalizeExport))
	fmt.Println("[GO] WASM модуль загружен и готов к работе")
	select {}
}
