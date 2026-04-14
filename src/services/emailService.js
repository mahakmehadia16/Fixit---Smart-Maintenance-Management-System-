const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

// ── HTML email template ──────────────────────────────────────────
const buildEmailHTML = (title, body, ticketId, status, color = '#00e5a0') => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0c10;font-family:'DM Sans',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111318;border-radius:12px;overflow:hidden;border:1px solid #232830">
        <!-- Header -->
        <tr><td style="background:#111318;padding:24px 32px;border-bottom:1px solid #232830">
          <span style="font-size:22px;font-weight:800;color:${color}">FixIT</span>
          <span style="font-size:13px;color:#6b7280;margin-left:10px">Smart Maintenance System</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <h2 style="color:#e8eaf0;margin:0 0 8px;font-size:18px">${title}</h2>
          ${ticketId ? `<div style="display:inline-block;background:#181c24;border:1px solid #232830;border-radius:6px;padding:4px 12px;font-family:monospace;font-size:12px;color:#6b7280;margin-bottom:16px">${ticketId}</div>` : ''}
          <div style="color:#9ca3af;font-size:14px;line-height:1.6">${body}</div>
        </td></tr>
        <!-- Status pill -->
        ${status ? `
        <tr><td style="padding:0 32px 16px">
          <span style="background:rgba(0,229,160,.1);border:1px solid rgba(0,229,160,.3);color:${color};padding:5px 14px;border-radius:20px;font-size:12px;font-family:monospace">${status}</span>
        </td></tr>` : ''}
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #232830;color:#6b7280;font-size:11px">
          This is an automated message from the FixIT system. Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Send helpers ─────────────────────────────────────────────────

exports.sendTicketConfirmation = async (to, name, ticketId, title, category, priority) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[FixIT] Ticket ${ticketId} Created — ${title}`,
    html: buildEmailHTML(
      `Your request has been received ✅`,
      `Hi ${name},<br><br>Your maintenance request <strong>${title}</strong> has been logged successfully.<br><br>
       <strong>Category:</strong> ${category}<br>
       <strong>Priority:</strong> ${priority.toUpperCase()}<br><br>
       We will assign a technician shortly. You'll receive updates as your ticket progresses.`,
      ticketId,
      'PENDING'
    ),
  });
};

exports.sendAssignmentNotification = async (to, techName, ticketId, title, location) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[FixIT] New Assignment — ${ticketId}`,
    html: buildEmailHTML(
      `New ticket assigned to you 🔧`,
      `Hi ${techName},<br><br>You have been assigned ticket <strong>${title}</strong>.<br><br>
       <strong>Location:</strong> ${location || 'Not specified'}<br><br>
       Please acknowledge and begin work within the SLA window.`,
      ticketId,
      'ASSIGNED',
      '#5b8fff'
    ),
  });
};

exports.sendEscalationAlert = async (to, ticketId, title, level, slaHours) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[FixIT] 🚨 ESCALATION — ${ticketId} SLA Breached`,
    html: buildEmailHTML(
      `Ticket escalated — SLA breached 🚨`,
      `Ticket <strong>${title}</strong> has <strong>exceeded its ${slaHours}-hour SLA</strong> and has been automatically escalated to Level ${level}.<br><br>
       Immediate action is required. Please review and resolve this ticket as soon as possible.`,
      ticketId,
      `ESCALATED (Level ${level})`,
      '#ff4f4f'
    ),
  });
};

exports.sendResolutionNotification = async (to, name, ticketId, title, resolutionNote) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[FixIT] Ticket ${ticketId} Resolved ✅`,
    html: buildEmailHTML(
      `Your ticket has been resolved 🎉`,
      `Hi ${name},<br><br>Great news! Your ticket <strong>${title}</strong> has been resolved.<br><br>
       <strong>Resolution Note:</strong> ${resolutionNote || 'Issue fixed by technician.'}<br><br>
       Please rate your experience to help us improve our service.`,
      ticketId,
      'RESOLVED'
    ),
  });
};

exports.sendSLAWarning = async (to, techName, ticketId, title, minutesLeft) => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[FixIT] ⚠️ SLA Warning — ${ticketId} due in ${minutesLeft} min`,
    html: buildEmailHTML(
      `SLA deadline approaching ⚠️`,
      `Hi ${techName},<br><br>Ticket <strong>${title}</strong> must be resolved in <strong>${minutesLeft} minutes</strong> to avoid SLA breach.<br><br>
       Please update the status immediately.`,
      ticketId,
      'SLA WARNING',
      '#ffb547'
    ),
  });
};
