const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// CONFIGURATION: Adjust TARGET_USERS to 3000000 for full load test
const TARGET_USERS = 5000; 
const BATCH_SIZE = 1000; 
const INSTITUTION_COUNT = 10;
const PROGRAMS_PER_INST = 5;

async function main() {
  console.log('🚀 Starting Data Generation...');

  // 1. Create Institutions & Programs
  console.log('🏛️ Seeding Institutions...');
  const passwordHash = await bcrypt.hash('password', 10);
  
  for (let i = 0; i < INSTITUTION_COUNT; i++) {
    const admin = await prisma.user.create({
      data: {
        email: `admin_${i}@edu.com`,
        passwordHash,
        role: 'INSTITUTION_ADMIN'
      }
    });

    const inst = await prisma.institution.create({
      data: {
        name: faker.company.name() + " University",
        adminUserId: admin.id
      }
    });

    // Create Programs
    const programData = Array.from({ length: PROGRAMS_PER_INST }).map(() => ({
      institutionId: inst.id,
      name: faker.person.jobArea() + " " + faker.helpers.arrayElement(['BS', 'MS', 'Certificate']),
      tags: faker.helpers.arrayElements(['Math', 'Art', 'Code', 'Bio', 'History'], 3)
    }));
    await prisma.program.createMany({ data: programData });
  }
  
  // Get all Program IDs for random assignment later
  const allPrograms = await prisma.program.findMany({ select: { id: true } });
  const programIds = allPrograms.map(p => p.id);

  console.log(`🧑‍🎓 Seeding ${TARGET_USERS} Students...`);
  
  let totalCreated = 0;

  while (totalCreated < TARGET_USERS) {
    const currentBatch = Math.min(BATCH_SIZE, TARGET_USERS - totalCreated);
    const usersData = [];
    
    // Generate Data in Memory
    for (let i = 0; i < currentBatch; i++) {
        const email = `s${totalCreated + i}_${faker.string.alphanumeric(5)}@audelas.com`;
        usersData.push({
            email,
            passwordHash,
            role: 'STUDENT',
            createdAt: new Date()
        });
    }

    // Bulk Insert Users
    await prisma.user.createMany({ data: usersData, skipDuplicates: true });
    
    // Fetch back the IDs we just created
    const createdUsers = await prisma.user.findMany({
        where: { email: { in: usersData.map(u => u.email) } },
        select: { id: true }
    });

    // Prepare Profiles
    const profiles = createdUsers.map(u => ({
        userId: u.id,
        name: faker.person.fullName(),
        interests: faker.helpers.arrayElements(['Math', 'Art', 'Code', 'Bio', 'History'], 2),
        goals: 'Graduate'
    }));

    await prisma.studentProfile.createMany({ data: profiles });

    // Generate random Applications & Events for 20% of batch
    const appsData = [];
    const eventsData = [];
    
    for (const u of createdUsers) {
        if (Math.random() > 0.8) { 
            const randomProg = faker.helpers.arrayElement(programIds);
            appsData.push({
                studentId: u.id,
                programId: randomProg,
                status: 'EXPLORING'
            });
            eventsData.push({
                studentId: u.id,
                programId: randomProg,
                type: 'VIEW',
                metadata: {}
            });
        }
    }

    if (appsData.length > 0) await prisma.application.createMany({ data: appsData, skipDuplicates: true });
    if (eventsData.length > 0) await prisma.event.createMany({ data: eventsData });

    totalCreated += currentBatch;
    process.stdout.write(`\rProgress: ${totalCreated} / ${TARGET_USERS} Users`);
  }

  console.log('\n✅ Data Generation Complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });