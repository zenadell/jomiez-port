console.log("DYNAMIC SCRIPT LOADED");

// Helper function — add this near the top of dynamic.js
function cloudinaryVideoUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  // If it's already a Cloudinary URL, add quality:auto transformation
  if (rawUrl.includes('res.cloudinary.com')) {
    return rawUrl.replace('/upload/', '/upload/q_auto,f_auto/');
  }
  return rawUrl;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 0. IMMEDIATE BRANDING STRIP (Before any fetches)
    const brandingStyle = document.createElement('style');
    brandingStyle.innerHTML = `
        .w-webflow-badge { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
        
        /* Restore Hover Interactions - Only force visible on sections that usually vanish */
        .section-hero, .section-about, .section-work { opacity: 1 !important; }
        
        /* Mobile Button Fix */
        @media (max-width: 479px) {
            .primary-button.work {
                max-width: 240px !important;
                margin-left: auto !important;
                margin-right: auto !important;
                left: 0 !important;
                right: 0 !important;
            }
        }
        
        /* Marquee Image Fallback */
        .marquee-image.error {
            background: #1a1a1a;
            border: 1px solid rgba(255,255,255,0.1);
        }
    `;
    document.head.appendChild(brandingStyle);

    // Global Image Error Handler (Keep skeleton on broken images)
    window.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            console.warn('[Chaka] Image load failed:', e.target.src);
            e.target.classList.add('error');
            const parent = e.target.parentElement;
            if (parent) {
                parent.classList.add('skeleton');
                // Ensure broken images don't collapse or look like "structure"
                if (parent.classList.contains('marquee-loop') || parent.classList.contains('marquee-loop-wrap')) {
                     e.target.style.display = 'none'; 
                } else {
                     e.target.style.opacity = '0';
                }
            }
        }
    }, true);

    console.log("DOM CONTENT LOADED FIRED!");
    const path = window.location.pathname;

    // Global Form Hijack
    const contactForm = document.getElementById('wf-form-Contact-Us');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = contactForm.querySelector('input[type="submit"]');
            const originalText = btn ? (btn.value || btn.textContent) : 'Submit';
            if (btn) { btn.value = 'Sending...'; btn.disabled = true; }

            const formData = new FormData(contactForm);
            const data = {
                firstName: formData.get('First-Name'),
                lastName: formData.get('Last-Name'),
                email: formData.get('Email-Address'),
                message: formData.get('Message')
            };

            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    contactForm.style.display = 'none';
                    const successMsg = document.querySelector('.w-form-done');
                    if (successMsg) successMsg.style.display = 'block';
                } else {
                    throw new Error('Failed');
                }
            } catch (err) {
                const errorMsg = document.querySelector('.w-form-fail');
                if (errorMsg) errorMsg.style.display = 'block';
                if (btn) { btn.value = originalText; btn.disabled = false; }
            }
        });
    }

    let settings = {};
    try {
        const [settingsRes, worksRes, skillsRes, servicesRes, brandsRes, faqsRes, marqueeRes, testimonialsRes, countersRes] = await Promise.all([
            fetch('/api/settings'),
            fetch('/api/works'),
            fetch('/api/skills'),
            fetch('/api/services'),
            fetch('/api/brands'),
            fetch('/api/faqs'),
            fetch('/api/marquee'),
            fetch('/api/testimonials'),
            fetch('/api/counters')
        ]);
        
        console.log('[DYNAMIC] Fetch statuses:', {
            settings: settingsRes.status,
            works: worksRes.status,
            skills: skillsRes.status,
            services: servicesRes.status,
            brands: brandsRes.status,
            faqs: faqsRes.status,
            marquee: marqueeRes.status,
            testimonials: testimonialsRes.status,
            counters: countersRes.status
        });

        settings = await settingsRes.json();
        window.siteSettings = settings;
        const works = await worksRes.json();
        const skills = await skillsRes.json();
        const services = await servicesRes.json();
        const brands = await brandsRes.json();
        const faqs = await faqsRes.json();
        const marquee = await marqueeRes.json();
        const testimonials = await testimonialsRes.json();
        const counters = await countersRes.json();

        // Store all data globally for re-hydration after soft navigation
        window.dynamicData = { settings, works, skills, services, brands, faqs, marquee, testimonials, counters };

        // Define reusable hydration function
        window.hydrateDynamicContent = function() {
            const { settings, works, skills, services, brands, faqs, marquee, testimonials, counters } = window.dynamicData;

        // 0. SEO & METADATA HYDRATION
        const setMeta = (name, value, attr = 'name') => {
            if (!value) return;
            let el = document.querySelector(`meta[${attr}="${name}"]`);
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(attr, name);
                document.head.appendChild(el);
            }
            el.setAttribute('content', value);
        };

        const siteTitle = settings.seo_site_title || 'Jomiez Portfolio';
        const siteDesc = settings.seo_site_description || '';
        const siteKeys = settings.seo_site_keywords || '';
        const ogImage = settings.seo_og_image || '';

        // Dynamic Title based on page
        let pageTitle = siteTitle;
        const path = window.location.pathname;
        if (path.includes('/about')) pageTitle = `About | ${siteTitle}`;
        else if (path.includes('/services')) pageTitle = `Services | ${siteTitle}`;
        else if (path.includes('/work')) pageTitle = `Work | ${siteTitle}`;
        else if (path.includes('/resume')) pageTitle = `Resume | ${siteTitle}`;
        else if (path.includes('/contact')) pageTitle = `Contact | ${siteTitle}`;
        
        document.title = pageTitle;

        setMeta('description', siteDesc);
        setMeta('keywords', siteKeys);
        
        // Open Graph
        setMeta('og:title', pageTitle, 'property');
        setMeta('og:description', siteDesc, 'property');
        setMeta('og:image', ogImage, 'property');
        setMeta('og:type', 'website', 'property');

        // Twitter
        setMeta('twitter:card', 'summary_large_image');
        setMeta('twitter:title', pageTitle);
        setMeta('twitter:description', siteDesc);
        setMeta('twitter:image', ogImage);
        
        // 0.1 Structured Data (JSON-LD)
        const schema = {
          "@context": "https://schema.org",
          "@type": "Person",
          "name": settings.resume_full_name || "Ezinna Nweke Emmanuel",
          "jobTitle": "AI & Fullstack Developer",
          "url": window.location.origin,
          "sameAs": [
            settings.social_linkedin,
            settings.social_github,
            settings.social_instagram,
            settings.social_twitter
          ].filter(link => link),
          "description": siteDesc
        };
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify(schema);
        document.head.appendChild(script);

        // 1. GLOBAL HYDRATION (Home & About)
        
        // Navbar / Branding
        if (settings.site_logo_text) {
            const logoWraps = document.querySelectorAll('.navbar-logo');
            logoWraps.forEach(wrap => {
                wrap.innerHTML = `<span style="font-size: 24px; font-weight: 800; color: currentColor; display: block; letter-spacing: -0.5px;">${settings.site_logo_text}</span>`;
            });
        }

        // Standardized Page Headings
        const globalHeading = document.querySelector('.section-heading');
        if (globalHeading) {
            const path = window.location.pathname;
            if (path.includes('/services') && !path.includes('/services/')) {
                globalHeading.textContent = settings.label_nav_services || 'Services';
            } else if (path.includes('/work') && !path.includes('/work/')) {
                globalHeading.textContent = 'Selected Projects';
            } else if (path.includes('/testimonials')) {
                globalHeading.textContent = 'Testimonials';
            } else if (path.includes('/contact')) {
                globalHeading.textContent = settings.label_contact_heading || 'Contact Us';
            }
        }

        // Hero Content (Home)
        if (settings.hero_eyebrow) {
            const el = document.querySelector('.home-hero-subheading');
            if (el) el.textContent = settings.hero_eyebrow;
        }
        if (settings.hero_headline) {
            const el = document.querySelector('.home-hero-heading');
            if (el) {
                const headlines = settings.hero_headline.split('\n').map(s => s.trim()).filter(s => s);
                el.textContent = headlines[0] || settings.hero_headline;
                if (headlines.length > 1) {
                    let timing = parseInt(settings.hero_headline_timing);
                    if (isNaN(timing) || timing < 2) timing = 7;
                    timing = timing * 1000;

                    let hIndex = 0;
                    el.style.transition = 'opacity 0.6s ease-in-out';
                    setInterval(() => {
                        el.style.opacity = '0';
                        setTimeout(() => {
                            hIndex = (hIndex + 1) % headlines.length;
                            el.textContent = headlines[hIndex];
                            el.style.opacity = '1';
                        }, 600);
                    }, timing);
                }
            }
        }
        if (settings.hero_text) {
            const el = document.getElementById('db-hero-text') || document.querySelector('.home-hero-text');
            if (el) {
                el.textContent = settings.hero_text;
                el.style.opacity = '1';
                el.style.transform = 'translate3d(0px, 0px, 0px)';
                el.style.display = 'block';
            }
        } else {
            const el = document.getElementById('db-hero-text') || document.querySelector('.home-hero-text');
            if (el) el.style.display = 'none';
        }
        // Hero Media (Image or Spline 3D)
        const heroMediaType = settings.hero_media_type || 'image';
        const heroImageEl = document.querySelector('.home-hero-image');
        if (heroMediaType === 'spline' && settings.hero_spline_url && heroImageEl) {
            // Spline 3D Mode — use mix-blend-mode to make black bg invisible
            const wrapper = heroImageEl.closest('.home-hero-image-wrapper') || heroImageEl.parentElement;
            heroImageEl.innerHTML = '';
            heroImageEl.classList.remove('skeleton');
            heroImageEl.style.height = 'auto';
            heroImageEl.style.minHeight = '480px';
            heroImageEl.style.overflow = 'visible';
            heroImageEl.style.borderRadius = '0';
            heroImageEl.style.background = 'transparent';
            if (wrapper) {
                wrapper.style.background = 'transparent';
                wrapper.style.overflow = 'visible';
            }
            const splineEl = document.createElement('spline-viewer');
            splineEl.setAttribute('url', settings.hero_spline_url);
            splineEl.style.width = '100%';
            splineEl.style.height = '100%';
            splineEl.style.minHeight = '480px';
            splineEl.style.display = 'block';
            splineEl.style.background = 'transparent';
            splineEl.style.borderRadius = '0';
            // mix-blend-mode: screen makes black pixels fully transparent
            splineEl.style.mixBlendMode = 'screen';
            heroImageEl.appendChild(splineEl);
        } else if (heroMediaType === 'video' && settings.hero_video && heroImageEl) {
            // Video Mode — transparent container for alpha-channel videos (WebM)
            const wrapper = heroImageEl.closest('.home-hero-image-wrapper') || heroImageEl.parentElement;
            heroImageEl.innerHTML = '';
            heroImageEl.classList.remove('skeleton');
            // Force-reset ALL inline styles to eliminate Framer's baked-in border-radius
            heroImageEl.setAttribute('style', 'width:100%;min-height:480px;display:block;background:transparent!important;overflow:visible!important;border-radius:0!important;border:none!important;');
            if (wrapper) {
                wrapper.style.background = 'transparent';
                wrapper.style.overflow = 'visible';
                wrapper.style.boxShadow = 'none';
            }
            // Inject CSS override to kill any stylesheet backgrounds on the hero container
            const heroOverride = document.createElement('style');
            const isRemoveBg = settings.hero_video_remove_bg === '1';
            heroOverride.textContent = `
                .home-hero-image, .home-hero-image-wrapper {
                    background: transparent !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border-radius: 0 !important;
                    overflow: visible !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                .home-hero-image video {
                    background: transparent !important;
                    ${isRemoveBg ? 'mix-blend-mode: screen !important;' : ''}
                }
            `;
            document.head.appendChild(heroOverride);
            
            const videoEl = document.createElement('video');
            videoEl.src = settings.hero_video;
            videoEl.autoplay = true;
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            
            // Apply scale if set (default 100%)
            const scale = settings.hero_video_size ? (settings.hero_video_size / 100) : 1;
            videoEl.style.cssText = `width:100%;height:auto;min-height:480px;object-fit:contain;display:block;background:transparent!important;border-radius:0;border:none;transform:scale(${scale});transform-origin:center;`;
            
            heroImageEl.appendChild(videoEl);
        } else if (settings.hero_image && heroImageEl) {
            // Standard Image Mode
            if (heroImageEl.tagName === 'IMG') {
                heroImageEl.src = settings.hero_image;
                heroImageEl.removeAttribute('srcset');
            } else {
                heroImageEl.innerHTML = `<img src="${settings.hero_image}" loading="eager" fetchpriority="high" alt="${settings.founder_name || 'Jomiez Innovation founder'} — Software Developer & CEO" width="600" height="480" style="width: 100%; height: auto; min-height: 480px; object-fit: cover; display: block; border-radius: 12px;"/>`;
                heroImageEl.style.height = 'auto';
            }
            heroImageEl.classList.remove('skeleton');
        }
        if (settings.brands_heading) {
            const el = document.querySelector('.brands-heading');
            if (el) el.textContent = settings.brands_heading;
        }

        if (settings.hero_active_text) {
            const el = document.querySelector('.home-hero-active-text');
            if (el) el.textContent = settings.hero_active_text;
        }

        if (settings.hero_rating_text) {
            const el = document.querySelector('.home-hero-rating-text');
            if (el) el.textContent = settings.hero_rating_text;
        }

        if (settings.hero_rating_score) {
            const el = document.querySelector('.home-hero-rating-type');
            if (el) el.textContent = settings.hero_rating_score;
        }

        if (settings.skills_heading) {
            const el = document.querySelector('.skills-heading');
            if (el) el.textContent = settings.skills_heading;
        }

        if (settings.tools_heading) {
            const el = document.querySelector('.tools-heading');
            if (el) el.textContent = settings.tools_heading;
        }

        // Footer Content
        if (settings.company_name || settings.powered_by_name) {
            const company = settings.company_name || 'Jomiez';
            const poweredName = settings.powered_by_name || 'Chaka';
            const poweredLink = settings.powered_by_link || '#';
            const dateYear = new Date().getFullYear();

            const footerTexts = document.querySelectorAll('.footer-text');
            footerTexts.forEach(ft => {
                const hasKeywords = ft.textContent.includes('Copyright') || ft.textContent.includes('Webflow') || ft.textContent.includes('ResumX') || ft.textContent.includes('All Rights Reserved');
                const hasSkeleton = ft.querySelector('.skeleton');
                if (hasKeywords || hasSkeleton) {
                    ft.innerHTML = `© Copyright ${dateYear} | ${company} All Rights Reserved. | Powered by <a href="${poweredLink}" target="_blank" style="color: #00e0ff; font-weight: 700; text-decoration: none;">${poweredName}</a>`;
                }
            });
        }

        if (settings.footer_watermark_image) {
            const watermarks = document.querySelectorAll('.footer-watemark');
            watermarks.forEach(wm => {
                wm.src = settings.footer_watermark_image;
                wm.removeAttribute('srcset');
            });
        }

        // Contact Info Global Hydration
        if (settings.contact_email) {
            document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
                a.href = `mailto:${settings.contact_email}`;
                a.textContent = settings.contact_email;
            });
        }
        if (settings.contact_phone) {
            document.querySelectorAll('a[href^="tel:"]').forEach(a => {
                a.href = `tel:${settings.contact_phone}`;
                a.textContent = settings.contact_phone;
            });
        }

        // Social Links Global Hydration
        if (settings.social_facebook) {
            document.querySelectorAll('a[href*="facebook.com"]').forEach(a => a.href = settings.social_facebook);
        }
        if (settings.social_whatsapp) {
            document.querySelectorAll('a[href*="wa.me"]').forEach(a => a.href = settings.social_whatsapp);
        }
        if (settings.social_github) {
            document.querySelectorAll('a[href*="github.com"]').forEach(a => a.href = settings.social_github);
        }
        if (settings.social_instagram) {
            document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = settings.social_instagram);
        }
        if (settings.social_linkedin) {
            document.querySelectorAll('a[href*="linkedin.com"]').forEach(a => a.href = settings.social_linkedin);
        }
        if (settings.social_youtube) {
            document.querySelectorAll('a[href*="youtube.com"]').forEach(a => a.href = settings.social_youtube);
        }

        // About Page Specifics
        if (settings.about_hero_heading) {
            const el = document.querySelector('.about-hero-heading');
            if (el) el.textContent = settings.about_hero_heading;
        }

        if (settings.about_hero_image) {
            const el = document.querySelector('.about-hero-image');
            if (el) {
                if (el.tagName === 'IMG') {
                    el.src = settings.about_hero_image;
                    el.removeAttribute('srcset');
                } else {
                    el.innerHTML = `<img src="${settings.about_hero_image}" loading="eager" fetchpriority="high" alt="Jomiez Innovation team — Software developers and engineers" width="800" height="600" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;"/>`;
                }
                el.classList.remove('skeleton');
            }
        }
        
        if (settings.about_me_page_text) {
            const textWrap = document.querySelector('.about-text-wrap');
            if (textWrap) {
                textWrap.innerHTML = '';
                const fullText = settings.about_me_page_text;
                const words = fullText.split(/\s+/).filter(w => w.length > 0);
                
                // Group into 2-3 word phrases like the original
                const chunkSize = 3;
                const phrases = [];
                for (let i = 0; i < words.length; i += chunkSize) {
                    phrases.push(words.slice(i, i + chunkSize).join(' '));
                }
                
                const h4 = document.createElement('h4');
                h4.className = 'about-text';
                
                const spans = [];
                phrases.forEach((phrase, i) => {
                    const span = document.createElement('span');
                    span.className = `about-text-${String(i + 1).padStart(2, '0')}`;
                    span.style.color = 'rgb(84, 88, 92)';
                    span.style.transition = 'color 0.2s ease-out';
                    span.textContent = phrase + ' ';
                    h4.appendChild(span);
                    spans.push(span);
                });
                
                textWrap.appendChild(h4);
                
                const dimR = 84, dimG = 88, dimB = 92;
                const brightR = 255, brightG = 255, brightB = 255;
                const total = spans.length;
                
                function updateWaveColors() {
                    const viewportH = window.innerHeight;
                    const wrapRect = textWrap.getBoundingClientRect();
                    
                    // Progress based on the text wrap element itself:
                    const startY = viewportH * 0.8;  // animation starts here
                    const endY = viewportH * 0.15;   // animation completes here
                    
                    const rawProgress = (startY - wrapRect.top) / (startY - endY);
                    const currentProgress = Math.max(0, Math.min(1, rawProgress));
                    
                    // Map progress to phrase index
                    const activeFloat = currentProgress * total;
                    const activeIndex = Math.floor(activeFloat);
                    const activeFraction = activeFloat - activeIndex; // 0→1 within current phrase
                    
                    spans.forEach((span, idx) => {
                        if (idx < activeIndex) {
                            span.style.color = `rgb(${brightR}, ${brightG}, ${brightB})`;
                        } else if (idx === activeIndex) {
                            const r = Math.round(dimR + activeFraction * (brightR - dimR));
                            const g = Math.round(dimG + activeFraction * (brightG - dimG));
                            const b = Math.round(dimB + activeFraction * (brightB - dimB));
                            span.style.color = `rgb(${r}, ${g}, ${b})`;
                        } else {
                            span.style.color = `rgb(${dimR}, ${dimG}, ${dimB})`;
                        }
                    });
                }
                
                let ticking = false;
                function onScrollRequest() {
                    if (!ticking) {
                        ticking = true;
                        requestAnimationFrame(() => {
                            updateWaveColors();
                            ticking = false;
                        });
                    }
                }
                
                window.addEventListener('scroll', onScrollRequest, { passive: true });
                window.addEventListener('resize', onScrollRequest, { passive: true });
                setTimeout(updateWaveColors, 100);
                updateWaveColors();
            }
        }

        if (settings.about_me_page_image) {
            const el = document.querySelector('.about-image');
            if (el) {
                if (el.tagName === 'IMG') {
                    el.src = settings.about_me_page_image;
                    el.removeAttribute('srcset');
                } else {
                    el.outerHTML = `<img src="${settings.about_me_page_image}" loading="lazy" alt="${settings.founder_name || 'Ezinna Emmanuel Nweke'} — Founder & CEO of Jomiez Innovation" class="about-image" id="db-about-image" width="600" height="450" style="width: 100%; height: auto; min-height: 450px; object-fit: cover; display: block; border-radius: 12px;"/>`;
                }
            }
        }

        // About Video Background — only show if user uploaded a video
        if (settings.about_video_url) {
            const videoSection = document.getElementById('db-about-video-section');
            const videoEl = document.getElementById('fd14d70e-d140-05bc-d9f9-35a2f4f439e1-video') || document.querySelector('.video video');
            if (videoEl) {
                // Clear any existing sources and inject the uploaded one
                videoEl.querySelectorAll('source').forEach(s => s.remove());
                const source = document.createElement('source');
                source.src = cloudinaryVideoUrl(settings.about_video_url);
                source.setAttribute('data-wf-ignore', 'true');
                videoEl.appendChild(source);
                
                if (settings.about_video_poster) {
                    videoEl.style.backgroundImage = `url("${settings.about_video_poster}")`;
                    videoEl.setAttribute('poster', settings.about_video_poster);
                }
                
                videoEl.setAttribute('muted', '');
                videoEl.setAttribute('playsinline', '');
                videoEl.setAttribute('autoplay', '');
                videoEl.muted = true;
                videoEl.playsInline = true;

                videoEl.load();
                // Try to autoplay after source loads
                const playPromise = videoEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.log("[DYNAMIC] Autoplay prevented, retrying in 1s...", error);
                        setTimeout(() => videoEl.play().catch(() => {}), 1000);
                    });
                }
                
                videoEl.addEventListener('canplay', () => {
                    videoEl.play().catch(() => {});
                }, { once: true });
            }
            // Also update data attributes on wrapper for Webflow scripts
            const wrapper = document.querySelector('.video.w-background-video');
            if (wrapper) {
                const videoUrl = cloudinaryVideoUrl(settings.about_video_url);
                wrapper.setAttribute('data-video-urls', videoUrl);
                wrapper.dataset.videoUrls = videoUrl; // Some scripts use dataset
                if (settings.about_video_poster) {
                    wrapper.setAttribute('data-poster-url', settings.about_video_poster);
                    wrapper.dataset.posterUrl = settings.about_video_poster;
                }
            }
            // Show the section now that we have a video
            if (videoSection) {
                videoSection.style.display = '';
            }
        }

        // Footer Content
        if (settings.footer_cta) {
            const el = document.querySelector('.cta-heading') || document.querySelector('.footer-newsletter-title');
            if (el) el.textContent = settings.footer_cta;
        }

        if (window.location.pathname.includes('/resume')) {
            // ========== RESUME PAGE SKELETON HYDRATION ==========
            // Every element with a db-* ID gets its content fresh from DB/admin

            // --- Page Title (browser tab) ---
            if (settings.label_resume_page_title) {
                document.title = settings.label_resume_page_title;
            }

            // --- Hero Heading ---
            const heroWrapper = document.querySelector('.services-wrapper') || document.querySelector('.services-details-wrapper');
            if (heroWrapper) {
                const heroH1 = document.getElementById('db-page-heading') || heroWrapper.querySelector('.section-heading');
                if (heroH1) heroH1.textContent = settings.label_hero_heading || 'Resume';
            }

            // --- Resume Intro / Eyebrow ---
            if (settings.resume_intro) {
                const eyebrow = document.querySelector('.resume-hero-title');
                if (eyebrow) eyebrow.textContent = settings.resume_intro;
            }

            // --- Resume Image / Embed (db-resume-container) ---
            const resumeContainer = document.getElementById('db-resume-container');
            if (resumeContainer) {
                const emptyStateHTML = `
                    <div style="width: 100%; height: 600px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.2); border-radius: 12px; color: #666; background: rgba(0,0,0,0.2); text-align: center; padding: 40px;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px; opacity: 0.5;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <h4 style="font-size: 18px; font-weight: 500; color: #fff; margin: 0 0 8px 0;">No Resume Document Uploaded</h4>
                        <p style="font-size: 14px; color: #a0a0a0; margin: 0;">Upload a PDF or Image via the Admin Panel to display it here.</p>
                    </div>
                `;

                if (settings.resume_image) {
                    // Create the image element safely to avoid attribute quote conflicts
                    const img = document.createElement('img');
                    img.src = settings.resume_image;
                    img.loading = 'lazy';
                    img.alt = 'Resume Preview';
                    img.style.cssText = 'width: 100%; max-width: 800px; height: auto; border-radius: 12px; display: block; margin: 0 auto; min-height: 200px;';
                    
                    img.onerror = function() {
                        resumeContainer.innerHTML = emptyStateHTML;
                    };
                    
                    resumeContainer.innerHTML = '';
                    resumeContainer.appendChild(img);
                } else if (settings.resume_url && settings.resume_url !== '#') {
                    const url = settings.resume_url.toLowerCase();
                    const isPDF = url.endsWith('.pdf');
                    
                    if (isPDF) {
                        // If a PDF is uploaded, show an embedded viewer
                        resumeContainer.innerHTML = `<iframe src="${settings.resume_url}" style="width: 100%; height: 1130px; border: none; border-radius: 12px; background: rgba(255,255,255,0.02);" title="Resume Document"></iframe>`;
                    } else {
                        // For .docx, .doc, etc. show a download/preview card
                        const ext = url.split('.').pop().toUpperCase();
                        resumeContainer.innerHTML = `
                            <div style="width: 100%; height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(255,255,255,0.02); text-align: center; padding: 40px;">
                                <div style="width: 64px; height: 64px; background: rgba(232,96,44,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; color: #E8602C;">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                </div>
                                <h4 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 12px;">Resume Document (${ext})</h4>
                                <p style="font-size: 15px; color: rgba(255,255,255,0.6); margin: 0 0 24px; max-width: 400px;">Your resume is available as a ${ext} file. You can download it to view the full details.</p>
                                <a href="${settings.resume_url}" download class="secondary-button w-inline-block" style="padding: 12px 32px; border-radius: 100px; background: #E8602C; color: #fff; text-decoration: none; font-weight: 600;">Download Resume</a>
                            </div>
                        `;
                    }
                } else {
                    // Fallback to stylized empty state
                    resumeContainer.innerHTML = emptyStateHTML;
                }
            }

            // --- Action Buttons (View Full Screen / Download PDF) ---
            const buttonsContainer = resumeContainer ? resumeContainer.closest('.services-details-block')?.previousElementSibling || null : null;
            const btnWrap = document.querySelector('.services-details-block.text .services-details-text > div:first-child');
            if (btnWrap && btnWrap.querySelector('.skeleton')) {
                const viewLabel = settings.label_view_fullscreen || 'View Full Screen';
                const dlLabel = settings.label_download_pdf || 'Download PDF';
                const resumeFileUrl = settings.resume_url && settings.resume_url !== '#' ? settings.resume_url : null;
                const resumeImgUrl = settings.resume_image || null;
                
                // Prioritize image for View, but file for Download
                const viewTarget = resumeImgUrl || resumeFileUrl || '#';
                const dlTarget = resumeFileUrl || resumeImgUrl || '#';

                btnWrap.innerHTML = `
                    <a data-wf--secondary-button--variant="base" href="${viewTarget}" target="_blank" rel="noopener" class="secondary-button w-inline-block"><div class="secondary-button-text">${viewLabel}</div><div class="secondary-button-bg"></div></a>
                    <a data-wf--secondary-button--variant="base" href="${dlTarget}" download class="secondary-button w-inline-block"><div class="secondary-button-text">${dlLabel}</div><div class="secondary-button-bg"></div></a>
                `;
            }

            // --- Bio Text (db-bio) ---
            const bioEl = document.getElementById('db-bio');
            if (bioEl && settings.resume_text) {
                bioEl.innerHTML = `<p style="font-size: 16px; line-height: 1.7; color: rgba(255,255,255,0.8); margin: 0;">${settings.resume_text}</p>`;
            }

            // --- Profile Card (db-profile-card) ---
            const profileCard = document.getElementById('db-profile-card');
            if (profileCard) {
                const fullName = settings.resume_full_name || 'Your Name';
                const location = settings.resume_location || 'Location';
                const openTo = settings.resume_open_to || '';
                const profileImg = settings.resume_profile_image || '';
                const initials = fullName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

                let avatarHTML;
                if (profileImg) {
                    avatarHTML = `<img src="${profileImg}" alt="${fullName} — Jomiez Innovation client" width="68" height="68" style="width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #E8602C;" />`;
                } else {
                    avatarHTML = `<div style="width: 68px; height: 68px; border-radius: 50%; background: transparent; border: 2px solid #E8602C; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: #E8602C;">${initials}</div>`;
                }

                profileCard.innerHTML = `
                    ${avatarHTML}
                    <div style="flex: 1;">
                        <h3 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 4px;">${fullName}</h3>
                        <p style="font-size: 14px; color: #a0a0a0; margin: 0;">${location}${openTo ? ' · ' + openTo : ''}</p>
                    </div>
                `;
            }

            // --- Core Stack Label (db-label-core-stack) ---
            const coreStackLabel = document.getElementById('db-label-core-stack');
            if (coreStackLabel) {
                coreStackLabel.textContent = settings.label_core_stack || 'Core Stack';
            }

            // --- Core Stack Pills (db-core-stack) — CATEGORIZED ---
            const coreStack = document.getElementById('db-core-stack');
            if (coreStack) {
                const categories = [
                    { key: 'resume_stack_frontend', label: 'Frontend' },
                    { key: 'resume_stack_backend', label: 'Backend' },
                    { key: 'resume_stack_ai', label: 'AI / ML' },
                    { key: 'resume_stack_databases', label: 'Databases' },
                    { key: 'resume_stack_devops', label: 'DevOps & Tools' },
                    { key: 'resume_stack_libraries', label: 'APIs & Libraries' },
                ];
                const hasCategories = categories.some(c => settings[c.key]);

                if (hasCategories) {
                    coreStack.innerHTML = categories.map(cat => {
                        if (!settings[cat.key]) return '';
                        const techs = settings[cat.key].split(',').map(t => t.trim()).filter(t => t);
                        if (!techs.length) return '';
                        return `
                            <div style="margin-bottom: 20px;">
                                <h5 style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px;">${cat.label}</h5>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                    ${techs.map(tech => `<span style="display: inline-flex; align-items: center; padding: 8px 18px; border: 1px solid rgba(255,255,255,0.15); border-radius: 100px; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500; white-space: nowrap;">${tech}</span>`).join('')}
                                </div>
                            </div>
                        `;
                    }).join('');
                } else if (settings.resume_core_stack) {
                    // Fallback: old flat comma-separated format
                    const techs = settings.resume_core_stack.split(',').map(t => t.trim()).filter(t => t);
                    coreStack.innerHTML = techs.map(tech => `
                        <span style="display: inline-flex; align-items: center; padding: 8px 18px; border: 1px solid rgba(255,255,255,0.15); border-radius: 100px; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500; white-space: nowrap;">${tech}</span>
                    `).join('');
                }
            }

            // --- Find Me Online Label (db-label-find-me) ---
            const findMeLabel = document.getElementById('db-label-find-me');
            if (findMeLabel) {
                findMeLabel.textContent = settings.label_find_me_online || 'Find Me Online';
            }

            // --- Social Links (db-social-links) ---
            const socialLinks = document.getElementById('db-social-links');
            if (socialLinks) {
                const links = [];
                if (settings.social_linkedin && settings.social_linkedin !== '#') {
                    links.push({ icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`, label: 'LinkedIn', url: settings.social_linkedin });
                }
                if (settings.social_github && settings.social_github !== '#') {
                    links.push({ icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`, label: 'GitHub', url: settings.social_github });
                }
                if (settings.contact_email) {
                    links.push({ icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`, label: settings.contact_email, url: `mailto:${settings.contact_email}` });
                }

                if (links.length > 0) {
                    socialLinks.innerHTML = links.map(link => `
                        <a href="${link.url}" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: space-between; gap: 14px; color: rgba(255,255,255,0.85); text-decoration: none; font-size: 15px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); transition: color 0.3s;">
                            <span style="display: flex; align-items: center; gap: 14px;">
                                <span style="display: flex; align-items: center; color: rgba(255,255,255,0.5);">${link.icon}</span>
                                ${link.label}
                            </span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8602C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                        </a>
                    `).join('');
                }
            }

            // --- Areas of Expertise Label (db-label-expertise) ---
            const expertiseLabel = document.getElementById('db-label-expertise');
            if (expertiseLabel) {
                expertiseLabel.textContent = settings.label_areas_expertise || 'Areas of Expertise';
            }

            // --- Expertise Grid (db-expertise-grid) ---
            const expertiseGrid = document.getElementById('db-expertise-grid');
            if (expertiseGrid && settings.resume_expertise) {
                try {
                    const items = JSON.parse(settings.resume_expertise);
                    if (Array.isArray(items) && items.length > 0) {
                        // SVG icon map for expertise cards
                        const expertiseIcons = {
                            brain: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h.01M12 12h.01M16 12h.01"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M8 8c0-1 .5-2 2-2s2 1 2 2-.5 2-2 2"/><path d="M14 16c0 1-.5 2-2 2s-2-1-2-2 .5-2 2-2"/></svg>',
                            code: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
                            palette: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
                            layers: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>',
                            star: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
                            zap: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
                        };

                        expertiseGrid.innerHTML = items.map(item => `
                            <div style="background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px;">
                                <div style="width: 44px; height: 44px; border-radius: 10px; background: rgba(232,96,44,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: #E8602C;">
                                    ${expertiseIcons[item.icon] || expertiseIcons.star}
                                </div>
                                <h5 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 8px;">${item.title}</h5>
                                <p style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.6); margin: 0;">${item.description || item.desc || ''}</p>
                            </div>
                        `).join('');
                    }
                } catch(e) {
                    console.warn('[Resume] Failed to parse expertise JSON:', e);
                }
            }

            } // <--- END OF /resume block

            // --- Footer Phone (db-phone) ---
            const phoneEl = document.getElementById('db-phone');
            if (phoneEl && settings.contact_phone) {
                phoneEl.href = `tel:${settings.contact_phone}`;
                phoneEl.innerHTML = settings.contact_phone;
            }

            // --- Footer Email (db-email) ---
            const emailEl = document.getElementById('db-email');
            if (emailEl && settings.contact_email) {
                emailEl.href = `mailto:${settings.contact_email}`;
                emailEl.innerHTML = settings.contact_email;
            }

            // --- Footer Logo ---
            const footerLogo = document.querySelector('.footer-watemark');
            if (footerLogo) {
                const footerImgSrc = settings.footer_watermark_image || settings.site_logo;
                if (footerImgSrc) {
                    if (footerLogo.tagName === 'IMG') {
                        footerLogo.src = footerImgSrc;
                        footerLogo.removeAttribute('srcset');
                    } else {
                        footerLogo.outerHTML = `<img src="${footerImgSrc}" loading="lazy" alt="Jomiez Innovation Logo" class="footer-watemark" style="width:100%;height:auto;object-fit:contain;" />`;
                    }
                    if (footerLogo.classList) footerLogo.classList.remove('skeleton');
                } else if (settings.site_logo_text) {
                    footerLogo.innerHTML = `<span style="font-size: 32px; font-weight: 800; color: currentColor; letter-spacing: -1px; display:flex; align-items:center; height:100%;">${settings.site_logo_text}</span>`;
                    if (footerLogo.classList) footerLogo.classList.remove('skeleton');
                }
            }

            // --- Nav Logo (db-nav-logo) ---
            // The global .navbar-logo hydration handles text, but we also need to unwrap the skeleton
            const navLogoWrap = document.getElementById('db-nav-logo');
            if (navLogoWrap) {
                const skel = navLogoWrap.querySelector('.skeleton');
                if (skel && settings.site_logo_text) {
                    skel.remove(); // Remove skeleton since global hydration already set logo text
                }
            }

            // --- CTA Heading ---
            if (settings.footer_cta) {
                const ctaH = document.querySelector('.cta-heading');
                if (ctaH) ctaH.textContent = settings.footer_cta;
            }

            // --- Form Labels & Placeholders (GLOBAL) ---
            const contactLabels = document.querySelectorAll('.contact-label');
            if (contactLabels.length >= 1 && settings.label_field_name) contactLabels[0].textContent = settings.label_field_name;
            if (contactLabels.length >= 2 && settings.label_field_last_name) contactLabels[1].textContent = settings.label_field_last_name;
            if (contactLabels.length >= 3 && settings.label_field_email) contactLabels[2].textContent = settings.label_field_email;
            if (contactLabels.length >= 4 && settings.label_field_phone) contactLabels[3].textContent = settings.label_field_phone;
            if (contactLabels.length >= 5 && settings.label_field_message) contactLabels[4].textContent = settings.label_field_message;

            // Sync Placeholders
            const firstNameInput = document.getElementById('First-Name');
            if (firstNameInput && settings.label_field_name) firstNameInput.placeholder = settings.label_field_name.replace(' *', '');
            
            const lastNameInput = document.getElementById('Last-Name');
            if (lastNameInput && settings.label_field_last_name) lastNameInput.placeholder = settings.label_field_last_name.replace(' *', '');
            
            const emailInput = document.getElementById('Email-Address');
            if (emailInput && settings.label_field_email) emailInput.placeholder = settings.label_field_email.replace(' *', '');
            
            const phoneInput = document.getElementById('Phone-Number');
            if (phoneInput && settings.label_field_phone) phoneInput.placeholder = settings.label_field_phone.replace(' *', '');
            
            const messageInput = document.getElementById('Message');
            if (messageInput && settings.label_field_message) messageInput.placeholder = settings.label_field_message.replace(' *', '');

            // Submit button text
            if (settings.label_submit_button) {
                const submitTexts = document.querySelectorAll('.primary-button-text.contact-1st, .primary-button-text.contact-2nd');
                submitTexts.forEach(el => el.textContent = settings.label_submit_button);
            }

            // --- Footer Navigation Labels ---
            const footerTitles = document.querySelectorAll('.footer-nav-title');
            if (footerTitles.length >= 1 && settings.label_footer_quick_links) footerTitles[0].textContent = settings.label_footer_quick_links;
            if (footerTitles.length >= 3 && settings.label_footer_contact) footerTitles[2].textContent = settings.label_footer_contact;

            // --- Copyright ---
            const footerTexts = document.querySelectorAll('.footer-text');
            if (footerTexts.length > 0) {
                footerTexts.forEach(ft => {
                    const company = settings.company_name || 'Jomiez';
                    const poweredName = settings.powered_by_name || 'Chaka';
                    const poweredLink = settings.powered_by_link || '#';
                    const dateYear = new Date().getFullYear();
                    ft.innerHTML = `© Copyright ${dateYear} | ${company} All Rights Reserved. | Powered by <a href="${poweredLink}" target="_blank" style="color: #00e0ff; font-weight: 700; text-decoration: none;">${poweredName}</a>`;
                });
            }
        // COUNTERS HYDRATION
        const counterWrapper = document.querySelector('.counter-wrapper');
        if (counterWrapper && counters && Array.isArray(counters) && counters.length > 0) {
            counterWrapper.innerHTML = '';
            counters.forEach(counter => {
                const valueStr = String(counter.value || '0');
                let stripsHTML = '';
                for (let i = 0; i < valueStr.length; i++) {
                    const digit = valueStr[i];
                    const isRev = (i % 2 !== 0);
                    const className = isRev ? 'number-rev' : 'number';
                    const digits = [digit, '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
                    let digitsHTML = digits.map(d => `<p class="counter-title">${d}</p>`).join('');
                    stripsHTML += `
                        <div style="transform:translate3d(0, 0%, 0); width: auto; flex: 0 0 auto; display: flex; flex-direction: column;" class="${className}">
                            ${digitsHTML}
                        </div>
                    `;
                }

                if (counter.suffix) {
                    stripsHTML += `<div class="number-text"><p class="counter-title">${counter.suffix}</p></div>`;
                }

                const wrap = document.createElement('div');
                wrap.className = 'counter-wrap';
                wrap.innerHTML = `
                    <div class="number-wrap">
                        ${stripsHTML}
                    </div>
                    <p class="counter-text">${counter.label}</p>
                `;
                counterWrapper.appendChild(wrap);
            });

            // COUNTER SCROLL ANIMATION — fully JS-driven
            const counterSection = document.querySelector('.section-counter');
            const allStrips = counterWrapper.querySelectorAll('.number, .number-rev');
            let counterAnimated = false;

            // 1. Hide all strips immediately (show "0" at bottom of strip)
            allStrips.forEach(strip => {
                strip.style.transform = 'translateY(-1000%)';
                strip.style.transition = 'none';
            });

            // 2. Function to trigger the count-up animation
            function animateCounters() {
                if (counterAnimated) return;
                counterAnimated = true;
                // Force reflow so the transition actually animates
                void counterWrapper.offsetHeight;
                allStrips.forEach((strip, index) => {
                    const isRev = strip.classList.contains('number-rev');
                    const delay = index * 100 + (isRev ? 80 : 0);
                    setTimeout(() => {
                        strip.style.transition = 'transform 1.8s cubic-bezier(0.22, 0.61, 0.36, 1)';
                        strip.style.transform = 'translateY(0%)';
                    }, delay);
                });
            }

            // 3. IntersectionObserver to trigger on scroll
            if (counterSection) {
                const counterObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            animateCounters();
                            counterObserver.disconnect();
                        }
                    });
                }, { threshold: 0.1, rootMargin: '200px 0px' });
                counterObserver.observe(counterSection);
            }

            // 4. Fallback — if observer never fires, show numbers after 3s
            setTimeout(() => {
                if (!counterAnimated) {
                    console.warn('[Counters] Fallback: forcing animation');
                    animateCounters();
                }
            }, 3000);
        }

        // SKILLS GRID HYDRATION
        if (skills.length > 0) {
            const skillsGrid = document.querySelector('.skills-content-wrapper');
            if (skillsGrid) {
                // SVG icon map matching the original template icons
                const svgIcons = {
                    star: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><path d="M39.6361 17.2448L46.5101 32.9144L62.0273 40.1257L46.3578 46.9998L39.1465 62.517L32.2724 46.8474L16.7552 39.6361L32.4247 32.762L39.6361 17.2448Z" fill="currentColor"></path></svg>',
                    sparkle: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><g clip-path="url(#clip0_368_4514)"><path d="M41.4515 19.6322C41.7304 18.282 43.7289 18.5347 43.663 19.9118L42.9097 35.6595C42.8768 36.3464 43.4661 36.8999 44.1496 36.8241L59.8193 35.0864C61.1896 34.9345 61.5668 36.9132 60.2367 37.2761L45.027 41.426C44.3635 41.607 44.0193 42.3384 44.3026 42.965L50.7973 57.3308C51.3653 58.5871 49.6 59.5573 48.8439 58.4045L40.197 45.2215C39.8199 44.6465 39.0178 44.5451 38.5094 45.0082L26.8537 55.6244C25.8345 56.5527 24.3662 55.1737 25.2289 54.0983L35.0947 41.8009C35.525 41.2645 35.3736 40.4704 34.7761 40.13L21.0777 32.3253C19.8798 31.6428 20.7376 29.8203 22.027 30.3085L36.7712 35.8912C37.4143 36.1348 38.1228 35.7454 38.2619 35.0719L41.4515 19.6322Z" fill="currentColor"></path><path d="M53.2962 24.503C54.3244 23.5845 55.7793 24.9776 54.9062 26.0447L44.9223 38.2463C44.4868 38.7786 44.6306 39.5741 45.2248 39.9202L58.8473 47.8567C60.0385 48.5507 59.1631 50.3649 57.8785 49.8643L43.1889 44.1395C42.5481 43.8898 41.836 44.2724 41.6904 44.9445L38.352 60.3527C38.06 61.7001 36.0641 61.4282 36.1433 60.0518L37.0484 44.3121C37.0879 43.6255 36.5041 43.0664 35.8198 43.1356L20.1341 44.722C18.7624 44.8607 18.4043 42.8785 19.7378 42.5284L34.9869 38.5254C35.652 38.3508 36.0033 37.6228 35.7261 36.9934L29.3702 22.5657C28.8144 21.304 30.5889 20.3508 31.3339 21.5109L39.8532 34.7766C40.2248 35.3553 41.0258 35.4644 41.5387 35.0062L53.2962 24.503Z" fill="currentColor"></path></g></svg>',
                    hexagon: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 66" fill="none" class="skills-icon"><path d="M38.8571 16.5259C40.4925 15.5817 42.5075 15.5817 44.1429 16.5259L54.8786 22.7241C56.514 23.6683 57.5215 25.4133 57.5215 27.3017V39.6983C57.5215 41.5867 56.514 43.3317 54.8786 44.2759L44.1429 50.4741C42.5075 51.4183 40.4925 51.4183 38.8571 50.4741L28.1214 44.2759C26.486 43.3317 25.4785 41.5867 25.4785 39.6983V27.3017C25.4785 25.4133 26.486 23.6683 28.1214 22.7241L38.8571 16.5259Z" fill="currentColor"></path><path d="M39.1074 9.95898C40.4955 9.15762 42.1855 9.10736 43.6113 9.80859L43.8926 9.95898L60.6904 19.6572C62.1711 20.5121 63.084 22.092 63.084 23.8018V43.1982C63.084 44.801 62.282 46.2896 60.9619 47.1738L60.6904 47.3428L43.8926 57.041C42.5045 57.8424 40.8145 57.8926 39.3887 57.1914L39.1074 57.041L22.3096 47.3428C20.8289 46.4879 19.916 44.908 19.916 43.1982V23.8018C19.916 22.199 20.718 20.7104 22.0381 19.8262L22.3096 19.6572L39.1074 9.95898Z" stroke="currentColor"></path></svg>',
                    circles: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><circle cx="34" cy="32" r="20" stroke="currentColor" stroke-width="2"></circle><circle cx="46" cy="42" r="20" stroke="currentColor" stroke-width="2"></circle></svg>',
                    target: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><rect x="14.5" y="14.5" width="50" height="50" rx="25" stroke="currentColor"></rect><rect x="25.5" y="25.5" width="28" height="28" rx="14" fill="currentColor" stroke="currentColor"></rect></svg>',
                    diamond: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 66" fill="none" class="skills-icon"><path d="M39.1329 12.4471C39.5254 11.792 40.4746 11.792 40.8671 12.4471L45.0027 19.3485C45.2316 19.7305 45.6836 19.9177 46.1156 19.8095L53.92 17.8537C54.6607 17.6681 55.3319 18.3393 55.1463 19.08L53.1905 26.8844C53.0823 27.3164 53.2695 27.7684 53.6515 27.9973L60.5529 32.1329C61.208 32.5254 61.208 33.4746 60.5529 33.8671L53.6515 38.0027C53.2695 38.2316 53.0823 38.6836 53.1905 39.1156L55.1463 46.92C55.3319 47.6607 54.6607 48.3319 53.92 48.1463L46.1156 46.1905C45.6836 46.0823 45.2316 46.2695 45.0027 46.6515L40.8671 53.5529C40.4746 54.208 39.5254 54.208 39.1329 53.5529L34.9973 46.6515C34.7684 46.2695 34.3164 46.0823 33.8844 46.1905L26.08 48.1463C25.3393 48.3319 24.6681 47.6607 24.8537 46.92L26.8095 39.1156C26.9177 38.6836 26.7305 38.2316 26.3485 38.0027L19.4471 33.8671C18.792 33.4746 18.792 32.5254 19.4471 32.1329L26.3485 27.9973C26.7305 27.7684 26.9177 27.3164 26.8095 26.8844L24.8537 19.08C24.6681 18.3393 25.3393 17.6681 26.08 17.8537L33.8844 19.8095C34.3164 19.9177 34.7684 19.7305 34.9973 19.3485L39.1329 12.4471Z" fill="currentColor"></path></svg>',
                    code: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><path d="M30 28L18 40L30 52" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M50 28L62 40L50 52" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 22L36 58" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
                    palette: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><path d="M40 14C25.64 14 14 25.64 14 40C14 54.36 25.64 66 40 66C42.21 66 44 64.21 44 62C44 61.01 43.61 60.11 42.97 59.44C42.35 58.78 41.97 57.9 41.97 56.93C41.97 54.72 43.76 52.93 45.97 52.93H51C59.28 52.93 66 46.21 66 37.93C66 24.7 54.36 14 40 14Z" stroke="currentColor" stroke-width="2.5"/><circle cx="27" cy="36" r="4" fill="currentColor"/><circle cx="35" cy="26" r="4" fill="currentColor"/><circle cx="47" cy="26" r="4" fill="currentColor"/><circle cx="55" cy="36" r="4" fill="currentColor"/></svg>',
                    layers: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><path d="M40 18L62 30L40 42L18 30L40 18Z" fill="currentColor" opacity="0.6"/><path d="M18 40L40 52L62 40" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 50L40 62L62 50" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    zap: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 80 80" fill="none" class="skills-icon"><path d="M44.67 14L22 44H40L35.33 66L58 36H40L44.67 14Z" fill="currentColor"/></svg>'
                };

                skillsGrid.innerHTML = '';
                skills.forEach(skill => {
                    const card = document.createElement('div');
                    card.className = 'skills-card';
                    card.style.opacity = '1';
                    card.style.transform = 'none';
                    card.innerHTML = `
                        ${svgIcons[skill.icon] || svgIcons.star}
                        <h4 class="skills-name">${skill.name}</h4>
                        <div class="skills-text">${skill.description || ''}</div>
                    `;
                    skillsGrid.appendChild(card);
                });
            }
        }

        // 2. WORKS GRID HYDRATION
        const worksList = document.querySelector('.work-list.w-dyn-items');
        if (worksList && works.length > 0) {
            const template = worksList.querySelector('.work-item.w-dyn-item');
            if (template) {
                worksList.innerHTML = '';
                // Home page: max 4 projects. Works page: show all.
                const isHomePage = window.location.pathname === '/' || window.location.pathname === '/home';
                const displayWorks = isHomePage ? works.slice(0, 4) : works;
                displayWorks.forEach(work => {
                    const clone = template.cloneNode(true);
                    
                    const linkEl = clone.querySelector('a');
                    if (linkEl) linkEl.href = `/work/${work.slug}`;
                    
                    const imgEl = clone.querySelector('.work-image');
                    if (imgEl && work.thumbnail_url) {
                        if (imgEl.tagName === 'IMG') {
                            imgEl.src = work.thumbnail_url;
                            imgEl.removeAttribute('srcset');
                        } else {
                            imgEl.innerHTML = `<img src="${work.thumbnail_url}" loading="lazy" alt="${work.title} — Jomiez Innovation portfolio project" width="800" height="600" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 12px;" />`;
                        }
                        imgEl.classList.remove('skeleton');
                    }
                    
                    const nameEl = clone.querySelector('.work-name') || clone.querySelector('h3');
                    if (nameEl) nameEl.textContent = work.title;

                    const excerptEl = clone.querySelector('.work-except') || clone.querySelector('p');
                    if (excerptEl) excerptEl.textContent = work.description;

                    worksList.appendChild(clone);
                });
            }
        }

        // 3. PROJECT DETAIL PAGE HYDRATION
        // Check if we are on a work detail page
        if (window.location.pathname.startsWith('/work/')) {
            // Handle slug extraction (strip trailing slash)
            const pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
            const slug = pathParts[pathParts.length - 1];
            const work = works.find(w => w.slug === slug);
            if (work) {
                document.title = `${work.title} | Portfolio`;
                
                // Hero image
                const heroImg = document.querySelector('.work-details-image');
                if (heroImg && work.thumbnail_url) {
                    if (heroImg.tagName === 'IMG') {
                        heroImg.src = work.thumbnail_url;
                        heroImg.removeAttribute('srcset');
                    } else {
                        heroImg.innerHTML = `<img src="${work.thumbnail_url}" loading="eager" alt="${work.title} — case study hero image | Jomiez Innovation" width="1200" height="630" style="width: 100%; height: 100%; object-fit: cover; display: block;" />`;
                    }
                    heroImg.classList.remove('skeleton');
                }

                // Category badge
                const categoryEl = document.querySelector('.work-details-category');
                if (categoryEl) {
                    categoryEl.textContent = work.category || 'Design';
                    categoryEl.href = `/category/${(work.category || 'design').toLowerCase().replace(/\s+/g, '-')}`;
                }

                // Main heading
                const titleEl = document.querySelector('.work-details-name');
                if (titleEl) titleEl.textContent = work.title;

                // Description/summary
                const summaryEl = document.querySelector('.work-details-summery');
                if (summaryEl) summaryEl.textContent = work.description;

                // Info sidebar fields (Date, Project, Customer, Link)
                const infoWhiteEls = document.querySelectorAll('.work-details-info-text.white');
                if (infoWhiteEls.length >= 1) infoWhiteEls[0].textContent = work.date || '2025';
                if (infoWhiteEls.length >= 2) infoWhiteEls[1].textContent = work.category || 'Design';
                if (infoWhiteEls.length >= 3) infoWhiteEls[2].textContent = work.client || 'Client';
                if (infoWhiteEls.length >= 4) {
                    const linkUrl = work.project_link || '#';
                    const linkText = linkUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'View Project';
                    infoWhiteEls[3].textContent = linkText;
                    
                    // If it's a div, we might want to wrap it or just change the HTML.
                    // For now, let's assume we'll change it to an <a> tag in the HTML.
                    if (infoWhiteEls[3].tagName === 'A') {
                        infoWhiteEls[3].href = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
                        infoWhiteEls[3].target = '_blank';
                        infoWhiteEls[3].style.textDecoration = 'underline';
                    }
                }

                // ===== GALLERY IMAGES =====
                // images is an array: [gallery1_url, gallery2_url, fullwidth_url]
                const imgs = Array.isArray(work.images) ? work.images : [];
                
                // Gallery image 1 (left side)
                const galleryImgs = document.querySelectorAll('.work-project-image');
                if (galleryImgs.length >= 1 && imgs[0]) {
                    galleryImgs[0].src = imgs[0];
                    galleryImgs[0].removeAttribute('srcset');
                }
                // Gallery image 2 (right side)
                if (galleryImgs.length >= 2 && imgs[1]) {
                    galleryImgs[1].src = imgs[1];
                    galleryImgs[1].removeAttribute('srcset');
                }
                // Full-width image 3
                const fullImg = document.querySelector('.work-project-img-main');
                if (fullImg && imgs[2]) {
                    fullImg.src = imgs[2];
                    fullImg.removeAttribute('srcset');
                }

                // Lower project section - name
                const projectName = document.querySelector('.work-project-name');
                if (projectName) projectName.textContent = work.title;

                // Lower project section - content
                const projectExcerpt = document.querySelector('.work-project-except');
                if (projectExcerpt) {
                    if (work.content) {
                        projectExcerpt.innerHTML = work.content;
                    } else {
                        projectExcerpt.textContent = work.description;
                    }
                }
            }
        }


        // 4. SERVICES LIST HYDRATION (service.html + home.html + detail)
        if (services.length > 0) {
            const currentSlug = window.location.pathname.replace(/\/+$/, '').split('/').pop();
            const isServiceDetail = window.location.pathname.startsWith('/services/');

            const servicesLists = document.querySelectorAll('.services-list.w-dyn-items');
            servicesLists.forEach(list => {
                const isRelated = list.closest('.section-seivecs') !== null;
                const template = list.querySelector('.services-item.w-dyn-item');
                if (!template) return;
                list.innerHTML = '';

                let sToRender = services;
                if (isServiceDetail && isRelated) {
                    sToRender = services.filter(s => s.slug !== currentSlug).slice(0, 2);
                }

                sToRender.forEach(svc => {
                    const clone = template.cloneNode(true);
                    clone.style.opacity = '1';
                    clone.style.transform = 'none';

                    // Remove all skeletons from the clone immediately
                    clone.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));

                    // Replace empty img with svg arrow for default state
                    const defaultBtnImg = clone.querySelector('img.services-button.default');
                    const activeBtnSvg = clone.querySelector('svg.services-button.active');
                    if (defaultBtnImg && activeBtnSvg) {
                        const defaultSvg = activeBtnSvg.cloneNode(true);
                        defaultSvg.setAttribute('class', 'services-button default');
                        defaultBtnImg.parentNode.replaceChild(defaultSvg, defaultBtnImg);
                    }

                    // Link
                    const link = clone.querySelector('.services-wrap');
                    if (link) link.href = `/services/${svc.slug}`;

                    // Title
                    const heading = clone.querySelector('.services-heading');
                    if (heading) heading.textContent = svc.title;

                    // Description
                    const summary = clone.querySelector('.services-summery');
                    if (summary) summary.textContent = svc.description || '';

                    // Hover image (desktop)
                    const hoverImgs = clone.querySelectorAll('.services-image');
                    const desktopImgWrap = clone.querySelector('.services-image-wrap:not(.display-none-for-desktop)');
                    
                    if (svc.image_url) {
                        hoverImgs.forEach(img => {
                            img.src = svc.image_url;
                            img.classList.remove('skeleton');
                        });
                        if (desktopImgWrap) desktopImgWrap.classList.remove('skeleton');
                    } else {
                        if (desktopImgWrap) desktopImgWrap.style.display = 'none';
                    }

                    // Mobile image
                    const mobileWrap = clone.querySelector('.services-image-wrap.display-none-for-desktop');
                    if (svc.hover_image_url && mobileWrap) {
                        const mobileImg = mobileWrap.querySelector('.services-image');
                        if (mobileImg) {
                            if (mobileImg.tagName === 'IMG') {
                                mobileImg.src = svc.hover_image_url;
                                mobileImg.removeAttribute('srcset');
                            } else {
                                mobileImg.style.backgroundImage = `url("${svc.hover_image_url}")`;
                                mobileImg.style.backgroundSize = 'cover';
                            }
                            mobileImg.classList.remove('skeleton');
                        }
                    } else if (mobileWrap) {
                        mobileWrap.style.display = 'none';
                    }

                    // Arrow / Button Fix (Force SVG arrow to show)
                    const svcBtnDefault = clone.querySelector('.services-button.default');
                    const svcBtnActive = clone.querySelector('.services-button.active');
                    if (svcBtnDefault) svcBtnDefault.style.display = 'none';
                    if (svcBtnActive) {
                        svcBtnActive.style.display = 'block';
                        svcBtnActive.style.opacity = '1';
                        svcBtnActive.style.visibility = 'visible';
                    }

                    list.appendChild(clone);
                });
            });
        }

        // 5. SERVICE DETAIL PAGE HYDRATION
        if (window.location.pathname.startsWith('/services/')) {
            const pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
            const slug = pathParts[pathParts.length - 1];
            const svc = services.find(s => s.slug === slug);
            if (svc) {
                document.title = `${svc.title} | Portfolio`;
                
                const heroImg = document.querySelector('.services-details-image');
                if (heroImg && (svc.image_url || svc.hover_image_url)) {
                    if (heroImg.tagName === 'IMG') {
                        heroImg.src = svc.image_url || svc.hover_image_url;
                        heroImg.removeAttribute('srcset');
                    } else {
                        heroImg.style.backgroundImage = `url("${svc.image_url || svc.hover_image_url}")`;
                        heroImg.style.backgroundSize = 'cover';
                        heroImg.style.backgroundPosition = 'center';
                        heroImg.innerHTML = '';
                    }
                }

                const pageHeading = document.getElementById('db-page-heading') || document.querySelector('.section-heading');
                if (pageHeading) pageHeading.textContent = svc.title;

                const nameHeading = document.querySelector('.services-details-name');
                if (nameHeading) nameHeading.textContent = svc.title;

                const titleHeading = document.querySelector('.services-details-heading');
                if (titleHeading) titleHeading.textContent = `${svc.title} Services`;

                const descWrap = document.querySelector('.services-details-description.w-richtext');
                if (descWrap) {
                    if (svc.content) {
                        descWrap.innerHTML = svc.content;
                    } else {
                        descWrap.innerHTML = `<p>${svc.description || ''}</p>`;
                    }
                }
            }
        }
        // 6. BRANDS HYDRATION
        if (brands && brands.length > 0) {
            const marquees = document.querySelectorAll('.brands-logo-marquee');
            marquees.forEach(marquee => {
                const originalBlocks = marquee.querySelectorAll('.brands-logo-block');
                if (!originalBlocks || originalBlocks.length === 0) return;
                
                const template = originalBlocks[0].cloneNode(true);
                marquee.innerHTML = '';
                
                brands.forEach(b => {
                    // Render if the brand has a name OR an image (or both)
                    if (!b.image_url && !b.name) return;

                    const clone = template.cloneNode(true);
                    const svg = clone.querySelector('svg');
                    if (svg) {
                        const wrapper = document.createElement('div');
                        wrapper.style.display = 'flex';
                        wrapper.style.alignItems = 'center';
                        wrapper.style.justifyContent = 'center';
                        wrapper.style.gap = '15px';
                        wrapper.className = svg.className.baseVal || svg.className || 'brands-logo';
                        
                        if (b.image_url) {
                            const img = document.createElement('img');
                            img.src = b.image_url;
                            img.alt = b.name || 'Brand logo';
                            img.style.maxHeight = '65px';
                            img.style.maxWidth = '180px';
                            img.style.objectFit = 'contain';
                            img.style.display = 'block';
                            wrapper.appendChild(img);
                        }
                        
                        if (b.name) {
                            const text = document.createElement('span');
                            text.textContent = b.name;
                            text.style.fontWeight = '700'; 
                            text.style.fontSize = '1.85rem';
                            text.style.color = 'currentColor'; 
                            text.style.letterSpacing = '1px';
                            wrapper.appendChild(text);
                        }
                        svg.replaceWith(wrapper);
                    }
                    marquee.appendChild(clone);
                });
            });
        }

        // 7. GALLERY MARQUEE HYDRATION
        if (marquee && marquee.length > 0) {
            const imageLoops = document.querySelectorAll('.marquee-loop');
            imageLoops.forEach(loop => {
                // Ignore loops that are solely for Webflow's cloning logic unless we want to replace them too
                loop.innerHTML = ''; // Blank it!
                
                // Keep the images continuous
                marquee.forEach(m => {
                    const imgWrap = document.createElement('div');
                    imgWrap.className = 'marquee-image-wrap skeleton';
                    imgWrap.style.width = '300px';
                    imgWrap.style.height = '400px';
                    imgWrap.style.borderRadius = '16px';
                    imgWrap.style.overflow = 'hidden';
                    imgWrap.style.flexShrink = '0';

                    const img = document.createElement('img');
                    img.src = m.image_url;
                    img.loading = 'eager';
                    img.className = 'marquee-image';
                    img.style.width = '100%'; 
                    img.style.height = '100%'; 
                    img.style.objectFit = 'cover';
                    img.onload = () => imgWrap.classList.remove('skeleton');
                    
                    imgWrap.appendChild(img);
                    loop.appendChild(imgWrap);
                });

                // Webflow marquee uses a secondary cloned wrap
                const loopWrap = document.createElement('div');
                loopWrap.className = 'marquee-loop-wrap';
                marquee.forEach(m => {
                    const imgWrap = document.createElement('div');
                    imgWrap.className = 'marquee-image-wrap skeleton';
                    imgWrap.style.width = '300px';
                    imgWrap.style.height = '400px';
                    imgWrap.style.borderRadius = '16px';
                    imgWrap.style.overflow = 'hidden';
                    imgWrap.style.flexShrink = '0';

                    const img = document.createElement('img');
                    img.src = m.image_url;
                    img.loading = 'eager';
                    img.className = 'marquee-image';
                    img.style.width = '100%'; 
                    img.style.height = '100%'; 
                    img.style.objectFit = 'cover';
                    img.onload = () => imgWrap.classList.remove('skeleton');

                    imgWrap.appendChild(img);
                    loopWrap.appendChild(imgWrap);
                });
                loop.appendChild(loopWrap);
            });
        }

        // 7. FAQS HYDRATION
        if (faqs && faqs.length > 0) {
            const faqContainer = document.querySelector('.faq-right-wrap');
            if (faqContainer) {
                const originalBlocks = faqContainer.querySelectorAll('.faq-question-wrapper');
                if (originalBlocks.length > 0) {
                    const template = originalBlocks[0].cloneNode(true);
                    faqContainer.innerHTML = ''; // Clear default FAQs

                    faqs.forEach((f, index) => {
                        const clone = template.cloneNode(true);
                        
                        const qText = clone.querySelector('.faq-question-text');
                        if (qText) qText.textContent = f.question || '';
                        
                        const aText = clone.querySelector('.faq-answer-text');
                        if (aText) aText.textContent = f.answer || '';
                        
                        faqContainer.appendChild(clone);
                    });
                }
            }
        }

        // 8. TESTIMONIALS AUTO-SLIDER & HYDRATION
        const testMask = document.querySelector('.testslider-mask');
        const testWrapper = document.querySelector('.testslider-wrapper');
        
        if (testimonials && testimonials.length > 0) {
            if (testMask) {
                const originalSlides = testMask.querySelectorAll('.testslider-slide');
                if (originalSlides.length > 0) {
                    const template = originalSlides[0].cloneNode(true);
                    // Remove all existing slides to prep for DB clones
                    originalSlides.forEach(s => s.remove());
                    
                    testimonials.forEach(t => {
                        const clone = template.cloneNode(true);

                        // Extract DOM elements
                        const quoteObj = clone.querySelector('.testimonials-summery');
                        const imgObj = clone.querySelector('.testimonials-image');
                        const infoObj = clone.querySelector('.testimonials-information');

                        if(quoteObj) quoteObj.textContent = t.message || '';
                        if(imgObj && t.author_image) {
                            imgObj.src = t.author_image;
                            imgObj.removeAttribute('srcset'); // Kill Webflow optimizer mapping
                        }
                        if(infoObj) {
                            const name = t.author_name || '';
                            const role = t.author_role ? `, ${t.author_role}` : '';
                            infoObj.textContent = `${name}${role}`;
                        }

                        testMask.appendChild(clone);
                    });
                }
            }
        } else if (testWrapper) {
            // Completely eliminate hardcoded fallback if DB is empty
            testWrapper.style.display = 'none';
        }

        // 8.5 TESTIMONIALS PAGE HYDRATION (List view)
        const testCardWrap = document.querySelector('.testimonials-card-wrap');
        if (testCardWrap && testimonials && testimonials.length > 0) {
            const originalCards = testCardWrap.querySelectorAll('.testimonials-card');
            if (originalCards.length > 0) {
                const template = originalCards[0].cloneNode(true);
                testCardWrap.innerHTML = ''; // Clear default hardcoded cards

                testimonials.forEach((t, index) => {
                    const clone = template.cloneNode(true);
                    
                    // Assign alternate classes (_01, _02, _03) if Webflow styling depends on it
                    // The template likely had _01. We'll leave it as is or append an index class.
                    const numberClass = '_' + String((index % 5) + 1).padStart(2, '0');
                    clone.className = `testimonials-card ${numberClass}`;

                    const quoteObj = clone.querySelector('.testimonials-summery');
                    const imgObj = clone.querySelector('.testimonials-image');
                    const infoObj = clone.querySelector('.testimonials-information');

                    if(quoteObj) quoteObj.textContent = t.message || '';
                    if(imgObj && t.author_image) {
                        imgObj.src = t.author_image;
                        imgObj.removeAttribute('srcset');
                    }
                    if(infoObj) {
                        const name = t.author_name || '';
                        const role = t.author_role ? `, ${t.author_role}` : '';
                        infoObj.textContent = `${name}${role}`;
                    }

                    testCardWrap.appendChild(clone);
                });
            }
        } else if (testCardWrap) {
            testCardWrap.style.display = 'none';
        }

        const testSliderRightBtn = document.querySelector('.testslider-arrow.right');
        const testSliderWrap = document.querySelector('.testslider-slider'); // Fixed selector
        if (testSliderRightBtn && testSliderWrap) {
            let testimonialInterval = setInterval(() => {
                // Prevent sliding if Nav Menu is open to avoid reset conflicts
                const navMenu = document.querySelector('.w-nav-menu');
                const isMenuOpen = navMenu && (navMenu.classList.contains('w--open') || getComputedStyle(navMenu).visibility !== 'hidden');
                
                if (!isMenuOpen) {
                    testSliderRightBtn.click();
                }
            }, 10000); // 10 seconds

            // Pause on hover
            testSliderWrap.addEventListener('mouseenter', () => {
                clearInterval(testimonialInterval);
            });
            testSliderWrap.addEventListener('mouseleave', () => {
                testimonialInterval = setInterval(() => {
                    testSliderRightBtn.click();
                }, 10000);
            });
        }
        
        if (window.Webflow) {
            console.log('[Chaka] Re-initializing Webflow engine for dynamic elements...');
            window.Webflow.destroy();
            window.Webflow.ready();
            const ix2 = window.Webflow.require('ix2');
            if (ix2 && typeof ix2.init === 'function') {
                ix2.init();
            }
            
            // Fix: Force IX2 to wake up and show content without manual scroll
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                window.scrollTo(window.scrollX, window.scrollY + 1);
                window.scrollTo(window.scrollX, window.scrollY - 1);
            }, 500);
        }

        // Remove global Skeleton Loader by flagging html as hydrated
        document.documentElement.setAttribute('data-hydrated', 'true');

        }; // end window.hydrateDynamicContent

        // Run hydration on first load
        window.hydrateDynamicContent();

        // 9. AI SESSION PERSISTENCE ACROSS NAVIGATION
        window.addEventListener('beforeunload', () => {
            if (window.chakaSystem && window.chakaSystem.isConnected) {
                sessionStorage.setItem('chaka_was_connected', 'true');
            }
        });

    } catch (error) {
        console.error('Hydration Error:', error);
        document.documentElement.setAttribute('data-hydrated', 'true');
    }
    /* ========================================================
       CHAKA EXECUTIVE OS — GEMINI BIDI LIVE STREAM
       Mirrors proven ChakaLiveOS architecture exactly.
       ======================================================== */
    class ChakaLiveOS {
        constructor(settings) {
            this.settings = settings || {};
            this.engine = this.settings.chaka_live_engine || 'gemini-bidi';
            
            console.log('%c[Chaka] 🚀 Engine: ' + this.engine, 'color: cyan; font-size: 14px; font-weight: bold;');
            console.log('[Chaka] Settings received:', JSON.stringify({chaka_live_engine: this.settings.chaka_live_engine}));
            
            this.apiKeys = [];
            this.groqKeys = [];
            this.currentKeyIndex = 0;
            this.audioCtx = null;
            this.inputCtx = null;
            this.processor = null;
            this.micStream = null;
            this.socket = null;
            this.isConnected = false;
            this.intentionalDisconnect = false;

            // Idle timeout system — polling-based for reliability
            this._idleCheckInterval = null;
            this._idleWarned = false;
            this._idleGoodbyeSent = false;
            this._warningSpoken = false;
            this._lastActivityTime = Date.now();
            this.IDLE_WARNING_S = 60;       // 60 seconds of silence → ask "are you still there?"
            this.IDLE_DISCONNECT_S = 105;   // 105 seconds of silence (60 + 45) → end session

            // Audio FIFO Queue
            this.audioQueue = [];
            this.isPlaying = false;

            // Edge TTS text accumulation
            this.textBuffer = '';
            this.isAiSpeaking = false;

            // Visualizer
            this.analyser = null;
            this.visData = null;

            // Stateful Memory (Survives Hard Reloads, Expires after 2 hours)
            let rawMemory = sessionStorage.getItem('chakaMemory');
            let lastActive = sessionStorage.getItem('chakaLastActivity');
            if (lastActive && (Date.now() - parseInt(lastActive)) > 2 * 60 * 60 * 1000) {
                rawMemory = null;
                sessionStorage.removeItem('chakaMemory');
                sessionStorage.removeItem('chakaLastActivity');
            }
            this.conversationHistory = rawMemory ? JSON.parse(rawMemory) : [];

            this.init();
        }

        get apiKey() { return this.apiKeys[this.currentKeyIndex]; }

        async init() {
            if (!window.marked) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
                document.head.appendChild(script);
            }

            try {
                this.injectUI();
                console.log('[Chaka] Orb injected successfully.');
            } catch(e) {
                console.error('[Chaka] Failed to inject UI:', e);
            }
            try {
                const res = await fetch('/api/apikeys');
                const keys = await res.json();
                this.apiKeys = keys.filter(k => k.provider === 'gemini' && (k.is_active === 1 || k.is_active === '1' || k.is_active == null)).map(k => k.api_key);
                this.groqKeys = keys.filter(k => k.provider === 'groq' && (k.is_active === 1 || k.is_active === '1' || k.is_active == null)).map(k => k.api_key);
                console.log(`[Chaka] Engine: ${this.engine} | Gemini keys: ${this.apiKeys.length} | Groq keys: ${this.groqKeys.length}`);
            } catch(e) { console.warn('[Chaka] Failed to load API keys:', e); }

            // Fetch dynamic site knowledge for the AI's system prompt (Voice mode)
            this.siteKnowledge = "";
            try {
                const kRes = await fetch('/api/chaka/knowledge');
                if (kRes.ok) {
                    this.siteKnowledge = await kRes.text();
                }
            } catch(e) { console.warn('[Chaka] Failed to load site knowledge:', e); }
        }

        injectUI() {
            const uiHTML = `
                <!-- Proactive Welcome Popup -->
                <div id="chaka-welcome-popup" style="position:fixed;bottom:110px;right:30px;width:320px;background:rgba(20, 20, 22, 0.85);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:24px;box-shadow:0 24px 48px rgba(0,0,0,0.5);z-index:999998;transform:scale(0.9) translateY(20px);opacity:0;pointer-events:none;transition:all 0.5s cubic-bezier(0.16, 1, 0.3, 1);">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg, #00f3ff, #0088ff);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 16px rgba(0,136,255,0.3);">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>
                        </div>
                        <div>
                            <div style="color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:16px;">Chaka Live OS</div>
                            <div style="color:#00f3ff;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Online & Ready</div>
                        </div>
                    </div>
                    <div style="color:#a0a0a0;font-family:'Inter',sans-serif;font-size:14.5px;line-height:1.6;margin-bottom:20px;">
                        Hi there! I'm Chaka. Would you like me to guide you around the site?
                    </div>
                    <div style="display:flex;gap:12px;">
                        <button id="chaka-btn-yes" style="flex:1;background:linear-gradient(135deg, #00f3ff, #0088ff);color:#fff;border:none;padding:12px;border-radius:14px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:14px;cursor:pointer;transition:transform 0.2s, box-shadow 0.2s;">Yes, Please</button>
                        <button id="chaka-btn-no" style="flex:1;background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1);padding:12px;border-radius:14px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:background 0.2s;">No Thanks</button>
                    </div>
                </div>

                <!-- Live Chat Modal - 2026/2027 Ultra-Modern Glassmorphism -->
                <div id="chaka-chat-modal" style="position:fixed;bottom:115px;right:32px;width:390px;height:620px;max-height:82vh;background:rgba(12, 12, 16, 0.88);backdrop-filter:blur(50px);-webkit-backdrop-filter:blur(50px);border:1px solid rgba(255,255,255,0.12);border-radius:32px;box-shadow:0 35px 80px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.15), 0 0 60px rgba(0,136,255,0.12);z-index:999997;display:flex;flex-direction:column;transform:scale(0.95) translateY(30px);opacity:0;pointer-events:none;transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1);overflow:hidden;">
                    
                    <!-- Chat Header -->
                    <div style="flex:0 0 auto;padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%);">
                        <div style="display:flex;align-items:center;gap:14px;">
                            <div style="position:relative;width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg, #00f3ff, #0066ff);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,136,255,0.4), inset 0 1px 1px rgba(255,255,255,0.4);">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>
                                <div id="chaka-ping" style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#00ff88;border:2px solid #0c0c10;box-shadow:0 0 8px #00ff88;"></div>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="color:#fff;font-family:'Plus Jakarta Sans', sans-serif;font-weight:800;font-size:16px;letter-spacing:-0.3px;">Chaka Live OS</span>
                                    <span style="background:rgba(0, 243, 255, 0.15);color:#00f3ff;border:1px solid rgba(0, 243, 255, 0.3);font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:20px;letter-spacing:0.5px;">PRO 3.1</span>
                                </div>
                                <div style="color:rgba(255,255,255,0.55);font-family:'Inter', sans-serif;font-size:12px;font-weight:500;margin-top:1px;">Autonomous AI Executive</div>
                            </div>
                        </div>
                        <button id="chaka-close-chat" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    
                    <!-- Chat History Area -->
                    <div id="chaka-chat-history" class="chaka-scrollbar" style="flex:1 1 auto;padding:24px;overflow-y:auto;display:flex;flex-direction:column;gap:20px;scroll-behavior:smooth;">
                        <!-- Initial Message -->
                        <div class="chaka-msg-wrapper ai">
                            <div class="chaka-msg-avatar">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>
                            </div>
                            <div class="chaka-msg-ai">
                                <p>Hello! I'm Chaka, the elite AI executive for this portfolio. I can guide you through our work, launch direct phone/WhatsApp calls, or answer any questions. How can I assist you today?</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Chat Input Area -->
                    <div style="flex:0 0 auto;padding:18px 24px;border-top:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%);">
                        <form id="chaka-chat-form" style="display:flex;gap:12px;align-items:flex-end;">
                            <div style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:3px 4px 3px 18px;display:flex;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);" id="chaka-input-wrapper">
                                <textarea id="chaka-chat-input" placeholder="Ask Chaka anything..." rows="1" style="flex:1;background:transparent;border:none;padding:12px 0;color:#fff;font-family:'Inter', sans-serif;font-size:14.5px;line-height:1.5;outline:none;resize:none;max-height:120px;min-height:44px;"></textarea>
                            </div>
                            <button type="submit" id="chaka-send-btn" style="background:linear-gradient(135deg, #00f3ff, #0066ff);border:none;width:48px;height:48px;border-radius:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.25s cubic-bezier(0.16, 1, 0.3, 1);flex-shrink:0;box-shadow:0 4px 16px rgba(0,136,255,0.35);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </form>
                        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:12px;font-size:11px;color:rgba(255,255,255,0.35);font-family:'Inter',sans-serif;font-weight:500;">
                            <span style="width:5px;height:5px;border-radius:50%;background:#00f3ff;display:inline-block;"></span>
                            <span>Autonomous AI Executive • 2027 Security Standard</span>
                        </div>
                    </div>
                </div>

                <!-- Existing Orb Framework -->
                <div id="chaka-orb-container" style="position: fixed; bottom: 30px; right: 30px; z-index: 999999; display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                    <canvas id="chaka-vis" style="width: 120px; height: 30px; opacity: 0; transition: opacity 0.5s; mask-image: linear-gradient(to right, transparent, black 20%, black 80%, transparent);"></canvas>
                    <div id="chaka-status-bubble" style="display: none; background: rgba(12,12,16,0.9); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 12px 30px rgba(0,0,0,0.6), 0 0 20px rgba(0,243,255,0.15); color: white; padding: 12px 22px; border-radius: 24px; font-family:'Inter', sans-serif; font-size: 13px; font-weight:500; backdrop-filter: blur(16px); max-width: 300px; line-height: 1.4;">
                        System Ready
                    </div>
                    <div id="chaka-orb" title="Click to chat or connect voice" style="width: 68px; height: 68px; border-radius: 50%; background: linear-gradient(135deg, #00f3ff, #0066ff); cursor: pointer; box-shadow: 0 10px 30px rgba(0,136,255,0.45), inset 0 2px 2px rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" id="chaka-icon">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line>
                        </svg>
                    </div>
                </div>
                
                <!-- Render Styles - 2026/2027 Premium Aesthetic -->
                <style>
                    #chaka-orb:hover { transform: scale(1.06) translateY(-5px); box-shadow: 0 18px 40px rgba(0,136,255,0.6), 0 0 20px rgba(0,243,255,0.4), inset 0 2px 2px rgba(255,255,255,0.5); }
                    #chaka-btn-yes:hover, #chaka-send-btn:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 10px 24px rgba(0,136,255,0.5); }
                    #chaka-btn-no:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.2) !important; }
                    #chaka-close-chat:hover { background: rgba(255,255,255,0.15) !important; border-color: rgba(255,255,255,0.2) !important; transform: rotate(90deg) scale(1.05); }
                    
                    #chaka-input-wrapper:focus-within { border-color: #00f3ff; box-shadow: 0 0 0 3px rgba(0,243,255,0.2), inset 0 2px 4px rgba(0,0,0,0.2); background: rgba(255,255,255,0.08); }
                    
                    .chaka-scrollbar::-webkit-scrollbar { width: 5px; }
                    .chaka-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .chaka-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
                    .chaka-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
                    
                    /* Markdown Formatting inside AI Bubbles */
                    .chaka-msg-ai { color: #f0f0f5; font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.65; letter-spacing: -0.01em; word-break: break-word; }
                    .chaka-msg-ai p { margin: 0 0 14px 0; }
                    .chaka-msg-ai p:last-child { margin: 0; }
                    .chaka-msg-ai strong { color: #fff; font-weight: 700; }
                    .chaka-msg-ai code { background: rgba(0,243,255,0.1); padding: 2.5px 7px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #00f3ff; border: 1px solid rgba(0,243,255,0.2); font-weight: 600; }
                    .chaka-msg-ai pre { background: rgba(0,0,0,0.5); padding: 16px; border-radius: 14px; overflow-x: auto; margin: 12px 0; border: 1px solid rgba(255,255,255,0.08); box-shadow: inset 0 2px 6px rgba(0,0,0,0.4); }
                    .chaka-msg-ai pre code { background: transparent; padding: 0; border: none; color: #e4e4e7; font-weight: 400; }
                    .chaka-msg-ai ul, .chaka-msg-ai ol { margin: 0 0 14px 0; padding-left: 20px; }
                    .chaka-msg-ai li { margin-bottom: 8px; }
                    .chaka-msg-ai a { color: #00f3ff; text-decoration: none; border-bottom: 1px dashed rgba(0,243,255,0.5); transition: all 0.2s; pointer-events: auto; font-weight: 600; }
                    .chaka-msg-ai a:hover { border-bottom: 1px solid #00f3ff; color: #fff; text-shadow: 0 0 10px rgba(0,243,255,0.5); }
                    
                    /* Special Contact Buttons - 2026/2027 Glowing Action Pills */
                    .chaka-msg-ai a[href*="wa.me"] { display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, #25D366, #1ca84e); color: #fff; padding: 12px 18px; font-size: 14.5px; border-radius: 16px; text-decoration: none !important; border: 1px solid rgba(255,255,255,0.2); font-weight: 700; margin: 10px 0; box-shadow: 0 8px 20px -4px rgba(37, 211, 102, 0.4), inset 0 1px 1px rgba(255,255,255,0.3); pointer-events: auto; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .chaka-msg-ai a[href*="wa.me"]:hover { background: linear-gradient(135deg, #29e26d, #22bf5b); transform: translateY(-3px) scale(1.01); box-shadow: 0 14px 28px -4px rgba(37, 211, 102, 0.6), 0 0 20px rgba(37, 211, 102, 0.3), inset 0 1px 1px rgba(255,255,255,0.4); color: #fff !important; }
                    
                    .chaka-msg-ai a[href^="tel:"], .chaka-msg-ai a[href^="mailto:"] { display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, #00f3ff, #0066ff); color: #fff; padding: 12px 18px; font-size: 14.5px; border-radius: 16px; text-decoration: none !important; border: 1px solid rgba(255,255,255,0.2); font-weight: 700; margin: 10px 0; box-shadow: 0 8px 20px -4px rgba(0, 136, 255, 0.4), inset 0 1px 1px rgba(255,255,255,0.3); pointer-events: auto; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                    .chaka-msg-ai a[href^="tel:"]:hover, .chaka-msg-ai a[href^="mailto:"]:hover { transform: translateY(-3px) scale(1.01); box-shadow: 0 14px 28px -4px rgba(0, 136, 255, 0.6), 0 0 20px rgba(0, 243, 255, 0.4), inset 0 1px 1px rgba(255,255,255,0.4); color: #fff !important; }
                    
                    /* Bubble Layouts */
                    .chaka-msg-wrapper { display: flex; gap: 14px; margin-bottom: 6px; width: 100%; }
                    .chaka-msg-wrapper.user { justify-content: flex-end; }
                    .chaka-msg-wrapper.ai { justify-content: flex-start; align-items: flex-start; }
                    
                    .chaka-msg-user { background: linear-gradient(135deg, rgba(0, 243, 255, 0.18), rgba(0, 102, 255, 0.12)); padding: 14px 20px; border-radius: 22px 22px 6px 22px; max-width: 82%; color: #fff; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 500; line-height: 1.5; box-shadow: 0 6px 18px rgba(0, 102, 255, 0.15), inset 0 1px 1px rgba(255,255,255,0.15); border: 1px solid rgba(0, 243, 255, 0.3); }
                    .chaka-msg-user p { margin: 0; }
                    
                    .chaka-msg-avatar { width: 34px; height: 34px; border-radius: 12px; background: linear-gradient(135deg, #00f3ff, #0066ff); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 14px rgba(0,136,255,0.35), inset 0 1px 1px rgba(255,255,255,0.4); margin-top: 2px; border: 1px solid rgba(255,255,255,0.15); }
                    
                    .chaka-orb-active { animation: pulse_chaka 2s infinite; background: linear-gradient(135deg, #ff0055, #ff7700) !important; box-shadow: 0 0 35px rgba(255,0,85,0.7) !important; }
                    @keyframes pulse_chaka { 0% { box-shadow: 0 0 0 0 rgba(255,0,85, 0.7); } 70% { box-shadow: 0 0 0 28px rgba(255,0,85, 0); } 100% { box-shadow: 0 0 0 0 rgba(255,0,85, 0); } }
                </style>
            `;
            document.body.insertAdjacentHTML('beforeend', uiHTML);

            // Bind UI Events
            document.getElementById('chaka-orb').addEventListener('click', () => {
                const modal = document.getElementById('chaka-chat-modal');
                if (modal.style.opacity === '1') {
                    // Chat is open, orb click toggle voice session
                    this.toggleSession();
                } else {
                    // Chat is closed, orb click opens chat
                    this.toggleChatWindow(true);
                }
            });
            
            // Auto-resize textarea
            const chatInput = document.getElementById('chaka-chat-input');
            chatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
            
            // Enter to submit (Shift+Enter for newline)
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.getElementById('chaka-chat-form').dispatchEvent(new Event('submit'));
                }
            });
            
            // Chat Input Submit
            document.getElementById('chaka-chat-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const text = chatInput.value.trim();
                if (text) {
                    this.sendTextMessage(text);
                    chatInput.value = '';
                    chatInput.style.height = 'auto';
                }
            });

            document.getElementById('chaka-close-chat').addEventListener('click', () => this.toggleChatWindow(false));
            
            document.getElementById('chaka-btn-yes').addEventListener('click', () => {
                document.getElementById('chaka-welcome-popup').style.opacity = '0';
                document.getElementById('chaka-welcome-popup').style.pointerEvents = 'none';
                sessionStorage.setItem('chakaVisited', 'true');
                this.toggleChatWindow(true);
                if(!this.isConnected) {
                    this.toggleSession(); // Auto-connect voice
                }
            });

            document.getElementById('chaka-btn-no').addEventListener('click', () => {
                document.getElementById('chaka-welcome-popup').style.opacity = '0';
                document.getElementById('chaka-welcome-popup').style.pointerEvents = 'none';
                sessionStorage.setItem('chakaVisited', 'true');
            });

            // Proactive Welcome Check Delay
            setTimeout(() => {
                const popup = document.getElementById('chaka-welcome-popup');
                if (popup && !sessionStorage.getItem('chakaVisited')) {
                    popup.style.opacity = '1';
                    popup.style.pointerEvents = 'auto';
                    popup.style.transform = 'scale(1) translateY(0)';
                }
            }, 3000);

            // Render persistent history on load
            if (this.conversationHistory && this.conversationHistory.length > 0) {
                const historyArea = document.getElementById('chaka-chat-history');
                historyArea.innerHTML = ''; // clear default greeting
                // Store temporarily so appendChatMessage doesn't double-push
                const tempHistory = [...this.conversationHistory];
                this.conversationHistory = [];
                tempHistory.forEach(msg => {
                    this.appendChatMessage(msg.role, msg.content);
                });
            }
        }

        showBubble(msg, duration) {
            const bubble = document.getElementById('chaka-status-bubble');
            if (!bubble) return;
            bubble.style.display = 'block';
            bubble.textContent = msg;
            if (duration) setTimeout(() => bubble.style.display = 'none', duration);
        }

        toggleChatWindow(show) {
            const modal = document.getElementById('chaka-chat-modal');
            if (show) {
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
                modal.style.transform = 'scale(1) translateY(0)';
                setTimeout(() => document.getElementById('chaka-chat-input').focus(), 100);
            } else {
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                modal.style.transform = 'scale(0.95) translateY(30px)';
            }
        }

        appendChatMessage(role, text, isRawHtml = false) {
            const historyArea = document.getElementById('chaka-chat-history');
            const wrapper = document.createElement('div');
            wrapper.className = `chaka-msg-wrapper ${role === 'user' ? 'user' : 'ai'}`;
            
            // Render markdown (if marked.js loaded, else basic fallback) — skip if raw HTML
            let formattedText = '';
            if (isRawHtml) {
                formattedText = text;
            } else if (window.marked) {
                formattedText = marked.parse(text);
            } else {
                // Fallback basic formatting
                formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // Auto-link raw URLs if marked is not available
                formattedText = formattedText.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
                formattedText = '<p>' + formattedText.replace(/\n/g, '<br/>') + '</p>';
            }
            
            if (role === 'user') {
                wrapper.innerHTML = `<div class="chaka-msg-user">${formattedText}</div>`;
            } else {
                wrapper.innerHTML = `
                    <div class="chaka-msg-avatar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg>
                    </div>
                    <div class="chaka-msg-ai">${formattedText}</div>
                `;
            }
            
            // Post-process links to make them robust buttons
            wrapper.querySelectorAll('.chaka-msg-ai a').forEach(a => {
                a.target = "_blank";
                a.rel = "noopener";
                
                // WhatsApp Button Enhancement
                if (a.href.includes('wa.me')) {
                    const label = (a.textContent.includes('wa.me') || a.textContent.includes('http') || a.textContent.length < 3) ? 'Chat on WhatsApp' : a.textContent;
                    a.innerHTML = `<span style="font-size:18px;">💬</span> <span style="flex:1;">${label}</span> <span style="opacity:0.8;font-size:14px;">↗</span>`;
                    a.addEventListener('click', () => {
                        setTimeout(() => this.appendChatMessage('ai', 'Launching WhatsApp securely for you...'), 300);
                    });
                }
                
                // Phone Button Enhancement
                if (a.href.startsWith('tel:')) {
                    const label = (a.textContent.includes('tel:') || a.textContent.match(/[\d\+\-\(\)]+/) || a.textContent.length < 3) ? 'Call Us Now' : a.textContent;
                    a.innerHTML = `<span style="font-size:18px;">📞</span> <span style="flex:1;">${label}</span> <span style="opacity:0.8;font-size:14px;">↗</span>`;
                    a.addEventListener('click', () => {
                        setTimeout(() => this.appendChatMessage('ai', 'Initiating direct phone call...'), 300);
                    });
                }

                // Email Button Enhancement
                if (a.href.startsWith('mailto:')) {
                    const label = (a.textContent.includes('mailto:') || a.textContent.length < 3) ? 'Send Email' : a.textContent;
                    a.innerHTML = `<span style="font-size:18px;">✉️</span> <span style="flex:1;">${label}</span> <span style="opacity:0.8;font-size:14px;">↗</span>`;
                    a.addEventListener('click', () => {
                        setTimeout(() => this.appendChatMessage('ai', 'Opening email client...'), 300);
                    });
                }
            });

            historyArea.appendChild(wrapper);
            historyArea.scrollTop = historyArea.scrollHeight;
            
            // Persist to session memory array, but avoid double writing if loading from memory
            if (role !== 'system') {
                this.conversationHistory = this.conversationHistory.filter(m => m.content !== text); // prevent duplicates on initial render
                this.conversationHistory.push({ role, content: text });
                sessionStorage.setItem('chakaMemory', JSON.stringify(this.conversationHistory));
                sessionStorage.setItem('chakaLastActivity', Date.now().toString());
            }
        }

        // ========================
        // TEXT CHAT — Gemini 2.5 Flash REST (separate from voice)
        // ========================
        async sendTextMessage(text) {
            this.appendChatMessage('user', text);
            this.showBubble('Thinking...');

            try {
                const res = await fetch('/api/chaka/chat_text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        history: JSON.stringify(this.conversationHistory),
                        isAdmin: window.location.pathname.includes('/admin'),
                        currentUrl: window.location.pathname
                    })
                });

                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();

                if (data.text) this.appendChatMessage('assistant', data.text);

                if (data.toolCalls && data.toolCalls.length > 0) {
                    await this.handleToolCall({ functionCalls: data.toolCalls });
                }

                this.showBubble('', 0);
            } catch (e) {
                console.error('[Chaka] Chat text error:', e);
                this.appendChatMessage('assistant', 'Sorry, I had trouble processing that. Please try again.');
            }
        }

        async toggleSession() {
            if (this.isConnected) {
                this.disconnect();
            } else {
                if (this.engine.includes('groq')) {
                    if (!this.groqKeys || this.groqKeys.length === 0) {
                        this.showBubble("No Groq API Key found. Add one in Admin.", 5000);
                        return;
                    }
                } else {
                    if (this.apiKeys.length === 0) {
                        this.showBubble("No Gemini API Key found. Add one in Admin.", 5000);
                        return;
                    }
                }
                this.currentKeyIndex = 0;
                await this.connect();
            }
        }

        updateUI(state) {
            const orb = document.getElementById('chaka-orb');
            const icon = document.getElementById('chaka-icon');
            const vis = document.getElementById('chaka-vis');
            if (state === 'connected') {
                orb.classList.add('chaka-orb-active');
                icon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"></rect>';
                if (vis) vis.style.opacity = '1';
                this.showBubble("Chaka is listening...", 3000);
            } else {
                orb.classList.remove('chaka-orb-active');
                icon.innerHTML = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line>';
                if (vis) vis.style.opacity = '0';
            }
        }

        // ========================
        // CONNECTION ROUTING
        // ========================
        async connect() {
            this.intentionalDisconnect = false;

            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 256;
                this.visData = new Uint8Array(this.analyser.frequencyBinCount);
                this.drawVisualizer();
            }
            if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

            this.showBubble("Connecting...");

            if (this.engine.includes('groq')) {
                this.connectHTTP();
            } else {
                this.connectWebSocket();
            }
        }

        // ========================
        // WEBSOCKET (GEMINI BIDI)
        // ========================
        async connectWebSocket() {
            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
            try {
                this.socket = new WebSocket(url);
            } catch (e) {
                console.error("[Chaka] WebSocket creation failed:", e);
                this.showBubble("Connection failed.", 4000);
                this.cleanup();
                return;
            }

            this.socket.onopen = () => {
                console.log(`[Chaka] Socket open (Key #${this.currentKeyIndex + 1})`);
                this.sendSetup();
                this.isConnected = true;
                this.startMic();
                this.updateUI('connected');

                // Issue #3: AI greets immediately on connect
                this.sendGreeting();

                // Start idle watchdog (polling-based, immune to mic noise)
                this.startIdleWatchdog();
            };

            this.socket.onmessage = async (event) => {
                let data;
                try {
                    const text = event.data instanceof Blob ? await event.data.text() : event.data;
                    data = JSON.parse(text);
                } catch(e) { return; }

                // A. Handle interruptions
                if (data.serverContent?.interrupted) {
                    console.log("[Chaka] Interrupted.");
                    this.stopCurrentAudio();
                    this.textBuffer = '';
                    return;
                }

                // B. Process model output based on engine mode
                if (data.serverContent?.modelTurn?.parts) {
                    for (const part of data.serverContent.modelTurn.parts) {
                        // Native Gemini audio mode — play PCM directly
                        if (this.engine === 'gemini-bidi' && part.inlineData?.data) {
                            this.addToQueue(part.inlineData.data);
                        }
                        // Text mode (gemini-txt-edge) — accumulate for Edge TTS
                        if (part.text && !part.thought) {
                            this.textBuffer += part.text;
                            this.showBubble(this.textBuffer.substring(0, 120) + (this.textBuffer.length > 120 ? '...' : ''));
                        }
                    }
                }

                // C. Turn complete — VOICE ONLY, no chat messages
                if (data.serverContent?.turnComplete) {
                    if (this.engine === 'gemini-bidi') {
                        // Flush native audio queue
                        if (!this.isPlaying && this.audioQueue.length > 0) this.playNextInQueue();
                    } else if (this.textBuffer.trim()) {
                        // Edge TTS mode — speak only, don't write to chat
                        console.log('[Chaka] Turn complete. Speaking via Edge TTS:', this.textBuffer.substring(0, 60));
                        this.speakWithEdgeTTS(this.textBuffer.trim());
                    }
                    // Save to memory for context but don't display
                    if (this.textBuffer.trim()) {
                        this.conversationHistory.push({ role: 'assistant', content: this.textBuffer.trim() });
                        sessionStorage.setItem('chakaMemory', JSON.stringify(this.conversationHistory));
                    }
                    this.textBuffer = '';

                    // If pending goodbye disconnect, end session now that AI finished speaking
                    if (this._pendingGoodbyeDisconnect) {
                        this._pendingGoodbyeDisconnect = false;
                        console.log('[Chaka] AI goodbye complete — disconnecting session.');
                        setTimeout(() => { if (this.isConnected) this.disconnect(); }, 1500);
                    }
                    // Post-warning turn tracking:
                    // First turnComplete after warning = AI speaking the warning itself
                    // Second turnComplete = user actually responded → cancel disconnect
                    else if (this._idleWarned && !this._warningSpoken) {
                        this._warningSpoken = true;
                        console.log('[Chaka] Warning speech delivered. Waiting for user response...');
                    }
                    else if (this._idleWarned && this._warningSpoken && !this._idleGoodbyeSent) {
                        console.log('[Chaka] User responded after idle warning — cancelling disconnect.');
                        this._idleWarned = false;
                        this._warningSpoken = false;
                        this._lastActivityTime = Date.now();
                    }
                }

                // D. Tool Calls from Gemini
                const toolCall = data.toolCall || data.tool_call;
                if (toolCall && toolCall.functionCalls) {
                    this.handleToolCall(toolCall);
                }
            };

            this.socket.onerror = (e) => {
                console.error("[Chaka] Socket error:", e);
            };

            this.socket.onclose = (e) => {
                const reasons = {
                    1000: 'Normal closure',
                    1001: 'Going away',
                    1006: 'Abnormal closure (network/CORS)',
                    1008: 'Policy violation (bad API key or model name)',
                    1011: 'Server error',
                    4000: 'Gemini: Invalid API key',
                    4001: 'Gemini: Model not found or not enabled',
                    4003: 'Gemini: Quota exceeded',
                    4005: 'Gemini: Rate limited'
                };
                const reason = reasons[e.code] || e.reason || 'Unknown';
                console.warn(`[Chaka] Socket closed | Code: ${e.code} | Reason: ${reason}`);
                if (!this.intentionalDisconnect) {
                    this.rotateKeyAndRetry();
                } else {
                    this.cleanup();
                }
            };
        }

        rotateKeyAndRetry() {
            this.currentKeyIndex++;
            if (this.currentKeyIndex >= this.apiKeys.length) {
                console.error("[Chaka] All API keys exhausted.");
                this.showBubble("All API keys failed. Check Admin.", 5000);
                this.currentKeyIndex = 0;
                this.cleanup();
                return;
            }
            console.log(`[Chaka] Rotating to key #${this.currentKeyIndex + 1}...`);
            if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
                this.socket.onclose = null; // prevent recursive retry
                this.socket.close();
            }
            setTimeout(() => this.connect(), 500);
        }

        sendSetup() {
            const isAdmin = window.location.pathname.includes('/admin');
            const mode = isAdmin ? 'ADMIN GOD MODE' : 'PUBLIC VISITOR GUIDE';

            const modelsToTry = ['gemini-3.1-flash-live-preview'];
            const modelName = `models/${modelsToTry[0]}`;
            
            const isNativeAudio = (this.engine === 'gemini-bidi');
            const genConfig = isNativeAudio 
                ? { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } }
                : { responseModalities: ["TEXT"] };

            const setupMsg = {
                setup: {
                    model: modelName,
                    generationConfig: genConfig,
                    systemInstruction: {
                        parts: [{
                            text: `You are Chaka — the Elite AI Executive for this portfolio platform. You are NOT a generic AI chatbot. You represent the portfolio owner directly.

YOUR MODE: ${mode}
CURRENT PAGE: ${window.location.pathname}
CURRENT TIME: ${new Date().toLocaleTimeString()}

PERSONALITY & VOICE:
- Speak like a sharp, confident, senior creative director — warm but authoritative
- Be conversational and human. Use natural speech patterns, contractions, brief pauses
- NEVER say "As an AI" or "I am a language model" — you ARE Chaka
- Match the user's energy: casual with casual users, professional with professional ones
- Keep responses concise in voice mode — 1-3 sentences max unless depth is requested
- Use the visitor's name if they share it. Remember everything they tell you within this session

${this.siteKnowledge}

CORE CAPABILITIES:
1. SITE NAVIGATION: Use navigate_to to move between pages. Use scroll_to to jump to sections on the current page.
2. PORTFOLIO SHOWCASE: Know every project, service, tech stack, and achievement. Present them compellingly with context and enthusiasm.
3. CONTACT FACILITATION: Use showContactMethod to display interactive contact cards.
4. CONTENT MANAGEMENT (Admin only): Use manageWorks, manageServices, updateSiteSetting to modify portfolio content.
5. IMAGE SOURCING: Use searchImages to find professional imagery when adding content.

INTELLIGENCE PROTOCOLS:
- ANTICIPATE NEEDS: If someone asks about a project, proactively offer to show it. If they seem interested in hiring, guide them toward contact.
- HANDLE ANYTHING: If asked something outside the portfolio scope, answer thoughtfully using general knowledge, then naturally steer back to how the portfolio owner can help them.
- OBJECTION HANDLING: If a visitor seems skeptical or hesitant, address their concerns confidently using specific portfolio evidence — projects completed, technologies mastered, results delivered.
- QUALIFY LEADS: Naturally understand what the visitor needs (web development, mobile app, design, etc.) and match it to relevant services and projects in the portfolio.
- CONTEXT AWARENESS: Reference earlier parts of the conversation. Never ask for information already provided. Build on what you know.
- PROACTIVE GUIDANCE: Don't just answer questions — guide the conversation. Suggest relevant pages, showcase matching projects, recommend next steps.
- NATURAL TRANSITIONS: Smoothly transition between topics. If showing a project, naturally ask if they'd like to see more or get in touch.

CONTACT PROTOCOL:
- When user asks for WhatsApp, phone, email, or socials: call showContactMethod with auto_open=false to show the button in chat.
- Then ASK: "Would you like me to open it directly for you?"
- ONLY set auto_open=true when the user EXPLICITLY confirms: "yes", "open it", "take me there", "go ahead", etc.
- NEVER auto-open without explicit user consent. This is critical.

DATA MANAGEMENT (Admin Mode):
1. All content is database-driven. NEVER edit HTML/CSS files directly. Use provided tools only.
2. SERVICES go in the services table (manageServices). WORKS/PROJECTS go in the works table (manageWorks). Never mix them.
3. When adding projects, always use searchImages for professional LANDSCAPE thumbnails.
4. Project content must be rich, detailed HTML — not placeholder text.

NAVIGATION: Only call navigate_to when explicitly requested or to showcase a change you just made.
Current Time: ${new Date().toLocaleTimeString()}`
                        }]
                    },
                    tools: [{
                        functionDeclarations: [
                            {
                                name: "getSiteContext",
                                description: "Returns all current site settings, projects, and services. Call this FIRST if you need to see current content before improving it.",
                                parameters: { type: "OBJECT", properties: {} }
                            },
                            {
                                name: "updateSiteSetting",
                                description: "Updates a global site setting. VALID KEYS: hero_headline, hero_eyebrow, hero_text, about_hero_heading, about_me_page_text, contact_email, contact_phone, site_logo_text, footer_cta, company_name.",
                                parameters: { type: "OBJECT", properties: { key: { type: "STRING" }, value: { type: "STRING" } }, required: ["key", "value"] }
                            },
                            {
                                name: "manageWorks",
                                description: "Add, update or delete portfolio PROJECTS. DO NOT use for services. When adding, use searchImages for images.",
                                parameters: { type: "OBJECT", properties: { action: { type: "STRING" }, id: { type: "NUMBER" }, data: { type: "OBJECT" } }, required: ["action"] }
                            },
                            {
                                name: "manageServices",
                                description: "Add, update or delete site SERVICES. DO NOT use for projects.",
                                parameters: { type: "OBJECT", properties: { action: { type: "STRING" }, id: { type: "NUMBER" }, data: { type: "OBJECT" } }, required: ["action"] }
                            },
                            {
                                name: "searchImages",
                                description: "Search for professional images using SerpAPI.",
                                parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
                            },
                            {
                                name: "navigate_to",
                                description: "Navigate browser. VALID: /, /about, /works, /services, /contact-us, /resume, /testimonials. NEVER use .html.",
                                parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] }
                            },
                            {
                                name: "showContactMethod",
                                description: "Shows an interactive contact card in the chat. IMPORTANT: Set auto_open to false by default. Only set auto_open to true if the user EXPLICITLY asked you to open/launch it for them (e.g. 'open it', 'take me there', 'yes please open'). Valid methods: whatsapp, phone, email, instagram, linkedin, github.",
                                parameters: { 
                                    type: "OBJECT", 
                                    properties: { 
                                        method: { type: "STRING", description: "The contact method to show." },
                                        auto_open: { type: "BOOLEAN", description: "ONLY set true if the user EXPLICITLY asked to be taken/redirected. Default false — just show the button." }
                                    }, 
                                    required: ["method"] 
                                }
                            }
                        ]
                    }]
                }
            };
            this.socket.send(JSON.stringify(setupMsg));
        }

        // Issue #3: Immediately greet the user based on time of day (or welcome back)
        sendGreeting() {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            const hour = new Date().getHours();
            let timeContext;
            if (hour < 12) timeContext = 'morning';
            else if (hour < 17) timeContext = 'afternoon';
            else timeContext = 'evening';

            // Check if this is a returning user (has recent conversation history)
            const isReturning = this.conversationHistory.length > 2;
            const lastTopic = isReturning ? this.conversationHistory.slice(-3).map(m => m.content).join(' ').substring(0, 200) : '';

            let greetingPrompt;
            if (isReturning) {
                greetingPrompt = `[SYSTEM: The user just reconnected to the live stream after briefly leaving (likely clicked an external link like WhatsApp or a phone call). They are RETURNING — do NOT introduce yourself again. Welcome them back casually and briefly, ask if the link worked or if they need anything else. Pick up naturally from where you left off. Recent conversation context: "${lastTopic}". Keep it very short and natural.]`;
            } else {
                greetingPrompt = `[SYSTEM: The user just connected to the live stream for the first time. It is currently ${timeContext} (${new Date().toLocaleTimeString()}). Greet them warmly and naturally based on the time of day, introduce yourself briefly as Chaka, and ask how you can help them today. Be conversational, warm, and human-like. Keep it short and inviting.]`;
            }

            // Send a client text prompt that triggers the AI to speak first
            setTimeout(() => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        clientContent: {
                            turns: [{
                                role: 'user',
                                parts: [{ text: greetingPrompt }]
                            }],
                            turnComplete: true
                        }
                    }));
                }
            }, 800);
        }

        // ──────────────────────────────────────────────────────
        // IDLE WATCHDOG — Polling-based (immune to mic noise resets)
        // Instead of setTimeout chains that get cleared by mic noise,
        // we poll every 5s and check elapsed silence from _lastActivityTime.
        // ──────────────────────────────────────────────────────
        startIdleWatchdog() {
            this.stopIdleWatchdog();
            this._lastActivityTime = Date.now();
            this._idleWarned = false;
            this._idleGoodbyeSent = false;
            this._warningSpoken = false;
            this._pendingGoodbyeDisconnect = false;

            console.log(`[Chaka] Idle watchdog started (warn: ${this.IDLE_WARNING_S}s, disconnect: ${this.IDLE_DISCONNECT_S}s)`);

            this._idleCheckInterval = setInterval(() => {
                if (!this.isConnected) { this.stopIdleWatchdog(); return; }

                const silenceSec = (Date.now() - this._lastActivityTime) / 1000;

                // Phase 1: Warning at 60s
                if (!this._idleWarned && silenceSec >= this.IDLE_WARNING_S) {
                    this._idleWarned = true;
                    this._warningSpoken = false;
                    console.log(`[Chaka] ${silenceSec.toFixed(0)}s silence — sending idle warning.`);
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            clientContent: {
                                turns: [{
                                    role: 'user',
                                    parts: [{ text: '[SYSTEM: The user has been silent for a while. Ask them warmly if they are still there. Something like "Hey, are you still there? I\'m here if you need anything!". Keep it very short and friendly.]' }]
                                }],
                                turnComplete: true
                            }
                        }));
                    }
                }

                // Phase 2: Goodbye + disconnect at 105s
                if (this._idleWarned && !this._idleGoodbyeSent && silenceSec >= this.IDLE_DISCONNECT_S) {
                    this._idleGoodbyeSent = true;
                    console.log(`[Chaka] ${silenceSec.toFixed(0)}s silence — sending goodbye and disconnecting.`);
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            clientContent: {
                                turns: [{
                                    role: 'user',
                                    parts: [{ text: '[SYSTEM: The user has not responded after the idle check. Say a brief warm goodbye like "Alright, it seems you\'re busy right now. I\'ll close our session for now, but I\'m always here when you need me. Take care!" Keep it short. The session will close after you finish speaking.]' }]
                                }],
                                turnComplete: true
                            }
                        }));
                    }
                    this._pendingGoodbyeDisconnect = true;
                    this.stopIdleWatchdog(); // Stop polling, turnComplete will handle disconnect
                }
            }, 5000); // Check every 5 seconds
        }

        stopIdleWatchdog() {
            if (this._idleCheckInterval) {
                clearInterval(this._idleCheckInterval);
                this._idleCheckInterval = null;
            }
        }

        // Called when real user speech is detected
        markActivity() {
            this._lastActivityTime = Date.now();
        }

        disconnect() {
            console.log("[Chaka] Intentional disconnect requested.");
            this.intentionalDisconnect = true;
            this.stopIdleWatchdog();
            this.cleanup();
        }

        cleanup() {
            this.isConnected = false;
            this.stopMic();
            this.stopCurrentAudio();
            if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
                this.socket.close();
            }
            this.socket = null;
            this.updateUI('disconnected');
            this.showBubble("Session ended.", 3000);
        }

        async startMic() {
            try {
                // Stop any existing mic session before starting a new one
                this.stopMic();

                const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
                
                // Check if user clicked stop/disconnect while we were waiting for mic permission
                if (!this.isConnected) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                this.micStream = stream;
                this.micBuffer = [];
                this.inputCtx = new AudioContext({ sampleRate: 16000 });
                const source = this.inputCtx.createMediaStreamSource(this.micStream);
                
                await this.inputCtx.audioWorklet.addModule('/js/mic-worklet.js');
                this.processor = new AudioWorkletNode(this.inputCtx, 'mic-worklet');
                
                source.connect(this.processor);
                this.processor.port.onmessage = (e) => {
                    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
                    
                    // Accumulate mic buffer and send in chunks (matching working reference)
                    const int16Data = new Int16Array(e.data);
                    this.micBuffer.push(...int16Data);
                    
                    const TRANSMIT_SIZE = 4048;
                    while (this.micBuffer.length >= TRANSMIT_SIZE) {
                        const chunk = this.micBuffer.splice(0, TRANSMIT_SIZE);
                        const int16Arr = new Int16Array(chunk);
                        const base64 = this.arrayBufferToBase64(int16Arr.buffer);
                        
                        // Detect real speech via RMS energy (threshold 1500 filters background noise)
                        let sumSquares = 0;
                        for (let i = 0; i < int16Arr.length; i++) sumSquares += int16Arr[i] * int16Arr[i];
                        const rms = Math.sqrt(sumSquares / int16Arr.length);
                        // Only count as activity if NOT in post-warning phase
                        // (AI's own voice through speakers would otherwise reset the timer)
                        if (rms > 1500 && !this._idleWarned) {
                            this.markActivity();
                        }
                        
                        this.socket.send(JSON.stringify({
                            realtimeInput: {
                                audio: {
                                    data: base64,
                                    mimeType: "audio/pcm;rate=16000"
                                }
                            }
                        }));
                    }
                };
            } catch (e) { console.error("[Chaka] Mic start failed:", e); }
        }

        stopMic() {
            if (this.processor) this.processor.disconnect();
            if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
            if (this.inputCtx) this.inputCtx.close();
            this.processor = null;
            this.micStream = null;
            this.inputCtx = null;
        }

        arrayBufferToBase64(buffer) {
            let binary = '';
            let bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

        addToQueue(base64Data) {
            const binary = atob(base64Data);
            const bytes = new Int16Array(binary.length / 2);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
            }
            const floatData = new Float32Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) floatData[i] = bytes[i] / 32768.0;
            this.audioQueue.push(floatData);
            if (!this.isPlaying) this.playNextInQueue();
        }

        playNextInQueue() {
            if (this.audioQueue.length === 0) {
                this.isPlaying = false;
                this.isAiSpeaking = false;
                return;
            }
            this.isPlaying = true;
            this.isAiSpeaking = true;
            const data = this.audioQueue.shift();
            const buffer = this.audioCtx.createBuffer(1, data.length, 24000);
            buffer.getChannelData(0).set(data);
            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioCtx.destination);
            source.connect(this.analyser);
            source.onended = () => this.playNextInQueue();
            source.start();
        }

        stopCurrentAudio() {
            this.audioQueue = [];
            this.isPlaying = false;
            this.isAiSpeaking = false;
            // In a real implementation we'd track the active source and stop it
        }

        drawVisualizer() {
            if (!this.analyser) return;
            requestAnimationFrame(() => this.drawVisualizer());
            this.analyser.getByteFrequencyData(this.visData);
            const canvas = document.getElementById('chaka-vis');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barWidth = (canvas.width / this.visData.length) * 2.5;
            let x = 0;
            for (let i = 0; i < this.visData.length; i++) {
                const barHeight = this.visData[i] / 4;
                ctx.fillStyle = `rgba(0, 243, 255, ${barHeight / 64})`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }

        async handleToolCall(toolCall) {
            for (const call of toolCall.functionCalls) {
                const { name, args } = call;
                console.log(`[Chaka] Executing Tool: ${name}`, args);
                
                let result = { executed: true };
                
                if (name === 'navigate_to') {
                    // If live stream is active, do soft navigation to preserve the WebSocket
                    if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
                        try {
                            result = await this.softNavigate(args.url);
                        } catch(e) {
                            console.error('[Chaka] Soft navigate failed, falling back:', e);
                            window.location.href = args.url;
                            return;
                        }
                    } else {
                        window.location.href = args.url;
                        return;
                    }
                } else if (name === 'scroll_to') {
                    const sectionMap = {
                        'hero': '.hero-section, .section-hero, [data-section="hero"]',
                        'about': '.about-section, .section-about, [data-section="about"]',
                        'services': '.services-section, .section-services, [data-section="services"]',
                        'works': '.work-section, .section-works, [data-section="works"]',
                        'projects': '.work-section, .section-works, [data-section="works"]',
                        'contact': '.contact-section, .section-contact, [data-section="contact"]',
                        'testimonials': '.testimonial-section, [data-section="testimonials"]',
                        'footer': 'footer, .footer',
                        'brands': '.brands-section, .brands-logo-marquee',
                        'skills': '.skills-section, [data-section="skills"]',
                        'faq': '.faq-section, [data-section="faq"]'
                    };
                    const concept = (args.section_concept || '').toLowerCase();
                    const selector = sectionMap[concept] || `[data-section="${concept}"]`;
                    const el = document.querySelector(selector);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth' });
                        result = { executed: true, scrolledTo: concept };
                    } else {
                        result = { executed: false, error: `Section "${concept}" not found on current page` };
                    }
                } else if (name === 'showContactMethod') {
                    const method = (args.method || '').toLowerCase();
                    const s = window.siteSettings || {};
                    
                    const contactMap = {
                        'whatsapp': { url: s.social_whatsapp, label: 'Chat on WhatsApp', icon: '💬', color: '#25D366' },
                        'phone': { url: s.contact_phone ? `tel:${s.contact_phone.replace(/\s/g, '')}` : null, label: `Call ${s.contact_phone || 'us'}`, icon: '📞', color: '#4A90D9' },
                        'call': { url: s.contact_phone ? `tel:${s.contact_phone.replace(/\s/g, '')}` : null, label: `Call ${s.contact_phone || 'us'}`, icon: '📞', color: '#4A90D9' },
                        'email': { url: s.contact_email ? `mailto:${s.contact_email}` : null, label: `Email ${s.contact_email || 'us'}`, icon: '✉️', color: '#EA4335' },
                        'instagram': { url: s.social_instagram, label: 'Instagram', icon: '📸', color: '#E1306C' },
                        'linkedin': { url: s.social_linkedin, label: 'LinkedIn', icon: '💼', color: '#0077B5' },
                        'github': { url: s.social_github, label: 'GitHub', icon: '🐙', color: '#6e5494' }
                    };
                    
                    const contact = contactMap[method];
                    
                    if (contact && contact.url) {
                        // Issue #2: If chat widget is hidden/minimized, bring it back so user can see the card
                        const chatModal = document.getElementById('chaka-chat-modal');
                        if (chatModal && chatModal.style.opacity !== '1') {
                            this.toggleChatWindow(true);
                        }

                        // Create a clickable 2026/2027 interactive action card in the chat
                        const cardHtml = `<div style="margin:12px 0;width:100%;">
                            <a href="${contact.url}" target="_blank" rel="noopener" id="chaka-contact-autoclick"
                               style="display:flex;align-items:center;gap:14px;padding:16px 20px;background:linear-gradient(135deg, ${contact.color}25, ${contact.color}10);border:1px solid ${contact.color}55;border-radius:18px;color:white;text-decoration:none;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);cursor:pointer;box-shadow:0 8px 20px -6px ${contact.color}33;"
                               onmouseover="this.style.background='linear-gradient(135deg, ${contact.color}40, ${contact.color}20)';this.style.borderColor='${contact.color}88';this.style.transform='translateY(-3px) scale(1.01)';this.style.boxShadow='0 14px 28px -4px ${contact.color}55';"
                               onmouseout="this.style.background='linear-gradient(135deg, ${contact.color}25, ${contact.color}10)';this.style.borderColor='${contact.color}55';this.style.transform='translateY(0) scale(1)';this.style.boxShadow='0 8px 20px -6px ${contact.color}33';">
                                <div style="width:46px;height:46px;border-radius:14px;background:${contact.color}33;border:1px solid ${contact.color}66;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;box-shadow:0 4px 12px ${contact.color}22;">${contact.icon}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-weight:700;font-size:15px;color:#fff;display:flex;align-items:center;gap:8px;">
                                        <span>${contact.label}</span>
                                        <span style="font-size:10px;padding:2px 6px;border-radius:10px;background:rgba(255,255,255,0.15);text-transform:uppercase;letter-spacing:0.5px;font-weight:800;">Instant</span>
                                    </div>
                                    <div style="font-size:12.5px;color:rgba(255,255,255,0.75);margin-top:2px;">Click to launch directly &rarr;</div>
                                </div>
                                <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;">↗</div>
                            </a>
                        </div>`;
                        this.appendChatMessage('assistant', cardHtml, true);
                        
                        // Only auto-open if AI explicitly passed auto_open=true (user asked to be taken there)
                        const shouldOpen = args.auto_open === true || args.auto_open === "true";
                        if (shouldOpen) {
                            setTimeout(() => {
                                const url = contact.url;
                                if (url.startsWith('tel:') || url.startsWith('mailto:')) {
                                    const tempLink = document.createElement('a');
                                    tempLink.href = url;
                                    tempLink.style.display = 'none';
                                    document.body.appendChild(tempLink);
                                    tempLink.click();
                                    document.body.removeChild(tempLink);
                                } else {
                                    const newWin = window.open(url, '_blank');
                                    if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                                        window.location.href = url;
                                    }
                                }
                            }, 500);
                        }
                        
                        result = { executed: true, method, url: contact.url, displayed: true, autoOpened: shouldOpen };
                    } else {
                        // Method not found or no URL configured
                        const available = Object.entries(contactMap)
                            .filter(([k, v]) => v.url)
                            .map(([k]) => k);
                        this.appendChatMessage('assistant', `Sorry, ${method || 'that'} contact isn't configured yet. Available: ${available.join(', ')}`);
                        result = { executed: false, error: `Contact method "${method}" not available`, available };
                    }
                } else {
                    // Forward admin tools to server
                    try {
                        const res = await fetch('/api/chaka/execute_tool', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, args })
                        });
                        const data = await res.json();
                        result = data;
                        this.showBubble(`Tool ${name} executed successfully.`);
                    } catch(e) { console.error(`[Chaka] Tool ${name} failed:`, e); }
                }

                // Send tool result back if using Bidi socket
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        toolResponse: {
                            functionResponses: [{
                                response: { result: JSON.stringify(result) },
                                id: call.id
                            }]
                        }
                    }));
                }
            }
        }

        /**
         * Soft navigate — fetches the target page and swaps content without
         * a full page reload, keeping the live WebSocket stream alive.
         */
        async softNavigate(url) {
            console.log(`[Chaka] Soft navigating to: ${url}`);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract the new page wrapper content
            const newWrapper = doc.querySelector('.page-wrapper');
            const currentWrapper = document.querySelector('.page-wrapper');
            
            if (!newWrapper || !currentWrapper) {
                throw new Error('Could not find .page-wrapper in source or target page');
            }
            
            // Preserve the Chaka UI elements before swapping
            const chakaOrb = document.getElementById('chaka-orb');
            const chakaPanel = document.getElementById('chaka-chat-panel');
            const chakaOrbParent = chakaOrb ? chakaOrb.parentNode : null;
            const chakaPanelParent = chakaPanel ? chakaPanel.parentNode : null;
            
            // Swap the page content
            currentWrapper.className = newWrapper.className;
            currentWrapper.innerHTML = newWrapper.innerHTML;
            
            // Re-attach Chaka UI if they were inside the wrapper
            if (chakaOrb && !document.getElementById('chaka-orb')) {
                (chakaOrbParent || document.body).appendChild(chakaOrb);
            }
            if (chakaPanel && !document.getElementById('chaka-chat-panel')) {
                (chakaPanelParent || document.body).appendChild(chakaPanel);
            }
            
            // Update browser URL
            history.pushState({ chakaNav: true }, '', url);
            
            // Update page title if available
            const newTitle = doc.querySelector('title');
            if (newTitle) document.title = newTitle.textContent;
            
            // Force-reveal all Webflow IX2 animated elements
            // IX2 sets inline opacity:0 and transform:translate3d(0,50px,0) as initial animation states.
            // After soft nav, IX2 doesn't re-trigger, so we force everything visible.
            currentWrapper.querySelectorAll('[style]').forEach(el => {
                const style = el.getAttribute('style') || '';
                if (style.includes('opacity:0') || style.includes('opacity: 0')) {
                    el.style.opacity = '1';
                    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                }
                if (style.includes('translate3d')) {
                    el.style.transform = 'translate3d(0, 0, 0) scale3d(1, 1, 1)';
                    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                }
            });
            
            // Re-initialize Webflow animations on new content
            if (window.Webflow) {
                try { window.Webflow.destroy(); } catch(e) {}
                try { window.Webflow.ready(); } catch(e) {}
                try { window.Webflow.require('ix2').init(); } catch(e) {}
            }
            
            // Re-run dynamic hydration on new content
            if (typeof window.hydrateDynamicContent === 'function') {
                window.hydrateDynamicContent();
            }
            
            // Scroll to top of new page
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            console.log(`[Chaka] Soft navigation to ${url} complete — live stream preserved.`);
            return { executed: true, navigatedTo: url, method: 'soft' };
        }
    }

    // Initialize Global Instance
    window.chakaSystem = new ChakaLiveOS(window.siteSettings || {});
});
