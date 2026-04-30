require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadsDir = path.join(__dirname, '..', 'uploads');
const videoFiles = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.mp4'));

async function uploadAll() {
  for (const file of videoFiles) {
    const filePath = path.join(uploadsDir, file);
    console.log(`Uploading ${file}...`);
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: 'jomiez-portfolio',
        public_id: path.basename(file, '.mp4'),
        eager: [
          { quality: 'auto', fetch_format: 'mp4' },
          { quality: 'auto', fetch_format: 'webm' }
        ],
        eager_async: true
      });
      console.log(`  ✓ Uploaded: ${result.secure_url}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }
}

uploadAll();
