/**
 * Structured data for Jomiez Innovation.
 *
 * Emitted as ONE `@graph` from the server, not as separate client-injected blocks.
 * Two reasons:
 *
 *  1. AI crawlers do not run JavaScript. GPTBot, ClaudeBot, PerplexityBot and
 *     Google's raw fetch read the HTML as delivered. Schema injected by
 *     js/seo-schema.js after load was invisible to every one of them — which is
 *     precisely the audience this site is trying to reach.
 *
 *  2. Entity resolution needs the nodes LINKED. Ten standalone blocks that each
 *     re-state "Jomiez Innovation" read as several weak, unrelated entities. One
 *     graph whose nodes reference each other by @id reads as a single strong one:
 *     the Person is the founder of the Organization, which publishes the WebSite,
 *     which contains this WebPage.
 *
 * Everything here must be verifiable. No invented founding dates, client counts,
 * ratings, or social profiles — an unsupported claim in structured data is worse
 * than an absent one, because it mis-links the entity.
 */

const FOUNDER_NAME = 'Emmanuel Ezinna Nweke';
const FOUNDER_ALIASES = ['Templeton', 'Temple', 'Templeton Nweke', 'Emmanuel Nweke'];

// A bare platform root ("https://github.com") asserts nothing and can mis-link the
// entity in Google's knowledge graph. Only keep real profile URLs.
function realProfiles(settings = {}) {
  return [
    settings.social_linkedin, settings.social_github, settings.social_instagram,
    settings.social_twitter, settings.social_facebook, settings.social_youtube
  ].filter((u) => u && !/^https?:\/\/(www\.)?[a-z.]+\/?$/i.test(u));
}

function buildGraph({ host, path: pagePath, meta = {}, settings = {}, faqs = [], services = [], works = [], testimonials = [] }) {
  const ORG = `${host}/#organization`;
  const PERSON = `${host}/#founder`;
  const SITE = `${host}/#website`;
  const LOGO = `${host}/#logo`;
  const PAGE = `${host}${pagePath}#webpage`;

  const profiles = realProfiles(settings);
  const email = settings.contact_email || 'hello@jomiez.com';
  const graph = [];

  graph.push({
    '@type': 'ImageObject',
    '@id': LOGO,
    url: `${host}/og-image.png`,
    contentUrl: `${host}/og-image.png`,
    width: 1200,
    height: 630,
    caption: 'Jomiez Innovation'
  });

  graph.push({
    '@type': ['Organization', 'ProfessionalService'],
    '@id': ORG,
    name: 'Jomiez Innovation',
    alternateName: ['Jomiez', 'Jomiez Innovation Production'],
    url: `${host}/`,
    logo: { '@id': LOGO },
    image: { '@id': LOGO },
    description: settings.seo_site_description ||
      'Jomiez Innovation builds custom software, web and mobile applications, and production AI systems for businesses worldwide.',
    founder: { '@id': PERSON },
    employee: { '@id': PERSON },
    email,
    address: { '@type': 'PostalAddress', addressCountry: 'NG' },
    areaServed: [
      { '@type': 'Place', name: 'Worldwide' },
      { '@type': 'Country', name: 'Nigeria' },
      { '@type': 'Country', name: 'United States' },
      { '@type': 'Country', name: 'United Kingdom' },
      { '@type': 'Country', name: 'Canada' }
    ],
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email,
      availableLanguage: ['English']
    }],
    knowsAbout: [
      'Custom Software Development', 'Web Application Development',
      'Mobile App Development', 'Artificial Intelligence Integration',
      'Large Language Models', 'Retrieval Augmented Generation',
      'SaaS Development', 'UI/UX Design', 'API Development',
      'React', 'Next.js', 'Node.js', 'Python'
    ],
    ...(profiles.length ? { sameAs: profiles } : {})
  });

  graph.push({
    '@type': 'Person',
    '@id': PERSON,
    name: FOUNDER_NAME,
    alternateName: FOUNDER_ALIASES,
    givenName: 'Emmanuel',
    additionalName: 'Ezinna',
    familyName: 'Nweke',
    jobTitle: settings.founder_role || 'Founder & Lead Engineer',
    description: settings.founder_bio ||
      `${FOUNDER_NAME}, known professionally as Templeton, is the founder and lead engineer of Jomiez Innovation.`,
    url: `${host}/about`,
    worksFor: { '@id': ORG },
    nationality: { '@type': 'Country', name: 'Nigeria' },
    knowsAbout: [
      'Software Engineering', 'Fullstack Development', 'AI Engineering',
      'Large Language Models', 'Multimodal AI', 'Voice AI',
      'React', 'Next.js', 'Node.js', 'Python', 'System Design', 'UI/UX Design'
    ],
    ...(settings.hero_image ? { image: settings.hero_image } : {}),
    ...(profiles.length ? { sameAs: profiles } : {})
  });

  graph.push({
    '@type': 'WebSite',
    '@id': SITE,
    url: `${host}/`,
    name: 'Jomiez Innovation',
    description: settings.seo_site_description || meta.description,
    publisher: { '@id': ORG },
    inLanguage: 'en'
  });

  // Breadcrumbs: Home > Section, derived from the path.
  const segments = pagePath.split('/').filter(Boolean);
  const crumbs = [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${host}/` }];
  segments.forEach((seg, i) => {
    crumbs.push({
      '@type': 'ListItem',
      position: i + 2,
      name: seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      item: `${host}/${segments.slice(0, i + 1).join('/')}`
    });
  });
  const BREADCRUMB = `${host}${pagePath}#breadcrumb`;
  graph.push({ '@type': 'BreadcrumbList', '@id': BREADCRUMB, itemListElement: crumbs });

  graph.push({
    '@type': 'WebPage',
    '@id': PAGE,
    url: `${host}${pagePath}`,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': SITE },
    about: { '@id': ORG },
    primaryImageOfPage: { '@id': LOGO },
    breadcrumb: { '@id': BREADCRUMB },
    inLanguage: 'en'
  });

  if (faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${host}${pagePath}#faq`,
      isPartOf: { '@id': PAGE },
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer }
      }))
    });
  }

  if (services.length) {
    graph.push({
      '@type': 'OfferCatalog',
      '@id': `${host}/#services`,
      name: 'Jomiez Innovation Services',
      itemListElement: services.map((s, i) => ({
        '@type': 'Offer',
        position: i + 1,
        itemOffered: {
          '@type': 'Service',
          name: s.title,
          description: s.description || undefined,
          provider: { '@id': ORG },
          ...(s.slug ? { url: `${host}/services/${s.slug}` } : {})
        }
      }))
    });
  }

  if (works.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${host}/#portfolio`,
      name: 'Jomiez Innovation Portfolio',
      numberOfItems: works.length,
      itemListElement: works.map((w, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'CreativeWork',
          name: w.title,
          description: w.description || undefined,
          creator: { '@id': ORG },
          ...(w.thumbnail_url ? { image: w.thumbnail_url } : {}),
          ...(w.slug ? { url: `${host}/work/${w.slug}` } : {})
        }
      }))
    });
  }

  // Ratings are only emitted when real testimonials back them. An aggregateRating
  // with no reviews behind it is a fabricated claim.
  if (testimonials.length) {
    const avg = testimonials.reduce((n, t) => n + (Number(t.rating) || 5), 0) / testimonials.length;
    graph.push({
      '@type': 'AggregateRating',
      '@id': `${host}/#rating`,
      itemReviewed: { '@id': ORG },
      ratingValue: avg.toFixed(1),
      bestRating: '5',
      worstRating: '1',
      ratingCount: String(testimonials.length)
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

module.exports = { buildGraph, FOUNDER_NAME, FOUNDER_ALIASES, realProfiles };
