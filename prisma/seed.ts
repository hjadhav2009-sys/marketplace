import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.upsert({
    where: { code: "sullery" },
    update: { name: "Sullery" },
    create: {
      name: "Sullery",
      code: "sullery"
    }
  });

  const passwordHash = hashPassword("demo1234");

  await prisma.user.upsert({
    where: { username: "owner" },
    update: {
      passwordHash,
      name: "Owner",
      role: "OWNER",
      active: true,
      accountId: account.id
    },
    create: {
      username: "owner",
      passwordHash,
      name: "Owner",
      role: "OWNER",
      active: true,
      accountId: account.id
    }
  });

  await prisma.user.upsert({
    where: { username: "picker" },
    update: {
      passwordHash,
      name: "Picker",
      role: "PICKER",
      active: true,
      accountId: account.id
    },
    create: {
      username: "picker",
      passwordHash,
      name: "Picker",
      role: "PICKER",
      active: true,
      accountId: account.id
    }
  });

  await prisma.user.upsert({
    where: { username: "packer" },
    update: {
      passwordHash,
      name: "Packer",
      role: "PACKER",
      active: true,
      accountId: account.id
    },
    create: {
      username: "packer",
      passwordHash,
      name: "Packer",
      role: "PACKER",
      active: true,
      accountId: account.id
    }
  });

  const owner = await prisma.user.findUniqueOrThrow({
    where: { username: "owner" }
  });

  await prisma.skuImageMapping.upsert({
    where: {
      accountId_sku: {
        accountId: account.id,
        sku: "1202919298_6"
      }
    },
    update: {
      imageUrl: "https://images-r.meesho.com/images/products/576264463/z71on.avif",
      productName: "Sports Jersey Number Personalized Pendant",
      color: "Silver"
    },
    create: {
      accountId: account.id,
      sku: "1202919298_6",
      imageUrl: "https://images-r.meesho.com/images/products/576264463/z71on.avif",
      productName: "Sports Jersey Number Personalized Pendant",
      color: "Silver"
    }
  });

  const batch = await prisma.uploadBatch.upsert({
    where: { id: "seed-sullery-batch-001" },
    update: {
      accountId: account.id,
      uploadedById: owner.id,
      filename: "meesho-labels-sample.pdf",
      status: "IMPORTED",
      notes: "Seeded sample batch for sprint-0 foundation."
    },
    create: {
      id: "seed-sullery-batch-001",
      accountId: account.id,
      uploadedById: owner.id,
      filename: "meesho-labels-sample.pdf",
      status: "IMPORTED",
      notes: "Seeded sample batch for sprint-0 foundation."
    }
  });

  await prisma.order.upsert({
    where: { awb: "1490834915493571" },
    update: {
      accountId: account.id,
      uploadBatchId: batch.id,
      courier: "Delhivery",
      sku: "1202919298_6",
      quantity: 1,
      color: "Silver",
      orderNumber: "290010756104090432_1",
      productDescription: "Sports Jersey Number Personalized Pendant",
      paymentType: "UNKNOWN",
      city: null,
      state: null,
      status: "READY"
    },
    create: {
      accountId: account.id,
      uploadBatchId: batch.id,
      awb: "1490834915493571",
      courier: "Delhivery",
      sku: "1202919298_6",
      quantity: 1,
      color: "Silver",
      orderNumber: "290010756104090432_1",
      productDescription: "Sports Jersey Number Personalized Pendant",
      paymentType: "UNKNOWN",
      status: "READY"
    }
  });

  console.log("Seed complete. Log in with owner / demo1234, picker / demo1234, or packer / demo1234.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
