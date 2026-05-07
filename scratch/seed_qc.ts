import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Fetching first item and user...');
        const item = await prisma.item.findFirst();
        const user = await prisma.user.findFirst({ where: { role: 'Admin' } });

        if (!item || !user) {
            console.error('No items or users found in DB. Cannot seed QC record.');
            return;
        }

        // Creating a simple CSV text and encoding it in base64
        const csvContent = "Parameter,Expected,Actual,Result\nDimensions,10mm,10.1mm,Pass\nWeight,50g,49.8g,Pass\nColor,Red,Red,Pass";
        const base64Csv = Buffer.from(csvContent).toString('base64');
        const dataUrl = `data:text/csv;base64,${base64Csv}`;

        const record = await prisma.inspectionRecord.create({
            data: {
                itemId: item.id,
                inspectorId: user.id,
                status: 'Pass',
                notes: 'Test inspection record generated for development.',
                fileName: 'test_inspection.csv',
                fileData: dataUrl
            }
        });

        console.log('Successfully created test QC record:', record.fileName);
    } catch (e) {
        console.error('Failed to create QC record:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
