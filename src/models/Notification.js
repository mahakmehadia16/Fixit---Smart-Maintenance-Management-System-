const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String },
  type: {
    type: String,
    enum: ['ticket_created', 'ticket_assigned', 'status_update', 'escalation', 'resolved', 'feedback_request', 'sla_warning'],
    default: 'status_update',
  },
  ticketId: { type: String },     // human-readable ticket ID like T-0001
  ticketRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
  },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
