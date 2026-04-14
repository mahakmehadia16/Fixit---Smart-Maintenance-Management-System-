/**
 * AI Classification Service
 * Uses keyword matching + weighted scoring to classify tickets
 * In production: swap classify() with an OpenAI/Gemini API call
 */

const categoryKeywords = {
  IT: {
    keywords: [
      'wifi', 'internet', 'network', 'laptop', 'computer', 'pc', 'server',
      'printer', 'projector', 'router', 'cable', 'data', 'software', 'system',
      'login', 'password', 'email', 'phone', 'mobile', 'screen', 'monitor',
      'keyboard', 'mouse', 'usb', 'port', 'connection', 'slow', 'crash',
    ],
    weight: 1.0,
  },
  Electrical: {
    keywords: [
      'power', 'electricity', 'socket', 'plug', 'switch', 'light', 'fan',
      'bulb', 'wiring', 'electrical', 'fuse', 'circuit', 'voltage', 'current',
      'short circuit', 'trip', 'breaker', 'sparks', 'flickering', 'generator',
      'ups', 'inverter', 'extension', 'board',
    ],
    weight: 1.0,
  },
  Plumbing: {
    keywords: [
      'water', 'leak', 'pipe', 'drain', 'tap', 'faucet', 'toilet', 'flush',
      'clog', 'block', 'overflow', 'sewage', 'bathroom', 'sink', 'shower',
      'hot water', 'cold water', 'valve', 'pump', 'tank', 'leakage', 'dripping',
      'burst', 'seepage',
    ],
    weight: 1.0,
  },
  HVAC: {
    keywords: [
      'ac', 'air conditioner', 'air conditioning', 'cooling', 'heating',
      'hvac', 'vent', 'ventilation', 'temperature', 'cold', 'hot', 'humid',
      'filter', 'duct', 'thermostat', 'heat pump', 'chiller', 'blower',
      'stuffy', 'smell', 'odor',
    ],
    weight: 1.0,
  },
  Civil: {
    keywords: [
      'wall', 'ceiling', 'floor', 'roof', 'door', 'window', 'crack', 'paint',
      'tile', 'concrete', 'structure', 'stair', 'ramp', 'railing', 'pillar',
      'foundation', 'plaster', 'glass', 'broken', 'damage', 'repair',
      'construction', 'lift', 'elevator',
    ],
    weight: 1.0,
  },
  Housekeeping: {
    keywords: [
      'clean', 'cleaning', 'trash', 'garbage', 'waste', 'dustbin', 'hygiene',
      'dirty', 'sweep', 'mop', 'sanitize', 'pest', 'rodent', 'insect',
      'cockroach', 'rat', 'mosquito', 'stain', 'mess', 'spill',
    ],
    weight: 1.0,
  },
};

const priorityKeywords = {
  critical: [
    'emergency', 'fire', 'flood', 'dangerous', 'safety hazard', 'injury',
    'electric shock', 'gas leak', 'collapse', 'urgent', 'critical', 'immediately',
  ],
  high: [
    'not working', 'broken', 'urgent', 'asap', 'severely', 'multiple',
    'entire floor', 'server down', 'all users', 'production',
  ],
  medium: [
    'intermittent', 'sometimes', 'occasionally', 'slow', 'partial',
    'inconvenient', 'affecting work',
  ],
  low: [
    'minor', 'small', 'cosmetic', 'aesthetic', 'when possible', 'eventually',
    'not urgent', 'whenever',
  ],
};

/**
 * Classify a ticket based on title + description
 * Returns { category, priority, confidence, keywords }
 */
const classify = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  const words = text.split(/\W+/).filter(Boolean);

  // ── Category scoring ──────────────────────────────────────────
  const scores = {};
  const matchedKeywords = [];

  for (const [cat, { keywords, weight }] of Object.entries(categoryKeywords)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        // Multi-word keywords score higher
        const kwScore = kw.split(' ').length * weight;
        score += kwScore;
        matchedKeywords.push(kw);
      }
    }
    scores[cat] = score;
  }

  const topCategory = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0];

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const category = topCategory[1] > 0 ? topCategory[0] : 'Other';
  const confidence = totalScore > 0 ? Math.min(topCategory[1] / totalScore, 1) : 0;

  // ── Priority scoring ──────────────────────────────────────────
  let detectedPriority = 'medium';
  priorityLoop:
  for (const [pri, kws] of Object.entries(priorityKeywords)) {
    for (const kw of kws) {
      if (text.includes(kw)) {
        detectedPriority = pri;
        break priorityLoop;
      }
    }
  }

  // Title in CAPS usually signals urgency
  if (title === title.toUpperCase() && title.length > 5) {
    if (detectedPriority === 'low') detectedPriority = 'medium';
    if (detectedPriority === 'medium') detectedPriority = 'high';
  }

  return {
    category,
    priority: detectedPriority,
    confidence: Math.round(confidence * 100),
    keywords: [...new Set(matchedKeywords)].slice(0, 5),
    scores,
  };
};

/**
 * Auto-assign the best available technician
 * Picks the one with fewest active tickets in the relevant department
 */
const suggestAssignee = async (category) => {
  const User = require('../models/User');

  const techDeptMap = {
    IT: 'IT',
    Electrical: 'Electrical',
    Plumbing: 'Plumbing',
    HVAC: 'HVAC',
    Civil: 'Civil',
    Housekeeping: 'General',
    Other: 'General',
  };

  const dept = techDeptMap[category] || 'General';

  const technician = await User.findOne({
    role: 'technician',
    department: dept,
    isActive: true,
  }).sort({ activeTicketCount: 1 }); // least loaded first

  return technician;
};

module.exports = { classify, suggestAssignee };
