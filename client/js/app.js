/**
 * ============================================================================
 * PORSI. - Logika Utama Aplikasi (app.js)
 * ============================================================================
 * 
 * Daftar Isi:
 * 1. State Global & Referensi Elemen DOM
 * 2. Siklus Hidup & Inisialisasi Aplikasi (DOMContentLoaded)
 * 3. Router & Navigasi Halaman (switchPage, requireAuthOrGo)
 * 4. Modul Autentikasi & Modal Geser (Login, Register, Logout, Sesi)
 * 5. Tab Beranda (Home) & Makanan Populer Unggulan
 * 6. Katalog Makanan, Pencarian Debounce & Paginasi Bernomor
 * 7. Modal Detail Informasi Makanan
 * 8. Catat Porsi Makan (Piring Draf, Tambah Cepat & Simpan Sesi)
 * 9. Ringkasan Gizi Harian (Dashboard & Total Nutrisi)
 * 10. Riwayat Makan (Log Sesi & Detail Makanan)
 * 11. Profil Pengguna (Informasi Pribadi & Target BMR/TDEE)
 * 12. Panggilan API Terpusat & Fungsi Pembantu (Utilities)
 * ============================================================================
 */

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '8080'
  ? 'http://localhost:8080'
  : '';
    let currentUser = null;

    // Instance Modal Bootstrap & Toast Notifikasi
    let modalAuth, modalLogin, modalRegister, modalPicker, modalDetail, appToast;

    // Status State Katalog Makanan
    let curCatalogPage = 1;
    let catalogQuery = '';
    let searchTimer = null;

    // Status Draf Piring Makan & Mode Edit
    let draftItems = [];
    let editingMealId = null; // Menyimpan ID sesi yang sedang diedit (null jika mode buat baru)

    // ==================== LOADER VIEW MODULAR (VIEWS/...) ====================
    async function loadAllViews() {
      const views = [
        { id: 'view-home', file: 'views/home.html' },
        { id: 'view-makanan', file: 'views/makanan.html' },
        { id: 'view-dashboard', file: 'views/dashboard.html' },
        { id: 'view-catat', file: 'views/catat.html' },
        { id: 'view-riwayat', file: 'views/riwayat.html' },
        { id: 'view-profil', file: 'views/profil.html' },
        { id: 'views-modals', file: 'views/modals.html' }
      ];

      await Promise.all(views.map(async (v) => {
        try {
          // Gunakan anti-cache timestamp dan cache: no-store agar setiap perubahan berkas HTML langsung aktif
          const res = await fetch(`${v.file}?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          const el = document.getElementById(v.id);
          if (el) {
            el.outerHTML = html;
          }
        } catch (err) {
          console.error(`Gagal memuat berkas view [${v.file}]:`, err);
        }
      }));
    }

    document.addEventListener('DOMContentLoaded', async () => {
      // 1. Muat seluruh partial berkas HTML dari folder views/
      await loadAllViews();

      // Sembunyikan CSR skeleton loader setelah seluruh modul tampilan terpasang
      const mainSkeleton = document.getElementById('main-skeleton-loader');
      if (mainSkeleton) {
        mainSkeleton.classList.add('fade-out-skeleton');
        setTimeout(() => mainSkeleton.remove(), 250);
      }

      // 2. Inisialisasi Instance Modal Bootstrap & Toast Notifikasi
      const authEl = document.getElementById('modalAuth');
      if (authEl) {
        modalAuth = new bootstrap.Modal(authEl);
        modalLogin = modalAuth;
        modalRegister = modalAuth;
      }
      const pickerEl = document.getElementById('modalPicker');
      if (pickerEl) modalPicker = new bootstrap.Modal(pickerEl);

      const detailEl = document.getElementById('modalDetail');
      if (detailEl) modalDetail = new bootstrap.Modal(detailEl);

      const toastEl = document.getElementById('simpleToast');
      if (toastEl) appToast = new bootstrap.Toast(toastEl, { delay: 3000 });

      const remEl = document.getElementById('modalReminderSuccess');
      if (remEl) modalReminderSuccess = new bootstrap.Modal(remEl);

      // 3. Inisialisasi Nilai Tanggal Hari Ini
      const todayStr = getTodayISO();
      const plateDateInput = document.getElementById('plate-date-input');
      if (plateDateInput) plateDateInput.value = todayStr;

      const filterDateInput = document.getElementById('filter-date');
      if (filterDateInput) filterDateInput.value = todayStr;

      const now = new Date();
      const plateTimeInput = document.getElementById('plate-time-input');
      if (plateTimeInput) {
        plateTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }

      const dashDateText = document.getElementById('dash-date-text');
      if (dashDateText) {
        dashDateText.textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(now);
      }

      // 4. Inisialisasi preset catat dan tampilan draf awal
      selectMealPreset('Sarapan');
      renderDraftItems();
      calcDraft();

      // 5. Periksa Status Sesi Login Pengguna Saat Ini
      await checkCurrentSession();

      // 6. Halaman Awal Standar: HOME / BERANDA
      switchPage('home');

      // 7. Sinkronisasi posisi indikator geser navbar setelah render awal & saat resize / scroll
      setTimeout(() => updateNavIndicator(currentPage), 60);
      setTimeout(() => updateNavIndicator(currentPage), 250);
      window.addEventListener('resize', () => updateNavIndicator(currentPage));
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => updateNavIndicator(currentPage));
      }
      const navContainerEl = document.getElementById('nav-center-tabs');
      if (navContainerEl) {
        navContainerEl.addEventListener('scroll', () => updateNavIndicator(currentPage), { passive: true });
      }
    });

    function getTodayISO() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function fmt(n) {
      if (n === null || n === undefined || isNaN(n)) return '0';
      return Math.round(n).toLocaleString('id-ID');
    }

    // Pemformatan gramatur zat gizi makro presisi (maksimal 1 desimal jika pecahan, tanpa desimal jika bulat)
    function fmtG(n) {
      if (n === null || n === undefined || isNaN(n)) return '0';
      const v = Number(n);
      const rounded = Math.round(v * 10) / 10;
      return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
    }

    function toast(msg) {
      document.getElementById('toastContent').textContent = msg;
      appToast.show();
    }

    let currentPage = 'home';
    const NAV_ORDER = ['home', 'makanan', 'catat', 'dashboard', 'riwayat', 'profil'];

    // Memperbarui posisi dan dimensi indikator kapsul geser pada navbar (Desktop & Mobile)
    function updateNavIndicator(pageId) {
      const navContainer = document.getElementById('nav-center-tabs');
      const indicator = document.getElementById('nav-sliding-indicator');
      const activeBtn = document.getElementById(`nav-btn-${pageId}`);

      if (!navContainer || !indicator) return;

      if (!activeBtn || !activeBtn.offsetWidth) {
        indicator.style.opacity = '0';
        return;
      }

      // Ambil koordinat dan dimensi eksak tombol terhadap kontainer navigasi (relatif)
      const left = activeBtn.offsetLeft;
      const top = activeBtn.offsetTop;
      const width = activeBtn.offsetWidth;
      const height = activeBtn.offsetHeight;

      indicator.style.opacity = '1';
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.transform = `translate(${left}px, ${top}px)`;

      // Gulir otomatis tab aktif ke viewport jika berada di luar batas layar (khusus layar sangat sempit)
      if (typeof activeBtn.scrollIntoView === 'function' && navContainer.scrollWidth > navContainer.clientWidth) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }

    // Pengalih Navigasi Halaman dengan Animasi Geser Halus (Horizontal Smooth Slide)
    function switchPage(pageId) {
      const oldIdx = NAV_ORDER.indexOf(currentPage);
      const newIdx = NAV_ORDER.indexOf(pageId);
      const isForward = newIdx >= oldIdx;

      document.querySelectorAll('.page-section').forEach(s => {
        s.classList.add('d-none');
        s.classList.remove('page-slide-from-right', 'page-slide-from-left');
      });
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

      const sec = document.getElementById(`page-${pageId}`);
      if (sec) {
        sec.classList.remove('d-none');
        // Terapkan animasi geseran halus sesuai arah perpindahan tab
        sec.classList.add(isForward ? 'page-slide-from-right' : 'page-slide-from-left');
      }

      const navBtn = document.getElementById(`nav-btn-${pageId}`);
      if (navBtn) {
        navBtn.classList.add('active');
      }

      // Sinkronkan status aktif pada Bottom Navigation Bar mobile
      document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
      const mobNavBtn = document.getElementById(`mob-btn-${pageId}`);
      if (mobNavBtn) {
        mobNavBtn.classList.add('active');
      }

      currentPage = pageId;
      updateNavIndicator(pageId);
      requestAnimationFrame(() => updateNavIndicator(pageId));

      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (pageId === 'home') {
        renderHomeFeatured();
      } else if (pageId === 'makanan') {
        fetchCatalog();
      } else if (pageId === 'dashboard' && currentUser) {
        fetchDashboard();
      } else if (pageId === 'catat') {
        renderDraftItems();
        if (currentUser) loadTodaySessionsForCatat();
      } else if (pageId === 'riwayat' && currentUser) {
        fetchHistoryByDate(document.getElementById('filter-date').value);
      } else if (pageId === 'profil' && currentUser) {
        renderProfile();
      }
    }

    function requireAuthOrGo(pageId) {
      if (!currentUser) {
        openLoginModal();
        toast('Silakan masuk untuk melihat menu ini.');
        return;
      }
      switchPage(pageId);
    }

    // Pemanggilan API Terpusat dengan Fetch & Kredensial
    async function apiCall(endpoint, opts = {}) {
      const config = {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
      };

      const token = getCookie('access_token') || localStorage.getItem('porsi_token');
      if (token && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (currentUser) {
          currentUser = null;
          updateAuthUI();
        }
      }
      if (!res.ok) {
        throw new Error(data.error || data.message || `Error status ${res.status}`);
      }
      return data;
    }

    function getCookie(name) {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    }

    // ==================== MODUL AUTENTIKASI (LOGIN & REGISTER) ====================

    async function checkCurrentSession() {
      try {
        const res = await apiCall('/api/me');
        if (res && res.data) {
          currentUser = res.data;
        }
      } catch (e) {
        currentUser = null;
      }
      updateAuthUI();
      if (currentUser) {
        if (currentPage === 'riwayat') {
          const filterDateInput = document.getElementById('filter-date');
          const d = (filterDateInput && filterDateInput.value) ? filterDateInput.value : getTodayISO();
          fetchHistoryByDate(d);
        } else if (currentPage === 'dashboard') {
          fetchDashboard();
        }
      }
    }

    function updateAuthUI() {
      const guestActions = document.getElementById('guest-actions');
      const userActions = document.getElementById('user-actions');
      const catalogGuestCard = document.getElementById('catalog-guest-card');

      if (currentUser) {
        guestActions.classList.add('d-none');
        userActions.classList.remove('d-none');
        userActions.classList.add('d-flex');
        if (catalogGuestCard) catalogGuestCard.classList.add('d-none');

        document.getElementById('top-user-name').textContent = currentUser.nama_lengkap || currentUser.username;
        document.getElementById('top-user-target').textContent = `${fmt(currentUser.target_kalori_harian)} kkal`;
        updateTopProgressRing(0, currentUser.target_kalori_harian);
      } else {
        guestActions.classList.remove('d-none');
        userActions.classList.add('d-none');
        userActions.classList.remove('d-flex');
        if (catalogGuestCard) catalogGuestCard.classList.remove('d-none');
      }
    }

    function openLoginModal() {
      const loginErr = document.getElementById('login-error-msg');
      if (loginErr) loginErr.classList.add('d-none');
      const regErr = document.getElementById('reg-error-msg');
      if (regErr) regErr.classList.add('d-none');

      const container = document.getElementById('auth-slider-container');
      if (container) container.classList.remove('active');
      modalAuth.show();
    }

    function openRegisterModal() {
      const loginErr = document.getElementById('login-error-msg');
      if (loginErr) loginErr.classList.add('d-none');
      const regErr = document.getElementById('reg-error-msg');
      if (regErr) regErr.classList.add('d-none');

      const container = document.getElementById('auth-slider-container');
      if (container) container.classList.add('active');
      modalAuth.show();
    }

    function toggleAuthMode(mode) {
      const container = document.getElementById('auth-slider-container');
      if (!container) return;
      if (mode === 'register') {
        container.classList.add('active');
      } else {
        container.classList.remove('active');
      }
    }

    // Toggle Tampilkan / Sembunyikan Password
    function togglePasswordVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      const icon = btn.querySelector('i');
      if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
          icon.classList.remove('bi-eye');
          icon.classList.add('bi-eye-slash');
        }
        btn.setAttribute('title', 'Sembunyikan password');
        btn.setAttribute('aria-label', 'Sembunyikan password');
      } else {
        input.type = 'password';
        if (icon) {
          icon.classList.remove('bi-eye-slash');
          icon.classList.add('bi-eye');
        }
        btn.setAttribute('title', 'Tampilkan password');
        btn.setAttribute('aria-label', 'Tampilkan password');
      }
    }

    function cleanErrorMessage(msg) {
      if (!msg) return 'Terjadi kesalahan, silakan periksa data Anda.';
      if (typeof msg !== 'string') return String(msg);

      // Tangani fallback jika backend mengembalikan validator tag mentah
      if (msg.includes('RegisterRequest.Username') && msg.includes("'min' tag")) {
        return 'Username minimal 3 karakter.';
      }
      if (msg.includes('RegisterRequest.Password') && msg.includes("'min' tag")) {
        return 'Password minimal 8 karakter.';
      }
      if (msg.includes('RegisterRequest.Email')) {
        return 'Format email tidak valid (contoh: budi@mail.com).';
      }
      if (msg.includes('RegisterRequest.NamaLengkap')) {
        return 'Nama lengkap wajib diisi.';
      }
      if (msg.includes('credentials.Username') && msg.includes("'min' tag")) {
        return 'Username minimal 3 karakter.';
      }
      if (msg.includes('credentials.Password') && msg.includes("'min' tag")) {
        return 'Password minimal 8 karakter.';
      }

      // Bersihkan prefix teknis
      let clean = msg.replace(/^Format data tidak valid:\s*/i, '');
      return clean.trim();
    }

    function showAuthError(elId, msg) {
      const el = document.getElementById(elId);
      if (!el) return;
      const clean = cleanErrorMessage(msg);
      el.innerHTML = `<i class="bi bi-exclamation-circle-fill flex-shrink-0" style="font-size: 13.5px;"></i><span>${clean}</span>`;
      el.classList.remove('d-none');
    }

    async function submitLogin(e) {
      e.preventDefault();
      const u = document.getElementById('login-user').value.trim();
      const p = document.getElementById('login-pass').value;
      const btn = document.getElementById('btn-submit-login');
      const errMsg = document.getElementById('login-error-msg');

      errMsg.classList.add('d-none');

      if (!u || u.length < 3) {
        showAuthError('login-error-msg', 'Username minimal 3 karakter.');
        return;
      }
      if (!p || p.length < 8) {
        showAuthError('login-error-msg', 'Password minimal 8 karakter.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Memproses...';

      try {
        const res = await apiCall('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: u, password: p })
        });
        if (res.data && res.data.access_token) {
          localStorage.setItem('porsi_token', res.data.access_token);
        }
        modalLogin.hide();
        toast('Berhasil masuk.');
        await checkCurrentSession();
      } catch (err) {
        showAuthError('login-error-msg', err.message || 'Username atau password salah.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Masuk ke Akun';
      }
    }

    async function submitRegister(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-submit-reg');
      const errMsg = document.getElementById('reg-error-msg');

      errMsg.classList.add('d-none');

      const body = {
        username: document.getElementById('reg-username').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-pass').value,
        nama_lengkap: document.getElementById('reg-nama').value.trim(),
        gender: document.getElementById('reg-gender').value,
        usia: parseInt(document.getElementById('reg-usia').value, 10),
        berat_badan: parseFloat(document.getElementById('reg-bb').value),
        tinggi_badan: parseFloat(document.getElementById('reg-tb').value),
        tingkat_aktivitas: document.getElementById('reg-akt').value
      };

      // Validasi client-side yang ramah dan manusiawi
      if (!body.username || body.username.length < 3) {
        showAuthError('reg-error-msg', 'Username minimal 3 karakter.');
        return;
      }
      if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        showAuthError('reg-error-msg', 'Format email tidak valid (contoh: budi@mail.com).');
        return;
      }
      if (!body.password || body.password.length < 8) {
        showAuthError('reg-error-msg', 'Password minimal 8 karakter.');
        return;
      }
      if (!body.nama_lengkap) {
        showAuthError('reg-error-msg', 'Nama lengkap wajib diisi.');
        return;
      }
      if (isNaN(body.usia) || body.usia < 10 || body.usia > 120) {
        showAuthError('reg-error-msg', 'Usia harus antara 10 hingga 120 tahun.');
        return;
      }
      if (isNaN(body.berat_badan) || body.berat_badan <= 0 || isNaN(body.tinggi_badan) || body.tinggi_badan <= 0) {
        showAuthError('reg-error-msg', 'Berat dan tinggi badan harus lebih dari 0.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Mendaftarkan...';

      try {
        await apiCall('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
        const logRes = await apiCall('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: body.username, password: body.password })
        });
        if (logRes.data && logRes.data.access_token) {
          localStorage.setItem('porsi_token', logRes.data.access_token);
        }
        modalRegister.hide();
        toast('Pendaftaran berhasil.');
        await checkCurrentSession();
      } catch (err) {
        showAuthError('reg-error-msg', err.message || 'Gagal mendaftar. Silakan periksa kembali data Anda.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Daftar & Hitung Target';
      }
    }

    async function logout() {
      try {
        await apiCall('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      localStorage.removeItem('porsi_token');
      document.cookie = 'access_token=; Max-Age=0; path=/';
      currentUser = null;
      updateAuthUI();
      toast('Telah keluar.');
      switchPage('makanan');
    }

    // ==================== MODUL KATALOG MAKANAN ====================

    async function fetchCatalog() {
      const grid = document.getElementById('food-catalog-grid');
      grid.innerHTML = '<div class="col-12 py-4 text-center text-secondary small">Memuat makanan...</div>';

      try {
        const res = await apiCall(`/api/public/makanan?search=${encodeURIComponent(catalogQuery)}&page=${curCatalogPage}&limit=16`);
        const items = res.data || [];
        const total = res.total || 0;

        renderFoodCards(items, total);
      } catch (err) {
        grid.innerHTML = `<div class="col-12 py-4 text-center text-danger small">Gagal memuat makanan: ${err.message}</div>`;
      }
    }

    const FOOD_IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='120' viewBox='0 0 240 120'%3E%3Crect width='100%25' height='100%25' fill='%23F0F1EB'/%3E%3Ccircle cx='120' cy='50' r='18' fill='%23E1E4DA'/%3E%3Cpath d='M106 74h28a14 14 0 0 1-28 0z' fill='%238F9787'/%3E%3Ctext x='120' y='98' text-anchor='middle' fill='%23777F70' font-family='sans-serif' font-size='11' font-weight='500'%3EKuliner%3C/text%3E%3C/svg%3E";

    function renderFoodCards(items, total) {
      const grid = document.getElementById('food-catalog-grid');
      if (items.length === 0) {
        grid.innerHTML = '<div class="col-12 py-5 text-center text-secondary small">Tidak ada makanan yang cocok.</div>';
        renderPagination(0, 1, 16);
        return;
      }

      let html = '';
      items.forEach(f => {
        html += `
          <div class="col">
            <div class="food-item-card">
              <img src="${f.image || ''}" class="food-item-img" alt="${f.name}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=FOOD_IMG_FALLBACK;">
              <div class="food-item-body">
                <div class="food-item-title" title="${f.name}">${f.name}</div>
                <div class="food-card-cal">${fmt(f.calories)} <small>kkal / 100g</small></div>
                <div class="macro-clean-grid">
                  <div class="macro-clean-col">
                    <span class="m-clean-lbl">Protein</span>
                    <span class="m-clean-val"><strong>${f.proteins}</strong><span>g</span></span>
                  </div>
                  <div class="macro-clean-divider"></div>
                  <div class="macro-clean-col">
                    <span class="m-clean-lbl">Karbohidrat</span>
                    <span class="m-clean-val"><strong>${f.carbohydrate}</strong><span>g</span></span>
                  </div>
                  <div class="macro-clean-divider"></div>
                  <div class="macro-clean-col">
                    <span class="m-clean-lbl">Lemak</span>
                    <span class="m-clean-val"><strong>${f.fat}</strong><span>g</span></span>
                  </div>
                </div>
                <div class="mt-auto d-flex gap-1">
                  <button type="button" class="btn btn-subtle btn-sm flex-fill p-1" onclick="openDetailModal(${JSON.stringify(f).replace(/"/g, '&quot;')})">Detail</button>
                  <button type="button" class="btn btn-olive btn-sm flex-fill p-1" onclick="quickAddPlate(${JSON.stringify(f).replace(/"/g, '&quot;')})">+ Catat</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      grid.innerHTML = html;

      // Paginasi Interaktif Bernomor Modern
      renderPagination(total, curCatalogPage, 16);
    }

    function renderPagination(total, curPage, limit = 16) {
      const container = document.getElementById('pagination-buttons-container');
      const info = document.getElementById('pagination-info');
      const totalPages = Math.ceil(total / limit) || 1;

      const startItem = total === 0 ? 0 : (curPage - 1) * limit + 1;
      const endItem = Math.min(curPage * limit, total);
      if (info) {
        info.innerHTML = total === 0 
          ? 'Tidak ada data makanan' 
          : `Menampilkan <strong>${startItem}–${endItem}</strong> dari <strong>${total}</strong> bahan makanan`;
      }

      if (!container) return;

      let html = '';

      // Tombol Halaman Sebelumnya
      const prevDisabled = curPage <= 1 ? 'disabled' : '';
      html += `
        <button type="button" class="btn-page-nav" onclick="goToFoodPage(${curPage - 1})" ${prevDisabled}>
          <i class="bi bi-chevron-left" style="font-size: 11px;"></i> <span>Sebelumnya</span>
        </button>
      `;

      // Nomor Halaman (Jendela Geser Cerdas)
      const maxButtons = 5;
      let startPage = Math.max(1, curPage - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      if (startPage > 1) {
        html += `<button type="button" class="btn-page-num" onclick="goToFoodPage(1)">1</button>`;
        if (startPage > 2) {
          html += `<span class="page-ellipsis">…</span>`;
        }
      }

      for (let p = startPage; p <= endPage; p++) {
        const activeCls = p === curPage ? 'active' : '';
        html += `<button type="button" class="btn-page-num ${activeCls}" onclick="goToFoodPage(${p})">${p}</button>`;
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          html += `<span class="page-ellipsis">…</span>`;
        }
        html += `<button type="button" class="btn-page-num" onclick="goToFoodPage(${totalPages})">${totalPages}</button>`;
      }

      // Tombol Halaman Berikutnya
      const nextDisabled = curPage >= totalPages ? 'disabled' : '';
      html += `
        <button type="button" class="btn-page-nav" onclick="goToFoodPage(${curPage + 1})" ${nextDisabled}>
          <span>Berikutnya</span> <i class="bi bi-chevron-right" style="font-size: 11px;"></i>
        </button>
      `;

      container.innerHTML = html;
    }

    function goToFoodPage(page) {
      if (page < 1 || page === curCatalogPage) return;
      curCatalogPage = page;
      fetchCatalog();
      const catalogEl = document.getElementById('page-makanan');
      if (catalogEl) {
        catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function changeFoodPage(delta) {
      goToFoodPage(curCatalogPage + delta);
    }

    function searchFromHero(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('hero-search-input');
      const val = input ? input.value.trim() : '';
      switchPage('makanan');
      if (val) {
        const catalogInput = document.getElementById('search-food-input');
        if (catalogInput) catalogInput.value = val;
        handleCatalogSearchInput(val);
      }
    }

    async function renderHomeFeatured() {
      const grid = document.getElementById('home-featured-grid');
      if (!grid || grid.children.length > 0) return;

      const populer = ['Nasi Goreng', 'Pempek Kapal Selam', 'Mie Ayam', 'Bakso'];

      try {
        const promises = populer.map(nama => 
          apiCall(`/api/public/makanan?search=${encodeURIComponent(nama)}&limit=1`)
        );
        const results = await Promise.all(promises);
        let items = results.map(r => (r.data && r.data[0]) || null).filter(Boolean);

        if (items.length < 4) {
          const fallback = await apiCall('/api/public/makanan?limit=4');
          const fallbackItems = fallback.data || [];
          for (const fb of fallbackItems) {
            if (items.length >= 4) break;
            if (!items.some(it => it.id === fb.id)) {
              items.push(fb);
            }
          }
        }

        if (items.length === 0) return;

        let html = '';
        items.forEach(f => {
          html += `
            <div class="col">
              <div class="food-item-card">
                <img src="${f.image || ''}" class="food-item-img" alt="${f.name}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src=FOOD_IMG_FALLBACK;">
                <div class="food-item-body">
                  <div class="food-item-title" title="${f.name}">${f.name}</div>
                  <div class="food-card-cal">${fmt(f.calories)} <small>kkal / 100g</small></div>
                  <div class="macro-clean-grid">
                    <div class="macro-clean-col">
                      <span class="m-clean-lbl">Protein</span>
                      <span class="m-clean-val"><strong>${f.proteins}</strong><span>g</span></span>
                    </div>
                    <div class="macro-clean-divider"></div>
                    <div class="macro-clean-col">
                      <span class="m-clean-lbl">Karbohidrat</span>
                      <span class="m-clean-val"><strong>${f.carbohydrate}</strong><span>g</span></span>
                    </div>
                    <div class="macro-clean-divider"></div>
                    <div class="macro-clean-col">
                      <span class="m-clean-lbl">Lemak</span>
                      <span class="m-clean-val"><strong>${f.fat}</strong><span>g</span></span>
                    </div>
                  </div>
                  <div class="mt-auto d-flex gap-1">
                    <button type="button" class="btn btn-subtle btn-sm flex-fill p-1" onclick="openDetailModal(${JSON.stringify(f).replace(/"/g, '&quot;')})">Detail</button>
                    <button type="button" class="btn btn-olive btn-sm flex-fill p-1" onclick="quickAddPlate(${JSON.stringify(f).replace(/"/g, '&quot;')})">+ Catat</button>
                  </div>
                </div>
              </div>
            </div>
          `;
        });
        grid.innerHTML = html;
      } catch (err) {
        // Fallback diam jika terjadi galat jaringan
      }
    }

    function handleCatalogSearchInput(val) {
      const clearBtn = document.getElementById('btn-clear-search');
      if (clearBtn) {
        clearBtn.style.display = val.trim().length > 0 ? 'flex' : 'none';
      }
      debounceFoodSearch(val);
    }

    function clearCatalogSearch() {
      const input = document.getElementById('search-food-input');
      if (input) input.value = '';
      const clearBtn = document.getElementById('btn-clear-search');
      if (clearBtn) clearBtn.style.display = 'none';
      catalogQuery = '';
      curCatalogPage = 1;
      fetchCatalog();
    }

    function debounceFoodSearch(val) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        catalogQuery = val.trim();
        curCatalogPage = 1;
        fetchCatalog();
      }, 250);
    }

    function openDetailModal(f) {
      document.getElementById('detail-name').textContent = f.name || '-';
      document.getElementById('detail-cal').textContent = fmt(f.calories);
      document.getElementById('detail-prot').textContent = f.proteins ?? 0;
      document.getElementById('detail-carb').textContent = f.carbohydrate ?? 0;
      document.getElementById('detail-fat').textContent = f.fat ?? 0;
      document.getElementById('detail-img').src = f.image || FOOD_IMG_FALLBACK;

      const catEl = document.getElementById('detail-category');
      if (catEl) catEl.textContent = f.category || 'Bahan Pangan';

      // Hitung proporsi zat gizi berdasarkan gramatur aktual
      const protG = Number(f.proteins) || 0;
      const carbG = Number(f.carbohydrate) || 0;
      const fatG = Number(f.fat) || 0;
      const totGram = protG + carbG + fatG;

      let protPct = 0;
      let carbPct = 0;
      let fatPct = 0;
      if (totGram > 0) {
        protPct = Math.round((protG / totGram) * 100);
        fatPct = Math.round((fatG / totGram) * 100);
        carbPct = Math.max(0, 100 - protPct - fatPct);
      }

      const barProt = document.getElementById('detail-bar-prot');
      const barCarb = document.getElementById('detail-bar-carb');
      const barFat = document.getElementById('detail-bar-fat');
      if (barProt) barProt.style.width = `${protPct}%`;
      if (barCarb) barCarb.style.width = `${carbPct}%`;
      if (barFat) barFat.style.width = `${fatPct}%`;

      const macroPctText = document.getElementById('detail-macro-pct-text');
      if (macroPctText) {
        macroPctText.textContent = `${protPct}% Protein • ${carbPct}% Karbohidrat • ${fatPct}% Lemak`;
      }

      document.getElementById('btn-detail-add').onclick = () => {
        modalDetail.hide();
        quickAddPlate(f);
      };

      modalDetail.show();
    }

    function quickAddPlate(f) {
      if (!currentUser) {
        openLoginModal();
        toast('Masuk untuk mencatat makanan ke piring.');
        return;
      }
      addDraftItem(f);
      switchPage('catat');
    }

    // ==================== MODUL DASHBOARD & RINGKASAN GIZI ====================

    async function fetchDashboard() {
      if (!currentUser) return;
      const today = getTodayISO();
      const target = currentUser.target_kalori_harian || 2000;

      const targetPill = document.getElementById('dash-target-pill');
      if (targetPill) targetPill.textContent = `Target: ${fmt(target)} kkal`;
      const targetMax = document.getElementById('dash-target-max');
      if (targetMax) targetMax.textContent = fmt(target);
      const bmrEl = document.getElementById('dash-bmr-text');
      if (bmrEl) bmrEl.textContent = fmt(currentUser.bmr);

      // Target Kandungan Gizi Standar Seimbang (Protein 20%, Karbohidrat 50%, Lemak 30%)
      const targetProt = Math.round((target * 0.20) / 4);
      const targetCarb = Math.round((target * 0.50) / 4);
      const targetFat = Math.round((target * 0.30) / 9);

      const protTargetEl = document.getElementById('dash-prot-target');
      if (protTargetEl) protTargetEl.textContent = `${targetProt}g`;
      const carbTargetEl = document.getElementById('dash-carb-target');
      if (carbTargetEl) carbTargetEl.textContent = `${targetCarb}g`;
      const fatTargetEl = document.getElementById('dash-fat-target');
      if (fatTargetEl) fatTargetEl.textContent = `${targetFat}g`;

      try {
        const res = await apiCall(`/api/private/piring?date=${today}`);
        const meals = res.data || [];
        // Urutkan sesi makan secara kronologis biologis harian (Waktu & Sesi)
        sortMealsChronologically(meals);
        renderDashboard(meals, target, { prot: targetProt, carb: targetCarb, fat: targetFat });
      } catch (e) {
        document.getElementById('dash-meals-list').innerHTML = `<div class="text-danger small py-2">${e.message}</div>`;
      }
    }

    // Pengurutan Sesi Makan Alami (Berdasarkan Jam Konsumsi & Alur Sesi Harian)
    function sortMealsChronologically(meals) {
      const sessionHierarchy = {
        'Sarapan': 1,
        'Makan Siang': 2,
        'Makan Malam': 3,
        'Camilan': 4
      };
      meals.sort((a, b) => {
        // 1. Jika ada jam spesifik (format HH:mm), urutkan berdasarkan waktu jam
        if (a.meal_time && b.meal_time && a.meal_time !== b.meal_time) {
          return a.meal_time.localeCompare(b.meal_time);
        }
        // 2. Fallback berdasarkan hierarki sesi harian (Sarapan -> Siang -> Malam -> Camilan)
        const orderA = sessionHierarchy[a.name] || 99;
        const orderB = sessionHierarchy[b.name] || 99;
        return orderA - orderB;
      });
    }

    // Pembantu Ikon Sesi Makan
    function getMealIcon(mealName) {
      switch (mealName) {
        case 'Sarapan': return 'bi-sun text-warning';
        case 'Makan Siang': return 'bi-brightness-high text-warning';
        case 'Makan Malam': return 'bi-moon-stars text-primary';
        case 'Camilan': return 'bi-cup-hot text-danger';
        default: return 'bi-egg-fried text-success';
      }
    }

    function renderDashboard(meals, target, targets = { prot: 100, carb: 250, fat: 65 }) {
      let cal = 0, p = 0, c = 0, f = 0;
      let mealCals = {
        Sarapan: 0,
        'Makan Siang': 0,
        'Makan Malam': 0,
        Camilan: 0
      };

      meals.forEach(m => {
        let mCal = 0;
        if (m.isi_piring) {
          m.isi_piring.forEach(it => {
            if (it.makanan) {
              const r = it.gram / 100;
              const itemCal = (it.makanan.calories || 0) * r;
              cal += itemCal;
              mCal += itemCal;
              p += (it.makanan.proteins || 0) * r;
              c += (it.makanan.carbohydrate || 0) * r;
              f += (it.makanan.fat || 0) * r;
            }
          });
        }
        if (mealCals.hasOwnProperty(m.name)) {
          mealCals[m.name] += mCal;
        } else {
          mealCals['Camilan'] += mCal;
        }
      });

      // Tampilkan konsumsi kalori
      document.getElementById('dash-consumed-num').textContent = fmt(cal);

      // Tampilkan kalori per waktu sesi makan
      const sarapanEl = document.getElementById('dash-meal-sarapan-cal');
      if (sarapanEl) sarapanEl.textContent = fmt(mealCals['Sarapan']);
      const siangEl = document.getElementById('dash-meal-siang-cal');
      if (siangEl) siangEl.textContent = fmt(mealCals['Makan Siang']);
      const malamEl = document.getElementById('dash-meal-malam-cal');
      if (malamEl) malamEl.textContent = fmt(mealCals['Makan Malam']);
      const camilanEl = document.getElementById('dash-meal-camilan-cal');
      if (camilanEl) camilanEl.textContent = fmt(mealCals['Camilan']);

      // Nilai makro harian presisi
      document.getElementById('dash-prot').textContent = fmtG(p);
      document.getElementById('dash-carb').textContent = fmtG(c);
      document.getElementById('dash-fat').textContent = fmtG(f);

      // Bilah progres makro harian
      const protPct = Math.min(100, Math.round((p / (targets.prot || 100)) * 100));
      const carbPct = Math.min(100, Math.round((c / (targets.carb || 250)) * 100));
      const fatPct = Math.min(100, Math.round((f / (targets.fat || 65)) * 100));

      const protBar = document.getElementById('dash-prot-bar');
      if (protBar) protBar.style.width = `${protPct}%`;
      const carbBar = document.getElementById('dash-carb-bar');
      if (carbBar) carbBar.style.width = `${carbPct}%`;
      const fatBar = document.getElementById('dash-fat-bar');
      if (fatBar) fatBar.style.width = `${fatPct}%`;

      // Evaluasi pemenuhan target energi
      const remain = target - cal;
      const pct = Math.min(100, Math.round((cal / target) * 100));
      const progressBar = document.getElementById('dash-progress-bar');
      progressBar.style.width = `${pct}%`;
      document.getElementById('dash-progress-pct').textContent = `${pct}% tercapai`;

      const remainEl = document.getElementById('dash-remaining-num');
      if (remain >= 0) {
        remainEl.textContent = `Sisa ${fmt(remain)} kkal`;
        progressBar.style.backgroundColor = 'var(--olive)';
      } else {
        remainEl.textContent = `Lebih ${fmt(Math.abs(remain))} kkal`;
        progressBar.style.backgroundColor = 'var(--danger)';
      }

      document.getElementById('dash-meal-count').textContent = `${meals.length} Sesi`;

      // Perbarui Mini Progress Ring Kalori di Header & Status Onboarding Baru
      updateTopProgressRing(cal, target);
      checkOnboardingVisibility(meals.length);

      const dashTopBtn = document.getElementById('btn-dash-catat-top');
      const list = document.getElementById('dash-meals-list');
      if (meals.length === 0) {
        if (dashTopBtn) {
          dashTopBtn.classList.add('d-none');
          dashTopBtn.style.setProperty('display', 'none', 'important');
        }
        list.innerHTML = `
          <div class="text-center py-4 text-secondary small">
            Belum ada catatan makan hari ini.<br>
            <button type="button" class="btn btn-subtle btn-sm mt-2" onclick="switchPage('catat')">+ Catat Sekarang</button>
          </div>
        `;
        return;
      }

      if (dashTopBtn) {
        dashTopBtn.classList.remove('d-none');
        dashTopBtn.style.removeProperty('display');
        dashTopBtn.style.display = 'inline-block';
      }

      let html = '<div class="session-cards-list">';
      meals.forEach(m => {
        let sCal = 0, sP = 0, sC = 0, sF = 0;
        let foodChipsHtml = '';
        if (m.isi_piring && m.isi_piring.length > 0) {
          foodChipsHtml = m.isi_piring.map(it => {
            if (!it.makanan) return '';
            const r = (Number(it.gram) || 0) / 100;
            sCal += (Number(it.makanan.calories) || 0) * r;
            sP += (Number(it.makanan.proteins) || 0) * r;
            sC += (Number(it.makanan.carbohydrate) || 0) * r;
            sF += (Number(it.makanan.fat) || 0) * r;
            return `<span class="session-food-chip"><span class="food-chip-name">${it.makanan.name}</span><span class="food-chip-gram">${it.gram}g</span></span>`;
          }).join('');
        } else {
          foodChipsHtml = '<span class="text-secondary small fst-italic">Belum ada makanan terdaftar</span>';
        }

        let pillClass = 'session-pill-kustom';
        if (m.name === 'Sarapan') pillClass = 'session-pill-sarapan';
        else if (m.name === 'Makan Siang') pillClass = 'session-pill-siang';
        else if (m.name === 'Makan Malam') pillClass = 'session-pill-malam';
        else if (m.name === 'Camilan') pillClass = 'session-pill-camilan';

        html += `
          <div class="history-session-card">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="session-header-left">
                <span class="session-type-pill ${pillClass}">${m.name}</span>
                <span class="session-time-pill"><i class="bi bi-clock me-1 text-muted" style="font-size: 11px;"></i>${m.meal_time}</span>
              </div>
              <div class="d-flex align-items-center gap-2">
                <div class="text-end">
                  <strong class="text-dark fs-6">${fmt(sCal)}</strong>
                  <small class="text-secondary fw-normal ms-0.5" style="font-size: 11px;">kkal</small>
                </div>
                <div class="session-actions-group">
                  <button type="button" class="btn btn-sm btn-subtle btn-edit-circle" onclick="startEditMeal(${m.id})" title="Edit & tambah makanan di sesi ini">
                    <i class="bi bi-pencil" style="font-size: 13px;"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-subtle text-danger btn-trash-circle" onclick="deleteDashboardMeal(${m.id})" title="Hapus sesi ini">
                    <i class="bi bi-trash3" style="font-size: 13px;"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="session-food-chips">
              ${foodChipsHtml}
            </div>

            <div class="d-flex align-items-center pt-2 border-top" style="border-color: #F0F2EC !important;">
              <div class="session-macro-pills d-flex align-items-center flex-wrap gap-2 w-100">
                <span class="session-macro-tag">
                  <span class="macro-dot macro-dot-prot me-1" style="background-color: #55734B !important;"></span>Protein: <strong class="text-dark">${fmtG(sP)}g</strong>
                </span>
                <span class="text-muted d-none d-sm-inline" style="font-size: 10px;">•</span>
                <span class="session-macro-tag">
                  <span class="macro-dot macro-dot-carb me-1" style="background-color: #E7A93B !important;"></span>Karbo: <strong class="text-dark">${fmtG(sC)}g</strong>
                </span>
                <span class="text-muted d-none d-sm-inline" style="font-size: 10px;">•</span>
                <span class="session-macro-tag">
                  <span class="macro-dot macro-dot-fat me-1" style="background-color: #A84135 !important;"></span>Lemak: <strong class="text-dark">${fmtG(sF)}g</strong>
                </span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      list.innerHTML = html;
    }

    // Fungsi menghapus sesi makan langsung dari Ringkasan/Dashboard
    async function deleteDashboardMeal(id) {
      if (!confirm('Hapus sesi makan ini dari catatan hari ini?')) return;
      try {
        await apiCall(`/api/private/piring/${id}`, { method: 'DELETE' });
        toast('Sesi makan berhasil dihapus.');
        fetchDashboard();
      } catch (e) {
        toast(`Gagal menghapus sesi: ${e.message}`);
      }
    }

    // ==================== MODUL CATAT PORSI MAKAN ====================

    function selectMealPreset(v) {
      document.querySelectorAll('.meal-preset-pill').forEach(b => {
        const isAct = b.getAttribute('data-preset') === v;
        b.classList.toggle('btn-olive', isAct);
        b.classList.toggle('btn-subtle', !isAct);
      });

      const presetSelect = document.getElementById('plate-preset');
      if (presetSelect) presetSelect.value = v;

      const nameInput = document.getElementById('plate-meal-name');
      if (nameInput) {
        if (v !== 'custom') {
          nameInput.value = v;
        } else {
          nameInput.value = '';
          nameInput.focus();
        }
      }
    }

    function setMealNamePreset(v) {
      selectMealPreset(v);
    }

    function stepDraftGram(idx, delta) {
      if (!draftItems[idx]) return;
      let cur = parseFloat(draftItems[idx].gram) || 0;
      let next = Math.max(10, Math.min(2500, cur + delta));
      draftItems[idx].gram = next;
      renderDraftItems();
    }

    function openPickerModal() {
      const inp = document.getElementById('picker-input');
      if (inp) inp.value = '';
      modalPicker.show();
      loadPickerItems('');
      setTimeout(() => {
        if (inp) inp.focus();
      }, 250);
    }

    async function loadPickerItems(q) {
      const list = document.getElementById('picker-list');
      const countBadge = document.getElementById('picker-count-badge');
      list.innerHTML = '<div class="p-3 text-center text-secondary small">Memuat daftar makanan...</div>';

      try {
        // Ambil seluruh makanan di database secara dinamis tanpa terpotong limit kaku
        const res = await apiCall(`/api/public/makanan?search=${encodeURIComponent(q)}&limit=2000`);
        const items = res.data || [];
        const totalCount = (res.total !== undefined && res.total !== null) ? res.total : items.length;

        if (countBadge) {
          if (!q) {
            countBadge.innerHTML = `Menampilkan seluruh <strong>${totalCount}</strong> makanan`;
          } else {
            countBadge.innerHTML = `Ditemukan <strong>${items.length}</strong> hasil untuk "<em>${q}</em>"`;
          }
        }

        if (items.length === 0) {
          list.innerHTML = '<div class="p-4 text-center text-secondary small">Makanan tidak ditemukan. Coba kata kunci lain.</div>';
          return;
        }

        let html = '';
        items.forEach(f => {
          html += `
            <div class="list-group-item px-3 py-2.5 d-flex align-items-center justify-content-between border-0 border-bottom picker-food-item" onclick="selectPickerItem(${JSON.stringify(f).replace(/"/g, '&quot;')})" style="cursor: pointer;">
              <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                <img src="${f.image || ''}" alt="${f.name}" class="rounded flex-shrink-0 border" style="width: 46px; height: 46px; object-fit: cover;" onerror="this.onerror=null; this.src=FOOD_IMG_FALLBACK;">
                <div style="min-width: 0;">
                  <div class="d-flex align-items-center gap-2 mb-1">
                    <strong class="text-truncate text-dark" style="font-size: 13.5px;" title="${f.name}">${f.name}</strong>
                    <span class="badge text-bg-light border text-dark fw-semibold" style="font-size: 11px;">${fmt(f.calories)} kkal</span>
                  </div>
                  <div class="text-secondary small d-flex flex-wrap align-items-center gap-1" style="font-size: 11px;">
                    <span>Protein <strong class="text-dark">${fmtG(f.proteins || 0)}g</strong></span>
                    <span class="text-muted mx-1">•</span>
                    <span>Karbohidrat <strong class="text-dark">${fmtG(f.carbohydrate || 0)}g</strong></span>
                    <span class="text-muted mx-1">•</span>
                    <span>Lemak <strong class="text-dark">${fmtG(f.fat || 0)}g</strong></span>
                  </div>
                </div>
              </div>
              <button type="button" class="btn btn-olive btn-sm py-1 px-3 ms-3 flex-shrink-0" style="font-size: 11.5px; border-radius: 99px;">+ Pilih</button>
            </div>
          `;
        });
        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = `<div class="p-3 text-danger small text-center">${e.message}</div>`;
        if (countBadge) countBadge.textContent = 'Gagal memuat';
      }
    }

    let pickerTimer;
    function searchPicker(v) {
      clearTimeout(pickerTimer);
      pickerTimer = setTimeout(() => {
        loadPickerItems(v.trim());
      }, 200);
    }

    function selectPickerItem(f) {
      addDraftItem(f);
      modalPicker.hide();
    }

    function addDraftItem(f) {
      draftItems.push({ makanan: f, makanan_id: f.id, gram: 100 });
      renderDraftItems();
      toast(`${f.name} ditambahkan.`);
    }

    function removeDraftItem(idx) {
      draftItems.splice(idx, 1);
      renderDraftItems();
    }

    function updateDraftGram(idx, val) {
      const g = parseFloat(val);
      draftItems[idx].gram = isNaN(g) ? 0 : g;
      calcDraft();
    }

    function renderDraftItems() {
      const wrap = document.getElementById('plate-items-wrap');
      const topBtn = document.getElementById('btn-plate-add-top');

      if (draftItems.length === 0) {
        if (topBtn) {
          topBtn.classList.add('d-none');
          topBtn.style.setProperty('display', 'none', 'important');
        }
        wrap.innerHTML = `
          <div class="text-center py-5 border rounded text-secondary small" style="background: #FAFBF8;">
            <div class="mb-2">Belum ada makanan di piring.</div>
            <button type="button" class="btn btn-subtle btn-sm" onclick="openPickerModal()"><i class="bi bi-plus-lg me-1"></i> Tambah Makanan</button>
          </div>
        `;
        calcDraft();
        return;
      }

      if (topBtn) {
        topBtn.classList.remove('d-none');
        topBtn.style.removeProperty('display');
        topBtn.style.display = 'inline-block';
      }

      let html = '<div class="d-flex flex-column gap-2">';
      draftItems.forEach((it, idx) => {
        const c = (it.makanan.calories || 0) * (it.gram / 100);
        html += `
          <div class="session-item-row">
            <div class="d-flex align-items-center gap-3 flex-grow-1" style="min-width: 0;">
              <img src="${it.makanan.image || ''}" alt="${it.makanan.name}" class="rounded flex-shrink-0 border" style="width: 48px; height: 48px; object-fit: cover;" onerror="this.onerror=null; this.src=FOOD_IMG_FALLBACK;">
              <div style="min-width: 0;">
                <strong class="d-block text-truncate text-dark fw-bold" style="font-size: 15px;" title="${it.makanan.name}">${it.makanan.name}</strong>
                <span class="text-secondary" style="font-size: 12.5px;">${fmt(it.makanan.calories)} kkal / 100g</span>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2">
              <div class="portion-stepper-widget">
                <button type="button" class="btn-stepper-adj" onclick="stepDraftGram(${idx}, -25)" title="Kurangi 25g"><i class="bi bi-dash"></i></button>
                <input type="number" class="stepper-num-input" min="10" max="2500" value="${it.gram}" oninput="updateDraftGram(${idx}, this.value)">
                <span class="stepper-unit">g</span>
                <button type="button" class="btn-stepper-adj" onclick="stepDraftGram(${idx}, 25)" title="Tambah 25g"><i class="bi bi-plus"></i></button>
              </div>

              <div class="d-flex align-items-center gap-1.5">
                <strong class="text-dark text-nowrap" style="min-width: 68px; text-align: right; font-size: 14.5px;">${fmt(c)} <small class="text-secondary fw-normal" style="font-size: 12px;">kkal</small></strong>
                <button type="button" class="btn btn-sm btn-subtle text-danger btn-trash-circle ms-1" onclick="removeDraftItem(${idx})" title="Hapus makanan">
                  <i class="bi bi-trash3" style="font-size: 14px;"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      wrap.innerHTML = html;
      calcDraft();
    }

    function calcDraft() {
      let cal = 0, p = 0, c = 0, f = 0;
      draftItems.forEach(it => {
        const r = (it.gram || 0) / 100;
        cal += (it.makanan.calories || 0) * r;
        p += (it.makanan.proteins || 0) * r;
        c += (it.makanan.carbohydrate || 0) * r;
        f += (it.makanan.fat || 0) * r;
      });

      document.getElementById('plate-calc-cal').textContent = fmt(cal);
      document.getElementById('plate-calc-prot').textContent = fmtG(p);
      document.getElementById('plate-calc-carb').textContent = fmtG(c);
      document.getElementById('plate-calc-fat').textContent = fmtG(f);

      // Perhitungan rasio segmen bilah progres zat gizi piring berdasarkan proporsi gramatur aktual
      const totalGram = p + c + f;
      const barProt = document.getElementById('plate-bar-prot');
      const barCarb = document.getElementById('plate-bar-carb');
      const barFat = document.getElementById('plate-bar-fat');

      if (totalGram > 0) {
        const protPct = Math.round((p / totalGram) * 100);
        const fatPct = Math.round((f / totalGram) * 100);
        const carbPct = Math.max(0, 100 - protPct - fatPct);

        if (barProt) {
          barProt.style.width = `${protPct}%`;
          barProt.title = `Protein: ${protPct}% (${fmtG(p)}g)`;
        }
        if (barCarb) {
          barCarb.style.width = `${carbPct}%`;
          barCarb.title = `Karbohidrat: ${carbPct}% (${fmtG(c)}g)`;
        }
        if (barFat) {
          barFat.style.width = `${fatPct}%`;
          barFat.title = `Lemak: ${fatPct}% (${fmtG(f)}g)`;
        }
      } else {
        if (barProt) barProt.style.width = '0%';
        if (barCarb) barCarb.style.width = '0%';
        if (barFat) barFat.style.width = '0%';
      }
    }

    function resetPlateDraft() {
      draftItems = [];
      renderDraftItems();
    }

    // Mengatur perubahan pilihan dropdown sesi makan
    function handleSessionDropdownChange(val) {
      if (!val || val === 'new') {
        cancelEditMeal();
      } else {
        startEditMeal(Number(val));
      }
    }

    // Memuat daftar sesi makan ke dalam dropdown agar pengguna bisa memilih sesi lama atau membuat baru tanpa tombol menumpuk
    async function loadTodaySessionsForCatat(targetDate) {
      if (!currentUser) return;
      const select = document.getElementById('plate-session-select');
      if (!select) return;

      const dateToFetch = targetDate || document.getElementById('plate-date-input')?.value || new Date().toISOString().split('T')[0];

      try {
        const res = await apiCall(`/api/private/piring?date=${dateToFetch}`);
        const meals = res.data || [];
        sortMealsChronologically(meals);

        let html = '<option value="new">+ Catat Sesi Baru (Kosong)</option>';
        meals.forEach(s => {
          let sCal = 0;
          let count = 0;
          if (s.isi_piring) {
            count = s.isi_piring.length;
            s.isi_piring.forEach(it => {
              if (it.makanan) {
                sCal += (it.makanan.calories || 0) * (it.gram / 100);
              }
            });
          }
          const isSelected = editingMealId === s.id ? 'selected' : '';
          html += `<option value="${s.id}" ${isSelected}>${s.name} (${s.meal_time || '-'}) • ${count} makanan • ${fmt(sCal)} kkal</option>`;
        });

        select.innerHTML = html;

        // Pastikan nilai dropdown konsisten dengan status edit
        if (editingMealId) {
          select.value = String(editingMealId);
          const badge = document.getElementById('plate-edit-status-badge');
          if (badge) badge.classList.remove('d-none');
        } else {
          select.value = 'new';
          const badge = document.getElementById('plate-edit-status-badge');
          if (badge) badge.classList.add('d-none');
        }
      } catch (e) {
        // Fallback jika terjadi galat saat memuat sesi
        select.innerHTML = '<option value="new">+ Catat Sesi Baru (Kosong)</option>';
      }
    }

    // Memulai mode edit untuk sesi makan (akses catatan lama untuk ubah porsi / tambah makanan)
    async function startEditMeal(mealOrId) {
      let meal = mealOrId;
      if (typeof mealOrId === 'number' || typeof mealOrId === 'string') {
        try {
          const res = await apiCall(`/api/private/piring/${mealOrId}`);
          meal = res.data;
        } catch (e) {
          toast(`Gagal memuat detail sesi: ${e.message}`);
          return;
        }
      }

      if (!meal) return;

      editingMealId = meal.id;

      // Sinkronisasi nilai dropdown sesi
      const select = document.getElementById('plate-session-select');
      if (select) select.value = String(meal.id);

      const badge = document.getElementById('plate-edit-status-badge');
      if (badge) badge.classList.remove('d-none');

      // Isi form detail sesi makan
      const presets = ['Sarapan', 'Makan Siang', 'Makan Malam', 'Camilan'];
      if (presets.includes(meal.name)) {
        selectMealPreset(meal.name);
      } else {
        selectMealPreset('custom');
        const nameInput = document.getElementById('plate-meal-name');
        if (nameInput) nameInput.value = meal.name || '';
      }

      const dateInput = document.getElementById('plate-date-input');
      if (dateInput) dateInput.value = meal.meal_date || '';

      const timeInput = document.getElementById('plate-time-input');
      if (timeInput) timeInput.value = meal.meal_time || '';

      const noteInput = document.getElementById('plate-note-input');
      if (noteInput) noteInput.value = meal.note || '';

      // Masukkan item makanan yang sudah ada ke dalam draf piring
      draftItems = (meal.isi_piring || []).map(it => ({
        makanan: it.makanan,
        makanan_id: it.makanan_id,
        gram: it.gram
      }));

      const btnCancel = document.getElementById('btn-cancel-edit');
      if (btnCancel) btnCancel.classList.remove('d-none');

      const btnSubmit = document.getElementById('btn-submit-plate');
      if (btnSubmit) {
        btnSubmit.innerHTML = '<i class="bi bi-check-lg me-1"></i> Perbarui Catatan';
      }

      // Berpindah ke tab catat jika dipanggil dari Ringkasan atau Riwayat
      switchPage('catat');

      renderDraftItems();
      calcDraft();

      // Gulir ke atas secara halus
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Membatalkan mode edit dan kembali ke mode pencatatan baru
    function cancelEditMeal() {
      editingMealId = null;

      const select = document.getElementById('plate-session-select');
      if (select) select.value = 'new';

      const badge = document.getElementById('plate-edit-status-badge');
      if (badge) badge.classList.add('d-none');

      const btnCancel = document.getElementById('btn-cancel-edit');
      if (btnCancel) btnCancel.classList.add('d-none');

      const btnSubmit = document.getElementById('btn-submit-plate');
      if (btnSubmit) {
        btnSubmit.innerHTML = '<i class="bi bi-check-lg me-1"></i> Simpan Catatan';
      }

      resetPlateDraft();

      // Kembalikan form ke waktu dan tanggal saat ini
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');

      const dateInput = document.getElementById('plate-date-input');
      if (dateInput) dateInput.value = todayStr;

      const timeInput = document.getElementById('plate-time-input');
      if (timeInput) timeInput.value = `${hh}:${mm}`;

      const noteInput = document.getElementById('plate-note-input');
      if (noteInput) noteInput.value = '';

      selectMealPreset('Makan Siang');
      loadTodaySessionsForCatat(todayStr);
    }

    async function handlePlateSubmit(e) {
      e.preventDefault();
      if (!currentUser) return;
      if (draftItems.length === 0) {
        toast('Pilih minimal 1 makanan.');
        return;
      }

      const body = {
        name: document.getElementById('plate-meal-name').value.trim() || 'Makan Siang',
        meal_date: document.getElementById('plate-date-input').value,
        meal_time: document.getElementById('plate-time-input').value,
        note: document.getElementById('plate-note-input').value.trim() || null,
        isi_piring: draftItems.map(it => ({
          makanan_id: it.makanan_id,
          gram: it.gram,
          serving_unit: 'gram',
          serving_note: null
        }))
      };

      const btn = document.getElementById('btn-submit-plate');
      btn.disabled = true;
      const isEditing = Boolean(editingMealId);
      btn.textContent = isEditing ? 'Memperbarui...' : 'Menyimpan...';

      try {
        if (isEditing) {
          await apiCall(`/api/private/piring/${editingMealId}`, { method: 'PUT', body: JSON.stringify(body) });
          toast('Catatan sesi makan berhasil diperbarui.');
          cancelEditMeal();
        } else {
          await apiCall('/api/private/piring', { method: 'POST', body: JSON.stringify(body) });
          toast('Catatan berhasil disimpan.');
          cancelEditMeal();
        }
        switchPage('dashboard');
      } catch (err) {
        toast(`Gagal: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-check-lg me-1"></i> ${isEditing ? 'Perbarui Catatan' : 'Simpan Catatan'}`;
      }
    }

    // ==================== MODUL RIWAYAT MAKAN ====================

    function handleHistoryDatePick(d) {
      fetchHistoryByDate(d);
    }

    async function fetchHistoryByDate(d) {
      if (!d) {
        const filterEl = document.getElementById('filter-date');
        d = (filterEl && filterEl.value) ? filterEl.value : getTodayISO();
      }

      const dateInput = document.getElementById('filter-date');
      if (dateInput && dateInput.value !== d) dateInput.value = d;

      let formattedDate = d;
      try {
        const parts = d.split('-');
        if (parts.length === 3) {
          const parsedDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          formattedDate = new Intl.DateTimeFormat('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          }).format(parsedDate);
        }
      } catch (err) {
        formattedDate = d;
      }

      const dateTextEl = document.getElementById('history-selected-date-text');
      if (dateTextEl) dateTextEl.textContent = formattedDate;

      const cont = document.getElementById('riwayat-container');
      cont.innerHTML = '<div class="text-center py-3 text-secondary small">Memuat riwayat...</div>';

      try {
        const res = await apiCall(`/api/private/piring?date=${d}`);
        const meals = res.data || [];
        // Urutkan riwayat sesi makan secara kronologis biologis harian (Waktu & Sesi)
        sortMealsChronologically(meals);

        let dayTotalCal = 0, dayTotalP = 0, dayTotalC = 0, dayTotalF = 0;
        meals.forEach(m => {
          if (m.isi_piring && Array.isArray(m.isi_piring)) {
            m.isi_piring.forEach(it => {
              if (it.makanan) {
                const r = (Number(it.gram) || 0) / 100;
                dayTotalCal += (Number(it.makanan.calories) || 0) * r;
                dayTotalP += (Number(it.makanan.proteins) || 0) * r;
                dayTotalC += (Number(it.makanan.carbohydrate) || 0) * r;
                dayTotalF += (Number(it.makanan.fat) || 0) * r;
              }
            });
          }
        });

        const totalCalEl = document.getElementById('history-day-total-cal');
        if (totalCalEl) totalCalEl.textContent = fmt(dayTotalCal);

        const target = (currentUser && currentUser.target_kalori_harian) ? currentUser.target_kalori_harian : 2000;
        const targetRefEl = document.getElementById('history-target-ref');
        if (targetRefEl) targetRefEl.textContent = `Target: ${fmt(target)} kkal`;

        const calPct = target > 0 ? Math.round((dayTotalCal / target) * 100) : 0;
        const calPctEl = document.getElementById('history-day-cal-pct');
        if (calPctEl) calPctEl.textContent = `${calPct}%`;

        const progressBarEl = document.getElementById('history-day-progress-bar');
        if (progressBarEl) {
          progressBarEl.style.width = `${Math.min(100, calPct)}%`;
          progressBarEl.style.backgroundColor = calPct > 100 ? 'var(--danger)' : 'var(--olive)';
        }

        const protEl = document.getElementById('history-day-prot');
        if (protEl) protEl.textContent = fmtG(dayTotalP);
        const carbEl = document.getElementById('history-day-carb');
        if (carbEl) carbEl.textContent = fmtG(dayTotalC);
        const fatEl = document.getElementById('history-day-fat');
        if (fatEl) fatEl.textContent = fmtG(dayTotalF);

        const statusPill = document.getElementById('history-day-status-pill');
        if (statusPill) {
          statusPill.className = 'fw-bold text-dark fs-6';
          const diff = Math.round(target - dayTotalCal);
          if (dayTotalCal === 0) {
            statusPill.textContent = `Defisit ${fmt(target)} kkal`;
          } else if (Math.abs(diff) <= 150) {
            statusPill.textContent = 'Sesuai Target';
          } else if (diff > 150) {
            statusPill.textContent = `Defisit ${fmt(diff)} kkal`;
          } else {
            statusPill.textContent = `Surplus ${fmt(Math.abs(diff))} kkal`;
          }
        }

        const countBadge = document.getElementById('history-meal-count-badge');
        if (countBadge) countBadge.textContent = `${meals.length} Sesi`;

        if (meals.length === 0) {
          cont.innerHTML = `
            <div class="text-center py-5 border rounded text-secondary" style="background: #FAFBF8; border-color: var(--border) !important;">
              <div class="mb-2"><i class="bi bi-journal-x text-muted" style="font-size: 32px;"></i></div>
              <div class="fw-semibold text-dark mb-1">Belum Ada Catatan Sesi Makan</div>
              <div class="small text-secondary mb-3">Tidak ada makanan yang dicatat pada ${formattedDate}.</div>
              <button type="button" class="btn btn-olive btn-sm px-3 py-1.5" onclick="switchPage('catat')">
                <i class="bi bi-plus-lg me-1"></i> Mulai Catat Piring
              </button>
            </div>
          `;
          return;
        }

        let html = '<div class="session-cards-list">';
        meals.forEach(m => {
          let sCal = 0, sP = 0, sC = 0, sF = 0;
          let foodChipsHtml = '';
          if (m.isi_piring && m.isi_piring.length > 0) {
            foodChipsHtml = m.isi_piring.map(it => {
              if (!it.makanan) return '';
              const r = (Number(it.gram) || 0) / 100;
              sCal += (Number(it.makanan.calories) || 0) * r;
              sP += (Number(it.makanan.proteins) || 0) * r;
              sC += (Number(it.makanan.carbohydrate) || 0) * r;
              sF += (Number(it.makanan.fat) || 0) * r;
              return `<span class="session-food-chip"><span class="food-chip-name">${it.makanan.name}</span><span class="food-chip-gram">${it.gram}g</span></span>`;
            }).join('');
          } else {
            foodChipsHtml = '<span class="text-secondary small fst-italic">Belum ada makanan terdaftar</span>';
          }

          let pillClass = 'session-pill-kustom';
          if (m.name === 'Sarapan') pillClass = 'session-pill-sarapan';
          else if (m.name === 'Makan Siang') pillClass = 'session-pill-siang';
          else if (m.name === 'Makan Malam') pillClass = 'session-pill-malam';
          else if (m.name === 'Camilan') pillClass = 'session-pill-camilan';

          html += `
            <div class="history-session-card">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="session-header-left">
                  <span class="session-type-pill ${pillClass}">${m.name}</span>
                  <span class="session-time-pill"><i class="bi bi-clock me-1 text-muted" style="font-size: 11px;"></i>${m.meal_time}</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <div class="text-end">
                    <strong class="text-dark fs-6">${fmt(sCal)}</strong>
                    <small class="text-secondary fw-normal ms-0.5" style="font-size: 11px;">kkal</small>
                  </div>
                  <div class="session-actions-group">
                    <button type="button" class="btn btn-sm btn-subtle btn-edit-circle" onclick="startEditMeal(${m.id})" title="Edit & tambah makanan di sesi ini">
                      <i class="bi bi-pencil" style="font-size: 13px;"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-subtle text-danger btn-trash-circle" onclick="deleteHistoryMeal(${m.id})" title="Hapus sesi ini">
                      <i class="bi bi-trash3" style="font-size: 13px;"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div class="session-food-chips">
                ${foodChipsHtml}
              </div>

              <div class="d-flex align-items-center pt-2 border-top" style="border-color: #F0F2EC !important;">
                <div class="session-macro-pills d-flex align-items-center flex-wrap gap-2 w-100">
                  <span class="session-macro-tag">
                    <span class="macro-dot macro-dot-prot me-1" style="background-color: #55734B !important;"></span>Protein: <strong class="text-dark">${fmtG(sP)}g</strong>
                  </span>
                  <span class="text-muted d-none d-sm-inline" style="font-size: 10px;">•</span>
                  <span class="session-macro-tag">
                    <span class="macro-dot macro-dot-carb me-1" style="background-color: #E7A93B !important;"></span>Karbo: <strong class="text-dark">${fmtG(sC)}g</strong>
                  </span>
                  <span class="text-muted d-none d-sm-inline" style="font-size: 10px;">•</span>
                  <span class="session-macro-tag">
                    <span class="macro-dot macro-dot-fat me-1" style="background-color: #A84135 !important;"></span>Lemak: <strong class="text-dark">${fmtG(sF)}g</strong>
                  </span>
                </div>
              </div>
            </div>
          `;
        });
        html += '</div>';
        cont.innerHTML = html;
      } catch (e) {
        cont.innerHTML = `<div class="text-danger small">${e.message}</div>`;
      }
    }

    async function deleteHistoryMeal(id) {
      if (!confirm('Hapus sesi makan ini?')) return;
      try {
        await apiCall(`/api/private/piring/${id}`, { method: 'DELETE' });
        toast('Sesi dihapus.');
        fetchHistoryByDate(document.getElementById('filter-date').value);
      } catch (e) {
        toast(e.message);
      }
    }

    // ==================== MODUL PROFIL PENGGUNA ====================

    function renderProfile() {
      if (!currentUser) return;

      const nama = currentUser.nama_lengkap || currentUser.username || 'User';
      document.getElementById('prof-nama').textContent = nama;
      document.getElementById('prof-user').textContent = `@${currentUser.username || 'user'}`;
      document.getElementById('prof-email').textContent = currentUser.email || '-';

      const avatarEl = document.getElementById('prof-avatar');
      if (avatarEl) {
        const parts = nama.trim().split(' ');
        let initials = parts[0] ? parts[0][0].toUpperCase() : 'U';
        if (parts.length > 1 && parts[1]) initials += parts[1][0].toUpperCase();
        avatarEl.textContent = initials;
      }

      document.getElementById('prof-gender').textContent = currentUser.gender === 'L' ? 'Laki-laki' : 'Perempuan';
      document.getElementById('prof-usia').textContent = currentUser.usia || '-';
      document.getElementById('prof-bb').textContent = currentUser.berat_badan || '-';
      document.getElementById('prof-tb').textContent = currentUser.tinggi_badan || '-';
      document.getElementById('prof-bmr').textContent = fmt(currentUser.bmr);
      document.getElementById('prof-akt').textContent = currentUser.tingkat_aktivitas || '-';
      document.getElementById('prof-target').textContent = fmt(currentUser.target_kalori_harian);

      // Hitung BMI
      const bb = parseFloat(currentUser.berat_badan);
      const tb = parseFloat(currentUser.tinggi_badan);
      const bmiValEl = document.getElementById('prof-bmi-val');
      const bmiBadgeEl = document.getElementById('prof-bmi-badge');

      if (bb > 0 && tb > 0 && bmiValEl && bmiBadgeEl) {
        const tbMeter = tb / 100;
        const bmi = bb / (tbMeter * tbMeter);
        const bmiFixed = bmi.toFixed(1);
        bmiValEl.innerHTML = `${bmiFixed} <small class="fs-6 fw-normal text-secondary">kg/m²</small>`;

        if (bmi < 18.5) {
          bmiBadgeEl.className = 'badge text-bg-light border text-dark fw-semibold';
          bmiBadgeEl.textContent = 'Kekurangan Berat';
        } else if (bmi <= 24.9) {
          bmiBadgeEl.className = 'badge text-bg-light border text-dark fw-semibold';
          bmiBadgeEl.textContent = 'Ideal / Normal';
        } else if (bmi <= 29.9) {
          bmiBadgeEl.className = 'badge text-bg-light border text-dark fw-semibold';
          bmiBadgeEl.textContent = 'Kelebihan Berat';
        } else {
          bmiBadgeEl.className = 'badge text-bg-light border text-dark fw-semibold';
          bmiBadgeEl.textContent = 'Obesitas';
        }
      }

      // Rekomendasi Kandungan Gizi Seimbang Harian
      const targetCal = currentUser.target_kalori_harian || 2000;
      const recProt = Math.round((targetCal * 0.20) / 4);
      const recCarb = Math.round((targetCal * 0.50) / 4);
      const recFat = Math.round((targetCal * 0.30) / 9);

      const mProtEl = document.getElementById('prof-macro-prot');
      if (mProtEl) mProtEl.textContent = `${recProt} g`;
      const mCarbEl = document.getElementById('prof-macro-carb');
      if (mCarbEl) mCarbEl.textContent = `${recCarb} g`;
      const mFatEl = document.getElementById('prof-macro-fat');
      if (mFatEl) mFatEl.textContent = `${recFat} g`;

      // Persentase Alokasi Pengeluaran Energi Tubuh (BMR vs Aktivitas)
      const bmrVal = currentUser.bmr || 0;
      let bmrPct = targetCal > 0 ? Math.round((bmrVal / targetCal) * 100) : 70;
      if (bmrPct > 90) bmrPct = 85;
      if (bmrPct < 40) bmrPct = 60;
      const aktPct = 100 - bmrPct;

      const bmrPctEl = document.getElementById('prof-bmr-pct');
      if (bmrPctEl) bmrPctEl.textContent = `${bmrPct}%`;
      const aktPctEl = document.getElementById('prof-akt-pct');
      if (aktPctEl) aktPctEl.textContent = `${aktPct}%`;

      const bmrBarEl = document.getElementById('prof-bar-bmr');
      if (bmrBarEl) bmrBarEl.style.width = `${bmrPct}%`;
      const aktBarEl = document.getElementById('prof-bar-akt');
      if (aktBarEl) aktBarEl.style.width = `${aktPct}%`;
    }

    // ==================== FITUR BARU: MINI PROGRESS RING, ONBOARDING, & PORSI TANGAN ====================

    // 1. Mini Progress Ring Kalori Header dengan Warna Dinamis
    function updateTopProgressRing(consumed, target) {
      const ring = document.getElementById('top-user-progress-ring');
      if (!ring) return;
      target = target || 2000;
      const ratio = Math.min((consumed || 0) / target, 1.0);
      const circumference = 87.96; // 2 * PI * 14
      const offset = circumference - (ratio * circumference);
      ring.style.strokeDashoffset = offset;

      const pct = target > 0 ? (consumed / target) * 100 : 0;
      if (pct > 100) {
        ring.setAttribute('stroke', '#A84135'); // Terracotta jika kalori melebihi batas
      } else if (pct >= 85) {
        ring.setAttribute('stroke', '#E7A93B'); // Amber jika mendekati batas target
      } else {
        ring.setAttribute('stroke', '#55734B'); // Olive jika dalam batas aman
      }
    }

    // 2. Evaluasi Tampilan Banner Onboarding Pengguna Baru
    function checkOnboardingVisibility(mealsCount) {
      const onboardingCard = document.getElementById('dash-onboarding-card');
      if (!onboardingCard) return;

      const isDismissed = localStorage.getItem('porsi_onboarding_dismissed');
      if (isDismissed === 'true') {
        onboardingCard.classList.add('d-none');
        return;
      }

      // Tampilkan jika belum pernah ada sesi tercatat atau belum menghitung target kalori
      const isNewUser = (!currentUser || !currentUser.target_kalori_harian || currentUser.target_kalori_harian <= 0 || mealsCount === 0);
      if (isNewUser) {
        onboardingCard.classList.remove('d-none');
      } else {
        onboardingCard.classList.add('d-none');
      }
    }

    function dismissOnboarding() {
      localStorage.setItem('porsi_onboarding_dismissed', 'true');
      const onboardingCard = document.getElementById('dash-onboarding-card');
      if (onboardingCard) onboardingCard.classList.add('d-none');
    }

    // ==================== FITUR PENGINGAT KALORI ETHEREAL EMAIL ====================
    let modalReminderSuccess;

    async function triggerCalorieReminder() {
      if (!currentUser) {
        toast('Silakan masuk akun terlebih dahulu.');
        return;
      }

      const btn = document.getElementById('btn-trigger-reminder');
      const originalHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" style="width: 12px; height: 12px;"></span> Memeriksa...';
      }

      try {
        const res = await apiCall('/api/private/reminder/send', { method: 'POST' });
        if (res.status === 'achieved') {
          toast(res.message || 'Target kalori hari ini sudah terpenuhi!');
        } else if (res.status === 'sent') {
          const data = res.data || {};
          showReminderSuccessModal(data);
        } else {
          toast(res.message || 'Pemeriksaan pengingat kalori selesai.');
        }
      } catch (err) {
        toast('Gagal mengirim pengingat: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      }
    }

    function showReminderSuccessModal(data) {
      const to = data.to || (currentUser ? currentUser.email : '-');
      const deficit = data.deficit || 0;
      const senderUser = data.sender_user || 'Ethereal Mailer';
      const senderPass = data.sender_pass || '-';
      const previewUrl = data.preview_url || 'https://ethereal.email/messages';

      const descEl = document.getElementById('reminder-modal-desc');
      if (descEl) {
        descEl.innerHTML = `Notifikasi pengingat defisit kalori (<strong>${fmt(deficit)} kkal</strong>) telah dikirimkan ke email pendaftaranmu: <strong>${to}</strong>.`;
      }

      const infoEl = document.getElementById('reminder-modal-info');
      if (infoEl) {
        infoEl.innerHTML = `
          <div class="mb-1 text-secondary"><strong>Layanan:</strong> Ethereal Email (Auto-Generated SMTP)</div>
          <div class="mb-1 text-secondary"><strong>Email Tujuan:</strong> <span class="text-dark fw-medium">${to}</span></div>
          <div class="mb-1 text-secondary"><strong>Akun Pengirim Ethereal:</strong> <code>${senderUser}</code></div>
          <div class="text-secondary"><strong>Kata Sandi Ethereal:</strong> <code>${senderPass}</code></div>
        `;
      }

      const linkEl = document.getElementById('reminder-preview-link');
      if (linkEl) {
        linkEl.href = previewUrl;
      }

      if (modalReminderSuccess) {
        modalReminderSuccess.show();
      } else {
        toast(`Pengingat kalori terkirim ke ${to}!`);
      }
    }
