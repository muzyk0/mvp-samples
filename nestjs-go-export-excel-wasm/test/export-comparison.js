const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
    const response = await fetch(`${BASE_URL}/export/benchmark`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            limit: Number(process.env.LIMIT || 1000),
            seed: Number(process.env.SEED || 12345),
            fileName: 'benchmark.xlsx',
            includeMemory: true,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }

    console.log(JSON.stringify(await response.json(), null, 2));
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
