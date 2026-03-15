const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
    const response = await axios.post(`${BASE_URL}/export/benchmark`, {
        limit: Number(process.env.LIMIT || 1000),
        seed: Number(process.env.SEED || 12345),
        fileName: 'benchmark.xlsx',
        includeMemory: true,
    });

    console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error) => {
    console.error(error.response?.data || error.message);
    process.exit(1);
});
