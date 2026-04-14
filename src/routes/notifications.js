const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// GET /api/notifications — User's notifications
router.get('/', protect, async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const filter = { recipient: req.user._id };
  if (unreadOnly === 'true') filter.read = false;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    Notification.countDocuments({ recipient: req.user._id, read: false }),
  ]);

  res.json({ success: true, notifications, unreadCount });
});

// PUT /api/notifications/:id/read — Mark one as read
router.put('/:id/read', protect, async (req, res) => {
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { read: true, readAt: new Date() },
    { new: true }
  );
  if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, notification: notif });
});

// PUT /api/notifications/read-all — Mark all as read
router.put('/read-all', protect, async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, read: false },
    { read: true, readAt: new Date() }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});

// DELETE /api/notifications/:id — Delete a notification
router.delete('/:id', protect, async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
  res.json({ success: true, message: 'Notification deleted' });
});

module.exports = router;
