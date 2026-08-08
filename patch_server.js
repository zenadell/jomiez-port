const fs = require('fs');

let serverFile = fs.readFileSync('server.js', 'utf8');

// 1. Add getFaqs() function
if (!serverFile.includes('function getFaqs()')) {
  const getSettingsRegex = /(function getSettings\(\) \{[\s\S]*?\n\})/m;
  const getFaqsCode = `\n\nfunction getFaqs() {
  return new Promise((resolve) => {
    db.all('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC', [], (err, rows) => {
      if (err || !rows) return resolve([]);
      resolve(rows);
    });
  });
}`;
  serverFile = serverFile.replace(getSettingsRegex, `$1${getFaqsCode}`);
}

// 2. Modify injectSEOMeta signature to accept settings and faqs
serverFile = serverFile.replace(/function injectSEOMeta\(html, meta\) \{/, 'function injectSEOMeta(html, meta, settings = {}, faqs = []) {');

// 3. Inject SSR Text Replacements and JSON-LD inside injectSEOMeta
const additionalMetaFullRegex = /const additionalMetaFull = \`\$\{resourceHints\}[\s\S]*?<script src="\/js\/seo-schema\.js" defer><\/script>\`;/;

const ssrInjectionCode = `
  // --- AEO/GEO Server-Side Rendering (SSR) ---
  
  // 1. Hero Text
  if (settings.hero_text) {
    result = result.replace(
      /(<p[^>]*class="[^"]*home-hero-text[^"]*"[^>]*>)[\\s\\S]*?(<\\/p>)/,
      \`$1<span class="skeleton" style="color:transparent;">\${settings.hero_text}</span>$2\`
    );
  }
  
  // 2. About Hero Subheading
  if (settings.about_hero_subheading) {
    result = result.replace(
      /(<div[^>]*class="[^"]*about-hero-subheading[^"]*"[^>]*>)[\\s\\S]*?(<\\/div>)/,
      \`$1<span class="skeleton" style="color:transparent;">\${settings.about_hero_subheading}</span>$2\`
    );
  }

  // 3. FAQs SSR
  if (faqs && faqs.length > 0) {
    let qIndex = 0;
    result = result.replace(/<h5 class="faq-question-text">([\\s\\S]*?)<\\/h5>/g, (match, inner) => {
      if (qIndex < faqs.length) {
        const text = faqs[qIndex].question;
        qIndex++;
        return \`<h5 class="faq-question-text"><span class="skeleton" style="color:transparent;">\${text}</span></h5>\`;
      }
      return match;
    });

    let aIndex = 0;
    result = result.replace(/<p class="faq-answer-text">([\\s\\S]*?)<\\/p>/g, (match, inner) => {
      if (aIndex < faqs.length) {
        const text = faqs[aIndex].answer;
        aIndex++;
        return \`<p class="faq-answer-text"><span class="skeleton" style="color:transparent;">\${text}</span></p>\`;
      }
      return match;
    });
  }

  // 4. Server-Side Schema Generation
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Jomiez Innovation",
    "url": host,
    "logo": host + "/uploads/og-image.jpg",
    "description": settings.seo_site_description || meta.description,
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": settings.contact_email || "hi@jomiez.com",
      "availableLanguage": "en"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer
      }
    }))
  };

  const schemas = \`<script type="application/ld+json">\${JSON.stringify(orgSchema)}</script>\` + 
                  (faqs.length > 0 ? \`\\n    <script type="application/ld+json">\${JSON.stringify(faqSchema)}</script>\` : '');

  const additionalMetaFull = \`\$\{resourceHints\}
    \$\{canonical\}
    \$\{robotsMeta\}
    \$\{keywords\}
    \$\{authorMeta\}
    \$\{geoMeta\}
    \$\{langAlts\}
    \$\{themeColor\}
    \$\{gscVerification\}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:creator" content="@jomiez" />
    <meta property="og:site_name" content="Jomiez Innovation" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="\$\{host\}\$\{meta.path || '/'}" />
    <meta property="og:type" content="website" />
    \$\{schemas\}
    <script src="/js/seo-schema.js" defer></script>\`;
`;

serverFile = serverFile.replace(additionalMetaFullRegex, ssrInjectionCode);

// 4. Update serveSEOPage to call getFaqs and pass to injectSEOMeta
const serveSEOPageRegex = /(async function serveSEOPage\(req, res, filePath, metaOverrides = \{\}\) \{[\s\S]*?)(const meta = \{[\s\S]*?\};\n\n  fs\.readFile\(filePath, 'utf8', \(err, html\) => \{[\s\S]*?)(const injected = injectSEOMeta\(html, meta\);)([\s\S]*?\}\);)/;

const newServeSEOPage = \`$1  const faqs = await getFaqs();
  $2const injected = injectSEOMeta(html, meta, settings, faqs);$4\`;

serverFile = serverFile.replace(serveSEOPageRegex, newServeSEOPage);

fs.writeFileSync('server.js', serverFile);
console.log("Successfully patched server.js");
