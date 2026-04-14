const cron = require('node-cron');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const emailService = require('./emailService');

// Escalation levels and who gets notified
const escalationConfig = [
  { level: 1, label: 'Supervisor',     role: 'admin' },
  { level: 2, label: 'Manager',        role: 'admin' },
  { level: 3, label: 'Director/HOD',   role: 'superadmin' },
];

let io; // Socket.IO instance — set via init()

exports.init = (socketIO) => {
  io = socketIO;
  console.log('✅ SLA Monitor initialized');
};

// ── Main SLA check ───────────────────────────────────────────────
const checkSLA = async () => {
  try {
    const now = new Date();

    // 1. Find all active tickets past their SLA deadline
    const breachedTickets = await Ticket.find({
      status: { $in: ['pending', 'assigned', 'in-progress'] },
      slaDeadline: { $lt: now },
      slaBreached: false,
    }).populate('raisedBy assignedTo', 'name email');

    for (const ticket of breachedTickets) {
      await handleEscalation(ticket);
    }

    // 2. Send SLA warnings 30 min before deadline
    const warningTime = new Date(now.getTime() + 30 * 60 * 1000);
    const warningTickets = await Ticket.find({
      status: { $in: ['pending', 'assigned', 'in-progress'] },
      slaDeadline: { $gt: now, $lte: warningTime },
      slaBreached: false,
    }).populate('assignedTo', 'name email');

    for (const ticket of warningTickets) {
      await sendWarning(ticket);
    }

  } catch (err) {
    console.error('❌ SLA check error:', err.message);
  }
};

const handleEscalation = async (ticket) => {
  const nextLevel = Math.min(ticket.escalationLevel + 1, 3);
  const escalationInfo = escalationConfig[nextLevel - 1];

  // Update ticket
  ticket.slaBreached = true;
  ticket.status = 'escalated';
  ticket.escalationLevel = nextLevel;
  ticket.lastEscalatedAt = new Date();

  const timeNow = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  ticket.timeline.push({
    status: 'Escalated',
    note: `SLA breached — auto-escalated to ${escalationInfo.label} (Level ${nextLevel})`,
    type: 'escalated-dot',
    performedByName: 'System',
    timestamp: new Date(),
  });

  await ticket.save();

  // Notify via Socket.IO (real-time)
  if (io) {
    io.emit('ticket:escalated', {
      ticketId: ticket.ticketId,
      title: ticket.title,
      level: nextLevel,
      label: escalationInfo.label,
    });
  }

  // Create in-app notification for admin
  const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true });
  const notifPromises = admins.map((admin) =>
    Notification.create({
      recipient: admin._id,
      title: `🚨 Ticket ${ticket.ticketId} auto-escalated`,
      message: `${ticket.title} — SLA breached. Escalated to ${escalationInfo.label}`,
      type: 'escalation',
      ticketId: ticket.ticketId,
      ticketRef: ticket._id,
    })
  );

  // Also notify the ticket raiser
  if (ticket.raisedBy) {
    notifPromises.push(
      Notification.create({
        recipient: ticket.raisedBy._id,
        title: `Your ticket ${ticket.ticketId} was escalated`,
        message: `${ticket.title} has been escalated due to SLA breach.`,
        type: 'escalation',
        ticketId: ticket.ticketId,
        ticketRef: ticket._id,
      })
    );
  }

  await Promise.allSettled(notifPromises);

  // Send escalation email
  try {
    await emailService.sendEscalationAlert(
      process.env.ESCALATION_EMAIL,
      ticket.ticketId,
      ticket.title,
      nextLevel,
      ticket.slaHours
    );
  } catch (e) {
    console.warn('Email not sent (configure EMAIL_* in .env):', e.message);
  }

  console.log(`🚨 Ticket ${ticket.ticketId} escalated to Level ${nextLevel}`);
};

const sendWarning = async (ticket) => {
  if (!ticket.assignedTo) return;

  const minutesLeft = Math.round((ticket.slaDeadline - Date.now()) / 1000 / 60);

  // In-app notification
  await Notification.create({
    recipient: ticket.assignedTo._id,
    title: `⚠️ SLA warning: ${ticket.ticketId}`,
    message: `${ticket.title} — ${minutesLeft} minutes until SLA breach.`,
    type: 'sla_warning',
    ticketId: ticket.ticketId,
    ticketRef: ticket._id,
  }).catch(() => {});

  if (io) {
    io.to(ticket.assignedTo._id.toString()).emit('ticket:sla_warning', {
      ticketId: ticket.ticketId,
      minutesLeft,
    });
  }

  // Email warning
  try {
    await emailService.sendSLAWarning(
      ticket.assignedTo.email,
      ticket.assignedTo.name,
      ticket.ticketId,
      ticket.title,
      minutesLeft
    );
  } catch (e) {}
};

// ── Cron schedule: run every 5 minutes ──────────────────────────
exports.start = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('⏱  SLA check running...');
    await checkSLA();
  });

  console.log('✅ SLA cron job started (every 5 min)');
};

// Run once on startup too
exports.runNow = checkSLA;
