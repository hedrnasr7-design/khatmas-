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
        const db = firebase.database();
        const DATABASE_URL = firebaseConfig.databaseURL;

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
        }

        function renderCurrentData() {
            filterKhatmas();
            renderAdminLists(allKhatmas);
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

        async function syncDataFromNetwork() {
            if (syncInProgress || !navigator.onLine) return;
            syncInProgress = true;
            lastSyncAttempt = Date.now();

            try {
                const previousEtag = await OfflineStore.getMeta('firebase-etag');
                const headers = { 'X-Firebase-ETag': 'true' };
                if (previousEtag) headers['If-None-Match'] = previousEtag;

                const response = await fetch(`${DATABASE_URL}/khatmas.json`, {
                    method: 'GET',
                    headers,
                    cache: 'no-store'
                });

                if (response.status === 304) {
                    stopLoadingProgress();
                    return;
                }

                if (!response.ok) {
                    throw new Error(`تعذر جلب التحديثات: ${response.status}`);
                }

                const data = removeDeletedKhatmaFromData((await response.json()) || {});
                await OfflineStore.replaceAllKhatmas(data);

                const newEtag = response.headers.get('ETag');
                if (newEtag) await OfflineStore.setMeta('firebase-etag', newEtag);
                await OfflineStore.setMeta('last-successful-sync', new Date().toISOString());

                allKhatmas = removeDeletedKhatmaFromData(data);
                localStorage.removeItem('offline_khatmas_perfect');
                stopLoadingProgress();
                renderCurrentData();
            } catch (error) {
                console.warn('يعمل التطبيق بالنسخة المحلية حتى عودة الإنترنت:', error);
                stopLoadingProgress();
                if (Object.keys(allKhatmas).length === 0) renderCurrentData();
            } finally {
                syncInProgress = false;
            }
        }

        async function initializeOfflineFirstApp() {
            startLoadingProgress();
            await loadCachedData();
            await syncDataFromNetwork();
            loadBackgroundAudio();
        }

        function syncIfDue() {
            if (Date.now() - lastSyncAttempt >= 60000) syncDataFromNetwork();
        }

        window.syncKhatmasFromNetwork = syncDataFromNetwork;
        window.addEventListener('online', syncDataFromNetwork);
        window.addEventListener('focus', syncIfDue);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') syncIfDue();
        });
        setInterval(syncIfDue, 5 * 60 * 1000);
        initializeOfflineFirstApp();

        if ('storage' in navigator && 'persist' in navigator.storage) {
            navigator.storage.persist().catch(() => {});
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch((error) => {
                    console.warn('تعذر تسجيل العمل دون إنترنت:', error);
                });
            });
        }

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
                    const credential = await firebase.auth().signInWithEmailAndPassword(ADMIN_EMAIL, password);
                    user = credential.user;
                }
                if (!user.emailVerified) {
                    await user.sendEmailVerification();
                    await firebase.auth().signOut();
                    if (status) status.innerText = 'تحقق من رسالة البريد الإلكتروني ثم حاول مجددًا.';
                    return;
                }
                const loginBox = document.getElementById('adminLoginBox');
                if (loginBox) loginBox.style.display = 'none';
                if (passwordInput) passwordInput.value = '';
                if (status) status.innerText = '';
                const form = document.getElementById('adminForm');
                form.style.display = 'block';
                renderAdminLists(allKhatmas);
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

        function getImageDisplayTitles(data = allKhatmas) {
            const imageTitles = {};
            const sortedImageKeys = Object.keys(data || {})
                .filter(key => data[key] && data[key].image && data[key].image.trim() !== '')
                .sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));

            sortedImageKeys.forEach((key, index) => {
                imageTitles[key] = renumberImageTitleForDisplay(data[key].title, index + 1);
            });
            return imageTitles;
        }

        window.renderList = (data, view = 'all') => {
            const container = document.getElementById('listContainer');
            if (!container) return;
            container.dataset.view = view;
            container.innerHTML = '';

            if (!data || Object.keys(data).length === 0) {
                container.innerHTML = '<p style="color:#666;">لا توجد نتائج مطابقة.</p>';
                return;
            }

            const sortedKeys = Object.keys(data).sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));
            let htmlContent = '';
            const imageDisplayTitles = view === 'images' ? getImageDisplayTitles() : {};

            sortedKeys.forEach(key => {
                const hasImage = data[key].image && data[key].image.trim() !== "";

                if (view === 'fav' && !favorites.includes(key)) return;
                if (view === 'all' && hasImage) return;
                if (view === 'images' && !hasImage) return;

                let displayTitle = data[key].title || "بدون عنوان";
                if (view === 'images') {
                    displayTitle = imageDisplayTitles[key] || displayTitle;
                }
                const isFav = favorites.includes(key) ? '❤️' : '🤍';

                htmlContent += `
                    <div class="khatma-item">
                        <div class="khatma-title" onclick="show('${key}')">${displayTitle}</div>
                        <button onclick="toggleFav('${key}')" style="background:none; border:none; font-size:20px; cursor:pointer;">${isFav}</button>
                    </div>`;
            });

            container.innerHTML = htmlContent || '<p style="color:#666;">لا توجد عناصر في هذا القسم.</p>';
        };

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
                const hasImage = data[key].image && data[key].image.trim() !== "";
                const displayTitle = hasImage ? (imageDisplayTitles[key] || data[key].title || 'بدون عنوان') : (data[key].title || 'بدون عنوان');
                const rowContent = `
                    <div class="admin-khatma-row">
                        <span>${duplicateEscapeHtml(displayTitle)}</span>
                        <div>
                            <button onclick="edit('${key}')" style="cursor:pointer; padding:2px 6px; margin-left:5px;">✏️</button>
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
        };

        window.show = (key) => {
            if (allKhatmas[key]) {
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
            const imageInput = document.getElementById('singleImageFile');

            if (!title) {
                alert("الرجاء إدخال عنوان الختمة!");
                return;
            }

            let existingImage = (key && allKhatmas[key] && allKhatmas[key].image) ? allKhatmas[key].image : "";

            const saveData = async (finalImage) => {
                const data = { title: title, content: content, image: finalImage };

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
            const tabsContainer = document.querySelector('.tabs-container');
            const listContainer = document.getElementById('listContainer');
            [tabsContainer, listContainer].forEach(element => {
                if (!element) return;
                element.classList.remove('cube-flip-next');
                void element.offsetWidth;
                element.classList.add('cube-flip-next');
            });
            document.getElementById('allTab').classList.toggle('active', tab === 'all');
            document.getElementById('imagesTab').classList.toggle('active', tab === 'images');
            document.getElementById('favTab').classList.toggle('active', tab === 'fav');
            filterKhatmas();
        };

        (() => {
            const list = document.getElementById('listContainer');
            if (!list) return;
            let startX = 0;
            let startY = 0;
            list.addEventListener('touchstart', event => {
                const touch = event.changedTouches[0];
                startX = touch.clientX;
                startY = touch.clientY;
            }, { passive: true });
            list.addEventListener('touchend', event => {
                const touch = event.changedTouches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
                const tabs = ['all', 'images', 'fav'];
                const active = document.querySelector('.tab-btn.active')?.id || 'allTab';
                const current = Math.max(0, tabs.indexOf(active.replace('Tab', '')));
                const next = (current + 1) % tabs.length;
                switchTab(tabs[next], 'next');
            }, { passive: true });
        })();

        window.filterKhatmas = () => {
            const query = document.getElementById('searchInput').value.trim().toLowerCase();
            const filtered = {};
            const searchWords = query ? query.split(/\s+/) : [];

            Object.keys(allKhatmas).forEach(k => {
                const title = (allKhatmas[k].title || "").toLowerCase();
                if (searchWords.length === 0) {
                    filtered[k] = allKhatmas[k];
                } else {
                    if (searchWords.some(word => title.includes(word))) {
                        filtered[k] = allKhatmas[k];
                    }
                }
            });

            const activeTab = document.querySelector('.tab-btn.active').id;
            let currentView = 'all';
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
    const records = Object.entries(allKhatmas).filter(([, value]) => value && value.image && value.image.trim() !== '');
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
        value && value.image && value.image.trim() !== '' && genericTitlePattern.test((value.title || '').trim())
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
    const root = document.documentElement;
    root.style.setProperty('--theme-font', font || 'Amiri, serif');
    root.style.setProperty('--theme-bg', preset.bg);
    root.style.setProperty('--theme-primary', preset.primary);
    root.style.setProperty('--theme-secondary', preset.secondary);
    root.style.setProperty('--theme-accent', preset.accent);
    root.style.setProperty('--theme-card', preset.card);
    root.style.setProperty('--theme-text', preset.text);
    root.style.setProperty('--tab-all-bg', tabColors.all || preset.primary);
    root.style.setProperty('--tab-images-bg', tabColors.images || preset.secondary);
    root.style.setProperty('--tab-fav-bg', tabColors.fav || preset.primary);
    root.style.setProperty('--modal-bg', tabColors.modalBg || '#fffdf0');
    root.style.setProperty('--modal-text', tabColors.modalText || '#000000');

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
        preview.style.background = preset.primary;
        preview.style.color = preset.accent;
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
    if (allColor) allColor.value = tabColors.all || preset.primary;
    if (imagesColor) imagesColor.value = tabColors.images || preset.secondary;
    if (favColor) favColor.value = tabColors.fav || preset.primary;
    if (modalBgColor) modalBgColor.value = tabColors.modalBg || '#fffdf0';
    if (modalTextColor) modalTextColor.value = tabColors.modalText || '#000000';

    if (persist) {
        localStorage.setItem('app_theme_settings', JSON.stringify({ font: font || 'Amiri, serif', preset: presetName || 'green', tabColors }));
        localStorage.setItem('app_tab_colors', JSON.stringify(tabColors));
        const status = document.getElementById('themeStatus');
        if (status) status.innerText = 'تم حفظ المظهر وتثبيته.';
    }
}

function loadThemeSettings() {
    let saved = { font: 'Amiri, serif', preset: 'green' };
    try {
        saved = JSON.parse(localStorage.getItem('app_theme_settings') || 'null') || saved;
    } catch (error) {}
    applyThemeSettings(saved.font, saved.preset, false, saved.tabColors);
}

window.previewThemeSettings = () => {
    const font = document.getElementById('themeFontSelect')?.value || 'Amiri, serif';
    const preset = document.getElementById('themePresetSelect')?.value || 'green';
    const tabColors = {
        all: document.getElementById('allTabColor')?.value || '#1b4332',
        images: document.getElementById('imagesTabColor')?.value || '#8b4513',
        fav: document.getElementById('favTabColor')?.value || '#4a0e4e',
        modalBg: document.getElementById('modalBgColor')?.value || '#fffdf0',
        modalText: document.getElementById('modalTextColor')?.value || '#000000'
    };
    applyThemeSettings(font, preset, false, tabColors);
};

window.saveThemeSettings = async () => {
    const font = document.getElementById('themeFontSelect')?.value || 'Amiri, serif';
    const preset = document.getElementById('themePresetSelect')?.value || 'green';
    const tabColors = {
        all: document.getElementById('allTabColor')?.value || '#1b4332',
        images: document.getElementById('imagesTabColor')?.value || '#8b4513',
        fav: document.getElementById('favTabColor')?.value || '#4a0e4e',
        modalBg: document.getElementById('modalBgColor')?.value || '#fffdf0',
        modalText: document.getElementById('modalTextColor')?.value || '#000000'
    };
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

async function loadGlobalThemeSettings() {
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

// نهاية تخصيص المظهر والاقتباسات


// ساعة العراق واستخراج أوقات الختمات من العناوين والمحتوى
const iraqTimeZone = 'Asia/Baghdad';
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

function formatIraqClock(now = getIraqNow()) {
    const hh = String(now.hour).padStart(2, '0');
    const mm = String(now.minute).padStart(2, '0');
    const ss = String(now.second).padStart(2, '0');
    return `${toArabicNum(hh)}:${toArabicNum(mm)}:${toArabicNum(ss)} بتوقيت العراق`;
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
    const clockRegex = /(?:الساعة\s*)?\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?)?/g;
    let match;
    while ((match = clockRegex.exec(normalized))) addTime(match[1], match[2], match[3] || '');
    const spokenClockRegex = /الساعة\s*([0-9]{1,2})(?:\s*و\s*([0-9]{1,2}))?\s*(صباح(?:اً|ا)?|مساء(?:ً|ا)?)/g;
    while ((match = spokenClockRegex.exec(normalized))) addTime(match[1], match[2] || 0, match[3] || '');
    const dayMatches = [];
    Object.entries(scheduleWeekdayAliases).forEach(([name, index]) => { if (source.includes(name) && !dayMatches.includes(index)) dayMatches.push(index); });
    const number = extractNumber(title);
    return { title: title || 'بدون عنوان', content, number, times: timeMatches, weekdays: dayMatches, hasImage: Boolean(record.image && String(record.image).trim()) };
}

function getScheduleRows(query = '') {
    const needle = String(query || '').trim().toLocaleLowerCase('ar');
    return Object.entries(allKhatmas || {}).map(([key, record]) => ({ key, info: extractScheduleInfo(record) })).filter(row => {
        if (!needle) return true;
        return `${row.info.title}\n${row.info.content}`.toLocaleLowerCase('ar').includes(needle);
    }).sort((a, b) => (a.info.times[0]?.hour ?? 99) * 60 + (a.info.times[0]?.minute ?? 99) - ((b.info.times[0]?.hour ?? 99) * 60 + (b.info.times[0]?.minute ?? 99)) || a.info.number - b.info.number);
}

function renderScheduleResults(rows) {
    const box = document.getElementById('scheduleResults');
    const status = document.getElementById('scheduleSearchStatus');
    if (!box) return;
    box.style.display = 'block';
    if (!rows.length) { box.innerHTML = '<div style="padding:10px;">لا توجد نتائج.</div>'; if (status) status.textContent = 'لم يتم العثور على ختمات مطابقة.'; return; }
    box.innerHTML = `<table class="date-schedule-table"><thead><tr><th>الرقم</th><th>العنوان</th><th>اليوم المستخرج</th><th>الوقت المستخرج</th><th>النوع</th></tr></thead><tbody>${rows.map(row => {
        const i = row.info;
        const days = i.weekdays.length ? i.weekdays.map(day => scheduleWeekdays[day]).join('، ') : 'غير محدد';
        const times = i.times.length ? i.times.map(time => time.text).join('، ') : 'غير محدد';
        return `<tr><td>${i.number ? toArabicNum(i.number) : '—'}</td><td>${escapeHtml(i.title)}<div class="schedule-muted">${escapeHtml(i.content.slice(0, 180))}${i.content.length > 180 ? '…' : ''}</div></td><td>${escapeHtml(days)}</td><td>${escapeHtml(times)}</td><td>${i.hasImage ? 'مصورة' : 'نصية'}</td></tr>`;
    }).join('')}</tbody></table>`;
    if (status) status.textContent = `تم تحليل ${toArabicNum(rows.length)} ختمة.`;
}

window.searchKhatmaSchedules = (query) => {
    const input = document.getElementById('scheduleSearchInput');
    const actualQuery = query === undefined ? (input?.value || '') : query;
    if (input && query !== undefined) input.value = query;
    renderScheduleResults(getScheduleRows(actualQuery));
};
window.clearKhatmaScheduleSearch = () => { const input = document.getElementById('scheduleSearchInput'); if (input) input.value = ''; const box = document.getElementById('scheduleResults'); const status = document.getElementById('scheduleSearchStatus'); if (box) { box.innerHTML = ''; box.style.display = 'none'; } if (status) status.textContent = ''; };

function findNextScheduledKhatma(now = getIraqNow()) {
    const currentMinutes = now.hour * 60 + now.minute;
    const rows = getScheduleRows('').filter(row => row.info.times.length);
    const candidates = [];
    rows.forEach(row => row.info.times.forEach(time => {
        const targetDays = row.info.weekdays.length ? row.info.weekdays : [now.weekday];
        targetDays.forEach(targetDay => {
            let dayDelta = (targetDay - now.weekday + 7) % 7;
            let delta = dayDelta * 1440 + time.hour * 60 + time.minute - currentMinutes;
            if (delta < 0) delta += 7 * 1440;
            candidates.push({ row, time, targetDay, delta });
        });
    }));
    candidates.sort((a, b) => a.delta - b.delta);
    return candidates[0] || null;
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
    if (!bar || !track) return;
    let settings = { mode: 'auto', customDate: '', hijriOffset: 0, bgColor: '#d9f0e2', textColor: '#1b4332', font: 'Amiri, serif', extraText: '', speed: 12 };
    try {
        settings = JSON.parse(localStorage.getItem('date_display_settings') || 'null') || settings;
    } catch (error) {}
    applyDateAppearance(settings);
    const iraqNow = getIraqNow();
    const date = settings.mode === 'custom' && settings.customDate
        ? getLocalDateFromInput(settings.customDate)
        : new Date(iraqNow.year, iraqNow.month - 1, iraqNow.day, 12, 0, 0);
    const formatted = formatArabicDate(date, settings.hijriOffset);
    const extra = String(settings.extraText || '').trim();
    // التاريخ والنص الإضافي وحدة واحدة؛ لا ننشئ نسخة ثانية حتى لا يظهر النص بقائمتين.
    const scheduled = findNextScheduledKhatma(iraqNow);
    const scheduleDay = scheduled ? ` في ${scheduleWeekdays[scheduled.targetDay]}` : '';
    const scheduleText = scheduled ? ` • الختمة ${scheduled.row.info.number ? toArabicNum(scheduled.row.info.number) + ' ' : ''}${scheduled.row.info.title}${scheduleDay} الساعة ${scheduled.time.text}` : '';
    const fullText = `${formatted.weekday} / ${formatted.gregorian} / ${formatted.hijri} • ${formatIraqClock(iraqNow)}${extra ? ` • ${extra}` : ''}${scheduleText}`;
    track.innerHTML = '';
    const copy = document.createElement('span');
    copy.className = 'date-copy';
    copy.textContent = fullText;
    track.appendChild(copy);

    const copyWidth = Math.max(1, copy.getBoundingClientRect().width || track.scrollWidth);
    const barWidth = Math.max(1, bar.getBoundingClientRect().width);
    const effectiveSpeed = Math.max(5, Math.min(120, Number(settings.speed) || 12));
    const duration = Math.max(8, Math.min(180, (barWidth + copyWidth) / (effectiveSpeed * 10)));
    // translateX المتزايد يجعل الحركة الفيزيائية من اليسار إلى اليمين.
    bar.style.setProperty('--date-start', `-${copyWidth}px`);
    bar.style.setProperty('--date-end', `${barWidth}px`);
    bar.style.setProperty('--date-duration', `${duration}s`);
    if (dateCycleRestartTimer) clearTimeout(dateCycleRestartTimer);
    track.style.animation = 'none';
    track.style.transform = `translateX(-${copyWidth}px)`;
    void track.offsetWidth;
    track.style.animation = `dateMarquee ${duration}s linear 1`;
    track.onanimationend = () => {
        // لا تبدأ الدورة الجديدة إلا بعد خروج السطر كاملًا، مع فراغ بسيط بين الدورات.
        dateCycleRestartTimer = setTimeout(() => {
            track.style.animation = 'none';
            track.style.transform = `translateX(-${copyWidth}px)`;
            void track.offsetWidth;
            track.style.animation = `dateMarquee ${duration}s linear 1`;
        }, 350);
    };
}

function loadDateSettings() {
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
    const extraText = document.getElementById('dateExtraTextInput');
    const speed = document.getElementById('dateSpeedInput');
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
    const extraText = document.getElementById('dateExtraTextInput')?.value.trim() || '';
    const speed = Math.max(5, Math.min(120, Number(document.getElementById('dateSpeedInput')?.value) || 12));
    if (mode === 'custom' && !customDate) {
        const status = document.getElementById('dateSettingsStatus');
        if (status) status.innerText = 'اختر التاريخ المخصص أولًا.';
        return;
    }
    localStorage.setItem('date_display_settings', JSON.stringify({ mode, customDate, hijriOffset, font, bgColor, textColor, extraText, speed }));
    renderDateBar();
    const status = document.getElementById('dateSettingsStatus');
    if (status) status.innerText = mode === 'auto' ? `تم تثبيت التحديث التلقائي وتصحيح الهجري بمقدار ${hijriOffset} يوم.` : 'تم حفظ التاريخ المخصص وتصحيح التاريخ الهجري.';
};

loadDateSettings();
const scheduleSearchInput = document.getElementById('scheduleSearchInput');
if (scheduleSearchInput) scheduleSearchInput.addEventListener('keydown', event => { if (event.key === 'Enter') searchKhatmaSchedules(); });
setInterval(() => {
    const settings = JSON.parse(localStorage.getItem('date_display_settings') || '{"mode":"auto"}');
    if (settings.mode === 'auto') renderDateBar();
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
if (window.ResizeObserver) {
    const headerObserver = new ResizeObserver(updateFixedHeaderLayout);
    const headerElement = document.querySelector('.sticky-top-container');
    if (headerElement) headerObserver.observe(headerElement);
}
setTimeout(updateFixedHeaderLayout, 300);

// نهاية تثبيت الحاوية العلوية
