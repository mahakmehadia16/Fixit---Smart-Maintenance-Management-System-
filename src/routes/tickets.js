const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { uploadTicketPhotos, uploadResolutionPhotos } = require('../middleware/upload');
const { classify, suggestAssignee } = require('../services/aiClassifier');
const emailService = require('../services/emailService');

// ════════════════════════════════════════════════════════════════
// GET /api/tickets — List tickets with filters & pagination
// ════════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
  const {
    status, priority, category, assignedTo,
    search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc',
    mine,
  } = req.query;

  const filter = {};

  // Employees only see their own tickets
  if (req.user.role === 'employee' || mine === 'true') {
    filter.raisedBy = req.user._id;
  }

  // Technicians see assigned tickets
  if (req.user.role === 'technician') {
    filter.assignedTo = req.user._id;
  }

  if (status && status !== 'all') filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { ticketId: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortOrder = order === 'asc' ? 1 : -1;

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(Number(limit))
      .populate('raisedBy', 'name email')
      .populate('assignedTo', 'name department'),
    Ticket.countDocuments(filter),
  ]);

  res.json({
    success: true,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    tickets,
  });
});

// ════════════════════════════════════════════════════════════════
// GET /api/tickets/:id — Single ticket detail
// ════════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
  const ticket = await Ticket.findOne({ ticketId: req.params.id })
    .populate('raisedBy', 'name email')
    .populate('assignedTo', 'name email department');

  if (!ticket) {
    return res.status(404).json({ success: false, message: 'Ticket not found' });
  }

  // Access control: employees only see own tickets
  if (
    req.user.role === 'employee' &&
    ticket.raisedBy._id.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  res.json({ success: true, ticket });
});

// ════════════════════════════════════════════════════════════════
// POST /api/tickets — Create new ticket
// ════════════════════════════════════════════════════════════════
router.post('/', protect, uploadTicketPhotos, async (req, res) => {
  const {
    title, description, category: userCategory,
    priority: userPriority, location,
    building, floor, room, locationDetail,
    autoAssign,
  } = req.body;

  // ── AI Classification ────────────────────────────────────────
  const aiResult = classify(title, description);

  // Use user-provided values if given, else AI suggestions
  const finalCategory = userCategory || aiResult.category;
  const finalPriority = userPriority || aiResult.priority;

  // ── Build photos array ───────────────────────────────────────
  const photos = (req.files || []).map((file) => ({
    url: file.path,
    publicId: file.filename,
  }));

  // ── Create ticket ────────────────────────────────────────────
  const ticketData = {
    raisedBy: req.user._id,
    raisedByName: req.user.name,
    title,
    description,
    category: finalCategory,
    aiCategory: aiResult.category,
    aiConfidence: aiResult.confidence,
    keywords: aiResult.keywords,
    priority: finalPriority,
    aiPriority: aiResult.priority,
    location: { building, floor, room, detail: locationDetail },
    photos,
  };

  const ticket = await Ticket.create(ticketData);

  // ── Auto-assign if requested or priority is critical ──────────
  if (autoAssign === 'true' || finalPriority === 'critical') {
    const tech = await suggestAssignee(finalCategory);
    if (tech) {
      ticket.assignedTo = tech._id;
      ticket.assignedToName = tech.name;
      ticket.assignedAt = new Date();
      ticket.status = 'assigned';
      ticket.timeline.push({
        status: 'Assigned',
        note: `Auto-assigned to ${tech.name} (${tech.department})`,
        type: 'done',
        performedByName: 'System',
      });
      await ticket.save();

      // Update technician workload
      await User.findByIdAndUpdate(tech._id, { $inc: { activeTicketCount: 1 } });

      // Notify technician
      await Notification.create({
        recipient: tech._id,
        title: `New ticket assigned: ${ticket.ticketId}`,
        message: ticket.title,
        type: 'ticket_assigned',
        ticketId: ticket.ticketId,
        ticketRef: ticket._id,
      });

      // Email technician
      emailService.sendAssignmentNotification(
        tech.email, tech.name, ticket.ticketId, ticket.title,
        `${building || ''} ${floor || ''} ${room || ''}`.trim()
      ).catch(() => {});
    }
  }

  // ── Notify admins of new ticket ──────────────────────────────
  const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }, '_id');
  await Notification.insertMany(admins.map((a) => ({
    recipient: a._id,
    title: `New ticket: ${ticket.ticketId}`,
    message: `${ticket.title} — ${finalCategory} | ${finalPriority.toUpperCase()}`,
    type: 'ticket_created',
    ticketId: ticket.ticketId,
    ticketRef: ticket._id,
  })));

  // ── Confirm email to user ─────────────────────────────────────
  emailService.sendTicketConfirmation(
    req.user.email, req.user.name, ticket.ticketId,
    ticket.title, finalCategory, finalPriority
  ).catch(() => {});

  // ── Emit real-time event ─────────────────────────────────────
  const io = req.app.get('io');
  if (io) io.emit('ticket:new', { ticketId: ticket.ticketId, title: ticket.title });

  res.status(201).json({
    success: true,
    ticket,
    ai: {
      suggestedCategory: aiResult.category,
      suggestedPriority: aiResult.priority,
      confidence: aiResult.confidence,
      keywords: aiResult.keywords,
    },
  });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/tickets/:id/status — Update ticket status
// ════════════════════════════════════════════════════════════════
router.put('/:id/status', protect, authorize('admin', 'superadmin', 'technician'), async (req, res) => {
  const { status, note } = req.body;
  const validStatuses = ['pending', 'assigned', 'in-progress', 'resolved', 'escalated', 'closed', 'rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const ticket = await Ticket.findOne({ ticketId: req.params.id });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  // Technicians can only update their own assigned tickets
  if (
    req.user.role === 'technician' &&
    (!ticket.assignedTo || ticket.assignedTo.toString() !== req.user._id.toString())
  ) {
    return res.status(403).json({ success: false, message: 'You can only update your assigned tickets' });
  }

  const typeMap = {
    resolved: 'done', 'in-progress': 'current', escalated: 'escalated-dot',
    closed: 'done', rejected: 'done', assigned: 'done', pending: 'pending-dot',
  };

  ticket.status = status;
  ticket.timeline.push({
    status: status.charAt(0).toUpperCase() + status.slice(1),
    note: note || `Status updated by ${req.user.name}`,
    type: typeMap[status] || 'current',
    performedBy: req.user._id,
    performedByName: req.user.name,
    timestamp: new Date(),
  });

  await ticket.save();

  // Notify ticket raiser
  await Notification.create({
    recipient: ticket.raisedBy,
    title: `Ticket ${ticket.ticketId} status updated`,
    message: `Status changed to: ${status.toUpperCase()}`,
    type: 'status_update',
    ticketId: ticket.ticketId,
    ticketRef: ticket._id,
  });

  const io = req.app.get('io');
  if (io) io.emit('ticket:updated', { ticketId: ticket.ticketId, status });

  res.json({ success: true, ticket });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/tickets/:id/assign — Assign ticket to technician
// ════════════════════════════════════════════════════════════════
router.put('/:id/assign', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const { technicianId } = req.body;

  const [ticket, tech] = await Promise.all([
    Ticket.findOne({ ticketId: req.params.id }),
    User.findById(technicianId),
  ]);

  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  if (!tech || tech.role !== 'technician') {
    return res.status(400).json({ success: false, message: 'Invalid technician' });
  }

  // Decrement previous assignee's count
  if (ticket.assignedTo) {
    await User.findByIdAndUpdate(ticket.assignedTo, { $inc: { activeTicketCount: -1 } });
  }

  ticket.assignedTo = tech._id;
  ticket.assignedToName = tech.name;
  ticket.assignedAt = new Date();
  ticket.status = 'assigned';
  ticket.timeline.push({
    status: 'Assigned',
    note: `Assigned to ${tech.name} by ${req.user.name}`,
    type: 'done',
    performedBy: req.user._id,
    performedByName: req.user.name,
  });

  await ticket.save();
  await User.findByIdAndUpdate(tech._id, { $inc: { activeTicketCount: 1 } });

  // Notify technician
  await Notification.create({
    recipient: tech._id,
    title: `New ticket: ${ticket.ticketId}`,
    message: ticket.title,
    type: 'ticket_assigned',
    ticketId: ticket.ticketId,
    ticketRef: ticket._id,
  });

  emailService.sendAssignmentNotification(
    tech.email, tech.name, ticket.ticketId, ticket.title,
    Object.values(ticket.location || {}).filter(Boolean).join(', ')
  ).catch(() => {});

  res.json({ success: true, ticket });
});

// ════════════════════════════════════════════════════════════════
// PUT /api/tickets/:id/resolve — Mark resolved + upload proof
// ════════════════════════════════════════════════════════════════
router.put('/:id/resolve', protect, authorize('admin', 'superadmin', 'technician'),
  uploadResolutionPhotos, async (req, res) => {
    const { resolutionNote } = req.body;

    const ticket = await Ticket.findOne({ ticketId: req.params.id })
      .populate('raisedBy', 'name email');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const resolutionPhotos = (req.files || []).map((f) => ({
      url: f.path,
      publicId: f.filename,
    }));

    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    ticket.resolutionNote = resolutionNote;
    if (resolutionPhotos.length) ticket.resolutionPhotos = resolutionPhotos;

    ticket.timeline.push({
      status: 'Resolved',
      note: resolutionNote || 'Issue resolved by technician',
      type: 'done',
      performedBy: req.user._id,
      performedByName: req.user.name,
    });

    await ticket.save();

    // Update technician stats
    if (ticket.assignedTo) {
      await User.findByIdAndUpdate(ticket.assignedTo, {
        $inc: { activeTicketCount: -1, totalResolved: 1 },
      });
    }

    // Notify raiser
    await Notification.create({
      recipient: ticket.raisedBy._id,
      title: `✅ Ticket ${ticket.ticketId} resolved`,
      message: `${ticket.title} — ${resolutionNote || 'Issue fixed.'}`,
      type: 'resolved',
      ticketId: ticket.ticketId,
      ticketRef: ticket._id,
    });

    // Email resolution + feedback request
    emailService.sendResolutionNotification(
      ticket.raisedBy.email, ticket.raisedBy.name,
      ticket.ticketId, ticket.title, resolutionNote
    ).catch(() => {});

    const io = req.app.get('io');
    if (io) io.emit('ticket:resolved', { ticketId: ticket.ticketId });

    res.json({ success: true, ticket });
  });

// ════════════════════════════════════════════════════════════════
// POST /api/tickets/:id/feedback — Submit rating
// ════════════════════════════════════════════════════════════════
router.post('/:id/feedback', protect, async (req, res) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  const ticket = await Ticket.findOne({ ticketId: req.params.id });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  if (ticket.raisedBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Only the ticket raiser can submit feedback' });
  }

  if (ticket.status !== 'resolved') {
    return res.status(400).json({ success: false, message: 'Feedback can only be submitted for resolved tickets' });
  }

  ticket.feedback = { rating, comment, submittedAt: new Date() };
  await ticket.save();

  // Update technician avg rating
  if (ticket.assignedTo) {
    const techTickets = await Ticket.find({
      assignedTo: ticket.assignedTo,
      'feedback.rating': { $exists: true },
    });
    const avgRating = techTickets.reduce((sum, t) => sum + t.feedback.rating, 0) / techTickets.length;
    await User.findByIdAndUpdate(ticket.assignedTo, {
      avgRating: Math.round(avgRating * 10) / 10,
    });
  }

  res.json({ success: true, message: 'Feedback submitted', ticket });
});

// ════════════════════════════════════════════════════════════════
// POST /api/tickets/ai-classify — Pre-classify before submission
// ════════════════════════════════════════════════════════════════
router.post('/ai-classify', protect, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

  const result = classify(title, description || '');
  res.json({ success: true, ...result });
});

// ════════════════════════════════════════════════════════════════
// DELETE /api/tickets/:id — Admin only
// ════════════════════════════════════════════════════════════════
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const ticket = await Ticket.findOneAndDelete({ ticketId: req.params.id });
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  res.json({ success: true, message: `Ticket ${ticket.ticketId} deleted` });
});

module.exports = router;
