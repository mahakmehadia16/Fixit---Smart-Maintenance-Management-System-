const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════
// GET /api/analytics/dashboard — Admin dashboard stats
// ════════════════════════════════════════════════════════════════
router.get('/dashboard', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.setHours(0, 0, 0, 0));
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalTickets,
    pendingCount,
    inProgressCount,
    resolvedCount,
    escalatedCount,
    todayCount,
    weekCount,
    slaBreachedCount,
    avgResolutionTime,
    categoryBreakdown,
    priorityBreakdown,
    techLeaderboard,
  ] = await Promise.all([
    Ticket.countDocuments(),
    Ticket.countDocuments({ status: 'pending' }),
    Ticket.countDocuments({ status: 'in-progress' }),
    Ticket.countDocuments({ status: 'resolved' }),
    Ticket.countDocuments({ status: 'escalated' }),
    Ticket.countDocuments({ createdAt: { $gte: startOfToday } }),
    Ticket.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Ticket.countDocuments({ slaBreached: true }),

    // Avg resolution time in hours
    Ticket.aggregate([
      { $match: { status: 'resolved', resolvedAt: { $exists: true } } },
      {
        $project: {
          hours: {
            $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60],
          },
        },
      },
      { $group: { _id: null, avg: { $avg: '$hours' } } },
    ]),

    // By category
    Ticket.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // By priority
    Ticket.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),

    // Top technicians
    User.find({ role: 'technician', isActive: true })
      .select('name department totalResolved avgRating activeTicketCount')
      .sort({ totalResolved: -1 })
      .limit(5),
  ]);

  // Resolution rate
  const resolutionRate = totalTickets > 0
    ? Math.round((resolvedCount / totalTickets) * 100)
    : 0;

  res.json({
    success: true,
    stats: {
      total: totalTickets,
      pending: pendingCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
      escalated: escalatedCount,
      today: todayCount,
      thisWeek: weekCount,
      slaBreached: slaBreachedCount,
      resolutionRate,
      avgResolutionHours: avgResolutionTime[0]
        ? Math.round(avgResolutionTime[0].avg * 10) / 10
        : null,
    },
    categoryBreakdown,
    priorityBreakdown,
    techLeaderboard,
  });
});

// ════════════════════════════════════════════════════════════════
// GET /api/analytics/trends — Week-by-week ticket volume
// ════════════════════════════════════════════════════════════════
router.get('/trends', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  const trend = await Ticket.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        count: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  res.json({ success: true, trend });
});

// ════════════════════════════════════════════════════════════════
// GET /api/analytics/heatmap — Ticket volume by day/hour
// ════════════════════════════════════════════════════════════════
router.get('/heatmap', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const heatmap = await Ticket.aggregate([
    {
      $group: {
        _id: {
          day: { $dayOfWeek: '$createdAt' }, // 1=Sun, 2=Mon, ... 7=Sat
          hour: { $hour: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.day': 1, '_id.hour': 1 } },
  ]);

  // Reshape into [day][hour] matrix
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const matrix = {};

  days.forEach((d) => {
    matrix[d] = {};
  });

  heatmap.forEach(({ _id, count }) => {
    const dayName = days[_id.day - 1];
    matrix[dayName][_id.hour] = count;
  });

  res.json({ success: true, heatmap: matrix, days });
});

// ════════════════════════════════════════════════════════════════
// GET /api/analytics/category-performance — SLA per category
// ════════════════════════════════════════════════════════════════
router.get('/category-performance', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const data = await Ticket.aggregate([
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } },
        slaBreached: { $sum: { $cond: ['$slaBreached', 1, 0] } },
        avgRating: { $avg: '$feedback.rating' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  res.json({ success: true, data });
});

// ════════════════════════════════════════════════════════════════
// GET /api/analytics/my-stats — Employee personal stats
// ════════════════════════════════════════════════════════════════
router.get('/my-stats', protect, async (req, res) => {
  const userId = req.user._id;

  const [total, resolved, pending, inProgress, escalated] = await Promise.all([
    Ticket.countDocuments({ raisedBy: userId }),
    Ticket.countDocuments({ raisedBy: userId, status: 'resolved' }),
    Ticket.countDocuments({ raisedBy: userId, status: 'pending' }),
    Ticket.countDocuments({ raisedBy: userId, status: 'in-progress' }),
    Ticket.countDocuments({ raisedBy: userId, status: 'escalated' }),
  ]);

  const recentTickets = await Ticket.find({ raisedBy: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('ticketId title status priority createdAt category');

  res.json({
    success: true,
    stats: { total, resolved, pending, inProgress, escalated },
    recentTickets,
  });
});

module.exports = router;
