const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = Number(process.env.TIMEOUT || 300000);

function safeParseJson(bodyText) {
  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return {
      raw: bodyText,
      parseError: true,
    };
  }
}

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/export/benchmark`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        limit: Number(process.env.LIMIT || 1000),
        seed: Number(process.env.SEED || 12345),
        fileName: 'benchmark.xlsx',
        includeMemory: true,
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    const payload = safeParseJson(bodyText);

    if (!response.ok) {
      throw new Error(
        payload
          ? JSON.stringify(payload)
          : `HTTP ${response.status}${bodyText ? `: ${bodyText}` : ''}`,
      );
    }

    if (!payload?.exceljs || !payload?.goWasm || !payload?.rustWasm) {
      throw new Error('Benchmark payload is missing one or more variant summaries');
    }

    if (!payload?.deltas?.goWasmVsExceljs || !payload?.deltas?.rustWasmVsExceljs || !payload?.deltas?.rustWasmVsGoWasm) {
      throw new Error('Benchmark payload is missing one or more delta summaries');
    }

    if (!payload?.diagnostics?.memory || !payload?.diagnostics?.executionModel) {
      throw new Error('Benchmark payload is missing diagnostics metadata');
    }

    if (
      payload.exceljs.rowCount !== payload.goWasm.rowCount ||
      payload.exceljs.rowCount !== payload.rustWasm.rowCount
    ) {
      throw new Error('Benchmark payload returned mismatched row counts across variants');
    }

    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Benchmark request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
