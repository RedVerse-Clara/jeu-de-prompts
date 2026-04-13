
// app.js - Core Logic for Jeu de Prompts
const SUPABASE_URL = 'https://nywwmhmymusbnapblwoj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55d3dtaG15bXVzYm5hcGJsd29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDI2NzQsImV4cCI6MjA4NjkxODY3NH0.ad0KsZpGJUW_CF7k2dxxohX19CJ_ZnZMAOLaLchTCto';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- PASSWORD RECOVERY LISTENER ---
supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
        // User arrived via password reset link — show change password modal
        setTimeout(() => openSettings(), 500);
    }
});

// --- UTILITIES ---
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#039;')
        .replace(/"/g, '&quot;')
        .replace(/\\/g, '\\\\');
}

let debounceTimer = null;
function debounce(fn, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn(...args), delay);
    };
}

// State Management
let state = {
    user: null,
    isAdmin: false,
    categories: [],
    resources: [],
    news: [],
    links: [],
    currentCategory: null,
    activeResource: null,
    searchQuery: ''
};

function clearSearch() {
    state.searchQuery = '';
    if (resourceSearch) resourceSearch.value = '';
    const aiBox = document.getElementById('ai-search-box');
    if (aiBox) { aiBox.classList.add('hidden'); aiBox.innerHTML = ''; }
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
}

function clearSearchAndResults() {
    clearSearch();
    renderResourceList();
    resourceSearch.focus();
}

// --- DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container');
const siteContainer = document.getElementById('site-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const categoryNav = document.getElementById('category-nav');
const resourceList = document.getElementById('resource-list');
const resourceDisplay = document.getElementById('resource-display');
const emptyState = document.getElementById('empty-state');
const loadingSpinner = document.getElementById('loading-spinner');
const newsList = document.getElementById('news-list');
const linksList = document.getElementById('links-list');
const logoutBtn = document.getElementById('logout-btn');
const resourceSearch = document.getElementById('resource-search');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const adminConsole = document.getElementById('admin-console');
const closeAdminBtn = document.getElementById('close-admin-btn');
const adminViewContainer = document.getElementById('admin-view-container');

const adminAddBtn = document.getElementById('admin-add-resource-btn');
const editorModal = document.getElementById('editor-modal');
const resourceForm = document.getElementById('resource-form');

// --- QUILL EDITOR ---
let quillEditor = null;

// Register custom HR blot
const BlockEmbed = Quill.import('blots/block/embed');
class DividerBlot extends BlockEmbed {
    static blotName = 'divider';
    static tagName = 'hr';
}
Quill.register(DividerBlot);

function getQuill() {
    if (!quillEditor) {
        quillEditor = new Quill('#edit-content', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: '#editor-toolbar',
                    handlers: {
                        divider() {
                            const range = this.quill.getSelection(true);
                            this.quill.insertText(range.index, '\n', Quill.sources.USER);
                            this.quill.insertEmbed(range.index + 1, 'divider', true, Quill.sources.USER);
                            this.quill.setSelection(range.index + 2, Quill.sources.SILENT);
                        }
                    }
                }
            },
            placeholder: 'Rédigez votre contenu ici...'
        });
    }
    return quillEditor;
}

// --- LOADING SPINNER ---
function showLoading() {
    loadingSpinner.classList.remove('hidden');
    resourceDisplay.classList.add('hidden');
    emptyState.classList.add('hidden');
}

function hideLoading() {
    loadingSpinner.classList.add('hidden');
}

// --- AUTHENTICATION ---
async function checkUser() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Check remember-me: if not remembered and no active session flag, sign out
            const rememberMe = localStorage.getItem('remember_me');
            const sessionActive = sessionStorage.getItem('session_active');
            if (rememberMe !== 'true' && sessionActive !== 'true') {
                await supabase.auth.signOut();
                showAuth();
                return;
            }
            // Check remember-me expiry (30 days)
            const rememberExpiry = localStorage.getItem('remember_me_expiry');
            if (rememberMe === 'true' && rememberExpiry && Date.now() > Number(rememberExpiry)) {
                localStorage.removeItem('remember_me');
                localStorage.removeItem('remember_me_expiry');
                await supabase.auth.signOut();
                showAuth();
                return;
            }
            state.user = user;
            await checkAdmin();
            showSite();
            initData();
        } else {
            showAuth();
        }
    } catch (err) {
        console.error('Erreur vérification utilisateur:', err);
        showAuth();
    }
}

async function checkAdmin() {
    try {
        const { data, error } = await supabase.from('profiles').select('is_admin, subscription_status').eq('id', state.user.id).single();
        if (!error && data) {
            // Double check: is_admin must be true AND user must be Marc
            state.isAdmin = (data.is_admin === true) && (state.user.id === 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882');
            state.subscriptionStatus = data.subscription_status || 'inactive';
        }
    } catch (err) {
        console.error('Erreur vérification admin:', err);
    }
}

function showAuth() {
    authContainer.classList.remove('hidden');
    siteContainer.classList.add('hidden');
}

function showSite() {
    // Admin always has access; others need active subscription_status
    if (!state.isAdmin && state.subscriptionStatus !== 'active') {
        showPendingMessage();
        return;
    }

    authContainer.classList.add('hidden');
    document.getElementById('pending-container')?.remove();
    siteContainer.classList.remove('hidden');
    const footer = document.getElementById('site-footer');
    if (footer) footer.classList.remove('hidden');

    const email = state.user.email || '';
    document.getElementById('user-display-name').textContent = email.split('@')[0] || 'Utilisateur';
    document.getElementById('user-display-id').textContent = `#ID: ${(state.user.id || '').substring(0, 8)}`;

    if (state.isAdmin) {
        adminAddBtn.classList.remove('hidden');
        adminPanelBtn.classList.remove('hidden');
        checkPendingUsers();
    } else {
        adminAddBtn.classList.add('hidden');
        adminPanelBtn.classList.add('hidden');
    }
    checkUnreadMessages();
}

async function checkUnreadMessages() {
    try {
        const envelope = document.getElementById('msg-envelope');
        const badge = document.getElementById('msg-badge');
        if (!envelope || !badge) return;

        const { count } = await supabase
            .from('private_messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', state.user.id)
            .eq('is_read', false);

        if (count > 0) {
            envelope.classList.remove('hidden');
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            envelope.classList.add('hidden');
            badge.classList.add('hidden');
        }
    } catch(e) {}
}

async function checkPendingUsers() {
    try {
        const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_status', 'inactive')
            .eq('is_admin', false);

        if (count > 0) {
            adminPanelBtn.innerHTML = 'Admin <span class="inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full ml-1 notif-pulse">' + count + '</span>';
        } else {
            adminPanelBtn.textContent = 'Admin';
        }
    } catch(e) {}
}

function showPendingMessage() {
    authContainer.classList.add('hidden');
    siteContainer.classList.add('hidden');
    document.getElementById('pending-container')?.remove();

    const pending = document.createElement('div');
    pending.id = 'pending-container';
    pending.className = 'flex-grow flex items-center justify-center p-6';
    pending.innerHTML = `
        <div class="max-w-lg w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 text-center">
            <img src="Logo Jeu de Prompts.png" alt="Logo" class="h-16 mx-auto mb-4">
            <div class="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">&#10024;</div>
            <h2 class="text-2xl font-black text-slate-900 mb-2">Bienvenue !</h2>
            <p class="text-sm text-slate-500 font-medium mb-6 leading-relaxed">
                Votre compte a bien &eacute;t&eacute; cr&eacute;&eacute;.<br>
                Pour acc&eacute;der &agrave; la plateforme, choisissez votre formule ci-dessous.<br>
                Votre acc&egrave;s sera activ&eacute; dans les 24h apr&egrave;s paiement.
            </p>
            <div class="bg-slate-50 rounded-2xl p-5 mb-6 text-left">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Choisir ma formule</p>
                <div class="flex flex-col sm:flex-row gap-3">
                    <a href="https://buy.stripe.com/5kQ3cu9iV0AlgeCezB1ZS0K" target="_blank"
                        class="flex-1 bg-indigo-600 text-white text-center font-black py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98] no-underline text-sm">
                        9,90&euro; / mois
                    </a>
                    <a href="https://buy.stripe.com/bJe3cu0MpbeZ3rQ6351ZS0L" target="_blank"
                        class="flex-1 bg-white text-indigo-600 text-center font-black py-3 rounded-xl border-2 border-indigo-200 hover:border-indigo-400 transition-all no-underline text-sm">
                        99&euro; / an
                    </a>
                </div>
            </div>
            <a href="https://billing.stripe.com/p/login/dRm6oG66Jerb1jI7791ZS00" target="_blank" class="text-xs text-indigo-400 hover:text-indigo-600 font-bold transition-colors underline no-underline">G&eacute;rer mon abonnement</a>
            <span class="mx-2 text-slate-300">|</span>
            <button onclick="window.app.logoutFromPending()" class="text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors">Se d&eacute;connecter</button>
        </div>
    `;
    document.body.insertBefore(pending, document.getElementById('site-container'));
}

async function logoutFromPending() {
    await supabase.auth.signOut();
    localStorage.removeItem('remember_me');
    localStorage.removeItem('remember_me_expiry');
    sessionStorage.removeItem('session_active');
    document.getElementById('pending-container')?.remove();
    state.user = null;
    state.isAdmin = false;
    adminPanelBtn.classList.add('hidden');
    adminAddBtn.classList.add('hidden');
    adminConsole.classList.add('hidden');
    authContainer.classList.remove('hidden');
    switchAuthTab('login');
}

// --- AUTH TABS & HELPERS ---
function switchAuthTab(tab) {
    const loginF = document.getElementById('login-form');
    const registerF = document.getElementById('register-form');
    const resetF = document.getElementById('reset-password-form');
    const tabL = document.getElementById('tab-login');
    const tabR = document.getElementById('tab-register');
    loginError.classList.add('hidden');
    resetF.classList.add('hidden');
    if (tab === 'register') {
        loginF.classList.add('hidden');
        registerF.classList.remove('hidden');
        tabR.classList.add('bg-white', 'shadow', 'text-indigo-700');
        tabR.classList.remove('text-slate-500');
        tabL.classList.remove('bg-white', 'shadow', 'text-indigo-700');
        tabL.classList.add('text-slate-500');
    } else {
        registerF.classList.add('hidden');
        loginF.classList.remove('hidden');
        tabL.classList.add('bg-white', 'shadow', 'text-indigo-700');
        tabL.classList.remove('text-slate-500');
        tabR.classList.remove('bg-white', 'shadow', 'text-indigo-700');
        tabR.classList.add('text-slate-500');
    }
}

function togglePwd(inputId, btn) {
    const inp = document.getElementById(inputId);
    const eo = btn.querySelector('.eye-open');
    const ec = btn.querySelector('.eye-closed');
    if (inp.type === 'password') {
        inp.type = 'text'; eo.classList.add('hidden'); ec.classList.remove('hidden');
    } else {
        inp.type = 'password'; eo.classList.remove('hidden'); ec.classList.add('hidden');
    }
}

function validatePwd(val) {
    const rules = document.getElementById('pw-rules');
    const dots = rules.querySelectorAll('.pw-dot');
    if (val.length > 0) rules.classList.remove('hidden');
    else { rules.classList.add('hidden'); return; }
    const checks = [val.length >= 8, /[A-Z]/.test(val), /[a-z]/.test(val), /[0-9]/.test(val)];
    dots.forEach((dot, i) => {
        if (checks[i]) { dot.classList.remove('bg-slate-200'); dot.classList.add('bg-indigo-500'); }
        else { dot.classList.add('bg-slate-200'); dot.classList.remove('bg-indigo-500'); }
    });
}

// --- RESET PASSWORD ---
function showResetPassword() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('reset-password-form').classList.remove('hidden');
    loginError.classList.add('hidden');
    // Hide tabs
    document.getElementById('tab-login').classList.remove('bg-white', 'shadow', 'text-indigo-700');
    document.getElementById('tab-login').classList.add('text-slate-500');
    document.getElementById('tab-register').classList.remove('bg-white', 'shadow', 'text-indigo-700');
    document.getElementById('tab-register').classList.add('text-slate-500');
}

const resetForm = document.getElementById('reset-password-form');
resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    loginError.classList.add('hidden');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://jeudeprompts.fr/'
    });

    if (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    } else {
        loginError.classList.add('hidden');
        document.getElementById('successMsg').textContent = 'Un lien de réinitialisation a été envoyé à votre adresse e-mail.';
        document.getElementById('successPopup').classList.remove('hidden');
        switchAuthTab('login');
    }
});

// --- LOGIN ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    } else {
        loginError.classList.add('hidden');
        // Remember-me session persistence
        const rememberMe = document.getElementById('remember-me').checked;
        if (rememberMe) {
            localStorage.setItem('remember_me', 'true');
            localStorage.setItem('remember_me_expiry', String(Date.now() + 30 * 24 * 60 * 60 * 1000));
        } else {
            localStorage.removeItem('remember_me');
            localStorage.removeItem('remember_me_expiry');
        }
        sessionStorage.setItem('session_active', 'true');
        state.user = data.user;
        await checkAdmin();
        showSite();
        initData();
    }
});

// --- REGISTER ---
const registerForm = document.getElementById('register-form');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (password !== confirm) {
        loginError.textContent = 'Les mots de passe ne correspondent pas.';
        loginError.classList.remove('hidden');
        return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        loginError.textContent = 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.';
        loginError.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
    });

    if (error) {
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    } else {
        loginError.classList.add('hidden');
        // Auto-login: Supabase returns a session on signUp
        if (data.user) {
            sessionStorage.setItem('session_active', 'true');
            state.user = data.user;
            await checkAdmin();
            // Check if there was a payment intent — open Stripe in background
            const paymentIntent = sessionStorage.getItem('payment_intent');
            if (paymentIntent && STRIPE_LINKS[paymentIntent]) {
                sessionStorage.removeItem('payment_intent');
                window.open(STRIPE_LINKS[paymentIntent] + '?prefilled_email=' + encodeURIComponent(email), '_blank');
            }
            // Show site (will naturally show pending page for new users)
            showSite();
        }
    }
});

// --- LOGOUT ---
logoutBtn.addEventListener('click', async () => {
    if (!confirm('Se déconnecter ?')) return;
    await supabase.auth.signOut();
    localStorage.removeItem('remember_me');
    localStorage.removeItem('remember_me_expiry');
    sessionStorage.removeItem('session_active');
    state.user = null;
    state.isAdmin = false;
    siteContainer.classList.add('hidden');
    document.getElementById('site-footer')?.classList.add('hidden');
    adminPanelBtn.classList.add('hidden');
    adminAddBtn.classList.add('hidden');
    adminConsole.classList.add('hidden');
    authContainer.classList.remove('hidden');
    // Reset to login tab
    switchAuthTab('login');
});

adminPanelBtn.addEventListener('click', () => {
    adminConsole.classList.remove('hidden');
    fetchAdminStats();
    setAdminView('users');
});

closeAdminBtn.addEventListener('click', () => {
    adminConsole.classList.add('hidden');
});

// --- DATA FETCHING ---
async function initData() {
    try {
        await Promise.all([
            fetchCategories(),
            fetchNews(),
            fetchLinks()
        ]);
        renderNav();
        renderNews();
        renderLinks();

        if (state.categories.length > 0) {
            const hashId = parseFicheHash();
            if (hashId) {
                const ok = await loadResourceFromAnywhere(hashId, { skipHashUpdate: true });
                if (!ok) loadCategory(state.categories[0].slug);
            } else {
                loadCategory(state.categories[0].slug);
            }
        }
    } catch (err) {
        console.error('Erreur initialisation données:', err);
    }
}

window.addEventListener('popstate', async () => {
    const id = parseFicheHash();
    if (id) {
        await loadResourceFromAnywhere(id, { skipHashUpdate: true });
    } else if (state.categories.length > 0) {
        document.title = 'Jeu de Prompts';
        await loadCategory(state.currentCategory || state.categories[0].slug, { keepHash: true });
    }
});

async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('position');
    if (!error) state.categories = data || [];
}

async function fetchNews() {
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false }).limit(5);
    if (!error) state.news = data || [];
}

async function fetchLinks() {
    const { data, error } = await supabase.from('links').select('*').order('position');
    if (!error) state.links = data || [];
}


// --- RENDERING ---
async function renderNav() {
    // Check unread messages
    let unreadBadge = '';
    try {
        const { count } = await supabase.from('private_messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', state.user.id)
            .eq('is_read', false);
        if (count > 0) unreadBadge = '<span class="w-1.5 h-1.5 bg-red-500 rounded-full inline-block ml-1 notif-pulse"></span>';
    } catch(e) {}

    // Desktop nav — solid buttons, full width, adaptive text
    const catButtons = state.categories.map(cat => {
        const slug = escapeAttr(cat.slug);
        const name = escapeHtml(cat.name);
        const isActive = state.currentCategory === cat.slug;
        return `
        <button onclick="window.app.loadCategory('${slug}')"            class="nav-btn-desktop py-2 px-2.5 rounded-xl text-[clamp(8px,0.7vw,12px)] font-black uppercase tracking-wide whitespace-nowrap text-center transition-all
            ${isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-sm'}">
            ${name}
        </button>`;
    }).join('');

    categoryNav.innerHTML = catButtons + `
        <div class="w-px h-5 bg-slate-200 mx-1.5 self-center shrink-0"></div>
        <button onclick="window.app.openCommunity()"            class="nav-btn-desktop py-2 px-2.5 rounded-xl text-[clamp(8px,0.7vw,12px)] font-black uppercase tracking-wide whitespace-nowrap transition-all
            bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:shadow-sm border border-emerald-100">
            🗣️ Communauté
        </button>
        <div class="w-px h-5 bg-slate-200 mx-1.5 self-center shrink-0"></div>
        <button onclick="window.app.openFavorites()"            class="nav-btn-desktop py-2 px-2.5 rounded-xl text-[clamp(8px,0.7vw,12px)] font-black uppercase tracking-wide whitespace-nowrap transition-all
            bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-600 hover:shadow-sm">
            ⭐ Favoris
        </button>
        <button onclick="window.app.openAllNotes()"            class="nav-btn-desktop py-2 px-2.5 rounded-xl text-[clamp(8px,0.7vw,12px)] font-black uppercase tracking-wide whitespace-nowrap transition-all
            bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700 hover:shadow-sm">
            📝 Notes
        </button>
        <button onclick="window.app.openMessages()"            class="nav-btn-desktop py-2 px-2.5 rounded-xl text-[clamp(8px,0.7vw,12px)] font-black uppercase tracking-wide whitespace-nowrap transition-all
            bg-slate-100 text-slate-500 hover:bg-cyan-50 hover:text-cyan-600 hover:shadow-sm">
            💬 Marc ${unreadBadge}
        </button>`;

    // Mobile hamburger menu content
    const mobileMenuPanel = document.getElementById('mobile-menu-panel');
    if (mobileMenuPanel) {
        const mobileCats = state.categories.map(cat => {
            const slug = escapeAttr(cat.slug);
            const name = escapeHtml(cat.name);
            const isActive = state.currentCategory === cat.slug;
            return `
            <button onclick="window.app.loadCategory('${slug}'); window.app.closeMobileMenu();"
                class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-3
                ${isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100'}">
                <span class="w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-slate-300'} shrink-0"></span>
                ${name}
            </button>`;
        }).join('');

        mobileMenuPanel.innerHTML = `
            <div class="p-4 space-y-1">
                <p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 mb-2">Catégories</p>
                ${mobileCats}
            </div>
            <div class="border-t border-slate-100 p-4 space-y-1">
                <p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 mb-2">Espace</p>
                <button onclick="window.app.openCommunity(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-all flex items-center gap-3">
                    <span class="text-base">🗣️</span> Communauté
                </button>
                <button onclick="window.app.openFavorites(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-amber-50 transition-all flex items-center gap-3">
                    <span class="text-base">⭐</span> Favoris
                </button>
                <button onclick="window.app.openAllNotes(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-amber-50 transition-all flex items-center gap-3">
                    <span class="text-base">📝</span> Notes
                </button>
                <button onclick="window.app.openMessages(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-cyan-50 transition-all flex items-center gap-3">
                    <span class="text-base">💬</span> Marc ${unreadBadge}
                </button>
            </div>
            <div class="border-t border-slate-100 p-4 space-y-1">
                <p class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-4 mb-2">Infos</p>
                <button onclick="window.app.openAllNews(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-indigo-50 transition-all flex items-center gap-3">
                    <span class="text-base">📢</span> Actualités
                </button>
                <button onclick="window.app.openMobileLinks(); window.app.closeMobileMenu();"
                    class="w-full text-left px-4 py-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-rose-50 transition-all flex items-center gap-3">
                    <span class="text-base">🔗</span> Liens utiles
                </button>
            </div>`;
    }
}

function renderNews() {
    const now = Date.now();
    const items = state.news.map(n => {
        const date = new Date(n.created_at);
        const isRecent = (now - date.getTime()) < 7 * 86400 * 1000;
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `
        <div class="separator">
            <div class="flex items-center gap-2">
                <p class="text-[9px] font-black text-indigo-500 uppercase tracking-tighter">${escapeHtml(dateStr)}</p>
                ${isRecent ? '<span class="bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">NEW</span>' : ''}
            </div>
            <p class="text-xs font-black leading-tight text-slate-800 mt-1">${escapeHtml(n.title)}</p>
        </div>`;
    }).join('');

    newsList.innerHTML = items + `
        <button onclick="window.app.openAllNews()"
            class="w-full mt-1 text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors py-2 border-t border-slate-50">
            Voir tout +
        </button>`;
}

async function openAllNews() {
    // Fetch all news
    const { data } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    const allNews = data || [];

    const now = Date.now();
    let html = allNews.map(n => {
        const date = new Date(n.created_at);
        const isRecent = (now - date.getTime()) < 7 * 86400 * 1000;
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        return `
        <div class="separator pb-4 mb-4">
            <div class="flex items-center gap-2 mb-1">
                <p class="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">${escapeHtml(dateStr)}</p>
                ${isRecent ? '<span class="bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">NEW</span>' : ''}
            </div>
            <h4 class="font-black text-slate-800 text-base mb-2 leading-tight">${escapeHtml(n.title)}</h4>
            ${n.content ? `<div class="lesson-content text-sm font-medium leading-relaxed text-slate-600">${n.content}</div>` : ''}
        </div>`;
    }).join('');

    // Show in modal
    const modal = document.createElement('div');
    modal.id = 'allNewsModal';
    modal.className = 'fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-6 overflow-y-auto flex items-start justify-center';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="max-w-2xl w-full bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 modal-enter mt-10">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-2xl font-black text-slate-900">Toutes les actualités</h2>
                <button onclick="this.closest('#allNewsModal').remove()" class="text-slate-400 font-black text-xl hover:text-slate-900 transition-colors">✕</button>
            </div>
            <div class="max-h-[65vh] overflow-y-auto custom-scrollbar">${html}</div>
        </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    modal.querySelector('button').addEventListener('click', () => { document.body.style.overflow = ''; });
    modal.addEventListener('click', (e) => { if (e.target === modal) { document.body.style.overflow = ''; } });
}

function renderLinks() {
    linksList.innerHTML = state.links.map(lk => {
        const label = escapeHtml(lk.label);
        const hasContent = lk.content && lk.content.trim();
        const url = lk.url ? escapeAttr(lk.url) : '#';
        // If the link has rich content, open in popup; otherwise open URL
        if (hasContent) {
            return `
            <button onclick="window.app.openLinkPopup(${lk.id})"
                class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-xs font-black transition-all group text-left">
                <span class="w-2 h-2 bg-rose-200 rounded-full group-hover:bg-rose-500 transition-colors shrink-0"></span>
                <span class="text-slate-600 group-hover:text-slate-900">${label}</span>
            </button>`;
        }
        return `
        <a href="${url}" target="_blank" rel="noopener noreferrer"
            class="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-xs font-black transition-all group text-left no-underline">
            <span class="w-2 h-2 bg-rose-200 rounded-full group-hover:bg-rose-500 transition-colors shrink-0"></span>
            <span class="text-slate-600 group-hover:text-slate-900">${label}</span>
        </a>`;
    }).join('');
}

function openLinkPopup(id) {
    const lk = state.links.find(l => l.id === id);
    if (!lk) return;

    const modal = document.createElement('div');
    modal.id = 'linkPopup';
    modal.className = 'fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-6 overflow-y-auto flex items-center justify-center';
    modal.onclick = (e) => { if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; } };
    modal.innerHTML = `
        <div class="max-w-xl w-full bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 modal-enter">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-black text-slate-900">${escapeHtml(lk.label)}</h2>
                <button onclick="this.closest('#linkPopup').remove(); document.body.style.overflow='';" class="text-slate-400 font-black hover:text-slate-900 transition-colors">✕</button>
            </div>
            <div class="lesson-content text-sm font-medium leading-relaxed text-slate-700">${lk.content || ''}</div>
            ${lk.url ? `<a href="${escapeAttr(lk.url)}" target="_blank" class="inline-block mt-6 bg-indigo-600 text-white font-black py-2.5 px-6 rounded-xl text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all no-underline">Ouvrir le lien</a>` : ''}
        </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function openMobileLinks() {
    const links = state.links || [];
    const html = links.map(lk => {
        const label = escapeHtml(lk.label);
        const hasContent = lk.content && lk.content.trim();
        const url = lk.url ? escapeAttr(lk.url) : '#';
        if (hasContent) {
            return `
            <button onclick="window.app.openLinkPopup(${lk.id}); document.getElementById('mobileLinksModal')?.remove(); document.body.style.overflow='hidden';"
                class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all text-left">
                <span class="w-2 h-2 bg-rose-400 rounded-full shrink-0"></span>
                <span class="text-slate-700">${label}</span>
            </button>`;
        }
        return `
        <a href="${url}" target="_blank" rel="noopener noreferrer"
            class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all text-left no-underline">
            <span class="w-2 h-2 bg-rose-400 rounded-full shrink-0"></span>
            <span class="text-slate-700">${label}</span>
        </a>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'mobileLinksModal';
    modal.className = 'fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-6 overflow-y-auto flex items-start justify-center';
    modal.onclick = (e) => { if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; } };
    modal.innerHTML = `
        <div class="max-w-lg w-full bg-white rounded-[2.5rem] shadow-2xl p-8 modal-enter mt-10">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-black text-slate-900">Liens utiles</h2>
                <button onclick="this.closest('#mobileLinksModal').remove(); document.body.style.overflow='';" class="text-slate-400 font-black text-xl hover:text-slate-900 transition-colors">✕</button>
            </div>
            <div class="space-y-1">${html || '<p class="text-slate-400 text-sm text-center py-6">Aucun lien pour le moment.</p>'}</div>
        </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

async function loadCategory(slug, opts = {}) {
    state.currentCategory = slug;
    state.activeResource = null;
    if (!opts.keepHash) clearResourceUrl();
    clearSearch();
    renderNav();
    showLoading();

    const cat = state.categories.find(c => c.slug === slug);
    if (!cat) { hideLoading(); return; }

    const { data, error } = await supabase.from('resources').select('*').eq('category_id', cat.id).order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    hideLoading();

    if (!error) {
        state.resources = data || [];
        renderResourceList();
        emptyState.classList.remove('hidden');
        resourceDisplay.classList.add('hidden');
    }
}

function renderResourceList() {
    const query = state.searchQuery.toLowerCase();
    const filtered = state.resources.filter(r =>
        (r.title || '').toLowerCase().includes(query) ||
        (r.content || '').toLowerCase().includes(query)
    );

    resourceList.innerHTML = filtered.map(r => {
        const rid = escapeAttr(r.id);
        const title = escapeHtml(r.title);
        const isActive = state.activeResource?.id === r.id;
        return `
        <button onclick="window.app.loadResource('${rid}')"
            ${isActive ? 'aria-current="true"' : ''}
            class="w-full transition-sidebar flex items-center gap-2.5 px-4 py-3 text-xs font-bold border-b border-slate-50 hover:bg-slate-100 text-left
            ${isActive ? 'sidebar-active text-indigo-900 bg-indigo-50/30' : 'text-slate-500'}">
            <div class="w-4 h-4 border-2 ${isActive ? 'border-indigo-400 bg-indigo-100' : 'border-slate-100'} rounded-full shrink-0"></div>
            <span class="line-clamp-2">${title}</span>
        </button>`;
    }).join('');

    // Auto-scroll sidebar to active item
    setTimeout(() => {
        const active = resourceList.querySelector('[aria-current="true"]');
        if (active) active.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, 50);
}

function processContent(html) {
    if (!html) return '';
    let c = html.replace(/&nbsp;/g, ' ');

    // [hl]highlight[/hl]
    c = c.replace(/\[hl\](.*?)\[\/hl\]/gis, '<mark>$1</mark>');
    // [s]strike[/s]
    c = c.replace(/\[s\](.*?)\[\/s\]/gis, '<s>$1</s>');
    // [hr]
    c = c.replace(/\[hr\]/g, '<hr>');
    // [spoiler]...[/spoiler]
    c = c.replace(/\[spoiler\](.*?)\[\/spoiler\]/gis, '<details><summary><span class="bg-indigo-100 p-1 rounded-lg">💡</span> Voir la réponse</summary><div>$1</div></details>');

    // YouTube embeds
    c = c.replace(/(?:<p>)?(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8 relative rounded-2xl overflow-hidden shadow-lg" style="padding-bottom:56.25%"><iframe src="https://www.youtube.com/embed/$1?rel=0" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen loading="lazy"></iframe></figure>');

    // Vimeo embeds
    c = c.replace(/(?:<p>)?https?:\/\/(?:www\.)?vimeo\.com\/(\d+)[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8 relative rounded-2xl overflow-hidden shadow-lg" style="padding-bottom:56.25%"><iframe src="https://player.vimeo.com/video/$1" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen loading="lazy"></iframe></figure>');

    // Spotify embeds
    c = c.replace(/(?:<p>)?https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8"><iframe src="https://open.spotify.com/embed/$1/$2" width="100%" height="152" frameborder="0" allow="encrypted-media" style="border-radius:12px" loading="lazy"></iframe></figure>');

    // Dailymotion embeds
    c = c.replace(/(?:<p>)?https?:\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8 relative rounded-2xl overflow-hidden shadow-lg" style="padding-bottom:56.25%"><iframe src="https://www.dailymotion.com/embed/video/$1" class="absolute inset-0 w-full h-full" frameborder="0" allowfullscreen loading="lazy"></iframe></figure>');

    // Instagram embeds
    c = c.replace(/(?:<p>)?https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8 flex justify-center"><iframe src="https://www.instagram.com/$1/$2/embed" width="400" height="550" frameborder="0" scrolling="no" style="border-radius:12px;max-width:100%" loading="lazy"></iframe></figure>');

    // Twitter/X embeds
    c = c.replace(/(?:<p>)?https?:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)[^\s<]*(?:<\/p>)?/gi,
        '<figure class="my-8 flex justify-center"><blockquote class="twitter-tweet"><a href="https://twitter.com/i/status/$1"></a></blockquote></figure>');

    // SoundCloud embeds
    c = c.replace(/(?:<p>)?(https?:\/\/soundcloud\.com\/[^\s<"]+)(?:<\/p>)?/gi,
        '<figure class="my-8"><iframe width="100%" height="166" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?url=$1&color=%234f46e5&auto_play=false&hide_related=true&show_comments=false" style="border-radius:12px" loading="lazy"></iframe></figure>');

    // Facebook video embeds
    c = c.replace(/(?:<p>)?(https?:\/\/(?:www\.)?facebook\.com\/[^\s<"]+\/videos\/[^\s<"]+)(?:<\/p>)?/gi,
        '<figure class="my-8 flex justify-center"><iframe src="https://www.facebook.com/plugins/video.php?href=$1&show_text=false" width="100%" style="aspect-ratio:9/16;max-height:70vh;border-radius:12px" frameborder="0" allowfullscreen loading="lazy"></iframe></figure>');

    // Audio files
    c = c.replace(/((?:https?:\/\/[^\s<"]+|uploads\/audio\/[^\s<"]+)\.(mp3|wav|m4a|ogg))/gi,
        '<div class="my-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm"><audio controls class="w-full"><source src="$1" type="audio/$2"></audio></div>');

    // Video files
    c = c.replace(/((?:https?:\/\/[^\s<"]+|uploads\/video\/[^\s<"]+)\.(mp4|webm))/gi,
        '<figure class="my-8 rounded-2xl overflow-hidden shadow-lg"><video controls class="w-full" style="max-height:70vh"><source src="$1" type="video/$2"></video></figure>');

    return c;
}

function slugify(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function parseFicheHash() {
    const m = (location.hash || '').match(/^#fiche=(\d+)/);
    return m ? m[1] : null;
}

function updateUrlForResource(res, { push = true } = {}) {
    if (!res) return;
    const slug = slugify(res.title);
    const hash = '#fiche=' + res.id + (slug ? '-' + slug : '');
    if (push && location.hash !== hash) {
        history.pushState({ ficheId: res.id }, '', hash);
    }
    document.title = (res.title ? res.title + ' — ' : '') + 'Jeu de Prompts';
}

function clearResourceUrl() {
    if (location.hash) {
        history.pushState(null, '', location.pathname + location.search);
    }
    document.title = 'Jeu de Prompts';
}

async function loadResource(id, opts = {}) {
    const res = state.resources.find(r => r.id == id);
    if (!res) return;

    state.activeResource = res;
    updateUrlForResource(res, { push: !opts.skipHashUpdate });
    renderResourceList();

    emptyState.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    resourceDisplay.classList.remove('hidden');

    const adminActions = state.isAdmin ? `
        <div class="flex gap-2 mt-4">
            <button onclick="window.app.openEditor('${escapeAttr(res.id)}')" class="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-lg font-bold transition-all">Éditer</button>
            <button onclick="window.app.deleteResource('${escapeAttr(res.id)}')" class="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1 rounded-lg font-bold transition-all">Supprimer</button>
        </div>
    ` : '';

    // Check if favorited
    const { data: favCheck } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', state.user.id)
        .eq('resource_id', res.id)
        .single();
    const isFav = !!favCheck;

    // Fetch comments for this resource
    const { data: comments } = await supabase
        .from('comments')
        .select('*, profiles(id)')
        .eq('resource_id', res.id)
        .order('created_at', { ascending: false });

    // Fetch user's private notes
    const { data: noteData } = await supabase
        .from('notes')
        .select('content')
        .eq('user_id', state.user.id)
        .eq('resource_id', res.id)
        .single();

    const commentsHtml = renderComments(comments || [], res.id);
    const notesHtml = renderNotes(noteData?.content || '', res.id);

    resourceDisplay.innerHTML = `
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-10 relative animate-fade-in min-w-0">
            <div class="fiche-header">
                <div class="mb-6">
                    <h1 class="text-2xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight mb-4">
                        ${escapeHtml(res.title)}
                    </h1>
                    <div class="flex gap-2 items-center">
                        <button onclick="window.app.toggleFavorite(${res.id})"
                            class="w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm border ${isFav ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-amber-400'}">
                            <svg class="h-5 w-5" fill="${isFav ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.54 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.784.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                        </button>
                        ${adminActions}
                    </div>
                </div>
            </div>
            <article>
                <span class="section-badge badge-workflow">Workflow & Prompts</span>
                <div class="lesson-content text-base font-medium" dir="auto">
                    ${processContent(res.content)}
                </div>
            </article>
        </div>

        <!-- Comments Section -->
        <div id="comment-section" class="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-10 animate-fade-in">
            ${commentsHtml}
        </div>

        <!-- Private Notes -->
        <div class="bg-amber-50/50 rounded-[2rem] border border-amber-100 p-6 md:p-10 animate-fade-in">
            ${notesHtml}
        </div>
    `;

    // Lightbox on images
    resourceDisplay.querySelectorAll('.lesson-content img').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => openLightbox(img.src, img.alt));
    });

    // Auto-scroll to content on mobile
    if (window.innerWidth < 1024) {
        setTimeout(() => resourceDisplay.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

// --- COMMENTS ---
function renderComments(comments, resourceId) {
    const parents = comments.filter(c => !c.parent_id);
    const replies = comments.filter(c => c.parent_id);
    const count = comments.length;

    let html = `
        <h3 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
            <span>💬 Discussion</span>
            <span class="bg-slate-100 text-slate-400 text-xs px-3 py-1 rounded-full font-black">${count}</span>
        </h3>
        <form onsubmit="window.app.postComment(event, '${escapeAttr(resourceId)}', null)" class="mb-8">
            <div class="bg-slate-50 rounded-2xl p-2 border border-slate-100 shadow-inner">
                <textarea id="comment-text" required rows="3"
                    class="w-full bg-transparent border-none p-3 text-sm font-medium outline-none placeholder-slate-400"
                    placeholder="Une question ? Une remarque ?..."></textarea>
                <div class="flex justify-end p-2">
                    <button type="submit"
                        class="bg-indigo-600 text-white font-black py-2 px-6 rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-md active:scale-95 transition-all">
                        Publier
                    </button>
                </div>
            </div>
        </form>
        <div class="space-y-5 text-sm text-slate-700 font-medium">`;

    for (const com of parents) {
        const initial = (com.author_name || 'U').charAt(0).toUpperCase();
        const comReplies = replies.filter(r => r.parent_id === com.id);
        const dateStr = new Date(com.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' à ' + new Date(com.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const canDelete = com.user_id === state.user.id || state.isAdmin;

        html += `
            <div class="group border-b border-slate-50 pb-5">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xs">${initial}</div>
                        <div>
                            <p class="text-sm font-black text-slate-800 leading-none">${escapeHtml(com.author_name || 'Utilisateur')}</p>
                            <p class="text-[9px] font-bold text-slate-300 uppercase tracking-tighter mt-1">${dateStr}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        ${canDelete ? `<button onclick="window.app.deleteComment('${com.id}', '${escapeAttr(resourceId)}')" class="text-red-400 text-[10px] font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity">Supprimer</button>` : ''}
                        <button onclick="document.getElementById('reply-${com.id}').classList.toggle('hidden')" class="text-indigo-500 text-[10px] font-black uppercase">Répondre</button>
                    </div>
                </div>
                <p class="text-sm ml-11 font-medium leading-relaxed text-slate-600">${escapeHtml(com.content)}</p>
                <div id="reply-${com.id}" class="hidden ml-11 mt-3">
                    <form onsubmit="window.app.postComment(event, '${escapeAttr(resourceId)}', '${com.id}')">
                        <div class="bg-slate-50 rounded-xl p-2 border border-slate-100 shadow-inner">
                            <textarea required rows="2" class="reply-text w-full bg-transparent border-none p-2 text-xs font-medium outline-none text-slate-700" placeholder="Votre réponse..."></textarea>
                            <div class="flex justify-end p-1">
                                <button type="submit" class="bg-indigo-600 text-white font-black py-1.5 px-4 rounded-lg text-[9px] uppercase active:scale-95 transition-all">Répondre</button>
                            </div>
                        </div>
                    </form>
                </div>`;

        for (const rep of comReplies) {
            const repDate = new Date(rep.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' à ' + new Date(rep.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const canDeleteRep = rep.user_id === state.user.id || state.isAdmin;
            html += `
                <div class="ml-11 mt-3 pl-4 border-l-2 border-slate-100 group/rep">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black text-slate-800">${escapeHtml(rep.author_name || 'Utilisateur')}</span>
                            <span class="text-[8px] font-bold text-slate-300 uppercase">${repDate}</span>
                        </div>
                        ${canDeleteRep ? `<button onclick="window.app.deleteComment('${rep.id}', '${escapeAttr(resourceId)}')" class="text-red-300 text-[8px] font-black uppercase opacity-0 group-hover/rep:opacity-100 transition-opacity">Supprimer</button>` : ''}
                    </div>
                    <p class="text-xs italic text-slate-500 font-medium">${escapeHtml(rep.content)}</p>
                </div>`;
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

async function postComment(e, resourceId, parentId) {
    e.preventDefault();
    const textarea = parentId
        ? e.target.querySelector('.reply-text')
        : document.getElementById('comment-text');
    const content = textarea.value.trim();
    if (!content) return;

    const email = state.user.email || '';
    const name = email.split('@')[0] || 'Utilisateur';

    const payload = {
        resource_id: resourceId,
        user_id: state.user.id,
        author_name: name,
        content: content,
        parent_id: parentId || null
    };

    const { error } = await supabase.from('comments').insert(payload);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await loadResource(state.activeResource.id);
        setTimeout(() => {
            document.getElementById('comment-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
}

async function deleteComment(commentId, resourceId) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    // Delete replies first, then comment
    await supabase.from('comments').delete().eq('parent_id', commentId);
    await supabase.from('comments').delete().eq('id', commentId);
    await loadResource(state.activeResource.id);
}

// --- PRIVATE NOTES ---
function renderNotes(content, resourceId) {
    return `
        <div class="flex items-center gap-3 mb-5">
            <span class="text-xl">📝</span>
            <h3 class="text-base font-black text-amber-900">Mes notes personnelles</h3>
            <span class="text-[10px] font-bold text-amber-600/50 uppercase tracking-widest ml-auto">Privé</span>
        </div>
        <div id="note-saved-msg" class="hidden text-[10px] font-black text-emerald-600 uppercase mb-3">✓ Notes enregistrées !</div>
        <textarea id="note-text" rows="4"
            class="w-full bg-white border border-amber-100 rounded-2xl p-4 text-sm text-amber-900 font-medium outline-none focus:ring-4 focus:ring-amber-200/20"
            placeholder="Vos notes privées sur cette fiche...">${escapeHtml(content)}</textarea>
        <div class="flex justify-end mt-3">
            <button onclick="window.app.saveNote('${escapeAttr(resourceId)}')"
                class="bg-amber-600 text-white font-black py-2.5 px-6 rounded-xl text-[10px] uppercase tracking-widest shadow-md hover:bg-amber-700 active:scale-95 transition-all">
                Enregistrer
            </button>
        </div>`;
}

async function saveNote(resourceId) {
    const content = document.getElementById('note-text').value;
    const { error } = await supabase.from('notes').upsert({
        user_id: state.user.id,
        resource_id: resourceId,
        content: content
    }, { onConflict: 'user_id,resource_id' });

    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        const msg = document.getElementById('note-saved-msg');
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 3000);
    }
}

// --- MESSAGING (Écrire à Marc) ---
async function openMessages() {
    clearSearch();
    // Find admin (Marc)
    const MARC_ID = 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882';
    const adminId = MARC_ID;

    // Fetch messages
    const { data: messages } = await supabase
        .from('private_messages')
        .select('*')
        .or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${adminId}),and(sender_id.eq.${adminId},receiver_id.eq.${state.user.id})`)
        .order('created_at', { ascending: true });

    // Mark as read
    const { error: markErr } = await supabase.from('private_messages').update({ is_read: true })
        .eq('sender_id', adminId).eq('receiver_id', state.user.id).eq('is_read', false);
    if (markErr) console.error('Mark read failed:', markErr.message);
    await checkUnreadMessages();

    const msgList = (messages || []).map(m => {
        const isMine = m.sender_id === state.user.id;
        const dateStr = new Date(m.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' ' + new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} group">
                <div class="max-w-[75%] ${isMine ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'} border rounded-2xl p-4 relative">
                    ${!isMine ? '<p class="text-[9px] font-black text-indigo-600 uppercase mb-1">Marc</p>' : ''}
                    <p class="text-sm text-slate-700 font-medium">${escapeHtml(m.content)}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[9px] text-slate-400">${dateStr}</span>
                        ${isMine ? `<button onclick="window.app.deleteMessage('${m.id}')" class="text-[9px] text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">supprimer</button>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');

    const emptyMsg = messages?.length ? '' : `
        <div class="text-center py-10">
            <div class="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">💬</div>
            <p class="text-slate-400 text-sm font-medium">Aucun message.<br>Envoyez votre premier message !</p>
        </div>`;

    // Hide other views, show message view
    emptyState.classList.add('hidden');
    resourceDisplay.classList.remove('hidden');
    resourceDisplay.innerHTML = `
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
            <div class="p-6 border-b border-slate-100 flex items-center gap-4">
                <button onclick="window.app.closeMessages()" class="bg-slate-100 p-2 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <h2 class="text-xl font-black text-slate-900">Conversation avec Marc</h2>
            </div>
            <div id="msgThread" class="p-6 space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
                ${emptyMsg}${msgList}
            </div>
            <div class="p-5 border-t border-slate-100">
                <form onsubmit="window.app.sendMessage(event, '${adminId}')">
                    <div class="flex gap-2">
                        <textarea id="msg-input" required rows="1" placeholder="Votre message..."
                            class="flex-grow bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none"
                            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"
                            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
                        <button type="submit" class="bg-indigo-600 text-white px-5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95">Envoyer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Auto-scroll to bottom
    const thread = document.getElementById('msgThread');
    if (thread) thread.scrollTop = thread.scrollHeight;
}

async function sendMessage(e, receiverId) {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content) return;

    const { error } = await supabase.from('private_messages').insert({
        sender_id: state.user.id,
        receiver_id: receiverId,
        content: content
    });

    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await openMessages();
    }
}

async function deleteMessage(msgId) {
    if (!confirm('Supprimer ce message ?')) return;
    await supabase.from('private_messages').delete().eq('id', msgId).eq('sender_id', state.user.id);
    await openMessages();
}

function closeMessages() {
    if (state.activeResource) {
        loadResource(state.activeResource.id);
    } else {
        resourceDisplay.classList.add('hidden');
        emptyState.classList.remove('hidden');
    }
}

// --- GO HOME ---
function goHome() {
    state.activeResource = null;
    if (state.categories.length > 0) {
        loadCategory(state.categories[0].slug);
    }
    resourceDisplay.classList.add('hidden');
    emptyState.classList.remove('hidden');
}

// --- FAVORITES ---
async function toggleFavorite(resourceId) {
    // Check if already favorited
    const { data: existing } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', state.user.id)
        .eq('resource_id', resourceId)
        .single();

    if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
    } else {
        await supabase.from('favorites').insert({ user_id: state.user.id, resource_id: resourceId });
    }
    // Reload to update the star
    await loadResource(resourceId);
}

async function openFavorites() {
    clearSearch();
    emptyState.classList.add('hidden');
    resourceDisplay.classList.remove('hidden');

    const { data: favs } = await supabase
        .from('favorites')
        .select('resource_id, resources(id, title)')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false });

    const items = (favs || []).filter(f => f.resources);

    let html;
    if (items.length === 0) {
        html = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-12 text-center animate-fade-in">
                <div class="text-5xl mb-6 opacity-20">⭐</div>
                <h2 class="text-2xl font-black text-slate-900 mb-3 tracking-tight">Aucun favori</h2>
                <p class="text-slate-500 font-medium text-sm max-w-md mx-auto">Vous n'avez pas encore de fiches favorites. Ouvrez une fiche et cliquez sur l'étoile pour l'ajouter à vos favoris.</p>
            </div>`;
    } else {
        const list = items.map(f => `
            <button onclick="window.app.loadResourceFromAnywhere(${f.resources.id})"
                class="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-indigo-50 transition-all text-left group">
                <span class="text-amber-400">★</span>
                <span class="text-sm font-bold text-slate-700 group-hover:text-indigo-700">${escapeHtml(f.resources.title)}</span>
            </button>`).join('');
        html = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-10 animate-fade-in">
                <h2 class="text-2xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">⭐ Mes favoris <span class="bg-slate-100 text-slate-400 text-xs px-3 py-1 rounded-full font-black">${items.length}</span></h2>
                <div class="divide-y divide-slate-50">${list}</div>
            </div>`;
    }
    resourceDisplay.innerHTML = html;
}

async function loadResourceFromAnywhere(id, opts = {}) {
    // Fetch the resource and its category, then load it
    const { data: res } = await supabase.from('resources').select('*, categories(slug)').eq('id', id).single();
    if (!res) return false;
    if (res.categories?.slug) {
        await loadCategory(res.categories.slug, { keepHash: true });
    }
    await loadResource(id, opts);
    return true;
}

// --- ALL NOTES ---
async function openAllNotes() {
    clearSearch();
    emptyState.classList.add('hidden');
    resourceDisplay.classList.remove('hidden');

    const { data: allNotes } = await supabase
        .from('notes')
        .select('resource_id, content, updated_at, resources(id, title)')
        .eq('user_id', state.user.id)
        .neq('content', '')
        .order('updated_at', { ascending: false });

    const items = (allNotes || []).filter(n => n.resources && n.content.trim());

    let html;
    if (items.length === 0) {
        html = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-12 text-center animate-fade-in">
                <div class="text-5xl mb-6 opacity-20">📝</div>
                <h2 class="text-2xl font-black text-slate-900 mb-3 tracking-tight">Aucune note</h2>
                <p class="text-slate-500 font-medium text-sm max-w-md mx-auto">Vous n'avez pas encore de notes personnelles. Ouvrez une fiche et utilisez la zone "Mes notes personnelles" en bas de page pour en créer.</p>
            </div>`;
    } else {
        const list = items.map(n => {
            const dateStr = new Date(n.updated_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
            const preview = n.content.length > 120 ? n.content.substring(0, 120) + '…' : n.content;
            return `
            <button onclick="window.app.loadResourceFromAnywhere(${n.resources.id})"
                class="w-full text-left p-5 rounded-2xl hover:bg-amber-50/50 transition-all group border-b border-slate-50">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-black text-slate-800 group-hover:text-indigo-700">${escapeHtml(n.resources.title)}</span>
                    <span class="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">${dateStr}</span>
                </div>
                <p class="text-xs text-slate-500 font-medium leading-relaxed">${escapeHtml(preview)}</p>
            </button>`;
        }).join('');
        html = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-10 animate-fade-in">
                <h2 class="text-2xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">📝 Mes notes <span class="bg-slate-100 text-slate-400 text-xs px-3 py-1 rounded-full font-black">${items.length}</span></h2>
                <div>${list}</div>
            </div>`;
    }
    resourceDisplay.innerHTML = html;
}

// --- SETTINGS (Change Password) ---
function openSettings() {
    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6';
    modal.onclick = (e) => { if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; } };
    modal.innerHTML = `
        <div class="max-w-sm w-full bg-white rounded-[2.5rem] shadow-2xl p-8 modal-enter">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-black text-slate-900">Changer le mot de passe</h2>
                <button onclick="this.closest('#settingsModal').remove(); document.body.style.overflow='';" class="text-slate-400 hover:text-slate-900 transition-colors font-black text-xl">&times;</button>
            </div>
            <div id="settings-error" class="hidden info-box info-box-error mb-4 text-sm"></div>
            <div id="settings-success" class="hidden info-box info-box-success mb-4 text-sm"></div>
            <form onsubmit="window.app.changePassword(event)" class="space-y-4">
                <div class="relative">
                    <input type="password" id="new-password" required placeholder="Nouveau mot de passe"
                        class="w-full px-5 py-3 border rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-slate-700 text-sm pr-12"
                        oninput="window.app.validatePwd(this.value)">
                    <button type="button" onclick="window.app.togglePwd('new-password', this)" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        <svg class="eye-open w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        <svg class="eye-closed w-4 h-4 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                    </button>
                </div>
                <div id="pw-rules-settings" class="grid grid-cols-2 gap-2 text-[11px] font-bold hidden">
                    <div class="flex items-center gap-1.5"><span class="pw-dot w-2 h-2 rounded-full bg-slate-200 transition-colors"></span><span class="text-slate-400">8 caract. min</span></div>
                    <div class="flex items-center gap-1.5"><span class="pw-dot w-2 h-2 rounded-full bg-slate-200 transition-colors"></span><span class="text-slate-400">1 majuscule</span></div>
                    <div class="flex items-center gap-1.5"><span class="pw-dot w-2 h-2 rounded-full bg-slate-200 transition-colors"></span><span class="text-slate-400">1 minuscule</span></div>
                    <div class="flex items-center gap-1.5"><span class="pw-dot w-2 h-2 rounded-full bg-slate-200 transition-colors"></span><span class="text-slate-400">1 chiffre</span></div>
                </div>
                <input type="password" id="confirm-new-password" required placeholder="Confirmer le nouveau mot de passe"
                    class="w-full px-5 py-3 border rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium text-slate-700 text-sm">
                <button type="submit"
                    class="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all active:scale-[0.98] text-sm">
                    Modifier le mot de passe
                </button>
            </form>
        </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Wire up password validation for settings modal
    const pwInput = modal.querySelector('#new-password');
    pwInput.addEventListener('input', () => {
        const val = pwInput.value;
        const rules = modal.querySelector('#pw-rules-settings');
        const dots = rules.querySelectorAll('.pw-dot');
        if (val.length > 0) rules.classList.remove('hidden');
        else { rules.classList.add('hidden'); return; }
        const checks = [val.length >= 8, /[A-Z]/.test(val), /[a-z]/.test(val), /[0-9]/.test(val)];
        dots.forEach((dot, i) => {
            if (checks[i]) { dot.classList.remove('bg-slate-200'); dot.classList.add('bg-indigo-500'); }
            else { dot.classList.add('bg-slate-200'); dot.classList.remove('bg-indigo-500'); }
        });
    });
}

async function changePassword(e) {
    e.preventDefault();
    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-new-password').value;
    const errEl = document.getElementById('settings-error');
    const successEl = document.getElementById('settings-success');
    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    if (newPwd !== confirmPwd) {
        errEl.textContent = 'Les mots de passe ne correspondent pas.';
        errEl.classList.remove('hidden');
        return;
    }
    if (newPwd.length < 8 || !/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
        errEl.textContent = 'Le mot de passe doit contenir 8+ caractères, une majuscule, une minuscule et un chiffre.';
        errEl.classList.remove('hidden');
        return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove('hidden');
    } else {
        successEl.textContent = '✓ Mot de passe modifié avec succès.';
        successEl.classList.remove('hidden');
        setTimeout(() => {
            const modal = document.getElementById('settingsModal');
            if (modal) { modal.remove(); document.body.style.overflow = ''; }
        }, 2000);
    }
}

// --- ADMIN ACTIONS ---
function openEditor(id = null) {
    document.getElementById('edit-mode').value = 'resource';
    document.getElementById('edit-category-wrapper').classList.remove('hidden');

    const res = id ? state.resources.find(r => r.id == id) : null;
    const data = res || { id: '', title: '', content: '' };
    document.getElementById('edit-resource-id').value = data.id;
    document.getElementById('edit-title').value = data.title;
    document.getElementById('modal-title').textContent = id && res ? 'Éditer la fiche' : 'Nouvelle fiche';

    // Populate category select
    const catSelect = document.getElementById('edit-category');
    catSelect.innerHTML = state.categories.map(c =>
        `<option value="${c.id}" ${(res && res.category_id === c.id) || (!res && state.currentCategory === c.slug) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');

    editorModal.classList.remove('hidden');

    const q = getQuill();
    if (data.content) {
        q.clipboard.dangerouslyPasteHTML(data.content);
    } else {
        q.setContents([]);
    }
}

async function openNewsEditor(id = null) {
    document.getElementById('edit-mode').value = 'news';
    document.getElementById('edit-category-wrapper').classList.add('hidden');

    let data = { id: '', title: '', content: '' };
    if (id) {
        const { data: n } = await supabase.from('news').select('*').eq('id', id).single();
        if (n) data = n;
    }
    document.getElementById('edit-resource-id').value = data.id || '';
    document.getElementById('edit-title').value = data.title || '';
    document.getElementById('modal-title').textContent = id ? 'Éditer la news' : 'Nouvelle news';

    editorModal.classList.remove('hidden');

    const q = getQuill();
    if (data.content) {
        q.clipboard.dangerouslyPasteHTML(data.content);
    } else {
        q.setContents([]);
    }
}

adminAddBtn.addEventListener('click', () => openEditor());

resourceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('edit-mode').value;
    const id = document.getElementById('edit-resource-id').value;
    const title = document.getElementById('edit-title').value;
    const q = getQuill();
    const content = q.getSemanticHTML();

    if (!title.trim()) return alert('Le titre est requis.');

    if (mode === 'news') {
        const payload = { title, content: q.getText().trim() ? content : null };
        let error;
        if (id) {
            const { error: err } = await supabase.from('news').update(payload).eq('id', id);
            error = err;
        } else {
            const { error: err } = await supabase.from('news').insert(payload);
            error = err;
        }
        if (error) {
            alert("Erreur : " + error.message);
        } else {
            editorModal.classList.add('hidden');
            await fetchNews();
            renderNews();
            renderAdminNews();
            fetchAdminStats();
        }
        return;
    }

    if (!q.getText().trim()) return alert('Le contenu est requis.');

    const categoryId = parseInt(document.getElementById('edit-category').value);
    if (!categoryId) return alert("Sélectionnez une catégorie !");

    const payload = { title, content, category_id: categoryId };

    let error;
    if (id) {
        const { error: err } = await supabase.from('resources').update(payload).eq('id', id);
        error = err;
    } else {
        const { error: err } = await supabase.from('resources').insert(payload);
        error = err;
    }

    if (error) {
        alert("Erreur lors de l'enregistrement : " + error.message);
    } else {
        editorModal.classList.add('hidden');
        await loadCategory(state.currentCategory);
    }
});

async function deleteResource(id) {
    if (!confirm("Supprimer cette fiche définitivement ?")) return;
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) {
        alert("Erreur lors de la suppression : " + error.message);
    } else {
        state.activeResource = null;
        resourceDisplay.classList.add('hidden');
        emptyState.classList.remove('hidden');
        await loadCategory(state.currentCategory);
    }
}

const SEARCH_AI_URL = 'https://nywwmhmymusbnapblwoj.supabase.co/functions/v1/smooth-worker';

// Search only triggers on Enter — no real-time search
resourceSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    // Show/hide clear button
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !e.target.value.trim());
    // Only filter the current resource list locally (no AI call)
    renderResourceList();
});

resourceSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
    }
});

let aiSearchController = null;

// French stop words — stripped before sending to AI
const SEARCH_STOP_WORDS = new Set(['le','la','les','un','une','des','de','du','au','aux','ce','ces','cet','cette','mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre','vos','leur','leurs','je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','en','y','qui','que','quoi','dont','où','quel','quelle','quels','quelles','comment','pourquoi','quand','est','sont','suis','es','sommes','êtes','ai','as','avons','avez','ont','été','faire','fait','pour','par','avec','sans','dans','sur','sous','entre','vers','chez','plus','moins','très','trop','bien','mal','pas','ne','ni','et','ou','mais','donc','car','si','comme','tout','tous','toute','toutes','autre','autres','même','aussi','encore','déjà','ici','là','alors','puis','être','avoir','bon','bonne','dois','doit','faut','quel','quelle']);

function cleanQuery(q) {
    return q.split(/\s+/).filter(w => w.length >= 2 && !SEARCH_STOP_WORDS.has(w.toLowerCase())).join(' ');
}

// Decide: single word → local search, multi-word → AI via smooth-worker
function triggerSearch() {
    const query = state.searchQuery.trim();
    if (query.length < 2) return;
    const words = query.split(/\s+/).filter(w => w.length >= 2);
    if (words.length <= 1) {
        triggerLocalSearch();
    } else {
        triggerAiSearch();
    }
}

// Local keyword search across all fiches (for single words)
async function triggerLocalSearch() {
    const query = state.searchQuery.trim().toLowerCase();
    const aiBox = document.getElementById('ai-search-box');
    if (!aiBox) return;

    if (query.length < 2) {
        aiBox.classList.add('hidden');
        return;
    }

    aiBox.classList.remove('hidden');
    aiBox.innerHTML = '<div class="flex items-center gap-3 p-4"><div class="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><span class="text-xs font-bold text-slate-400">Recherche...</span></div>';

    try {
        const { data: allResources } = await supabase
            .from('resources')
            .select('id, title, content, category_id, categories(name)')
            .order('position', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

        const results = (allResources || []).filter(r => {
            const title = (r.title || '').toLowerCase();
            const content = (r.content || '').replace(/<[^>]*>/g, ' ').toLowerCase();
            return title.includes(query) || content.includes(query);
        }).slice(0, 8);

        if (results.length === 0) {
            aiBox.innerHTML = `
                <div class="p-4">
                    <div class="flex items-start gap-3">
                        <div class="w-7 h-7 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center text-sm flex-shrink-0">✨</div>
                        <p class="text-xs text-slate-500 font-medium leading-relaxed">Aucune fiche ne contient <strong>"${escapeHtml(state.searchQuery.trim())}"</strong>. Essayez un autre mot-clé ou parcourez les catégories.</p>
                    </div>
                </div>`;
            return;
        }

        const links = results.map(r => {
            const catLabel = r.categories?.name || '';
            return `<button onclick="window.app.loadResourceFromAnywhere(${r.id})" class="flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-100/50 transition-all text-xs font-bold text-indigo-800 group text-left w-full">
                <span class="w-1.5 h-1.5 bg-indigo-400 rounded-full group-hover:bg-indigo-600 shrink-0"></span>
                <span>${escapeHtml(r.title)}</span>
                ${catLabel ? `<span class="text-[9px] text-slate-400 ml-auto">${escapeHtml(catLabel)}</span>` : ''}
            </button>`;
        }).join('');

        aiBox.innerHTML = `
            <div class="p-4">
                <div class="flex items-start gap-3 mb-3">
                    <div class="w-7 h-7 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm flex-shrink-0">✨</div>
                    <p class="text-xs text-slate-600 font-medium leading-relaxed">${results.length} fiche${results.length > 1 ? 's' : ''} contenant <strong>"${escapeHtml(state.searchQuery.trim())}"</strong> :</p>
                </div>
                <div class="pl-10 space-y-0.5">${links}</div>
            </div>`;
    } catch (err) {
        aiBox.classList.add('hidden');
    }
}

// AI search via smooth-worker (for questions / multi-word queries)
async function triggerAiSearch() {
    const query = state.searchQuery.trim();
    const aiBox = document.getElementById('ai-search-box');

    if (query.length < 2) {
        if (aiBox) aiBox.classList.add('hidden');
        return;
    }

    if (aiBox) {
        aiBox.classList.remove('hidden');
        aiBox.innerHTML = '<div class="flex items-center gap-3 p-4"><div class="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><span class="text-xs font-bold text-slate-400">Recherche intelligente...</span></div>';
    }

    if (aiSearchController) aiSearchController.abort();
    aiSearchController = new AbortController();

    try {
        const resp = await fetch(SEARCH_AI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: aiSearchController.signal,
        });
        const data = await resp.json();

        if (!aiBox) return;

        if (data.error) {
            aiBox.innerHTML = '<div class="p-4 text-xs text-red-500 font-bold">' + escapeHtml(data.error) + '</div>';
            return;
        }

        if ((!data.lessons || data.lessons.length === 0) && !data.answer) {
            aiBox.innerHTML = `
                <div class="p-4">
                    <div class="flex items-start gap-3">
                        <div class="w-7 h-7 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center text-sm flex-shrink-0">✨</div>
                        <p class="text-xs text-slate-500 font-medium leading-relaxed">Je n'ai trouvé aucune fiche correspondant à votre question. Essayez de reformuler ou parcourez les catégories.</p>
                    </div>
                </div>`;
            return;
        }

        const lessonLinks = (data.lessons || []).map(l =>
            `<button onclick="window.app.loadResourceFromAnywhere(${l.id})" class="flex items-center gap-2 p-2 rounded-lg hover:bg-indigo-100/50 transition-all text-xs font-bold text-indigo-800 group text-left w-full">
                <span class="w-1.5 h-1.5 bg-indigo-400 rounded-full group-hover:bg-indigo-600 shrink-0"></span>
                <span>${escapeHtml(l.title)}</span>
            </button>`
        ).join('');

        aiBox.innerHTML = `
            <div class="p-4">
                ${data.answer ? `
                <div class="flex items-start gap-3 mb-3">
                    <div class="w-7 h-7 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm flex-shrink-0">✨</div>
                    <p class="text-xs text-slate-600 font-medium leading-relaxed">${escapeHtml(data.answer)}</p>
                </div>` : ''}
                ${lessonLinks ? `<div class="pl-10 space-y-0.5">${lessonLinks}</div>` : ''}
            </div>`;
        aiBox.classList.remove('hidden');

    } catch (err) {
        if (err.name !== 'AbortError' && aiBox) {
            aiBox.classList.add('hidden');
        }
    }
}

// --- ADMIN CONSOLE LOGIC ---
async function fetchAdminStats() {
    try {
        const [u, r, c, n] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }),
            supabase.from('resources').select('*', { count: 'exact', head: true }),
            supabase.from('categories').select('*', { count: 'exact', head: true }),
            supabase.from('news').select('*', { count: 'exact', head: true })
        ]);
        document.getElementById('stat-users').textContent = u.count ?? 0;
        document.getElementById('stat-resources').textContent = r.count ?? 0;
        document.getElementById('stat-categories').textContent = c.count ?? 0;
        document.getElementById('stat-news').textContent = n.count ?? 0;
    } catch (err) {
        console.error('Erreur stats admin:', err);
    }
}

function setAdminView(view) {
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('bg-white', 'border-slate-200', 'active-admin-nav');
            btn.classList.remove('text-slate-500');
        } else {
            btn.classList.remove('bg-white', 'border-slate-200', 'active-admin-nav');
            btn.classList.add('text-slate-500');
        }
    });

    switch (view) {
        case 'users': renderAdminUsers(); break;
        case 'sections': renderAdminSections(); break;
        case 'content': renderAdminContent(); break;
        case 'news': renderAdminNews(); break;
        case 'links': renderAdminLinks(); break;
        case 'messages': renderAdminMessages(); break;
    }
}

// --- ADMIN: USERS ---
async function renderAdminUsers() {
    adminViewContainer.innerHTML = `<div class="p-20 text-center text-slate-400">Chargement des élèves...</div>`;
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) {
        adminViewContainer.innerHTML = `<div class="p-20 text-red-500">Erreur: ${escapeHtml(error.message)}</div>`;
        return;
    }

    adminViewContainer.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black text-slate-900">Gestion des élèves</h2>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="text-[10px] uppercase font-black text-slate-400 border-b">
                        <th class="pb-4">Utilisateur</th>
                        <th class="pb-4">R&ocirc;le</th>
                        <th class="pb-4">Abonnement</th>
                        <th class="pb-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="text-sm font-medium">
                    ${(data || []).map(u => `
                        <tr class="border-b last:border-0 hover:bg-slate-50/50">
                            <td class="py-4">
                                <p class="text-slate-900 font-bold">${escapeHtml(u.email || (u.id || '').substring(0, 8))}</p>
                                <p class="text-[10px] text-slate-400">${escapeHtml((u.id || '').substring(0, 8))}</p>
                            </td>
                            <td class="py-4">
                                <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase ${u.is_admin ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">
                                    ${u.is_admin ? 'ADMIN' : 'ÉLÈVE'}
                                </span>
                            </td>
                            <td class="py-4">
                                <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase ${u.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}">
                                    ${u.subscription_status === 'active' ? 'ABONNÉ' : 'INACTIF'}
                                </span>
                            </td>
                            <td class="py-4 space-x-2">
                                <button onclick="window.app.toggleAdmin('${escapeAttr(u.id)}', ${!!u.is_admin})" class="text-indigo-600 hover:underline text-xs font-bold">
                                    ${u.is_admin ? 'Retirer Admin' : 'Nommer Admin'}
                                </button>
                                <button onclick="window.app.toggleSubscription('${escapeAttr(u.id)}', '${u.subscription_status || 'inactive'}')" class="text-xs font-bold ${u.subscription_status === 'active' ? 'text-red-500 hover:underline' : 'text-emerald-600 hover:underline'}">
                                    ${u.subscription_status === 'active' ? 'D\u00e9sactiver' : 'Activer'}
                                </button>
                                ${!u.is_admin ? '<button onclick="window.app.deleteUser(\'' + escapeAttr(u.id) + '\')" class="text-red-400 hover:text-red-600 hover:underline text-xs font-bold">Supprimer</button>' : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function toggleAdmin(id, current) {
    const { error } = await supabase.from('profiles').update({ is_admin: !current }).eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        renderAdminUsers();
    }
}

async function toggleSubscription(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('profiles').update({ subscription_status: newStatus }).eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        renderAdminUsers();
    }
}

async function deleteUser(id) {
    if (!confirm('Supprimer cet utilisateur et toutes ses données ?')) return;
    // Delete user data from all tables
    await supabase.from('private_messages').delete().or(`sender_id.eq.${id},receiver_id.eq.${id}`);
    await supabase.from('comments').delete().eq('user_id', id);
    await supabase.from('notes').delete().eq('user_id', id);
    await supabase.from('favorites').delete().eq('user_id', id);
    await supabase.from('profiles').delete().eq('id', id);
    // Delete auth user via server-side RPC (requires Supabase function)
    const { error } = await supabase.rpc('delete_auth_user', { user_id: id });
    if (error) {
        alert('Données supprimées mais le compte Auth n\'a pas pu être supprimé : ' + error.message);
    }
    renderAdminUsers();
    fetchAdminStats();
}

// --- ADMIN: MESSAGES ---
async function renderAdminMessages() {
    adminViewContainer.innerHTML = '<div class="p-20 text-center text-slate-400">Chargement des conversations...</div>';

    // Mark all messages to admin as read
    const { error: markErr } = await supabase.from('private_messages').update({ is_read: true })
        .eq('receiver_id', state.user.id).eq('is_read', false);
    if (markErr) console.error('Mark read failed:', markErr.message);
    await checkUnreadMessages();

    // Get all users who have exchanged messages with admin
    const { data: msgs } = await supabase
        .from('private_messages')
        .select('sender_id, receiver_id, content, created_at, is_read')
        .or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`)
        .order('created_at', { ascending: false });

    // Group by conversation partner
    const convMap = {};
    (msgs || []).forEach(m => {
        const partnerId = m.sender_id === state.user.id ? m.receiver_id : m.sender_id;
        if (!convMap[partnerId]) {
            convMap[partnerId] = { lastMsg: m, unread: 0 };
        }
        if (m.receiver_id === state.user.id && !m.is_read) {
            convMap[partnerId].unread++;
        }
    });

    // Get partner profiles
    const partnerIds = Object.keys(convMap);
    let partners = [];
    if (partnerIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, email').in('id', partnerIds);
        partners = data || [];
    }

    if (partners.length === 0) {
        adminViewContainer.innerHTML = `
            <h2 class="text-2xl font-black text-slate-900 mb-6">Messages</h2>
            <div class="text-center py-12 text-slate-400">
                <div class="text-4xl mb-4 opacity-30">💬</div>
                <p class="font-medium">Aucune conversation pour le moment.</p>
            </div>`;
        return;
    }

    const convList = partners.map(p => {
        const conv = convMap[p.id];
        const preview = conv.lastMsg.content.length > 60 ? conv.lastMsg.content.substring(0, 60) + '...' : conv.lastMsg.content;
        const dateStr = new Date(conv.lastMsg.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        return `
            <button onclick="window.app.openAdminConversation('${escapeAttr(p.id)}', '${escapeAttr(p.email || 'Utilisateur')}')"
                class="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-indigo-50 transition-all text-left border-b border-slate-50">
                <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0">
                    ${(p.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-center">
                        <p class="font-bold text-sm text-slate-900 truncate">${escapeHtml(p.email || p.id.substring(0, 8))}</p>
                        <span class="text-[9px] text-slate-400 flex-shrink-0">${dateStr}</span>
                    </div>
                    <p class="text-xs text-slate-500 truncate">${escapeHtml(preview)}</p>
                </div>
                ${conv.unread > 0 ? '<span class="w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center flex-shrink-0 notif-pulse">' + conv.unread + '</span>' : ''}
            </button>`;
    }).join('');

    adminViewContainer.innerHTML = `
        <h2 class="text-2xl font-black text-slate-900 mb-6">Messages</h2>
        <div>${convList}</div>`;
}

async function openAdminConversation(partnerId, partnerName) {
    // Mark as read
    const { error: markErr } = await supabase.from('private_messages').update({ is_read: true })
        .eq('sender_id', partnerId).eq('receiver_id', state.user.id).eq('is_read', false);
    if (markErr) console.error('Mark read failed:', markErr.message);
    // Refresh envelope badge
    checkUnreadMessages();

    // Fetch messages
    const { data: messages } = await supabase
        .from('private_messages')
        .select('*')
        .or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${state.user.id})`)
        .order('created_at', { ascending: true });

    const msgHtml = (messages || []).map(m => {
        const isMine = m.sender_id === state.user.id;
        const dateStr = new Date(m.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' ' + new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} group">
                <div class="max-w-[75%] ${isMine ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'} border rounded-2xl p-4">
                    <p class="text-sm text-slate-700 font-medium">${escapeHtml(m.content)}</p>
                    <span class="text-[9px] text-slate-400 mt-1 block">${dateStr}</span>
                </div>
            </div>`;
    }).join('');

    adminViewContainer.innerHTML = `
        <div class="flex items-center gap-4 mb-6">
            <button onclick="window.app.setAdminView('messages')" class="bg-slate-100 p-2 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h2 class="text-xl font-black text-slate-900">${escapeHtml(partnerName)}</h2>
        </div>
        <div id="adminMsgThread" class="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar mb-6 p-2">
            ${msgHtml || '<p class="text-center text-slate-400 text-sm py-8">Aucun message</p>'}
        </div>
        <form onsubmit="window.app.sendAdminReply(event, '${escapeAttr(partnerId)}')" class="flex gap-2">
            <textarea id="admin-msg-input" required rows="1" placeholder="Votre r\u00e9ponse..."
                class="flex-grow bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none"
                onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"
                oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
            <button type="submit" class="bg-indigo-600 text-white px-5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all">Envoyer</button>
        </form>`;

    // Auto-scroll
    const thread = document.getElementById('adminMsgThread');
    if (thread) thread.scrollTop = thread.scrollHeight;

    // Refresh envelope badge
    checkUnreadMessages();
}

async function sendAdminReply(e, receiverId) {
    e.preventDefault();
    const input = document.getElementById('admin-msg-input');
    const content = input.value.trim();
    if (!content) return;

    const { error } = await supabase.from('private_messages').insert({
        sender_id: state.user.id,
        receiver_id: receiverId,
        content: content
    });

    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        const email = (await supabase.from('profiles').select('email').eq('id', receiverId).single()).data?.email || 'Utilisateur';
        openAdminConversation(receiverId, email);
    }
}

// --- ADMIN: CONTENT (FICHES) ---
// --- ADMIN: SECTIONS (CATEGORIES) ---
async function renderAdminSections() {
    adminViewContainer.innerHTML = `<div class="p-20 text-center text-slate-400">Chargement des sections...</div>`;

    const { data, error } = await supabase.from('categories').select('*').order('position');
    if (error) {
        adminViewContainer.innerHTML = `<div class="p-20 text-red-500">Erreur: ${escapeHtml(error.message)}</div>`;
        return;
    }

    const rows = (data || []).map((cat, idx) => `
        <tr class="border-b last:border-0 hover:bg-slate-50/50">
            <td class="py-3 w-10 text-center">
                <div class="flex flex-col gap-0.5">
                    <button onclick="window.app.moveSection(${Number(cat.id)}, 'up')" class="text-slate-300 hover:text-indigo-600 transition-colors ${idx === 0 ? 'invisible' : ''}" title="Monter">
                        <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
                    </button>
                    <span class="text-[9px] font-black text-slate-300">${cat.position != null ? cat.position : '—'}</span>
                    <button onclick="window.app.moveSection(${Number(cat.id)}, 'down')" class="text-slate-300 hover:text-indigo-600 transition-colors ${idx === data.length - 1 ? 'invisible' : ''}" title="Descendre">
                        <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
            </td>
            <td class="py-3">
                <p class="text-slate-900 font-bold text-sm">${escapeHtml(cat.name)}</p>
                <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(cat.slug)}</p>
            </td>
            <td class="py-3 space-x-2">
                <button onclick="window.app.editSection(${Number(cat.id)}, '${escapeAttr(cat.name)}', '${escapeAttr(cat.slug)}', ${cat.position || 0})" class="text-indigo-600 hover:underline text-xs font-bold">Renommer</button>
                <button onclick="window.app.deleteSection(${Number(cat.id)}, '${escapeAttr(cat.name)}')" class="text-red-500 hover:underline text-xs font-bold">Supprimer</button>
            </td>
        </tr>
    `).join('');

    adminViewContainer.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black text-slate-900">Gestion des sections</h2>
            <button onclick="window.app.showSectionForm()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">+ Nouvelle section</button>
        </div>
        <div id="admin-section-form" class="hidden mb-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <input type="hidden" id="admin-section-id">
            <div class="space-y-3">
                <input type="text" id="admin-section-name" placeholder="Nom de la section" class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold">
                <input type="text" id="admin-section-slug" placeholder="Slug (auto-généré si vide)" class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium text-slate-500">
                <input type="number" id="admin-section-position" placeholder="Position (ordre)" class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium" min="0">
                <div class="flex gap-2">
                    <button onclick="window.app.saveSection()" class="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-indigo-700">Enregistrer</button>
                    <button onclick="document.getElementById('admin-section-form').classList.add('hidden')" class="px-6 py-2 text-slate-500 font-bold text-xs">Annuler</button>
                </div>
            </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table class="w-full text-left">
                <thead>
                    <tr class="text-[10px] uppercase font-black text-slate-400 border-b bg-slate-50/50">
                        <th class="py-2 px-2 w-10 text-center">Ordre</th>
                        <th class="py-2 px-2">Nom / Slug</th>
                        <th class="py-2 px-2">Actions</th>
                    </tr>
                </thead>
                <tbody class="text-sm font-medium">${rows}</tbody>
            </table>
        </div>
    `;
}

function showSectionForm(id = null, name = '', slug = '', position = 0) {
    const form = document.getElementById('admin-section-form');
    if (!form) return;
    document.getElementById('admin-section-id').value = id || '';
    document.getElementById('admin-section-name').value = name;
    document.getElementById('admin-section-slug').value = slug;
    document.getElementById('admin-section-position').value = position;
    form.classList.remove('hidden');
}

function editSection(id, name, slug, position) {
    showSectionForm(id, name, slug, position);
}

async function saveSection() {
    const id = document.getElementById('admin-section-id').value;
    const name = document.getElementById('admin-section-name').value.trim();
    let slug = document.getElementById('admin-section-slug').value.trim();
    const position = parseInt(document.getElementById('admin-section-position').value) || 0;

    if (!name) return alert('Le nom de la section est requis.');

    // Auto-generate slug from name if empty
    if (!slug) {
        slug = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    const payload = { name, slug, position };

    let error;
    if (id) {
        const { error: err } = await supabase.from('categories').update(payload).eq('id', id);
        error = err;
    } else {
        const { error: err } = await supabase.from('categories').insert(payload);
        error = err;
    }

    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await fetchCategories();
        renderNav();
        renderAdminSections();
    }
}

async function deleteSection(id, name) {
    // Check if section has resources
    const { count } = await supabase.from('resources').select('*', { count: 'exact', head: true }).eq('category_id', id);
    if (count > 0) {
        if (!confirm(`La section "${name}" contient ${count} fiche(s). Supprimer la section ET toutes ses fiches ?`)) return;
    } else {
        if (!confirm(`Supprimer la section "${name}" ?`)) return;
    }

    // Delete resources in this category first
    if (count > 0) {
        const { error: resErr } = await supabase.from('resources').delete().eq('category_id', id);
        if (resErr) return alert('Erreur suppression des fiches: ' + resErr.message);
    }

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await fetchCategories();
        renderNav();
        fetchAdminStats();
        renderAdminSections();
    }
}

async function moveSection(sectionId, direction) {
    const { data: cats } = await supabase.from('categories').select('id, position').order('position');
    if (!cats) return;

    // Ensure all have a position
    for (let i = 0; i < cats.length; i++) {
        if (cats[i].position == null) {
            await supabase.from('categories').update({ position: (i + 1) * 10 }).eq('id', cats[i].id);
            cats[i].position = (i + 1) * 10;
        }
    }

    const idx = cats.findIndex(c => c.id === sectionId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= cats.length) return;

    const posA = cats[idx].position;
    const posB = cats[swapIdx].position;
    await supabase.from('categories').update({ position: posB }).eq('id', cats[idx].id);
    await supabase.from('categories').update({ position: posA }).eq('id', cats[swapIdx].id);

    await fetchCategories();
    renderNav();
    renderAdminSections();
}

async function renderAdminContent() {
    adminViewContainer.innerHTML = `<div class="p-20 text-center text-slate-400">Chargement des fiches...</div>`;

    const { data: allResources, error } = await supabase.from('resources').select('*, categories(id, name, slug)').order('category_id').order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) {
        adminViewContainer.innerHTML = `<div class="p-20 text-red-500">Erreur: ${escapeHtml(error.message)}</div>`;
        return;
    }

    // Group by category
    const grouped = {};
    for (const r of (allResources || [])) {
        const catName = r.categories?.name || 'Sans catégorie';
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(r);
    }

    let tablesHtml = '';
    for (const [catName, resources] of Object.entries(grouped)) {
        const rows = resources.map((r, idx) => `
            <tr class="border-b last:border-0 hover:bg-slate-50/50" data-id="${r.id}">
                <td class="py-3 w-10 text-center">
                    <div class="flex flex-col gap-0.5">
                        <button onclick="window.app.moveResource(${Number(r.id)}, 'up')" class="text-slate-300 hover:text-indigo-600 transition-colors ${idx === 0 ? 'invisible' : ''}" title="Monter">
                            <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/></svg>
                        </button>
                        <span class="text-[9px] font-black text-slate-300">${r.position != null ? r.position : '—'}</span>
                        <button onclick="window.app.moveResource(${Number(r.id)}, 'down')" class="text-slate-300 hover:text-indigo-600 transition-colors ${idx === resources.length - 1 ? 'invisible' : ''}" title="Descendre">
                            <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>
                </td>
                <td class="py-3">
                    <p class="text-slate-900 font-bold text-sm">${escapeHtml(r.title)}</p>
                </td>
                <td class="py-3 text-slate-400 text-xs">
                    ${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                </td>
                <td class="py-3 space-x-2">
                    <button onclick="window.app.adminEditResource(${Number(r.id)})" class="text-indigo-600 hover:underline text-xs">Éditer</button>
                    <button onclick="window.app.adminDeleteResource(${Number(r.id)})" class="text-red-500 hover:underline text-xs">Supprimer</button>
                </td>
            </tr>
        `).join('');

        tablesHtml += `
            <div class="mb-8">
                <h3 class="text-sm font-black uppercase tracking-widest text-indigo-600 mb-3 flex items-center gap-2">
                    <span class="w-2 h-2 bg-indigo-600 rounded-full"></span> ${escapeHtml(catName)}
                    <span class="text-slate-400 text-[10px] font-bold normal-case">(${resources.length} fiche${resources.length > 1 ? 's' : ''})</span>
                </h3>
                <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="text-[10px] uppercase font-black text-slate-400 border-b bg-slate-50/50">
                                <th class="py-2 px-2 w-10 text-center">Ordre</th>
                                <th class="py-2 px-2">Titre</th>
                                <th class="py-2 px-2">Date</th>
                                <th class="py-2 px-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="text-sm font-medium">${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    adminViewContainer.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black text-slate-900">Gestion des fiches</h2>
            <button onclick="window.app.adminAddResource()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">+ Nouvelle fiche</button>
        </div>
        ${tablesHtml}
    `;
}

async function moveResource(resourceId, direction) {
    // Get all resources in the same category, ordered by position
    const { data: res } = await supabase.from('resources').select('id, category_id, position').eq('id', resourceId).single();
    if (!res) return;

    const { data: siblings } = await supabase.from('resources').select('id, position')
        .eq('category_id', res.category_id)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (!siblings) return;

    // Ensure all have a position
    for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].position == null) {
            await supabase.from('resources').update({ position: (i + 1) * 10 }).eq('id', siblings[i].id);
            siblings[i].position = (i + 1) * 10;
        }
    }

    const idx = siblings.findIndex(s => s.id === resourceId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    // Swap positions
    const posA = siblings[idx].position;
    const posB = siblings[swapIdx].position;
    await supabase.from('resources').update({ position: posB }).eq('id', siblings[idx].id);
    await supabase.from('resources').update({ position: posA }).eq('id', siblings[swapIdx].id);

    renderAdminContent();
}

async function adminAddResource() {
    const cat = state.categories.length > 0 ? state.categories[0] : null;
    if (!cat) return alert('Aucune catégorie disponible.');
    openEditor(null);
}

async function adminEditResource(id) {
    const { data, error } = await supabase.from('resources').select('*').eq('id', id).single();
    if (error || !data) return alert('Fiche introuvable.');

    const cat = state.categories.find(c => c.id === data.category_id);
    if (cat) state.currentCategory = cat.slug;

    // Push into state.resources temporarily so openEditor can find it
    if (!state.resources.find(r => r.id == data.id)) {
        state.resources.push(data);
    }
    openEditor(data.id);
}

async function adminDeleteResource(id) {
    if (!confirm("Supprimer cette fiche définitivement ?")) return;
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) {
        alert("Erreur: " + error.message);
    } else {
        renderAdminContent();
        fetchAdminStats();
    }
}

// --- ADMIN: NEWS ---
async function renderAdminNews() {
    adminViewContainer.innerHTML = `<div class="p-20 text-center text-slate-400">Chargement des news...</div>`;

    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (error) {
        adminViewContainer.innerHTML = `<div class="p-20 text-red-500">Erreur: ${escapeHtml(error.message)}</div>`;
        return;
    }

    adminViewContainer.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black text-slate-900">Gestion des actualités</h2>
            <button onclick="window.app.openNewsEditor()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">+ Nouvelle news</button>
        </div>
        <div class="space-y-2">
            ${(data || []).map(n => `
                <div class="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-slate-900">${escapeHtml(n.title)}</p>
                        ${n.content ? `<p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(n.content.replace(/<[^>]*>/g, '').substring(0, 80))}</p>` : '<p class="text-xs text-slate-400 italic mt-0.5">Pas de contenu</p>'}
                        <p class="text-[10px] text-slate-400 mt-0.5">${n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.app.openNewsEditor(${Number(n.id)})" class="text-indigo-600 hover:underline text-xs font-bold">Éditer</button>
                        <button onclick="window.app.deleteNews(${Number(n.id)})" class="text-red-500 hover:underline text-xs font-bold">Supprimer</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}


async function deleteNews(id) {
    if (!confirm('Supprimer cette news ?')) return;
    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await fetchNews();
        renderNews();
        renderAdminNews();
        fetchAdminStats();
    }
}

// --- ADMIN: LINKS ---
async function renderAdminLinks() {
    adminViewContainer.innerHTML = `<div class="p-20 text-center text-slate-400">Chargement des liens...</div>`;

    const { data, error } = await supabase.from('links').select('*').order('position');
    if (error) {
        adminViewContainer.innerHTML = `<div class="p-20 text-red-500">Erreur: ${escapeHtml(error.message)}</div>`;
        return;
    }

    adminViewContainer.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black text-slate-900">Gestion des liens</h2>
            <button onclick="window.app.showLinkForm()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">+ Nouveau lien</button>
        </div>
        <div id="admin-link-form" class="hidden mb-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <input type="hidden" id="admin-link-id">
            <div class="space-y-3">
                <input type="text" id="admin-link-label" placeholder="Label du lien" class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold">
                <input type="url" id="admin-link-url" placeholder="https://..." class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium">
                <input type="number" id="admin-link-position" placeholder="Position (ordre)" class="w-full px-4 py-3 border rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium" min="0">
                <div class="flex gap-2">
                    <button onclick="window.app.saveLink()" class="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-black hover:bg-indigo-700">Enregistrer</button>
                    <button onclick="document.getElementById('admin-link-form').classList.add('hidden')" class="px-6 py-2 text-slate-500 font-bold text-xs">Annuler</button>
                </div>
            </div>
        </div>
        <div class="space-y-2">
            ${(data || []).map(lk => `
                <div class="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    <div>
                        <p class="font-bold text-slate-900">${escapeHtml(lk.label)}</p>
                        <p class="text-[10px] text-indigo-500 truncate max-w-xs">${escapeHtml(lk.url || '')}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.app.editLink(${Number(lk.id)}, '${escapeAttr(lk.label)}', '${escapeAttr(lk.url || '')}', ${lk.position || 0})" class="text-indigo-600 hover:underline text-xs font-bold">Éditer</button>
                        <button onclick="window.app.deleteLink(${Number(lk.id)})" class="text-red-500 hover:underline text-xs font-bold">Supprimer</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function showLinkForm(id = null, label = '', url = '', position = 0) {
    const form = document.getElementById('admin-link-form');
    if (!form) return;
    document.getElementById('admin-link-id').value = id || '';
    document.getElementById('admin-link-label').value = label;
    document.getElementById('admin-link-url').value = url;
    document.getElementById('admin-link-position').value = position;
    form.classList.remove('hidden');
}

function editLink(id, label, url, position) {
    showLinkForm(id, label, url, position);
}

async function saveLink() {
    const id = document.getElementById('admin-link-id').value;
    const label = document.getElementById('admin-link-label').value.trim();
    const url = document.getElementById('admin-link-url').value.trim();
    const position = parseInt(document.getElementById('admin-link-position').value) || 0;

    if (!label) return alert('Le label est requis.');

    const payload = { label, url, position };

    let error;
    if (id) {
        const { error: err } = await supabase.from('links').update(payload).eq('id', id);
        error = err;
    } else {
        const { error: err } = await supabase.from('links').insert(payload);
        error = err;
    }

    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await fetchLinks();
        renderLinks();
        renderAdminLinks();
    }
}

async function deleteLink(id) {
    if (!confirm('Supprimer ce lien ?')) return;
    const { error } = await supabase.from('links').delete().eq('id', id);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await fetchLinks();
        renderLinks();
        renderAdminLinks();
    }
}

// --- MOBILE MENU ---
function toggleMobileMenu() {
    const panel = document.getElementById('mobile-menu-panel');
    const overlay = document.getElementById('mobile-menu-overlay');
    if (!panel || !overlay) return;
    const isOpen = !panel.classList.contains('translate-x-full');
    if (isOpen) {
        closeMobileMenu();
    } else {
        panel.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileMenu() {
    const panel = document.getElementById('mobile-menu-panel');
    const overlay = document.getElementById('mobile-menu-overlay');
    if (panel) panel.classList.add('translate-x-full');
    if (overlay) overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

// --- COMMUNITY ---
const COMMUNITY_EMOJIS = ['😀','😂','🤣','😍','🥰','😎','🤔','💡','🔥','👏','💪','🎯','🚀','✅','❤️','👍','👎','🙏','😅','🤩','😤','🤯','💬','📌','⚡','🎉','👀','💻','📚','🧠'];

function toggleEmojiPicker(textareaId) {
    const existing = document.getElementById('emoji-picker-panel');
    if (existing) { existing.remove(); return; }

    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const btn = textarea.closest('form')?.querySelector('.emoji-trigger');

    const panel = document.createElement('div');
    panel.id = 'emoji-picker-panel';
    panel.className = 'absolute bottom-full mb-2 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50 grid grid-cols-10 gap-1 animate-fade-in';
    panel.style.width = '280px';
    panel.innerHTML = COMMUNITY_EMOJIS.map(e =>
        `<button type="button" onclick="window.app.insertEmoji('${textareaId}','${e}')" class="w-6 h-6 flex items-center justify-center text-base hover:bg-slate-100 rounded-lg transition-all hover:scale-125">${e}</button>`
    ).join('');

    const wrapper = btn?.closest('.relative') || textarea.closest('.relative') || textarea.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(panel);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                panel.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 10);
}

function insertEmoji(textareaId, emoji) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + emoji + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    textarea.focus();
    document.getElementById('emoji-picker-panel')?.remove();
}

async function openCommunity() {
    state.currentCategory = null;
    state.activeResource = null;
    clearSearch();
    renderNav();
    emptyState.classList.add('hidden');
    resourceDisplay.classList.remove('hidden');
    resourceList.innerHTML = '';

    // Fetch community posts (comments with resource_id IS NULL)
    const { data: posts, error } = await supabase
        .from('comments')
        .select('*')
        .is('resource_id', null)
        .order('created_at', { ascending: false });

    if (error) {
        resourceDisplay.innerHTML = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-12 text-center animate-fade-in">
                <div class="text-5xl mb-6 opacity-20">🗣️</div>
                <h2 class="text-2xl font-black text-slate-900 mb-3 tracking-tight">Communauté</h2>
                <p class="text-slate-500 font-medium text-sm">Erreur de chargement: ${escapeHtml(error.message)}</p>
            </div>`;
        return;
    }

    const allPosts = posts || [];
    const parents = allPosts.filter(c => !c.parent_id);
    const replies = allPosts.filter(c => c.parent_id);
    const count = parents.length;

    let postsHtml = '';
    for (const post of parents) {
        const initial = (post.author_name || 'U').charAt(0).toUpperCase();
        const postReplies = replies.filter(r => r.parent_id === post.id);
        const dateStr = new Date(post.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) + ' à ' + new Date(post.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const canDelete = post.user_id === state.user.id || state.isAdmin;

        postsHtml += `
            <div class="group border-b border-slate-100 pb-6 mb-6 last:border-0 last:pb-0 last:mb-0">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center font-black text-emerald-600 text-sm">${initial}</div>
                        <div>
                            <p class="text-sm font-black text-slate-800 leading-none">${escapeHtml(post.author_name || 'Utilisateur')}</p>
                            <p class="text-[10px] font-bold text-slate-300 uppercase tracking-tighter mt-1">${dateStr}</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        ${canDelete ? `<button onclick="window.app.deleteCommunityPost('${post.id}')" class="text-red-400 text-[10px] font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity">Supprimer</button>` : ''}
                        <button onclick="document.getElementById('community-reply-${post.id}').classList.toggle('hidden')" class="text-emerald-600 text-[10px] font-black uppercase">Répondre</button>
                    </div>
                </div>
                <p class="text-sm ml-[52px] font-medium leading-relaxed text-slate-600 whitespace-pre-line">${escapeHtml(post.content)}</p>
                <div id="community-reply-${post.id}" class="hidden ml-[52px] mt-4">
                    <form onsubmit="window.app.postCommunityComment(event, '${post.id}')">
                        <div class="bg-slate-50 rounded-xl p-2 border border-slate-100 shadow-inner">
                            <textarea id="community-reply-text-${post.id}" required rows="2" class="community-reply-text w-full bg-transparent border-none p-2 text-xs font-medium outline-none text-slate-700" placeholder="Votre réponse..."></textarea>
                            <div class="flex justify-between items-center p-1">
                                <div class="relative">
                                    <button type="button" class="emoji-trigger text-slate-400 hover:text-slate-600 transition-colors text-sm px-1" onclick="window.app.toggleEmojiPicker('community-reply-text-${post.id}')" title="Emoji">😊</button>
                                </div>
                                <button type="submit" class="bg-emerald-600 text-white font-black py-1.5 px-4 rounded-lg text-[9px] uppercase active:scale-95 transition-all">Répondre</button>
                            </div>
                        </div>
                    </form>
                </div>`;

        for (const rep of postReplies) {
            const repInitial = (rep.author_name || 'U').charAt(0).toUpperCase();
            const repDate = new Date(rep.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' à ' + new Date(rep.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const canDeleteRep = rep.user_id === state.user.id || state.isAdmin;
            postsHtml += `
                <div class="ml-[52px] mt-3 pl-4 border-l-2 border-emerald-100 group/rep">
                    <div class="flex justify-between items-center mb-1">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 bg-emerald-50 rounded-full flex items-center justify-center font-black text-emerald-500 text-[9px]">${repInitial}</div>
                            <span class="text-xs font-black text-slate-800">${escapeHtml(rep.author_name || 'Utilisateur')}</span>
                            <span class="text-[8px] font-bold text-slate-300 uppercase">${repDate}</span>
                        </div>
                        ${canDeleteRep ? `<button onclick="window.app.deleteCommunityPost('${rep.id}')" class="text-red-300 text-[8px] font-black uppercase opacity-0 group-hover/rep:opacity-100 transition-opacity">Supprimer</button>` : ''}
                    </div>
                    <p class="text-xs text-slate-500 font-medium ml-8 whitespace-pre-line">${escapeHtml(rep.content)}</p>
                </div>`;
        }
        postsHtml += `</div>`;
    }

    resourceDisplay.innerHTML = `
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-10 animate-fade-in">
            <div class="flex items-center gap-3 mb-2">
                <h2 class="text-2xl font-black text-slate-900 tracking-tight">🗣️ Communauté</h2>
                <span class="bg-emerald-100 text-emerald-600 text-xs px-3 py-1 rounded-full font-black">${count} sujet${count > 1 ? 's' : ''}</span>
            </div>
            <p class="text-sm text-slate-400 font-medium mb-8">Échangez librement avec les autres formateurs. Partagez vos questions, retours d'expérience et astuces.</p>

            <form onsubmit="window.app.postCommunityComment(event, null)" class="mb-10">
                <div class="bg-slate-50 rounded-2xl p-2 border border-slate-100 shadow-inner">
                    <textarea id="community-text" required rows="3"
                        class="w-full bg-transparent border-none p-3 text-sm font-medium outline-none placeholder-slate-400"
                        placeholder="Lancez un sujet de discussion..."></textarea>
                    <div class="flex justify-between items-center p-2">
                        <div class="relative">
                            <button type="button" class="emoji-trigger text-slate-400 hover:text-slate-600 transition-colors text-lg px-2" onclick="window.app.toggleEmojiPicker('community-text')" title="Ajouter un emoji">😊</button>
                        </div>
                        <button type="submit"
                            class="bg-emerald-600 text-white font-black py-2 px-6 rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-700 shadow-md active:scale-95 transition-all">
                            Publier
                        </button>
                    </div>
                </div>
            </form>

            <div class="space-y-0">
                ${postsHtml || '<p class="text-center text-slate-400 font-medium py-10">Aucune discussion pour le moment. Soyez le premier à lancer un sujet !</p>'}
            </div>
        </div>`;
}

async function postCommunityComment(e, parentId) {
    e.preventDefault();
    const textarea = parentId
        ? e.target.querySelector('.community-reply-text')
        : document.getElementById('community-text');
    const content = textarea.value.trim();
    if (!content) return;

    const email = state.user.email || '';
    const name = email.split('@')[0] || 'Utilisateur';

    const payload = {
        resource_id: null,
        user_id: state.user.id,
        author_name: name,
        content: content,
        parent_id: parentId || null
    };

    const { error } = await supabase.from('comments').insert(payload);
    if (error) {
        alert('Erreur: ' + error.message);
    } else {
        await openCommunity();
    }
}

async function deleteCommunityPost(commentId) {
    if (!confirm('Supprimer ce message ?')) return;
    await supabase.from('comments').delete().eq('parent_id', commentId);
    await supabase.from('comments').delete().eq('id', commentId);
    await openCommunity();
}

// --- EXPOSE TO WINDOW ---
window.app = {
    loadCategory,
    loadResource,
    openEditor,
    deleteResource,
    setAdminView,
    toggleAdmin,
    adminAddResource,
    adminEditResource,
    adminDeleteResource,
    openNewsEditor,
    deleteNews,
    showLinkForm,
    editLink,
    saveLink,
    deleteLink,
    switchAuthTab,
    togglePwd,
    validatePwd,
    postComment,
    deleteComment,
    saveNote,
    openMessages,
    sendMessage,
    deleteMessage,
    closeMessages,
    goHome,
    toggleFavorite,
    openFavorites,
    loadResourceFromAnywhere,
    openAllNotes,
    openAllNews,
    openLinkPopup,
    openMobileLinks,
    openSettings,
    changePassword,
    showResetPassword,
    logoutFromPending,
    startPayment,
    toggleSubscription,
    openLegal,
    editorInsertTag,
    deleteUser,
    openAdminConversation,
    sendAdminReply,
    openEnvelopeMessages,
    openCommunity,
    postCommunityComment,
    deleteCommunityPost,
    toggleEmojiPicker,
    insertEmoji,
    toggleMobileMenu,
    closeMobileMenu,
    moveResource,
    clearSearchAndResults,
    showSectionForm,
    editSection,
    saveSection,
    deleteSection,
    moveSection
};

function openEnvelopeMessages() {
    if (state.isAdmin) {
        // Admin: open admin console on messages tab
        adminConsole.classList.remove('hidden');
        fetchAdminStats();
        setAdminView('messages');
    } else {
        // Student: open conversation with Marc
        openMessages();
    }
}

const legalPages = {
    mentions: `<h1 class="text-2xl font-black text-slate-900 mb-6 tracking-tight">Mentions L\u00e9gales</h1><div class="lesson-content text-sm"><h2>\u00c9diteur du site</h2><p>Le site <strong>Jeu de Prompts</strong> est \u00e9dit\u00e9 par :</p><p><strong>Marc ASSI</strong><br>Entrepreneur individuel (auto-entrepreneur)<br>SIRET : 523 628 279 00029<br>Adresse : 2 rue Georges Charpak, 92160 Antony, France<br>Email : <a href="mailto:marcassi92@gmail.com">marcassi92@gmail.com</a><br>Non assujetti \u00e0 la TVA (article 293 B du CGI)</p><h2>Directeur de la publication</h2><p>Marc ASSI</p><h2>H\u00e9bergement</h2><p><strong>GitHub Pages</strong> (fichiers statiques)<br>GitHub, Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, \u00c9tats-Unis</p><p><strong>Supabase</strong> (base de donn\u00e9es et authentification)<br>Supabase, Inc., 970 Toa Payoh North #07-04, Singapore 318992</p><p><strong>Stripe</strong> (paiements)<br>Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Irlande</p><h2>Propri\u00e9t\u00e9 intellectuelle</h2><p>L\u2019ensemble du contenu de ce site (textes, images, logos, vid\u00e9os, prompts, fiches, structure et design) est prot\u00e9g\u00e9 par le droit d\u2019auteur et reste la propri\u00e9t\u00e9 exclusive de Marc ASSI. Toute reproduction, diffusion ou exploitation, m\u00eame partielle, est strictement interdite sans autorisation \u00e9crite pr\u00e9alable.</p></div>`,

    confidentialite: `<h1 class="text-2xl font-black text-slate-900 mb-6 tracking-tight">Politique de Confidentialit\u00e9</h1><div class="lesson-content text-sm"><p><em>Derni\u00e8re mise \u00e0 jour : 17 mars 2025</em></p><h2>Responsable du traitement</h2><p>Marc ASSI, 2 rue Georges Charpak, 92160 Antony.<br>Contact : <a href="mailto:marcassi92@gmail.com">marcassi92@gmail.com</a></p><h2>Donn\u00e9es collect\u00e9es</h2><ul><li><strong>Inscription :</strong> nom, email, mot de passe (chiffr\u00e9 par Supabase Auth)</li><li><strong>Utilisation :</strong> fiches consult\u00e9es, notes, commentaires, messages, favoris</li><li><strong>Paiement :</strong> trait\u00e9 par Stripe. Aucune donn\u00e9e bancaire stock\u00e9e chez nous.</li></ul><h2>Finalit\u00e9s</h2><ul><li>G\u00e9rer votre compte et acc\u00e8s</li><li>Personnaliser votre exp\u00e9rience (progression, notes, favoris)</li><li>Messagerie avec l\u2019administrateur</li><li>G\u00e9rer votre abonnement</li></ul><p>Nous ne vendons jamais vos donn\u00e9es.</p><h2>Sous-traitants</h2><ul><li><strong>Supabase</strong> : h\u00e9bergement et auth</li><li><strong>Stripe</strong> : paiements</li><li><strong>GitHub</strong> : h\u00e9bergement fichiers</li></ul><h2>Dur\u00e9e de conservation</h2><ul><li>Donn\u00e9es de compte : tant que le compte est actif, puis 3 ans</li><li>Donn\u00e9es de paiement : conserv\u00e9es par Stripe (10 ans)</li></ul><h2>Vos droits (RGPD)</h2><p>Acc\u00e8s, rectification, suppression, portabilit\u00e9, opposition. Contact : <a href="mailto:marcassi92@gmail.com">marcassi92@gmail.com</a></p><p>R\u00e9clamation possible aupr\u00e8s de la <strong>CNIL</strong>, 3 Place de Fontenoy, 75007 Paris.</p><h2>Cookies</h2><p>Uniquement des cookies techniques (session Supabase). Aucun cookie publicitaire.</p></div>`,

    cgu: `<h1 class="text-2xl font-black text-slate-900 mb-6 tracking-tight">Conditions G\u00e9n\u00e9rales d\u2019Utilisation</h1><div class="lesson-content text-sm"><p><em>Derni\u00e8re mise \u00e0 jour : 17 mars 2025</em></p><h2>Article 1. Objet</h2><p>Les pr\u00e9sentes CGU r\u00e9gissent l\u2019utilisation de <strong>Jeu de Prompts</strong>, \u00e9dit\u00e9 par Marc ASSI. Jeu de Prompts est un assistant IA pour formateurs proposant fiches, prompts, workflows et espace communautaire.</p><h2>Article 2. Acc\u00e8s</h2><p>L\u2019acc\u00e8s au contenu n\u00e9cessite un compte valid\u00e9 et un abonnement actif.</p><h2>Article 3. Inscription</h2><p>L\u2019utilisateur fournit des informations exactes. Chaque compte est personnel et ne peut \u00eatre partag\u00e9.</p><h2>Article 4. Utilisation du contenu</h2><p>Le contenu est destin\u00e9 \u00e0 un usage personnel et professionnel. Il est interdit de :</p><ul><li>Reproduire ou redistribuer le contenu</li><li>Partager ses identifiants</li><li>Revendre le contenu sans autorisation</li></ul><h2>Article 5. Commentaires et messagerie</h2><p>L\u2019utilisateur respecte les r\u00e8gles de courtoisie. Tout contenu injurieux pourra \u00eatre supprim\u00e9. L\u2019administrateur peut suspendre un compte en cas de manquement.</p><h2>Article 6. Responsabilit\u00e9</h2><p>Marc ASSI ne saurait \u00eatre tenu responsable des r\u00e9sultats obtenus suite \u00e0 l\u2019utilisation des prompts, ni des interruptions techniques.</p><h2>Article 7. Propri\u00e9t\u00e9 intellectuelle</h2><p>Tous les contenus sont prot\u00e9g\u00e9s par le droit d\u2019auteur, propri\u00e9t\u00e9 de Marc ASSI.</p><h2>Article 8. Modification</h2><p>Les CGU peuvent \u00eatre modifi\u00e9es \u00e0 tout moment. Les utilisateurs seront notifi\u00e9s.</p><h2>Article 9. Droit applicable</h2><p>Droit fran\u00e7ais. Tribunaux de Nanterre.</p></div>`,

    cgv: `<h1 class="text-2xl font-black text-slate-900 mb-6 tracking-tight">Conditions G\u00e9n\u00e9rales de Vente</h1><div class="lesson-content text-sm"><p><em>Derni\u00e8re mise \u00e0 jour : 17 mars 2025</em></p><h2>Article 1. Objet</h2><p>Les pr\u00e9sentes CGV r\u00e9gissent la vente d\u2019abonnements \u00e0 <strong>Jeu de Prompts</strong>, \u00e9dit\u00e9 par Marc ASSI (SIRET : 523 628 279 00029).</p><h2>Article 2. Services</h2><p>L\u2019abonnement donne acc\u00e8s \u00e0 toutes les fiches, prompts, nouveaux contenus, notes personnelles, favoris, messagerie et commentaires.</p><h2>Article 3. Tarifs</h2><ul><li><strong>Mensuel :</strong> 9,90 \u20ac TTC / mois</li><li><strong>Annuel :</strong> 99 \u20ac TTC / an (soit 8,25 \u20ac/mois)</li></ul><p>TVA non applicable (article 293 B du CGI).</p><h2>Article 4. Paiement</h2><p>Paiement en ligne par carte via <strong>Stripe</strong>. Aucune donn\u00e9e bancaire stock\u00e9e sur nos serveurs.</p><h2>Article 5. Dur\u00e9e et renouvellement</h2><p>Renouvellement automatique par tacite reconduction, sauf r\u00e9siliation.</p><h2>Article 6. R\u00e9siliation</h2><p>R\u00e9siliation \u00e0 tout moment par email (<a href="mailto:marcassi92@gmail.com">marcassi92@gmail.com</a>) ou messagerie interne. Prend effet \u00e0 la fin de la p\u00e9riode en cours.</p><h2>Article 7. R\u00e9tractation</h2><p>Marc ASSI rembourse int\u00e9gralement tout abonn\u00e9 insatisfait qui en fait la demande dans les <strong>14 jours</strong> suivant la souscription.</p><h2>Article 8. Acc\u00e8s</h2><p>Acc\u00e8s activ\u00e9 manuellement sous 24h apr\u00e8s r\u00e9ception du paiement.</p><h2>Article 9. Responsabilit\u00e9</h2><p>Marc ASSI fournit un contenu de qualit\u00e9 mais ne saurait \u00eatre tenu responsable des r\u00e9sultats obtenus.</p><h2>Article 10. Litiges</h2><p>Droit fran\u00e7ais. Tribunaux de Nanterre. M\u00e9diation possible (article L612-1 du Code de la consommation).</p></div>`
};

function editorInsertTag(open, close) {
    const q = getQuill();
    if (!q) return;
    const range = q.getSelection(true);
    if (range && range.length > 0) {
        // Wrap selected text
        const selectedText = q.getText(range.index, range.length);
        q.deleteText(range.index, range.length);
        q.insertText(range.index, open + selectedText + close, Quill.sources.USER);
    } else {
        // Insert at cursor with placeholder
        const pos = range ? range.index : q.getLength();
        const placeholder = close ? open + 'texte' + close : open;
        q.insertText(pos, placeholder, Quill.sources.USER);
    }
}

function openLegal(page) {
    const content = legalPages[page];
    if (!content) return;

    const tabs = Object.entries(legalPages).map(([key, _]) => {
        const names = { mentions: 'Mentions', confidentialite: 'Confidentialit\u00e9', cgu: 'CGU', cgv: 'CGV' };
        const isActive = key === page;
        return '<button onclick="window.app.openLegal(\'' + key + '\')" class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ' +
            (isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-indigo-600') + '">' + (names[key] || key) + '</button>';
    }).join('');

    // Remove existing modal
    document.getElementById('legalModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'legalModal';
    modal.className = 'fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm p-4 lg:p-6 overflow-y-auto flex items-start justify-center';
    modal.onclick = (e) => { if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; } };
    modal.innerHTML = `
        <div class="max-w-3xl w-full bg-white rounded-[2.5rem] shadow-2xl p-6 lg:p-10 modal-enter mt-6 lg:mt-10">
            <div class="flex justify-between items-center mb-6">
                <div class="flex flex-wrap gap-2">${tabs}</div>
                <button onclick="document.getElementById('legalModal').remove(); document.body.style.overflow='';" class="text-slate-400 font-black text-xl hover:text-slate-900 transition-colors ml-4">&times;</button>
            </div>
            <div class="max-h-[70vh] overflow-y-auto custom-scrollbar">${content}</div>
        </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

const STRIPE_LINKS = {
    monthly: 'https://buy.stripe.com/5kQ3cu9iV0AlgeCezB1ZS0K',
    yearly: 'https://buy.stripe.com/bJe3cu0MpbeZ3rQ6351ZS0L',
    portal: 'https://billing.stripe.com/p/login/dRm6oG66Jerb1jI7791ZS00'
};

function startPayment(plan) {
    // Open Stripe directly — no account required to pay
    window.open(STRIPE_LINKS[plan], '_blank');
}

// START
try {
    checkUser();
} catch(e) {
    console.error('Init error:', e);
    document.body.innerHTML = '<div style="padding:2rem;color:red;font-weight:bold">Erreur init: ' + e.message + '</div>';
}
