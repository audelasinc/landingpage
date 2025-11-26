const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const prisma = new PrismaClient();
const PORT = 4000;
const SECRET = 'audelas-mvp-secret-key';

app.use(cors());
app.use(express.json());

// --- Middleware ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// --- Scoring Logic ---
const recalculateScore = async (studentId, programId) => {
  if (!programId) return;

  const [studentProfile, program, events, app] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { userId: studentId } }),
    prisma.program.findUnique({ where: { id: programId } }),
    prisma.event.findMany({ 
      where: { studentId: Number(studentId), programId: Number(programId) },
      select: { type: true }
    }),
    prisma.application.findUnique({
      where: { studentId_programId: { studentId: Number(studentId), programId: Number(programId) } }
    })
  ]);

  if (!studentProfile || !program) return;

  // 1. Engagement (Events + App Status)
  let rawEngagement = events.length * 5; 
  if (app) {
    if (app.status === 'APPLIED') rawEngagement += 20;
    if (app.status === 'ACCEPTED') rawEngagement += 50;
  }
  const engagementScore = Math.min(100, rawEngagement);

  // 2. Fit (Interest Overlap)
  const studentInterests = new Set(studentProfile.interests || []);
  const matches = program.tags.filter(tag => studentInterests.has(tag)).length;
  const fitScore = Math.min(100, (matches / 3) * 100);

  // 3. Yield Risk (100 - (Eng + Fit))
  const yieldRiskScore = 100 - Math.min(100, (engagementScore * 0.5) + (fitScore * 0.5));

  await prisma.studentProgramScore.upsert({
    where: { studentId_programId: { studentId: Number(studentId), programId: Number(programId) } },
    update: { engagementScore, fitScore, yieldRiskScore },
    create: { studentId: Number(studentId), programId: Number(programId), engagementScore, fitScore, yieldRiskScore }
  });
};

// --- Auth Routes ---
app.post('/auth/register', async (req, res) => {
  const { email, password, role, institutionName } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { 
          email, 
          passwordHash: hashedPassword, 
          role: role === 'student' ? 'STUDENT' : 'INSTITUTION_ADMIN' 
        }
      });

      if (role === 'student') {
        await tx.studentProfile.create({
          data: { userId: user.id, name: 'New Student', interests: [] }
        });
      } else if (role === 'institution_admin' && institutionName) {
        await tx.institution.create({
          data: { name: institutionName, adminUserId: user.id }
        });
      }
      return user;
    });

    const token = jwt.sign({ id: result.id, role: result.role }, SECRET);
    res.json({ user: result, token });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Email likely exists' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
  res.json({ user, token });
});

// --- Student Routes ---
app.get('/students/me/profile', authenticate, async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user.id } });
  res.json(profile);
});

app.get('/students/me/scores', authenticate, async (req, res) => {
  const scores = await prisma.studentProgramScore.findMany({
    where: { studentId: req.user.id },
    include: { program: true },
    take: 20
  });
  res.json(scores);
});

app.post('/applications', authenticate, async (req, res) => {
  const { programId } = req.body;
  try {
    const app = await prisma.application.create({
      data: { studentId: req.user.id, programId: Number(programId), status: 'APPLIED' }
    });
    // Auto-create event & rescore
    await prisma.event.create({ data: { type: 'APPLY', studentId: req.user.id, programId: Number(programId) } });
    recalculateScore(req.user.id, programId);
    res.json(app);
  } catch (e) {
    res.status(400).json({ error: 'Already exists' });
  }
});

// --- Institution Routes ---
app.get('/institutions/me', authenticate, async (req, res) => {
  const inst = await prisma.institution.findUnique({ where: { adminUserId: req.user.id } });
  res.json(inst);
});

app.get('/institutions/:id/programs', authenticate, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const programs = await prisma.program.findMany({
    where: { institutionId: Number(req.params.id) },
    skip: Number(skip),
    take: Number(limit)
  });
  res.json({ data: programs });
});

app.get('/institutions/:id/analytics/funnel', authenticate, async (req, res) => {
  const funnel = await prisma.application.groupBy({
    by: ['status'],
    where: { program: { institutionId: Number(req.params.id) } },
    _count: { status: true }
  });
  res.json(funnel);
});

app.get('/institutions/:id/high-risk-students', authenticate, async (req, res) => {
  const risks = await prisma.studentProgramScore.findMany({
    where: {
      program: { institutionId: Number(req.params.id) },
      fitScore: { gt: 70 },      // High Fit
      yieldRiskScore: { gt: 50 } // High Risk
    },
    include: { student: { include: { studentProfile: true } }, program: true },
    orderBy: { yieldRiskScore: 'desc' },
    take: 10
  });
  res.json(risks);
});

app.listen(PORT, () => {
  console.log(`Audelas Backend running on port ${PORT}`);
});