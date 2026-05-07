import { Client } from 'pg';

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        const res = await client.query('SELECT COUNT(*) FROM "Item"');
        console.log('Items in local DB:', res.rows[0].count);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.end();
    }
}

main();
