const firebaseConfig = {
            apiKey: "AIzaSyBkuwbP5WxIBxv5iWY5TRy3zOtPGvsEoZg",
            authDomain: "khatmas-app.firebaseapp.com",
            databaseURL: "https://khatmas-app-default-rtdb.firebaseio.com",
            projectId: "khatmas-app",
            storageBucket: "khatmas-app.firebasestorage.app",
            messagingSenderId: "361576127533",
            appId: "1:361576127533:web:4e5b4947c2b6581596eca4"
        };
        const ADMIN_EMAIL = "hedrnasr7@gmail.com";
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        const DATABASE_URL = firebaseConfig.databaseURL;

        let allKhatmas = {};
        let favorites = JSON.parse(localStorage.getItem('user_favorites')) || [];
        let loaderTimer = null;
        let syncInProgress = false;
        let lastSyncAttempt = 0;

        function toArabicNum(n) {
            return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
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
                    allKhatmas = cachedData;
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

                const data = (await response.json()) || {};
                await OfflineStore.replaceAllKhatmas(data);

                const newEtag = response.headers.get('ETag');
                if (newEtag) await OfflineStore.setMeta('firebase-etag', newEtag);
                await OfflineStore.setMeta('last-successful-sync', new Date().toISOString());

                allKhatmas = data;
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
        document.getElementById('adminTrigger').onclick = async () => {
            if (!navigator.onLine) {
                alert("يجب الاتصال بالإنترنت لتسجيل دخول المشرف.");
                return;
            }

            try {
                await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
                let user = firebase.auth().currentUser;

                if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
                    if (user) await firebase.auth().signOut();
                    const password = prompt(`أدخل كلمة مرور المشرف للحساب:\n${ADMIN_EMAIL}`);
                    if (!password) return;
                    const credential = await firebase.auth().signInWithEmailAndPassword(ADMIN_EMAIL, password);
                    user = credential.user;
                }

                if (!user.emailVerified) {
                    await user.sendEmailVerification();
                    await firebase.auth().signOut();
                    alert("أرسلنا رسالة تحقق إلى بريد المشرف. افتح الرسالة واضغط رابط التحقق، ثم حاول الدخول مجددًا.");
                    return;
                }

                const form = document.getElementById('adminForm');
                form.style.display = 'block';
                renderAdminLists(allKhatmas);
                form.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('فشل تسجيل دخول المشرف:', error);
                alert("تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور ومن تفعيل تسجيل الدخول بالبريد في Firebase.");
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

        window.renderList = (data, view = 'all') => {
            const container = document.getElementById('listContainer');
            if (!container) return;
            container.innerHTML = '';

            if (!data || Object.keys(data).length === 0) {
                container.innerHTML = '<p style="color:#666;">لا توجد نتائج مطابقة.</p>';
                return;
            }

            const sortedKeys = Object.keys(data).sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));
            let htmlContent = '';

            sortedKeys.forEach(key => {
                const hasImage = data[key].image && data[key].image.trim() !== "";

                if (view === 'fav' && !favorites.includes(key)) return;
                if (view === 'all' && hasImage) return;
                if (view === 'images' && !hasImage) return;

                let displayTitle = data[key].title || "بدون عنوان";
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

            textContainer.innerHTML = '';
            imageContainer.innerHTML = '';

            if (!data || Object.keys(data).length === 0) {
                textContainer.innerHTML = '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات نصية.</p>';
                imageContainer.innerHTML = '<p style="color:#666; text-align:center; margin:5px;">لا توجد ختمات مصورة.</p>';
                return;
            }

            const sortedKeys = Object.keys(data).sort((a, b) => extractNumber(data[a].title) - extractNumber(data[b].title));
            let textHtml = '';
            let imageHtml = '';

            sortedKeys.forEach(key => {
                const hasImage = data[key].image && data[key].image.trim() !== "";
                const rowContent = `
                    <div class="admin-khatma-row">
                        <span>${data[key].title || 'بدون عنوان'}</span>
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
                document.getElementById('displayTitle').innerText = allKhatmas[key].title || "بدون عنوان";
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
            Object.values(allKhatmas).forEach(v => {
                if (v.image && v.image.trim() !== "") {
                    let num = extractNumber(v.title);
                    if (num > maxSeq) maxSeq = num;
                }
            });

            progressEl.innerText = `جاري المعالجة (0 من ${files.length})...`;

            for (let file of files) {
                maxSeq++;
                const currentSeqArabic = toArabicNum(maxSeq);

                let extractedTitleText = "ختمة مصورة";

                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        const base64Data = e.target.result.split(',')[1];

                        try {
                            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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
                                geminiText = geminiText.replace(/[*#]/g, '').split('\n')[0].substring(0, 35);

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

        window.switchTab = (tab) => {
            document.getElementById('allTab').classList.toggle('active', tab === 'all');
            document.getElementById('imagesTab').classList.toggle('active', tab === 'images');
            document.getElementById('favTab').classList.toggle('active', tab === 'fav');
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

/* كروب نورانيات كاظم الغيظ */
const CLUB_ADMIN_USERNAME = 'hedrnasr7';
let clubAuthMode = 'login';
let clubProfile = null;
let clubIsAdmin = false;
let clubPostsListener = null;
const clubEsc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
function clubAccountEmail(username) {
    const bytes = new TextEncoder().encode(username.trim().toLowerCase());
    let raw = ''; bytes.forEach(b => raw += String.fromCharCode(b));
    return 'u_' + btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'') + '@members.khatmas.app';
}
function clubStatusText(status) {
    if (status === 'approved') return 'حسابك مقبول. يمكنك الآن النشر والتعليق والإعجاب ومراسلة المشرف.';
    if (status === 'rejected') return 'لم تتم الموافقة على الحساب حاليًا. تواصل مع المشرف عند الحاجة.';
    return 'حسابك قيد مراجعة المشرف. ستتمكن من المشاركة بعد الموافقة.';
}
function clubShow(open) {
    document.getElementById('drawerOverlay').classList.remove('open');
    document.getElementById('clubView').classList.toggle('active', open);
    document.getElementById('listContainer').style.display = open ? 'none' : '';
    document.querySelector('.sticky-top-container').style.display = open ? 'none' : '';
    if (open) clubRefreshSession();
}
function clubSetStatus(text, kind='') {
    const el = document.getElementById('clubAuthStatus'); el.className = kind ? 'club-status ' + kind : 'club-status'; el.textContent = text || ''; el.style.display = text ? 'block' : 'none';
}
async function clubRefreshSession() {
    const user = firebase.auth().currentUser;
    if (!user) { clubProfile = null; clubIsAdmin = false; document.getElementById('clubAuthCard').style.display='block'; document.getElementById('clubMemberArea').style.display='none'; return; }
    clubIsAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (clubIsAdmin) { clubProfile = {uid:user.uid, username:CLUB_ADMIN_USERNAME, phone:'+9647708875612', status:'approved'}; clubRenderMember(); return; }
    const snap = await db.ref('clubUsers/' + user.uid).once('value'); clubProfile = snap.val();
    if (!clubProfile) { await firebase.auth().signOut(); clubSetStatus('تعذر العثور على بيانات الحساب. حاول تسجيل الدخول مجددًا.','bad'); return; }
    clubRenderMember();
}
function clubRenderMember() {
    document.getElementById('clubAuthCard').style.display='none'; document.getElementById('clubMemberArea').style.display='block';
    const approved = clubProfile.status === 'approved' || clubIsAdmin;
    const status = document.getElementById('clubMemberStatus'); status.textContent = clubIsAdmin ? 'أنت المشرف على الكروب.' : clubStatusText(clubProfile.status); status.className = 'club-status ' + (approved ? 'ok' : '');
    document.getElementById('clubComposerCard').style.display = approved ? 'block' : 'none'; document.getElementById('clubMessageCard').style.display = approved && !clubIsAdmin ? 'block' : 'none'; document.getElementById('clubAdminCard').style.display = clubIsAdmin ? 'block' : 'none';
    if (approved) clubLoadPosts(); else document.getElementById('clubPosts').innerHTML='<p class="club-muted">ستظهر المنشورات بعد موافقة المشرف.</p>';
    if (clubIsAdmin) clubLoadAdminData(); else clubLoadMyMessages();
}
function clubLoadPosts() {
    if (clubPostsListener) clubPostsListener();
    const ref = db.ref('clubPosts').limitToLast(60); const handler = snap => clubRenderPosts(snap.val() || {}); ref.on('value', handler); clubPostsListener = () => ref.off('value', handler);
}
async function clubRenderPosts(posts) {
    const entries = Object.entries(posts).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)); const box = document.getElementById('clubPosts');
    if (!entries.length) { box.innerHTML='<p class="club-muted">لا توجد منشورات بعد. كن أول من ينشر.</p>'; return; }
    const html = await Promise.all(entries.map(async ([id,p]) => {
        const likesSnap = await db.ref('clubPostLikes/'+id).once('value'); const likes = likesSnap.val() || {}; const commentsSnap = await db.ref('clubPostComments/'+id).once('value'); const comments = commentsSnap.val() || {}; const liked = clubProfile && likes[clubProfile.uid];
        const commentHtml = Object.values(comments).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).map(c=>`<div class="club-comment"><b>${clubEsc(c.authorName)}</b>: ${clubEsc(c.text)}</div>`).join('');
        return `<article class="club-post"><div class="club-post-head"><span>${clubEsc(p.authorName)}</span><span class="club-muted">${new Date(p.createdAt||Date.now()).toLocaleString('ar-IQ')}</span></div><div class="club-post-body">${clubEsc(p.text)}</div><div class="club-reactions"><button class="club-reaction" onclick="clubToggleLike('${id}')">${liked ? 'إلغاء الإعجاب' : 'إعجاب'} (${Object.keys(likes).length})</button><button class="club-reaction" onclick="clubFocusComment('${id}')">تعليق (${Object.keys(comments).length})</button>${clubIsAdmin ? `<button class="club-reaction club-danger" onclick="clubDeletePost('${id}')">حذف</button>` : ''}</div><div id="comments-${id}">${commentHtml}</div><div class="club-row" style="margin-top:7px"><input class="club-input" id="comment-input-${id}" placeholder="اكتب تعليقًا..." style="flex:1;margin:0"><button class="club-btn" onclick="clubAddComment('${id}')">إرسال</button></div></article>`;
    })); box.innerHTML = html.join('');
}
window.clubToggleLike = async (postId) => { if (!clubProfile) return; const ref=db.ref('clubPostLikes/'+postId+'/'+clubProfile.uid); const snap=await ref.once('value'); snap.exists()?await ref.remove():await ref.set(true); };
window.clubAddComment = async (postId) => { const input=document.getElementById('comment-input-'+postId); const text=input.value.trim(); if(!text || !clubProfile) return; await db.ref('clubPostComments/'+postId).push({authorId:clubProfile.uid,authorName:clubProfile.username,text,createdAt:firebase.database.ServerValue.TIMESTAMP}); input.value=''; };
window.clubFocusComment = (postId) => { const el=document.getElementById('comment-input-'+postId); if(el){el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});} };
window.clubDeletePost = async (postId) => { if(clubIsAdmin && confirm('حذف المنشور؟')) await db.ref('clubPosts/'+postId).remove(); };
async function clubPublish() { const text=document.getElementById('clubPostText').value.trim(); if(!text || !clubProfile) return; await db.ref('clubPosts').push({authorId:clubProfile.uid,authorName:clubProfile.username,text,createdAt:firebase.database.ServerValue.TIMESTAMP}); document.getElementById('clubPostText').value=''; }
async function clubLoadMyMessages() { if(!clubProfile) return; const snap=await db.ref('clubMessages/'+clubProfile.uid).limitToLast(30).once('value'); const vals=Object.values(snap.val()||{}).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)); document.getElementById('clubMyMessages').innerHTML=vals.length?'<hr>'+vals.map(m=>`<div class="club-comment"><b>${m.fromName}</b> <span class="club-muted">${new Date(m.createdAt||Date.now()).toLocaleString('ar-IQ')}</span><br>${clubEsc(m.text)}</div>`).join(''):'<p class="club-muted">لا توجد رسائل سابقة.</p>'; }
async function clubSendMessage() { const text=document.getElementById('clubMessageText').value.trim(); if(!text||!clubProfile)return; await db.ref('clubMessages/'+clubProfile.uid).push({fromId:clubProfile.uid,fromName:clubProfile.username,text,createdAt:firebase.database.ServerValue.TIMESTAMP}); document.getElementById('clubMessageText').value=''; clubLoadMyMessages(); }
async function clubLoadAdminData() { const users=await db.ref('clubUsers').once('value'); const pending=Object.entries(users.val()||{}).filter(([,u])=>u.status==='pending'); document.getElementById('clubPendingUsers').innerHTML=pending.length?pending.map(([uid,u])=>`<div class="admin-user-row"><span><b>${clubEsc(u.username)}</b><br><span class="club-muted">${clubEsc(u.phone)}</span></span><span><button class="club-btn" onclick="clubSetUserStatus('${uid}','approved')">موافقة</button> <button class="club-btn" onclick="clubSetUserStatus('${uid}','rejected')">رفض</button></span></div>`).join(''):'<p class="club-muted">لا توجد طلبات معلقة.</p>'; const msgSnap=await db.ref('clubMessages').once('value'); const messages=[]; Object.entries(msgSnap.val()||{}).forEach(([uid,group])=>Object.values(group||{}).forEach(m=>messages.push({...m,uid}))); messages.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)); document.getElementById('clubAdminMessages').innerHTML=messages.length?messages.slice(0,80).map(m=>`<div class="club-comment"><b>${clubEsc(m.fromName)}</b> <span class="club-muted">${new Date(m.createdAt||Date.now()).toLocaleString('ar-IQ')}</span><br>${clubEsc(m.text)}</div>`).join(''):'<p class="club-muted">لا توجد رسائل.</p>'; }
window.clubSetUserStatus = async (uid,status) => { if(clubIsAdmin){ await db.ref('clubUsers/'+uid+'/status').set(status); clubLoadAdminData(); } };
async function clubAuthSubmit() { const username=document.getElementById('clubUsername').value.trim(); const phone=document.getElementById('clubPhone').value.trim(); const password=document.getElementById('clubPassword').value; if(username.length<3||password.length<6||(clubAuthMode==='signup'&&!phone)){clubSetStatus('أدخل اسم مستخدم صحيحًا وكلمة مرور لا تقل عن ٦ أحرف ورقم الهاتف عند إنشاء الحساب.','bad');return;} try { if(username.toLowerCase()===CLUB_ADMIN_USERNAME && clubAuthMode==='login'){ await firebase.auth().signInWithEmailAndPassword(ADMIN_EMAIL,password); } else if(clubAuthMode==='signup'){ const cred=await firebase.auth().createUserWithEmailAndPassword(clubAccountEmail(username),password); await db.ref('clubUsers/'+cred.user.uid).set({username,phone,status:'pending',createdAt:firebase.database.ServerValue.TIMESTAMP}); } else { await firebase.auth().signInWithEmailAndPassword(clubAccountEmail(username),password); } await clubRefreshSession(); } catch(e) { console.error(e); clubSetStatus('تعذر إتمام العملية. تحقق من البيانات أو ربما اسم المستخدم مستخدم مسبقًا.','bad'); } }
function clubToggleMode() { clubAuthMode=clubAuthMode==='login'?'signup':'login'; document.getElementById('clubAuthTitle').textContent=clubAuthMode==='login'?'الدخول إلى الكروب':'إنشاء حساب جديد'; document.getElementById('clubAuthSubmit').textContent=clubAuthMode==='login'?'دخول':'إنشاء الحساب'; document.getElementById('clubToggleSignup').textContent=clubAuthMode==='login'?'إنشاء حساب جديد':'لدي حساب: دخول'; document.getElementById('clubPhone').style.display=clubAuthMode==='login'?'none':'block'; clubSetStatus(''); }

document.getElementById('menuToggle').onclick=()=>document.getElementById('drawerOverlay').classList.add('open');
document.getElementById('drawerClose').onclick=()=>document.getElementById('drawerOverlay').classList.remove('open');
document.getElementById('drawerOverlay').onclick=e=>{if(e.target.id==='drawerOverlay')e.currentTarget.classList.remove('open');};
document.getElementById('clubEntry').onclick=()=>clubShow(true);
document.getElementById('clubBackBtn').onclick=()=>clubShow(false);
document.getElementById('clubAuthSubmit').onclick=clubAuthSubmit;
document.getElementById('clubToggleSignup').onclick=clubToggleMode;
document.getElementById('clubPublishBtn').onclick=clubPublish;
document.getElementById('clubSendMessageBtn').onclick=clubSendMessage;
document.getElementById('clubLogoutBtn').onclick=async()=>{if(clubPostsListener)clubPostsListener();await firebase.auth().signOut();clubShow(true);clubRefreshSession();};
document.getElementById('clubPhone').style.display='none';
firebase.auth().onAuthStateChanged(user=>{ if(document.getElementById('clubView').classList.contains('active')) clubRefreshSession(); });

