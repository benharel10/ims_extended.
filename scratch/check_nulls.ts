import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const nullStock = await prisma.itemStock.count({ where: { quantity: null as any } })
  const nullPOLine = await prisma.pOLine.count({ where: { quantity: null as any } })
  const nullSalesLine = await prisma.salesLine.count({ where: { quantity: null as any } })
  
  console.log({
    nullStock,
    nullPOLine,
    nullSalesLine
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
