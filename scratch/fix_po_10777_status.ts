import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Database Correction Script ---');
  
  // Find PurchaseOrder 10777
  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber: '10777' }
  });

  if (!po) {
    console.log('Purchase Order 10777 not found.');
    return;
  }

  console.log(`Current status of PO 10777: ${po.status}`);

  // Update status to Partial
  const updatedPo = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: 'Partial',
      deliveredAt: null
    }
  });

  console.log(`Updated status of PO 10777 to: ${updatedPo.status}`);
  console.log('--- Correction Completed ---');
}

main()
  .catch(e => {
    console.error('Error running database correction:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
