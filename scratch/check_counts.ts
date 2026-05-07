import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const itemCount = await prisma.item.count()
  const poCount = await prisma.purchaseOrder.count()
  const soCount = await prisma.salesOrder.count()
  const bomCount = await prisma.bOM.count()
  const stockCount = await prisma.itemStock.count()
  
  console.log({
    itemCount,
    poCount,
    soCount,
    bomCount,
    stockCount
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
