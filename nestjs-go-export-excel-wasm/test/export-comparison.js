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

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
