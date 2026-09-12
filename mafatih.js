(() => {
    const appData = {
        duas: { title: 'الأدعية الشريفة', icon: '📜', desc: 'كميل، التوسل، الندبة، العهد...', items: [
            { name: 'دعاء كميل بن زياد', text: 'اللهم إني أسألك برحمتك التي وسعت كل شيء، وبقوتك التي قهرت بها كل شيء وخشع لها كل شيء وذل لها كل شيء، وبجبروتك التي غلبت بها كل شيء.' },
            { name: 'دعاء التوسل', text: 'اللهم إني أسألك وأتوجه إليك بنبيك نبي الرحمة محمد صلى الله عليه وآله، يا أبا القاسم يا رسول الله، يا إمام الرحمة ويا سيدنا ومولانا إنا توجهنا واستشفعنا وتوسلنا بك إلى الله.' },
            { name: 'دعاء الندبة', text: 'الحمد لله رب العالمين وصلى الله على سيدنا محمد نبيه وآله وسلم تسليماً. اللهم لك الحمد على ما جرى به قضاؤك في أوليائك الذين استخلصتهم لنفسك ودينك.' },
            { name: 'دعاء العهد', text: 'اللهم رب النور العظيم ورب الكرسي الرفيع، ورب البحر المسجور، ومنزل التوراة والإنجيل والزبور، ورب الظل والحرور، ومنزل القرآن العظيم.' }
        ]},
        ziyarat: { title: 'الزيارات الشريفة', icon: '🕌', desc: 'عاشوراء، وارث، أمين الله...', items: [
            { name: 'زيارة عاشوراء', text: 'السلام عليك يا أبا عبد الله، السلام عليك يا بن رسول الله، السلام عليك يا بن أمير المؤمنين وابن سيد الوصيين، السلام عليك يا بن فاطمة الزهراء سيد نساء العالمين.' },
            { name: 'زيارة وارث', text: 'السلام عليك يا وارث آدم صفوة الله، السلام عليك يا وارث نوح نبي الله، السلام عليك يا وارث إبراهيم خليل الله، السلام عليك يا وارث موسى كليم الله.' },
            { name: 'زيارة أمين الله', text: 'السلام عليك يا أمين الله في أرضه وحجته على عباده، أشهد أنك جاهدت في الله حق جهاده وصبرت على ذات أعدائه ونصرت أولياءه.' }
        ]},
        taqibat: { title: 'التعقيبات والصلوات', icon: '📿', desc: 'تعقيبات الصلوات اليومية والمستحبة', items: [
            { name: 'التعقيبات العامة للصلوات', text: 'سبحان من لا يعتدي على أهل مملكته، سبحان من لا يأخذ أهل الأرض بألوان العذاب، سبحان الرؤوف الرحيم. اللهم اجعل لي في قلبي نوراً وبصراً وفهماً وعلماً.' },
            { name: 'صلاة الليل', text: 'تصلي إحدى عشرة ركعة: ثماني ركعات نافلة الليل بركعتين بركعتين، وركعتا الشفع وركعة الوتر.' }
        ]},
        months: { title: 'أعمال الشهور والأيام', icon: '🌙', desc: 'رجب، شعبان، رمضان...', items: [
            { name: 'أعمال شهر رجب المرجب', text: 'روي عن النبي صلى الله عليه وآله أنه قال: رجب شهر الله الأصم، وهو شهر شريف، ومن استغفر فيه استغفاراً عظيماً غفر الله له.' },
            { name: 'أعمال شهر شعبان المعظم', text: 'هذا شهر شريف وهو شهر رسول الله صلى الله عليه وآله، وكان رسول الله يصوم شعبان ويصله بشهر رمضان.' }
        ]}
    };
    let currentScreen = 'home';
    let historyStack = [];
    let fullCatalog = [];
    const q = id => document.getElementById(id);
    const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));

    function showScreen(id) {
        document.querySelectorAll('#pageFive .mafatih-screen').forEach(el => el.classList.remove('active'));
        q(id)?.classList.add('active');
        const back = q('mafatihBackBtn');
        if (back) back.style.display = id === 'mafatihHomeScreen' || id === 'mafatihPrayerScreen' ? 'none' : 'inline-block';
    }
    function initHome() {
        const grid = q('mafatihMainGrid'); if (!grid) return;
        grid.innerHTML = `<button class="mafatih-card" type="button" data-full-catalog="1"><span class="mafatih-icon">📚</span><strong>الفهرس الكامل</strong><small>472 نصًا منقحًا من موقع السراج</small></button>` + `<a class="mafatih-card" href="https://alseraj.net/mafatih_al_jinan" target="_blank" rel="noopener noreferrer"><span class="mafatih-icon">🌐</span><strong>المصدر الأصلي</strong><small>فتح مفاتيح الجنان في موقع السراج</small></a>` + Object.entries(appData).map(([key, cat]) => `<button class="mafatih-card" type="button" data-category="${key}"><span class="mafatih-icon">${cat.icon}</span><strong>${esc(cat.title)}</strong><small>${esc(cat.desc)}</small></button>`).join('');
        grid.querySelectorAll('[data-category]').forEach(btn => btn.addEventListener('click', () => openCategory(btn.dataset.category)));
        grid.querySelector('[data-full-catalog]')?.addEventListener('click', openFullCatalog);
    }
    async function loadFullCatalog() {
        if (fullCatalog.length) return;
        try {
            const response = await fetch('./mafatih-content.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('catalog fetch failed');
            const data = await response.json();
            fullCatalog = Array.isArray(data.pages) ? data.pages : [];
        } catch (error) { fullCatalog = []; }
    }
    async function openFullCatalog() {
        q('mafatihHeaderTitle').textContent = 'الفهرس الكامل';
        q('mafatihSearch').value = '';
        q('mafatihSubList').innerHTML = '<p class="mafatih-status">جارٍ تحميل الفهرس الكامل...</p>';
        historyStack.push(currentScreen); currentScreen = 'mafatihSubScreen'; showScreen(currentScreen);
        await loadFullCatalog(); renderFullCatalog(fullCatalog);
    }
    function renderFullCatalog(items) {
        const list = q('mafatihSubList');
        if (!items.length) { list.innerHTML = '<p class="mafatih-status">تعذر تحميل النصوص. افتح التطبيق مع اتصال بالإنترنت ثم أعد المحاولة.</p>'; return; }
        list.innerHTML = items.map((item, index) => `<button class="mafatih-list-item" type="button" data-full-index="${index}"><span>${esc(item.title)}</span><span>◀</span></button>`).join('');
        list.querySelectorAll('[data-full-index]').forEach(btn => btn.addEventListener('click', () => openReader(items[Number(btn.dataset.fullIndex)])));
    }
    window.mafatihFilter = () => { const term = (q('mafatihSearch')?.value || '').trim().toLowerCase(); renderFullCatalog(fullCatalog.filter(item => !term || `${item.title} ${item.text}`.toLowerCase().includes(term))); };
    function openCategory(key) {
        const cat = appData[key]; if (!cat) return;
        historyStack.push(currentScreen); q('mafatihHeaderTitle').textContent = cat.title;
        q('mafatihSubList').innerHTML = cat.items.map((item, index) => `<button class="mafatih-list-item" type="button" data-index="${index}"><span>${esc(item.name)}</span><span>◀</span></button>`).join('');
        q('mafatihSubList').querySelectorAll('[data-index]').forEach(btn => btn.addEventListener('click', () => openReader(cat.items[Number(btn.dataset.index)])));
        currentScreen = 'mafatihSubScreen'; showScreen(currentScreen);
    }
    function openReader(item) {
        historyStack.push(currentScreen); q('mafatihHeaderTitle').textContent = item.name;
        q('mafatihReader').innerHTML = `<h2>${esc(item.name || item.title)}</h2><p>${esc(item.text)}</p>${item.url ? `<p style="font-size:.8rem;color:#94a3b8">المصدر: <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">السراج</a></p>` : ''}`;
        currentScreen = 'mafatihReaderScreen'; showScreen(currentScreen);
    }
    function switchMainTab(tab) {
        document.querySelectorAll('#pageFive .mafatih-nav-btn').forEach(el => el.classList.remove('active'));
        if (tab === 'prayer') { q('mafatihPrayerNav')?.classList.add('active'); q('mafatihHeaderTitle').textContent = 'مواقيت الصلاة'; historyStack = ['mafatihHomeScreen']; showScreen('mafatihPrayerScreen'); loadPrayerTimes(); }
        else { q('mafatihHomeNav')?.classList.add('active'); q('mafatihHeaderTitle').textContent = 'مفاتيح الجنان'; historyStack = []; showScreen('mafatihHomeScreen'); }
    }
    function goBack() { const previous = historyStack.pop(); if (previous) { currentScreen = previous; q('mafatihHeaderTitle').textContent = previous === 'mafatihSubScreen' ? 'القائمة' : 'مفاتيح الجنان'; showScreen(previous); } }

    async function loadPrayerTimes() {
        const status = q('mafatihPrayerStatus'), list = q('mafatihPrayerList');
        if (!status || !list) return;
        status.textContent = 'جارٍ تحديد موقعك...';
        if (!navigator.geolocation) { status.textContent = 'المتصفح لا يدعم تحديد الموقع.'; return; }
        navigator.geolocation.getCurrentPosition(async position => {
            const { latitude, longitude } = position.coords;
            try {
                status.textContent = 'جارٍ جلب المواقيت حسب موقعك...';
                const date = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
                const response = await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=0`);
                if (!response.ok) throw new Error('request failed');
                const data = await response.json();
                const times = data?.data?.timings || {};
                const labels = [['Fajr','الفجر'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']];
                list.innerHTML = labels.map(([key, label]) => `<div class="mafatih-list-item"><span>${label}</span><strong dir="ltr">${esc(times[key] || '—')}</strong></div>`).join('');
                status.textContent = `المواقيت حسب إحداثيات ${latitude.toFixed(2)}، ${longitude.toFixed(2)}`;
            } catch (error) { status.textContent = 'تعذر جلب المواقيت. تحقق من الاتصال ثم أعد المحاولة.'; }
        }, () => { status.textContent = 'لم يتم السماح بالموقع. فعّل إذن الموقع لحساب المواقيت تلقائيًا.'; });
    }
    window.openMafatihPage = () => { setAppPage(5); initHome(); switchMainTab('home'); };
    window.mafatihGoBack = goBack;
    window.mafatihSwitchMainTab = switchMainTab;
})();
