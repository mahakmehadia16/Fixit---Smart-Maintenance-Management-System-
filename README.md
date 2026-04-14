# FixIT Backend 🔧
### Smart Maintenance Management System — Node.js + Express + MongoDB

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, etc.

# 3. Seed the database with demo data
npm run seed

# 4. Start the server
npm run dev        # development (nodemon)
npm start          # production
```

Server runs at: **http://localhost:5000**
Health check: **GET /health**

---

## 🏗️ Architecture

```
fixit-backend/
├── config/
│   └── db.js                  # MongoDB connection
├── src/
│   ├── models/
│   │   ├── User.js            # User schema (employee/technician/admin)
│   │   ├── Ticket.js          # Ticket schema with timeline & SLA
│   │   └── Notification.js    # In-app notifications
│   ├── routes/
│   │   ├── auth.js            # Auth + user management
│   │   ├── tickets.js         # Full ticket lifecycle
│   │   ├── analytics.js       # Dashboard + heatmap + trends
│   │   └── notifications.js   # Notification CRUD
│   ├── middleware/
│   │   ├── auth.js            # JWT protect + role authorize
│   │   ├── errorHandler.js    # Global error handler
│   │   └── upload.js          # Multer + Cloudinary
│   ├── services/
│   │   ├── aiClassifier.js    # AI ticket categorization engine
│   │   ├── slaMonitor.js      # Cron-based SLA + auto-escalation
│   │   └── emailService.js    # Nodemailer email templates
│   ├── utils/
│   │   └── seeder.js          # Demo data seeder
│   └── server.js              # App entry + Socket.IO
└── .env.example
```

---

## 🔐 Authentication

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

### Roles & Permissions
| Role        | Can Do |
|-------------|--------|
| `employee`  | Raise tickets, view own tickets, submit feedback |
| `technician`| View/update assigned tickets, mark resolved |
| `admin`     | Full ticket management, analytics, assign technicians |
| `superadmin`| Everything + user management |

---

## 📡 API Reference

### Auth Routes — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Register new user |
| POST | `/login` | ❌ | Login → returns JWT |
| GET | `/me` | ✅ | Get current user |
| PUT | `/profile` | ✅ | Update profile |
| PUT | `/password` | ✅ | Change password |
| GET | `/users` | Admin | List all users |
| GET | `/technicians` | ✅ | List technicians (for assignment) |

#### POST `/api/auth/login`
```json
{
  "email": "john@company.com",
  "password": "emp123"
}
```
Response:
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": {
    "id": "...",
    "name": "John Doe",
    "role": "employee",
    "department": "General"
  }
}
```

---

### Ticket Routes — `/api/tickets`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✅ | List tickets (with filters) |
| GET | `/:id` | ✅ | Get ticket details |
| POST | `/` | ✅ | Create ticket (+ AI classify) |
| PUT | `/:id/status` | Tech/Admin | Update status |
| PUT | `/:id/assign` | Admin | Assign technician |
| PUT | `/:id/resolve` | Tech/Admin | Mark resolved + upload proof |
| POST | `/:id/feedback` | Employee | Submit star rating |
| POST | `/ai-classify` | ✅ | Pre-classify before submitting |
| DELETE | `/:id` | Admin | Delete ticket |

#### POST `/api/tickets` — Create Ticket
```
Content-Type: multipart/form-data

title: "Internet not working on 2nd floor"
description: "All workstations lost connectivity..."
category: "IT"           (optional — AI will suggest)
priority: "high"          (optional — AI will suggest)
building: "Block A"
floor: "2nd Floor"
room: "Open Office"
autoAssign: "true"        (auto-assign to least-loaded technician)
photos: [file, file]      (up to 5 images, max 5MB each)
```

Response includes AI analysis:
```json
{
  "success": true,
  "ticket": { ... },
  "ai": {
    "suggestedCategory": "IT",
    "suggestedPriority": "high",
    "confidence": 92,
    "keywords": ["internet", "network", "connectivity"]
  }
}
```

#### GET `/api/tickets` — Query Params
```
?status=pending           pending | in-progress | resolved | escalated
?priority=high            low | medium | high | critical
?category=IT              IT | Electrical | Plumbing | HVAC | Civil | Housekeeping
?search=internet          full-text search
?mine=true                only current user's tickets
?page=1&limit=20          pagination
?sortBy=createdAt&order=desc
```

#### POST `/api/tickets/ai-classify` — Pre-classify
```json
{ "title": "WiFi not working", "description": "Cannot connect to internet" }
```
```json
{
  "category": "IT",
  "priority": "medium",
  "confidence": 89,
  "keywords": ["wifi", "internet", "connect"]
}
```

---

### Analytics Routes — `/api/analytics` (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Full stats + leaderboard |
| GET | `/trends?days=30` | Day-by-day ticket volume |
| GET | `/heatmap` | Day × Hour ticket matrix |
| GET | `/category-performance` | SLA rates per category |
| GET | `/my-stats` | Personal stats (any role) |

#### GET `/api/analytics/dashboard`
```json
{
  "stats": {
    "total": 247,
    "pending": 12,
    "inProgress": 8,
    "resolved": 210,
    "escalated": 3,
    "today": 5,
    "thisWeek": 31,
    "slaBreached": 7,
    "resolutionRate": 85,
    "avgResolutionHours": 3.2
  },
  "categoryBreakdown": [
    { "_id": "IT", "count": 89 },
    { "_id": "Electrical", "count": 67 }
  ],
  "techLeaderboard": [ ... ]
}
```

---

### Notification Routes — `/api/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get notifications (paginated) |
| PUT | `/:id/read` | Mark one as read |
| PUT | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete notification |

---

## ⚡ Real-Time Events (Socket.IO)

Connect: `ws://localhost:5000`

### Client → Server
```javascript
socket.emit('join', userId); // join personal room for targeted notifs
```

### Server → Client
```javascript
socket.on('ticket:new', ({ ticketId, title }) => {});
socket.on('ticket:updated', ({ ticketId, status }) => {});
socket.on('ticket:resolved', ({ ticketId }) => {});
socket.on('ticket:escalated', ({ ticketId, title, level, label }) => {});
socket.on('ticket:sla_warning', ({ ticketId, minutesLeft }) => {});
```

---

## 🧠 AI Classification Engine

The `aiClassifier.js` service uses weighted keyword scoring to:

1. **Categorize** tickets into: IT, Electrical, Plumbing, HVAC, Civil, Housekeeping
2. **Prioritize** tickets: critical, high, medium, low
3. **Extract keywords** from description
4. **Auto-assign** to the least-loaded technician in the relevant department

**To upgrade to GPT/Gemini:** Replace the `classify()` function body with an API call to OpenAI or Google Gemini while keeping the same return shape: `{ category, priority, confidence, keywords }`.

---

## ⏱️ SLA & Auto-Escalation

SLA deadlines (configurable via `.env`):
- `critical` → 1 hour
- `high` → 2 hours
- `medium` → 4 hours
- `low` → 8 hours

The SLA monitor runs every **5 minutes** via cron job and:
1. Detects tickets past their deadline
2. Sets status to `escalated`
3. Pushes a timeline event
4. Creates in-app notifications for all admins
5. Sends escalation email to `ESCALATION_EMAIL`
6. Emits `ticket:escalated` via Socket.IO
7. Sends **30-minute warnings** before breach

Escalation levels: `0 (none) → 1 (Supervisor) → 2 (Manager) → 3 (Director)`

---

## 📦 Demo Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Employee | john@company.com | emp123 |
| Employee | jane@company.com | emp123 |
| Technician | rahul@fixit.com | tech123 |
| Admin | admin@fixit.com | admin123 |
| SuperAdmin | superadmin@fixit.com | super123 |

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |
| Real-time | Socket.IO |
| File uploads | Multer + Cloudinary |
| Scheduling | node-cron |
| Email | Nodemailer |
| Security | Helmet, CORS, Rate Limiting |
| Validation | express-validator |
