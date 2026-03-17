/**
 * Table of Contents (TOC) with Scroll Spy
 * Generates a TOC from h2/h3 headings in .lesson-content
 * and highlights the active section during scroll.
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        const content = document.querySelector('.lesson-content');
        const tocContainer = document.getElementById('toc-nav');
        if (!content || !tocContainer) return;

        const headings = content.querySelectorAll('h2, h3');
        if (headings.length < 2) {
            tocContainer.closest('#toc-sidebar')?.classList.add('hidden');
            return;
        }

        // Generate IDs and TOC links
        const tocItems = [];
        headings.forEach(function (heading, index) {
            const id = 'section-' + index;
            heading.id = id;

            const link = document.createElement('a');
            link.href = '#' + id;
            link.textContent = heading.textContent.trim();
            link.className = heading.tagName === 'H3'
                ? 'toc-link toc-h3 block py-1 pl-4 text-[11px] text-slate-400 hover:text-indigo-600 transition-colors border-l-2 border-transparent hover:border-indigo-300'
                : 'toc-link toc-h2 block py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors border-l-2 border-transparent hover:border-indigo-400';

            link.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.getElementById(id);
                if (target) {
                    const offset = 80;
                    const top = target.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo({ top: top, behavior: 'smooth' });
                    history.replaceState(null, '', '#' + id);
                }
            });

            tocContainer.appendChild(link);
            tocItems.push({ id: id, element: heading, link: link });
        });

        // Scroll spy
        let ticking = false;
        function updateActiveSection() {
            const scrollPos = window.scrollY + 120;
            let activeIndex = 0;

            for (let i = tocItems.length - 1; i >= 0; i--) {
                if (tocItems[i].element.getBoundingClientRect().top + window.scrollY <= scrollPos) {
                    activeIndex = i;
                    break;
                }
            }

            tocItems.forEach(function (item, i) {
                if (i === activeIndex) {
                    item.link.classList.add('text-indigo-600', 'border-indigo-500', 'font-bold');
                    item.link.classList.remove('text-slate-400', 'text-slate-500', 'border-transparent');
                } else {
                    item.link.classList.remove('text-indigo-600', 'border-indigo-500');
                    item.link.classList.add('border-transparent');
                    if (item.link.classList.contains('toc-h3')) {
                        item.link.classList.add('text-slate-400');
                    } else {
                        item.link.classList.add('text-slate-500');
                    }
                }
            });

            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                requestAnimationFrame(updateActiveSection);
                ticking = true;
            }
        });

        // Update hash URL on scroll
        let hashTicking = false;
        window.addEventListener('scroll', function () {
            if (!hashTicking) {
                hashTicking = true;
                setTimeout(function () {
                    const scrollPos = window.scrollY + 120;
                    for (let i = tocItems.length - 1; i >= 0; i--) {
                        if (tocItems[i].element.getBoundingClientRect().top + window.scrollY <= scrollPos) {
                            if (window.location.hash !== '#' + tocItems[i].id) {
                                history.replaceState(null, '', '#' + tocItems[i].id);
                            }
                            break;
                        }
                    }
                    hashTicking = false;
                }, 200);
            }
        });

        // Initial state
        updateActiveSection();

        // Scroll to hash on load
        if (window.location.hash) {
            const target = document.querySelector(window.location.hash);
            if (target) {
                setTimeout(function () {
                    const top = target.getBoundingClientRect().top + window.scrollY - 80;
                    window.scrollTo({ top: top, behavior: 'smooth' });
                }, 300);
            }
        }
    });
})();
