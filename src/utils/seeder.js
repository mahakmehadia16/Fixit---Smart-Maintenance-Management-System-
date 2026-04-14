/**
 * FixIT Database Seeder
 * Run: node src/utils/seeder.js
 * Run: node src/utils/seeder.js --destroy  (to wipe data)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../../config/db');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');

const seed = async () => {
  await connectDB();

  if (process.argv[2] === '--destroy') {
    await Promise.all([
      User.deleteMany(),
      Ticket.deleteMany(),
      Notification.deleteMany(),
    ]);
    console.log('🗑  Database wiped successfully');
    process.exit(0);
  }

  // ── Clear existing data ──────────────────────────────────────
  await User.deleteMany();
  await Ticket.deleteMany();
  await Notification.deleteMany();
  console.log('🗑  Old data cleared');

  // ── Create Users ─────────────────────────────────────────────
  const users = await User.create([
    // Admin
    {
      name: 'Amit Sharma',
      email: 'admin@fixit.com',
      password: 'admin123',
      role: 'admin',
      department: 'Management',
      isActive: true,
    },
    // Super Admin
    {
      name: 'Priya Nair',
      email: 'superadmin@fixit.com',
      password: 'super123',
      role: 'superadmin',
      department: 'Management',
      isActive: true,
    },
    // Employees
    {
      name: 'John Doe',
      email: 'john@company.com',
      password: 'emp123',
      role: 'employee',
      department: 'General',
    },
    {
      name: 'Jane Smith',
      email: 'jane@company.com',
      password: 'emp123',
      role: 'employee',
      department: 'General',
    },
    {
      name: 'Ravi Kumar',
      email: 'ravi@company.com',
      password: 'emp123',
      role: 'employee',
      department: 'General',
    },
    // Technicians
    {
      name: 'Rahul Khatri',
      email: 'rahul@fixit.com',
      password: 'tech123',
      role: 'technician',
      department: 'IT',
      totalResolved: 47,
      avgRating: 4.6,
    },
    {
      name: 'Suresh Mehta',
      email: 'suresh@fixit.com',
      password: 'tech123',
      role: 'technician',
      department: 'Plumbing',
      totalResolved: 38,
      avgRating: 4.2,
    },
    {
      name: 'Arjun Patil',
      email: 'arjun@fixit.com',
      password: 'tech123',
      role: 'technician',
      department: 'Electrical',
      totalResolved: 52,
      avgRating: 4.8,
    },
    {
      name: 'Deepa Raj',
      email: 'deepa@fixit.com',
      password: 'tech123',
      role: 'technician',
      department: 'HVAC',
      totalResolved: 29,
      avgRating: 4.0,
    },
  ]);

  const [admin, superAdmin, john, jane, ravi, rahul, suresh, arjun, deepa] = users;
  console.log(`✅ Created ${users.length} users`);

  // ── Create Tickets ─────────────────────────────────────────────
  // Helper to make past dates
  const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
  const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  const ticketData = [
    // T-0001: In Progress
    {
      raisedBy: john._id,
      raisedByName: john.name,
      title: 'Internet not working on 2nd floor',
      description: 'All workstations on 2nd floor lost internet connectivity since morning. Affects entire team of 15 people.',
      category: 'IT',
      aiCategory: 'IT',
      aiConfidence: 92,
      priority: 'high',
      location: { building: 'Block A', floor: '2nd Floor', room: 'Open Office' },
      status: 'in-progress',
      assignedTo: rahul._id,
      assignedToName: rahul.name,
      assignedAt: hoursAgo(2),
      createdAt: hoursAgo(3),
      slaBreached: false,
      timeline: [
        { status: 'Submitted', note: `Ticket raised by ${john.name}`, type: 'done', performedByName: john.name, timestamp: hoursAgo(3) },
        { status: 'Assigned', note: `Assigned to ${rahul.name} (IT)`, type: 'done', performedByName: admin.name, timestamp: hoursAgo(2.5) },
        { status: 'In Progress', note: 'Technician on-site — checking router and switch configuration', type: 'current', performedByName: rahul.name, timestamp: hoursAgo(2) },
      ],
    },

    // T-0002: Pending
    {
      raisedBy: john._id,
      raisedByName: john.name,
      title: 'AC not cooling in Meeting Room 3B',
      description: 'Air conditioner in Meeting Room 3B is running but not cooling. Temperature feeling very warm.',
      category: 'HVAC',
      aiCategory: 'HVAC',
      aiConfidence: 88,
      priority: 'medium',
      location: { building: 'Block B', floor: '3rd Floor', room: 'Meeting Room 3B' },
      status: 'pending',
      assignedToName: 'Unassigned',
      createdAt: hoursAgo(1),
      timeline: [
        { status: 'Submitted', note: `Ticket raised by ${john.name}`, type: 'done', performedByName: john.name, timestamp: hoursAgo(1) },
      ],
    },

    // T-0003: Escalated
    {
      raisedBy: jane._id,
      raisedByName: jane.name,
      title: 'Water leakage near restroom — 3rd floor',
      description: 'Severe water leakage from ceiling near restroom on 3rd floor. Water is accumulating on the floor creating a slip hazard.',
      category: 'Plumbing',
      aiCategory: 'Plumbing',
      aiConfidence: 97,
      priority: 'high',
      location: { building: 'Block A', floor: '3rd Floor', room: 'Near Restroom' },
      status: 'escalated',
      assignedTo: suresh._id,
      assignedToName: suresh.name,
      assignedAt: hoursAgo(6),
      slaBreached: true,
      escalationLevel: 1,
      lastEscalatedAt: hoursAgo(0.5),
      createdAt: hoursAgo(8),
      timeline: [
        { status: 'Submitted', note: 'Ticket raised', type: 'done', performedByName: jane.name, timestamp: hoursAgo(8) },
        { status: 'Assigned', note: `Assigned to ${suresh.name}`, type: 'done', performedByName: admin.name, timestamp: hoursAgo(7.5) },
        { status: 'Escalated', note: 'SLA breached — auto-escalated to Supervisor (Level 1)', type: 'escalated-dot', performedByName: 'System', timestamp: hoursAgo(0.5) },
      ],
    },

    // T-0004: Resolved with feedback
    {
      raisedBy: john._id,
      raisedByName: john.name,
      title: 'Power socket not working at Desk 14',
      description: 'The power socket at desk 14 in the finance department stopped working suddenly. Cannot charge laptop.',
      category: 'Electrical',
      aiCategory: 'Electrical',
      aiConfidence: 95,
      priority: 'low',
      location: { building: 'Block C', floor: '1st Floor', room: 'Finance Dept', detail: 'Desk 14' },
      status: 'resolved',
      assignedTo: arjun._id,
      assignedToName: arjun.name,
      assignedAt: daysAgo(1),
      resolvedAt: hoursAgo(18),
      resolutionNote: 'Replaced faulty socket. Tested with multiple devices — working normally.',
      slaBreached: false,
      feedback: { rating: 4, comment: 'Fixed quickly, very professional.', submittedAt: hoursAgo(16) },
      createdAt: daysAgo(1),
      timeline: [
        { status: 'Submitted', note: 'Ticket raised', type: 'done', performedByName: john.name, timestamp: daysAgo(1) },
        { status: 'Assigned', note: `Assigned to ${arjun.name}`, type: 'done', performedByName: admin.name, timestamp: daysAgo(1) },
        { status: 'In Progress', note: 'Inspecting socket and circuit', type: 'done', performedByName: arjun.name, timestamp: hoursAgo(20) },
        { status: 'Resolved', note: 'Replaced faulty socket. Tested — working normally.', type: 'done', performedByName: arjun.name, timestamp: hoursAgo(18) },
      ],
    },

    // T-0005: Assigned
    {
      raisedBy: ravi._id,
      raisedByName: ravi.name,
      title: 'Projector not displaying in Conference Hall',
      description: 'The projector in Conference Hall B is not displaying output. Client presentation is scheduled in 2 hours.',
      category: 'IT',
      aiCategory: 'IT',
      aiConfidence: 85,
      priority: 'high',
      location: { building: 'Block B', floor: 'Ground Floor', room: 'Conference Hall B' },
      status: 'assigned',
      assignedTo: rahul._id,
      assignedToName: rahul.name,
      assignedAt: hoursAgo(0.5),
      createdAt: hoursAgo(0.75),
      timeline: [
        { status: 'Submitted', note: `Ticket raised by ${ravi.name}`, type: 'done', performedByName: ravi.name, timestamp: hoursAgo(0.75) },
        { status: 'Assigned', note: `Assigned to ${rahul.name}`, type: 'done', performedByName: admin.name, timestamp: hoursAgo(0.5) },
      ],
    },

    // T-0006: Resolved + 5 stars
    {
      raisedBy: jane._id,
      raisedByName: jane.name,
      title: 'Ceiling light flickering in HR cabin',
      description: 'The tube light in the HR Manager cabin has been flickering for 2 days. Very distracting.',
      category: 'Electrical',
      aiCategory: 'Electrical',
      aiConfidence: 90,
      priority: 'medium',
      location: { building: 'Block A', floor: '1st Floor', room: 'HR Cabin' },
      status: 'resolved',
      assignedTo: arjun._id,
      assignedToName: arjun.name,
      resolvedAt: daysAgo(2),
      resolutionNote: 'Replaced old fluorescent tube and starter. Issue resolved.',
      feedback: { rating: 5, comment: 'Super fast resolution!', submittedAt: daysAgo(2) },
      createdAt: daysAgo(3),
      timeline: [
        { status: 'Submitted', note: 'Ticket raised', type: 'done', performedByName: jane.name, timestamp: daysAgo(3) },
        { status: 'Assigned', note: `Assigned to ${arjun.name}`, type: 'done', performedByName: admin.name, timestamp: daysAgo(3) },
        { status: 'In Progress', note: 'Diagnosing flickering issue', type: 'done', performedByName: arjun.name, timestamp: daysAgo(2) },
        { status: 'Resolved', note: 'Tube and starter replaced.', type: 'done', performedByName: arjun.name, timestamp: daysAgo(2) },
      ],
    },

    // T-0007: Pending critical
    {
      raisedBy: ravi._id,
      raisedByName: ravi.name,
      title: 'Server room temperature rising — CRITICAL',
      description: 'URGENT: Server room cooling unit has failed. Temperature is at 32°C and rising. Risk of server shutdown.',
      category: 'HVAC',
      aiCategory: 'HVAC',
      aiConfidence: 94,
      priority: 'critical',
      location: { building: 'Block A', floor: 'Basement', room: 'Server Room' },
      status: 'assigned',
      assignedTo: deepa._id,
      assignedToName: deepa.name,
      assignedAt: hoursAgo(0.2),
      createdAt: hoursAgo(0.25),
      timeline: [
        { status: 'Submitted', note: `CRITICAL ticket raised by ${ravi.name}`, type: 'done', performedByName: ravi.name, timestamp: hoursAgo(0.25) },
        { status: 'Assigned', note: `Auto-assigned to ${deepa.name} (HVAC)`, type: 'done', performedByName: 'System', timestamp: hoursAgo(0.2) },
      ],
    },
  ];

  // Override createdAt (Mongoose timestamps would overwrite, so use insertMany with timestamps false)
  const tickets = [];
  for (const data of ticketData) {
    const t = new Ticket(data);
    // Manually set ticketId and sla since pre-save won't run cleanly with historical data
    const count = tickets.length;
    t.ticketId = `T-${String(count + 1).padStart(4, '0')}`;
    const slaMap = { critical: 1, high: 2, medium: 4, low: 8 };
    t.slaHours = slaMap[t.priority] || 4;
    t.slaDeadline = new Date((data.createdAt || new Date()).getTime() + t.slaHours * 60 * 60 * 1000);

    await t.save();
    tickets.push(t);
  }

  console.log(`✅ Created ${tickets.length} tickets`);

  // ── Create Notifications ────────────────────────────────────────
  await Notification.create([
    {
      recipient: john._id,
      title: 'Ticket T-0001 is In Progress',
      message: 'Rahul Khatri is working on your internet issue.',
      type: 'status_update',
      ticketId: 'T-0001',
      ticketRef: tickets[0]._id,
      read: false,
      createdAt: hoursAgo(2),
    },
    {
      recipient: john._id,
      title: 'Ticket T-0004 Resolved ✅',
      message: 'Power socket at Desk 14 has been fixed.',
      type: 'resolved',
      ticketId: 'T-0004',
      ticketRef: tickets[3]._id,
      read: true,
      createdAt: hoursAgo(18),
    },
    {
      recipient: admin._id,
      title: '🚨 Ticket T-0003 auto-escalated',
      message: 'Water leakage ticket SLA breached — escalated to Supervisor.',
      type: 'escalation',
      ticketId: 'T-0003',
      ticketRef: tickets[2]._id,
      read: false,
      createdAt: hoursAgo(0.5),
    },
    {
      recipient: rahul._id,
      title: 'New ticket assigned: T-0005',
      message: 'Projector not displaying in Conference Hall B.',
      type: 'ticket_assigned',
      ticketId: 'T-0005',
      ticketRef: tickets[4]._id,
      read: false,
      createdAt: hoursAgo(0.5),
    },
  ]);

  console.log('✅ Notifications seeded');

  console.log(`
╔══════════════════════════════════════════════════════╗
║           🌱 FixIT Database Seeded!                  ║
╠══════════════════════════════════════════════════════╣
║  DEMO LOGIN CREDENTIALS:                             ║
║  ─────────────────────────────────────────────────   ║
║  👷 Employee:  john@company.com    / emp123          ║
║  👷 Employee:  jane@company.com    / emp123          ║
║  🔧 Technician: rahul@fixit.com   / tech123          ║
║  🛡  Admin:     admin@fixit.com   / admin123          ║
║  ⭐ SuperAdmin: superadmin@fixit.com / super123       ║
╚══════════════════════════════════════════════════════╝
  `);

  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seeder error:', err);
  process.exit(1);
});
