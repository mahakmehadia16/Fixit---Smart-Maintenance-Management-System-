const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Ticket photo storage ─────────────────────────────────────────
const ticketStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'fixit/tickets',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 900, crop: 'limit', quality: 'auto' }],
  },
});

// ── Resolution photo storage ─────────────────────────────────────
const resolutionStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'fixit/resolutions',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 900, crop: 'limit', quality: 'auto' }],
  },
});

// ── File filter ──────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

exports.uploadTicketPhotos = multer({
  storage: ticketStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).array('photos', 5); // max 5 photos

exports.uploadResolutionPhotos = multer({
  storage: resolutionStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('resolutionPhotos', 3);

exports.cloudinary = cloudinary;
