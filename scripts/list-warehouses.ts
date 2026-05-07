import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
prisma.warehouse.findMany({ select: { id: true, name: true } })
  .then((rows) => { console.log(JSON.stringify(rows, null, 2)); })
  .finally(() => prisma.$disconnect());
