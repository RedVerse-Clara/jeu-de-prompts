/**
 * PWA Installation Banner & Service Worker Registration
 * Shows install banner for iOS and Android.
 * Dismissable for 7 days via localStorage.
 */
(function() {
    'use strict';

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=3').catch(function() {});
    }

    // Check dismiss cooldown (7 days)
    var dismissKey = 'jdp_pwa_dismiss_v2';
    var dismissedAt = localStorage.getItem(dismissKey);
    if (dismissedAt && (Date.now() - parseInt(dismissedAt)) < 7 * 24 * 60 * 60 * 1000) {
        return;
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;

    var deferredPrompt = null;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Capture beforeinstallprompt for Android/Chrome
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        showBanner(false);
    });

    // For iOS, show after 2 seconds
    if (isIOS) {
        setTimeout(function() { showBanner(true); }, 2000);
    }

    var isMobile = window.innerWidth < 768;

    function showBanner(isIOSDevice) {
        var banner = document.createElement('div');
        banner.id = 'pwa-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;display:flex;align-items:center;gap:10px;font-family:Outfit,sans-serif;font-size:0.85rem;box-shadow:0 2px 12px rgba(0,0,0,0.15)';

        var icon = document.createElement('span');
        icon.textContent = '\uD83D\uDCF2';
        icon.style.fontSize = '1.3rem';
        banner.appendChild(icon);

        var text = document.createElement('span');
        text.style.cssText = 'flex:1;line-height:1.3';

        if (isIOSDevice) {
            text.innerHTML = 'Installez <b>Jeu de Prompts</b> : appuyez sur <b>Partager</b> <span style="font-size:1.1em">\u2399</span> puis <b>\u00ab\u00a0Sur l\'&eacute;cran d\'accueil\u00a0\u00bb</b>';
        } else {
            text.innerHTML = isMobile
                ? 'Installez <b>Jeu de Prompts</b> sur votre t\u00e9l\u00e9phone pour un acc\u00e8s rapide\u00a0!'
                : 'Installez <b>Jeu de Prompts</b> sur votre ordinateur pour un acc\u00e8s rapide\u00a0!';
        }
        banner.appendChild(text);

        if (!isIOSDevice && deferredPrompt) {
            var installBtn = document.createElement('button');
            installBtn.textContent = 'Installer';
            installBtn.style.cssText = 'background:#fff;color:#4f46e5;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap';
            installBtn.addEventListener('click', function() {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function(result) {
                    if (result.outcome === 'accepted') closeBanner();
                    deferredPrompt = null;
                });
            });
            banner.appendChild(installBtn);
        }

        var closeBtn = document.createElement('button');
        closeBtn.textContent = '\u2715';
        closeBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.7);font-size:1.1rem;cursor:pointer;padding:4px;line-height:1';
        closeBtn.addEventListener('click', closeBanner);
        banner.appendChild(closeBtn);

        document.body.prepend(banner);

        function closeBanner() {
            localStorage.setItem(dismissKey, Date.now().toString());
            banner.remove();
        }
    }
})();
