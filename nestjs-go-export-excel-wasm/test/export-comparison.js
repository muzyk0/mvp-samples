const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
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
  });

  const bodyText = await response.text();
  const payload = bodyText ? JSON.parse(bodyText) : null;

  if (!response.ok) {
    throw new Error(payload ? JSON.stringify(payload) : `HTTP ${response.status}`);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
