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

        // 0. SEO & METADATA — intentionally NOT handled here.
        //
        // server.js/injectSEOMeta already writes a per-route <title>, description,
        // canonical, OG/Twitter tags and a ProfessionalService JSON-LD block before
        // the HTML leaves the origin. This block used to overwrite all of that on
        // load with one site-wide title ("...| Emmanuel Ezinna Nweke - AI & Fullstack
        // Developer") plus a second, conflicting "Person" JSON-LD schema, so every
        // page ended up with the same personal-brand title and two schemas
        // disagreeing about whether Jomiez is a person or a company.
        //
        // The server is the single source of truth for everything in <head>.
        // To change a page title, edit its route in server.js.

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
                    el.outerHTML = `<img src="${settings.about_me_page_image}" loading="lazy" alt="${settings.founder_name || 'Emmanuel Ezinna Nweke'} — Founder & CEO of Jomiez Innovation" class="about-image" id="db-about-image" width="600" height="450" style="width: 100%; height: auto; min-height: 450px; object-fit: cover; display: block; border-radius: 12px;"/>`;
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
                    // The logo slot is the template's inline <svg> on a cold export, but
                    // lib/ssr.js may already have swapped it for a <div class="brands-logo">.
                    // Match either, otherwise re-hydration finds no <svg>, leaves the
                    // cloned block untouched, and every brand renders as the first one.
                    const svg = clone.querySelector('svg, div.brands-logo');
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
                    // Decorative carousel: empty alt + aria-hidden is the correct
                    // treatment. Screen readers should skip it, not read the same
                    // keyword string once per slide.
                    img.alt = '';
                    img.setAttribute('aria-hidden', 'true');
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
                    // Decorative carousel: empty alt + aria-hidden is the correct
                    // treatment. Screen readers should skip it, not read the same
                    // keyword string once per slide.
                    img.alt = '';
                    img.setAttribute('aria-hidden', 'true');
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
            // Completely eliminate hardcoded fallback if DB is empty.
            // Hide the whole <section>, not just .testslider-wrapper — the section and
            // its .space child carry the vertical padding, so hiding only the inner
            // wrapper collapses the content but leaves an empty band behind.
            const testSection = testWrapper.closest('.section-testslider') || testWrapper.closest('section') || testWrapper;
            testSection.style.display = 'none';
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
            // Same reasoning as the slider above: hide the section so its padding
            // goes with it instead of leaving an empty band.
            const cardSection = testCardWrap.closest('section') || testCardWrap;
            cardSection.style.display = 'none';
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
            this.IDLE_WARNING_S = 20;       // 20 seconds of silence → ask "are you still there?"
            this.IDLE_DISCONNECT_S = 40;    // 40 seconds of silence (20 + 20) → end session

            // Audio FIFO Queue
            this.audioQueue = [];
            this.isPlaying = false;

            // Edge TTS text accumulation
            this.textBuffer = '';
            this.isAiSpeaking = false;

            // Visualizer
            this.analyser = null;
            this.visData = null;

            // Guided Tour & User Interaction Tracking
            this.isGuidedTourActive = false;
            this.currentTourSection = null;
            this.nextTourSection = null;
            this._lastUserScrollTime = 0;
            this._ignoreScrollUntil = 0;
            this._tourTimer = null;
            this._tourPausedForScroll = false;
            this._tourAdvanceTimer = null;
            this._speechEndTimer = null;
            this._ignoreSpeechUntil = 0;
            this._tourExploreNoticeSent = false;
            // Filled from /api/chaka/site-state during init, so the tour route always
            // matches what is actually on the site rather than a list baked into code.
            this.tourStops = [];
            this._speechRecognitionPausedByAi = false;
            this._speechRecognitionRestartTimer = null;
            this.speechRecognizer = null;
            this.fallbackProcessor = null;
            this.fallbackSilence = null;

            // Stateful Memory (Survives Hard Reloads & Tabs, Expires after 24 hours)
            let rawMemory = localStorage.getItem('chakaMemory') || sessionStorage.getItem('chakaMemory');
            let lastActive = localStorage.getItem('chakaLastActivity') || sessionStorage.getItem('chakaLastActivity');
            if (lastActive && (Date.now() - parseInt(lastActive)) > 24 * 60 * 60 * 1000) {
                rawMemory = null;
                sessionStorage.removeItem('chakaMemory');
                sessionStorage.removeItem('chakaLastActivity');
                localStorage.removeItem('chakaMemory');
                localStorage.removeItem('chakaLastActivity');
            }
            this.conversationHistory = this.sanitizeConversationHistory(rawMemory ? JSON.parse(rawMemory) : []);

            this.init();
        }

        sanitizeConversationHistory(history) {
            if (!Array.isArray(history)) return [];
            return history.filter(msg => {
                const content = String(msg?.content || '');
                const isBrokenContactMarkup = content.includes('chaka-contact-autoclick') ||
                    content.includes('onmouseover="this.style') ||
                    content.includes('target="_blank" rel="noopener"') ||
                    (content.includes('https://wa.me/') && content.includes('style="display:flex'));
                return !isBrokenContactMarkup;
            });
        }

        saveMemory() {
            try {
                const memStr = JSON.stringify(this.conversationHistory);
                const nowStr = Date.now().toString();
                sessionStorage.setItem('chakaMemory', memStr);
                sessionStorage.setItem('chakaLastActivity', nowStr);
                localStorage.setItem('chakaMemory', memStr);
                localStorage.setItem('chakaLastActivity', nowStr);
            } catch (e) {}
        }

        get apiKey() { return this.apiKeys[this.currentKeyIndex]; }

        async init() {
            window.addEventListener('scroll', () => {
                if (this.isGuidedTourActive && Date.now() > (this._ignoreScrollUntil || 0)) {
                    this._lastUserScrollTime = Date.now();
                }
            }, { passive: true });
            window.addEventListener('mousedown', () => {
                if (this.isGuidedTourActive) this._lastUserScrollTime = Date.now();
            }, { passive: true });
            window.addEventListener('touchstart', () => {
                if (this.isGuidedTourActive) this._lastUserScrollTime = Date.now();
            }, { passive: true });

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

            // Live tour route + content counts. Derived server-side from the CMS, so
            // adding or removing a section changes the tour without touching this file.
            try {
                const sRes = await fetch('/api/chaka/site-state');
                if (sRes.ok) {
                    const state = await sRes.json();
                    this.tourStops = Array.isArray(state.tourStops) ? state.tourStops : [];
                    this.siteCounts = state.counts || {};
                    this.siteStats = Array.isArray(state.stats) ? state.stats : [];
                    console.log('[Chaka] Live tour stops:', this.tourStops.join(' -> '));
                }
            } catch(e) { console.warn('[Chaka] Failed to load site state:', e); }
        }

        injectUI() {
            const uiHTML = `
                <!-- Proactive Welcome Popup -->
                <div id="chaka-welcome-popup">
                    <div class="chaka-pop-head">
                        <div class="chaka-sphere chaka-sphere--xs"></div>
                        <div>
                            <div class="chaka-name">Chaka</div>
                            <div class="chaka-status"><span class="chaka-dot"></span>Online</div>
                        </div>
                    </div>
                    <p class="chaka-pop-body">Want a quick tour? I can walk you through the work, or just answer questions.</p>
                    <div class="chaka-pop-actions">
                        <button id="chaka-btn-yes" class="chaka-btn chaka-btn--primary">Yes, show me</button>
                        <button id="chaka-btn-no" class="chaka-btn chaka-btn--ghost">No thanks</button>
                    </div>
                </div>

                <!-- Chat panel -->
                <div id="chaka-chat-modal">
                    <!-- Volumetric glow. Sits behind everything and recedes once the
                         conversation starts, so the drama is in the empty state and the
                         reading surface stays calm. -->
                    <div class="chaka-glow" aria-hidden="true">
                        <div class="chaka-glow-base"></div>
                        <div class="chaka-blob left"></div>
                        <div class="chaka-blob right"></div>
                        <div class="chaka-sparks"></div>
                    </div>

                    <div class="chaka-head">
                        <div class="chaka-head-id">
                            <div class="chaka-name">Chaka</div>
                            <div class="chaka-status"><span class="chaka-dot" id="chaka-ping"></span>Jomiez assistant</div>
                        </div>
                        <button id="chaka-close-chat" class="chaka-icon-btn" aria-label="Close chat">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    <!-- Idle state: sphere + greeting, replaced by the transcript on first send -->
                    <div class="chaka-idle" id="chaka-idle">
                        <div class="chaka-sphere chaka-sphere--lg"></div>
                        <p class="chaka-greet-sub">Hello there</p>
                        <h2 class="chaka-greet">How can I help<br>you today?</h2>
                        <div class="chaka-chips" id="chaka-chips">
                            <button type="button" class="chaka-chip" style="animation-delay:.06s">See your work</button>
                            <button type="button" class="chaka-chip" style="animation-delay:.12s">What do you build?</button>
                            <button type="button" class="chaka-chip" style="animation-delay:.18s">Start a project</button>
                            <button type="button" class="chaka-chip" style="animation-delay:.24s">Talk on WhatsApp</button>
                        </div>
                    </div>

                    <div id="chaka-chat-history" class="chaka-scrollbar"></div>

                    <div class="chaka-composer">
                        <form id="chaka-chat-form">
                            <div id="chaka-input-wrapper">
                                <textarea id="chaka-chat-input" placeholder="Ask anything…" rows="1"></textarea>
                                <button type="button" id="chaka-mic-btn" class="chaka-mic" aria-label="Talk to Chaka">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>
                                </button>
                            </div>
                            <button type="submit" id="chaka-send-btn" aria-label="Send message">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </form>
                    </div>
                </div>

                <!-- Launcher -->
                <div id="chaka-orb-container">
                    <div id="chaka-status-bubble">System Ready</div>
                    <div id="chaka-orb" role="button" tabindex="0" title="Chat with Chaka">
                        <!-- Rings ride the live audio amplitude (--ck-amp) instead of the
                             old blue bar canvas that sat off to the side of the orb. -->
                        <span class="chaka-ring r1"></span>
                        <span class="chaka-ring r2"></span>
                        <span class="chaka-ring r3"></span>
                        <span class="chaka-sphere chaka-sphere--md" id="chaka-icon"></span>
                    </div>
                </div>

                <style>
                    /* Chaka widget.
                       Visual language follows the reference in gemini tts/chaka-gemini.html:
                       pure black, a volumetric glow rising from the bottom edge built from
                       organically morphing blobs, and an idle state that gives way to the
                       transcript. Palette is the Jomiez ramp (#f63c0c -> #fe812e) rather
                       than the reference's Google blues.

                       Contrast was measured, not assumed: white on the brand orange is
                       2.50:1 (below even the 3:1 UI floor), so anything sitting ON the
                       accent uses dark ink (5.19-7.82:1). Secondary text is #8b9199
                       (5.94:1); the previous #6b7075 was 3.78:1 and failed AA. */
                    #chaka-welcome-popup, #chaka-chat-modal, #chaka-orb-container, #chaka-status-bubble {
                        --ck-black: #000000;
                        --ck-panel: #08080a;
                        --ck-raised: #1a1a1d;
                        --ck-line: rgba(255,255,255,0.07);
                        --ck-line-2: rgba(255,255,255,0.14);
                        --ck-text: #ececec;
                        --ck-muted: #b3b8b5;
                        --ck-dim: #8b9199;
                        --ck-accent: #fe812e;
                        --ck-accent-2: #f63c0c;
                        --ck-grad: linear-gradient(135deg, #f63c0c, #fe812e);
                        --ck-ink: #12060a;
                        --ck-r: 26px;
                        --ck-r-s: 12px;
                        --ck-font: 'Plus Jakarta Sans', sans-serif;
                        --ck-out: cubic-bezier(0.4, 0, 0.2, 1);
                        font-family: var(--ck-font);
                    }

                    #chaka-welcome-popup, #chaka-chat-modal {
                        position: fixed; right: 24px;
                        background: var(--ck-panel);
                        border: 1px solid var(--ck-line);
                        border-radius: var(--ck-r);
                        box-shadow: 0 1px 1px rgba(0,0,0,.4), 0 24px 70px -14px rgba(0,0,0,.85);
                        opacity: 0; pointer-events: none;
                        transition: opacity .3s var(--ck-out), transform .3s var(--ck-out);
                        overflow: hidden;
                    }

                    /* ---- glossy sphere (idle centrepiece, launcher, avatars) ---- */
                    .chaka-sphere {
                        position: relative; border-radius: 50%; flex-shrink: 0;
                        background:
                            radial-gradient(circle at 36% 28%, #ffc48c 0%, #fe812e 16%, #f63c0c 46%, #8f1f02 74%, #350c00 100%);
                        box-shadow:
                            inset -6px -9px 20px rgba(0,0,0,.55),
                            inset 5px 6px 16px rgba(255,196,140,.32),
                            0 0 42px -6px rgba(246,60,12,.6);
                    }
                    /* specular highlight — what makes it read as glass rather than a disc */
                    .chaka-sphere::after {
                        content: ""; position: absolute; left: 22%; top: 12%;
                        width: 40%; height: 28%; border-radius: 50%;
                        background: radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.85), rgba(255,255,255,0) 70%);
                        filter: blur(1px);
                    }
                    .chaka-sphere--xs { width: 34px; height: 34px; }
                    .chaka-sphere--md { width: 46px; height: 46px; }
                    .chaka-sphere--lg { width: 92px; height: 92px; }
                    .chaka-sphere--lg { animation: chakaFloat 6s var(--ck-out) infinite; }
                    @keyframes chakaFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }

                    /* ---- volumetric glow ---- */
                    .chaka-glow {
                        position: absolute; inset: 0; overflow: hidden; z-index: 0;
                        pointer-events: none;
                        transition: opacity 1s var(--ck-out), transform 1s var(--ck-out);
                    }
                    #chaka-chat-modal.is-chatting .chaka-glow { opacity: 0; transform: translateY(18%); }
                    .chaka-glow-base {
                        position: absolute; bottom: -14%; left: -10%; width: 120%; height: 52%;
                        background: radial-gradient(circle at 50% 100%, #612105 0%, #23090a 46%, transparent 70%);
                        border-radius: 50% 50% 20% 20% / 100% 100% 0 0;
                        animation: chakaFlow 11s var(--ck-out) infinite;
                    }
                    @keyframes chakaFlow {
                        0%,100% { transform: translateX(0) scale(1); border-radius: 50% 50% 20% 20% / 80% 80% 0 0; }
                        33%     { transform: translateX(-4%) scale(1.03); border-radius: 40% 60% 30% 20% / 90% 70% 10% 20%; }
                        66%     { transform: translateX(4%) scale(.97); border-radius: 60% 40% 20% 30% / 70% 90% 20% 10%; }
                    }
                    .chaka-blob {
                        position: absolute; bottom: -10%; height: 38%; width: 72%;
                        background: radial-gradient(ellipse at 50% 100%, rgba(254,129,46,.3) 0%, rgba(246,60,12,.15) 48%, transparent 70%);
                        mix-blend-mode: screen;
                        border-radius: 50% 50% 0 0 / 100% 100% 0 0;
                    }
                    .chaka-blob.left  { left: -16%;  animation: chakaBlobL 8s var(--ck-out) infinite alternate; }
                    .chaka-blob.right { right: -16%; animation: chakaBlobR 8.5s var(--ck-out) infinite alternate; }
                    @keyframes chakaBlobL { 0%{transform:translateX(0) scale(1)} 50%{transform:translateX(28%) scale(1.1)} 100%{transform:translateX(-5%) scale(.95)} }
                    @keyframes chakaBlobR { 0%{transform:translateX(0) scale(1)} 50%{transform:translateX(-28%) scale(1.1)} 100%{transform:translateX(5%) scale(.95)} }
                    /* Sparks read as light scattering in the glow, not as a tiled texture:
                       finer grid, tighter mask, and a much lower peak opacity than the
                       reference used — its pink-on-navy tolerates far more than orange
                       on pure black does. */
                    .chaka-sparks {
                        position: absolute; bottom: 0; left: -10%; width: 120%; height: 34%;
                        background-image: url("data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M9 4 C9 6.8, 11.2 9, 14 9 C11.2 9, 9 11.2, 9 14 C9 11.2, 6.8 9, 4 9 C6.8 9, 9 6.8, 9 4' fill='%23ffcb9a'/%3E%3C/svg%3E");
                        background-size: 26px 26px;
                        -webkit-mask-image: radial-gradient(ellipse at 50% 100%, #000 0%, transparent 42%);
                        mask-image: radial-gradient(ellipse at 50% 100%, #000 0%, transparent 42%);
                        mix-blend-mode: screen;
                        animation: chakaBreathe 9s var(--ck-out) infinite;
                    }
                    @keyframes chakaBreathe {
                        0%,100% { opacity: 0; transform: scale(1) }
                        15%     { opacity: .03 }
                        50%     { opacity: .22; transform: scale(1.02) translateY(-1%) }
                        85%     { opacity: .03 }
                    }

                    /* ---- popup ---- */
                    #chaka-welcome-popup {
                        bottom: 100px; width: min(324px, calc(100vw - 32px));
                        padding: 20px; z-index: 999998; transform: translateY(10px) scale(.985);
                    }
                    .chaka-pop-head { display: flex; align-items: center; gap: 12px; margin-bottom: 13px; }
                    .chaka-pop-body { color: var(--ck-muted); font-size: 14px; line-height: 1.55; margin: 0 0 18px; font-weight: 300; }
                    .chaka-pop-actions { display: flex; gap: 8px; }

                    .chaka-name { color: #fff; font-weight: 600; font-size: 15px; letter-spacing: -.01em; }
                    .chaka-status { display: flex; align-items: center; gap: 6px; margin-top: 2px; color: var(--ck-dim); font-size: 12px; font-weight: 500; }
                    .chaka-dot { width: 6px; height: 6px; border-radius: 50%; background: #35c66b; flex-shrink: 0; }

                    /* ---- controls ---- */
                    .chaka-btn {
                        flex: 1; min-height: 44px; padding: 11px 14px; border-radius: var(--ck-r-s);
                        font-family: var(--ck-font); font-weight: 600; font-size: 13.5px;
                        cursor: pointer; border: 1px solid transparent;
                        transition: filter .18s var(--ck-out), background .18s var(--ck-out), color .18s var(--ck-out);
                    }
                    .chaka-btn--primary { background: var(--ck-grad); color: var(--ck-ink); }
                    .chaka-btn--primary:hover { filter: brightness(1.07); }
                    .chaka-btn--ghost { background: transparent; color: var(--ck-muted); border-color: var(--ck-line-2); }
                    .chaka-btn--ghost:hover { background: rgba(255,255,255,.06); color: #fff; }
                    .chaka-icon-btn {
                        position: relative; background: transparent; border: 1px solid var(--ck-line);
                        color: var(--ck-dim); cursor: pointer; width: 32px; height: 32px;
                        display: flex; align-items: center; justify-content: center;
                        border-radius: 50%; transition: all .18s var(--ck-out);
                    }
                    .chaka-icon-btn::after { content: ""; position: absolute; inset: -6px; border-radius: 50%; }
                    .chaka-icon-btn:hover { background: rgba(255,255,255,.07); color: #fff; }
                    .chaka-btn:focus-visible, .chaka-icon-btn:focus-visible, #chaka-send-btn:focus-visible,
                    .chaka-chip:focus-visible, #chaka-orb:focus-visible, .chaka-mic:focus-visible {
                        outline: 2px solid var(--ck-accent); outline-offset: 2px;
                    }

                    /* ---- panel ---- */
                    #chaka-chat-modal {
                        bottom: 100px; width: min(400px, calc(100vw - 32px));
                        height: min(580px, calc(100vh - 140px));
                        z-index: 999997; display: flex; flex-direction: column;
                        transform: translateY(14px) scale(.985);
                        background: var(--ck-black);
                    }
                    .chaka-head {
                        position: relative; z-index: 3; flex: 0 0 auto; padding: 16px 18px;
                        display: flex; justify-content: space-between; align-items: center;
                    }
                    .chaka-head-id { display: flex; flex-direction: column; }

                    /* ---- idle state ---- */
                    .chaka-idle {
                        position: absolute; inset: 0; z-index: 2;
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        padding: 0 24px 96px; text-align: center; pointer-events: none;
                        transition: opacity .5s var(--ck-out), transform .5s var(--ck-out);
                    }
                    .chaka-idle .chaka-chips { pointer-events: auto; }
                    #chaka-chat-modal.is-chatting .chaka-idle { opacity: 0; transform: scale(.95) translateY(-18px); pointer-events: none; }
                    .chaka-greet-sub { color: var(--ck-dim); font-size: 13px; font-weight: 500; margin: 22px 0 6px; }
                    .chaka-greet {
                        color: var(--ck-text); font-size: 27px; font-weight: 300;
                        line-height: 1.25; letter-spacing: -.01em; margin: 0 0 22px;
                    }

                    /* ---- transcript ---- */
                    #chaka-chat-history {
                        position: relative; z-index: 3; flex: 1 1 auto; padding: 6px 18px 8px;
                        overflow-y: auto; display: flex; flex-direction: column; gap: 20px;
                        scroll-behavior: smooth; overscroll-behavior: contain;
                        opacity: 0; pointer-events: none;
                        transition: opacity .6s var(--ck-out) .15s;
                    }
                    #chaka-chat-modal.is-chatting #chaka-chat-history { opacity: 1; pointer-events: auto; }

                    /* ---- quick replies ---- */
                    .chaka-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
                    .chaka-chip {
                        background: rgba(255,255,255,.05); border: 1px solid var(--ck-line-2);
                        color: var(--ck-muted); font-family: var(--ck-font); font-size: 12.5px;
                        font-weight: 500; padding: 9px 15px; min-height: 44px; border-radius: 999px;
                        cursor: pointer; backdrop-filter: blur(8px);
                        transition: border-color .18s var(--ck-out), color .18s var(--ck-out), background .18s var(--ck-out);
                        opacity: 0; animation: chakaChipIn .4s var(--ck-out) forwards;
                    }
                    .chaka-chip:hover { border-color: rgba(254,129,46,.55); color: #fff; background: rgba(254,129,46,.1); }
                    @keyframes chakaChipIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }

                    /* ---- composer ---- */
                    .chaka-composer { position: relative; z-index: 3; flex: 0 0 auto; padding: 10px 16px 18px; }
                    #chaka-chat-form { display: flex; gap: 8px; align-items: flex-end; }
                    #chaka-input-wrapper {
                        flex: 1; background: var(--ck-raised); border: 1px solid var(--ck-line-2);
                        border-radius: 26px; padding: 0 6px 0 18px; display: flex; align-items: center;
                        transition: border-color .18s var(--ck-out), box-shadow .18s var(--ck-out);
                    }
                    #chaka-input-wrapper:focus-within { border-color: rgba(254,129,46,.5); box-shadow: 0 0 0 3px rgba(254,129,46,.12); }
                    #chaka-chat-input {
                        flex: 1; background: transparent; border: none; padding: 14px 0;
                        color: #fff; font-family: var(--ck-font); font-size: 14.5px; font-weight: 300;
                        line-height: 1.5; outline: none; resize: none; max-height: 112px; min-height: 46px;
                    }
                    #chaka-chat-input::placeholder { color: var(--ck-dim); font-weight: 300; }
                    .chaka-mic {
                        background: transparent; border: none; color: var(--ck-dim); cursor: pointer;
                        width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
                        border-radius: 50%; flex-shrink: 0; transition: color .18s var(--ck-out), background .18s var(--ck-out);
                    }
                    .chaka-mic:hover { color: var(--ck-accent); background: rgba(254,129,46,.1); }
                    .chaka-mic.is-live { color: #fff; background: #e11d48; animation: pulse_chaka 2s infinite; }
                    #chaka-send-btn {
                        background: var(--ck-grad); color: var(--ck-ink); border: none;
                        width: 46px; height: 46px; border-radius: 50%; display: flex;
                        align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
                        transition: filter .18s var(--ck-out), transform .18s var(--ck-out);
                    }
                    #chaka-send-btn:hover { filter: brightness(1.07); }
                    #chaka-send-btn:active { transform: scale(.95); }

                    /* ---- scrollbar ---- */
                    .chaka-scrollbar::-webkit-scrollbar { width: 0; }
                    .chaka-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

                    /* ---- messages ---- */
                    .chaka-msg-wrapper { display: flex; gap: 12px; width: 100%; }
                    .chaka-msg-wrapper.user { justify-content: flex-end; }
                    .chaka-msg-wrapper.ai { justify-content: flex-start; align-items: flex-start; }
                    .chaka-msg-avatar {
                        width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
                        background: radial-gradient(circle at 36% 28%, #ffc48c 0%, #fe812e 18%, #f63c0c 52%, #7d1c02 100%);
                    }
                    .chaka-msg-ai {
                        color: var(--ck-text); font-family: var(--ck-font); font-size: 15px;
                        font-weight: 300; line-height: 1.62; word-break: break-word; max-width: 90%;
                        animation: chakaFadeUp .45s var(--ck-out) forwards;
                    }
                    @keyframes chakaFadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
                    .chaka-msg-ai p { margin: 0 0 11px 0; }
                    .chaka-msg-ai p:last-child { margin: 0; }
                    .chaka-msg-ai strong { color: #fff; font-weight: 600; }
                    .chaka-msg-ai code {
                        background: rgba(254,129,46,.12); padding: 2px 6px; border-radius: 5px;
                        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
                        color: var(--ck-accent); border: 1px solid rgba(254,129,46,.22);
                    }
                    .chaka-msg-ai pre { background: #101013; padding: 14px; border-radius: var(--ck-r-s); overflow-x: auto; margin: 10px 0; border: 1px solid var(--ck-line); }
                    .chaka-msg-ai pre code { background: transparent; padding: 0; border: none; color: #e4e4e7; }
                    .chaka-msg-ai ul, .chaka-msg-ai ol { margin: 0 0 11px 0; padding-left: 18px; }
                    .chaka-msg-ai li { margin-bottom: 6px; }
                    .chaka-msg-ai a { color: var(--ck-accent); text-decoration: none; border-bottom: 1px solid rgba(254,129,46,.35); font-weight: 500; pointer-events: auto; transition: color .18s, border-color .18s; }
                    .chaka-msg-ai a:hover { color: #fff; border-bottom-color: #fff; }
                    .chaka-msg-user {
                        background: #26262a; padding: 13px 19px; border-radius: 24px; max-width: 84%;
                        color: #fff; font-family: var(--ck-font); font-size: 14.5px; font-weight: 300; line-height: 1.5;
                        animation: chakaPopIn .38s cubic-bezier(.2,.8,.2,1) forwards; transform-origin: bottom right;
                    }
                    @keyframes chakaPopIn { from { opacity: 0; transform: scale(.92) translateY(10px) } to { opacity: 1; transform: none } }
                    .chaka-msg-user p { margin: 0; }

                    /* ---- typing ---- */
                    .chaka-typing { display: flex; gap: 5px; align-items: center; height: 24px; }
                    .chaka-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--ck-accent); animation: chakaBlink 1.4s infinite ease-in-out both; }
                    .chaka-typing span:nth-child(1) { animation-delay: -.32s; }
                    .chaka-typing span:nth-child(2) { animation-delay: -.16s; }
                    @keyframes chakaBlink { 0%,80%,100% { transform: scale(0); opacity: .4 } 40% { transform: scale(1); opacity: 1 } }

                    /* ---- contact pills ---- */
                    .chaka-msg-ai a[href*="wa.me"], .chaka-msg-ai a[href^="tel:"], .chaka-msg-ai a[href^="mailto:"] {
                        display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 12px 16px;
                        font-size: 14px; border-radius: var(--ck-r-s); text-decoration: none !important;
                        border: 1px solid transparent; font-weight: 600; margin: 10px 0;
                        transition: filter .18s var(--ck-out);
                    }
                    .chaka-msg-ai a[href*="wa.me"] { background: #1da851; color: #fff; }
                    .chaka-msg-ai a[href^="tel:"], .chaka-msg-ai a[href^="mailto:"] { background: var(--ck-grad); color: var(--ck-ink); }
                    .chaka-msg-ai a[href*="wa.me"]:hover, .chaka-msg-ai a[href^="tel:"]:hover, .chaka-msg-ai a[href^="mailto:"]:hover { filter: brightness(1.07); }

                    /* ---- action cards ---- */
                    .chaka-action-card {
                        display: flex; align-items: center; gap: 12px; width: 100%; padding: 13px;
                        border-radius: var(--ck-r-s); border: 1px solid var(--ck-line);
                        background: rgba(255,255,255,.04); color: #fff; text-decoration: none !important;
                        transition: border-color .18s var(--ck-out), background .18s var(--ck-out);
                    }
                    .chaka-action-card:hover { border-color: rgba(254,129,46,.45); background: rgba(254,129,46,.08); }
                    .chaka-action-icon { width: 38px; height: 38px; border-radius: var(--ck-r-s); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
                    .chaka-action-main { flex: 1; min-width: 0; }
                    .chaka-action-title { color: #fff; font-weight: 600; font-size: 14px; line-height: 1.25; }
                    .chaka-action-subtitle { color: var(--ck-dim); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .chaka-action-arrow { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.07); color: var(--ck-muted); flex-shrink: 0; }

                    /* ---- launcher ---- */
                    #chaka-orb-container { position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
                    #chaka-status-bubble {
                        display: none; background: var(--ck-panel); border: 1px solid var(--ck-line);
                        box-shadow: 0 14px 34px -8px rgba(0,0,0,.7); color: #fff; padding: 10px 15px;
                        border-radius: var(--ck-r-s); font-family: var(--ck-font); font-size: 13px;
                        font-weight: 400; max-width: 270px; line-height: 1.45;
                    }
                    #chaka-orb {
                        /* Must stay positioned: .chaka-ring is absolutely placed with
                           inset:0 and would otherwise anchor to the fixed container,
                           stretching the wave into a full-height ellipse. */
                        position: relative;
                        width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        transition: transform .22s var(--ck-out);
                    }
                    #chaka-orb:hover { transform: translateY(-2px) scale(1.04); }
                    #chaka-orb:active { transform: scale(.96); }
                    /* ---- LIVE VOICE ORB ----
                       Bottom-lit, the way the reference reads: incandescent at the base,
                       falling through orange and oxblood to near-black at the crown, with
                       the light bleeding out underneath. The gradient's light source drifts
                       and the hue cycles slightly, so it looks lit rather than painted.
                       --ck-amp (0-1) is written from the live analyser each frame. */
                    #chaka-orb.chaka-orb-active { --ck-amp: 0; }
                    .chaka-orb-active .chaka-sphere {
                        /* Light source sits just inside the lower edge, so the hot core
                           lands ON the sphere and falls to near-black by the crown. */
                        background:
                            radial-gradient(ellipse 122% 86% at 50% 104%,
                                #fff8e4 0%, #ffdf9a 5%, #ffab3d 12%, #ff7714 21%,
                                #d94406 31%, #8d2404 42%, #4a1308 55%, #240d0e 70%,
                                #110b0e 85%, #08080a 100%) !important;
                        box-shadow:
                            inset 0 -14px 30px rgba(255,160,60,.55),
                            inset 0 10px 26px rgba(0,0,0,.9),
                            0 16px 50px -8px rgba(255,110,20,calc(.5 + var(--ck-amp) * .45)),
                            0 0 var(--ck-glow, 34px) rgba(255,140,40,calc(.32 + var(--ck-amp) * .5)) !important;
                        animation: chakaLiquid 7s ease-in-out infinite;
                        transform: scale(calc(1 + var(--ck-amp) * .06));
                        transition: transform .09s linear;
                    }
                    /* A lit sphere catches a faint edge along its crown — not the glossy
                       white dot the idle sphere carries, which read as grey plastic here. */
                    .chaka-orb-active .chaka-sphere::after {
                        left: 26%; top: 3%; width: 48%; height: 12%;
                        background: radial-gradient(ellipse at 50% 100%, rgba(255,214,170,.22), rgba(255,255,255,0) 76%);
                        filter: blur(4px);
                    }
                    @keyframes chakaLiquid {
                        0%,100% { background-position: 50% 122%; filter: hue-rotate(0deg) saturate(1); }
                        33%     { background-position: 44% 116%; filter: hue-rotate(-7deg) saturate(1.1); }
                        66%     { background-position: 56% 126%; filter: hue-rotate(6deg) saturate(.95); }
                    }

                    /* Speaking: rings breathe outward from the sphere, scaled by amplitude */
                    .chaka-ring {
                        position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
                        border: 1px solid rgba(255,150,60,.5);
                        opacity: 0; transform: scale(1);
                    }
                    .chaka-orb-active .chaka-ring {
                        animation: chakaWave 2.4s cubic-bezier(.2,.6,.3,1) infinite;
                        opacity: calc(.15 + var(--ck-amp) * .85);
                    }
                    .chaka-orb-active .chaka-ring.r2 { animation-delay: .8s; }
                    .chaka-orb-active .chaka-ring.r3 { animation-delay: 1.6s; }
                    @keyframes chakaWave {
                        0%   { transform: scale(1); opacity: .55; border-color: rgba(255,170,80,.55); }
                        70%  { opacity: .12; }
                        100% { transform: scale(calc(1.75 + var(--ck-amp) * .5)); opacity: 0; border-color: rgba(255,110,20,.05); }
                    }
                    @keyframes pulse_chaka { 0% { box-shadow: 0 0 0 0 rgba(255,120,30,.55) } 70% { box-shadow: 0 0 0 18px rgba(255,120,30,0) } 100% { box-shadow: 0 0 0 0 rgba(255,120,30,0) } }

                    /* ---- small screens ---- */
                    @media (max-width: 600px) {
                        #chaka-chat-modal, #chaka-welcome-popup { right: 12px; left: 12px; width: auto; }
                        #chaka-chat-modal { bottom: 88px; height: min(74vh, calc(100vh - 120px)); }
                        #chaka-welcome-popup { bottom: 88px; }
                        #chaka-orb-container { bottom: 16px; right: 16px; }
                        .chaka-greet { font-size: 24px; }
                    }

                    @media (prefers-reduced-motion: reduce) {
                        .chaka-glow-base, .chaka-blob, .chaka-sparks, .chaka-sphere--lg,
                        .chaka-orb-active .chaka-sphere, .chaka-typing span, .chaka-mic.is-live { animation: none; }
                        .chaka-chip { animation: none; opacity: 1; }
                        #chaka-welcome-popup, #chaka-chat-modal, #chaka-orb, .chaka-btn,
                        #chaka-send-btn, .chaka-chip, .chaka-icon-btn, .chaka-action-card { transition: none; }
                        .chaka-msg-ai, .chaka-msg-user { animation: none; }
                    }
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
            
            // Quick-reply chips: send the chip's text as if the visitor typed it. The
            // whole idle panel fades out on the first message, so the row goes with it.
            const chips = document.getElementById('chaka-chips');
            if (chips) {
                chips.addEventListener('click', (e) => {
                    const chip = e.target.closest('.chaka-chip');
                    if (!chip) return;
                    this.sendTextMessage(chip.textContent.trim());
                });
            }

            // Voice is now opt-in from inside the composer rather than something that
            // fires the moment a stranger accepts a tour.
            const micBtn = document.getElementById('chaka-mic-btn');
            if (micBtn) micBtn.addEventListener('click', () => this.toggleSession());

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
                // Deliberately does NOT auto-connect voice. Demanding microphone access
                // seconds into a first visit triggers a browser permission prompt most
                // people reflexively deny — and a denied prompt is hard to recover from.
                // The mic button in the composer makes voice a choice instead.
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
            if (!modal) return;
            if (show) {
                // The proactive popup and the chat panel occupy the same corner, so
                // opening the panel while the popup is still up stacks two cards on
                // top of each other. Opening the chat answers the popup's question.
                const popup = document.getElementById('chaka-welcome-popup');
                if (popup) {
                    popup.style.opacity = '0';
                    popup.style.pointerEvents = 'none';
                    popup.style.transform = 'scale(0.96) translateY(12px)';
                }
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
                modal.style.transform = 'scale(1) translateY(0)';
                setTimeout(() => {
                    const input = document.getElementById('chaka-chat-input');
                    if (input) input.focus();
                }, 100);
            } else {
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                modal.style.transform = 'scale(0.96) translateY(16px)';
            }
        }

        escapeHtml(value = '') {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        sanitizeActionUrl(rawUrl = '') {
            const cleaned = String(rawUrl || '')
                .trim()
                .replace(/^['"]+|['"]+$/g, '')
                .replace(/["'<>`]/g, '');
            if (!cleaned) return null;
            if (/^(https:\/\/|http:\/\/|mailto:|tel:)/i.test(cleaned)) return cleaned;
            return null;
        }

        renderContactCard(contact) {
            const safeUrl = this.sanitizeActionUrl(contact.url);
            if (!safeUrl) return '';
            const label = this.escapeHtml(contact.label || 'Open contact');
            const subtitle = this.escapeHtml(contact.subtitle || safeUrl.replace(/^mailto:|^tel:/i, ''));
            const color = this.escapeHtml(contact.color || '#fe812e');
            const icon = contact.iconSvg || `<span style="font-size:20px;line-height:1;">${this.escapeHtml(contact.icon || '')}</span>`;
            return `
                <a href="${this.escapeHtml(safeUrl)}" target="_blank" rel="noopener" id="chaka-contact-autoclick" class="chaka-action-card">
                    <span class="chaka-action-icon" style="background:linear-gradient(135deg, ${color}, rgba(255,255,255,0.16));">${icon}</span>
                    <span class="chaka-action-main">
                        <span class="chaka-action-title">${label}</span>
                        <span class="chaka-action-subtitle">${subtitle}</span>
                    </span>
                    <span class="chaka-action-arrow">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"></path><path d="M8 7h9v9"></path></svg>
                    </span>
                </a>
            `;
        }

        appendChatMessage(role, text, isRawHtml = false) {
            const historyArea = document.getElementById('chaka-chat-history');
            // First message swaps the panel out of its idle state: the greeting and the
            // ambient glow recede so the transcript reads against calm black.
            const modal = document.getElementById('chaka-chat-modal');
            if (modal) modal.classList.add('is-chatting');
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
                    <div class="chaka-msg-avatar"></div>
                    <div class="chaka-msg-ai">${formattedText}</div>
                `;
            }
            
            // Post-process links to make them robust buttons
            if (!isRawHtml) wrapper.querySelectorAll('.chaka-msg-ai a').forEach(a => {
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
                this.saveMemory();
            }
        }

        // ========================
        // TEXT CHAT — Gemini 2.5 Flash REST (separate from voice)
        // ========================
        // Shows/hides a typing indicator inside the transcript. The status bubble by
        // the orb was the only "thinking" signal, which sits outside the panel the
        // visitor is actually looking at.
        setChatTyping(on) {
            const history = document.getElementById('chaka-chat-history');
            if (!history) return;
            const existing = document.getElementById('chaka-typing-row');
            if (!on) { if (existing) existing.remove(); return; }
            if (existing) return;
            const row = document.createElement('div');
            row.id = 'chaka-typing-row';
            row.className = 'chaka-msg-wrapper ai';
            row.setAttribute('aria-live', 'polite');
            row.setAttribute('aria-label', 'Chaka is typing');
            row.innerHTML = `
                <div class="chaka-msg-avatar"></div>
                <div class="chaka-msg-ai"><div class="chaka-typing"><span></span><span></span><span></span></div></div>`;
            history.appendChild(row);
            history.scrollTop = history.scrollHeight;
        }

        async sendTextMessage(text) {
            this.appendChatMessage('user', text);
            // The in-panel typing dots are the "thinking" signal now. The launcher
            // bubble stays for voice mode, where there is no transcript to put it in —
            // firing both just overlaps the panel.
            this.setChatTyping(true);

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

                this.setChatTyping(false);
                if (data.text) this.appendChatMessage('assistant', data.text);

                if (data.toolCalls && data.toolCalls.length > 0) {
                    await this.handleToolCall({ functionCalls: data.toolCalls });
                }

                this.showBubble('', 0);
            } catch (e) {
                console.error('[Chaka] Chat text error:', e);
                this.setChatTyping(false);
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
            const mic = document.getElementById('chaka-mic-btn');
            const live = state === 'connected';
            // The launcher is a glass sphere now, not an <svg>, so the listening state is
            // expressed by the sphere itself (red + pulse via .chaka-orb-active) rather
            // than by swapping icon paths into it.
            if (orb) orb.classList.toggle('chaka-orb-active', live);
            if (mic) mic.classList.toggle('is-live', live);
            if (!live && orb) { orb.style.removeProperty('--ck-amp'); orb.style.removeProperty('--ck-glow'); }
            if (live) this.showBubble('Chaka is listening…', 3000);
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

            this.socket.onopen = async () => {
                console.log(`[Chaka] Socket open (Key #${this.currentKeyIndex + 1})`);
                this.sendSetup();
                this.isConnected = true;
                const micStarted = await this.startMic();
                this.updateUI(micStarted ? 'connected' : 'disconnected');

                // Issue #3: AI greets immediately on connect
                this.sendGreeting();

                // Start idle watchdog (polling-based, immune to mic noise)
                if (micStarted) {
                    this.startIdleWatchdog();
                } else {
                    this.showBubble("I couldn't access the microphone. Tap again or check browser mic permission.", 7000);
                }
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
                    this.markActivity('server_interruption');
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
                        this.pauseUserSpeechCapture(6000);
                        this.speakWithEdgeTTS(this.textBuffer.trim());
                    }
                    // Save to memory for context but don't display
                    if (this.textBuffer.trim()) {
                        this.conversationHistory.push({ role: 'assistant', content: this.textBuffer.trim() });
                        this.saveMemory();
                    }
                    this.textBuffer = '';

                    // ━━━ IDLE WATCHDOG: Update activity timestamp when AI finishes speaking ━━━
                    // This ensures the idle countdown starts AFTER the AI stops talking,
                    // not while it's still mid-sentence.
                    if (!this._pendingGoodbyeDisconnect && !this._idleWarned) {
                        this._lastActivityTime = Date.now();
                    }

                    // If pending goodbye disconnect, end session now that AI finished speaking
                    if (this._pendingGoodbyeDisconnect) {
                        this._pendingGoodbyeDisconnect = false;
                        console.log('[Chaka] AI goodbye complete — disconnecting session.');
                        setTimeout(() => { if (this.isConnected) this.disconnect(); }, 1500);
                    }
                    // First turnComplete after the warning is the AI speaking the warning
                    // itself. Start the disconnect countdown from the moment it stops
                    // talking, so the user gets the full window to reply.
                    else if (this._idleWarned && !this._warningSpoken) {
                        this._warningSpoken = true;
                        this._lastActivityTime = Date.now();
                        console.log(`[Chaka] Warning delivered. ${this.IDLE_DISCONNECT_S - this.IDLE_WARNING_S}s to goodbye.`);
                    }
                    // NOTE: there used to be a third branch here that cleared _idleWarned
                    // on any further turnComplete, on the assumption that a second turn
                    // meant "the user replied". turnComplete fires when the *AI* finishes
                    // a turn, not when the user speaks — so a continuation or a tool
                    // response re-armed the warning and the session never reached phase 2.
                    // That is why the check-in repeated forever and the socket stayed open
                    // burning quota. Genuine user speech is handled by markActivity(),
                    // which resets the same state and already guards against the AI
                    // hearing itself.
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
1. SITE NAVIGATION: Use navigate_to to move between pages. Use scroll_to to jump to sections — supports 'top', 'bottom', 'hero', 'about', 'stats', 'services', 'works', 'testimonials', 'faq', 'contact', 'footer'.
2. PORTFOLIO SHOWCASE: Know every project, service, tech stack, and achievement. Present them compellingly.
3. CONTACT FACILITATION: Use showContactMethod to display interactive contact cards.
4. CONTENT MANAGEMENT (Admin only): Use manageWorks, manageServices, updateSiteSetting.
5. IMAGE SOURCING: Use searchImages to find professional imagery.
6. SPOTLIGHT: Use highlightElement to make any section glow/pulse to draw the visitor's attention. Great for showcasing.
7. GUIDED TOUR: When a visitor asks for a tour, be a calm guide who keeps the flow moving. Start with guidedTour(section='hero'), speak only about the visible stop, then let the system auto-cue the next stop after your voice finishes. Do not ask "shall we continue?", "ready?", or any permission question BETWEEN stops — bridge with statements like "Next, I'll take you into the About page."
   THE VISITOR IS ALWAYS IN CONTROL. The moment they signal they want out — "stop", "skip", "I've seen this", "I already know the site", "just take me to X", or any request that isn't about the current stop — call endTour FIRST, then do what they asked. Never talk them back into the tour, never resume it afterwards, and never treat "keep the flow moving" as a reason to override a direct request. Being unstoppable is not confidence, it is a bad guide.
   Only visit stops listed under GUIDED TOUR STOPS in the site knowledge. That list is generated from the live site; a section missing from it is not on the site any more, so never announce or navigate to it.
8. THEME CONTROL: Use toggleTheme to switch between dark and light modes on command.

INTELLIGENCE PROTOCOLS:
- ANTICIPATE NEEDS: If someone asks about a project, proactively offer to show it. If they seem interested in hiring, guide them toward contact.
- HANDLE ANYTHING: If asked something outside the portfolio scope, answer thoughtfully using general knowledge, then naturally steer back to how the portfolio owner can help them.
- OBJECTION HANDLING: If a visitor seems skeptical or hesitant, address their concerns confidently using specific portfolio evidence — projects completed, technologies mastered, results delivered.
- QUALIFY LEADS: Naturally understand what the visitor needs (web development, mobile app, design, etc.) and match it to relevant services and projects in the portfolio.
- CONTEXT AWARENESS: Reference earlier parts of the conversation. Never ask for information already provided. Build on what you know.
- PROACTIVE GUIDANCE: Don't just answer questions — guide the conversation. Suggest relevant pages, showcase matching projects, recommend next steps.
- NATURAL TRANSITIONS: Smoothly transition between topics. If showing a project, naturally ask if they'd like to see more or get in touch.

SESSION ENDING:
- When the user says goodbye, bye, thanks that's all, I'm done, gotta go, or naturally ends the conversation, call endSession to gracefully close the stream.
- Say a warm farewell FIRST, then call endSession. Do NOT wait for idle timers.
- Be human about it — match their energy. If they're casual say "Catch you later!", if professional say "It was a pleasure helping you."

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
                                name: "scroll_to",
                                description: "Scroll to a section on the current page. VALID targets: 'top' (very top of page), 'bottom', 'hero', 'about', 'stats', 'services', 'works', 'projects', 'testimonials', 'faq', 'brands', 'contact', 'footer'. Always use this for scroll requests.",
                                parameters: { type: "OBJECT", properties: { section_concept: { type: "STRING", description: "Section to scroll to. Use 'top' for page top, 'bottom' for page bottom, or a section name." } }, required: ["section_concept"] }
                            },
                            {
                                name: "showContactMethod",
                                description: "Shows an interactive contact card in the chat. Set auto_open to false by default. Only set auto_open to true if the user EXPLICITLY asked you to open/launch it. Valid methods: whatsapp, phone, email, instagram, linkedin, github.",
                                parameters: { 
                                    type: "OBJECT", 
                                    properties: { 
                                        method: { type: "STRING", description: "The contact method to show." },
                                        auto_open: { type: "BOOLEAN", description: "ONLY set true if the user EXPLICITLY asked to be taken/redirected. Default false." }
                                    }, 
                                    required: ["method"] 
                                }
                            },
                            {
                                name: "endSession",
                                description: "Gracefully end the voice stream session. Call this AFTER saying your farewell when the user says bye, goodbye, thanks that's all, I'm done, etc. This closes the connection cleanly.",
                                parameters: { type: "OBJECT", properties: {} }
                            },
                            {
                                name: "highlightElement",
                                description: "Spotlight a section on the page with a premium guided-tour focus ring. Great for showcasing projects, services, stats, or CTAs. Use section names: 'hero', 'about', 'stats', 'services', 'works', 'testimonials', 'faq', 'contact', 'footer'.",
                                parameters: { type: "OBJECT", properties: { section: { type: "STRING", description: "Section to highlight." } }, required: ["section"] }
                            },
                            {
                                name: "guidedTour",
                                description: "Navigate to and highlight one guided-tour stop. Opens the real page when needed: about/stats -> /about, services -> /services, works -> /works, contact -> /contact-us. Call it for one stop, narrate that visible stop briefly, then stop. The system auto-cues the next stop, so do not ask permission to continue. Only use stops listed as available in the site knowledge — never a section that is not on the live site.",
                                parameters: { type: "OBJECT", properties: { section: { type: "STRING", description: "The stop to show. Use only stops listed under GUIDED TOUR STOPS in the site knowledge." } }, required: ["section"] }
                            },
                            {
                                name: "endTour",
                                description: "Immediately cancel the guided tour. Call this the MOMENT the visitor signals they want out of it — 'stop', 'skip', 'I've seen this', 'just show me X', or any request that isn't the current stop. Call it BEFORE doing what they asked, otherwise the tour resumes over the top of their request. Also call it if they say they already know the site.",
                                parameters: { type: "OBJECT", properties: { reason: { type: "STRING", description: "Brief reason, e.g. 'visitor asked to skip to projects'." } } }
                            },
                            {
                                name: "toggleTheme",
                                description: "Toggle the site between dark and light mode. Use when the user asks for light mode, dark mode, or to change the theme.",
                                parameters: { type: "OBJECT", properties: { theme: { type: "STRING", description: "'light' or 'dark'" } }, required: ["theme"] }
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

            // Check if this is a returning user (has recent conversation history or localStorage memory within 24h)
            const isReturning = (this.conversationHistory && this.conversationHistory.length > 0) || !!localStorage.getItem('chakaMemory');
            const lastTopic = isReturning ? this.conversationHistory.slice(-3).map(m => m.content).join(' ').substring(0, 200) : '';

            let greetingPrompt;
            if (isReturning) {
                greetingPrompt = `[SYSTEM: The user just reconnected or returned to the live voice session (you have conversed within the last 24 hours). DO NOT introduce yourself from scratch (DO NOT say "I am Chaka" or "Welcome to the portfolio"). Welcome them back warmly and briefly (e.g. "Welcome back! Ready to continue?" or "Hey again! What can we tackle next?"). Recent conversation context: "${lastTopic}". Keep it very short, natural, and human-like.]`;
            } else {
                greetingPrompt = `[SYSTEM: The user just connected to the live stream for the first time. It is currently ${timeContext} (${new Date().toLocaleTimeString()}). Greet them warmly and naturally based on the time of day, introduce yourself briefly as Chaka, and ask how you can help them today. Be conversational, warm, and human-like. Keep it short and inviting.]`;
            }

            // Send a client text prompt that triggers the AI to speak first
            setTimeout(() => {
                this.sendSystemPrompt(greetingPrompt);
            }, 800);
        }

        sendSystemPrompt(promptText) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{ text: promptText }]
                        }],
                        turnComplete: true
                    }
                }));
            }
        }

        // ──────────────────────────────────────────────────────
        // IDLE WATCHDOG — Polling-based (immune to mic noise resets)
        // Instead of setTimeout chains that get cleared by mic noise,
        // we poll every 5s and check elapsed silence from _lastActivityTime.
        // ──────────────────────────────────────────────────────
        startIdleWatchdog() {
            this.stopIdleWatchdog();
            this.clearGoodbyeFailsafe();
            this._lastActivityTime = Date.now();
            this._idleWarned = false;
            this._idleGoodbyeSent = false;
            this._warningSpoken = false;
            this._pendingGoodbyeDisconnect = false;

            console.log(`[Chaka] Idle watchdog started (warn: ${this.IDLE_WARNING_S}s, disconnect: ${this.IDLE_DISCONNECT_S}s)`);

            this._idleCheckInterval = setInterval(() => {
                if (!this.isConnected) { this.stopIdleWatchdog(); return; }
                if (this.isAiSpeaking || (this.audioQueue && this.audioQueue.length > 0) || this.isPlaying) {
                    this._lastActivityTime = Date.now();
                    return;
                }

                const silenceSec = (Date.now() - this._lastActivityTime) / 1000;

                // Phase 1: Warning (natural, varied prompts)
                if (!this._idleWarned && silenceSec >= this.IDLE_WARNING_S) {
                    this._idleWarned = true;
                    this._warningSpoken = false;
                    const warningVariants = [
                        'The user has gone quiet. Gently check in — maybe say something like "Hey, you still with me?" or "Still there? No rush, just checking in." Be warm, casual, and brief.',
                        'The user seems to have gone silent. Casually nudge them — something like "Hey, just making sure you\'re still around!" or "Take your time, I\'m right here whenever you\'re ready." Keep it short and natural.',
                        'It\'s been quiet for a bit. Check in naturally — try something like "Hello? Did I lose you?" or "Still there? I\'m not going anywhere!" Be friendly and keep it to one sentence.',
                        'The user hasn\'t said anything in a while. Do a friendly check-in — like "Hey there, everything good?" or "Just checking — are you still around?" One sentence, casual tone.'
                    ];
                    const prompt = warningVariants[Math.floor(Math.random() * warningVariants.length)];
                    console.log(`[Chaka] ${silenceSec.toFixed(0)}s silence — sending idle warning.`);
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            clientContent: {
                                turns: [{
                                    role: 'user',
                                    parts: [{ text: `[SYSTEM: ${prompt}]` }]
                                }],
                                turnComplete: true
                            }
                        }));
                    }
                }

                // Phase 2: Goodbye + disconnect
                if (this._idleWarned && !this._idleGoodbyeSent && silenceSec >= this.IDLE_DISCONNECT_S) {
                    this._idleGoodbyeSent = true;
                    const goodbyeVariants = [
                        'The user did not respond. Say a quick, warm goodbye — like "Alright, looks like you stepped away. I\'ll close out for now, but come back anytime! Catch you later!" Keep it brief and friendly.',
                        'No response from the user. Wrap up naturally — something like "Okay, seems like you\'re busy. I\'ll let you go for now. Feel free to hit me up whenever you need me. Take care!" One or two sentences max.',
                        'The user hasn\'t come back. End the session warmly — like "Hey, I think you might have stepped away. No worries! I\'ll be right here whenever you want to chat again. See you next time!" Keep it short.'
                    ];
                    const prompt = goodbyeVariants[Math.floor(Math.random() * goodbyeVariants.length)];
                    console.log(`[Chaka] ${silenceSec.toFixed(0)}s silence — sending goodbye and disconnecting.`);
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            clientContent: {
                                turns: [{
                                    role: 'user',
                                    parts: [{ text: `[SYSTEM: ${prompt}]` }]
                                }],
                                turnComplete: true
                            }
                        }));
                    }
                    this._pendingGoodbyeDisconnect = true;
                    this.stopIdleWatchdog();

                    // Failsafe. The actual disconnect is triggered by turnComplete once
                    // the goodbye finishes speaking — but if that turn never arrives
                    // (stalled socket, dropped response) the watchdog is already stopped
                    // and nothing else would ever close the session. It would sit open
                    // against the API indefinitely.
                    clearTimeout(this._goodbyeFailsafe);
                    this._goodbyeFailsafe = setTimeout(() => {
                        if (this.isConnected) {
                            console.warn('[Chaka] Goodbye turn never completed — forcing disconnect.');
                            this.disconnect();
                        }
                    }, 15000);
                }
            }, 2000); // Check every 2 seconds for crisp timing
        }

        stopIdleWatchdog() {
            if (this._idleCheckInterval) {
                clearInterval(this._idleCheckInterval);
                this._idleCheckInterval = null;
            }
        }

        // Clears the goodbye failsafe — call whenever the session ends by any route,
        // so a stale timer can't disconnect a session the user has since restarted.
        clearGoodbyeFailsafe() {
            if (this._goodbyeFailsafe) {
                clearTimeout(this._goodbyeFailsafe);
                this._goodbyeFailsafe = null;
            }
        }

        // Called when real user speech is detected
        markActivity(source = 'user') {
            if (source === 'speech_recognition' && (this.isAiSpeaking || this.isPlaying || Date.now() < (this._ignoreSpeechUntil || 0))) {
                console.log('[Chaka] Ignoring speech recognition during AI output.');
                return;
            }
            this._lastActivityTime = Date.now();
            // If user speaks after being warned, reset the warning state
            if (this._idleWarned && this._warningSpoken && !this._idleGoodbyeSent) {
                console.log('[Chaka] User speech detected after warning — resetting idle state.');
                this._idleWarned = false;
                this._warningSpoken = false;
            }
        }

        disconnect() {
            console.log("[Chaka] Intentional disconnect requested.");
            this.intentionalDisconnect = true;
            this.stopIdleWatchdog();
            this.clearGoodbyeFailsafe();
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

        pauseUserSpeechCapture(duration = 2600) {
            this._ignoreSpeechUntil = Math.max(this._ignoreSpeechUntil || 0, Date.now() + duration);
            if (this._speechRecognitionRestartTimer) clearTimeout(this._speechRecognitionRestartTimer);
            this._speechRecognitionPausedByAi = true;

            this._speechRecognitionRestartTimer = setTimeout(() => {
                this.resumeUserSpeechCapture();
            }, duration);
        }

        resumeUserSpeechCapture() {
            if (this._speechRecognitionRestartTimer) {
                clearTimeout(this._speechRecognitionRestartTimer);
                this._speechRecognitionRestartTimer = null;
            }
            if (!this._speechRecognitionPausedByAi) return;
            this._speechRecognitionPausedByAi = false;
            if (this.isConnected && this.speechRecognizer) {
                try { this.speechRecognizer.start(); } catch(e) {}
            }
        }

        transmitMicPcm(int16Data) {
            if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            if (!this.micBuffer) this.micBuffer = [];
            this.micBuffer.push(...int16Data);

            const TRANSMIT_SIZE = 4048;
            while (this.micBuffer.length >= TRANSMIT_SIZE) {
                const chunk = this.micBuffer.splice(0, TRANSMIT_SIZE);
                const int16Arr = new Int16Array(chunk);
                const base64 = this.arrayBufferToBase64(int16Arr.buffer);
                this.socket.send(JSON.stringify({
                    realtimeInput: {
                        audio: {
                            data: base64,
                            mimeType: "audio/pcm;rate=16000"
                        }
                    }
                }));
            }
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

                try {
                    await this.inputCtx.audioWorklet.addModule('/js/mic-worklet.js');
                    this.processor = new AudioWorkletNode(this.inputCtx, 'mic-worklet');
                    source.connect(this.processor);
                    this.processor.port.onmessage = (e) => {
                        this.transmitMicPcm(new Int16Array(e.data));
                    };
                } catch(workletError) {
                    console.warn('[Chaka] AudioWorklet unavailable, using fallback mic capture.', workletError);
                    this.fallbackProcessor = this.inputCtx.createScriptProcessor(4096, 1, 1);
                    this.fallbackSilence = this.inputCtx.createGain();
                    this.fallbackSilence.gain.value = 0;
                    this.fallbackProcessor.onaudioprocess = (event) => {
                        const input = event.inputBuffer.getChannelData(0);
                        const int16Data = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) {
                            const s = Math.max(-1, Math.min(1, input[i]));
                            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }
                        this.transmitMicPcm(int16Data);
                    };
                    source.connect(this.fallbackProcessor);
                    this.fallbackProcessor.connect(this.fallbackSilence);
                    this.fallbackSilence.connect(this.inputCtx.destination);
                }

                // Initialize Web Speech API for continuous understandable word/sentence monitoring
                if (!this.speechRecognizer && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
                    try {
                        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
                        this.speechRecognizer = new SpeechRec();
                        this.speechRecognizer.continuous = true;
                        this.speechRecognizer.interimResults = false;
                        this.speechRecognizer.lang = 'en-US';
                        this.speechRecognizer.onresult = (event) => {
                            for (let i = event.resultIndex; i < event.results.length; ++i) {
                                if (event.results[i].isFinal) {
                                    const transcript = event.results[i][0].transcript.trim();
                                    // Only mark activity if understandable words/sentences are spoken
                                    if (transcript.length >= 2) {
                                        console.log('[Chaka] Meaningful speech recognized:', transcript);
                                        this.markActivity('speech_recognition');
                                    }
                                }
                            }
                        };
                        this.speechRecognizer.onerror = () => {};
                        this.speechRecognizer.onend = () => {
                            if (this.isConnected && this.speechRecognizer && !this._speechRecognitionPausedByAi) {
                                try { this.speechRecognizer.start(); } catch(e) {}
                            }
                        };
                        this.speechRecognizer.start();
                    } catch(e) { console.log('[Chaka] SpeechRecognition fallback to AI server validation.'); }
                }
                return true;
            } catch (e) {
                console.error("[Chaka] Mic start failed:", e);
                this.stopMic();
                return false;
            }
        }

        stopMic() {
            if (this._speechRecognitionRestartTimer) {
                clearTimeout(this._speechRecognitionRestartTimer);
                this._speechRecognitionRestartTimer = null;
            }
            this._speechRecognitionPausedByAi = false;
            if (this.speechRecognizer) {
                try { this.speechRecognizer.stop(); } catch(e) {}
                this.speechRecognizer = null;
            }
            if (this.fallbackProcessor) {
                try { this.fallbackProcessor.disconnect(); } catch(e) {}
            }
            if (this.fallbackSilence) {
                try { this.fallbackSilence.disconnect(); } catch(e) {}
            }
            if (this.processor) this.processor.disconnect();
            if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
            if (this.inputCtx) this.inputCtx.close();
            this.processor = null;
            this.fallbackProcessor = null;
            this.fallbackSilence = null;
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
            this.pauseUserSpeechCapture(4200);
            const binary = atob(base64Data);
            const bytes = new Int16Array(binary.length / 2);
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
            }
            const floatData = new Float32Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) floatData[i] = bytes[i] / 32768.0;

            // Accumulate chunks into a staging buffer before playing
            // This prevents crackling caused by playing tiny fragments with gaps between them
            if (!this._audioStagingBuffer) this._audioStagingBuffer = [];
            this._audioStagingBuffer.push(floatData);

            // Flush staging buffer into a single merged chunk every 200ms
            // to eliminate micro-gaps between tiny audio fragments
            if (!this._audioFlushTimer) {
                this._audioFlushTimer = setTimeout(() => {
                    this._audioFlushTimer = null;
                    if (this._audioStagingBuffer && this._audioStagingBuffer.length > 0) {
                        const totalLen = this._audioStagingBuffer.reduce((sum, b) => sum + b.length, 0);
                        const merged = new Float32Array(totalLen);
                        let offset = 0;
                        for (const buf of this._audioStagingBuffer) {
                            merged.set(buf, offset);
                            offset += buf.length;
                        }
                        this._audioStagingBuffer = [];
                        this.audioQueue.push(merged);
                        if (!this.isPlaying) this.playNextInQueue();
                    }
                }, 200);
            }
        }

        playNextInQueue() {
            if (this.audioQueue.length === 0) {
                this.isPlaying = false;
                this.isAiSpeaking = false;
                this.pauseUserSpeechCapture(2200);
                this.scheduleAiSpeechEnd();
                return;
            }
            this.isPlaying = true;
            this.isAiSpeaking = true;
            this.pauseUserSpeechCapture(4200);
            if (this._speechEndTimer) {
                clearTimeout(this._speechEndTimer);
                this._speechEndTimer = null;
            }
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

        scheduleAiSpeechEnd() {
            if (this._speechEndTimer) clearTimeout(this._speechEndTimer);
            this._speechEndTimer = setTimeout(() => {
                this._speechEndTimer = null;
                const hasPendingAudio = this.isPlaying || this.isAiSpeaking || (this.audioQueue && this.audioQueue.length > 0) || (this._audioStagingBuffer && this._audioStagingBuffer.length > 0);
                if (hasPendingAudio) return;
                this.onAiSpeechEnd();
            }, 550);
        }

        // Stats narration comes from the counters table, not from figures baked into
        // this file. The old wording also told the model to claim "work not all listed
        // publicly", which is an instruction to embellish — a visitor who asks a
        // follow-up about that unlisted work gets an invented answer.
        statsNarration() {
            const stats = (this.siteStats || []).filter(Boolean);
            if (!stats.length) return 'Describe only what is visible on screen. Do not quote any figures.';
            return `State these figures exactly as given, and claim nothing beyond them: ${stats.join('; ')}.`;
        }

        // Cancels the guided tour and every timer that would resume it.
        //
        // Previously nothing could stop a tour once it started: isGuidedTourActive was
        // only cleared by reaching the final stop, so a visitor who said "skip this, just
        // show me the projects" got taken to the projects and then dragged back into the
        // sequence by the pending auto-advance. Any exit route has to clear the timers,
        // not just the flag, or onAiSpeechEnd re-arms it on the next utterance.
        abortTour(reason = 'visitor request') {
            if (!this.isGuidedTourActive) return false;
            console.log(`[Chaka] Guided tour cancelled — ${reason}.`);
            this.isGuidedTourActive = false;
            this.currentTourSection = null;
            this.nextTourSection = null;
            this._tourPausedForScroll = false;
            this._tourExploreNoticeSent = false;
            if (this._tourTimer) { clearInterval(this._tourTimer); this._tourTimer = null; }
            if (this._tourAdvanceTimer) { clearTimeout(this._tourAdvanceTimer); this._tourAdvanceTimer = null; }
            return true;
        }

        onAiSpeechEnd() {
            if (!this.isConnected || !this.isGuidedTourActive) return;
            if (this._tourTimer) clearInterval(this._tourTimer);
            this._tourTimer = null;
            if (this._tourAdvanceTimer) clearTimeout(this._tourAdvanceTimer);

            if (!this.nextTourSection) {
                this._tourAdvanceTimer = setTimeout(() => {
                    if (!this.isConnected || !this.isGuidedTourActive || this.isAiSpeaking || this.isPlaying) return;
                    this.isGuidedTourActive = false;
                    this.sendSystemPrompt(`[SYSTEM: You have just shown the final section of the website. Conclude the guided tour warmly in one or two sentences. Ask if they have any questions about what they saw, and offer to help them get in touch or explore a specific project.]`);
                }, 850);
                return;
            }

            this._tourAdvanceTimer = setTimeout(async () => {
                if (!this.isConnected || !this.isGuidedTourActive || this.isAiSpeaking || this.isPlaying) {
                    return;
                }

                // If visitor scrolled or clicked recently, give them space before continuing.
                const timeSinceScroll = Date.now() - (this._lastUserScrollTime || 0);
                if (timeSinceScroll < 1800) {
                    this._tourPausedForScroll = true;
                    console.log('[Chaka] Tour waiting: visitor is actively exploring section.');
                    if (!this._tourExploreNoticeSent) {
                        this._tourExploreNoticeSent = true;
                        this.showBubble("Take your time. I'll continue when you stop scrolling.", 3200);
                        this.sendSystemPrompt(`[SYSTEM: The visitor is actively scrolling or inspecting the "${this.currentTourSection}" stop. Acknowledge it in one short, calm sentence, such as "I can see you're taking a closer look, take your time. I'll continue once you're done." Do NOT ask a permission question and do NOT call any tools yet.]`);
                    } else {
                        this.scheduleAiSpeechEnd();
                    }
                    return;
                }

                this._tourPausedForScroll = false;
                this._tourExploreNoticeSent = false;

                const nextSec = this.nextTourSection;
                console.log(`[Chaka] Instantly advancing guided tour to: ${nextSec}`);
                const result = await this.showGuidedTourStop(nextSec, true);
                if (!result.executed) {
                    this.sendSystemPrompt(`[SYSTEM: I tried to continue the tour to "${nextSec}", but the page element was not found. Apologize briefly and continue with the next best useful part of the portfolio without asking permission.]`);
                    return;
                }
                this.sendSystemPrompt(`[SYSTEM: The screen has already moved to and highlighted the "${nextSec}" stop at ${result.currentPage}. Narrate only what is visible in 1-2 natural sentences. ${nextSec === 'stats' ? this.statsNarration() : ''} Do not call guidedTour again for this same stop. Do not ask whether to continue, do not ask if they are ready, and do not wait for permission. You may briefly say where you are taking them next at the end.]`);
            }, 350);
        }

        stopCurrentAudio() {
            this.audioQueue = [];
            this.isPlaying = false;
            this.isAiSpeaking = false;
            this.pauseUserSpeechCapture(1800);
            if (this._speechEndTimer) clearTimeout(this._speechEndTimer);
            if (this._tourAdvanceTimer) clearTimeout(this._tourAdvanceTimer);
            this._speechEndTimer = null;
            this._tourAdvanceTimer = null;
        }

        // Feeds live audio amplitude into the orb as the --ck-amp custom property, which
        // the rings and the sphere's glow read. Replaces the old canvas that painted cyan
        // bars in a strip beside the orb — off-brand, and detached from the thing talking.
        drawVisualizer() {
            if (!this.analyser) return;
            requestAnimationFrame(() => this.drawVisualizer());

            const orb = document.getElementById('chaka-orb');
            if (!orb) return;

            this.analyser.getByteFrequencyData(this.visData);

            // Average the low/mid bands — that is where speech energy sits, so the ring
            // tracks voice rather than hiss.
            const bins = Math.min(32, this.visData.length);
            let sum = 0;
            for (let i = 0; i < bins; i++) sum += this.visData[i];
            const raw = Math.min(1, (sum / bins) / 140);

            // Ease upward fast, fall slowly, so the ring pulses with speech instead of
            // flickering on every frame.
            const prev = this._ampSmoothed || 0;
            this._ampSmoothed = raw > prev ? raw : prev + (raw - prev) * 0.12;

            orb.style.setProperty('--ck-amp', this._ampSmoothed.toFixed(3));
            orb.style.setProperty('--ck-glow', `${34 + this._ampSmoothed * 46}px`);
        }

        ensureSpotlightStyles() {
            if (document.getElementById('chaka-spotlight-styles')) return;
            const style = document.createElement('style');
            style.id = 'chaka-spotlight-styles';
            style.textContent = `
                .chaka-spotlight-target {
                    position: relative !important;
                    z-index: 3 !important;
                    isolation: isolate;
                    border-radius: var(--chaka-spotlight-radius, 18px) !important;
                    box-shadow:
                        0 0 0 1px rgba(255,255,255,0.18),
                        0 0 0 8px rgba(0, 180, 255, 0.12),
                        0 22px 70px rgba(0, 132, 255, 0.32),
                        inset 0 0 34px rgba(0, 221, 255, 0.12) !important;
                    transform: translateY(-2px);
                    transition: box-shadow 420ms ease, transform 420ms ease, filter 420ms ease !important;
                }
                .chaka-spotlight-target::before {
                    content: "";
                    position: absolute;
                    inset: -12px;
                    border-radius: calc(var(--chaka-spotlight-radius, 18px) + 12px);
                    border: 1px solid rgba(128, 226, 255, 0.72);
                    background: linear-gradient(135deg, rgba(0,243,255,0.14), rgba(255,255,255,0.04), rgba(0,102,255,0.12));
                    box-shadow: 0 0 34px rgba(0, 213, 255, 0.38);
                    pointer-events: none;
                    z-index: -1;
                    animation: chakaSpotlightBreathe 2.6s ease-in-out infinite;
                }
                .chaka-spotlight-target::after {
                    content: "";
                    position: absolute;
                    inset: -2px;
                    border-radius: var(--chaka-spotlight-radius, 18px);
                    background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.16) 45%, transparent 72%);
                    transform: translateX(-120%);
                    pointer-events: none;
                    animation: chakaSpotlightSweep 1.45s ease-out 1;
                }
                .chaka-spotlight-dim {
                    position: fixed;
                    inset: 0;
                    z-index: 2;
                    pointer-events: none;
                    background: radial-gradient(circle at 50% 45%, transparent 0, rgba(0,0,0,0.02) 260px, rgba(0,0,0,0.34) 100%);
                    opacity: 0;
                    transition: opacity 320ms ease;
                }
                .chaka-spotlight-dim.active { opacity: 1; }
                @keyframes chakaSpotlightBreathe {
                    0%, 100% { opacity: 0.72; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.012); }
                }
                @keyframes chakaSpotlightSweep {
                    0% { transform: translateX(-120%); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: translateX(120%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        spotlightElement(targetEl, duration = 6200) {
            if (!targetEl) return;
            this.ensureSpotlightStyles();
            const existingDim = document.getElementById('chaka-spotlight-dim');
            if (existingDim) existingDim.remove();
            const dim = document.createElement('div');
            dim.id = 'chaka-spotlight-dim';
            dim.className = 'chaka-spotlight-dim';
            document.body.appendChild(dim);

            document.querySelectorAll('.chaka-spotlight-target').forEach(el => {
                el.classList.remove('chaka-spotlight-target');
            });

            const computedRadius = getComputedStyle(targetEl).borderRadius || '18px';
            targetEl.style.setProperty('--chaka-spotlight-radius', computedRadius);
            targetEl.classList.add('chaka-spotlight-target');
            requestAnimationFrame(() => dim.classList.add('active'));

            clearTimeout(targetEl._chakaSpotlightTimer);
            targetEl._chakaSpotlightTimer = setTimeout(() => {
                targetEl.classList.remove('chaka-spotlight-target');
                dim.classList.remove('active');
                setTimeout(() => dim.remove(), 340);
            }, duration);
        }

        async showGuidedTourStop(section, isTourStep = true) {
            const tourPages = {
                'hero': '/',
                'about': '/about',
                'stats': '/about',
                'services': '/services',
                'works': '/works',
                'testimonials': '/testimonials',
                'contact': '/contact-us'
            };
            const targetPage = isTourStep ? tourPages[section] : null;
            let navigatedForTour = false;

            if (targetPage && window.location.pathname !== targetPage) {
                try {
                    await this.softNavigate(targetPage);
                    navigatedForTour = true;
                    await new Promise(resolve => setTimeout(resolve, 120));
                } catch(e) {
                    console.error('[Chaka] Guided tour page navigation failed:', e);
                }
            }

            const highlightMap = {
                'hero': '.section-global.home, .hero-section, .section-hero, .section-global',
                'about': '.about-hero-wrapper, .section-about, .about-section',
                'stats': '.section-counter, .counter-wrapper',
                'services': '.section-global.service, .section-seivecs, .section-services, .services-wrapper',
                'works': '.section-works, .work-section, .works-wrapper, .section-global',
                'testimonials': '.section-testslider, .testimonial-section, .testimonials-wrapper',
                'contact': '.contact-wrapper, .section-contact, .contact-section',
                'faq': '.section-faq',
                'footer': '.section-footer, footer',
                'brands': '.section-brands',
                'cta': '.section-cta'
            };
            const selectors = highlightMap[section] || `[data-section="${section}"]`;
            let el = null;
            for (const sel of selectors.split(',')) {
                el = document.querySelector(sel.trim());
                if (el) break;
            }
            if (!el) return { executed: false, error: `Section "${section}" not found on page.` };

            const targetEl = el.querySelector('.counter-wrapper, .w-container, .main-container, .container, .about-wrapper, .works-wrapper, .services-wrapper, .testimonials-wrapper') || el;
            const navH = document.querySelector('.section-navbar, nav, .w-nav')?.offsetHeight || 80;
            const targetY = targetEl.getBoundingClientRect().top + window.pageYOffset - navH - 20;
            window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
            this.spotlightElement(targetEl, isTourStep ? 6200 : 4400);

            if (!isTourStep) {
                return { executed: true, highlighted: section };
            }

            this.isGuidedTourActive = true;
            this.currentTourSection = section;
            // Route comes from /api/chaka/site-state, which derives it from live CMS
            // content. The hardcoded list this replaced still included 'testimonials'
            // after that section was removed, so the tour walked visitors into nothing.
            const tourOrder = this.tourStops.length ? this.tourStops
                : ['hero', 'about', 'services', 'works', 'contact'];
            const idx = tourOrder.indexOf(section);
            this.nextTourSection = (idx !== -1 && idx + 1 < tourOrder.length) ? tourOrder[idx + 1] : null;
            this._ignoreScrollUntil = Date.now() + 1200;
            return {
                executed: true,
                currentSection: section,
                currentPage: window.location.pathname,
                navigated: navigatedForTour,
                nextSection: this.nextTourSection,
                instruction: `You are now showing the real "${section}" ${section === 'hero' || section === 'stats' ? 'section' : 'page'} at ${window.location.pathname}. Explain only what is currently visible in 1-2 warm, natural sentences. ${section === 'stats' ? this.statsNarration() : ''} Do not claim you are on any other page. Do not ask to move on, do not ask if they are ready, and do not narrate future stops. You may end with a short statement of where you are taking them next, but the system will move automatically.`
            };
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
                    // ━━━ PRECISION SCROLL — handles top, bottom, and section names ━━━
                    const concept = (args.section_concept || '').toLowerCase().trim();
                    const navbarHeight = document.querySelector('.section-navbar, nav, .w-nav')?.offsetHeight || 80;

                    if (concept === 'top') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        result = { executed: true, scrolledTo: 'top' };
                    } else if (concept === 'bottom') {
                        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                        result = { executed: true, scrolledTo: 'bottom' };
                    } else {
                        const sectionMap = {
                            'hero': '.section-global.home, .hero-section, .section-hero, [data-section="hero"]',
                            'about': '.section-about, .about-section, [data-section="about"]',
                            'stats': '.section-counter, .counter-wrapper, [data-section="stats"]',
                            'services': '.section-seivecs, .section-services, .services-section, [data-section="services"]',
                            'works': '.section-works, .work-section, [data-section="works"]',
                            'projects': '.section-works, .work-section, [data-section="works"]',
                            'testimonials': '.section-testslider, .testimonial-section, [data-section="testimonials"]',
                            'contact': '.section-contact, .contact-section, [data-section="contact"]',
                            'footer': '.section-footer, footer, .footer',
                            'brands': '.section-brands, .brands-section, .brands-logo-marquee',
                            'skills': '.section-marquee, .skills-section, [data-section="skills"]',
                            'faq': '.section-faq, .faq-section, [data-section="faq"]',
                            'cta': '.section-cta, [data-section="cta"]'
                        };
                        const selectors = sectionMap[concept] || `[data-section="${concept}"]`;
                        let el = null;
                        for (const sel of selectors.split(',')) {
                            el = document.querySelector(sel.trim());
                            if (el) break;
                        }
                        if (el) {
                            const targetY = el.getBoundingClientRect().top + window.pageYOffset - navbarHeight - 10;
                            window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
                            result = { executed: true, scrolledTo: concept };
                        } else {
                            result = { executed: false, error: `Section "${concept}" not found on current page` };
                        }
                    }
                } else if (name === 'endSession') {
                    // ━━━ SMART SESSION ENDING — AI-triggered graceful disconnect ━━━
                    console.log('[Chaka] AI triggered endSession — closing stream gracefully.');
                    this._pendingGoodbyeDisconnect = true;
                    result = { executed: true, action: 'session_ending' };
                } else if (name === 'endTour') {
                    const wasActive = this.abortTour(args.reason || 'visitor asked to stop');
                    result = {
                        executed: true,
                        tourWasActive: wasActive,
                        instruction: 'The guided tour is cancelled and will not resume. Acknowledge in one short sentence, then do exactly what the visitor asked for. Do not offer to restart the tour unless they ask.'
                    };
                } else if (name === 'highlightElement' || name === 'guidedTour') {
                    // ━━━ SPOTLIGHT HIGHLIGHT & SYNCHRONIZED TOUR STEP ━━━
                    const section = (args.section || (name === 'guidedTour' ? 'hero' : '')).toLowerCase().trim();
                    const isTourStep = name === 'guidedTour';
                    // A stop that is not on the live site cannot be shown. Rather than
                    // scrolling to nothing, tell the model why and let it move on.
                    if (isTourStep && this.tourStops.length && !this.tourStops.includes(section)) {
                        this.abortTour(`requested stop "${section}" is not on the live site`);
                        result = {
                            executed: false,
                            reason: `"${section}" is not a section of this site any more.`,
                            availableStops: this.tourStops,
                            instruction: `That section does not exist on the live site, so do not mention it. Do not apologise at length. Move on to something that does exist: ${this.tourStops.join(', ')}.`
                        };
                    } else {
                        result = await this.showGuidedTourStop(section, isTourStep);
                    }
                } else if (name === 'toggleTheme') {
                    // ━━━ THEME TOGGLE — dark/light mode ━━━
                    const theme = (args.theme || 'light').toLowerCase();
                    if (theme === 'light') {
                        document.documentElement.style.setProperty('--chaka-theme', 'light');
                        document.body.style.background = '#f5f5f5';
                        document.body.style.color = '#1a1a1a';
                        document.querySelectorAll('.section-global, section, .page-wrapper').forEach(el => {
                            if (!el.style.background || el.style.background.includes('rgb(0') || el.style.background.includes('#0') || el.style.background.includes('#1')) {
                                el.style.background = '#ffffff';
                                el.style.color = '#1a1a1a';
                            }
                        });
                        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, li').forEach(el => {
                            const color = getComputedStyle(el).color;
                            if (color.includes('255, 255, 255') || color.includes('rgb(255') || color.includes('rgba(255')) {
                                el.style.color = '#1a1a1a';
                            }
                        });
                        sessionStorage.setItem('chakaTheme', 'light');
                        result = { executed: true, theme: 'light' };
                    } else {
                        // Restore dark mode (default) — reload to reset all inline styles
                        sessionStorage.setItem('chakaTheme', 'dark');
                        document.body.style.background = '';
                        document.body.style.color = '';
                        document.querySelectorAll('[style]').forEach(el => {
                            if (el.id && el.id.startsWith('chaka-')) return; // Don't touch Chaka UI
                            el.style.background = '';
                            el.style.color = '';
                        });
                        result = { executed: true, theme: 'dark' };
                    }
                } else if (name === 'startLiveStream') {
                    // ━━━ CHAT-TO-VOICE SWITCH — triggered from chat mode ━━━
                    console.log('[Chaka] AI triggered startLiveStream from chat.');
                    this.toggleChatWindow(false); // Hide chat panel
                    if (!this.isConnected) {
                        await this.toggleSession(); // Start voice stream
                    }
                    result = { executed: true, action: 'live_stream_started' };
                } else if (name === 'showContactMethod') {
                    const method = (args.method || '').toLowerCase();
                    const s = window.siteSettings || {};
                    
                    const contactMap = {
                        'whatsapp': { url: s.social_whatsapp, label: 'Chat on WhatsApp', subtitle: 'Start a direct conversation', iconSvg: '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20.2 4.4 16A8.4 8.4 0 1 1 8 19.4L3 20.2Z"></path><path d="M8.8 8.7c.3 2.6 2.1 4.5 4.5 5.3l1.4-1.1 2.1.5c.2 1.2-.4 2.3-1.5 2.7-3.9-.3-7.1-3.2-8-7.1.3-1.1 1.3-1.8 2.4-1.6l.6 1.3-1.5 0Z"></path></svg>', color: '#25D366' },
                        'phone': { url: s.contact_phone ? `tel:${String(s.contact_phone).replace(/[^\d+]/g, '')}` : null, label: `Call ${s.contact_phone || 'us'}`, subtitle: 'Talk directly', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"></path></svg>', color: '#4A90D9' },
                        'call': { url: s.contact_phone ? `tel:${String(s.contact_phone).replace(/[^\d+]/g, '')}` : null, label: `Call ${s.contact_phone || 'us'}`, subtitle: 'Talk directly', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z"></path></svg>', color: '#4A90D9' },
                        'email': { url: s.contact_email ? `mailto:${String(s.contact_email).trim().replace(/["'<>`]/g, '')}` : null, label: `Email ${s.contact_email || 'us'}`, subtitle: 'Send project details', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>', color: '#EA4335' },
                        'instagram': { url: s.social_instagram, label: 'Instagram', subtitle: 'See visual work', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="3.4"></circle><path d="M17.5 6.5h.01"></path></svg>', color: '#E1306C' },
                        'linkedin': { url: s.social_linkedin, label: 'LinkedIn', subtitle: 'Professional profile', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z"></path><path d="M2 9h4v12H2z"></path><circle cx="4" cy="4" r="2"></circle></svg>', color: '#0077B5' },
                        'github': { url: s.social_github, label: 'GitHub', subtitle: 'View engineering work', iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.2 1.4-4.2-2-6-2.5"></path><path d="M15 22v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.2a11.8 11.8 0 0 0-6.2 0C6.6 3.8 5.6 4.1 5.6 4.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 10.5c0 4.7 2.7 5.7 5.5 6-.6.5-.6 1.2-.5 2V22"></path></svg>', color: '#6e5494' }
                    };
                    
                    const contact = contactMap[method];
                    
                    if (contact && this.sanitizeActionUrl(contact.url)) {
                        // Issue #2: If chat widget is hidden/minimized, bring it back so user can see the card
                        const chatModal = document.getElementById('chaka-chat-modal');
                        if (chatModal && chatModal.style.opacity !== '1') {
                            this.toggleChatWindow(true);
                        }

                        const cardHtml = this.renderContactCard(contact);
                        this.appendChatMessage('assistant', cardHtml, true);
                        
                        // Only auto-open if AI explicitly passed auto_open=true (user asked to be taken there)
                        const shouldOpen = args.auto_open === true || args.auto_open === "true";
                        if (shouldOpen) {
                            setTimeout(() => {
                                const url = this.sanitizeActionUrl(contact.url);
                                if (!url) return;
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
                        
                        result = { executed: true, method, url: this.sanitizeActionUrl(contact.url), displayed: true, autoOpened: shouldOpen };
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

            const nextPageId = doc.documentElement.getAttribute('data-wf-page');
            const nextSiteId = doc.documentElement.getAttribute('data-wf-site');
            if (nextPageId) document.documentElement.setAttribute('data-wf-page', nextPageId);
            if (nextSiteId) document.documentElement.setAttribute('data-wf-site', nextSiteId);
            if (doc.documentElement.lang) document.documentElement.lang = doc.documentElement.lang;

            document.querySelectorAll('style[data-chaka-soft-nav-style="true"]').forEach(style => style.remove());
            doc.head.querySelectorAll('style').forEach(style => {
                const text = style.textContent || '';
                if (!text.includes('data-w-id') && !text.includes('html.w-mod-js')) return;
                const clone = style.cloneNode(true);
                clone.setAttribute('data-chaka-soft-nav-style', 'true');
                document.head.appendChild(clone);
            });
            
            // Preserve the Chaka UI elements before swapping
            const chakaOrb = document.getElementById('chaka-orb');
            const chakaPanel = document.getElementById('chaka-chat-modal');
            const chakaPopup = document.getElementById('chaka-welcome-popup');
            const chakaContainer = document.getElementById('chaka-orb-container');
            const chakaOrbParent = chakaOrb ? chakaOrb.parentNode : null;
            const chakaPanelParent = chakaPanel ? chakaPanel.parentNode : null;
            const chakaPopupParent = chakaPopup ? chakaPopup.parentNode : null;
            const chakaContainerParent = chakaContainer ? chakaContainer.parentNode : null;
            
            // Swap the page content
            currentWrapper.className = newWrapper.className;
            currentWrapper.innerHTML = newWrapper.innerHTML;
            
            // Re-attach Chaka UI if they were inside the wrapper
            if (chakaOrb && !document.getElementById('chaka-orb')) {
                (chakaOrbParent || document.body).appendChild(chakaOrb);
            }
            if (chakaPanel && !document.getElementById('chaka-chat-modal')) {
                (chakaPanelParent || document.body).appendChild(chakaPanel);
            }
            if (chakaPopup && !document.getElementById('chaka-welcome-popup')) {
                (chakaPopupParent || document.body).appendChild(chakaPopup);
            }
            if (chakaContainer && !document.getElementById('chaka-orb-container')) {
                (chakaContainerParent || document.body).appendChild(chakaContainer);
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
                try {
                    const ix2 = window.Webflow.require('ix2');
                    if (ix2 && typeof ix2.init === 'function') ix2.init();
                } catch(e) {}
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
