const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['employee', 'technician', 'admin']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, role, department } = req.body;

  const user = await User.create({ name, email, password, role, department });

  const token = user.getSignedJwtToken();

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      initials: user.initials,
    },
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account is deactivated' });
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = user.getSignedJwtToken();

  res.json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      initials: user.initials,
      avgRating: user.avgRating,
      totalResolved: user.totalResolved,
    },
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json({ success: true, user });
});

// ── PUT /api/auth/profile ────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  const { name, notificationPrefs } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name, notificationPrefs },
    { new: true, runValidators: true }
  ).select('-password');

  res.json({ success: true, user });
});

// ── PUT /api/auth/password ───────────────────────────────────────
router.put('/password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+password');

  if (!(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password updated successfully' });
});

// ── GET /api/auth/users — Admin: list all users ──────────────────
router.get('/users', protect, authorize('admin', 'superadmin'), async (req, res) => {
  const { role, department, search } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (department) filter.department = department;
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];

  const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, count: users.length, users });
});

// ── GET /api/auth/technicians — For assignment dropdown ──────────
router.get('/technicians', protect, async (req, res) => {
  const { department } = req.query;
  const filter = { role: 'technician', isActive: true };
  if (department) filter.department = department;

  const technicians = await User.find(filter)
    .select('name department activeTicketCount avgRating totalResolved')
    .sort({ activeTicketCount: 1 });

  res.json({ success: true, technicians });
});

module.exports = router;
