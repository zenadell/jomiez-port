/**
 * SEO Schema Markup — JSON-LD Structured Data for Jomiez Innovation
 * Dynamically injects rich structured data for Google Rich Results
 * Covers: Organization, Person, WebSite, Service, FAQ, Breadcrumb, AggregateRating
 */
(function () {
    'use strict';

    const SITE_URL = window.location.origin;
    const PAGE_PATH = window.location.pathname;

    // Helper: inject a JSON-LD script tag
    function injectSchema(data) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(data);
        document.head.appendChild(script);
    }

    // ========== 1. ORGANIZATION SCHEMA ==========
    function injectOrganizationSchema(settings) {
        const schema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Jomiez Innovation",
            "alternateName": ["Jomiez", "Jomiez Tech", "Jomiez Software"],
            "url": SITE_URL,
            "logo": settings.site_logo_url || SITE_URL + "/uploads/logo.png",
            "description": "Jomiez Innovation is a leading software development company specializing in web development, mobile app development, AI integration, custom software solutions, UI/UX design, and digital transformation services for businesses worldwide.",
            "foundingDate": "2024",
            "founder": {
                "@type": "Person",
                "name": "Ezinna Emmanuel Nweke",
                "alternateName": ["Templeton", "Temple"],
                "jobTitle": "Founder & CEO"
            },
            "contactPoint": [{
                "@type": "ContactPoint",
                "telephone": settings.contact_phone || "",
                "contactType": "customer service",
                "email": settings.contact_email || "hello@jomiez.com",
                "availableLanguage": ["English"]
            }],
            "sameAs": [
                "https://www.facebook.com/jomiez",
                "https://www.instagram.com/jomiez",
                "https://www.linkedin.com/company/jomiez",
                "https://www.youtube.com/@jomiez",
                "https://twitter.com/jomiez",
                "https://github.com/jomiez"
            ],
            "address": {
                "@type": "PostalAddress",
                "addressCountry": "NG"
            },
            "areaServed": [
                { "@type": "Place", "name": "Worldwide" },
                { "@type": "Place", "name": "United States" },
                { "@type": "Place", "name": "United Kingdom" },
                { "@type": "Place", "name": "Canada" },
                { "@type": "Place", "name": "Europe" },
                { "@type": "Place", "name": "Africa" },
                { "@type": "Place", "name": "Nigeria" }
            ],
            "knowsAbout": [
                "Software Development", "Web Development", "Mobile App Development",
                "AI Integration", "Machine Learning", "Custom Software",
                "UI/UX Design", "Cloud Computing", "DevOps",
                "Full Stack Development", "React", "Node.js", "Python",
                "E-commerce Development", "SaaS Development", "API Development",
                "Database Design", "Cybersecurity", "Digital Marketing",
                "SEO", "Business Automation", "IT Consulting",
                "Startup Solutions", "MVP Development", "Progressive Web Apps"
            ],
            "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "Software Development Services",
                "itemListElement": [
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Web Development" } },
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Mobile App Development" } },
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "AI & Automation Solutions" } },
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Custom Software Development" } },
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "UI/UX Design" } },
                    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Cloud & DevOps Services" } }
                ]
            }
        };
        injectSchema(schema);
    }

    // ========== 2. PERSON SCHEMA ==========
    function injectPersonSchema(settings) {
        const schema = {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": "Ezinna Emmanuel Nweke",
            "alternateName": ["Templeton", "Temple", "Templeton Nweke"],
            "jobTitle": "Software Engineer & Founder",
            "worksFor": {
                "@type": "Organization",
                "name": "Jomiez Innovation"
            },
            "url": SITE_URL + "/about",
            "image": settings.hero_image_url || "",
            "description": "Full-stack software engineer, AI specialist, and founder of Jomiez Innovation. Building innovative software solutions, web applications, mobile apps, and AI-powered systems for businesses worldwide.",
            "knowsAbout": [
                "Software Engineering", "Web Development", "Mobile App Development",
                "Artificial Intelligence", "Machine Learning", "Cloud Architecture",
                "System Design", "API Development", "Database Engineering",
                "JavaScript", "Python", "React", "Node.js", "Next.js",
                "UI/UX Design", "DevOps", "Agile Development"
            ],
            "sameAs": [
                "https://www.linkedin.com/in/templeton",
                "https://github.com/templeton",
                "https://twitter.com/templeton"
            ]
        };
        injectSchema(schema);
    }

    // ========== 3. WEBSITE SCHEMA (enables sitelinks search box) ==========
    function injectWebSiteSchema() {
        const schema = {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Jomiez Innovation",
            "alternateName": "Jomiez",
            "url": SITE_URL,
            "description": "Professional software development, web development, mobile app development, AI solutions, and digital transformation services by Jomiez Innovation.",
            "publisher": {
                "@type": "Organization",
                "name": "Jomiez Innovation"
            },
            "potentialAction": {
                "@type": "SearchAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": SITE_URL + "/works?q={search_term_string}"
                },
                "query-input": "required name=search_term_string"
            }
        };
        injectSchema(schema);
    }

    // ========== 4. BREADCRUMB SCHEMA ==========
    function injectBreadcrumbSchema() {
        const breadcrumbs = {
            "/": [{ name: "Home", url: SITE_URL }],
            "/about": [
                { name: "Home", url: SITE_URL },
                { name: "About Us", url: SITE_URL + "/about" }
            ],
            "/services": [
                { name: "Home", url: SITE_URL },
                { name: "Services", url: SITE_URL + "/services" }
            ],
            "/works": [
                { name: "Home", url: SITE_URL },
                { name: "Portfolio", url: SITE_URL + "/works" }
            ],
            "/testimonials": [
                { name: "Home", url: SITE_URL },
                { name: "Testimonials", url: SITE_URL + "/testimonials" }
            ],
            "/resume": [
                { name: "Home", url: SITE_URL },
                { name: "Resume", url: SITE_URL + "/resume" }
            ],
            "/contact-us": [
                { name: "Home", url: SITE_URL },
                { name: "Contact", url: SITE_URL + "/contact-us" }
            ]
        };

        let items = breadcrumbs[PAGE_PATH];
        if (!items && PAGE_PATH.startsWith('/work/')) {
            items = [
                { name: "Home", url: SITE_URL },
                { name: "Portfolio", url: SITE_URL + "/works" },
                { name: "Project Details", url: SITE_URL + PAGE_PATH }
            ];
        }
        if (!items && PAGE_PATH.startsWith('/services/')) {
            items = [
                { name: "Home", url: SITE_URL },
                { name: "Services", url: SITE_URL + "/services" },
                { name: "Service Details", url: SITE_URL + PAGE_PATH }
            ];
        }
        if (!items) return;

        const schema = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": items.map((item, i) => ({
                "@type": "ListItem",
                "position": i + 1,
                "name": item.name,
                "item": item.url
            }))
        };
        injectSchema(schema);
    }

    // ========== 5. SERVICE SCHEMAS (dynamic) ==========
    async function injectServiceSchemas() {
        if (PAGE_PATH !== '/services' && !PAGE_PATH.startsWith('/services/')) return;
        try {
            const res = await fetch('/api/services');
            const services = await res.json();
            if (!Array.isArray(services) || services.length === 0) return;

            services.forEach(svc => {
                const schema = {
                    "@context": "https://schema.org",
                    "@type": "Service",
                    "name": svc.title,
                    "description": svc.description || svc.title,
                    "provider": {
                        "@type": "Organization",
                        "name": "Jomiez Innovation",
                        "url": SITE_URL
                    },
                    "url": SITE_URL + "/services/" + svc.slug,
                    "areaServed": "Worldwide",
                    "serviceType": svc.title
                };
                if (svc.image_url) schema.image = svc.image_url;
                injectSchema(schema);
            });
        } catch (e) { /* silent */ }
    }

    // ========== 6. FAQ SCHEMA (dynamic — triggers FAQ Rich Results!) ==========
    async function injectFAQSchema() {
        if (PAGE_PATH !== '/' && PAGE_PATH !== '/about' && PAGE_PATH !== '/services') return;
        try {
            const res = await fetch('/api/faqs');
            const faqs = await res.json();
            if (!Array.isArray(faqs) || faqs.length === 0) return;

            const schema = {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": faqs.map(faq => ({
                    "@type": "Question",
                    "name": faq.question,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": faq.answer
                    }
                }))
            };
            injectSchema(schema);
        } catch (e) { /* silent */ }
    }

    // ========== 7. AGGREGATE RATING / REVIEW SCHEMA ==========
    async function injectReviewSchema() {
        try {
            const res = await fetch('/api/testimonials');
            const testimonials = await res.json();
            if (!Array.isArray(testimonials) || testimonials.length === 0) return;

            const totalRating = testimonials.reduce((sum, t) => sum + (t.rating || 5), 0);
            const avgRating = (totalRating / testimonials.length).toFixed(1);

            // Aggregate rating on Organization
            const schema = {
                "@context": "https://schema.org",
                "@type": "ProfessionalService",
                "name": "Jomiez Innovation",
                "url": SITE_URL,
                "description": "Leading software development company offering web development, mobile apps, AI solutions, and digital transformation services worldwide.",
                "image": SITE_URL + "/uploads/logo.png",
                "priceRange": "$$",
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": avgRating,
                    "bestRating": "5",
                    "worstRating": "1",
                    "ratingCount": String(testimonials.length)
                },
                "review": testimonials.slice(0, 5).map(t => ({
                    "@type": "Review",
                    "author": {
                        "@type": "Person",
                        "name": t.author_name || "Client"
                    },
                    "reviewRating": {
                        "@type": "Rating",
                        "ratingValue": String(t.rating || 5),
                        "bestRating": "5"
                    },
                    "reviewBody": t.message
                }))
            };
            injectSchema(schema);
        } catch (e) { /* silent */ }
    }

    // ========== 8. WEBPAGE SCHEMA ==========
    function injectWebPageSchema(settings) {
        const pageTitles = {
            "/": "Jomiez Innovation — Software Development, Web & App Solutions",
            "/about": "About Jomiez Innovation — Our Story, Mission & Team",
            "/services": "Our Services — Web Development, Mobile Apps, AI Solutions",
            "/works": "Our Portfolio — Projects & Case Studies by Jomiez",
            "/testimonials": "Client Testimonials — What Our Clients Say",
            "/resume": "Resume — Ezinna Emmanuel Nweke (Templeton)",
            "/contact-us": "Contact Jomiez Innovation — Let's Build Something Great",
            "/blog": "Blog & Articles — Jomiez Innovation"
        };

        const schema = {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": pageTitles[PAGE_PATH] || document.title,
            "url": SITE_URL + PAGE_PATH,
            "isPartOf": {
                "@type": "WebSite",
                "name": "Jomiez Innovation",
                "url": SITE_URL
            },
            "about": {
                "@type": "Organization",
                "name": "Jomiez Innovation"
            },
            "inLanguage": "en",
            "dateModified": new Date().toISOString().split('T')[0]
        };
        injectSchema(schema);
    }

    // ========== 9. LOCAL BUSINESS SCHEMA (Contact Page) ==========
    function injectLocalBusinessSchema(settings) {
        if (PAGE_PATH !== '/contact-us') return;
        const schema = {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "Jomiez Innovation",
            "image": SITE_URL + "/uploads/logo.png",
            "@id": SITE_URL,
            "url": SITE_URL,
            "telephone": settings.contact_phone || "",
            "address": {
                "@type": "PostalAddress",
                "addressCountry": "NG"
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": 9.0820,
                "longitude": 8.6753
            },
            "openingHoursSpecification": {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"
                ],
                "opens": "09:00",
                "closes": "18:00"
            }
        };
        injectSchema(schema);
    }

    // ========== 10. BLOG POST SCHEMA (Article) ==========
    async function injectBlogPostSchema() {
        if (!PAGE_PATH.startsWith('/blog/')) return;
        const slug = PAGE_PATH.replace('/blog/', '');
        try {
            const res = await fetch(`/api/blog/${slug}`);
            const post = await res.json();
            if (!post || post.error) return;

            const schema = {
                "@context": "https://schema.org",
                "@type": "BlogPosting",
                "mainEntityOfPage": {
                    "@type": "WebPage",
                    "@id": SITE_URL + PAGE_PATH
                },
                "headline": post.title,
                "description": post.excerpt || "",
                "image": post.thumbnail_url || (SITE_URL + "/uploads/og-image.jpg"),
                "author": {
                    "@type": "Person",
                    "name": post.author || "Jomiez Innovation Team"
                },
                "publisher": {
                    "@type": "Organization",
                    "name": "Jomiez Innovation",
                    "logo": {
                        "@type": "ImageObject",
                        "url": SITE_URL + "/uploads/logo.png"
                    }
                },
                "datePublished": post.published_at || new Date().toISOString()
            };
            injectSchema(schema);
        } catch (e) { /* silent */ }
    }

    // ========== INIT: Fetch settings and inject all schemas ==========
    async function init() {
        let settings = {};
        try {
            const res = await fetch('/api/settings');
            settings = await res.json();
        } catch (e) { /* use defaults */ }

        // Core schemas — inject on every page
        // injectOrganizationSchema(settings); // SSR'd in server.js
        injectWebSiteSchema();
        injectBreadcrumbSchema();
        injectWebPageSchema(settings);

        // Person schema on home and about pages
        if (PAGE_PATH === '/' || PAGE_PATH === '/about' || PAGE_PATH === '/resume') {
            injectPersonSchema(settings);
        }

        // Dynamic content schemas
        await Promise.all([
            injectServiceSchemas(),
            // injectFAQSchema(), // SSR'd in server.js
            injectReviewSchema(),
            injectBlogPostSchema(),
        ]);
        
        injectLocalBusinessSchema(settings);
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
