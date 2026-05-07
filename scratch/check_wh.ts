import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const whCount = await prisma.warehouse.count()
  const warehouses = await prisma.warehouse.findMany()
  
  console.log({
    whCount,
    warehouses
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
