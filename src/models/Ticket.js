const mongoose = require('mongoose');

// ── Timeline Event ──────────────────────────────────────────────
const timelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  note: { type: String, default: null },
  type: {
    type: String,
    enum: ['done', 'current', 'pending-dot', 'escalated-dot'],
    default: 'done',
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: String,
  timestamp: { type: Date, default: Date.now },
});

// ── Feedback / Rating ───────────────────────────────────────────
const feedbackSchema = new mongoose.Schema({
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String, maxlength: 500 },
  submittedAt: { type: Date, default: Date.now },
});

// ── Main Ticket Schema ──────────────────────────────────────────
const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    unique: true,
  },

  // Who raised it
  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  raisedByName: { type: String, required: true },

  // Ticket details
  title: {
    type: String,
    required: [true, 'Ticket title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  location: {
    building: String,
    floor: String,
    room: String,
    detail: String, // e.g. "near window"
  },

  // AI Classification
  category: {
    type: String,
    enum: ['IT', 'Electrical', 'Plumbing', 'HVAC', 'Civil', 'Housekeeping', 'Other'],
    required: true,
  },
  aiCategory: { type: String }, // what AI suggested
  aiConfidence: { type: Number }, // 0–1 confidence score
  keywords: [String], // AI-extracted keywords

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  aiPriority: { type: String }, // what AI suggested

  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assignedToName: { type: String, default: 'Unassigned' },
  assignedAt: { type: Date, default: null },

  // Status
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in-progress', 'resolved', 'escalated', 'closed', 'rejected'],
    default: 'pending',
  },

  // SLA tracking
  slaHours: { type: Number, default: 4 },       // deadline in hours
  slaDeadline: { type: Date },                   // computed from creation + slaHours
  slaBreached: { type: Boolean, default: false },
  escalationLevel: { type: Number, default: 0 }, // 0=none, 1=supervisor, 2=manager, 3=director
  lastEscalatedAt: { type: Date, default: null },

  // Photo evidence
  photos: [{
    url: String,
    publicId: String, // cloudinary public id for deletion
    uploadedAt: { type: Date, default: Date.now },
  }],

  // Resolution
  resolvedAt: { type: Date, default: null },
  resolutionNote: { type: String, default: null },
  resolutionPhotos: [{
    url: String,
    publicId: String,
  }],

  // Feedback
  feedback: feedbackSchema,

  // Timeline (audit trail)
  timeline: [timelineEventSchema],

  // Tags / metadata
  tags: [String],
  isRecurring: { type: Boolean, default: false },
  parentTicketId: { type: String, default: null }, // if recurring/related
}, { timestamps: true });

// ── Pre-save hooks ──────────────────────────────────────────────

// Auto-generate ticket ID like T-00042
ticketSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticketId = `T-${String(count + 1).padStart(4, '0')}`;

    // Set SLA deadline
    const slaMap = { critical: 1, high: 2, medium: 4, low: 8 };
    this.slaHours = slaMap[this.priority] || 4;
    this.slaDeadline = new Date(Date.now() + this.slaHours * 60 * 60 * 1000);

    // Initial timeline
    this.timeline.push({
      status: 'Submitted',
      note: `Ticket raised by ${this.raisedByName}`,
      type: 'done',
      performedByName: this.raisedByName,
    });
  }
  next();
});

// ── Virtuals ────────────────────────────────────────────────────
ticketSchema.virtual('slaRemaining').get(function () {
  if (!this.slaDeadline) return null;
  return Math.round((this.slaDeadline - Date.now()) / 1000 / 60); // minutes
});

ticketSchema.virtual('isOverdue').get(function () {
  return this.slaDeadline && Date.now() > this.slaDeadline &&
    !['resolved', 'closed'].includes(this.status);
});

// ── Indexes ─────────────────────────────────────────────────────
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ raisedBy: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ slaDeadline: 1, slaBreached: 1 });
ticketSchema.index({ ticketId: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ createdAt: -1 });

ticketSchema.set('toJSON', { virtuals: true });
ticketSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Ticket', ticketSchema);
