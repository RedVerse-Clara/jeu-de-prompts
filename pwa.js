/**
 * PWA Installation Banner & Service Worker Registration
 * Shows install banner for iOS and Android.
 * Dismissable for 7 days via localStorage.
 */
(function() {
    'use strict';

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function() {});
    }

    // Check dismiss cooldown (7 days)
    var dismissKey = 'jdp_pwa_dismiss';
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

    function showBanner(isIOSDevice) {
        var banner = document.createElement('div');
        banner.id = 'pwa-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:Outfit,sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15)';

        if (isIOSDevice) {
            banner.innerHTML = '<span>Installez Jeu de Prompts : appuyez sur <strong>Partager</strong> puis <strong>Sur l\'&eacute;cran d\'accueil</strong></span>';
        } else {
            banner.innerHTML = '<span>Installez Jeu de Prompts sur votre appareil</span>';
            var installBtn = document.createElement('button');
            installBtn.textContent = 'Installer';
            installBtn.style.cssText = 'background:white;color:#4f46e5;border:none;padding:6px 16px;border-radius:8px;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer';
            installBtn.addEventListener('click', function() {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function() { deferredPrompt = null; });
                }
                closeBanner();
            });
            banner.appendChild(installBtn);
        }

        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:0 4px;opacity:0.7';
        closeBtn.addEventListener('click', closeBanner);
        banner.appendChild(closeBtn);

        document.body.prepend(banner);

        function closeBanner() {
            localStorage.setItem(dismissKey, Date.now().toString());
            banner.remove();
        }
    }
})();
