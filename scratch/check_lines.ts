import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const piCount = await prisma.packageItem.count()
  const pLinesCount = await prisma.pOLine.count()
  const sLinesCount = await prisma.salesLine.count()
  
  console.log({
    piCount,
    pLinesCount,
    sLinesCount
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
