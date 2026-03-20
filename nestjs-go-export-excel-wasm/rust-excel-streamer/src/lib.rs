use std::{convert::TryFrom, io::Cursor};

use rust_xlsxwriter::{Format, Workbook, Worksheet, XlsxError};
use serde::Deserialize;
use serde_json::Value as JsonValue;
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
struct WorkbookPayload {
    columns: Vec<String>,
    rows: Vec<Vec<JsonValue>>,
    sheet_name: Option<String>,
}

#[wasm_bindgen]
pub fn generate_sample_workbook() -> Result<Vec<u8>, JsValue> {
    let payload = WorkbookPayload {
        columns: vec!["ID".into(), "Name".into(), "Active".into()],
        rows: vec![
            vec![JsonValue::from(1), JsonValue::from("Alice"), JsonValue::from(true)],
            vec![JsonValue::from(2), JsonValue::from("Bob"), JsonValue::from(false)],
            vec![JsonValue::from(3), JsonValue::from("Cara"), JsonValue::from(true)],
        ],
        sheet_name: Some("Employees".into()),
    };

    build_workbook(payload).map_err(to_js_error)
}

#[wasm_bindgen]
pub fn generate_workbook_from_json(payload_json: &str) -> Result<Vec<u8>, JsValue> {
    let payload: WorkbookPayload = serde_json::from_str(payload_json)
        .map_err(|error| JsValue::from_str(&format!("invalid workbook payload: {error}")))?;

    build_workbook(payload).map_err(to_js_error)
}

fn build_workbook(payload: WorkbookPayload) -> Result<Vec<u8>, XlsxError> {
    let WorkbookPayload {
        columns,
        rows,
        sheet_name,
    } = payload;

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    if let Some(sheet_name) = sheet_name {
        worksheet.set_name(&sheet_name)?;
    }

    write_headers(worksheet, &columns)?;
    write_rows(worksheet, &columns, &rows)?;

    // rust_xlsxwriter exposes a writer-based finalize path, but in this WASM
    // bridge we still need a full in-memory buffer before handing bytes back to
    // Node through wasm-bindgen.
    let mut cursor = Cursor::new(Vec::new());
    workbook.save_to_writer(&mut cursor)?;

    Ok(cursor.into_inner())
}

fn write_headers(worksheet: &mut Worksheet, columns: &[String]) -> Result<(), XlsxError> {
    for (column_index, column_name) in columns.iter().enumerate() {
        let worksheet_column = to_worksheet_column(column_index)?;
        worksheet.write_string(0, worksheet_column, column_name)?;
    }

    Ok(())
}

fn write_rows(
    worksheet: &mut Worksheet,
    columns: &[String],
    rows: &[Vec<JsonValue>],
) -> Result<(), XlsxError> {
    for (row_index, row) in rows.iter().enumerate() {
        let worksheet_row = (row_index + 1) as u32;

        for (column_index, _) in columns.iter().enumerate() {
            let worksheet_column = to_worksheet_column(column_index)?;
            let cell_value = row.get(column_index).unwrap_or(&JsonValue::Null);
            write_cell(worksheet, worksheet_row, worksheet_column, cell_value)?;
        }
    }

    Ok(())
}

fn write_cell(
    worksheet: &mut Worksheet,
    row_index: u32,
    column_index: u16,
    value: &JsonValue,
) -> Result<(), XlsxError> {
    match value {
        JsonValue::Null => {
            worksheet.write_blank(row_index, column_index, &Format::default())?;
        }
        JsonValue::Bool(boolean) => {
            worksheet.write_boolean(row_index, column_index, *boolean)?;
        }
        JsonValue::Number(number) => {
            if let Some(float) = number.as_f64() {
                worksheet.write_number(row_index, column_index, float)?;
            } else {
                worksheet.write_string(row_index, column_index, &number.to_string())?;
            }
        }
        JsonValue::String(text) => {
            worksheet.write_string(row_index, column_index, text)?;
        }
        JsonValue::Array(_) | JsonValue::Object(_) => {
            worksheet.write_string(row_index, column_index, &value.to_string())?;
        }
    }

    Ok(())
}

fn to_worksheet_column(column_index: usize) -> Result<u16, XlsxError> {
    u16::try_from(column_index)
        .map_err(|_| XlsxError::ParameterError("column index exceeds u16 range".into()))
}

fn to_js_error(error: XlsxError) -> JsValue {
    JsValue::from_str(&format!("failed to generate workbook: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_zip_signature() {
        let bytes = generate_sample_workbook().expect("sample workbook should generate");
        assert_eq!(&bytes[0..2], b"PK");
    }
}
