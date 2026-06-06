const fs = require('fs');
let content = fs.readFileSync('js/dynamic.js', 'utf8');

// The current code has:
// if (settings.social_instagram) { ... }
// I'll add whatsapp and github hydration there.
const instagramBlock = `if (settings.social_instagram) {
            document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = settings.social_instagram);
        }`;

const newBlock = `if (settings.social_whatsapp) {
            document.querySelectorAll('a[href*="wa.me"]').forEach(a => a.href = settings.social_whatsapp);
        }
        if (settings.social_github) {
            document.querySelectorAll('a[href*="github.com"]').forEach(a => a.href = settings.social_github);
        }
        if (settings.social_instagram) {
            document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = settings.social_instagram);
        }`;

content = content.replace(instagramBlock, newBlock);
fs.writeFileSync('js/dynamic.js', content);
