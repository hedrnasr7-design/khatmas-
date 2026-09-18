// متغير عام مبكر؛ بعض الأجهزة تبدأ الرسم قبل الوصول إلى قسم إعدادات الوقت.
var iraqTimeZone = 'Asia/Baghdad';

const firebaseConfig = {
            apiKey: "AIzaSyBkuwbP5WxIBxv5iWY5TRy3zOtPGvsEoZg",
            authDomain: "khatmas-app.firebaseapp.com",
            databaseURL: "https://khatmas-app-default-rtdb.firebaseio.com",
            projectId: "khatmas-app",
            storageBucket: "khatmas-app.firebasestorage.app",
            messagingSenderId: "361576127533",
            appId: "1:361576127533:web:4e5b4947c2b6581596eca4"
        };
        const GEMINI_VISION_MODEL = 'gemini-3.6-flash';
        const GEMINI_VISION_FALLBACK_MODEL = 'gemini-3.6-flash';
const ADMIN_EMAIL = "hedrnasr7@gmail.com";
firebase.initializeApp(firebaseConfig);
try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (error) {}
const db = firebase.database();
const DATABASE_URL = firebaseConfig.databaseURL;
function isAdminSessionActive() {
    const user = firebase.auth().currentUser;
    return accessMode === 'admin' && !!user && String(user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

async function requireAdminSession() {
    let user = firebase.auth().currentUser;
    if (!user) {
        user = await new Promise(resolve => {
            let done = false;
            const unsubscribe = firebase.auth().onAuthStateChanged(value => { if (!done) { done = true; unsubscribe(); resolve(value); } });
            setTimeout(() => { if (!done) { done = true; unsubscribe(); resolve(null); } }, 5000);
        });
    }
    if (!user || String(user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        const error = new Error('يجب تسجيل دخول المشرف أولًا'); error.code = 'auth/admin-required'; throw error;
    }
    try { await user.getIdToken(true); } catch (error) { console.warn('تعذر تحديث رمز المشرف:', error); }
    return user;
}

const OPEN_ACCESS_CODES = ['95380269'];
const ACCESS_CODES = ['02785172', '17426829', '19599238', '22806730', '24394586', '24828828', '26312970', '27303608', '30448555', '32420656', '33669313', '47247030', '47716431', '56620980', '58964006', '68644639', '72459701', '85033576', '90469917', '92217887'];
const ACCESS_VERSION = 'numeric-local-v3';
const ACCESS_STORAGE_KEY = 'khatmas_access_mode';
const ACCESS_CREDENTIAL_KEY = 'khatmas_numeric_access_credential';
const DEVICE_ID_KEY = 'khatmas_device_id';
const savedAccessCookie = document.cookie.split('; ').find(item => item.startsWith('khatmas_numeric_access_mode='));
let accessMode = '';
let activeAccessCode = '';
let activeAccessVersion = 0;
let accessValidationPending = false;
function getDeviceId() {
    try { let id = localStorage.getItem(DEVICE_ID_KEY); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_ID_KEY,id); } return id; } catch(e) { return `device-${Date.now()}`; }
}
function normalizeAccessDigits(value) {
    return String(value || '').replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
}
try { const saved = JSON.parse(localStorage.getItem(ACCESS_CREDENTIAL_KEY) || 'null'); if (saved?.code) { activeAccessCode=saved.code; activeAccessVersion=Number(saved.version)||0; accessValidationPending=true; } else { activeAccessCode = localStorage.getItem(ACCESS_CREDENTIAL_KEY) || ''; } accessMode = activeAccessCode ? 'full' : ''; } catch (error) {}
if (!accessMode && savedAccessCookie) { try { activeAccessCode = decodeURIComponent(savedAccessCookie.split('=')[1]); accessMode = activeAccessCode ? 'full' : ''; } catch (error) {} }
function restoreUnlockedApp() { if (activeAccessCode) { accessMode='full'; applyAccessMode('full'); } return accessMode; }
async function claimAccessCode(code) {
    const normalized = normalizeAccessDigits(String(code || '').normalize('NFKC')).replace(/\D/g, '').slice(0, 8);
    const matchedOpen = OPEN_ACCESS_CODES.includes(normalized) ? normalized : '';
    const matchedSingle = ACCESS_CODES.includes(normalized) ? normalized : '';
    const canonical = matchedOpen || matchedSingle;
    const isOpen = Boolean(matchedOpen);
    if (!canonical || !/^\d{8}$/.test(canonical)) throw new Error('الرمز غير صحيح.');
    const deviceId = getDeviceId();
    const key = `khatmas_local_code_${canonical}`;
    let value = {};
    try { value = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { value = {}; }
    if (value.enabled === false) throw new Error('هذا الكود موقوف.');
    if (!isOpen && value.deviceId && value.deviceId !== deviceId) throw new Error('هذا الكود مستخدم على جهاز آخر.');
    value = { ...value, enabled:true, open:isOpen, deviceId:isOpen ? null : (value.deviceId || deviceId), claimedAt:value.claimedAt || Date.now() };
    localStorage.setItem(key, JSON.stringify(value));
    return { code:canonical, version:Number(value.resetVersion)||0 };
}
async function validateAccessCodeOnline(code, version=0) {
    if (!code) return true;
    try { const value=JSON.parse(localStorage.getItem(`khatmas_local_code_${code}`) || 'null'); return Boolean(value) && value.enabled !== false && (Number(value.resetVersion)||0) === Number(version); } catch(e) { return false; }
}
async function validateStoredAccess() {
    if (!activeAccessCode) return true;
    const ok=await validateAccessCodeOnline(activeAccessCode,activeAccessVersion);
    if (!ok) { activeAccessCode=''; activeAccessVersion=0; accessMode=''; accessValidationPending=false; try { localStorage.removeItem(ACCESS_CREDENTIAL_KEY); sessionStorage.removeItem(ACCESS_STORAGE_KEY); localStorage.removeItem(ACCESS_STORAGE_KEY); } catch(e) {} applyAccessMode(''); const gate=document.getElementById('accessGate'); if(gate){gate.style.display='flex';gate.style.visibility='visible';gate.style.pointerEvents='auto';} return false; }
    accessValidationPending=false;
    return true;
}
if (localStorage.getItem('khatmas_access_version') !== ACCESS_VERSION) localStorage.setItem('khatmas_access_version', ACCESS_VERSION);
let appStarted = false;

function unlockScreenRotation() {
    try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') screen.orientation.unlock();
    } catch (error) {}
}
unlockScreenRotation();
window.addEventListener('orientationchange', unlockScreenRotation);

function applyAccessMode(mode) {
    accessMode = mode;
    if (mode === 'admin') {
        // دخول المشرف لا يلغي فتح التطبيق؛ نحتفظ بوضع full ليستمر بعد تحديث الصفحة.
        try { localStorage.setItem(ACCESS_STORAGE_KEY, 'full'); sessionStorage.setItem(ACCESS_STORAGE_KEY, 'full'); } catch (error) {}
        localStorage.setItem('khatmas_access_version', ACCESS_VERSION);
        document.cookie = `khatmas_access_mode=full; max-age=31536000; path=/; SameSite=Lax`;
    } else if (mode) {
        localStorage.setItem(ACCESS_STORAGE_KEY, mode);
        try { sessionStorage.setItem(ACCESS_STORAGE_KEY, mode); } catch (error) {}
        localStorage.setItem('khatmas_access_version', ACCESS_VERSION);
        document.cookie = `khatmas_access_mode=${encodeURIComponent(mode)}; max-age=31536000; path=/; SameSite=Lax`;
    }
    document.body.classList.toggle('limited-mode', mode === 'limited');
    document.body.classList.toggle('tabs-only-mode', mode === 'tabsOnly');
    document.body.classList.toggle('admin-mode', mode === 'admin');
    document.body.classList.toggle('access-ready', Boolean(mode));
    document.body.classList.toggle('capture-guard', mode !== 'admin');
    const gate = document.getElementById('accessGate');
    if (gate) gate.style.display = mode ? 'none' : 'flex';
    const adminButton = document.getElementById('adminFloatingButton');
    if (adminButton) adminButton.style.display = mode === 'admin' ? 'flex' : 'none';
}

function updateCaptureGuardVisibility() {
    if (accessMode === 'admin') return;
    document.body.classList.toggle('window-obscured', document.visibilityState !== 'visible' || document.hidden);
}
document.addEventListener('visibilitychange', updateCaptureGuardVisibility);
window.addEventListener('blur', () => { if (accessMode !== 'admin') document.body.classList.add('window-obscured'); });
window.addEventListener('focus', updateCaptureGuardVisibility);
document.addEventListener('keydown', event => {
    if (accessMode === 'admin') return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'printscreen' || (event.ctrlKey && ['p', 's', 'u', 'c'].includes(key)) || (event.metaKey && ['p', 's', 'c'].includes(key))) {
        event.preventDefault();
        event.stopPropagation();
    }
});

function startAppAfterAccess() {
    if (appStarted || !accessMode || accessValidationPending) return;
    appStarted = true;
    loadGlobalThemeSettings().catch(error => console.warn('تعذر تحميل المظهر المركزي بعد فتح التطبيق:', error));
    initializeOfflineFirstApp().catch(error => {
        console.error('فشل تشغيل التطبيق:', error);
        stopLoadingProgress();
        const loader = document.getElementById('loadingBoxContainer');
        if (loader) loader.innerHTML = '<div>تعذر تحميل البيانات. اضغط تحديث الصفحة أو تحقق من الاتصال.</div>';
    });
    // يبدأ المستخدم من الواجهة الرئيسية، ثم بالسحب يسارًا: النصية، المصورة، المفضلة.
    // لا نعيد الصفحة تلقائيًا عند التحديث؛ تبقى الصفحة الحالية محفوظة.
    // إعادة تفعيل التخزين المؤقت والعمل دون اتصال بعد أول تحميل ناجح.
    if ('storage' in navigator && 'persist' in navigator.storage) navigator.storage.persist().catch(() => {});
    // تم تعطيل Service Worker القديم لأنه لم يعد موجودًا في المستودع.
}


window.addEventListener('pageshow', () => {
    restoreUnlockedApp();
    if (!accessMode) {
        try { accessMode = localStorage.getItem(ACCESS_STORAGE_KEY) || sessionStorage.getItem(ACCESS_STORAGE_KEY) || ''; } catch (error) {}
        if (!accessMode && savedAccessCookie) { try { accessMode = decodeURIComponent(savedAccessCookie.split('=')[1]); } catch (error) {} }
    }
    if (accessMode === 'full' && !appStarted) {
        validateStoredAccess().then(ok => { if (ok && accessMode === 'full' && !appStarted) { applyAccessMode('full'); startAppAfterAccess(); } });
    }
    setTimeout(async () => {
        if (typeof filterKhatmas === 'function') filterKhatmas();
        if (typeof loadCachedData === 'function' && Object.keys(allKhatmas || {}).length === 0) { const ok = await loadCachedData(); if (ok) renderCurrentData(); }
    }, 700);
});

window.addEventListener('load', () => {
    if (!accessMode) return;
    if (!appStarted) startAppAfterAccess();
    setTimeout(() => {
        // لا نعيد الصفحة إلى الصفر عند تحديث الصفحة.
        if (typeof arrangeHomeSections === 'function' && (!document.body.dataset.appPage || document.body.dataset.appPage === '1')) arrangeHomeSections();
        if (typeof window.filterKhatmas === 'function') window.filterKhatmas();
        if (typeof renderDateBar === 'function') renderDateBar();
        if (typeof syncDataFromNetwork === 'function' && Object.keys(allKhatmas || {}).length === 0) syncDataFromNetwork();
    }, 900);
});

window.activateAccessCode = async () => {
    const value = String(document.getElementById('accessCodeInput')?.value || '').trim().toUpperCase();
    const status = document.getElementById('accessGateStatus');
    if (status) status.textContent = 'جارٍ التحقق من الكود...';
    try {
        const claimed = await claimAccessCode(value);
        activeAccessCode = claimed.code; activeAccessVersion = claimed.version; accessValidationPending=false;
        accessMode='full';
        localStorage.setItem(ACCESS_CREDENTIAL_KEY, JSON.stringify(claimed));
        applyAccessMode('full');
        document.cookie = `khatmas_numeric_access_mode=${encodeURIComponent(activeAccessCode)}; max-age=31536000; path=/; SameSite=Lax`;
        if (status) status.textContent = '';
        requestAnimationFrame(() => startAppAfterAccess());
    } catch (error) { if (status) status.textContent = error.message || 'تعذر تفعيل الكود.'; }
};

window.loadAccessCodesAdmin = async () => {
    const box=document.getElementById('accessCodesAdminList'); if(!box) return;
    try { box.value=[...ACCESS_CODES,...OPEN_ACCESS_CODES].map(code=>{ let v={}; try { v=JSON.parse(localStorage.getItem(`khatmas_local_code_${code}`)||'{}'); } catch(e) {} return `${code} | ${v.enabled===false?'موقوف':'فعال'} | ${v.deviceId?'مرتبط بهذا الجهاز':'غير مستخدم'}`; }).join('\n'); } catch(e) { box.value='تعذر تحميل حالة الأكواد.'; }
};
window.disableAccessCode = async () => { const code=normalizeAccessDigits(document.getElementById('accessCodeToDisable')?.value||'').replace(/\D/g,'').slice(0,8); const status=document.getElementById('accessCodesAdminStatus'); if(!ACCESS_CODES.includes(code) && !OPEN_ACCESS_CODES.includes(code)){if(status)status.textContent='اكتب كودًا صحيحًا.';return;} try { const key=`khatmas_local_code_${code}`; let v={}; try {v=JSON.parse(localStorage.getItem(key)||'{}');} catch(e) {} localStorage.setItem(key,JSON.stringify({...v,enabled:false})); if(status)status.textContent='تم إيقاف الكود على هذا الجهاز.'; loadAccessCodesAdmin(); } catch(e){if(status)status.textContent='تعذر الإيقاف.';} };
window.enableAccessCode = async () => { const code=normalizeAccessDigits(document.getElementById('accessCodeToDisable')?.value||'').replace(/\D/g,'').slice(0,8); const status=document.getElementById('accessCodesAdminStatus'); if(!ACCESS_CODES.includes(code) && !OPEN_ACCESS_CODES.includes(code)){if(status)status.textContent='اكتب كودًا صحيحًا.';return;} try { const key=`khatmas_local_code_${code}`; let v={}; try {v=JSON.parse(localStorage.getItem(key)||'{}');} catch(e) {} localStorage.setItem(key,JSON.stringify({...v,enabled:true,resetVersion:(Number(v.resetVersion)||0)+1})); if(status)status.textContent='تم تفعيل الكود على هذا الجهاز؛ سيُطلب إدخاله مرة أخرى.'; loadAccessCodesAdmin(); } catch(e){if(status)status.textContent='تعذر التفعيل.';} };
window.openAdminPanel = window.openAdminPanel || (async () => {
    const loginBox = document.getElementById('adminLoginBox');
    if (loginBox) loginBox.style.display = 'flex';
});
window.submitAdminLogin = window.submitAdminLogin || (async () => {
    const passwordInput = document.getElementById('adminPasswordInput');
    const status = document.getElementById('adminLoginStatus');
    const password = passwordInput?.value || '';
    if (!password) { if (status) status.textContent = 'أدخل كلمة المرور أولًا.'; return; }
    if (status) status.textContent = 'جارٍ تسجيل الدخول...';
    try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        await firebase.auth().signInWithEmailAndPassword(ADMIN_EMAIL, password);
        applyAccessMode('admin');
        startAppAfterAccess();
        if (document.getElementById('adminLoginBox')) document.getElementById('adminLoginBox').style.display = 'none';
        if (passwordInput) passwordInput.value = '';
        if (status) status.textContent = '';
        setTimeout(() => { if (typeof filterKhatmas === 'function') filterKhatmas(); if (typeof renderAdminLists === 'function') renderAdminLists(allKhatmas); }, 300);
    } catch (error) {
        console.error('فشل تسجيل دخول المشرف:', error);
        if (status) status.textContent = 'تعذر تسجيل الدخول: ' + (error.code || 'تحقق من كلمة المرور والاتصال.');
    }
});
window.openAdminWithoutCode = () => {
    // قد يضغط المشرف على الصورة قبل انتهاء تحميل التطبيق؛ ابدأ الواجهة أولًا ثم أظهر تسجيل الدخول.
    if (typeof window.openAdminPanel === 'function') { window.openAdminPanel(); return; }
    applyAccessMode('full');
    startAppAfterAccess();
    setTimeout(() => {
        if (typeof window.openAdminPanel === 'function') window.openAdminPanel();
        else {
            const loginBox = document.getElementById('adminLoginBox');
            if (loginBox) loginBox.style.display = 'flex';
        }
    }, 700);
};

window.openAdminShortcut = () => {
    const form = document.getElementById('adminForm');
    const user = firebase.auth().currentUser;
    if (accessMode === 'admin' && user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() && form) {
        form.style.display = 'block';
        renderAdminLists(allKhatmas);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    window.openAdminPanel();
};

restoreUnlockedApp();
if (accessMode) {
    applyAccessMode(accessMode);
    // استئناف تشغيل التطبيق بعد تحديث الصفحة باستخدام جلسة الدخول المحفوظة.
    // allKhatmas وبقية المتغيرات تُعرّف أسفل هذا الجزء من الملف.
    setTimeout(startAppAfterAccess, 0);
}
firebase.auth().onAuthStateChanged(user => {
    if (user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        applyAccessMode('admin');
        startAppAfterAccess();
        // إعادة رسم البطاقات والتبويبات بعد وصول جلسة Firebase؛ عندها فقط تُفعّل خصائص السحب للمشرف.
        setTimeout(() => { if (typeof filterKhatmas === 'function') filterKhatmas(); }, 0);
    } else if (accessMode === 'admin' && navigator.onLine !== false) {
        accessMode = '';
        localStorage.removeItem(ACCESS_STORAGE_KEY);
        document.body.classList.remove('admin-mode');
    }
});

        let allKhatmas = {};
        let favorites = JSON.parse(localStorage.getItem('user_favorites')) || [];
        let loaderTimer = null;
        let syncInProgress = false;
        let lastSyncAttempt = 0;
        let displayedSimilarGroups = [];
        let similarScanHasRun = false;
        let deletedKhatmaKeys = new Set(JSON.parse(localStorage.getItem('deleted_khatma_keys') || '[]'));
        const GITHUB_AUDIO_REPO = 'hedrnasr7-design/khatmas-';
        const GITHUB_AUDIO_PATH = 'background-audio.mp3';
        const BACKGROUND_AUDIO_URL = './background-audio.mp3';
        let backgroundAudioObjectUrl = null;
        let audioInteractionBound = false;

        function rememberDeletedKhatma(key) {
            deletedKhatmaKeys.add(key);
            localStorage.setItem('deleted_khatma_keys', JSON.stringify([...deletedKhatmaKeys]));
        }

        function removeDeletedKhatmaFromData(data) {
            const filtered = { ...(data || {}) };
            deletedKhatmaKeys.forEach(key => delete filtered[key]);
            return filtered;
        }

        function updateBackgroundAudioButton() {
            const audio = document.getElementById('backgroundAudio');
            const button = document.getElementById('backgroundAudioToggle');
            if (!audio || !button) return;
            const hasSource = Boolean(audio.src);
            button.style.display = hasSource ? 'block' : 'none';
            button.innerText = !audio.paused ? '⏸' : '▶';
            button.title = !audio.paused ? 'إيقاف المقطع الصوتي' : 'تشغيل المقطع الصوتي';
            button.setAttribute('aria-label', button.title);
        }

        async function tryStartBackgroundAudio() {
            const audio = document.getElementById('backgroundAudio');
            if (!audio || !audio.src || localStorage.getItem('background_audio_enabled') === 'false') return;
            try {
                await audio.play();
            } catch (error) {
                // تمنع المتصفحات التشغيل التلقائي حتى يحدث تفاعل من المستخدم.
            }
            updateBackgroundAudioButton();
        }

        function bindAudioInteraction() {
            if (audioInteractionBound) return;
            audioInteractionBound = true;
            const start = () => tryStartBackgroundAudio();
            document.addEventListener('pointerdown', start, { passive: true });
            document.addEventListener('keydown', start, { passive: true });
        }

        async function applyBackgroundAudio(settings, cachedRecord = null) {
            const audio = document.getElementById('backgroundAudio');
            if (!audio || !settings || !settings.url) return;
            if (backgroundAudioObjectUrl) URL.revokeObjectURL(backgroundAudioObjectUrl);
            backgroundAudioObjectUrl = null;
            if (cachedRecord && cachedRecord.blob) {
                backgroundAudioObjectUrl = URL.createObjectURL(cachedRecord.blob);
                audio.src = backgroundAudioObjectUrl;
            } else {
                audio.src = settings.url;
            }
            audio.loop = true;
            audio.onplay = updateBackgroundAudioButton;
            audio.onpause = updateBackgroundAudioButton;
            updateBackgroundAudioButton();
            bindAudioInteraction();
            await tryStartBackgroundAudio();
        }

        async function loadBackgroundAudio() {
            try {
                let remoteAudioUrl = BACKGROUND_AUDIO_URL;
                try {
                    const metaResponse = await fetch(`https://api.github.com/repos/${GITHUB_AUDIO_REPO}/contents/${GITHUB_AUDIO_PATH}`, { cache: 'no-store' });
                    if (metaResponse.ok) {
                        const metadata = await metaResponse.json();
                        if (metadata.sha) remoteAudioUrl = `https://raw.githubusercontent.com/${GITHUB_AUDIO_REPO}/main/${GITHUB_AUDIO_PATH}?v=${metadata.sha}`;
                    }
                } catch (error) {}
                let cachedRecord = await OfflineStore.getAudio('background').catch(() => null);
                if (!cachedRecord || cachedRecord.url !== remoteAudioUrl) {
                    const audioResponse = await fetch(remoteAudioUrl, { cache: 'no-store' });
                    if (audioResponse.ok) {
                        const blob = await audioResponse.blob();
                        cachedRecord = { url: remoteAudioUrl, blob, name: 'background-audio.mp3' };
                        await OfflineStore.putAudio('background', cachedRecord);
                    }
                }
                await applyBackgroundAudio({ url: remoteAudioUrl }, cachedRecord);
            } catch (error) {
                console.warn('تعذر تحميل المقطع الصوتي العام:', error);
                const cachedRecord = await OfflineStore.getAudio('background').catch(() => null);
                if (cachedRecord?.blob) await applyBackgroundAudio({ url: cachedRecord.url }, cachedRecord);
            }
        }

        window.toggleBackgroundAudio = async () => {
            const audio = document.getElementById('backgroundAudio');
            if (!audio || !audio.src) return;
            if (audio.paused) {
                localStorage.setItem('background_audio_enabled', 'true');
                await tryStartBackgroundAudio();
            } else {
                localStorage.setItem('background_audio_enabled', 'false');
                audio.pause();
                updateBackgroundAudioButton();
            }
        };

        window.uploadAudioToGitHub = async () => {
            const token = document.getElementById('githubAudioToken')?.value.trim();
            const input = document.getElementById('githubAudioInput');
            const status = document.getElementById('githubAudioStatus');
            const file = input?.files?.[0];
            if (!token) { if (status) status.innerText = 'ألصق رمز GitHub أولًا.'; return; }
            if (!file) { if (status) status.innerText = 'اختر ملفًا صوتيًا أولًا.'; return; }
            if (!file.type.startsWith('audio/')) { if (status) status.innerText = 'الملف المختار ليس ملفًا صوتيًا.'; return; }
            if (file.size > 25 * 1024 * 1024) { if (status) status.innerText = 'حجم الملف أكبر من 25 ميغابايت.'; return; }
            try {
                if (status) status.innerText = 'جارٍ تجهيز الملف وقراءة النسخة الحالية...';
                const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
                const apiUrl = `https://api.github.com/repos/${GITHUB_AUDIO_REPO}/contents/${GITHUB_AUDIO_PATH}`;
                const existingResponse = await fetch(apiUrl, { headers, cache: 'no-store' });
                let sha = null;
                if (existingResponse.ok) sha = (await existingResponse.json()).sha;
                else if (existingResponse.status !== 404) throw new Error(`GitHub ${existingResponse.status}: ${(await existingResponse.text()).slice(0, 180)}`);
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result).split(',')[1]);
                    reader.onerror = () => reject(new Error('تعذر قراءة الملف الصوتي.'));
                    reader.readAsDataURL(file);
                });
                if (status) status.innerText = 'جارٍ رفع المقطع إلى GitHub...';
                const body = { message: 'Update background audio', content: base64, branch: 'main' };
                if (sha) body.sha = sha;
                const uploadResponse = await fetch(apiUrl, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const result = await uploadResponse.json();
                if (!uploadResponse.ok) throw new Error(`GitHub ${uploadResponse.status}: ${result.message || 'تعذر الرفع'}`);
                const remoteUrl = `https://raw.githubusercontent.com/${GITHUB_AUDIO_REPO}/main/${GITHUB_AUDIO_PATH}?v=${result.content?.sha || Date.now()}`;
                await OfflineStore.putAudio('background', { url: remoteUrl, blob: file, name: file.name });
                await applyBackgroundAudio({ url: remoteUrl }, { url: remoteUrl, blob: file, name: file.name });
                if (input) input.value = '';
                if (document.getElementById('githubAudioToken')) document.getElementById('githubAudioToken').value = '';
                if (status) status.innerText = 'تم رفع المقطع إلى GitHub. سيظهر للجميع بعد تحديث GitHub Pages.';
            } catch (error) {
                console.error('فشل رفع المقطع إلى GitHub:', error);
                if (status) status.innerText = 'تعذر الرفع: ' + (error.message || 'تحقق من الرمز والصلاحيات.');
            }
        };

        function toArabicNum(n) {
            return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
        }

        async function askGeminiToReadImage(apiKey, imageSource, prompt) {
            const dataUrlMatch = String(imageSource || '').match(/^data:([^;,]+);base64,(.+)$/s);
            const mimeType = dataUrlMatch?.[1] || 'image/jpeg';
            const base64Data = dataUrlMatch?.[2] || String(imageSource || '').replace(/^data:[^,]+,/, '');
            let lastError = null;

            for (const model of [...new Set([GEMINI_VISION_MODEL, GEMINI_VISION_FALLBACK_MODEL])]) {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [
                                    { text: prompt },
                                    { inline_data: { mime_type: mimeType, data: base64Data } }
                                ] }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 220 }
                            })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                            const apiError = new Error(result.error?.message || `Gemini API ${response.status}`);
                            apiError.status = response.status;
                            throw apiError;
                        }
                        const text = (result.candidates?.[0]?.content?.parts || [])
                            .map(part => part.text || '').join(' ').trim();
                        if (!text) throw new Error('لم تُرجع Gemini نصًا من الصورة');
                        return text;
                    } catch (error) {
                        lastError = error;
                        const retryable = [429, 500, 502, 503, 504].includes(error.status);
                        if (!retryable || attempt === 3) break;
                        await new Promise(resolve => setTimeout(resolve, attempt * 2500));
                    }
                }
            }
            throw lastError || new Error('تعذر الاتصال بخدمة Gemini');
        }

function explainGeminiRenameError(error) {
            const message = String(error?.message || '');
            const status = error?.status;
            if (status === 400 || /API key not valid|invalid argument|invalid api key/i.test(message)) return 'مفتاح Gemini غير صالح أو غير مفعّل لخدمة Gemini API.';
            if (status === 401 || status === 403 || /permission|unauthorized|forbidden|permission denied/i.test(message)) return 'مفتاح Gemini لا يملك صلاحية استخدام النموذج أو أن تقييد المواقع يمنع GitHub Pages.';
            if (status === 429 || /quota|rate limit|too many requests/i.test(message)) return 'تم تجاوز حصة Gemini أو حد الطلبات. انتظر قليلًا أو استخدم مفتاحًا بحصة متاحة.';
            if (/blocked|safety/i.test(message)) return 'رفض Gemini الصورة بسبب سياسة الأمان.';
            return message || 'تعذر الاتصال بخدمة Gemini. تحقق من الإنترنت ومفتاح API.';
        }

        window.onload = () => {
            const savedKey = localStorage.getItem('gemini_api_key');
            if (savedKey) {
                document.getElementById('geminiApiKeyInput').value = savedKey;
            }
        };

        function saveGeminiKey() {
            const val = document.getElementById('geminiApiKeyInput').value.trim();
            if(!val) return alert("الرجاء إدخال مفتاح صحيح!");
            localStorage.setItem('gemini_api_key', val);
            alert("تم حفظ مفتاح Gemini API بنجاح!");
        }

        // دالة الإدخال الصوتي لحقول الإدارة
        function startDictation(targetId) {
            if (window.hasOwnProperty('webkitSpeechRecognition') || window.hasOwnProperty('SpeechRecognition')) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = "ar-IQ";

                recognition.onresult = function(e) {
                    const transcript = e.results[0][0].transcript.trim();
                    const targetField = document.getElementById(targetId);

                    if (targetId === 'singleTitle') {
                        const currentValue = targetField.value;
                        const match = currentValue.match(/^([\d٠-٩]+\s*[-–—]\s*)/);

                        if (match) {
                            targetField.value = match[1] + transcript;
                        } else {
                            targetField.value = transcript;
                        }
                    } else {
                        targetField.value += (targetField.value ? "\n" : "") + transcript;
                    }
                    recognition.stop();
                };

                recognition.onerror = function(e) {
                    recognition.stop();
                    alert("حدث خطأ أثناء الاستماع، تأكد من صلاحيات الميكروفون.");
                };

                recognition.start();
            } else {
                alert("متصفحك لا يدعم خاصية الإدخال الصوتي.");
            }
        }

        // دالة البحث الصوتي المخصصة لخانة البحث الرئيسية
        function startSearchDictation() {
            if (window.hasOwnProperty('webkitSpeechRecognition') || window.hasOwnProperty('SpeechRecognition')) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.lang = "ar-IQ";

                recognition.onstart = function() {
                    console.log("جاري الاستماع للبحث الصوتي...");
                };

                recognition.onresult = function(e) {
                    const transcript = e.results[0][0].transcript.trim();
                    const searchInput = document.getElementById('searchInput');
                    searchInput.value = transcript;
                    filterKhatmas();
                    recognition.stop();
                };

                recognition.onerror = function(e) {
                    recognition.stop();
                    alert("حدث خطأ أثناء البحث الصوتي، تأكد من صلاحيات الميكروفون.");
                };

                recognition.start();
            } else {
                alert("متصفحك لا يدعم خاصية البحث الصوتي.");
            }
        }

        function updateProgressUI(percent) {
            const percentEl = document.getElementById('progressPercent');
            const fillEl = document.getElementById('progressBarFill');
            if (percentEl && fillEl) {
                percentEl.innerText = percent;
                fillEl.style.width = percent + '%';
            }
        }


        function startLoadingProgress() {
            if (loaderTimer) clearInterval(loaderTimer);
            const loader = document.getElementById('loadingBoxContainer');
            if (loader) loader.style.display = 'block';
            let p = 0;
            updateProgressUI(p);
            loaderTimer = setInterval(() => {
                if (p < 90 && Object.keys(allKhatmas).length === 0) {
                    p += 10;
                    updateProgressUI(p);
                }
            }, 180);
        }

        function stopLoadingProgress() {
            if (loaderTimer) {
                clearInterval(loaderTimer);
                loaderTimer = null;
            }
            updateProgressUI(100);
            const loader = document.getElementById('loadingBoxContainer');
            if (loader) loader.style.display = 'none';
        }

        function renderCurrentData() {
            filterKhatmas();
            renderAdminLists(allKhatmas);
            // قد تصل البيانات قبل تهيئة إعدادات التوقيت في الأجهزة البطيئة.
            // لا نسمح لهذا الجزء بإيقاف عرض الختمات نفسها.
            try { renderTodayKhatmas(); } catch (error) {
                console.warn('تأجيل رسم ختمات اليوم حتى اكتمال التهيئة:', error);
                setTimeout(() => { try { renderTodayKhatmas(); } catch (retryError) { console.warn('تعذر رسم ختمات اليوم:', retryError); } }, 0);
            }
        }

        async function loadCachedData() {
            try {
                const cachedData = await OfflineStore.getAllKhatmas();
                if (Object.keys(cachedData).length > 0) {
                    allKhatmas = removeDeletedKhatmaFromData(cachedData);
                    stopLoadingProgress();
                    renderCurrentData();
                    return true;
                }

                const legacyData = JSON.parse(localStorage.getItem('offline_khatmas_perfect') || 'null');
                if (legacyData && Object.keys(legacyData).length > 0) {
                    allKhatmas = legacyData;
                    await OfflineStore.replaceAllKhatmas(legacyData);
                    localStorage.removeItem('offline_khatmas_perfect');
                    stopLoadingProgress();
                    renderCurrentData();
                    return true;
                }
            } catch (error) {
                console.error('تعذر قراءة البيانات المحلية:', error);
            }
    return false;
        }

        async function mergeLocalTopicOverrides(data) {
            const merged = data || {};
            try {
                const local = await OfflineStore.getAllKhatmas();
                Object.entries(local || {}).forEach(([key, record]) => {
                    const topic = String(record?.customTopic || '').trim();
                    if (topic && merged[key]) merged[key].customTopic = topic;
                });
            } catch (error) { console.warn('تعذر دمج التصنيفات المحلية:', error); }
            try {
                const pending = JSON.parse(localStorage.getItem('pending_topic_moves') || '[]');
                pending.forEach(item => {
                    const topic = String(item?.topic || '').trim();
                    if (topic && merged[item?.key]) merged[item.key].customTopic = topic;
                });
            } catch (error) { console.warn('تعذر قراءة النقل المحلي المؤقت:', error); }
            return merged;
        }

        async function mergeRemoteTopicOverrides(data) {
            const merged = data || {};
            try {
                const snapshot = await db.ref('khatmas').once('value');
                const remoteKhatmas = snapshot.val() || {};
                Object.entries(remoteKhatmas).forEach(([key, record]) => {
                    const topic = String(record?.customTopic || '').trim();
                    if (topic && merged[key]) merged[key].customTopic = topic;
                });
            } catch (error) { console.warn('تعذر تحميل نقل المواضيع المركزي:', error); }
            return merged;
        }

	async function syncDataFromNetwork() {
            // تحميل الأجزاء بالتوازي حتى لا ينتظر المستخدم انتهاء كل ملف بالتتابع.
            if (syncInProgress) return;
            syncInProgress = true;
            lastSyncAttempt = Date.now();
            try {
                const merged = {};
                const parts = await Promise.all(Array.from({ length: 6 }, (_, index) => {
                    const part = index + 1;
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 30000);
                    return fetch(`./khatmas-index-${part}.json?v=113`, { cache: 'no-store', signal: controller.signal })
                        .then(response => {
                            if (!response.ok) throw new Error(`الجزء ${part}: HTTP ${response.status}`);
                            return response.json();
                        })
                        .finally(() => clearTimeout(timeout));
                }));
	                for (const data of parts) Object.assign(merged, data || {});
	                if (Object.keys(merged).length === 0) throw new Error('ملفات الختمات المجزأة فارغة');
                allKhatmas = removeDeletedKhatmaFromData(await mergeLocalTopicOverrides(await mergeRemoteTopicOverrides(merged)));
                stopLoadingProgress();
                renderCurrentData();
                try {
                    await OfflineStore.replaceAllKhatmas(allKhatmas);
                    await OfflineStore.setMeta('last-successful-sync', new Date().toISOString());
                } catch (storageError) { console.warn('تعذر حفظ النسخة المحلية، لكن البيانات عُرضت:', storageError); }
            } catch (partsError) {
                console.warn('تعذر تحميل الأجزاء المحلية، ستتم تجربة Firebase:', partsError);
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 30000);
                    const response = await fetch(`${DATABASE_URL}/khatmas.json`, { cache: 'no-store', signal: controller.signal });
                    clearTimeout(timeout);
                    if (!response.ok) throw new Error(`Firebase HTTP ${response.status}`);
                    const data = (await response.json()) || {};
                    if (!Object.keys(data).length) throw new Error('بيانات Firebase فارغة');
                    allKhatmas = removeDeletedKhatmaFromData(await mergeLocalTopicOverrides(await mergeRemoteTopicOverrides(data)));
                    stopLoadingProgress();
                    renderCurrentData();
                } catch (error) {
                    console.error('تعذر تحميل بيانات الختمات:', error);
                    stopLoadingProgress();
                    if (Object.keys(allKhatmas || {}).length === 0) {
                        try { await loadCachedData(); } catch (cacheError) { console.warn('تعذر قراءة النسخة المحلية:', cacheError); }
                    }
                    if (Object.keys(allKhatmas || {}).length === 0) {
                        renderCurrentData();
                        const loader = document.getElementById('loadingBoxContainer');
                        if (loader) loader.innerHTML = '<div>تعذر تحميل الختمات. تحقق من الاتصال ثم أعد المحاولة.</div><button type="button" onclick="location.reload()">إعادة المحاولة</button>';
                    }
                }
            } finally { syncInProgress = false; }
        }
async function initializeOfflineFirstApp() {
            startLoadingProgress();
            let restored = false;
            try { restored = await Promise.race([loadCachedData(), new Promise(resolve => setTimeout(() => resolve(false), 3000))]); } catch (error) { console.warn('تعذر استعادة النسخة المحلية:', error); }
            if (restored) renderCurrentData(); else { stopLoadingProgress(); renderCurrentData(); }
            // إعادة المحاولة بعد التحديث إذا تأخر IndexedDB أو استيقظ الهاتف من حالة تعليق.
            setTimeout(async () => {
                if (Object.keys(allKhatmas).length === 0) {
                    const recovered = await loadCachedData();
                    if (recovered) renderCurrentData();
                }
                stopLoadingProgress();
            }, 1200);
            // لا نؤخر الواجهة بانتظار الشبكة؛ التحديث يعمل في الخلفية.
            if (navigator.onLine !== false) syncDataFromNetwork();
            loadBackgroundAudio();
        }

        function syncIfDue() {
            if (Date.now() - lastSyncAttempt >= 60000) syncDataFromNetwork();
        }

        window.syncKhatmasFromNetwork = syncDataFromNetwork;
        window.addEventListener('online', syncDataFromNetwork);
window.addEventListener('online', async () => {
    try {
        const pending = JSON.parse(localStorage.getItem('pending_topic_moves') || '[]');
        if (!pending.length || !firebase.auth().currentUser) return;
        const remaining = [];
        for (const item of pending) {
            try { await db.ref(`khatmas/${item.key}/customTopic`).set(item.topic); }
            catch (error) { remaining.push(item); }
        }
        localStorage.setItem('pending_topic_moves', JSON.stringify(remaining));
        if (!remaining.length && typeof filterKhatmas === 'function') filterKhatmas();
    } catch (error) { console.warn('تعذر إعادة إرسال النقل المعلق:', error); }
});

        window.addEventListener('focus', syncIfDue);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') syncIfDue();
        });
        setInterval(syncIfDue, 5 * 60 * 1000);
        startAppAfterAccess();

        // فتح لوحة الإدارة عند النقر على العنوان الرئيسي بعد تسجيل دخول آمن
        window.openAdminPanel = async () => {
            if (!navigator.onLine) {
                alert("يجب الاتصال بالإنترنت لتسجيل دخول المشرف.");
                return;
            }
            const loginBox = document.getElementById('adminLoginBox');
            if (loginBox) loginBox.style.display = 'flex';
        };

        window.submitAdminLogin = async () => {
            const passwordInput = document.getElementById('adminPasswordInput');
            const status = document.getElementById('adminLoginStatus');
            const password = passwordInput ? passwordInput.value : '';
            if (!password) {
                if (status) status.innerText = 'أدخل كلمة المرور أولًا.';
                return;
            }
            if (status) status.innerText = 'جارٍ تسجيل الدخول...';
            try {
                let user = firebase.auth().currentUser;
                if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                    if (user) await firebase.auth().signOut();
                    try { await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (error) {}
                    const credential = await firebase.auth().signInWithEmailAndPassword(ADMIN_EMAIL, password);
                    user = credential.user;
                }
                applyAccessMode('admin');
                startAppAfterAccess();
                const loginBox = document.getElementById('adminLoginBox');
                if (loginBox) loginBox.style.display = 'none';
                if (passwordInput) passwordInput.value = '';
                if (status) status.innerText = '';
        const form = document.getElementById('adminForm');
        form.style.display = 'block';
        const adminButton = document.getElementById('adminFloatingButton');
        if (adminButton) adminButton.style.display = 'flex';
                renderAdminLists(allKhatmas);
                if (typeof filterKhatmas === 'function') filterKhatmas();
                form.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('فشل تسجيل دخول المشرف:', error);
                if (status) status.innerText = 'تعذر تسجيل الدخول: ' + (error.code || 'تحقق من كلمة المرور والاتصال.');
            }
        };

        // دالة إغلاق لوحة الإدارة وتسجيل خروج المشرف
        async function closeAdminForm() {
            const form = document.getElementById('adminForm');
            form.style.display = 'none';
            try {
                await firebase.auth().signOut();
            } catch (error) {
                console.warn('تعذر تسجيل الخروج:', error);
            }
            document.body.classList.remove('admin-mode');
            const adminButton = document.getElementById('adminFloatingButton');
            if (adminButton) adminButton.style.display = 'none';
            applyAccessMode('full');
            if (typeof filterKhatmas === 'function') filterKhatmas();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function selectAllText() {
            const textarea = document.getElementById('singleContent');
            textarea.select();
            textarea.setSelectionRange(0, 99999);
        }

        function copyText() {
            const textarea = document.getElementById('singleContent');
            textarea.select();
            navigator.clipboard.writeText(textarea.value).then(() => {
                alert("تم نسخ النص بنجاح!");
            });
        }

        function cutText() {
            const textarea = document.getElementById('singleContent');
            textarea.select();
            navigator.clipboard.writeText(textarea.value).then(() => {
                textarea.value = '';
                alert("تم قص النص!");
            });
        }


        function extractNumber(title) {
            if (!title) return 0;
            const match = title.match(/[\d٠-٩]+/);
            if (!match) return 0;
            let val = match[0].replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
            return parseInt(val, 10) || 0;
        }

        // يعيد ترقيم العنوان للعرض فقط، مع إبقاء العنوان المحفوظ كما هو.
        // هذا يمنع ظهور فجوات في تسلسل الختمات المصوّرة بعد حذف صورة متشابهة.
        function renumberImageTitleForDisplay(title, sequence) {
            const originalTitle = String(title || 'بدون عنوان');
            const withoutLeadingNumber = originalTitle.replace(/^\s*[\d٠-٩]+\s*[-_–—.:،)]*\s*/, '');
            return `${toArabicNum(sequence)}_ ${withoutLeadingNumber || originalTitle}`;
        }

        function hasKhatmaImage(record) {
            return Boolean(record && ((record.image && String(record.image).trim()) || record.imagePending));
        }
        async function ensureFullKhatma(key) {
            const record = allKhatmas[key];
            if (!record || !record.imagePending || (record.image && String(record.image).trim())) return record;
            try {
                const response = await fetch(`${DATABASE_URL}/khatmas/${encodeURIComponent(key)}.json`, { cache: 'force-cache' });
                if (!response.ok) throw new Error('تعذر تحميل الختمة');
                const full = await response.json();
                if (full) {
                    allKhatmas[key] = full;
                    await OfflineStore.putKhatma(key, full);
                }
                return allKhatmas[key];
            } catch (error) {
                console.warn('تعذر تحميل محتوى الختمة عند فتحها:', error);
                return record;
            }
        }
        function getImageDisplayTitles(data = allKhatmas) {
            const imageTitles = {};
            const sortedImageKeys = Object.keys(data || {})
                .filter(key => hasKhatmaImage(data[key]))
                .sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));

            sortedImageKeys.forEach((key, index) => {
                imageTitles[key] = renumberImageTitleForDisplay(data[key].title, index + 1);
            });
            return imageTitles;
        }

        let activeTopicByView = { general: 'all', all: 'all', images: 'all', fav: 'all' };
        const topicRules = [
            ['قضاء الحوائج', [/قضاء\s+(?:الحوائج|الحاجة)/g, /للحاج(?:ة|ات)|الحوائج/g]],
            ['الرزق والمال', [/الرزق\s+والمال|رزق\s+وفير|الغنى|الفقر|الديون|الدَّين|التجارة|البيع|الشراء/g]],
            ['الشفاء والصحة', [/الشفاء|شفاء|مريض|المرض|الصحة|العافية|الوجع|الألم/g]],
            ['الزواج والمحبة', [/الزواج|زواج|الزوجة|الزوج|المحبة|المودة|الخطبة/g]],
            ['النجاح والدراسة', [/النجاح|نجاح|الطلاب|امتحان|الدراسة|التوفيق|التميز|الاختبار/g]],
            ['العمل والوظيفة', [/العمل|وظيفة|الوظيف|المهنة|المشروع|العملاء|المعاملات/g]],
            ['المشاكل والهموم', [/المشاكل|مشكلة|مشاكل|الهموم|الهم|الغم|الكرب|الضيق|الحزن|الحيرة/g]],
            ['الحماية ودفع الضرر', [/الحماية|حماية|حسد|عين|سحر|مس|العدو|أعداء|التحصين|دفع\s+البلاء/g]],
            ['السفر والعودة', [/السفر|سفر|مسافر|الطريق|العودة|الغائب|غائب/g]],
            ['الذرية والأطفال', [/الذرية|ذرية|الحمل|حمل|ولادة|مولود|طفل|الأطفال|النسل/g]],
            ['المحاكم والحقوق', [/المحاكم|محكمة|قضية|قضايا|الحقوق|حق|حقوق|خصومة|الشرطة|السجن/g]],
            ['العبادة والقرآن والأدعية', [/القرآن|قرآن|سورة|آية|الدعاء|دعاء|الذكر|ذكر|الصلاة|زيارة|تسبيح|استغفار/g]]
        ];
        function getKhatmaTopics(record) {
            const manual = String(record?.customTopic || '').trim();
            if (manual) return [manual.split(/[،,\n|]+/).map(topic => topic.trim()).filter(Boolean)[0]].filter(Boolean);
            const title = String(record?.title || '').toLocaleLowerCase('ar');
            const content = String(record?.content || '').toLocaleLowerCase('ar');
            const source = `${title}\n${content}`;
            const scores = topicRules.map(([name, patterns]) => {
                let score = 0;
                patterns.forEach(pattern => { const matches = source.match(pattern); score += matches ? matches.length : 0; });
                // عنوان الختمة هو الدليل الأقوى من النص العام.
                patterns.forEach(pattern => { const matches = title.match(pattern); score += matches ? matches.length * 3 : 0; });
                return { name, score };
            }).filter(item => item.score > 0).sort((a,b) => b.score - a.score);
            // موضوع واحد فقط للتصنيف التلقائي، لتجنب التداخل بين الخانات.
            return scores.length ? [scores[0].name] : ['عام ومتفرقات'];
        }
        function getViewRecords(data, view) {
            return Object.fromEntries(Object.entries(data || {}).filter(([, record]) => {
                const hasImage = hasKhatmaImage(record);
                if (view === 'all') return !hasImage;
                if (view === 'images') return hasImage;
                return favorites.includes(arguments[0]);
            }));
        }
        function renderTopicTabs(data, view) {
            const tabs = document.getElementById('topicTabs');
            if (!tabs) return;
            const onKhatmaPage = document.body.classList.contains('app-page-2') || document.body.classList.contains('app-page-3');
            if (!onKhatmaPage || view === 'fav' || view === 'general') {
                tabs.classList.remove('visible'); tabs.innerHTML = ''; return;
            }
            const counts = new Map();
            Object.values(data || {}).forEach(record => getKhatmaTopics(record).forEach(topic => counts.set(topic, (counts.get(topic) || 0) + 1)));
            const topics = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'));
            const active = activeTopicByView[view] || 'all';
            tabs.innerHTML = `<button type="button" class="topic-tab ${active === 'all' ? 'active' : ''}" style="--topic-color:#1b4332;--topic-bg:#e9f5ee" data-topic="all">تسلسل الختمات العام <small>(${Object.keys(data || {}).length})</small></button>` + topics.map(([topic, count]) => `<button type="button" class="topic-tab ${active === topic ? 'active' : ''}" style="--topic-color:${topicColor(topic)};--topic-bg:${topicBackground(topic)}" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)} <small>(${count})</small></button>`).join('');
            tabs.classList.add('visible');
            const adminDragEnabled = isAdminSessionActive();
            tabs.classList.toggle('admin-drag-enabled', adminDragEnabled);
            tabs.querySelectorAll('[data-topic]').forEach(button => {
                button.addEventListener('click', () => { activeTopicByView[view] = button.dataset.topic; filterKhatmas(); });
                if (adminDragEnabled && button.dataset.topic !== 'all') {
                    button.setAttribute('ondragover', 'topicDragOver(event)');
                    button.setAttribute('ondragleave', 'topicDragLeave(event)');
                    button.setAttribute('ondrop', `topicDrop(event, '${button.dataset.topic.replace(/'/g, "\\'")}')`);
                } else {
                    button.removeAttribute('ondragover'); button.removeAttribute('ondragleave'); button.removeAttribute('ondrop');
                }
            });
        };
        window.moveKhatmaToTopic = async function(key) {
            if (!isAdminSessionActive()) { alert('هذه الميزة خاصة بالمشرف. سجّل دخول المشرف أولًا.'); return; }
            const record = allKhatmas[key]; if (!record) return;
            const topics = [...new Set([...topicRules.map(([name]) => name), 'عام ومتفرقات', ...Object.values(allKhatmas).flatMap(r => getKhatmaTopics(r))])];
            const overlay = document.createElement('div'); overlay.className = 'topic-move-overlay';
            overlay.innerHTML = `<div class="topic-move-dialog" dir="rtl"><h3>نقل الختمة إلى موضوع</h3><p>${escapeHtml(record.title || 'الختمة')}</p><select id="topicMoveSelect">${topics.map(t => `<option value="${escapeHtml(t)}" ${getKhatmaTopics(record)[0] === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select><div class="topic-move-actions"><button type="button" id="topicMoveSave">حفظ النقل</button><button type="button" id="topicMoveCancel">إلغاء</button></div><div id="topicMoveStatus"></div></div>`;
            document.body.appendChild(overlay);
            overlay.querySelector('#topicMoveCancel').onclick = () => overlay.remove();
            overlay.querySelector('#topicMoveSave').onclick = async () => {
                const save = overlay.querySelector('#topicMoveSave'), status = overlay.querySelector('#topicMoveStatus'), topic = overlay.querySelector('#topicMoveSelect').value;
                save.disabled = true; status.textContent = 'جارٍ الحفظ...';
                try {
                    await requireAdminSession();
                    status.textContent = 'تم تسجيل الدخول. جارٍ حفظ الموضوع في Firebase...';
                    const savePromise = db.ref(`khatmas/${key}/customTopic`).set(topic);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => { const e = new Error('انتهت مهلة الاتصال'); e.code = 'timeout'; reject(e); }, 15000));
                    await Promise.race([savePromise, timeoutPromise]);
                    status.textContent = 'تم الحفظ في Firebase. جارٍ تحديث الذاكرة والواجهة...';
                    record.customTopic = topic;
                    await OfflineStore.putKhatma(key, record);
                    status.textContent = 'اكتمل النقل والحفظ بنجاح.';
                    save.textContent = 'تم الحفظ ✓'; save.disabled = true;
                    setTimeout(() => { overlay.remove(); filterKhatmas(); if (typeof renderAdminTopicBrowser === 'function') renderAdminTopicBrowser(); }, 650);
                } catch (e) {
                    // لا نضيّع اختيار المشرف: يُحفظ محليًا بانتظار إعادة الإرسال.
                    try {
                        const pending = JSON.parse(localStorage.getItem('pending_topic_moves') || '[]');
                        const item = { key, topic, createdAt: Date.now() };
                        localStorage.setItem('pending_topic_moves', JSON.stringify([...pending.filter(x => x.key !== key), item]));
                        record.customTopic = topic;
                        await OfflineStore.putKhatma(key, record);
                    } catch (localError) { console.warn('تعذر الحفظ المحلي المؤقت:', localError); }
                    save.disabled = false; save.textContent = 'إعادة المحاولة';
                    const code = e.code || 'unknown';
                    const detail = code === 'PERMISSION_DENIED' || code === 'permission-denied' ? 'الصلاحية مرفوضة من قواعد Firebase.' : (code === 'timeout' ? 'انتهت مهلة الاتصال.' : (e.message || 'تحقق من الاتصال.'));
                    status.innerHTML = `لم يكتمل الحفظ في Firebase.<br><small>السبب: ${escapeHtml(detail)} (${escapeHtml(code)})</small><br><small>تم حفظ الاختيار محليًا وسيُعاد إرساله عند عودة الاتصال.</small>`;
                }
            };
        };

        window.renderList = (data, view = 'all') => {
            const container = document.getElementById('listContainer');
            if (!container) return;
            container.dataset.view = view;
            const typeData = Object.fromEntries(Object.entries(data || {}).filter(([key, record]) => {
                const hasImage = hasKhatmaImage(record);
                if (view === 'general') return true;
                if (view === 'all') return !hasImage;
                if (view === 'images') return hasImage;
                return favorites.includes(key);
            }));
            renderTopicTabs(typeData, view);
            container.innerHTML = '';
            const activeTopic = activeTopicByView[view] || 'all';
            const records = Object.entries(typeData).filter(([key, record]) => {
                if (activeTopic !== 'all' && !getKhatmaTopics(record).includes(activeTopic)) return false;
                return true;
            });
            if (!records.length) { container.innerHTML = '<p style="color:#666;">لا توجد ختمات في هذا الموضوع.</p>'; return; }
            const sortedKeys = records.map(([key]) => key).sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));
            const imageDisplayTitles = view === 'images' ? getImageDisplayTitles() : {};
            let htmlContent = '';
            sortedKeys.forEach(key => {
                const hasImage = hasKhatmaImage(data[key]);
                let displayTitle = data[key].title || 'بدون عنوان';
                if (view === 'images') displayTitle = imageDisplayTitles[key] || displayTitle;
                const typeLabel = view === 'general' ? `<small style="display:block; opacity:.72; font-size:12px;">${hasImage ? 'ختمة مصورة' : 'ختمة نصية'}</small>` : '';
                const isFav = favorites.includes(key) ? '❤️' : '🤍';
                const adminMove = isAdminSessionActive() ? `<button type="button" class="topic-move-button" onclick="event.stopPropagation(); moveKhatmaToTopic('${key}')">نقل إلى موضوع</button>` : '';
                htmlContent += `<div class="khatma-item"><div class="khatma-title" onclick="show('${key}')">${escapeHtml(displayTitle)}${typeLabel}</div><span class="khatma-actions">${adminMove}<button onclick="event.stopPropagation(); toggleFav('${key}')" style="background:none; border:none; font-size:20px; cursor:pointer;">${isFav}</button></span></div>`;
            });
            container.innerHTML = htmlContent || '<p style="color:#666;">لا توجد عناصر في هذا القسم.</p>';
        };

        const topicPalette = ['#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#0f766e','#4f46e5'];
        function topicColor(topic) { let n=0; for (const ch of String(topic)) n=(n*31+ch.charCodeAt(0))>>>0; return topicPalette[n % topicPalette.length]; }
        function topicBackground(topic) { const c=topicColor(topic); return c + '12'; }
        window.reclassifyAdminTopics = async () => {
            const status = document.getElementById('adminTopicStatus');
            const button = document.querySelector('button[onclick="reclassifyAdminTopics()"]');
            const originalLabel = button?.textContent || 'إعادة التصنيف التلقائي للنتائج';
            try { await requireAdminSession(); } catch (error) { if (status) status.textContent = 'تعذر البدء: انتهت جلسة المشرف. سجّل الدخول من جديد.'; return; }
            const type = document.getElementById('adminTopicType')?.value || 'all';
            const query = (document.getElementById('adminTopicSearch')?.value || '').trim().toLocaleLowerCase('ar');
            const rows = Object.entries(allKhatmas || {}).filter(([key, record]) => {
                const hasImage = hasKhatmaImage(record);
                if (type !== 'all' && (type === 'images') !== hasImage) return false;
                const text = `${record?.title || ''}\n${record?.content || ''}`.toLocaleLowerCase('ar');
                return !query || text.includes(query);
            });
            if (!rows.length) { if (status) status.textContent = 'انتهى الفحص: لا توجد ختمات مطابقة لإعادة التصنيف.'; return; }
            if (!confirm(`سيتم مسح التصنيف اليدوي وإعادة ${rows.length} ختمة إلى التصنيف التلقائي. هل تريد المتابعة؟`)) { if (status) status.textContent = 'تم إلغاء إعادة التصنيف.'; return; }
            if (button) { button.disabled = true; button.textContent = 'جارٍ إعادة التصنيف...'; button.style.opacity = '0.7'; }
            if (status) status.textContent = `بدأت إعادة التصنيف: تم العثور على ${rows.length} ختمة. جاري الحفظ...`;
            try {
                // الحفظ المتدرج يتوافق مع قواعد Firebase القديمة والجديدة، ويحدد الختمة التي تفشل.
                let completed = 0;
                for (const [key, record] of rows) {
                    try {
                        await db.ref(`khatmas/${key}/customTopic`).remove();
                        record.customTopic = '';
                        await OfflineStore.putKhatma(key, record);
                        completed++;
                        if (status) status.textContent = `جارٍ إعادة التصنيف... ${completed} من ${rows.length}`;
                    } catch (itemError) {
                        itemError.message = `فشل حفظ الختمة ${key}: ${itemError.message}`;
                        throw itemError;
                    }
                }
                renderAdminTopicBrowser();
                if (status) status.textContent = `اكتملت إعادة التصنيف بنجاح: تمت معالجة ${rows.length} ختمة.`;
                alert(`اكتملت إعادة التصنيف بنجاح. تمّت معالجة ${rows.length} ختمة.`);
            } catch (error) { console.error(error); if (status) status.textContent = `توقفت العملية قبل الاكتمال: ${error.code || error.message || 'تحقق من صلاحيات قاعدة البيانات.'}`; alert(`تعذر إعادة التصنيف: ${error.code || error.message || 'تحقق من صلاحيات قاعدة البيانات.'}\n\nيجب نشر قواعد Firebase التي تسمح للمشرف بالكتابة.`); }
            finally { if (button) { button.disabled = false; button.textContent = originalLabel; button.style.opacity = '1'; } }
        };
        let draggedTopicKhatma = null;
        let longPressTimer = null;
        let touchDragActive = false;
        let touchDragGhost = null;
        let touchDragPointerId = null;
        function topicDragStart(event, key) {
            if (!isAdminSessionActive()) { event.preventDefault(); return; }
            draggedTopicKhatma = key;
            event.currentTarget.classList.add('topic-dragging');
            if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', key); }
        }
        function clearTopicDragVisuals() {
            document.querySelectorAll('.topic-dragging,.topic-drop-over').forEach(el => { el.classList.remove('topic-dragging'); el.classList.remove('topic-drop-over'); });
            if (touchDragGhost) { touchDragGhost.remove(); touchDragGhost = null; }
            document.body.classList.remove('topic-touch-dragging');
        }
        function topicDragEnd(event) { event.currentTarget.classList.remove('topic-dragging'); draggedTopicKhatma = null; clearTopicDragVisuals(); }
        function topicDragOver(event) { event.preventDefault(); event.currentTarget.classList.add('topic-drop-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
        function topicDragLeave(event) { event.currentTarget.classList.remove('topic-drop-over'); }
        async function topicDrop(event, topic) {
            event.preventDefault();
            if (!isAdminSessionActive()) return;
            event.stopPropagation(); event.currentTarget.classList.remove('topic-drop-over');
            const key = draggedTopicKhatma || event.dataTransfer?.getData('text/plain');
            draggedTopicKhatma = null;
            if (!key || !allKhatmas[key] || String(topic).trim() === 'all') { clearTopicDragVisuals(); return; }
            const record = allKhatmas[key], previous = record.customTopic || '';
            if (previous.trim() === topic.trim()) { clearTopicDragVisuals(); return; }
            try {
                await requireAdminSession();
                const customTopic = topic.trim();
                await db.ref(`khatmas/${key}/customTopic`).set(customTopic);
                record.customTopic = customTopic;
                await OfflineStore.putKhatma(key, record);
                clearTopicDragVisuals();
                renderAdminTopicBrowser();
                if (typeof filterKhatmas === 'function') filterKhatmas();
                const status = document.getElementById('adminTopicStatus');
                if (status) status.textContent = `تم نقل «${record.title || 'الختمة'}» إلى موضوع «${customTopic}» وحفظه.`;
            } catch (error) {
                clearTopicDragVisuals();
                console.error('فشل نقل الختمة موضوعيًا:', error);
                alert(`تعذر حفظ نقل الختمة: ${error.code || error.message || 'تحقق من صلاحيات Firebase.'}`);
            }
        }
        function topicTouchStart(event, key) {
            if (!isAdminSessionActive()) return;
            const target = event.currentTarget;
            touchDragPointerId = event.changedTouches?.[0]?.identifier ?? null;
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (!isAdminSessionActive()) return;
                draggedTopicKhatma = key; touchDragActive = true;
                target.classList.add('topic-dragging'); document.body.classList.add('topic-touch-dragging');
                if (navigator.vibrate) navigator.vibrate(45);
                touchDragGhost = target.cloneNode(true);
                touchDragGhost.className = 'topic-touch-ghost'; touchDragGhost.removeAttribute('onclick');
                document.body.appendChild(touchDragGhost);
            }, 550);
        }
        function topicTouchMove(event) {
            if (!touchDragActive || !draggedTopicKhatma) return;
            event.preventDefault(); event.stopPropagation();
            const touch = [...(event.touches || [])].find(t => touchDragPointerId === null || t.identifier === touchDragPointerId) || event.touches[0];
            if (!touch) return;
            if (touchDragGhost) { touchDragGhost.style.left = `${touch.clientX + 10}px`; touchDragGhost.style.top = `${touch.clientY + 10}px`; }
            const under = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.admin-topic-card, .topic-tab');
            document.querySelectorAll('.admin-topic-card.topic-drop-over,.topic-tab.topic-drop-over').forEach(el => el.classList.remove('topic-drop-over'));
            if (under) under.classList.add('topic-drop-over');
        }
        async function topicTouchEnd(event) {
            clearTimeout(longPressTimer);
            if (!touchDragActive || !draggedTopicKhatma) { draggedTopicKhatma = null; return; }
            event.preventDefault(); event.stopPropagation();
            const touch = [...(event.changedTouches || [])].find(t => touchDragPointerId === null || t.identifier === touchDragPointerId) || event.changedTouches?.[0];
            const under = touch ? document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.admin-topic-card, .topic-tab') : null;
            touchDragActive = false; touchDragPointerId = null;
            if (under?.dataset.topic) await topicDrop({ preventDefault(){}, stopPropagation(){}, currentTarget:under }, under.dataset.topic);
            else { draggedTopicKhatma = null; clearTopicDragVisuals(); }
        }
        window.renderAdminTopicBrowser = () => {
            const browser = document.getElementById('adminTopicBrowser');
            const status = document.getElementById('adminTopicStatus');
            const select = document.getElementById('adminTopicSelect');
            if (!browser || !select) return;
            const type = document.getElementById('adminTopicType')?.value || 'all';
            const query = (document.getElementById('adminTopicSearch')?.value || '').trim().toLocaleLowerCase('ar');
            const source = Object.entries(allKhatmas || {}).filter(([, record]) => {
                const hasImage = hasKhatmaImage(record);
                return type === 'all' || (type === 'images' ? hasImage : !hasImage);
            });
            const topicNames = new Set(['all']);
            source.forEach(([, record]) => getKhatmaTopics(record).forEach(topic => topicNames.add(topic)));
            const currentTopic = select.value || 'all';
            const orderedTopics = ['all', ...[...topicNames].filter(topic => topic !== 'all').sort((a,b) => a.localeCompare(b, 'ar'))];
            select.innerHTML = orderedTopics.map(topic => `<option value="${escapeHtml(topic)}">${topic === 'all' ? 'كل الموضوعات' : escapeHtml(topic)}</option>`).join('');
            select.value = orderedTopics.includes(currentTopic) ? currentTopic : 'all';
            const selectedTopic = select.value;
            const groups = new Map();
            source.forEach(([key, record]) => {
                const text = `${record?.customTopic || ''}\n${record?.title || ''}\n${record?.content || ''}`.toLocaleLowerCase('ar');
                if (query && !text.includes(query)) return;
                const topics = getKhatmaTopics(record);
                topics.filter(topic => selectedTopic === 'all' || topic === selectedTopic).forEach(topic => {
                    if (!groups.has(topic)) groups.set(topic, []);
                    groups.get(topic).push([key, record]);
                });
            });
            const total = [...groups.values()].reduce((sum, rows) => sum + rows.length, 0);
            if (status) status.textContent = `تم تصنيف ${total} ختمة حسب البحث والنوع المحددين.`;
            browser.innerHTML = groups.size ? [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0], 'ar')).map(([topic, rows]) => `<div class="admin-topic-card" data-topic="${escapeHtml(topic)}" ondragover="topicDragOver(event)" ondragleave="topicDragLeave(event)" ondrop="topicDrop(event, '${escapeHtml(topic).replace("'", "\'")}')" style="--topic-color:${topicColor(topic)};--topic-bg:${topicBackground(topic)};"><strong>${escapeHtml(topic)} <small>(${rows.length})</small></strong>${rows.sort((a,b) => extractNumber(a[1].title)-extractNumber(b[1].title)).map(([key, record]) => { const image = record.image && String(record.image).trim(); const label = image ? (getImageDisplayTitles()[key] || record.title || 'بدون عنوان') : (record.title || 'بدون عنوان'); return `<div class="admin-topic-row topic-draggable" draggable="true" ondragstart="topicDragStart(event, '${key}')" ondragend="topicDragEnd(event)" ontouchstart="topicTouchStart(event, '${key}')" ontouchmove="topicTouchMove(event)" ontouchend="topicTouchEnd(event)"><span>${escapeHtml(label)}</span><button type="button" class="admin-topic-edit" onclick="event.stopPropagation(); edit('${key}')">تعديل الموضوع</button></div>`; }).join('')}</div>`).join('') : '<p style="color:#666;">لا توجد نتائج مطابقة.</p>';
        };

        document.getElementById('adminTopicType')?.addEventListener('change', () => renderAdminTopicBrowser());
        document.getElementById('adminTopicSelect')?.addEventListener('change', () => renderAdminTopicBrowser());
        document.getElementById('adminTopicSearch')?.addEventListener('input', () => renderAdminTopicBrowser());
        window.renderAdminLists = (data) => {
            const textContainer = document.getElementById('adminTextListContainer');
            const imageContainer = document.getElementById('adminImageListContainer');
            if (!textContainer || !imageContainer) return;

            data = removeDeletedKhatmaFromData(data || {});

            textContainer.innerHTML = '';
            imageContainer.innerHTML = '';

            if (!data || Object.keys(data).length === 0) {
                textContainer.innerHTML = '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات نصية.</p>';
                imageContainer.innerHTML = '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات مصورة.</p>';
                return;
            }

            const sortedKeys = Object.keys(data).sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));
            const imageDisplayTitles = getImageDisplayTitles(data);
            let textHtml = '';
            let imageHtml = '';

            sortedKeys.forEach(key => {
                const hasImage = hasKhatmaImage(data[key]);
                const displayTitle = hasImage ? (imageDisplayTitles[key] || data[key].title || 'بدون عنوان') : (data[key].title || 'بدون عنوان');
                const topicSummary = getKhatmaTopics(data[key]).join('، ');
                const rowContent = `
                    <div class="admin-khatma-row">
                        <span>${duplicateEscapeHtml(displayTitle)}<small style="display:block;color:#1b4332;">${duplicateEscapeHtml(topicSummary)}</small></span>
                        <div>
                            <button onclick="edit('${key}')" title="تعديل الموضوع ومحتوى الختمة" style="cursor:pointer; padding:2px 6px; margin-left:5px;">تعديل الموضوع</button>
                            <button onclick="del('${key}')" style="color:red; cursor:pointer; padding:2px 6px;">🗑️</button>
                        </div>
                    </div>`;

                if (hasImage) {
                    imageHtml += rowContent;
                } else {
                    textHtml += rowContent;
                }
            });

            textContainer.innerHTML = textHtml || '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات نصية.</p>';
            imageContainer.innerHTML = imageHtml || '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات مصورة.</p>';
            renderAdminTopicBrowser();
        };

        window.show = async (key) => {
            if (allKhatmas[key]) {
                await ensureFullKhatma(key);
                let modalSettings = { font: 'Amiri, serif', tabColors: { modalBg: '#fffdf0', modalText: '#000000' } };
                try { modalSettings = JSON.parse(localStorage.getItem('app_theme_settings') || 'null') || modalSettings; } catch (error) {}
                const modalColors = modalSettings.tabColors || {};
                const modalCard = document.querySelector('.modal-card');
                const modalHeader = document.getElementById('displayTitle');
                const modalBody = document.getElementById('displayContent');
                if (modalCard) {
                    modalCard.style.setProperty('background-color', modalColors.modalBg || '#fffdf0', 'important');
                    modalCard.style.setProperty('font-family', modalSettings.font || 'Amiri, serif', 'important');
                }
                if (modalHeader) {
                    modalHeader.style.setProperty('font-family', modalSettings.font || 'Amiri, serif', 'important');
                }
                if (modalBody) {
                    modalBody.style.setProperty('color', modalColors.modalText || '#000000', 'important');
                    modalBody.style.setProperty('font-family', modalSettings.font || 'Amiri, serif', 'important');
                }
                const imageDisplayTitles = getImageDisplayTitles();
                const displayTitle = imageDisplayTitles[key] || allKhatmas[key].title || "بدون عنوان";
                document.getElementById('displayTitle').innerText = displayTitle;
                const displayContent = document.getElementById('displayContent');

                let htmlOutput = '';
                if (allKhatmas[key].image && allKhatmas[key].image.trim() !== "") {
                    htmlOutput += `<div style="text-align: center; margin-bottom: 15px;"><img src="${allKhatmas[key].image}" alt="${allKhatmas[key].title}" style="max-width: 100%; height: auto; border-radius: 8px;"></div>`;
                }
                if (allKhatmas[key].content && allKhatmas[key].content.trim() !== "") {
                    htmlOutput += `<div>${allKhatmas[key].content.replace(/\n/g, '<br>')}</div>`;
                }

                displayContent.innerHTML = htmlOutput || 'لا يوجد محتوى لهذه الختمة.';
                document.getElementById('modalOverlay').style.display = 'flex';
            }
        };

        window.toggleFav = (key) => {
            const idx = favorites.indexOf(key);
            idx > -1 ? favorites.splice(idx, 1) : favorites.push(key);
            localStorage.setItem('user_favorites', JSON.stringify(favorites));
            filterKhatmas();
        };

        window.del = async (key) => {
            if(confirm("هل أنت متأكد من الحذف؟")) {
                try {
                    await db.ref('khatmas/' + key).remove();
                    rememberDeletedKhatma(key);
                    delete allKhatmas[key];
                    await OfflineStore.deleteKhatma(key);
                    await OfflineStore.setMeta('firebase-etag', null);
                    renderAdminLists(allKhatmas);
                    filterKhatmas();
                } catch (error) {
                    alert("تعذر الحذف. تأكد من تسجيل الدخول بحساب المشرف واتصال الإنترنت.");
                }
            }
        };

        window.edit = (key) => {
            document.getElementById('editKeyId').value = key;
            document.getElementById('singleTitle').value = allKhatmas[key].title || '';
            document.getElementById('singleTopic').value = allKhatmas[key].customTopic || '';
            document.getElementById('singleContent').value = allKhatmas[key].content || '';
            document.getElementById('singleImageFile').value = '';

            const imgPreview = document.getElementById('currentImagePreview');
            if (allKhatmas[key].image && allKhatmas[key].image.trim() !== "") {
                imgPreview.src = allKhatmas[key].image;
                imgPreview.style.display = 'block';
            } else {
                imgPreview.style.display = 'none';
            }
        };

        function compressImage(file, maxWidth, quality, callback) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    callback(dataUrl);
                };
            };
        }

        document.getElementById('saveSingleBtn').onclick = async () => {
            const key = document.getElementById('editKeyId').value;
            const title = document.getElementById('singleTitle').value.trim();
            const content = document.getElementById('singleContent').value.trim();
            const customTopic = document.getElementById('singleTopic').value.trim();
            const imageInput = document.getElementById('singleImageFile');

            if (!title) {
                alert("الرجاء إدخال عنوان الختمة!");
                return;
            }

            let existingImage = (key && allKhatmas[key] && allKhatmas[key].image) ? allKhatmas[key].image : "";

            const saveData = async (finalImage) => {
                await requireAdminSession();
                const data = { title: title, content: content, image: finalImage, customTopic: customTopic };

                try {
                    let savedKey = key;
                    if (savedKey) {
                        await db.ref('khatmas/' + savedKey).set(data);
                    } else {
                        const ref = await db.ref('khatmas').push(data);
                        savedKey = ref.key;
                    }

                    allKhatmas[savedKey] = data;
                    await OfflineStore.putKhatma(savedKey, data);
                    await OfflineStore.setMeta('firebase-etag', null);
                    renderAdminLists(allKhatmas);
                    filterKhatmas();
                    resetAdminForm();
                    alert(key ? "تم التعديل بنجاح!" : "تمت الإضافة بنجاح!");
                } catch (error) {
                    alert("تعذر الحفظ. تأكد من تسجيل الدخول بحساب المشرف واتصال الإنترنت.");
                }
            };

            if (imageInput.files && imageInput.files[0]) {
                compressImage(imageInput.files[0], 400, 0.5, function(compressedBase64) {
                    saveData(compressedBase64);
                });
            } else {
                saveData(existingImage);
            }
        };

        document.getElementById('saveMultiImagesBtn').onclick = async () => {
            const fileInput = document.getElementById('multiImagesInput');
            const progressEl = document.getElementById('ocrProgress');
            const apiKey = localStorage.getItem('gemini_api_key');

            if (!apiKey) {
                alert("الرجاء إدخال وحفظ مفتاح Gemini API في لوحة الإدارة أولاً!");
                return;
            }

            if (!fileInput.files || fileInput.files.length === 0) {
                alert("الرجاء اختيار صور أولاً!");
                return;
            }

            const files = Array.from(fileInput.files);
            let completed = 0;

            let maxSeq = 0;
            const usedSequences = new Set();
            try {
                const latestSnapshot = await db.ref('khatmas').once('value');
                const latestData = latestSnapshot.val() || {};
                Object.values(latestData).forEach(v => {
                    const num = extractNumber(v && v.title ? v.title : '');
                    if (num > 0) usedSequences.add(num);
                    if (num > maxSeq) maxSeq = num;
                });
            } catch (error) {
                Object.values(allKhatmas).forEach(v => {
                    const num = extractNumber(v && v.title ? v.title : '');
                    if (num > 0) usedSequences.add(num);
                    if (num > maxSeq) maxSeq = num;
                });
            }

            progressEl.innerText = `جاري المعالجة (0 من ${files.length})...`;

            let nextSequence = maxSeq;
            for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
                do {
                    nextSequence++;
                } while (usedSequences.has(nextSequence));
                usedSequences.add(nextSequence);
                const currentSeqArabic = toArabicNum(nextSequence);

                let extractedTitleText = "ختمة مصورة";

                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        const base64Data = e.target.result.split(',')[1];

                        try {
                            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{
                                        parts: [
                                            { text: "اقرأ العنوان الرئيسي أو السطر الأول المكتوب في هذه الصورة بدقة واكتبه فقط باختصار:" },
                                            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
                                        ]
                                    }]
                                })
                            });

                            const resultJson = await response.json();
                            if (resultJson.candidates && resultJson.candidates[0].content.parts[0].text) {
                                let geminiText = resultJson.candidates[0].content.parts[0].text.trim();
                                    geminiText = geminiText.replace(/[*#]/g, '').split('\n')[0].trim();
                                    geminiText = geminiText.replace(/^[\\d٠-٩]+\\s*[-_–—.:،)]*\\s*/, '').substring(0, 35);

                                if (geminiText && geminiText.length > 2 && !geminiText.toLowerCase().includes("error")) {
                                    extractedTitleText = geminiText;
                                }
                            }
                        } catch (err) {
                            console.log("خطأ بالاتصال بـ Gemini");
                        }

                        let finalTitleWithSeq = currentSeqArabic + "- " + extractedTitleText;

                        compressImage(file, 400, 0.5, async function(compressedBase64) {
                            const imageData = {
                                title: finalTitleWithSeq,
                                content: "",
                                image: compressedBase64
                            };
                            const newRef = await db.ref('khatmas').push(imageData);
                            allKhatmas[newRef.key] = imageData;
                            await OfflineStore.putKhatma(newRef.key, imageData);
                            await OfflineStore.setMeta('firebase-etag', null);

                            completed++;
                            progressEl.innerText = `تمت معالجة ${completed} من ${files.length} صورة...`;
                            resolve();
                        });
                    };
                    reader.readAsDataURL(file);
                });
            }

            renderAdminLists(allKhatmas);
            filterKhatmas();
            alert("تم الانتهاء من الرفع والمعالجة بنجاح!");
            progressEl.innerText = "";
            fileInput.value = "";
        };

        function resetAdminForm() {
            document.getElementById('singleTitle').value = '';
            document.getElementById('singleContent').value = '';
            document.getElementById('singleTopic').value = '';
            document.getElementById('singleImageFile').value = '';
            document.getElementById('editKeyId').value = '';
            document.getElementById('currentImagePreview').style.display = 'none';
        }

        document.getElementById('saveBtn').onclick = async () => {
            const text = document.getElementById('bulkArea').value;
            const segments = text.split('~~~');
            for(let seg of segments) {
                if(seg.trim().length > 5) {
                    const lines = seg.trim().split('\n');
                    const textData = { title: lines[0], content: lines.slice(1).join('\n'), image: "" };
                    const newRef = await db.ref('khatmas').push(textData);
                    allKhatmas[newRef.key] = textData;
                    await OfflineStore.putKhatma(newRef.key, textData);
                    await OfflineStore.setMeta('firebase-etag', null);
                }
            }
            renderAdminLists(allKhatmas);
            filterKhatmas();
            alert("تمت الإضافة الجماعية!");
            document.getElementById('bulkArea').value = '';
        };

        window.switchTab = (tab, direction = null) => {
            const tabOrder = ['all', 'images', 'fav'];
            const currentId = document.querySelector('.tab-btn.active')?.id || 'allTab';
            const currentTab = currentId.replace('Tab', '');
            const currentIndex = Math.max(0, tabOrder.indexOf(currentTab));
            const nextIndex = Math.max(0, tabOrder.indexOf(tab));
            document.getElementById('allTab').classList.toggle('active', tab === 'all');
            document.getElementById('imagesTab').classList.toggle('active', tab === 'images');
            document.getElementById('favTab').classList.toggle('active', tab === 'fav');
            if (activeTopicByView[tab] === undefined) activeTopicByView[tab] = 'all';
            filterKhatmas();
        };


        window.filterKhatmas = () => {
            const query = document.getElementById('searchInput').value.trim().toLowerCase();
            const filtered = {};
            const searchWords = query ? query.split(/\s+/) : [];

            Object.keys(allKhatmas).forEach(k => {
                const title = (allKhatmas[k].title || "").toLowerCase();
                if (searchWords.length === 0) {
                    filtered[k] = allKhatmas[k];
                } else {
                    const content = (allKhatmas[k].content || '').toLowerCase();
                    if (searchWords.every(word => title.includes(word) || content.includes(word))) {
                        filtered[k] = allKhatmas[k];
                    }
                }
            });

            const activeTab = document.querySelector('.tab-btn.active').id;
            let currentView = 'all';
            if (activeTab === 'generalTab') currentView = 'general';
            if (activeTab === 'imagesTab') currentView = 'images';
            if (activeTab === 'favTab') currentView = 'fav';

            renderList(filtered, currentView);
        };


// إدارة الختمات المصورة المتشابهة
function duplicateEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
}

function duplicateSafeKey(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function duplicateImageHash(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const size = 16;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, size, size);
                const pixels = ctx.getImageData(0, 0, size, size).data;
                const gray = [];
                for (let i = 0; i < pixels.length; i += 4) {
                    gray.push((pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114));
                }
                const average = gray.reduce((sum, value) => sum + value, 0) / gray.length;
                resolve(gray.map(value => value >= average ? 1 : 0));
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
        img.src = src;
    });
}

function duplicateHashDistance(a, b) {
    let distance = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) distance++;
    }
    return distance + Math.abs(a.length - b.length);
}

window.scanSimilarImages = async () => {
    const status = document.getElementById('similarImagesStatus');
    const container = document.getElementById('similarImagesContainer');
    if (!status || !container) return;
    if (similarScanHasRun) return;
    const records = Object.entries(allKhatmas).filter(([, value]) => hasKhatmaImage(value) && value.image && value.image.trim() !== '');
    if (records.length < 2) {
        displayedSimilarGroups = [];
        status.innerText = 'لا توجد صور كافية للفحص.';
        container.innerHTML = '';
        return;
    }
    similarScanHasRun = true;
    const scanButton = document.getElementById('scanSimilarImagesBtn');
    if (scanButton) {
        scanButton.disabled = true;
        scanButton.style.opacity = '0.65';
        scanButton.innerText = 'تم الفحص — احذف المتشابه من النتائج';
    }
    status.innerText = `جارٍ فحص ${records.length} صورة...`;
    container.innerHTML = '';
    const hashed = [];
    for (const [key, value] of records) {
        try {
            hashed.push({ key, value, hash: await duplicateImageHash(value.image) });
        } catch (error) {
            console.warn('تعذر تحليل صورة:', key, error);
        }
    }
    const groups = [];
    const visited = new Set();
    const threshold = 18;
    for (let i = 0; i < hashed.length; i++) {
        if (visited.has(hashed[i].key)) continue;
        const group = [hashed[i]];
        visited.add(hashed[i].key);
        for (let j = i + 1; j < hashed.length; j++) {
            if (!visited.has(hashed[j].key) && duplicateHashDistance(hashed[i].hash, hashed[j].hash) <= threshold) {
                group.push(hashed[j]);
                visited.add(hashed[j].key);
            }
        }
        if (group.length > 1) groups.push(group);
    }
    if (!groups.length) {
        displayedSimilarGroups = [];
        status.innerText = 'لم يتم العثور على صور متشابهة.';
        container.innerHTML = '';
        return;
    }
    displayedSimilarGroups = groups;
    renderSimilarImageGroups();
};

function renderSimilarImageGroups() {
    const status = document.getElementById('similarImagesStatus');
    const container = document.getElementById('similarImagesContainer');
    if (!status || !container) return;

    if (!displayedSimilarGroups.length) {
        status.innerText = 'تمت إزالة الصور المتشابهة المعروضة.';
        container.innerHTML = '';
        return;
    }

    status.innerText = `تم العثور على ${displayedSimilarGroups.length} مجموعة متشابهة.`;
    container.innerHTML = displayedSimilarGroups.map((group, groupIndex) => `
        <div style="background:#fff; border:1px solid #bbb; border-radius:8px; padding:8px; margin:8px 0;">
            <div style="font-weight:bold; color:#4A0E4E; margin-bottom:6px;">المجموعة ${groupIndex + 1} (${group.length} صور)</div>
            ${group.map(item => {
                const safeKey = duplicateSafeKey(item.key);
                return `<div style="display:flex; gap:8px; align-items:center; border-top:1px solid #eee; padding:7px 0;">
                    <img src="${item.value.image}" alt="" style="width:65px;height:65px;object-fit:cover;border-radius:5px;border:1px solid #ccc;">
                    <div style="flex:1; min-width:0; font-size:13px; word-break:break-word;">${duplicateEscapeHtml(item.value.title || 'بدون عنوان')}</div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <label style="background:#1b4332;color:#fff;padding:4px 6px;border-radius:4px;font-size:12px;cursor:pointer;text-align:center;">استبدال
                            <input type="file" accept="image/*" style="display:none" onchange="replaceImageOnly('${safeKey}', this)">
                        </label>
                        <button type="button" style="background:#a93226;color:#fff;border:0;border-radius:4px;padding:4px 6px;font-size:12px;cursor:pointer;" onclick="deleteImageKhatma('${safeKey}')">حذف الختمة</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`).join('');
}

window.deleteImageKhatma = async (key) => {
    if (!confirm('هل تريد حذف الختمة كاملة؟ سيتم حذف الصورة والرقم والعنوان والمحتوى نهائيًا.')) return;
    try {
        await db.ref('khatmas/' + key).remove();
        rememberDeletedKhatma(key);
        delete allKhatmas[key];
        favorites = favorites.filter(favoriteKey => favoriteKey !== key);
        localStorage.setItem('user_favorites', JSON.stringify(favorites));
        await OfflineStore.deleteKhatma(key);
        await OfflineStore.setMeta('firebase-etag', null);
        renderAdminLists(allKhatmas);
        filterKhatmas();
        displayedSimilarGroups = displayedSimilarGroups
            .map(group => group.filter(item => item.key !== key))
            .filter(group => group.length > 1);
        renderSimilarImageGroups();
    } catch (error) {
        alert('تعذر حذف الختمة. تأكد من تسجيل دخول المشرف واتصال الإنترنت.');
    }
};

window.replaceImageOnly = (key, input) => {
    if (!input.files || !input.files[0]) return;
    compressImage(input.files[0], 400, 0.5, async (compressedBase64) => {
        try {
            await db.ref('khatmas/' + key).update({ image: compressedBase64 });
            if (allKhatmas[key]) allKhatmas[key].image = compressedBase64;
            await OfflineStore.putKhatma(key, allKhatmas[key]);
            await OfflineStore.setMeta('firebase-etag', null);
            renderAdminLists(allKhatmas);
            filterKhatmas();
            displayedSimilarGroups.forEach(group => {
                group.forEach(item => {
                    if (item.key === key) item.value.image = compressedBase64;
                });
            });
            renderSimilarImageGroups();
            alert('تم استبدال الصورة بنجاح.');
        } catch (error) {
            alert('تعذر استبدال الصورة. تأكد من تسجيل دخول المشرف واتصال الإنترنت.');
        }
    });
};

// نهاية وظائف إدارة الصور المتشابهة


function cleanExtractedImageTitle(text) {
    let value = String(text || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/["“”*#]/g, '')
        .replace(/^(?:العنوان|عنوان الصورة|النص المكتوب)\s*[:：-]?\s*/i, '')
        .replace(/^[\d٠-٩]+\s*[-_–—.:،)]*\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (/غير\s*واضح|لا يوجد|غير مقروء|unknown|unclear|error/i.test(value)) return '';
    const arabicLetters = (value.match(/[ء-ي]/g) || []).length;
    const meaningful = (value.match(/[ء-يA-Za-z0-9٠-٩]/g) || []).length;
    if (arabicLetters < 4 || meaningful < 5) return '';
    return value.substring(0, 100).trim();
}

// إعادة تسمية الختمات المصورة ذات العنوان العام اعتمادًا على النص داخل الصورة
window.renameGenericImageTitles = async () => {
    const status = document.getElementById('renameImagesStatus');
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        if (status) status.innerText = 'احفظ مفتاح Gemini API في لوحة التحكم أولًا.';
        return;
    }

    const genericTitlePattern = /^(?:[\d٠-٩]+\s*[-_–—.:،)]*\s*)?ختمة\s*مصورة\s*$/i;
    const targets = Object.entries(allKhatmas).filter(([key, value]) =>
        hasKhatmaImage(value) && value.image && value.image.trim() !== '' && genericTitlePattern.test((value.title || '').trim())
    );

    if (!targets.length) {
        if (status) status.innerText = 'لا توجد ختمات مصورة بعنوان عام تحتاج إلى إعادة تسمية.';
        return;
    }

    if (!confirm(`سيتم تحليل ${targets.length} صورة وإعادة تسمية الختمات ذات العنوان العام. هل تريد المتابعة؟`)) return;
    const button = document.getElementById('renameGenericImagesBtn');
    if (button) button.disabled = true;
    let completed = 0;
    let renamed = 0;
    let failed = 0;
    let lastRenameError = '';

    for (const [key, value] of targets) {
        try {
            const rawExtracted = await askGeminiToReadImage(apiKey, value.image,
                'استخرج العنوان العربي الرئيسي الظاهر داخل الصورة فقط. اجمع كلمات العنوان إذا كانت موزعة على أكثر من سطر. أعد العنوان كاملًا كما هو دون شرح أو تعليق أو رموز أو رقم تسلسلي. لا تخمّن نصًا غير واضح. إذا لم تجد عنوانًا عربيًا مقروءًا بالكامل فأعد كلمة: غير واضح. الحد الأقصى 100 حرف.');
            const extracted = cleanExtractedImageTitle(rawExtracted);

            if (extracted) {
                const oldNumber = extractNumber(value.title || '');
                const newTitle = oldNumber > 0 ? `${toArabicNum(oldNumber)}- ${extracted}` : extracted;
                await db.ref('khatmas/' + key).update({ title: newTitle });
                allKhatmas[key].title = newTitle;
                await OfflineStore.putKhatma(key, allKhatmas[key]);
                renamed++;
            } else {
                failed++;
                lastRenameError = 'لم يُستخرج عنوان عربي مكتمل وواضح من الصورة.';
            }
        } catch (error) {
            console.warn('تعذر إعادة تسمية الصورة:', key, error);
            failed++;
            lastRenameError = explainGeminiRenameError(error);
            if ([400, 401, 403].includes(error.status)) {
                if (status) status.innerText = `توقف الفحص: ${lastRenameError}`;
                break;
            }
        }
        completed++;
        if (status) status.innerText = `تم تحليل ${completed} من ${targets.length} صورة، وأعيدت تسمية ${renamed}${failed ? `، وفشل تحليل ${failed}` : ''}${lastRenameError ? ` — السبب الأخير: ${lastRenameError}` : ''}.`;
    }

    await OfflineStore.setMeta('firebase-etag', null);
    renderAdminLists(allKhatmas);
    filterKhatmas();
    if (button) button.disabled = false;
    if (status) status.innerText = `اكتمل الفحص: أُعيدت تسمية ${renamed} من أصل ${targets.length}${failed ? `، وفشل تحليل ${failed}` : ''}${lastRenameError ? ` — السبب الأخير: ${lastRenameError}` : ''}.`;
};

// نهاية وظيفة إعادة تسمية الختمات المصورة


// تخصيص الخطوط والألوان وحفظها محليًا
const themePresets = {
    green: { bg: '#fcfcf0', primary: '#1b4332', secondary: '#8B4513', accent: '#d4af37', card: '#fffdf0', text: '#111111' },
    blue: { bg: '#eef6fb', primary: '#155e75', secondary: '#2563eb', accent: '#f59e0b', card: '#ffffff', text: '#102a43' },
    brown: { bg: '#fbf4e8', primary: '#6b3f24', secondary: '#a65d2a', accent: '#d49a3a', card: '#fffaf2', text: '#2f2118' },
    purple: { bg: '#f7f0fb', primary: '#4a0e4e', secondary: '#7e22ce', accent: '#eab308', card: '#fffaff', text: '#29132e' },
    red: { bg: '#fff4f4', primary: '#7f1d1d', secondary: '#b91c1c', accent: '#d4af37', card: '#fffafa', text: '#351313' },
    dark: { bg: '#1f2933', primary: '#0f766e', secondary: '#92400e', accent: '#fbbf24', card: '#374151', text: '#f9fafb' }
};

function applyThemeSettings(font, presetName, persist = false, customTabColors = null) {
    const preset = themePresets[presetName] || themePresets.green;
    let tabColors = customTabColors;
    if (!tabColors) {
        try { tabColors = JSON.parse(localStorage.getItem('app_tab_colors') || 'null'); } catch (error) {}
    }
    tabColors = tabColors || { all: preset.primary, images: preset.secondary, fav: preset.primary };
    const palette = { ...preset, bg: tabColors.pageBg || preset.bg, card: tabColors.card || preset.card, primary: tabColors.primary || preset.primary, accent: tabColors.accent || preset.accent, text: tabColors.text || preset.text, border: tabColors.border || tabColors.primary || preset.primary };
    const root = document.documentElement;
    root.style.setProperty('--theme-font', font || 'Amiri, serif');
    root.style.setProperty('--theme-bg', palette.bg);
    root.style.setProperty('--theme-primary', palette.primary);
    root.style.setProperty('--theme-secondary', preset.secondary);
    root.style.setProperty('--theme-accent', palette.accent);
    root.style.setProperty('--theme-card', palette.card);
    root.style.setProperty('--theme-text', palette.text);
    root.style.setProperty('--theme-border', palette.border);
    root.style.setProperty('--tab-all-bg', tabColors.all || palette.primary);
    root.style.setProperty('--tab-images-bg', tabColors.images || preset.secondary);
    root.style.setProperty('--tab-fav-bg', tabColors.fav || preset.primary);
    root.style.setProperty('--modal-bg', tabColors.modalBg || '#fffdf0');
    root.style.setProperty('--modal-text', tabColors.modalText || '#000000');
    const unifiedVariables = {
        quotesBgColor:'--quotes-bg', quotesTextColor:'--quotes-text', quotesBorderColor:'--quotes-border',
        topicBgColor:'--topic-bg', topicTextColor:'--topic-text', topicBorderColor:'--topic-border',
        dateBgColor:'--date-bg', dateTextColor:'--date-text',
        todayKhatmasBgColor:'--today-bg', todayKhatmasTextColor:'--today-text', todayKhatmasBorderColor:'--today-border',
        mafatihBgColor:'--mafatih-bg', mafatihCardColor:'--mafatih-card', mafatihAccentColor:'--mafatih-accent', mafatihTextColor:'--mafatih-text', mafatihBorderColor:'--mafatih-border', mafatihHeaderColor:'--mafatih-header',
        mafatihTodayBg:'--mafatih-today-bg', mafatihTodayAccent:'--mafatih-today-accent', mafatihTodayText:'--mafatih-today-text', mafatihTodayBorder:'--mafatih-today-border'
    };
    Object.entries(unifiedVariables).forEach(([key, variable]) => { if (tabColors[key]) root.style.setProperty(variable, tabColors[key]); });
    const todayColorBox = document.getElementById('mafatihTodayBox');
    if (todayColorBox) {
        const todayColors = { bg:'mafatihTodayBg', accent:'mafatihTodayAccent', text:'mafatihTodayText', border:'mafatihTodayBorder' };
        Object.entries(todayColors).forEach(([part, key]) => {
            if (tabColors[key]) todayColorBox.style.setProperty(`--mafatih-today-${part}`, tabColors[key]);
        });
    }

    let style = document.getElementById('runtimeThemeStyles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'runtimeThemeStyles';
        document.head.appendChild(style);
    }
    style.textContent = `
        body, .sticky-top-container { font-family: var(--theme-font) !important; background-color: var(--theme-bg) !important; color: var(--theme-text) !important; }
        #allTab, #listContainer[data-view="all"] .khatma-item { background-color: var(--tab-all-bg) !important; }
        #imagesTab, #listContainer[data-view="images"] .khatma-item { background-color: var(--tab-images-bg) !important; }
        #favTab, #listContainer[data-view="fav"] .khatma-item { background-color: var(--tab-fav-bg) !important; }
        .admin-section-box, .loading-box { background-color: var(--theme-card) !important; color: var(--theme-text) !important; }
        .admin-section-box, .search-container, .tabs-container, .quotes-box, .topic-box, #dailyMessageBox, #todayKhatmasBox { border-color: var(--theme-border) !important; }
        .admin-section-title { color: var(--theme-primary) !important; border-color: var(--theme-primary) !important; }
        .modal-card { background-color: var(--modal-bg) !important; }
        .modal-header { background-color: var(--theme-primary) !important; color: var(--theme-accent) !important; }
        .modal-body { color: var(--modal-text) !important; font-family: var(--theme-font) !important; }
        .modal-card, .modal-card * { font-family: var(--theme-font) !important; }
        .action-btn, .close-btn { border-color: var(--theme-primary) !important; }
        .progress-bar-fill { background-color: var(--theme-primary) !important; }
        .search-box { border-color: var(--theme-primary) !important; background-color: var(--theme-card) !important; color: var(--theme-text) !important; }
        .khatma-item, .tab-btn, .admin-form, input, textarea, button, select { font-family: var(--theme-font) !important; }
    `;

    const preview = document.getElementById('themePreviewBox');
    if (preview) {
        preview.style.background = palette.primary;
        preview.style.color = palette.accent;
        preview.style.fontFamily = font || 'Amiri, serif';
        preview.innerText = `معاينة: ${presetName === 'green' ? 'أخضر هادئ' : presetName}`;
    }
    const fontSelect = document.getElementById('themeFontSelect');
    const presetSelect = document.getElementById('themePresetSelect');
    if (fontSelect && font && fontSelect.value !== font) fontSelect.value = font;
    if (presetSelect && presetName && presetSelect.value !== presetName) presetSelect.value = presetName;
    const allColor = document.getElementById('allTabColor');
    const imagesColor = document.getElementById('imagesTabColor');
    const favColor = document.getElementById('favTabColor');
    const modalBgColor = document.getElementById('modalBgColor');
    const modalTextColor = document.getElementById('modalTextColor');
    const themeBgColor = document.getElementById('themeBgColor');
    const themeCardColor = document.getElementById('themeCardColor');
    const themePrimaryColor = document.getElementById('themePrimaryColor');
    const themeAccentColor = document.getElementById('themeAccentColor');
    const themeTextColor = document.getElementById('themeTextColor');
    const themeBorderColor = document.getElementById('themeBorderColor');
    if (allColor) allColor.value = tabColors.all || preset.primary;
    if (imagesColor) imagesColor.value = tabColors.images || preset.secondary;
    if (favColor) favColor.value = tabColors.fav || preset.primary;
    if (modalBgColor) modalBgColor.value = tabColors.modalBg || '#fffdf0';
    if (modalTextColor) modalTextColor.value = tabColors.modalText || '#000000';
    if (themeBgColor) themeBgColor.value = palette.bg;
    if (themeCardColor) themeCardColor.value = palette.card;
    if (themePrimaryColor) themePrimaryColor.value = palette.primary;
    if (themeAccentColor) themeAccentColor.value = palette.accent;
    if (themeTextColor) themeTextColor.value = palette.text;
    if (themeBorderColor) themeBorderColor.value = palette.border;
    const extraColorDefaults = { quotesBgColor:'#fffdf0', quotesTextColor:'#1b4332', quotesBorderColor:'#1b4332', topicBgColor:'#fffdf0', topicTextColor:'#1b4332', topicBorderColor:'#1b4332', dateBgColor:'#d9f0e2', dateTextColor:'#1b4332', todayKhatmasBgColor:'#fffdf0', todayKhatmasTextColor:'#1b4332', todayKhatmasBorderColor:'#1b4332', mafatihBgColor:'#12141c', mafatihCardColor:'#1c202d', mafatihAccentColor:'#d4af37', mafatihTextColor:'#f1f5f9', mafatihBorderColor:'#2a3042', mafatihHeaderColor:'#1c202d', mafatihTodayBg:'#fffdf0', mafatihTodayAccent:'#d4af37', mafatihTodayText:'#1b4332', mafatihTodayBorder:'#1b4332' };
    Object.entries(extraColorDefaults).forEach(([id, fallback]) => { const input = document.getElementById(id); if (input) input.value = tabColors[id] || fallback; });

    if (persist) {
        localStorage.setItem('app_theme_settings', JSON.stringify({ font: font || 'Amiri, serif', preset: presetName || 'green', tabColors }));
        localStorage.setItem('app_tab_colors', JSON.stringify(tabColors));
        const status = document.getElementById('themeStatus');
        if (status) status.innerText = 'تم حفظ المظهر وتثبيته.';
    }
}

function loadThemeSettings() {
    if (accessMode !== 'full') return;
    let saved = { font: 'Amiri, serif', preset: 'green' };
    try {
        saved = JSON.parse(localStorage.getItem('app_theme_settings') || 'null') || saved;
    } catch (error) {}
    applyThemeSettings(saved.font, saved.preset, false, saved.tabColors);
}

function applyMafatihSettings(settings = {}, persist = false) {
    const s = { font: 'Amiri, serif', size: 16, bg: '#12141c', card: '#1c202d', accent: '#d4af37', text: '#f1f5f9', border: '#2a3042', header: '#1c202d', istikharaFontSize: 17, istikharaResultSize: 17, istikharaEnabled: true, ...settings };
    const root = document.documentElement;
    root.style.setProperty('--mafatih-font', s.font); root.style.setProperty('--mafatih-size', `${Math.max(12, Math.min(32, Number(s.size) || 16))}px`); root.style.setProperty('--mafatih-reader-size', `${Math.max(14, Math.min(40, (Number(s.size) || 16) * 1.12))}px`); root.style.setProperty('--istikhara-font-size', `${Math.max(12, Math.min(40, Number(s.istikharaFontSize) || 17))}px`); root.style.setProperty('--istikhara-result-size', `${Math.max(12, Math.min(40, Number(s.istikharaResultSize) || 17))}px`);
    document.getElementById('mafatihIstikharaScreen')?.style.setProperty('display', s.istikharaEnabled === false ? 'none' : '');
    root.style.setProperty('--mafatih-bg', s.bg); root.style.setProperty('--mafatih-card', s.card); root.style.setProperty('--mafatih-accent', s.accent); root.style.setProperty('--mafatih-text', s.text); root.style.setProperty('--mafatih-border', s.border); root.style.setProperty('--mafatih-header', s.header);
    for (const [id, value] of Object.entries({ mafatihFontSelect:s.font, mafatihFontSize:s.size, mafatihBgColor:s.bg, mafatihCardColor:s.card, mafatihAccentColor:s.accent, mafatihTextColor:s.text, mafatihBorderColor:s.border, mafatihHeaderColor:s.header, istikharaFontSize:s.istikharaFontSize, istikharaResultSize:s.istikharaResultSize })) { const el = document.getElementById(id); if (el) el.value = value; }
    const istikharaEnabled = document.getElementById('istikharaEnabled'); if (istikharaEnabled) istikharaEnabled.checked = s.istikharaEnabled !== false;
    if (persist) { localStorage.setItem('mafatih_settings', JSON.stringify(s)); const status = document.getElementById('mafatihSettingsStatus'); if (status) status.textContent = 'تم حفظ إعدادات مفاتيح الجنان.'; }
    return s;
}
async function loadMafatihSettings() { let saved = {}; try { saved = JSON.parse(localStorage.getItem('mafatih_settings') || '{}') || {}; } catch (error) {} try { const snapshot = await db.ref('appSettings/mafatih').once('value'); if (snapshot.val()) saved = { ...saved, ...snapshot.val() }; } catch (error) {} applyMafatihSettings(saved); localStorage.setItem('mafatih_settings', JSON.stringify(saved)); }
window.saveMafatihSettings = async () => {
    const status = document.getElementById('mafatihSettingsStatus');
    const s = applyMafatihSettings({ font:document.getElementById('mafatihFontSelect')?.value, size:document.getElementById('mafatihFontSize')?.value, bg:document.getElementById('mafatihBgColor')?.value, card:document.getElementById('mafatihCardColor')?.value, accent:document.getElementById('mafatihAccentColor')?.value, text:document.getElementById('mafatihTextColor')?.value, border:document.getElementById('mafatihBorderColor')?.value, header:document.getElementById('mafatihHeaderColor')?.value, istikharaFontSize:document.getElementById('istikharaFontSize')?.value, istikharaResultSize:document.getElementById('istikharaResultSize')?.value, istikharaEnabled:document.getElementById('istikharaEnabled')?.checked !== false }, true);
    try { if (!firebase.auth().currentUser) throw new Error('يجب تسجيل دخول المشرف أولًا.'); const ref=db.ref('appSettings/mafatih'); await ref.set({ ...s, updatedAt:firebase.database.ServerValue.TIMESTAMP }); if (!(await ref.once('value')).exists()) throw new Error('لم يتم تأكيد الحفظ.'); if (status) status.textContent='تم حفظ إعدادات مفاتيح الجنان لجميع المستخدمين.'; } catch(error) { console.error(error); if (status) status.textContent='فشل حفظ إعدادات مفاتيح الجنان: '+(error.code||error.message||'تحقق من قواعد Firebase.'); }
};

let mafatihTodaySettings = {};
const mafatihWeekdays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
let selectedMafatihTodayDay = new Date().getDay();
function normalizeWeeklyToday(value) {
    const weekly = {};
    for (let day = 0; day < 7; day++) {
        const items = Array.isArray(value?.[day]) ? value[day] : [];
        weekly[day] = items.map(item => String(item || '').trim()).filter(Boolean);
    }
    return weekly;
}
function renderMafatihTodayAdminDay() {
    const container = document.getElementById('mafatihTodayItemsEditor');
    if (!container) return;
    const items = mafatihTodaySettings.weekly?.[selectedMafatihTodayDay] || [];
    container.innerHTML = items.map((item, index) => `<div class="mafatih-admin-item-row"><label>العمل ${index + 1}</label><textarea class="mafatihTodayWorkInput" rows="3" placeholder="اكتب عمل ${index + 1} لهذا اليوم">${escapeHtml(item)}</textarea><button type="button" class="action-btn" onclick="this.parentElement.remove()" style="background:#b91c1c;color:#fff;">حذف هذا العمل</button></div>`).join('');
    if (!items.length) container.innerHTML = '<div style="color:#666;padding:8px;text-align:center;">لا توجد أعمال مضافة لهذا اليوم.</div>';
}
function addMafatihTodayWorkField() {
    const container = document.getElementById('mafatihTodayItemsEditor');
    if (!container) return;
    if (container.textContent.includes('لا توجد أعمال')) container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'mafatih-admin-item-row';
    row.innerHTML = `<label>عمل جديد</label><textarea class="mafatihTodayWorkInput" rows="3" placeholder="اكتب العمل هنا"></textarea><button type="button" class="action-btn" onclick="this.parentElement.remove()" style="background:#b91c1c;color:#fff;">حذف هذا العمل</button>`;
    container.appendChild(row);
}
function collectMafatihTodaySelectedDay() {
    return [...document.querySelectorAll('#mafatihTodayItemsEditor .mafatihTodayWorkInput')].map(el => el.value.trim()).filter(Boolean);
}
function selectMafatihTodayDay(day) {
    selectedMafatihTodayDay = Math.max(0, Math.min(6, Number(day) || 0));
    const label = document.getElementById('mafatihTodaySelectedDayLabel');
    if (label) label.textContent = `إضافة وتعديل أعمال يوم ${mafatihWeekdays[selectedMafatihTodayDay]}`;
    renderMafatihTodayAdminDay();
}
function applyMafatihTodaySettings(settings = {}, persist = false) {
    const oldText = String(settings.displayOverride || '').trim();
    const legacyItems = oldText ? oldText.split(/\n+/).map(v => v.trim()).filter(Boolean) : [];
    const weekly = normalizeWeeklyToday(settings.weekly || {});
    if (!Object.values(weekly).some(items => items.length) && legacyItems.length) weekly[new Date().getDay()] = legacyItems;
    let themeColors = {};
    try { themeColors = JSON.parse(localStorage.getItem('app_tab_colors') || '{}') || {}; } catch (error) {}
    mafatihTodaySettings = { enabled: true, bg: '#fffdf0', accent: '#d4af37', text: '#1b4332', border: '#1b4332', font: 'Amiri, serif', size: 18, weekly, ...(settings || {}) };
    mafatihTodaySettings.bg = themeColors.mafatihTodayBg || mafatihTodaySettings.bg;
    mafatihTodaySettings.accent = themeColors.mafatihTodayAccent || mafatihTodaySettings.accent;
    mafatihTodaySettings.text = themeColors.mafatihTodayText || mafatihTodaySettings.text;
    mafatihTodaySettings.border = themeColors.mafatihTodayBorder || mafatihTodaySettings.border;
    mafatihTodaySettings.weekly = normalizeWeeklyToday(mafatihTodaySettings.weekly);
    const box = document.getElementById('mafatihTodayBox');
    if (box) {
        box.style.setProperty('--mafatih-today-bg', mafatihTodaySettings.bg);
        box.style.setProperty('--mafatih-today-accent', mafatihTodaySettings.accent);
        box.style.setProperty('--mafatih-today-text', mafatihTodaySettings.text);
        box.style.setProperty('--mafatih-today-border', mafatihTodaySettings.border);
        box.style.setProperty('--mafatih-today-font', mafatihTodaySettings.font);
        box.style.setProperty('--mafatih-today-size', `${Number(mafatihTodaySettings.size) || 18}px`);
        box.style.display = mafatihTodaySettings.enabled === false ? 'none' : 'block';
    }
    const enabled = document.getElementById('mafatihTodayEnabled'); if (enabled) enabled.checked = mafatihTodaySettings.enabled !== false;
    const daySelect = document.getElementById('mafatihTodayDaySelect'); if (daySelect) { daySelect.value = String(selectedMafatihTodayDay); selectMafatihTodayDay(selectedMafatihTodayDay); }
    return mafatihTodaySettings;
}
function renderMafatihToday() {
    const box = document.getElementById('mafatihTodayContent');
    if (!box) return;
    const items = mafatihTodaySettings.weekly?.[new Date().getDay()] || [];
    box.innerHTML = items.length ? items.map((item, index) => `<div class="mafatih-today-work"><strong>العمل ${index + 1}</strong><div>${escapeHtml(item).replace(/\n/g, '<br>')}</div></div>`).join('') : '<div style="text-align:center;padding:18px;">لا توجد أعمال مضافة لهذا اليوم.</div>';
}

function formatPrayerTime(minutes) {
    const m = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60), min = String(m % 60).padStart(2, '0');
    const period = h24 >= 12 ? 'م' : 'ص';
    const h = h24 % 12 || 12;
    return `${toArabicNum(h)}:${toArabicNum(min)} ${period}`;
}

async function loadMafatihTodaySettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('mafatih_today_settings') || '{}') || {}; } catch (error) {}
    try { const snapshot = await db.ref('appSettings/mafatihToday').once('value'); if (snapshot.val()) saved = { ...saved, ...snapshot.val() }; } catch (error) { console.warn('تعذر تحميل إعدادات أعمال اليوم:', error); }
    applyMafatihTodaySettings(saved); renderMafatihToday();
}
function loadPrayerDisplaySettings() { renderHomePrayerTimes(); }
window.saveMafatihTodaySettings = async () => {
    const status = document.getElementById('mafatihTodaySettingsStatus');
    mafatihTodaySettings.weekly = normalizeWeeklyToday(mafatihTodaySettings.weekly);
    mafatihTodaySettings.weekly[selectedMafatihTodayDay] = collectMafatihTodaySelectedDay();
    const settings = { enabled:document.getElementById('mafatihTodayEnabled')?.checked !== false, weekly:mafatihTodaySettings.weekly, bg:document.getElementById('mafatihTodayBg')?.value || '#fffdf0', accent:document.getElementById('mafatihTodayAccent')?.value || '#d4af37', text:document.getElementById('mafatihTodayText')?.value || '#1b4332', border:document.getElementById('mafatihTodayBorder')?.value || '#1b4332', font:document.getElementById('mafatihTodayFont')?.value || 'Amiri, serif', size:Number(document.getElementById('mafatihTodaySize')?.value) || 18, updatedAt:Date.now() };
    applyMafatihTodaySettings(settings); renderMafatihToday();
    localStorage.setItem('mafatih_today_settings', JSON.stringify(settings));
    if (status) status.textContent = 'جارٍ حفظ أعمال الأسبوع لجميع المستخدمين...';
    try {
        if (!firebase.auth().currentUser) throw new Error('يجب تسجيل دخول المشرف أولًا.');
        const ref = db.ref('appSettings/mafatihToday');
        await ref.set({ ...settings, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        if (!(await ref.once('value')).exists()) throw new Error('لم يتم تأكيد الحفظ.');
        if (status) status.textContent = 'تم حفظ أعمال الأسبوع لجميع المستخدمين.';
    } catch (error) {
        console.error('فشل حفظ أعمال الأسبوع:', error);
        if (status) status.textContent = 'فشل الحفظ: ' + (error.code || error.message || 'تحقق من صلاحيات Firebase.');
    }
}

window.previewThemeSettings = () => {
    const font = document.getElementById('themeFontSelect')?.value || 'Amiri, serif';
    const preset = document.getElementById('themePresetSelect')?.value || 'green';
    const tabColors = readThemeColorInputs();
    applyThemeSettings(font, preset, false, tabColors);
};

window.chooseBasicColor = color => {
    const targetId = document.getElementById('basicColorTarget')?.value;
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    target.value = color;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    applyUnifiedColorTarget(targetId, color);
};

function applyUnifiedColorTarget(targetId, color) {
    const picker = document.getElementById('unifiedColorPicker');
    const output = document.getElementById('unifiedColorValue');
    if (picker && picker.value !== color) picker.value = color;
    if (output) output.value = color, output.textContent = color;
    const target = document.getElementById(targetId);
    if (target && target.value !== color) target.value = color;
    const tabColors = readThemeColorInputs();
    applyThemeSettings(document.getElementById('themeFontSelect')?.value || 'Amiri, serif', document.getElementById('themePresetSelect')?.value || 'green', false, { ...tabColors, [targetId]: color });
}
window.applyUnifiedColorFromPicker = () => applyUnifiedColorTarget(document.getElementById('basicColorTarget')?.value, document.getElementById('unifiedColorPicker')?.value || '#1b4332');
window.syncUnifiedColorPicker = () => {
    const targetId = document.getElementById('basicColorTarget')?.value;
    const target = document.getElementById(targetId);
    applyUnifiedColorTarget(targetId, target?.value || '#1b4332');
};
function installUnifiedColorPalette() {
    const palette = document.getElementById('unifiedColorPalette');
    if (!palette) return;
    palette.innerHTML = '';
    basicPaletteColors.forEach(([color, label]) => {
        const button = document.createElement('button');
        button.type = 'button'; button.title = label; button.textContent = label; button.style.backgroundColor = color;
        if (['#ffffff','#f9a825','#fff9c4','#ffe0b2','#e1bee7','#f8bbd0','#d7ccc8'].includes(color)) button.style.color = '#111';
        button.addEventListener('click', () => window.chooseBasicColor(color));
        palette.appendChild(button);
    });
    syncUnifiedColorPicker();
}

const basicPaletteColors = [
    ['#ffffff', 'أبيض'], ['#000000', 'أسود'], ['#1b4332', 'أخضر'], ['#1565c0', 'أزرق'],
    ['#c62828', 'أحمر'], ['#f9a825', 'أصفر'], ['#ef6c00', 'برتقالي'], ['#6a1b9a', 'بنفسجي'],
    ['#e91e63', 'وردي'], ['#00a6a6', 'تركوازي'], ['#795548', 'بني'], ['#d4af37', 'ذهبي'],
    ['#b7e4c7', 'أخضر فاتح'], ['#40916c', 'أخضر متوسط'], ['#081c15', 'أخضر داكن'],
    ['#bbdefb', 'أزرق فاتح'], ['#1976d2', 'أزرق متوسط'], ['#0d47a1', 'أزرق داكن'],
    ['#ffcdd2', 'أحمر فاتح'], ['#e53935', 'أحمر متوسط'], ['#8e0000', 'أحمر داكن'],
    ['#fff9c4', 'أصفر فاتح'], ['#fbc02d', 'أصفر متوسط'], ['#f57f17', 'أصفر داكن'],
    ['#ffe0b2', 'برتقالي فاتح'], ['#fb8c00', 'برتقالي متوسط'], ['#e65100', 'برتقالي داكن'],
    ['#e1bee7', 'بنفسجي فاتح'], ['#8e24aa', 'بنفسجي متوسط'], ['#38006b', 'بنفسجي داكن'],
    ['#f8bbd0', 'وردي فاتح'], ['#d81b60', 'وردي متوسط'], ['#880e4f', 'وردي داكن'],
    ['#d7ccc8', 'بني فاتح'], ['#8d6e63', 'بني متوسط'], ['#3e2723', 'بني داكن'],
    ['#eeeeee', 'رمادي فاتح'], ['#757575', 'رمادي متوسط'], ['#212121', 'رمادي داكن']
];

function installIndividualColorPalettes() {
    document.querySelectorAll('.admin-section-box input[type="color"]:not(#unifiedColorPicker)').forEach(input => {
        if (input.dataset.paletteReady === '1') return;
        input.dataset.paletteReady = '1';
        const palette = document.createElement('div');
        palette.className = 'individual-color-palette';
        basicPaletteColors.forEach(([color, label]) => {
            const button = document.createElement('button');
            button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
            button.style.backgroundColor = color;
            button.addEventListener('click', () => {
                input.value = color;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof window.previewThemeSettings === 'function') window.previewThemeSettings();
                const variables = { quotesBgColor:'--quotes-bg', topicBgColor:'--topic-bg', dateBgColor:'--date-bg', todayKhatmasBgColor:'--today-bg' };
                if (variables[input.id]) document.documentElement.style.setProperty(variables[input.id], color);
            });
            palette.appendChild(button);
        });
        input.parentElement.appendChild(palette);
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installIndividualColorPalettes);
else setTimeout(installIndividualColorPalettes, 0);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUnifiedColorPalette);
else setTimeout(installUnifiedColorPalette, 0);

function readThemeColorInputs() {
    const colors = {
        all: document.getElementById('allTabColor')?.value || '#1b4332', images: document.getElementById('imagesTabColor')?.value || '#8b4513', fav: document.getElementById('favTabColor')?.value || '#4a0e4e',
        modalBg: document.getElementById('modalBgColor')?.value || '#fffdf0', modalText: document.getElementById('modalTextColor')?.value || '#000000',
        pageBg: document.getElementById('themeBgColor')?.value || '#fcfcf0', card: document.getElementById('themeCardColor')?.value || '#fffdf0', primary: document.getElementById('themePrimaryColor')?.value || '#1b4332',
        accent: document.getElementById('themeAccentColor')?.value || '#d4af37', text: document.getElementById('themeTextColor')?.value || '#111111', border: document.getElementById('themeBorderColor')?.value || '#1b4332'
    };
    ['quotesBgColor','quotesTextColor','quotesBorderColor','topicBgColor','topicTextColor','topicBorderColor','dateBgColor','dateTextColor','todayKhatmasBgColor','todayKhatmasTextColor','todayKhatmasBorderColor','mafatihBgColor','mafatihCardColor','mafatihAccentColor','mafatihTextColor','mafatihBorderColor','mafatihHeaderColor','mafatihTodayBg','mafatihTodayAccent','mafatihTodayText','mafatihTodayBorder'].forEach(id => { const input = document.getElementById(id); if (input) colors[id] = input.value; });
    return colors;
}

window.saveThemeSettings = async () => {
    const font = document.getElementById('themeFontSelect')?.value || 'Amiri, serif';
    const preset = document.getElementById('themePresetSelect')?.value || 'green';
    const tabColors = readThemeColorInputs();
    applyThemeSettings(font, preset, true, tabColors);
    const status = document.getElementById('themeStatus');
    try {
        await db.ref('appSettings/theme').set({
            font,
            preset,
            tabColors,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        if (status) status.innerText = 'تم حفظ المظهر وتثبيته لجميع المستخدمين.';
    } catch (error) {
        console.error('تعذر حفظ المظهر العام:', error);
        if (status) status.innerText = 'حُفظ المظهر على هذا الجهاز فقط؛ تعذر حفظه لجميع المستخدمين.';
    }
};

window.resetThemeSettings = () => {
    localStorage.removeItem('app_theme_settings');
    localStorage.removeItem('app_tab_colors');
    applyThemeSettings('Amiri, serif', 'green', false, { all:'#1b4332', images:'#8b4513', fav:'#1b4332', modalBg:'#fffdf0', modalText:'#000000' });
    const status = document.getElementById('themeStatus');
    if (status) status.innerText = 'تم إرجاع المظهر الافتراضي.';
};

loadThemeSettings();
loadMafatihSettings();
// تؤجل هذه التهيئة لأن إعداداتها تستدعي دالة تُعرّف لاحقًا في الملف.
setTimeout(() => {
    try { loadMafatihTodaySettings(); }
    catch (error) { console.warn('تعذر تحميل إعدادات أعمال اليوم:', error); }
}, 0);

async function loadGlobalThemeSettings() {
    // المشرف يحتاج أيضًا إلى تحميل الألوان المحفوظة من Firebase بعد إعادة فتح التطبيق.
    if (accessMode !== 'full' && accessMode !== 'admin') return;
    try {
        const snapshot = await db.ref('appSettings/theme').once('value');
        const remote = snapshot.val();
        if (!remote || !remote.font || !remote.preset) return;
        const globalSettings = {
            font: remote.font,
            preset: remote.preset,
            tabColors: remote.tabColors || {}
        };
        localStorage.setItem('app_theme_settings', JSON.stringify(globalSettings));
        localStorage.setItem('app_tab_colors', JSON.stringify(globalSettings.tabColors));
        applyThemeSettings(globalSettings.font, globalSettings.preset, false, globalSettings.tabColors);
        // إعدادات المستخدم محلية ويجب أن تُطبّق بعد المظهر العام حتى لا تغطيها قواعده.
        } catch (error) {
        console.warn('تعذر تحميل المظهر العام، سيُستخدم آخر مظهر محفوظ محليًا:', error);
    }
}

loadGlobalThemeSettings();

const defaultQuotesSettings = { texts: [], bg: '#fffdf0', text: '#1b4332', border: '#1b4332', size: 18, speed: 12 };
let dateCycleRestartTimer = null;

function applyQuotesSettings(settings, saveLocal = true) {
    const merged = { ...defaultQuotesSettings, ...(settings || {}) };
    const rawTexts = merged.texts;
    const texts = Array.isArray(rawTexts)
        ? rawTexts
        : (rawTexts && typeof rawTexts === 'object'
            ? Object.keys(rawTexts).sort().map(key => rawTexts[key])
            : String(rawTexts || '').split('\n'));
    const cleanTexts = texts.map(text => String(text || '').trim()).filter(Boolean);
    const box = document.getElementById('quotesBox');
    const track = document.getElementById('quotesTrack');
    if (box && track) {
        const quoteLine = cleanTexts.join('   •   ');
        track.innerHTML = '';
        if (quoteLine) {
            [quoteLine, quoteLine].forEach(textValue => {
                const copy = document.createElement('span');
                copy.className = 'quotes-copy';
                copy.textContent = textValue;
                track.appendChild(copy);
            });
        }
        box.style.display = cleanTexts.length ? 'flex' : 'none';
        box.style.setProperty('--quotes-bg', merged.bg);
        box.style.setProperty('--quotes-text', merged.text);
        box.style.setProperty('--quotes-border', merged.border);
        box.style.setProperty('--quotes-size', `${Math.max(12, Math.min(40, Number(merged.size) || 18))}px`);
        const effectiveSpeed = Math.max(5, Math.min(120, Number(merged.speed) || 12));
        const firstCopy = track.querySelector('.quotes-copy');
        const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
        const cycleDistance = Math.max(1, (firstCopy?.getBoundingClientRect().width || track.scrollWidth / 2) + gap);
        const duration = Math.max(4, Math.min(120, cycleDistance / (effectiveSpeed * 10)));
        box.style.setProperty('--quotes-start', `-${cycleDistance}px`);
        box.style.setProperty('--quotes-duration', `${duration}s`);
        track.style.animation = 'none';
        void track.offsetWidth;
        track.style.animation = '';
    }
    const input = document.getElementById('quotesTextInput');
    const bg = document.getElementById('quotesBgColor');
    const text = document.getElementById('quotesTextColor');
    const border = document.getElementById('quotesBorderColor');
    const size = document.getElementById('quotesFontSize');
    const speed = document.getElementById('quotesSpeed');
    if (input) input.value = cleanTexts.join('\n');
    if (bg) bg.value = merged.bg;
    if (text) text.value = merged.text;
    if (border) border.value = merged.border;
    if (size) size.value = merged.size;
    if (speed) speed.value = merged.speed;
    if (saveLocal) localStorage.setItem('app_quotes_settings', JSON.stringify({ ...merged, texts: cleanTexts }));
}

window.saveQuotesSettings = async () => {
    const settings = {
        texts: (document.getElementById('quotesTextInput')?.value || '').split('\n').map(text => text.trim()).filter(Boolean),
        bg: document.getElementById('quotesBgColor')?.value || defaultQuotesSettings.bg,
        text: document.getElementById('quotesTextColor')?.value || defaultQuotesSettings.text,
        border: document.getElementById('quotesBorderColor')?.value || defaultQuotesSettings.border,
        size: Number(document.getElementById('quotesFontSize')?.value) || defaultQuotesSettings.size,
        speed: Number(document.getElementById('quotesSpeed')?.value) || defaultQuotesSettings.speed
    };
    applyQuotesSettings(settings);
    const status = document.getElementById('quotesStatus');
    try {
        await db.ref('appSettings/quotes').set({ ...settings, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        if (status) status.innerText = 'تم حفظ الاقتباسات وتثبيتها لجميع المستخدمين.';
    } catch (error) {
        console.error('تعذر حفظ الاقتباسات العامة:', error);
        if (status) status.innerText = 'حُفظت على هذا الجهاز فقط؛ تعذر الحفظ العام: ' + (error.code || error.message || 'تحقق من دخول حساب المشرف وصلاحيات قاعدة البيانات.');
    }
};

function loadLocalQuotesSettings() {
    if (accessMode !== 'full') return defaultQuotesSettings;
    try { return JSON.parse(localStorage.getItem('app_quotes_settings') || 'null') || defaultQuotesSettings; } catch (error) { return defaultQuotesSettings; }
}

applyQuotesSettings(loadLocalQuotesSettings(), false);

async function loadGlobalQuotesSettings() {
    try {
        const snapshot = await db.ref('appSettings/quotes').once('value');
        const remote = snapshot.val();
        if (remote) applyQuotesSettings(remote);
    } catch (error) {
        console.warn('تعذر تحميل الاقتباسات العامة، سيُستخدم آخر إعداد محفوظ محليًا:', error);
    }
}

loadGlobalQuotesSettings();

const defaultTopicSettings = { text: '', bg: '#fff8e8', textColor: '#8b4513', border: '#8b4513', size: 18, speed: 20 };
function applyTopicSettings(settings, saveLocal = true) {
    const merged = { ...defaultTopicSettings, ...(settings || {}) };
    const box = document.getElementById('topicBox'), track = document.getElementById('topicTrack');
    if (box && track) {
        const text = String(merged.text || '').trim();
        track.innerHTML = text ? `<span class="topic-copy">${escapeHtml(text)}</span><span class="topic-copy" aria-hidden="true">${escapeHtml(text)}</span>` : '';
        box.style.display = text ? 'flex' : 'none';
        box.style.setProperty('--topic-bg', merged.bg); box.style.setProperty('--topic-text', merged.textColor); box.style.setProperty('--topic-border', merged.border);
        box.style.setProperty('--topic-size', `${Math.max(12, Math.min(40, Number(merged.size) || 18))}px`);
        // الرقم الأصغر أبطأ: ١ = ٢٤٠ ثانية تقريبًا، ١٢٠ = ٢٤ ثانية تقريبًا.
        const duration = Math.max(24, Math.min(240, 250 - (Math.max(1, Math.min(120, Number(merged.speed) || 20)) * 1.9)));
        box.style.setProperty('--topic-duration', `${duration}s`);
    }
    const input = document.getElementById('topicTextInput'); if (input) input.value = merged.text;
    const bg = document.getElementById('topicBgColor'); if (bg) bg.value = merged.bg;
    const color = document.getElementById('topicTextColor'); if (color) color.value = merged.textColor;
    const border = document.getElementById('topicBorderColor'); if (border) border.value = merged.border;
    const size = document.getElementById('topicFontSize'); if (size) size.value = merged.size;
    const speed = document.getElementById('topicSpeed'); if (speed) speed.value = merged.speed;
    if (saveLocal) localStorage.setItem('topic_settings', JSON.stringify(merged));
}
window.saveTopicSettings = async () => {
    const settings = { text: document.getElementById('topicTextInput')?.value.trim() || '', bg: document.getElementById('topicBgColor')?.value || defaultTopicSettings.bg, textColor: document.getElementById('topicTextColor')?.value || defaultTopicSettings.textColor, border: document.getElementById('topicBorderColor')?.value || defaultTopicSettings.border, size: Number(document.getElementById('topicFontSize')?.value) || 18, speed: Number(document.getElementById('topicSpeed')?.value) || 20 };
    applyTopicSettings(settings);
    const status = document.getElementById('topicStatus');
    try { await db.ref('appSettings/topic').set({ ...settings, updatedAt: firebase.database.ServerValue.TIMESTAMP }); if (status) status.textContent = 'تم حفظ موضوع اليوم لجميع المستخدمين.'; }
    catch (error) {
        console.error('تعذر حفظ موضوع اليوم لجميع المستخدمين:', error);
        if (status) status.textContent = `حُفظ على هذا الجهاز فقط؛ تعذر الحفظ العام (${error.code || 'تحقق من قواعد Firebase ودخول المشرف'}).`;
    }
};
async function loadTopicSettings() {
    let local = {}; try { local = JSON.parse(localStorage.getItem('topic_settings') || '{}'); } catch (error) {}
    applyTopicSettings(local, false);
    try { const snapshot = await db.ref('appSettings/topic').once('value'); if (snapshot.val()) { localStorage.setItem('topic_settings', JSON.stringify(snapshot.val())); applyTopicSettings(snapshot.val(), false); } } catch (error) {}
}
loadTopicSettings();

// نهاية تخصيص المظهر والاقتباسات


// ساعة العراق واستخراج أوقات الختمات من العناوين والمحتوى
// التوقيت يُعرّف مبكرًا قبل بدء التطبيق لمنع خطأ TDZ في النوافذ.
iraqTimeZone = 'Asia/Baghdad';
const scheduleWeekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const scheduleWeekdayAliases = {
    'الاحد': 0, 'الأحد': 0, 'الاثنين': 1, 'الإثنين': 1, 'الثلاثاء': 2, 'الاربعاء': 3, 'الأربعاء': 3,
    'الخميس': 4, 'الجمعة': 5, 'السبت': 6
};

function normalizeArabicDigits(value) {
    return String(value || '').replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit)).replace(/[٫،]/g, ':');
}

function getIraqNow() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: iraqTimeZone, year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', hour12:false, weekday:'short' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    const weekdayMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    return { year:Number(get('year')), month:Number(get('month')), day:Number(get('day')), hour:Number(get('hour')) % 24, minute:Number(get('minute')), second:Number(get('second')), weekday:weekdayMap[get('weekday')] ?? 0 };
}

function getApproximateBaghdadSunsetHour(month) {
    // تقريب محلي لغروب بغداد بالدقائق حسب الشهر، لتحديد دخول الليل دون خدمة خارجية.
    const sunsetMinutes = [298, 305, 315, 330, 348, 365, 375, 365, 345, 325, 305, 295];
    return sunsetMinutes[Math.max(0, Math.min(11, Number(month) - 1))];
}

function isIraqNight(now = getIraqNow()) {
    // يبدأ عرض "الليلة" بعد الساعة السادسة مساءً حسب المطلوب.
    return now.hour * 60 + now.minute >= 18 * 60;
}

function getIraqDayLabel(now = getIraqNow()) {
    if (!isIraqNight(now)) return scheduleWeekdays[now.weekday];
    return `ليلة ${scheduleWeekdays[(now.weekday + 1) % 7]}`;
}

function formatIraqClock(now = getIraqNow()) {
    const hour12 = now.hour % 12 || 12;
    const period = now.hour >= 12 ? 'م' : 'ص';
    return `${toArabicNum(String(hour12))}:${toArabicNum(String(now.minute).padStart(2, '0'))} ${period}`;
}

function formatArabicNumericDate(now, hijriOffset = 0) {
    const gregorianDate = new Date(Date.UTC(now.year, now.month - 1, now.day));
    const hijriDate = new Date(gregorianDate);
    hijriDate.setUTCDate(hijriDate.getUTCDate() + (Number(hijriOffset) || 0));
    const hijriParts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
    }).formatToParts(hijriDate);
    const getPart = type => hijriParts.find(part => part.type === type)?.value || '';
    const gregorian = `${toArabicNum(String(now.year))}/${toArabicNum(String(now.month))}/${toArabicNum(String(now.day))}`;
    const hijri = `${toArabicNum(getPart('day'))}/ ${getPart('month')}/ ${toArabicNum(getPart('year'))}هـ`;
    return { gregorian, hijri };
}

function extractAllTimePhrases(source) {
    const text = String(source || '').replace(/\s+/g, ' ').trim();
    const phrases = new Set();
    const day = '(?:الاحد|الأحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الأربعاء|الخميس|الجمعة|السبت)';
    const keyword = '(?:يوم|ليلة|صباح(?:اً|ا)?|صبح|فجر|ظهر|ظهرين|عصر|مغرب|غروب|مساء|الليل|النهار|الساعة|ساعة|وقت|بعد|قبل)';
    const patterns = [
        new RegExp(`(?:${keyword})[^.!?\\n،؛]{0,70}`, 'gi'),
        new RegExp(`(?:${day})[^.!?\\n،؛]{0,70}`, 'gi'),
        /\b(?:[٠-٩\d]{1,2}\s*[:.]\s*[٠-٩\d]{1,2})(?:\s*(?:صباح(?:اً|ا)?|مساء(?:ً|ا)?))?/gi
    ];
    patterns.forEach(pattern => { let match; while ((match = pattern.exec(text))) { const value = match[0].replace(/^[\s،؛:.-]+|[\s،؛:.-]+$/g, '').trim(); if (value.length >= 3) phrases.add(value); } });
    return [...phrases].slice(0, 30);
}

function getArabicPeriodInfo(source) {
    const text = normalizeArabicDigits(source).replace(/[إأآ]/g, 'ا');
    const periods = [];
    const add = (label, startMinute, endMinute, weekdays = []) => periods.push({ label, startMinute, endMinute, weekdays });
    const dayFromText = text.match(/(?:يوم\s+|ليلة\s+)(الاحد|الأحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الأربعاء|الخميس|الجمعة|السبت)/);
    const dayIndex = dayFromText ? scheduleWeekdayAliases[dayFromText[1]] : null;
    const days = dayIndex === undefined || dayIndex === null ? [] : [dayIndex];
    if (/ليلة\s+(الاحد|الأحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الأربعاء|الخميس|الجمعة|السبت)/.test(text)) add('ليلة', 18 * 60, 24 * 60, days);
    if (/قبل\s+صلاة\s+(?:الفجر|الصبح)|قبل\s+الصبح/.test(text)) add('قبل صلاة الصبح', 4 * 60, 5 * 60, days);
    else if (/(?:بعد\s+)?صلاة\s+(?:الفجر|الصبح)|وقت\s+الصبح|الصباح/.test(text)) add('بعد صلاة الصبح', 5 * 60, 10 * 60, days);
    if (/قبل\s+صلاة\s+(?:الظهر|الظهرين)|قبل\s+الظهر/.test(text)) add('قبل صلاة الظهر', 11 * 60, 12 * 60, days);
    else if (/(?:بعد\s+)?صلاة\s+(?:الظهر|الظهرين)|وقت\s+الظهر/.test(text)) add('بعد صلاة الظهر', 12 * 60, 16 * 60, days);
    if (/(?:عصر|بعد\s+صلاة\s+العصر)|وقت\s+العصر/.test(text)) add('العصر', 15 * 60, 19 * 60, days);
    if (/قبل\s+صلاة\s+المغرب|قبل\s+المغرب/.test(text)) add('قبل صلاة المغرب', 17 * 60, 18 * 60, days);
    else if (/(?:بعد\s+صلاة\s+المغرب|المغرب|بعد\s+الغروب|المساء)/.test(text)) add('بعد المغرب', 18 * 60, 24 * 60, days);
    if (/(?:بعد\s+صلاة\s+العشاء|بعد\s+العشاء|وقت\s+العشاء|العشاء)/.test(text)) add('بعد صلاة العشاء', 19 * 60, 24 * 60, days);
    if (/(?:عند\s+السحر|وقت\s+السحر|السحر)/.test(text)) add('عند السحر', 2 * 60, 5 * 60, days);
    if (/(?:عند\s+الفجر|وقت\s+الفجر|الفجر)/.test(text) && !periods.some(p => p.label.includes('الصبح'))) add('عند الفجر', 4 * 60, 6 * 60, days);
    if (/(?:عند\s+الزوال|وقت\s+الزوال|الزوال)/.test(text)) add('عند الزوال', 11 * 60, 13 * 60, days);
    if (/(?:عند\s+الغروب|وقت\s+الغروب|الغروب)/.test(text)) add('عند الغروب', 17 * 60, 19 * 60, days);
    if (/(?:عند\s+شروق\s+الشمس|وقت\s+الشروق|شروق\s+الشمس|الشروق)/.test(text)) add('عند شروق الشمس', 5 * 60, 8 * 60, days);
    if (/(?:عند\s+الضحى|وقت\s+الضحى|الضحى)/.test(text)) add('عند الضحى', 7 * 60, 11 * 60, days);
    if (/يوم\s+(الاحد|الأحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الأربعاء|الخميس|الجمعة|السبت)/.test(text) && !periods.length) add('خلال اليوم', 0, 24 * 60, days);
    return periods;
}

function extractScheduleInfo(record = {}) {
    const title = String(record.title || '').trim();
    const content = String(record.content || record.text || record.description || '').trim();
    const source = `${title}\n${content}`;
    const normalized = normalizeArabicDigits(source);
    const timeMatches = [];
    const addTime = (rawHour, rawMinute = 0, period = '') => {
        let hour = Number(rawHour), minute = Number(rawMinute) || 0;
        if (/مساء/.test(period) && hour < 12) hour += 12;
        if (/صباح/.test(period) && hour === 12) hour = 0;
        if (hour > 23 || minute > 59) return;
        if (!timeMatches.some(item => item.hour === hour && item.minute === minute)) timeMatches.push({ hour, minute, text: `${toArabicNum(String(hour).padStart(2, '0'))}:${toArabicNum(String(minute).padStart(2, '0'))}` });
    };
    let match;
    const clockRegex = /(?:الساعة\s*)?\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?)?/g;
    while ((match = clockRegex.exec(normalized))) addTime(match[1], match[2], match[3] || '');
    const spokenClockRegex = /الساعة\s*([0-9]{1,2})(?:\s*و\s*([0-9]{1,2}))?\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?)/g;
    while ((match = spokenClockRegex.exec(normalized))) addTime(match[1], match[2] || 0, match[3] || '');
    const dayMatches = [];
    Object.entries(scheduleWeekdayAliases).forEach(([name, index]) => { if (source.includes(name) && !dayMatches.includes(index)) dayMatches.push(index); });
    const periods = getArabicPeriodInfo(source);
    periods.forEach(period => period.weekdays.forEach(day => { if (!dayMatches.includes(day)) dayMatches.push(day); }));
    const number = extractNumber(title);
    const timePhrases = extractAllTimePhrases(source);
    return { title: title || 'بدون عنوان', content, number, times: timeMatches, periods, timePhrases, weekdays: dayMatches, hasImage: hasKhatmaImage(record) };
}

function getScheduleRows(query = '') {
    const needle = String(query || '').trim().toLocaleLowerCase('ar');
    return Object.entries(allKhatmas || {}).map(([key, record]) => ({ key, info: extractScheduleInfo(record) })).filter(row => {
        if (!needle) return true;
        return `${row.info.title}\n${row.info.content}`.toLocaleLowerCase('ar').includes(needle);
    }).sort((a, b) => getTodayScheduleMinute(a) - getTodayScheduleMinute(b) || (a.info.number || 999999) - (b.info.number || 999999));
}

function getScheduleDisplayTime(row) {
    const override = getScheduleOverride(row.key);
    if (override) return formatArabic12Time(override.hour, override.minute);
    if (row.info.times?.length) return formatArabic12Time(row.info.times[0].hour, row.info.times[0].minute);
    if (row.info.periods?.length) return row.info.periods.map(period => period.label).join('، ');
    return row.info.timePhrases?.[0] || 'غير محدد';
}

function getActiveScheduleRows(now = getIraqNow()) {
    const minuteNow = now.hour * 60 + now.minute;
    const activeWeekday = isIraqNight(now) ? (now.weekday + 1) % 7 : now.weekday;
    return getScheduleRows('').filter(row => {
        const override = getScheduleOverride(row.key);
        const exactTimes = override ? [override] : (row.info.times || []);
        if (row.info.weekdays.length && !row.info.weekdays.includes(activeWeekday)) return false;
        if (exactTimes.length && exactTimes.some(time => {
            const start = time.hour * 60 + time.minute;
            return minuteNow >= start && minuteNow < start + 60;
        })) return true;
        return (row.info.periods || []).some(period => {
            if (period.weekdays?.length && !period.weekdays.includes(activeWeekday)) return false;
            if (period.label === 'خلال اليوم' || period.label === 'ليلة') {
                return period.label === 'ليلة' && isIraqNight(now);
            }
            const start = Number(period.startMinute), end = Number(period.endMinute);
            return Number.isFinite(start) && Number.isFinite(end) && end > start && minuteNow >= start && minuteNow < end;
        });
    });
}

function isScheduleTimeActive(time, now = getIraqNow()) {
    const parsed = typeof time === 'string' ? normalizeScheduleTime(time) : time;
    if (!parsed) return false;
    const minuteNow = now.hour * 60 + now.minute;
    const start = parsed.hour * 60 + parsed.minute;
    return minuteNow >= start && minuteNow < start + 60;
}

function isManualTodayKhatmaActive(parts, now = getIraqNow()) {
    const time = normalizeScheduleTime(parts?.[1] || '');
    const day = String(parts?.[2] || '').trim();
    if (day) {
        const expectedDay = scheduleWeekdays.findIndex(name => name === day);
        const activeWeekday = isIraqNight(now) ? (now.weekday + 1) % 7 : now.weekday;
        if (expectedDay >= 0 && expectedDay !== activeWeekday) return false;
    }
    return time ? isScheduleTimeActive(time, now) : false;
}

function isTodayKhatmaLabelActive(label, now = getIraqNow()) {
    const text = String(label || '').trim();
    if (!text) return false;
    const exactTime = text.match(/\(([^()]*(?:ص|م|am|pm)[^()]*)\)/i)?.[1] || text.match(/\(([^()]*(?:\d|[٠-٩])[^()]*)\)/)?.[1] || '';
    const parsedTime = normalizeScheduleTime(exactTime);
    if (parsedTime) return isScheduleTimeActive(parsedTime, now);
    const periods = getArabicPeriodInfo(text);
    if (!periods.length) return false;
    const minuteNow = now.hour * 60 + now.minute;
    const activeWeekday = isIraqNight(now) ? (now.weekday + 1) % 7 : now.weekday;
    return periods.some(period => {
        if (period.weekdays?.length && !period.weekdays.includes(activeWeekday)) return false;
        if (period.label === 'ليلة') return isIraqNight(now);
        return minuteNow >= Number(period.startMinute) && minuteNow < Number(period.endMinute);
    });
}

function renderScheduleResults(rows) {
    const box = document.getElementById('scheduleResults');
    const status = document.getElementById('scheduleSearchStatus');
    if (!box) return;
    box.style.display = 'block';
    box.classList.add('schedule-floating');
    if (box.parentElement !== document.body) document.body.appendChild(box);
    if (!rows.length) { box.innerHTML = `<div class="schedule-window-title"><span>جدول أوقات الختمات</span><button type="button" class="schedule-window-close" onclick="clearKhatmaScheduleSearch()">إغلاق</button></div><div style="padding:10px;">لا توجد نتائج.</div>`; if (status) status.textContent = 'لم يتم العثور على ختمات مطابقة.'; return; }
    box.innerHTML = `<div class="schedule-window-title"><span>جدول أوقات الختمات المختصر</span><button type="button" class="schedule-window-close" onclick="clearKhatmaScheduleSearch()">إغلاق</button></div><table class="date-schedule-table"><thead><tr><th>الرقم</th><th>العنوان</th><th>اليوم</th><th>الوقت</th><th>وقت مخصص</th><th>النوع</th></tr></thead><tbody>${rows.map(row => {
        const i = row.info;
        const days = i.weekdays.length ? i.weekdays.map(day => scheduleWeekdays[day]).join('، ') : 'غير محدد';
        const override = getScheduleOverride(row.key);
        const times = getScheduleDisplayTime(row);
        const inputId = `schedule-time-${encodeURIComponent(row.key)}`;
        return `<tr><td>${i.number ? toArabicNum(i.number) : '—'}</td><td>${escapeHtml(i.title)}<div class="schedule-muted">${escapeHtml(i.content.slice(0, 180))}${i.content.length > 180 ? '…' : ''}</div></td><td>${escapeHtml(days)}</td><td>${escapeHtml(times)}</td><td><input id="${inputId}" type="text" inputmode="text" placeholder="٦:٣٠ م" value="${override ? formatArabic12Time(override.hour, override.minute) : ''}" style="width:100px; padding:5px; box-sizing:border-box; direction:rtl;"><button type="button" class="action-btn" onclick="saveKhatmaScheduleTime('${escapeHtml(row.key)}')">حفظ</button></td><td>${i.hasImage ? 'مصورة' : 'نصية'}</td></tr>`;
    }).join('')}</tbody></table>`;
    if (status) status.textContent = `تم تحليل ${toArabicNum(rows.length)} ختمة.`;
}

// إعادة ترتيب عناصر الصفحة الرئيسية عند العودة من صفحات التصفح.
// هذه الدالة مطلوبة قبل setAppPage حتى لا تتوقف التهيئة بخطأ JavaScript.
function arrangeHomeSections() {
    const sticky = document.querySelector('.sticky-top-container');
    if (!sticky) return;
    const controls = document.querySelector('.search-container');
    const tabs = document.querySelector('.tabs-container');
    const topicTabs = document.getElementById('topicTabs');
    if (controls) sticky.appendChild(controls);
    if (tabs) sticky.appendChild(tabs);
    if (topicTabs) sticky.appendChild(topicTabs);
}
window.arrangeHomeSections = arrangeHomeSections;

let scheduleOverrides = {};
let scheduleSearchShowing = false;

function setAppPage(page) {
    const pages = [null, null, document.getElementById('pageTwo'), document.getElementById('pageThree'), document.getElementById('pageFour'), document.getElementById('pageFive')];
    const controls = document.querySelector('.search-container');
    const tabs = document.querySelector('.tabs-container');
    const topicTabs = document.getElementById('topicTabs');
    const list = document.getElementById('listContainer');
    const sticky = document.querySelector('.sticky-top-container');
    if (!controls || !tabs || !sticky || !list) return;
    page = Math.max(1, Math.min(5, Number(page) || 1));
    // الصفحة الرئيسية تعرض الخانات الرئيسية فقط؛ البحث والتبويبات للختمات فقط.
    const homeControlsHidden = page === 1;
    [controls, tabs].forEach(element => {
        if (element) element.style.display = homeControlsHidden ? 'none' : '';
    });
    document.body.classList.remove('app-page-1', 'app-page-2', 'app-page-3', 'app-page-4', 'app-page-5');
    document.body.classList.add(`app-page-${page}`);
    if (page >= 2 && page <= 4 && pages[page]) {
        pages[page].append(controls, tabs, topicTabs, list);
        list.style.display = 'block';
        if (page === 2) switchTab('all');
        if (page === 3) switchTab('images');
        if (page === 4) switchTab('fav');
        try { renderTodayKhatmas(); } catch (error) { console.warn('تعذر تحديث ختمات اليوم:', error); }
    } else if (page === 5 && pages[5]) {
        pages[5].append(controls, tabs, topicTabs);
        document.body.appendChild(list);
        list.style.display = 'none';
        document.body.classList.add('app-page-5');
        if (typeof window.mafatihInitPage === 'function') window.mafatihInitPage();
    } else {
        sticky.append(controls, tabs, topicTabs);
        if (pages[2]) pages[2].appendChild(list);
        list.style.display = 'none';
        switchTab('all');
    }
    document.body.dataset.appPage = String(page);
}
window.setAppPage = setAppPage;
(() => {
    const init = () => {
        if (document.body.classList.contains('access-ready') && typeof window.setAppPage === 'function') {
            try { window.setAppPage(1); } catch (error) { console.error('تعذر تهيئة الصفحة الرئيسية:', error); }
        } else setTimeout(init, 250);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
})();

(() => {
    // سحب مباشر باللمس من أي مكان في الصفحات، بما فيها المواضيع ومفاتيح الجنان.
    let startX = 0, startY = 0, tracking = false;
    const isTextControl = target => target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
    document.addEventListener('touchstart', event => {
        if (isTextControl(event.target)) { tracking = false; return; }
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
    }, { passive: true });
    document.addEventListener('touchend', event => {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches && event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        const current = Number(document.body.dataset.appPage || 1);
        setAppPage(dx < 0 ? (current === 5 ? 1 : current + 1) : (current === 1 ? 5 : current - 1));
    }, { passive: true });
    document.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
})();
// تثبيت الصفحة الرئيسية عند بدء التطبيق حتى يعمل السحب من أول فتح.
window.addEventListener('load', () => {
    setTimeout(() => {
        if (!document.body.dataset.appPage && typeof setAppPage === 'function') setAppPage(1);
    }, 0);
});

function getTodayScheduleMinute(row) {
    const override = getScheduleOverride(row.key);
    if (override) return override.hour * 60 + override.minute;
    if (row.info.times?.length) return row.info.times[0].hour * 60 + row.info.times[0].minute;
    if (row.info.periods?.length) return row.info.periods[0].startMinute;
    return 24 * 60 + (row.info.number || 999999);
}

function findTodayKhatmaKeyByTitle(title) {
    const normalized = String(title || '').trim().toLocaleLowerCase('ar');
    if (!normalized) return '';
    const entry = Object.entries(allKhatmas || {}).find(([, item]) => {
        const itemTitle = String(item?.title || '').trim().toLocaleLowerCase('ar');
        return itemTitle === normalized || itemTitle.includes(normalized) || normalized.includes(itemTitle);
    });
    return entry?.[0] || '';
}

function findTodayKhatmaKeyByLabel(label) {
    const raw = String(label || '').trim();
    const numberMatch = normalizeArabicDigits(raw).match(/^\s*(\d+)/);
    const number = numberMatch ? Number(numberMatch[1]) : null;
    const title = raw.replace(/^\s*[\d٠-٩]+\s*[—–-]?\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLocaleLowerCase('ar');
    const entries = Object.entries(allKhatmas || {});
    const byTitle = entries.find(([, item]) => {
        const itemTitle = String(item?.title || '').trim();
        return title && itemTitle.toLocaleLowerCase('ar').includes(title);
    });
    if (byTitle?.[0]) return byTitle[0];
    const byNumber = entries.find(([, item]) => number !== null && extractNumber(item?.title || '') === number);
    return byNumber?.[0] || findTodayKhatmaKeyByTitle(title);
}

function showTodayKhatmaDirect(key) {
    const record = allKhatmas?.[key];
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('displayTitle');
    const content = document.getElementById('displayContent');
    if (!record || !overlay || !title || !content) return false;
    title.textContent = getImageDisplayTitles()[key] || record.title || 'بدون عنوان';
    let html = '';
    if (record.image && String(record.image).trim()) {
        html += `<div style="text-align:center;margin-bottom:15px;"><img src="${escapeHtml(record.image)}" alt="${escapeHtml(record.title || 'الختمة')}" style="max-width:100%;height:auto;border-radius:8px;"></div>`;
    }
    if (record.content && String(record.content).trim()) {
        html += `<div>${escapeHtml(String(record.content)).replace(/\n/g, '<br>')}</div>`;
    }
    content.innerHTML = html || 'لا يوجد محتوى لهذه الختمة.';
    overlay.style.display = 'flex';
    return true;
}

window.openTodayKhatma = index => {
    const row = document.querySelector(`#todayKhatmasTrack .today-khatma-row[data-index="${Number(index)}"]`);
    const key = row?.dataset?.khatmaKey || '';
    if (key && allKhatmas?.[key]) {
        showTodayKhatmaDirect(key);
        if (allKhatmas[key].imagePending && !(allKhatmas[key].image && String(allKhatmas[key].image).trim())) {
            Promise.resolve(ensureFullKhatma(key)).then(() => showTodayKhatmaDirect(key)).catch(error => console.warn('تعذر تحميل محتوى الختمة الكامل:', error));
        }
        return;
    }
    const title = row?.dataset?.khatmaTitle || '';
    const matchedKey = findTodayKhatmaKeyByTitle(title);
    if (matchedKey) showTodayKhatmaDirect(matchedKey);
};

function renderTodayKhatmas() {
    const track = document.getElementById('todayKhatmasTrack');
    const box = document.getElementById('todayKhatmasBox');
    if (!track) return;
    if (box) box.style.display = 'block';
    const custom = document.getElementById('todayKhatmasCustomText');
    const customText = String(window.todayKhatmasSettings?.text || '').trim();
    if (custom) {
        custom.textContent = customText;
        custom.style.display = customText ? 'block' : 'none';
    }
    // لا نعتبر كلمات مثل «المغرب» أو «الظهر» وحدها جدولًا؛ يجب أن تكون
    // ضمن عبارة صريحة تدل على يوم أو وقت أداء الختمة.
    const excluded = (window.todayKhatmasSettings?.excluded || []).map(v => String(v).toLocaleLowerCase('ar'));
    const rows = getActiveScheduleRows().filter(row => {
        const title = `${row.info.number || ''} ${row.info.title}`.toLocaleLowerCase('ar');
        return !excluded.some(value => value && title.includes(value));
    });
    const labels = rows.map(row => {
        const info = row.info;
        const override = getScheduleOverride(row.key);
        const time = override ? formatArabic12Time(override.hour, override.minute) : (info.times[0] ? formatArabic12Time(info.times[0].hour, info.times[0].minute) : (info.periods[0]?.label || info.timePhrases[0] || 'وقت مرن'));
        return { label: `${info.number ? toArabicNum(info.number) + ' — ' : ''}${getScheduleDisplayTitle(info)}${info.hasImage ? ' — ختمة مصورة' : ''} (${time})`, key: row.key, title: info.title || getScheduleDisplayTitle(info) };
    }).slice(0, 120);
    const now = getIraqNow();
    const manual = (window.todayKhatmasSettings?.manual || []).map(line => {
        const parts = String(line).split('|').map(v => v.trim());
        return { parts, label: parts.length >= 2 ? `${parts[0]} (${parts[1]}${parts[2] ? ` — ${parts[2]}` : ''})` : parts[0], key: findTodayKhatmaKeyByTitle(parts[0]), title: parts[0] };
    }).filter(item => item.parts.length >= 2 && isManualTodayKhatmaActive(item.parts, now));
    const generatedValue = [...labels, ...manual].length ? [...labels, ...manual] : [{ label: 'لا توجد ختمات حاليا', key: '', title: '' }];
    const overrideText = String(window.todayKhatmasSettings?.displayOverride || '').trim();
    const overrideItems = overrideText.split(/\n+/).map(v => v.trim()).filter(Boolean).filter(label => isTodayKhatmaLabelActive(label, now)).map(label => ({ label, key: findTodayKhatmaKeyByLabel(label), title: label }));
    const value = overrideText && overrideItems.length ? overrideItems : generatedValue;
    const displayInput = document.getElementById('todayKhatmasDisplayText'); if (displayInput && document.activeElement !== displayInput) displayInput.value = value.map(v => v.label).join('\n');
    // خانة ثابتة جديدة: لا حركة ولا transform ولا دورة زمنية، حتى يبقى النص ظاهرًا دائمًا.
    const isEmpty = value.length === 1 && value[0].label === 'لا توجد ختمات حاليا';
    track.innerHTML = value.map((item, index) => `<button type="button" class="today-khatma-row${isEmpty ? ' today-khatma-empty' : ''}" data-index="${index}" data-khatma-key="${escapeHtml(item.key || '')}" data-khatma-title="${escapeHtml(item.title || '')}" ${isEmpty ? 'disabled' : ''}>${escapeHtml(item.label)}</button>`).join('');
    track.querySelectorAll('.today-khatma-row:not(:disabled)').forEach(row => {
        row.addEventListener('click', () => window.openTodayKhatma(row.dataset.index));
    });
    track.style.animation = 'none';
    track.style.transform = 'none';
    track.style.width = '100%';
    track.style.display = 'block';
    track.style.whiteSpace = 'normal';
    track.style.overflowY = 'auto';
    track.style.maxHeight = '220px';
    track.style.textAlign = 'right';
    track.style.direction = 'rtl';
}

let todayKhatmasRefreshTimer = null;
function startTodayKhatmasRefresh() {
    if (todayKhatmasRefreshTimer) clearInterval(todayKhatmasRefreshTimer);
    todayKhatmasRefreshTimer = setInterval(() => {
        try { renderTodayKhatmas(); } catch (error) { console.warn('تعذر تحديث ختمات اليوم حسب الوقت:', error); }
    }, 30000);
}
startTodayKhatmasRefresh();

window.todayKhatmasSettings = { text: '', bg: '#fffdf0', textColor: '#1b4332', border: '#1b4332', size: 18, motionLevel: 50 };
function applyTodayKhatmasSettings(settings) {
    const incoming = settings || {};
    const legacyLevel = incoming.motionLevel || (incoming.speed ? Math.round(Math.max(1, Math.min(120, Number(incoming.speed))) / 1.2) : 50);
    window.todayKhatmasSettings = { ...window.todayKhatmasSettings, ...incoming, motionLevel: Math.max(1, Math.min(100, Number(legacyLevel) || 50)) };
    const s = window.todayKhatmasSettings;
    const displayText = document.getElementById('todayKhatmasDisplayText'); if (displayText) displayText.value = s.displayOverride || '';
    const excluded = document.getElementById('todayKhatmasExcluded'); if (excluded) excluded.value = (s.excluded || []).join('\n');
    const manual = document.getElementById('todayKhatmasManual'); if (manual) manual.value = (s.manual || []).join('\n');
    document.documentElement.style.setProperty('--today-bg', s.bg);
    document.documentElement.style.setProperty('--today-text', s.textColor);
    document.documentElement.style.setProperty('--today-border', s.border);
    document.documentElement.style.setProperty('--today-size', `${Math.max(12, Math.min(40, Number(s.size) || 20))}px`);
    const track = document.getElementById('todayKhatmasTrack');
    if (track) {
        const level = Math.max(1, Math.min(100, Number(s.motionLevel) || 50));
        track.style.animationIterationCount = 'infinite'; track.style.animationTimingFunction = 'linear'; track.style.animationPlayState = 'running';
        track.style.fontSize = 'var(--today-size)';
    }
    const input = document.getElementById('todayKhatmasTextInput');
    if (input) input.value = s.text || '';
    const bg = document.getElementById('todayKhatmasBgColor'); if (bg) bg.value = s.bg;
    const color = document.getElementById('todayKhatmasTextColor'); if (color) color.value = s.textColor;
    const border = document.getElementById('todayKhatmasBorderColor'); if (border) border.value = s.border;
    const size = document.getElementById('todayKhatmasSize'); if (size) size.value = s.size;
    const motion = document.getElementById('todayKhatmasMotionLevel'); if (motion) { motion.value = s.motionLevel; updateTodayKhatmasMotionLabel(s.motionLevel); }
    renderTodayKhatmas();
}
window.updateTodayKhatmasMotionLabel = value => { const n = Math.max(1, Math.min(100, Number(value) || 50)); const label = n < 25 ? 'بطيء جدًا' : n < 45 ? 'بطيء' : n < 65 ? 'متوسط' : n < 85 ? 'سريع' : 'سريع جدًا'; const duration = Math.round(300 - (n - 1) * (240 / 99)); const el = document.getElementById('todayKhatmasMotionLabel'); if (el) el.textContent = `${n} / 100 — ${label} — دورة ${duration} ثانية`; }; window.setTodayKhatmasMotion = value => { const input = document.getElementById('todayKhatmasMotionLevel'); if (input) { input.value = value; updateTodayKhatmasMotionLabel(value); } };
window.saveTodayKhatmasSettings = async () => {
    const status=document.getElementById('todayKhatmasStatus');
    try { await requireAdminSession(); } catch (error) { if(status) status.textContent='انتهت جلسة المشرف؛ سجّل الدخول من جديد ثم حاول.'; return; }
    const settings = { text: document.getElementById('todayKhatmasTextInput')?.value.trim() || '', displayOverride: document.getElementById('todayKhatmasDisplayText')?.value || '', excluded: String(document.getElementById('todayKhatmasExcluded')?.value || '').split(/\n+/).map(v => v.trim()).filter(Boolean), manual: String(document.getElementById('todayKhatmasManual')?.value || '').split(/\n+/).map(v => v.trim()).filter(Boolean), bg: document.getElementById('todayKhatmasBgColor')?.value || '#fffdf0', textColor: document.getElementById('todayKhatmasTextColor')?.value || '#1b4332', border: document.getElementById('todayKhatmasBorderColor')?.value || '#1b4332', size: Number(document.getElementById('todayKhatmasSize')?.value) || 18, motionLevel: Number(document.getElementById('todayKhatmasMotionLevel')?.value) || 50, updatedAt:Date.now() };
    localStorage.setItem('today_khatmas_settings', JSON.stringify(settings)); applyTodayKhatmasSettings(settings); renderTodayKhatmas();
    try { if (!firebase.auth().currentUser) throw new Error('يجب تسجيل دخول المشرف أولًا.'); const ref=db.ref('appSettings/todayKhatmas'); await ref.set({ ...settings, updatedAt:firebase.database.ServerValue.TIMESTAMP }); if (!(await ref.once('value')).exists()) throw new Error('لم يتم تأكيد الحفظ.'); if(status) status.textContent='تم حفظ إعدادات ختمات اليوم لجميع المستخدمين.'; } catch(error) { console.error(error); if(status) status.textContent=`فشل الحفظ: ${error.code||error.message||'تحقق من قواعد Firebase.'}`; }
};
async function loadTodayKhatmasSettings() {
    let local={}; try { local=JSON.parse(localStorage.getItem('today_khatmas_settings')||'{}'); } catch(error) {}
    let remote={}; try { const snapshot=await db.ref('appSettings/todayKhatmas').once('value'); if(snapshot.val()) remote=snapshot.val(); } catch(error) {}
    const saved=Number(local.updatedAt||0)>=Number(remote.updatedAt||0)?{...remote,...local}:{...local,...remote};
    localStorage.setItem('today_khatmas_settings',JSON.stringify(saved)); applyTodayKhatmasSettings(saved);
}

let dailyMessages = [];
function renderDailyMessage() {
    const box = document.getElementById('dailyMessageBox'), image = document.getElementById('dailyMessageImage');
    if (!box || !image || !dailyMessages.length) return;
    const scheduled = dailyMessages.map((item, index) => {
        const src = typeof item === 'string' ? item : item?.src;
        const parsed = typeof item === 'object' && item?.time ? normalizeScheduleTime(item.time) : null;
        return { src, index, minute: parsed ? parsed.hour * 60 + parsed.minute : null };
    }).filter(item => item.src);
    const timed = scheduled.filter(item => item.minute !== null).sort((a, b) => a.minute - b.minute);
    let selected;
    if (timed.length) {
        // يبقى دعم الأوقات المخصصة لمن يحتاجه المشرف.
        const now = getIraqNow();
        const currentMinute = now.hour * 60 + now.minute;
        selected = [...timed].reverse().find(item => item.minute <= currentMinute) || timed[timed.length - 1];
    } else {
        // بدون أوقات: كل صورة تُعرض 24 ساعة كاملة، ثم تنتقل الصورة التالية.
        const now = getIraqNow();
        const daySerial = Math.floor(Date.UTC(now.year, now.month - 1, now.day) / 86400000);
        selected = scheduled[((daySerial % scheduled.length) + scheduled.length) % scheduled.length];
    }
    image.src = selected.src;
    box.style.display = 'block';
}
async function loadDailyMessages() {
    try {
        const snapshot = await db.ref('appSettings/dailyMessages').once('value');
        dailyMessages = (Array.isArray(snapshot.val()) ? snapshot.val() : Object.values(snapshot.val() || {})).filter(Boolean);
        const input = document.getElementById('dailyMessagesInput');
        if (input) input.value = dailyMessages.map(item => typeof item === 'string' ? item : item.src).filter(Boolean).filter(value => /^https?:\/\//i.test(value)).join('\n');
        const times = document.getElementById('dailyMessagesTimesInput');
        if (times) times.value = dailyMessages.map(item => typeof item === 'object' ? (item.time || '') : '').join('\n');
        renderDailyMessage();
    } catch (error) { console.warn('تعذر تحميل رسالة اليوم:', error); }
}
setInterval(renderDailyMessage, 60 * 1000);
window.saveDailyMessages = async () => {
    const input = document.getElementById('dailyMessagesInput');
    const status = document.getElementById('dailyMessagesStatus');
    const urls = String(input?.value || '').split(/\n+/).map(value => value.trim()).filter(value => /^https?:\/\//i.test(value));
    const times = String(document.getElementById('dailyMessagesTimesInput')?.value || '').split(/\n/).map(value => value.trim());
    const files = [...(document.getElementById('dailyMessageFileInput')?.files || [])];
    try {
        const uploaded = [];
        for (const file of files) uploaded.push(await compressDailyMessageImage(file));
        const sources = [...urls, ...uploaded];
        const values = sources.map((src, index) => ({ src, time: times[index] || '' }));
        await db.ref('appSettings/dailyMessages').set(values); dailyMessages = values; renderDailyMessage(); if (status) status.textContent = `تم حفظ ${toArabicNum(values.length)} صورة مع أوقات عرضها.`;
    }
    catch (error) { if (status) status.textContent = 'تعذر الحفظ؛ تأكد من دخول المشرف.'; }
};

function compressDailyMessageImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
                const maxSide = 1200;
                const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function normalizeScheduleTime(value) {
    const normalized = normalizeArabicDigits(value).replace(/\s+/g, '').toLowerCase();
    const periodMatch = normalized.match(/(ص|م|am|pm)$/);
    const period = periodMatch?.[1] || '';
    const clock = period ? normalized.slice(0, -period.length) : normalized;
    const match = clock.match(/^(\d{1,2})(?::|٫|،|\.)(\d{1,2})$/) || clock.match(/^(\d{1,2})$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (period && (hour < 1 || hour > 12)) return null;
    if (period === 'م' || period === 'pm') hour = hour === 12 ? 12 : hour + 12;
    if (period === 'ص' || period === 'am') hour = hour === 12 ? 0 : hour;
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, text: `${toArabicNum(String(hour).padStart(2, '0'))}:${toArabicNum(String(minute).padStart(2, '0'))}` };
}

function formatArabic12Time(hour, minute) {
    const h = Number(hour) || 0;
    const hour12 = h % 12 || 12;
    return `${toArabicNum(String(hour12))}:${toArabicNum(String(Number(minute) || 0).padStart(2, '0'))} ${h >= 12 ? 'م' : 'ص'}`;
}

function getScheduleOverride(key) {
    return normalizeScheduleTime(scheduleOverrides?.[key]?.time || '');
}

window.searchKhatmaSchedules = (query) => {
    const input = document.getElementById('scheduleSearchInput');
    const actualQuery = query === undefined ? (input?.value || '') : query;
    if (input && query !== undefined) input.value = query;
    scheduleSearchShowing = true;
    renderScheduleResults(getScheduleRows(actualQuery));
};
window.clearKhatmaScheduleSearch = () => { scheduleSearchShowing = false; const input = document.getElementById('scheduleSearchInput'); if (input) input.value = ''; const box = document.getElementById('scheduleResults'); const status = document.getElementById('scheduleSearchStatus'); if (box) { box.innerHTML = ''; box.style.display = 'none'; box.classList.remove('schedule-floating'); } if (status) status.textContent = ''; };

window.saveKhatmaScheduleTime = async key => {
    const input = document.getElementById(`schedule-time-${encodeURIComponent(key)}`);
    const status = document.getElementById('scheduleSearchStatus');
    const raw = input?.value?.trim() || '';
    if (raw && !normalizeScheduleTime(raw)) {
        if (status) status.textContent = 'اكتب الوقت بصيغة 12 ساعة مثل ٦:٣٠ م أو 6:30 PM.';
        return;
    }
    try {
        const ref = db.ref(`appSettings/scheduleOverrides/${key}`);
        if (raw) {
            const parsed = normalizeScheduleTime(raw);
            const value = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
            await ref.set({ time: value, updatedAt: firebase.database.ServerValue.TIMESTAMP });
            scheduleOverrides[key] = { time: value };
            if (status) status.textContent = 'تم حفظ وقت الختمة لجميع المستخدمين.';
        } else {
            await ref.remove();
            delete scheduleOverrides[key];
            if (status) status.textContent = 'تم حذف الوقت المخصص والعودة إلى الوقت المستخرج من العنوان.';
        }
        renderDateBar();
        if (scheduleSearchShowing) renderScheduleResults(getScheduleRows(document.getElementById('scheduleSearchInput')?.value || ''));
    } catch (error) {
        console.error('تعذر حفظ وقت الختمة:', error);
        if (status) status.textContent = 'تعذر حفظ الوقت. تأكد من تسجيل دخول المشرف.';
    }
};

async function loadScheduleOverrides() {
    try {
        const snapshot = await db.ref('appSettings/scheduleOverrides').once('value');
        scheduleOverrides = snapshot.val() || {};
        renderDateBar();
        if (scheduleSearchShowing) renderScheduleResults(getScheduleRows(document.getElementById('scheduleSearchInput')?.value || ''));
    } catch (error) { console.warn('تعذر تحميل أوقات الختمات المخصصة:', error); }
}

function getPrayerTimesForLocation(now = getIraqNow(), latitudeDeg = 33.3152, longitudeDeg = 44.3661, utcOffsetHours = 3) {
    const date = new Date(Date.UTC(now.year, now.month - 1, now.day));
    const jd = date.getTime() / 86400000 + 2440587.5;
    const d = jd - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * Math.PI / 180;
    const q = (280.459 + 0.98564736 * d) * Math.PI / 180;
    const L = (q + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180) % (2 * Math.PI);
    const e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    const decl = Math.asin(Math.sin(e) * Math.sin(L));
    const eqTime = (q - Math.atan2(Math.sin(q) * Math.cos(e), Math.cos(q))) * 4 * 180 / Math.PI + 1.915 * Math.sin(g) * 4;
    const latitude = Number(latitudeDeg) * Math.PI / 180;
    const longitude = Number(longitudeDeg);
    const noon = 720 - 4 * longitude - eqTime + Number(utcOffsetHours || 0) * 60;
    const hourAngle = angle => Math.acos(Math.max(-1, Math.min(1, (Math.sin(angle * Math.PI / 180) - Math.sin(latitude) * Math.sin(decl)) / (Math.cos(latitude) * Math.cos(decl))))) * 180 / Math.PI;
    const asrAngle = Math.atan(1 / (2 + Math.tan(Math.abs(latitude - decl)))) * 180 / Math.PI;
    const asrHa = Math.acos(Math.max(-1, Math.min(1, (Math.sin(asrAngle * Math.PI / 180) - Math.sin(latitude) * Math.sin(decl)) / (Math.cos(latitude) * Math.cos(decl))))) * 180 / Math.PI;
    const times = { fajr:noon - 4 * hourAngle(-16), sunrise:noon - 4 * hourAngle(-0.833), dhuhr:noon, asr:noon + 4 * asrHa, sunset:noon + 4 * hourAngle(-0.833), maghrib:noon + 4 * hourAngle(-4), isha:noon + 4 * hourAngle(-14) };
    Object.keys(times).forEach(key => { times[key] = Math.round(times[key]) % 1440; });
    return times;
}
function getBaghdadPrayerTimes(now = getIraqNow()) { return getPrayerTimesForLocation(now, 33.3152, 44.3661, 3); }
let homePrayerLocation = { latitude:33.3152, longitude:44.3661, timezoneOffset:3, name:'بغداد (افتراضي)' };
function renderHomePrayerTimes() {
    const status = document.getElementById('mafatihPrayerStatusHome');
    const list = document.getElementById('mafatihPrayerListHome');
    if (!list) return;
    const p = getPrayerTimesForLocation(getIraqNow(), homePrayerLocation.latitude, homePrayerLocation.longitude, homePrayerLocation.timezoneOffset);
    const rows = [['الفجر',p.fajr],['الشروق',p.sunrise],['الظهر',p.dhuhr],['العصر',p.asr],['المغرب',p.maghrib],['العشاء',p.isha]];
    list.innerHTML = `<div class="prayer-grid">${rows.map(([label,time]) => `<div class="prayer-time-item"><strong>${label}</strong><span>${formatPrayerTime(time)}</span></div>`).join('')}</div>`;
    if (status) status.textContent = `المواقيت حسب موقعك: ${homePrayerLocation.name || 'الموقع الحالي'}`;
}
function requestHomePrayerLocation() { return false; }


function getPrayerWindow(label, now = getIraqNow()) {
    const p = getBaghdadPrayerTimes(now);
    const text = String(label || '').replace(/[إأآ]/g, 'ا');
    const before = /قبل/.test(text);
    if (/ضحى/.test(text)) return { startMinute: Math.min(p.sunrise + 20, p.dhuhr - 1), endMinute: p.dhuhr, label: 'الضحى' };
    if (before && /فجر|صبح|الصباح/.test(text)) return { startMinute: Math.max(0, p.fajr - 60), endMinute: p.fajr, label: 'قبل صلاة الصبح' };
    if (before && /ظهر/.test(text)) return { startMinute: Math.max(0, p.dhuhr - 60), endMinute: p.dhuhr, label: 'قبل صلاة الظهر' };
    if (before && /مغرب|غروب/.test(text)) return { startMinute: Math.max(0, p.maghrib - 60), endMinute: p.maghrib, label: 'قبل صلاة المغرب' };
    if (/فجر|صبح|الصباح/.test(text)) return { startMinute: p.fajr, endMinute: p.sunrise, label: 'بعد صلاة الصبح' };
    if (/ظهر/.test(text)) return { startMinute: p.dhuhr, endMinute: p.asr, label: 'بعد صلاة الظهر' };
    if (/عصر/.test(text)) return { startMinute: p.asr, endMinute: p.sunset, label: 'العصر' };
    if (/مغرب|غروب/.test(text)) return { startMinute: p.maghrib, endMinute: p.isha, label: 'بعد صلاة المغرب' };
    if (/عشاء|مساء|ليل|ليلة/.test(text)) return { startMinute: p.isha, endMinute: p.fajr + 1440, label: 'بعد صلاة العشاء' };
    return null;
}

function findNextScheduledKhatma(now = getIraqNow()) {
    const currentMinutes = now.hour * 60 + now.minute;
    const rows = getScheduleRows('').filter(row => row.info.times.length || row.info.periods.length || getScheduleOverride(row.key));
    const candidates = [];
    rows.forEach(row => {
        const scheduledTimes = getScheduleOverride(row.key) ? [getScheduleOverride(row.key)] : row.info.times;
        scheduledTimes.forEach(time => {
            const targetDays = row.info.weekdays.length ? row.info.weekdays : [now.weekday];
            targetDays.forEach(targetDay => {
                let dayDelta = (targetDay - now.weekday + 7) % 7;
                let delta = dayDelta * 1440 + time.hour * 60 + time.minute - currentMinutes;
                if (delta < 0) delta += 7 * 1440;
                candidates.push({ row, time, targetDay, delta, matchLabel: time.text });
            });
        });
        row.info.periods.forEach(period => {
            const window = getPrayerWindow(period.label, now) || period;
            const targetDays = period.weekdays.length ? period.weekdays : [now.weekday];
            targetDays.forEach(targetDay => {
                const sameDay = targetDay === now.weekday;
                const inPeriod = sameDay && currentMinutes >= window.startMinute && currentMinutes < window.endMinute;
                let dayDelta = (targetDay - now.weekday + 7) % 7;
                let delta = dayDelta * 1440 + window.startMinute - currentMinutes;
                if (delta < 0) delta += 7 * 1440;
                candidates.push({ row, time: { text: period.label }, targetDay, delta: inPeriod ? 0 : delta, matchLabel: period.label, active: inPeriod });
            });
        });
    });
    candidates.sort((a, b) => (a.active ? 0 : 1) - (b.active ? 0 : 1) || a.delta - b.delta || a.row.info.number - b.row.info.number);
    return candidates[0] || null;
}

function getScheduleDisplayTitle(info) {
    const title = String(info?.title || '').trim();
    const number = Number(info?.number || 0);
    if (!title || !number) return title;
    const leadingNumber = title.match(/^\s*([٠-٩\d]+)\s*(?:[_\-–—:.،]\s*)?/);
    if (!leadingNumber) return title;
    const titleNumber = Number(normalizeArabicDigits(leadingNumber[1]));
    return titleNumber === number ? title.slice(leadingNumber[0].length).trim() : title;
}

// عرض اليوم والتاريخ الميلادي والهجري
const arabicWeekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
}

function formatArabicDate(date, hijriOffset = 0) {
    const weekday = arabicWeekdays[date.getDay()];
    const gregorian = new Intl.DateTimeFormat('ar', {
        day: 'numeric', month: 'long', year: 'numeric'
    }).format(date);
    const hijriDate = new Date(date);
    hijriDate.setDate(hijriDate.getDate() + (Number(hijriOffset) || 0));
    const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric', month: 'long', year: 'numeric'
    }).format(hijriDate);
    return { weekday, gregorian, hijri };
}

function getLocalDateFromInput(value) {
    if (!value) return new Date();
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function applyDateAppearance(settings) {
    const root = document.documentElement;
    root.style.setProperty('--date-bg', settings.bgColor || '#d9f0e2');
    root.style.setProperty('--date-text', settings.textColor || '#1b4332');
    root.style.setProperty('--date-border', settings.textColor || '#1b4332');
    root.style.setProperty('--date-font', settings.font || 'Amiri, serif');
}

function renderDateBar() {
    const bar = document.getElementById('dateBar');
    const track = document.getElementById('dateTrack');
    const live = document.getElementById('dateLive');
    if (!bar || !track) return;
    let settings = { mode: 'auto', customDate: '', hijriOffset: 0, bgColor: '#d9f0e2', textColor: '#1b4332', font: 'Amiri, serif', extraText: '', speed: 12, autoSchedule: true };
    try { settings = { ...settings, ...(JSON.parse(localStorage.getItem('date_display_settings') || 'null') || {}) }; } catch (error) {}
    applyDateAppearance(settings);
    const iraqNow = getIraqNow();
    const date = settings.mode === 'custom' && settings.customDate
        ? getLocalDateFromInput(settings.customDate)
        : new Date(iraqNow.year, iraqNow.month - 1, iraqNow.day, 12, 0, 0);
    const formatted = formatArabicNumericDate(iraqNow, settings.hijriOffset);
    const dateText = getIraqDayLabel(iraqNow);
    const dateMessage = `${dateText} ${formatted.gregorian} • ${formatted.hijri} • ${formatIraqClock(iraqNow)}`;
    if (live) {
        live.textContent = dateMessage;
        live.style.fontFamily = settings.font || 'Amiri, serif';
        live.style.display = 'flex';
        live.style.visibility = 'visible';
    }
    const scheduled = settings.autoSchedule !== false ? findNextScheduledKhatma(iraqNow) : null;
    const scheduleDay = scheduled ? ` في ${scheduleWeekdays[scheduled.targetDay]}` : '';
    const scheduleTitle = scheduled ? `${getScheduleDisplayTitle(scheduled.row.info)}${scheduled.row.info.hasImage ? ' — ختمة مصورة' : ' — ختمة نصية'}` : '';
    const scheduleText = scheduled ? `الختمة ${scheduled.row.info.number ? toArabicNum(scheduled.row.info.number) + ' ' : ''}${scheduleTitle}${scheduleDay} ${scheduled.matchLabel}` : '';
    const movingText = '';
    const previousText = track.dataset.message || '';
    if (movingText === previousText && track.children.length) return;
    track.dataset.message = movingText;
    track.innerHTML = '';
    if (!movingText) { track.style.display = 'none'; return; }
    track.style.display = 'flex';
    const copy = document.createElement('span');
    copy.className = 'date-copy';
    copy.textContent = movingText;
    const copy2 = copy.cloneNode(true);
    copy2.setAttribute('aria-hidden', 'true');
    track.append(copy, copy2);
    const copyWidth = Math.max(1, copy.getBoundingClientRect().width || track.scrollWidth / 2);
    const barWidth = Math.max(1, bar.getBoundingClientRect().width);
    const effectiveSpeed = Math.max(5, Math.min(120, Number(settings.speed) || 12));
    const duration = Math.max(8, Math.min(180, (barWidth + copyWidth) / (effectiveSpeed * 10)));
    bar.style.setProperty('--date-start', `-${copyWidth}px`);
    bar.style.setProperty('--date-end', `${barWidth}px`);
    bar.style.setProperty('--date-duration', `${duration}s`);
    if (dateCycleRestartTimer) clearTimeout(dateCycleRestartTimer);
    track.style.animation = 'none';
    track.style.transform = `translateX(-${copyWidth}px)`;
    void track.offsetWidth;
    track.style.animation = `dateMarquee ${duration}s linear 1`;
    track.onanimationend = () => {
        dateCycleRestartTimer = setTimeout(() => {
            track.style.animation = 'none';
            track.style.transform = `translateX(-${copyWidth}px)`;
            void track.offsetWidth;
            track.style.animation = `dateMarquee ${duration}s linear 1`;
        }, 350);
    };
}

function loadDateSettings() {
    if (accessMode === 'limited' || accessMode === 'tabsOnly') return;
    let settings = { mode: 'auto', customDate: '', hijriOffset: 0, bgColor: '#d9f0e2', textColor: '#1b4332', font: 'Amiri, serif', extraText: '', speed: 12 };
    try {
        settings = JSON.parse(localStorage.getItem('date_display_settings') || 'null') || settings;
    } catch (error) {}
    const mode = document.getElementById('dateModeSelect');
    const custom = document.getElementById('customDateInput');
    if (mode) mode.value = settings.mode || 'auto';
    if (custom) custom.value = settings.customDate || '';
    const hijriOffset = document.getElementById('hijriOffsetInput');
    if (hijriOffset) hijriOffset.value = Number.isFinite(Number(settings.hijriOffset)) ? Number(settings.hijriOffset) : 0;
    const font = document.getElementById('dateFontSelect');
    const bgColor = document.getElementById('dateBgColor');
    const textColor = document.getElementById('dateTextColor');
    if (font) font.value = settings.font || 'Amiri, serif';
    if (bgColor) bgColor.value = settings.bgColor || '#d9f0e2';
    if (textColor) textColor.value = settings.textColor || '#1b4332';
    const autoSchedule = document.getElementById('autoScheduleEnabled');
    const extraText = document.getElementById('dateExtraTextInput');
    const speed = document.getElementById('dateSpeedInput');
    if (autoSchedule) autoSchedule.checked = settings.autoSchedule !== false;
    if (extraText) extraText.value = settings.extraText || '';
    if (speed) speed.value = settings.speed || 12;
    toggleCustomDateInput();
    renderDateBar();
}

window.toggleCustomDateInput = () => {
    const mode = document.getElementById('dateModeSelect');
    const custom = document.getElementById('customDateInput');
    if (custom) custom.style.display = mode && mode.value === 'custom' ? 'block' : 'none';
};

window.saveDateSettings = () => {
    const mode = document.getElementById('dateModeSelect')?.value || 'auto';
    const customDate = document.getElementById('customDateInput')?.value || '';
    const hijriOffset = parseInt(document.getElementById('hijriOffsetInput')?.value || '0', 10) || 0;
    const font = document.getElementById('dateFontSelect')?.value || 'Amiri, serif';
    const bgColor = document.getElementById('dateBgColor')?.value || '#d9f0e2';
    const textColor = document.getElementById('dateTextColor')?.value || '#1b4332';
    const autoSchedule = document.getElementById('autoScheduleEnabled')?.checked !== false;
    const extraText = document.getElementById('dateExtraTextInput')?.value.trim() || '';
    const speed = Math.max(5, Math.min(120, Number(document.getElementById('dateSpeedInput')?.value) || 12));
    if (mode === 'custom' && !customDate) {
        const status = document.getElementById('dateSettingsStatus');
        if (status) status.innerText = 'اختر التاريخ المخصص أولًا.';
        return;
    }
    const settings = { mode, customDate, hijriOffset, font, bgColor, textColor, autoSchedule, extraText, speed };
    localStorage.setItem('date_display_settings', JSON.stringify(settings));
    renderDateBar();
    const status = document.getElementById('dateSettingsStatus');
    if (status) status.innerText = 'جارٍ حفظ إعدادات التاريخ لجميع المستخدمين...';
    db.ref('appSettings/dateDisplay').set({ ...settings, updatedAt: firebase.database.ServerValue.TIMESTAMP })
        .then(() => { if (status) status.innerText = 'تم حفظ إعدادات التاريخ وألوانه لجميع المستخدمين.'; })
        .catch(error => { console.error('تعذر حفظ إعدادات التاريخ العامة:', error); if (status) status.innerText = 'حُفظت الإعدادات على هذا الجهاز فقط؛ تعذر حفظها لجميع المستخدمين.'; });
};

async function loadGlobalDateSettings() {
    try {
        const snapshot = await db.ref('appSettings/dateDisplay').once('value');
        const remote = snapshot.val();
        if (!remote) return;
        localStorage.setItem('date_display_settings', JSON.stringify(remote));
        loadDateSettings();
    } catch (error) { console.warn('تعذر تحميل إعدادات التاريخ العامة:', error); }
}

loadDateSettings();
loadGlobalDateSettings();
loadScheduleOverrides();
loadDailyMessages();
loadTodayKhatmasSettings();
const scheduleSearchInput = document.getElementById('scheduleSearchInput');
if (scheduleSearchInput) scheduleSearchInput.addEventListener('keydown', event => { if (event.key === 'Enter') searchKhatmaSchedules(); });
setInterval(() => {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem('date_display_settings') || '{}'); } catch (error) {}
    if (settings.mode === 'auto' || !settings.mode) renderDateBar();
}, 1000);

// نهاية عرض التاريخ


// تثبيت الحاوية العلوية وجعل قائمة الختمات قابلة للتمرير مستقلًا
function updateFixedHeaderLayout() {
    const header = document.querySelector('.sticky-top-container');
    if (!header) return;
    const height = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--sticky-header-height', `${height}px`);
}

window.addEventListener('load', updateFixedHeaderLayout);
window.addEventListener('resize', updateFixedHeaderLayout);
window.addEventListener('orientationchange', () => setTimeout(updateFixedHeaderLayout, 120));
if (window.ResizeObserver) {
    const headerObserver = new ResizeObserver(updateFixedHeaderLayout);
    const headerElement = document.querySelector('.sticky-top-container');
    if (headerElement) headerObserver.observe(headerElement);
}
setTimeout(updateFixedHeaderLayout, 300);

// نهاية تثبيت الحاوية العلوية

window.getBaghdadPrayerTimes = getBaghdadPrayerTimes;
