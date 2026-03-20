const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const crateDir = __dirname;
const pkgDir = path.join(crateDir, 'pkg');
const jsEntry = path.join(pkgDir, 'rust_excel_streamer.js');
const wasmBinary = path.join(pkgDir, 'rust_excel_streamer_bg.wasm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadRustWasmModule(directory = pkgDir) {
  const entryFile = path.join(directory, 'rust_excel_streamer.js');
  const wasmFile = path.join(directory, 'rust_excel_streamer_bg.wasm');

  if (!fs.existsSync(entryFile) || !fs.existsSync(wasmFile)) {
    throw new Error(
      `Missing Rust WASM build artifacts. Expected ${entryFile} and ${wasmFile}. Run "bun run build:rust-wasm".`,
    );
  }

  delete require.cache[require.resolve(entryFile)];
  return require(entryFile);
}

async function validateWorkbook(bytes) {
  assert(bytes instanceof Uint8Array, 'Rust WASM export did not return a Uint8Array');
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, 'Workbook bytes do not start with PK');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));

  const worksheet = workbook.worksheets[0];
  assert(worksheet, 'Workbook is missing a worksheet');
  assert(worksheet.getCell('A1').value === 'ID', 'Unexpected header in A1');
  assert(worksheet.getCell('B1').value === 'Name', 'Unexpected header in B1');
}

async function main() {
  console.log('Checking explicit missing-artifact failure path...');
  try {
    loadRustWasmModule(path.join(crateDir, 'missing-pkg'));
    throw new Error('Missing-artifact test did not fail');
  } catch (error) {
    assert(
      error.message.includes('Missing Rust WASM build artifacts'),
      `Unexpected missing-artifact error: ${error.message}`,
    );
  }

  console.log('Loading generated Rust WASM package...');
  const wasmModule = loadRustWasmModule();
  assert(fs.existsSync(jsEntry), `Missing generated JS wrapper: ${jsEntry}`);
  assert(fs.existsSync(wasmBinary), `Missing generated WASM binary: ${wasmBinary}`);

  console.log('Validating sample workbook...');
  const sampleBytes = wasmModule.generate_sample_workbook();
  await validateWorkbook(sampleBytes);

  console.log('Validating JSON payload workbook...');
  const payloadBytes = wasmModule.generate_workbook_from_json(
    JSON.stringify({
      columns: ['ID', 'Name', 'Score'],
      rows: [
        [11, 'Dora', 98.5],
        [12, 'Evan', 91],
      ],
      sheet_name: 'Results',
    }),
  );
  await validateWorkbook(payloadBytes);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(payloadBytes));
  const worksheet = workbook.worksheets[0];
  assert(worksheet.name === 'Results', `Unexpected sheet name: ${worksheet.name}`);
  assert(worksheet.getCell('A2').value === 11, 'Unexpected value in A2');
  assert(worksheet.getCell('B2').value === 'Dora', 'Unexpected value in B2');
  assert(worksheet.getCell('C2').value === 98.5, 'Unexpected value in C2');

  console.log('Rust WASM workbook smoke test passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
