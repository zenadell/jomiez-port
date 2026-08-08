async function check() {
    try {
        const res = await fetch('https://jomiez.com');
        const text = await res.text();
        
        const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/);
        console.log('Title:', titleMatch ? titleMatch[1].trim() : 'NOT FOUND');
        
        const ogMatch = text.match(/<meta property="og:image" content="([^"]+)"/);
        console.log('OG Image:', ogMatch ? ogMatch[1] : 'NOT FOUND');
        
    } catch(e) {
        console.error(e.message);
    }
}
check();
