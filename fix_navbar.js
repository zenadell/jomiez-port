const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove Style Guide completely (navbar and footer)
    content = content.replace(/<a[^>]*href="\/style-guide"[^>]*>[\s\S]*?<\/a>/g, '');
    
    // Remove Change-Log completely
    content = content.replace(/<a[^>]*href="\/change-log"[^>]*>[\s\S]*?<\/a>/g, '');
    
    fs.writeFileSync(file, content);
});
