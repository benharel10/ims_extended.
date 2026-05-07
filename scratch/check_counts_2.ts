import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const prCount = await prisma.productionRun.count()
  const siCount = await prisma.serializedItem.count()
  const shipmentCount = await prisma.shipment.count()
  const packageCount = await prisma.package.count()
  
  console.log({
    prCount,
    siCount,
    shipmentCount,
    packageCount
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
