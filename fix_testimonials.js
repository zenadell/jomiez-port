const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Find Testimonials link
    const match = content.match(/<a href="\/testimonials"[^>]*>\s*Testimonials\s*<\/a>/);
    if (match) {
        // Remove it from current position
        content = content.replace(match[0], '');
        // Insert it right after the second navbar-mega-wrap div starts
        content = content.replace(/(<div class="navbar-mega-wrap">\s*)(<a href="\/resume")/, '$1' + match[0] + '\n                                                $2');
        fs.writeFileSync(file, content);
        console.log('Moved in', file);
    }
});
