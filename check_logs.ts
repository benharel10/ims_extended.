
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSystemLogs() {
    console.log("--- Checking System Logs for Production ---");

    const logs = await prisma.systemLog.findMany({
        where: { entity: 'ProductionRun' },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    logs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}] Action: ${log.action} | Details: ${log.details}`);
    });
}

checkSystemLogs()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
