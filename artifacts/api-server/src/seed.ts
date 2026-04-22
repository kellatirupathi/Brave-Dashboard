/**
 * BRAVE platform dummy data seed.
 *
 * Idempotent: clears any prior dummy rows (identified by `@brave.seed` email
 * suffix on users / roster, and the well-known seeded campus names) and
 * reinserts the full dataset.
 *
 * Run with:  pnpm --filter @workspace/api-server seed
 */

import { inArray, like, eq } from "drizzle-orm";
import { bootstrapCanonicalCampuses } from "./bootstrap-campuses";
import {
  db,
  campusesTable,
  usersTable,
  rosterTable,
  teamsTable,
  teamMembersTable,
  projectsTable,
  orderBookEntriesTable,
  revenueEntriesTable,
  milestonesTable,
  demoDayApplicationsTable,
  notificationsTable,
  announcementsTable,
  programmeConfigTable,
  auditLogTable,
  accessRequestsTable,
} from "@workspace/db";

// ---------- Deterministic PRNG (mulberry32) ----------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RNG_SEED = 20260417;
// `rand` is intentionally re-initialized at the top of every `runSeed()` call
// (see below) so repeated reseeds in the same Node process produce the same
// canonical dataset every time, just like a fresh `tsx ./src/seed-cli.ts` run.
let rand = makeRng(RNG_SEED);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => Math.floor(rand() * (hi - lo + 1)) + lo;

// ---------- Reference data ----------
// Canonical 19 partner campuses. The seed never creates new campuses —
// it only attaches demo users/teams to whichever of these already exist
// in the DB (the bootstrap step in src/index.ts ensures all 19 exist).
const CANONICAL_CAMPUS_NAMES = [
  "AMET University",
  "Ajeenkya DY Patil University",
  "Annamacharya University",
  "Aurora Deemed University",
  "Chaitanya \u2013 Deemed to be University",
  "Chalapathi Institute of Engineering and Technology",
  "Chalapathi Institute of Technology, Autonomous",
  "Crescent University",
  "Malla Reddy Vishwavidyapeeth",
  "NIAT - Chevella",
  "NIAT - KKH",
  "NRI Institute of Technology",
  "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology",
  "Noida International University",
  "S-VYASA University",
  "Sanjay Ghodawat University",
  "Takshashila University",
  "Vivekananda Global University",
  "Yenepoya University",
];
// Use the first 6 canonical campuses for demo data so we don't create
// 19 coordinators / hundreds of demo students.
const SEED_CAMPUS_COUNT = 6;

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Rohan", "Arjun", "Krishna", "Ishaan", "Kabir",
  "Reyansh", "Aryan", "Aanya", "Diya", "Saanvi", "Myra", "Aadhya", "Ananya",
  "Pari", "Kavya", "Riya", "Anika", "Sneha", "Tanvi", "Nisha", "Pooja",
  "Rahul", "Karthik", "Vikram", "Siddharth", "Aniket", "Harsh", "Yash", "Dev",
  "Shreya", "Priya", "Meera", "Lakshmi", "Anjali", "Divya", "Neha", "Kriti",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Kumar", "Singh", "Gupta", "Iyer",
  "Nair", "Rao", "Mehta", "Shah", "Bhat", "Mishra", "Joshi", "Khanna",
  "Chowdhury", "Das", "Pillai", "Naidu",
];

const TEAM_TAGLINES = [
  "Tech for Bharat",
  "Build. Ship. Repeat.",
  "Where ideas earn revenue.",
  "From hostel rooms to real customers.",
  "Engineering for the next billion.",
  "AI-first, India-first.",
  "Helping local businesses grow online.",
  "Education that pays for itself.",
  "Quietly building. Loudly shipping.",
  "Serving SMEs since day one.",
];

const STARTUP_NAMES = [
  "TutorFlow", "KisaanKart", "BillEase", "MedSnap", "RentRoom", "FitTrack",
  "LegalLite", "HostelHub", "CampusEats", "ShopShala", "InvoIQ", "QuickKaam",
  "ScholarStack", "GymGo", "PaperPlane", "BharatBazaar", "PadhAI", "CodeCart",
  "DocuDost", "NoteNexus", "ChaiChat", "TempoTrade", "VedaVerse", "OrderOasis",
  "PixelPaani",
];

const PROJECT_TITLES = [
  "Online Tutoring Platform",
  "Local Vendor Marketplace",
  "Invoice Generator SaaS",
  "Campus Food Delivery",
  "Resume Builder",
  "Student Loan Tracker",
  "Yoga Class Booking App",
  "Language Practice Bot",
  "Hostel Mess Feedback",
  "Past Papers Library",
  "GST Filing Helper",
  "Photography Booking",
  "Coding Bootcamp",
  "Pet Care Marketplace",
  "Wedding Planner Tools",
];

const CLIENT_NAMES = [
  "ABC Coaching Center", "Green Grocer Co.", "Sunrise Diagnostics",
  "Patel Sweets", "Citywide Cabs", "Hostel A Mess", "Annapurna Caterers",
  "Vivek Tutorials", "Rao & Sons", "Lakshmi Boutique", "Kumar Pharmacy",
  "Bharat Stationery", "Spark Coaching", "Modern Cafe", "Rapid Logistics",
];

const ANNOUNCEMENTS = [
  { title: "Welcome to BRAVE 2025!", body: "The programme is live across all 6 campuses. Form your teams and start shipping." },
  { title: "Demo Day applications open", body: "Teams crossing ₹2L in verified revenue can now apply for Demo Day. Deadline: end of phase 2." },
  { title: "Phase 1 leaderboard frozen", body: "The Phase 1 standings are now frozen. Onwards to Phase 2!" },
  { title: "New: bulk roster import", body: "Coordinators can now import rosters via Excel directly from the admin console." },
];

const SEED_USER_SUFFIX = "@brave.seed";
const SEED_FORMS_PREFIX = "seed_";

// ---------- Cleanup ----------
//
// Idempotency strategy: every row we insert is provably tied to a seeded
// user. Users are tagged via the `@brave.seed` email suffix and the
// `seed_` formsUserId prefix. Campuses are then identified by having a
// coordinator_id that points to one of those seeded users. From there we
// can scope every dependent table strictly to seed-owned rows and never
// touch a real campus, team, announcement, or notification — even if a
// real campus happens to share a canonical NIAT name.
async function clearPriorSeed() {
  console.log("⏳ Clearing prior seed data…");

  // 1. Find seeded users (the universal anchor).
  const seededUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(like(usersTable.email, `%${SEED_USER_SUFFIX}`));
  const userIds = seededUsers.map((u) => u.id);

  // 2. Find seeded campuses ONLY by tracing back through their seeded
  //    coordinator. We deliberately do NOT match by canonical name — a
  //    real campus could share the name and we must never wipe it.
  const seededCampuses = userIds.length
    ? await db
        .select({ id: campusesTable.id })
        .from(campusesTable)
        .where(inArray(campusesTable.coordinatorId, userIds))
    : [];
  const campusIds = seededCampuses.map((c) => c.id);

  // 3. Seeded teams: only those owned by a seeded leader (which implies a
  //    seeded campus too, but the leader linkage is the strongest tag).
  const teamRows = userIds.length
    ? await db.select({ id: teamsTable.id }).from(teamsTable).where(inArray(teamsTable.leaderId, userIds))
    : [];
  const teamIds = teamRows.map((t) => t.id);

  // 4. Cascade-delete dependents, scoped tightly.
  if (teamIds.length) {
    await db.delete(demoDayApplicationsTable).where(inArray(demoDayApplicationsTable.teamId, teamIds));
    await db.delete(milestonesTable).where(inArray(milestonesTable.teamId, teamIds));
    await db.delete(orderBookEntriesTable).where(inArray(orderBookEntriesTable.teamId, teamIds));
    await db.delete(revenueEntriesTable).where(inArray(revenueEntriesTable.teamId, teamIds));
    await db.delete(projectsTable).where(inArray(projectsTable.teamId, teamIds));
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.teamId, teamIds));
    // Team-targeted announcements (only those that reference a seeded team)
    await db.delete(announcementsTable).where(inArray(announcementsTable.teamId, teamIds));
    await db.delete(teamsTable).where(inArray(teamsTable.id, teamIds));
  }

  if (userIds.length) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, userIds));
    await db.delete(auditLogTable).where(inArray(auditLogTable.actorId, userIds));
    // All announcements we ever inserted have a seeded author — scope by author.
    await db.delete(announcementsTable).where(inArray(announcementsTable.authorId, userIds));
    // Null out coordinator references on seeded campuses before deleting users.
    // We DO NOT delete the campuses themselves — they are the canonical 19
    // partner campuses now and must persist across re-seeds.
    for (const cid of campusIds) {
      await db.update(campusesTable).set({ coordinatorId: null }).where(eq(campusesTable.id, cid));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  // Roster & access-request cleanup is safe to scope by email suffix —
  // these tables key off email, not user id, and the suffix is unique to
  // the seed.
  await db.delete(rosterTable).where(like(rosterTable.email, `%${SEED_USER_SUFFIX}`));
  await db.delete(accessRequestsTable).where(like(accessRequestsTable.email, `%${SEED_USER_SUFFIX}`));

  console.log(`   removed ${userIds.length} users, ${teamIds.length} teams (campuses preserved)`);
}

// ---------- Seed ----------
export async function runSeed(): Promise<void> {
  // Re-seed the PRNG so every invocation (CLI or admin endpoint) produces the
  // exact same canonical dataset, regardless of how many times runSeed has
  // already executed in this process.
  rand = makeRng(RNG_SEED);

  await clearPriorSeed();

  // Make seeding self-sufficient: ensure the 19 canonical campuses exist
  // before we look them up (in case the CLI is run against a fresh DB
  // before the api-server has booted).
  await bootstrapCanonicalCampuses();

  console.log("🌱 Looking up canonical campuses for demo data…");
  const allCampuses = await db.select().from(campusesTable);
  const byName = new Map(allCampuses.map((c) => [c.name, c]));
  const campusRows = CANONICAL_CAMPUS_NAMES.slice(0, SEED_CAMPUS_COUNT).map((n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`Canonical campus missing from DB: "${n}". The bootstrap step should have created it.`);
    return c;
  });

  console.log("🌱 Seeding admins & coordinators…");
  const adminEmails = ["admin.1@brave.seed", "admin.2@brave.seed"];
  const adminRows = await db
    .insert(usersTable)
    .values(
      adminEmails.map((email, i) => ({
        email,
        formsUserId: `${SEED_FORMS_PREFIX}admin_${i + 1}`,
        firstName: i === 0 ? "Asha" : "Vikram",
        lastName: i === 0 ? "Reddy" : "Singh",
        role: "admin" as const,
        isActive: true,
      })),
    )
    .returning();

  const coordinatorRows = [];
  for (let i = 0; i < campusRows.length; i++) {
    const c = campusRows[i];
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    const [coord] = await db
      .insert(usersTable)
      .values({
        email: `coordinator.${i + 1}${SEED_USER_SUFFIX}`,
        formsUserId: `${SEED_FORMS_PREFIX}coord_${i + 1}`,
        firstName: fn,
        lastName: ln,
        role: "coordinator",
        campusId: c.id,
        isActive: true,
      })
      .returning();
    coordinatorRows.push(coord);
    await db.update(campusesTable).set({ coordinatorId: coord.id }).where(eq(campusesTable.id, c.id));
  }

  console.log("🌱 Seeding students & roster (≈120 entries / ≈80 users)…");
  // 120 roster entries; ~80 of them become real users.
  const totalRoster = 120;
  const totalStudentUsers = 80;
  const rosterEntries: { email: string; campusId: number; campusName: string; fullName: string; studentId: string }[] = [];
  for (let i = 0; i < totalRoster; i++) {
    const c = campusRows[i % campusRows.length];
    const fn = FIRST_NAMES[(i * 7) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(i * 11) % LAST_NAMES.length];
    rosterEntries.push({
      studentId: `BRAVE-${String(1000 + i).padStart(5, "0")}`,
      fullName: `${fn} ${ln}`,
      email: `student.${i + 1}${SEED_USER_SUFFIX}`,
      campusId: c.id,
      campusName: c.name,
    });
  }

  await db
    .insert(rosterTable)
    .values(
      rosterEntries.map((r, i) => ({
        studentId: r.studentId,
        fullName: r.fullName,
        email: r.email,
        campusName: r.campusName,
        campusId: r.campusId,
        niatId: `NIAT-2025-${String(2000 + i).padStart(5, "0")}`,
        batchSectionName: `Batch 2025 — Sec ${String.fromCharCode(65 + (i % 4))}`,
        isWhitelisted: true,
      })),
    );

  // Create user accounts for the first totalStudentUsers roster entries
  const studentUsers = await db
    .insert(usersTable)
    .values(
      rosterEntries.slice(0, totalStudentUsers).map((r, i) => {
        const [fn, ...rest] = r.fullName.split(" ");
        return {
          email: r.email,
          formsUserId: `${SEED_FORMS_PREFIX}stu_${i + 1}`,
          firstName: fn,
          lastName: rest.join(" "),
          role: "student" as const,
          campusId: r.campusId,
          isActive: true,
        };
      }),
    )
    .returning();

  // Group students by campus
  const studentsByCampus = new Map<number, typeof studentUsers>();
  for (const u of studentUsers) {
    const arr = studentsByCampus.get(u.campusId!) ?? [];
    arr.push(u);
    studentsByCampus.set(u.campusId!, arr);
  }

  console.log("🌱 Seeding teams (~25)…");
  // Pre-plan exactly 25 team slots with the required status mix. Active
  // teams get 3-5 members; non-active teams need only a leader + 0-1
  // co-founders so the student pool is never exhausted before we hit the
  // mixed-state slots.
  type Slot = {
    status: "active" | "pending" | "changes_requested" | "rejected";
    minSize: number;
    maxSize: number;
  };
  const slots: Slot[] = [
    ...Array.from({ length: 18 }, () => ({ status: "active" as const, minSize: 3, maxSize: 5 })),
    ...Array.from({ length: 4 }, () => ({ status: "pending" as const, minSize: 1, maxSize: 2 })),
    ...Array.from({ length: 2 }, () => ({ status: "changes_requested" as const, minSize: 1, maxSize: 2 })),
    { status: "rejected" as const, minSize: 1, maxSize: 1 },
  ];

  const teams: { id: number; campusId: number; name: string; leaderId: string; memberIds: string[]; status: string; isFeatured: boolean; }[] = [];
  const usedStudentIds = new Set<string>();
  // Round-robin pointer per campus for fair distribution.
  const campusOrder = campusRows.map((c) => c.id);
  let campusCursor = 0;

  function takeFromCampus(campusId: number, count: number) {
    const cohort = (studentsByCampus.get(campusId) ?? []).filter((s) => !usedStudentIds.has(s.id));
    return cohort.slice(0, count);
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    // Try each campus starting at the cursor; pick the first one with enough
    // free students for the slot's minimum size.
    let chosenCampusId: number | null = null;
    for (let off = 0; off < campusOrder.length; off++) {
      const candidateId = campusOrder[(campusCursor + off) % campusOrder.length];
      const free = (studentsByCampus.get(candidateId) ?? []).filter((s) => !usedStudentIds.has(s.id)).length;
      if (free >= slot.minSize) {
        chosenCampusId = candidateId;
        campusCursor = (campusCursor + off + 1) % campusOrder.length;
        break;
      }
    }
    if (chosenCampusId === null) {
      // Genuinely out of students across every campus — abort cleanly.
      console.warn(`   ⚠ exhausted student pool at slot ${i + 1}/${slots.length}; only ${teams.length} teams created.`);
      break;
    }

    const campus = campusRows.find((c) => c.id === chosenCampusId)!;
    const desiredSize = between(slot.minSize, slot.maxSize);
    const members = takeFromCampus(chosenCampusId, desiredSize);
    members.forEach((m) => usedStudentIds.add(m.id));
    const leader = members[0];
    const isFeatured = slot.status === "active" && teams.filter((t) => t.isFeatured).length < 3;
    const startupName = STARTUP_NAMES[i % STARTUP_NAMES.length];

    // Deterministic but varied placeholder team photos (DiceBear "shapes"
     // avatar — public, no auth, stable per team name).
    const photoSeed = encodeURIComponent(`${startupName}-${campus.city}`);
    const photoUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${photoSeed}&backgroundColor=4f46e5,7c3aed,06b6d4,10b981,f59e0b,ef4444`;

    const [team] = await db
      .insert(teamsTable)
      .values({
        name: `${startupName} (${campus.city})`,
        campusId: chosenCampusId,
        leaderId: leader.id,
        status: slot.status,
        tagline: TEAM_TAGLINES[i % TEAM_TAGLINES.length],
        photoUrl,
        inviteCode: `BRAVE-${String(10000 + i).slice(1)}`,
        isFeatured,
        isHidden: false,
        coordinatorComment: slot.status === "changes_requested" ? "Please clarify your founding team's roles." : null,
        rejectionReason: slot.status === "rejected" ? "Duplicate team — already registered under a different name." : null,
      })
      .returning();

    if (slot.status !== "rejected") {
      await db.insert(teamMembersTable).values(
        members.map((m) => ({
          teamId: team.id,
          userId: m.id,
          memberRole: m.id === leader.id ? "Leader" : pick(["Engineer", "Designer", "Sales", "Ops"]),
        })),
      );
    } else {
      // Rejected teams hold no members — release them back into the pool.
      members.forEach((m) => usedStudentIds.delete(m.id));
    }

    teams.push({
      id: team.id,
      campusId: team.campusId,
      name: team.name,
      leaderId: team.leaderId,
      memberIds: slot.status !== "rejected" ? members.map((m) => m.id) : [],
      status: slot.status,
      isFeatured,
    });
  }

  const statusCounts = teams.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`   created ${teams.length} teams: ${JSON.stringify(statusCounts)}`);

  console.log("🌱 Seeding projects (~40), order book (~150), revenue (~120)…");
  const activeTeams = teams.filter((t) => t.status === "active");
  const projects: { id: number; teamId: number; title: string }[] = [];
  for (let i = 0; i < activeTeams.length; i++) {
    const t = activeTeams[i];
    // Each active team gets 1-3 projects
    const numProjects = between(1, 3);
    for (let p = 0; p < numProjects; p++) {
      const title = PROJECT_TITLES[(i * 3 + p) % PROJECT_TITLES.length];
      const [proj] = await db
        .insert(projectsTable)
        .values({
          teamId: t.id,
          title,
          description: `${title} built by team ${t.name}. Targeting local customers in pilot phase.`,
          status: p === numProjects - 1 && rand() < 0.15 ? "inactive" : "active",
          createdBy: t.leaderId,
        })
        .returning();
      projects.push({ id: proj.id, teamId: t.id, title: proj.title });
    }
  }

  // Order book entries (~150) + Revenue entries (~120)
  const ORDER_BOOK_TARGET = 150;
  const REVENUE_TARGET = 120;

  const obStatuses: ("draft" | "submitted" | "verified" | "rejected")[] = [];
  for (let i = 0; i < ORDER_BOOK_TARGET; i++) {
    const r = rand();
    obStatuses.push("verified");
    void r;
  }
  for (let i = 0; i < ORDER_BOOK_TARGET; i++) {
    if (projects.length === 0) break;
    const proj = projects[i % projects.length];
    const status = obStatuses[i];
    const amount = [5000, 8000, 12000, 15000, 20000, 25000, 35000, 50000, 75000, 100000][between(0, 9)];
    const verifiedAmount = status === "verified" ? amount : null;
    await db.insert(orderBookEntriesTable).values({
      projectId: proj.id, teamId: proj.teamId,
      clientName: CLIENT_NAMES[i % CLIENT_NAMES.length],
      amount, verifiedAmount, status,
      supportingDocUrl: status !== "draft" ? "https://example.com/po.pdf" : null,
      notes: status === "rejected" ? null : "Order placed via referral.",
      adminNotes: status === "rejected" ? "Need a signed PO copy, not a screenshot." : status === "verified" ? "Verified against PO." : null,
      enteredBy: "student",
      submittedAt: status !== "draft" ? new Date(Date.now() - between(1, 25) * 24 * 60 * 60 * 1000) : null,
      verifiedAt: status === "verified" ? new Date(Date.now() - between(0, 20) * 24 * 60 * 60 * 1000) : null,
    });
  }

  const revStatuses: ("draft" | "submitted" | "verified" | "rejected")[] = [];
  for (let i = 0; i < REVENUE_TARGET; i++) {
    const r = rand();
    revStatuses.push(r < 0.65 ? "verified" : r < 0.85 ? "submitted" : r < 0.95 ? "draft" : "rejected");
  }
  // Boost some teams above the 2L demo-day threshold by skewing larger amounts to first ~5 active teams
  for (let i = 0; i < REVENUE_TARGET; i++) {
    if (projects.length === 0) break;
    const teamPick = i < 30 ? activeTeams[i % Math.min(5, activeTeams.length)] : null;
    const proj = teamPick
      ? projects.find((p) => p.teamId === teamPick.id) ?? projects[i % projects.length]
      : projects[i % projects.length];
    const status = revStatuses[i];
    const baseAmounts = teamPick ? [25000, 35000, 50000, 75000, 100000, 125000] : [3000, 5000, 8000, 12000, 18000, 25000, 40000];
    const amount = baseAmounts[between(0, baseAmounts.length - 1)];
    const verifiedAmount = status === "verified" ? amount : null;
    const daysAgo = between(1, 60);
    const dateStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await db.insert(revenueEntriesTable).values({
      projectId: proj.id, teamId: proj.teamId,
      clientName: CLIENT_NAMES[i % CLIENT_NAMES.length],
      amount, verifiedAmount, status,
      paymentDate: dateStr,
      paymentProofUrl: status !== "draft" ? "https://example.com/proof.pdf" : null,
      invoiceUrl: status !== "draft" ? "https://example.com/invoice.pdf" : null,
      testimonialUrl: status === "verified" && rand() < 0.3 ? "https://example.com/testimonial.png" : null,
      adminNotes: status === "rejected" ? "Payment proof unreadable." : status === "verified" ? "Cross-checked with bank statement." : null,
      enteredBy: "student",
      submittedAt: status !== "draft" ? new Date(Date.now() - between(1, daysAgo) * 24 * 60 * 60 * 1000) : null,
      verifiedAt: status === "verified" ? new Date(Date.now() - between(0, daysAgo) * 24 * 60 * 60 * 1000) : null,
    });
  }

  console.log("🌱 Seeding milestones (auto + manual)…");
  for (const t of activeTeams) {
    await db.insert(milestonesTable).values([
      { teamId: t.id, type: "auto", title: "Team Registered", description: "Team approved and is now active.", date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      { teamId: t.id, type: "auto", title: "First Project Created", description: "First project created.", date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) },
      { teamId: t.id, type: "manual", title: "Pitched at college fest", description: "Got 12 leads at the campus tech fest.", date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), isPinned: true },
    ]);
  }

  console.log("🌱 Seeding demo day applications…");
  // Apply for top 10 active teams
  const topTeams = activeTeams.slice(0, 10);
  for (let i = 0; i < topTeams.length; i++) {
    const t = topTeams[i];
    const status: "draft" | "submitted" | "shortlisted" | "rejected" =
      i < 2 ? "shortlisted" : i < 7 ? "submitted" : i < 9 ? "draft" : "rejected";
    await db.insert(demoDayApplicationsTable).values({
      teamId: t.id,
      demoUrl: status === "draft" ? null : `https://demo.brave.in/${t.id}`,
      pitchDeckUrl: status === "draft" ? null : `https://decks.brave.in/${t.id}.pdf`,
      growthPlan: status === "draft" ? null : "Plan: scale to 3 cities by Q3, hire 2 sales associates.",
      status,
      timeSlot: status === "shortlisted" ? `2026-05-1${i + 1} 10:${i}0 IST` : null,
      presentationOrder: status === "shortlisted" ? i + 1 : null,
      submittedAt: status === "draft" ? null : new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
  }

  console.log("🌱 Seeding announcements & notifications…");
  const admin = adminRows[0];
  await db.insert(announcementsTable).values(
    ANNOUNCEMENTS.map((a) => ({
      authorId: admin.id, target: "all" as const, title: a.title, body: a.body,
    })),
  );
  // One per-campus announcement from each coordinator
  for (const coord of coordinatorRows) {
    await db.insert(announcementsTable).values({
      authorId: coord.id,
      target: "campus" as const,
      campusId: coord.campusId!,
      title: "Campus check-in this Friday",
      body: "Reminder: campus-wide BRAVE check-in this Friday at 5pm in the auditorium.",
    });
  }

  // Notifications: a few for every user with a team
  for (const t of activeTeams.slice(0, 10)) {
    for (const memberId of t.memberIds) {
      await db.insert(notificationsTable).values([
        { userId: memberId, title: "Welcome to BRAVE!", body: "Your team is now active. Start logging orders and revenue.", type: "general", link: "/" },
        { userId: memberId, title: "Revenue Verified", body: "₹15,000 from ABC Coaching Center has been verified.", type: "entry_verified", link: "/projects" },
      ]);
    }
  }

  console.log("🌱 Seeding programme config…");
  const existingConfig = await db.select().from(programmeConfigTable).limit(1);
  const cfg = {
    startDate: "2026-04-01",
    endDate: "2026-07-31",
    demoDayDate: "2026-08-15",
    demoEligibilityThreshold: 200000,
    leaderboardFrozen: false,
    demoDayApplicationsOpen: true,
    demoDayApplicationDeadline: "2026-07-15",
    programmePhase: "Phase 2 - Build & Sell",
  };
  if (existingConfig.length === 0) {
    await db.insert(programmeConfigTable).values(cfg);
  } else {
    await db.update(programmeConfigTable).set(cfg).where(eq(programmeConfigTable.id, existingConfig[0].id));
  }

  console.log("🌱 Seeding a few audit log entries…");
  await db.insert(auditLogTable).values([
    { actorId: admin.id, action: "seed_run", targetType: "system", details: "Dummy data seed completed." },
    { actorId: admin.id, action: "update_programme_config", targetType: "programme_config", details: "Threshold set to ₹2L." },
  ]);

  // ---------- Print dev login URLs ----------
  console.log("\n✅ Seed complete.\n");
  console.log("Dev login URLs (NODE_ENV must NOT be production):");
  console.log(`  Admin:       /api/auth/dev-login?email=${adminRows[0].email}&returnTo=/admin`);
  for (let i = 0; i < coordinatorRows.length; i++) {
    console.log(`  Coordinator: /api/auth/dev-login?email=${coordinatorRows[i].email}&returnTo=/coordinator   (${campusRows[i].name})`);
  }
  // Find a student leader and a team-less student
  const teamLeader = teams.find((t) => t.status === "active");
  if (teamLeader) {
    const [leaderUser] = await db.select().from(usersTable).where(eq(usersTable.id, teamLeader.leaderId));
    if (leaderUser) console.log(`  Student (team leader): /api/auth/dev-login?email=${leaderUser.email}&returnTo=/`);
  }
  const teamlessStudent = studentUsers.find((s) => !usedStudentIds.has(s.id));
  if (teamlessStudent) {
    console.log(`  Student (no team):     /api/auth/dev-login?email=${teamlessStudent.email}&returnTo=/get-started`);
  }
  console.log("");
}

// Note: this module is intentionally side-effect free. The CLI entry point
// lives in `seed-cli.ts` so importing `runSeed` from the admin route never
// triggers a seed at module load time.
