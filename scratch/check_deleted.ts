import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const deletedItemCount = await prisma.item.count({
    where: { deletedAt: { not: null } }
  })
  
  const totalItemCount = await prisma.item.count()
  
  console.log({
    deletedItemCount,
    totalItemCount
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
