const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove Style Guide
    content = content.replace(/<a href="\/style-guide"[^>]*>\s*Style Guide\s*<\/a>/g, '');
    
    // Remove Change-Log
    content = content.replace(/<a href="\/change-log"[^>]*>\s*Change-Log\s*<\/a>/g, '');
    
    // Replace Facebook
    content = content.replace(/<a href="https:\/\/www\.facebook\.com"[^>]*>\s*Facebook\s*<\/a>/g, '<a href="https://wa.me/" target="_blank" class="footer-nav-link"> WhatsApp</a>');
    
    // Replace YouTube
    content = content.replace(/<a href="https:\/\/www\.youtube\.com"[^>]*>\s*YouTube\s*<\/a>/g, '<a href="https://github.com" target="_blank" class="footer-nav-link"> GitHub</a>');
    
    fs.writeFileSync(file, content);
    console.log('Processed', file);
});
