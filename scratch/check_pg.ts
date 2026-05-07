import { Client } from 'pg';

async function main() {
    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_ndIuzHe3pfi6@ep-curly-river-ai2v9888-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
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
