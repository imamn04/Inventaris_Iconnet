// ========================================
// GLOBAL API FETCH INTERCEPTOR (AUTHENTICATION & RECOVERY)
// ========================================
(function () {
    const originalFetch = window.fetch;
    window.fetch = async function (url, options = {}) {
        options = options || {};
        const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');

        // Sisipkan Authorization Bearer Token untuk seluruh pemanggilan REST API lokal
        if (urlStr.startsWith('/api/') && !urlStr.includes('/api/login')) {
            const token = sessionStorage.getItem('authToken');
            if (token) {
                options.headers = options.headers || {};
                if (options.headers instanceof Headers) {
                    if (!options.headers.has('Authorization')) {
                        options.headers.set('Authorization', `Bearer ${token}`);
                    }
                } else if (Array.isArray(options.headers)) {
                    options.headers.push(['Authorization', `Bearer ${token}`]);
                } else {
                    if (!options.headers['Authorization']) {
                        options.headers['Authorization'] = `Bearer ${token}`;
                    }
                }
            }
        }

        const response = await originalFetch(url, options);

        // Auto-redirect jika token kedaluwarsa atau akses tidak sah (401)
        if (response.status === 401 && urlStr.startsWith('/api/') && !urlStr.includes('/api/login')) {
            console.warn('[Security] Sesi login tidak valid atau kedaluwarsa (401). Mengarahkan ke login...');
            sessionStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('user');
            sessionStorage.removeItem('authToken');
            if (!window.location.pathname.endsWith('login.html')) {
                window.location.href = 'login.html';
            }
        }

        return response;
    };
})();

// ========================================
// GLOBAL VARIABLES
// ========================================
let inventoryData = [];
let deleteItemId = null;
let selectedItems = new Set();
let selectedHistoryItems = new Set();
let selectedPaletteItems = new Set();
let signaturePad, inventoryDistChart, conditionChart;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is logged in & has valid auth token
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const authToken = sessionStorage.getItem('authToken');
    if (!isLoggedIn || !authToken) {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('authToken');
        window.location.href = 'login.html';
        return;
    }

    // Load user info
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (user) {
        document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
        document.getElementById('userName').textContent = user.name;
    }

    // Setup event listeners immediately so sidebar menus and buttons are responsive
    try {
        setupEventListeners();
        initGlobalEventListeners();
    } catch (e) {
        console.error('Error setting up event listeners:', e);
    }

    // Determine initial page from URL hash or sessionStorage and navigate to it
    const initialPage = getInitialPage();
    navigateTo(initialPage, false);

    // Listen for browser navigation (back/forward)
    window.addEventListener('popstate', function (e) {
        const page = (e.state && e.state.page) || getInitialPage();
        navigateTo(page, false);
    });

    // Listen for hashchange
    window.addEventListener('hashchange', function () {
        const pageFromHash = window.location.hash.replace(/^#\/?/, '').trim();
        if (pageFromHash) {
            navigateTo(pageFromHash, false);
        }
    });

    // Load data
    loadCategories();
    loadCubiclePositions().finally(() => {
        loadInventory();
    });

    // Premium Upgrade: only init theme & charts at startup
    // Signature pad is initialized lazily when navigating to the page
    setTimeout(() => {
        if (typeof initTheme === 'function') initTheme();
        if (typeof initCharts === 'function') initCharts();
    }, 300);
});

// ========================================
// CHECKBOX EVENT LISTENERS - Re-attach after table render
// ========================================
function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach((checkbox, idx) => {
        // Get ID from the parent row's data-id attribute
        const row = checkbox.closest('tr');
        const id = row ? row.getAttribute('data-id') : idx;

        // Restore checked state from selectedItems
        if (id && selectedItems.has(id)) {
            checkbox.checked = true;
        } else if (id) {
            checkbox.checked = false;
        }

        // Remove old onchange handler and add new one
        checkbox.onchange = function () {
            const rowId = this.closest('tr').getAttribute('data-id');
            if (this.checked) {
                selectedItems.add(rowId);
            } else {
                selectedItems.delete(rowId);
            }
            updateSelectedCount();
            updateActionButtons();
        };
    });
}

// ========================================
// HELPER FUNCTIONS FOR BADGE CLASSES
// ========================================
function getStatusBadgeClass(status) {
    if (!status) return 'none';
    const s = status.toString().toLowerCase().trim();
    if (s === 'baik' || s === 'yes' || s === 'ya') return 'Baik';
    if (s === 'rusak ringan' || s === 'warning') return 'Rusak_Ringan';
    if (s === 'rusak berat' || s === 'danger') return 'Rusak_Berat';
    return s.replace(/\s+/g, '_');
}

const CATEGORY_COLOR_PALETTES = [
    { name: 'blue', light: { bg: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', border: 'rgba(37, 99, 235, 0.25)' }, dark: { bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' } },
    { name: 'emerald', light: { bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: 'rgba(16, 185, 129, 0.25)' }, dark: { bg: 'rgba(52, 211, 153, 0.18)', color: '#34d399', border: 'rgba(52, 211, 153, 0.3)' } },
    { name: 'purple', light: { bg: 'rgba(139, 92, 246, 0.12)', color: '#7c3aed', border: 'rgba(139, 92, 246, 0.25)' }, dark: { bg: 'rgba(167, 139, 250, 0.18)', color: '#c4b5fd', border: 'rgba(196, 181, 253, 0.3)' } },
    { name: 'cyan', light: { bg: 'rgba(6, 182, 212, 0.12)', color: '#0891b2', border: 'rgba(6, 182, 212, 0.25)' }, dark: { bg: 'rgba(34, 211, 238, 0.18)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' } },
    { name: 'pink', light: { bg: 'rgba(236, 72, 153, 0.12)', color: '#db2777', border: 'rgba(236, 72, 153, 0.25)' }, dark: { bg: 'rgba(244, 114, 182, 0.18)', color: '#f472b6', border: 'rgba(244, 114, 182, 0.3)' } },
    { name: 'amber', light: { bg: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: 'rgba(245, 158, 11, 0.25)' }, dark: { bg: 'rgba(251, 191, 36, 0.18)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' } },
    { name: 'indigo', light: { bg: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', border: 'rgba(99, 102, 241, 0.25)' }, dark: { bg: 'rgba(129, 140, 248, 0.18)', color: '#a5b4fc', border: 'rgba(165, 180, 252, 0.3)' } },
    { name: 'teal', light: { bg: 'rgba(20, 184, 166, 0.12)', color: '#0d9488', border: 'rgba(20, 184, 166, 0.25)' }, dark: { bg: 'rgba(45, 212, 191, 0.18)', color: '#2dd4bf', border: 'rgba(45, 212, 191, 0.3)' } },
    { name: 'sky', light: { bg: 'rgba(14, 165, 233, 0.12)', color: '#0284c7', border: 'rgba(14, 165, 233, 0.25)' }, dark: { bg: 'rgba(56, 189, 248, 0.18)', color: '#7dd3fc', border: 'rgba(125, 211, 252, 0.3)' } },
    { name: 'coral', light: { bg: 'rgba(249, 115, 22, 0.12)', color: '#ea580c', border: 'rgba(249, 115, 22, 0.25)' }, dark: { bg: 'rgba(251, 146, 60, 0.18)', color: '#fb923c', border: 'rgba(251, 146, 60, 0.3)' } },
    { name: 'fuchsia', light: { bg: 'rgba(217, 70, 239, 0.12)', color: '#c026d3', border: 'rgba(217, 70, 239, 0.25)' }, dark: { bg: 'rgba(232, 121, 249, 0.18)', color: '#e879f9', border: 'rgba(232, 121, 249, 0.3)' } },
    { name: 'lime', light: { bg: 'rgba(132, 204, 22, 0.12)', color: '#65a30d', border: 'rgba(132, 204, 22, 0.25)' }, dark: { bg: 'rgba(163, 230, 53, 0.18)', color: '#bef264', border: 'rgba(190, 242, 100, 0.3)' } }
];

function getCategoryBadgeStyle(categoryName) {
    if (!categoryName) return null;
    const cat = categoryName.toString().trim().toLowerCase();

    if (cat.includes('laptop')) return CATEGORY_COLOR_PALETTES[0]; // blue
    if (cat.includes('monitor')) return CATEGORY_COLOR_PALETTES[1]; // emerald
    if (cat.includes('keyboard')) return CATEGORY_COLOR_PALETTES[2]; // purple
    if (cat.includes('mouse')) return CATEGORY_COLOR_PALETTES[3]; // cyan
    if (cat.includes('headset')) return CATEGORY_COLOR_PALETTES[4]; // pink
    if (cat.includes('tv') || cat.includes('televisi')) return CATEGORY_COLOR_PALETTES[5]; // amber
    if (cat.includes('pc') || cat.includes('komputer')) return CATEGORY_COLOR_PALETTES[6]; // indigo
    if (cat.includes('printer') || cat.includes('scanner')) return CATEGORY_COLOR_PALETTES[7]; // teal
    if (cat.includes('ac') || cat.includes('cooler')) return CATEGORY_COLOR_PALETTES[8]; // sky
    if (cat.includes('switch') || cat.includes('router') || cat.includes('hub')) return CATEGORY_COLOR_PALETTES[9]; // coral
    if (cat.includes('server') || cat.includes('storage')) return CATEGORY_COLOR_PALETTES[10]; // fuchsia
    if (cat.includes('ups') || cat.includes('genset') || cat.includes('kabel')) return CATEGORY_COLOR_PALETTES[11]; // lime

    // Deterministic string hash for unknown/custom new categories
    let hash = 0;
    for (let i = 0; i < cat.length; i++) {
        hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % CATEGORY_COLOR_PALETTES.length;
    return CATEGORY_COLOR_PALETTES[index];
}

function getCategoryBadgeClass(category) {
    if (!category) return 'none';
    return category.toString().toLowerCase().replace(/[^a-z0-9]/g, '-').trim();
}

function getCategoryBadgeHtml(categoryName, extraClass = '') {
    const rawName = categoryName || '-';
    if (!categoryName) {
        return `<span class="category-badge none ${extraClass}">-</span>`;
    }
    const cleanClass = getCategoryBadgeClass(categoryName);
    const styleObj = getCategoryBadgeStyle(categoryName);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme');
    const themeStyle = styleObj ? (isDark ? styleObj.dark : styleObj.light) : null;
    const inlineStyle = themeStyle ? `style="background: ${themeStyle.bg}; color: ${themeStyle.color}; border: 1px solid ${themeStyle.border};"` : '';

    return `<span class="category-badge ${cleanClass} ${extraClass}" ${inlineStyle}>${rawName}</span>`;
}
window.getCategoryBadgeStyle = getCategoryBadgeStyle;
window.getCategoryBadgeClass = getCategoryBadgeClass;
window.getCategoryBadgeHtml = getCategoryBadgeHtml;

// ========================================
// ACTION BUTTON EVENT LISTENERS (Event Delegation)
// ========================================
function attachActionButtonListeners(containerId = 'inventoryTableBody') {
    // Use event delegation on the table body for better reliability
    const tableBody = document.getElementById(containerId);
    if (!tableBody) return;

    // Remove old delegation if exists
    tableBody.onclick = null;

    // Add new delegation
    tableBody.onclick = function (e) {
        try {
            const btn = e.target.closest('.action-btn');
            if (!btn) return;

            const row = btn.closest('tr');
            const id = row ? row.getAttribute('data-id') : null;
            if (!id) {
                console.warn('[ACTION] Clicked button but no ID found in row');
                return;
            }

            // Prevent default and stop propagation
            e.preventDefault();
            e.stopPropagation();

            console.log('[ACTION] Triggered:', btn.classList[1], 'for ID:', id);

            // Call appropriate function based on button class
            if (btn.classList.contains('view')) {
                viewItem(id);
            } else if (btn.classList.contains('edit')) {
                editItem(id);
            } else if (btn.classList.contains('print')) {
                printProfessionalLabel(id);
            } else if (btn.classList.contains('delete')) {
                deleteItem(id);
            }
        } catch (err) {
            console.error('[ACTION] Error handling click:', err);
        }
    };
}

// ========================================
// MODAL HELPERS
// ========================================
// Robust Modal State Management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

// Close modals when clicking outside
window.addEventListener('click', function (event) {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target.id);
    }
});

// ========================================
// PERSISTENT EVENT DELEGATION
// ========================================
function initGlobalEventListeners() {
    // Dashboard Map Delegation - NEVER REMOVED
    const dashboardMap = document.getElementById('dashboardMiniMap');
    if (dashboardMap) {
        dashboardMap.onclick = function (e) {
            const cubicle = e.target.closest('.cubicle-view');
            if (cubicle) {
                const id = cubicle.getAttribute('data-id');
                console.log('[DELEGATION] Cubicle clicked:', id);
                if (id) handleCubicleClick(id);
            }
        };
    }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Menu navigation
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function (e) {
            // Check if this is a submenu item
            if (this.classList.contains('submenu-item')) {
                const page = this.getAttribute('data-page');
                navigateTo(page);

                // Close sidebar on mobile
                if (window.innerWidth < 1024) {
                    document.getElementById('sidebar').classList.remove('active');
                    document.getElementById('sidebarOverlay').classList.remove('show');
                }
                return;
            }

            // Check if this item has submenu
            if (this.classList.contains('has-submenu')) {
                this.classList.toggle('open');
                const nextSibling = this.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('submenu')) {
                    nextSibling.classList.toggle('open');
                }
                return;
            }

            // Normal menu item - navigate
            const page = this.getAttribute('data-page');
            navigateTo(page);

            // Close sidebar on mobile
            if (window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.remove('active');
                document.getElementById('sidebarOverlay').classList.remove('show');
            }
        });
    });

    // Mobile sidebar toggle
    document.getElementById('hamburger').addEventListener('click', function () {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('show');
    });

    // Mobile Bottom Navigation Bar buttons
    document.querySelectorAll('.mobile-nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const targetPage = this.getAttribute('data-page');
            if (targetPage) {
                navigateTo(targetPage);
                if (navigator.vibrate) navigator.vibrate(20);
            }
        });
    });

    const mobileMoreBtn = document.getElementById('mobileMoreBtn');
    if (mobileMoreBtn) {
        mobileMoreBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('show');
            if (navigator.vibrate) navigator.vibrate(20);
        });
    }

    document.getElementById('sidebarOverlay').addEventListener('click', function () {
        document.getElementById('sidebar').classList.remove('active');
        this.classList.remove('show');
    });

    // Search - don't clear selected items, just re-render with checkbox listeners
    document.getElementById('searchInput').addEventListener('input', function () {
        selectedItems.clear();
        updateSelectedCount();
        updateInventoryTable();
    });

    // Filter dropdown - don't clear selected items, just re-render with checkbox listeners
    document.getElementById('exportFilter').addEventListener('change', function () {
        selectedItems.clear();
        updateSelectedCount();
        updateInventoryTable();
    });

    // View limit dropdown - don't clear selected items
    document.getElementById('viewLimit').addEventListener('change', function () {
        selectedItems.clear();
        updateSelectedCount();
        updateInventoryTable();
    });

    // Export buttons
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('exportPdf').addEventListener('click', exportToPdf);

    // Import button
    const importExcelBtn = document.getElementById('importExcelBtn');
    const importFileInput = document.getElementById('importFileInput');
    if (importExcelBtn && importFileInput) {
        importExcelBtn.addEventListener('click', function () {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', handleImportFile);
    }

    // Delete selected button
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedItems);
    }

    // Generate QR button
    const generateQrBtn = document.getElementById('generateQrBtn');
    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', function () {
            generateQRForSelected();
        });
    }

    // History page event listeners
    const historySearchInput = document.getElementById('historySearchInput');
    if (historySearchInput) {
        historySearchInput.addEventListener('input', function () {
            selectedHistoryItems.clear();
            updateHistorySelectedCount();
            renderHistoryTable();
        });
    }
    const historyActionFilter = document.getElementById('historyActionFilter');
    if (historyActionFilter) {
        historyActionFilter.addEventListener('change', function () {
            selectedHistoryItems.clear();
            updateHistorySelectedCount();
            renderHistoryTable();
        });
    }
    const historyItemFilter = document.getElementById('historyItemFilter');
    if (historyItemFilter) {
        historyItemFilter.addEventListener('change', function () {
            selectedHistoryItems.clear();
            updateHistorySelectedCount();
            renderHistoryTable();
        });
    }
    const exportHistoryExcelBtn = document.getElementById('exportHistoryExcelBtn');
    if (exportHistoryExcelBtn) {
        exportHistoryExcelBtn.addEventListener('click', exportHistoryToExcel);
    }
    const exportHistoryPdfBtn = document.getElementById('exportHistoryPdfBtn');
    if (exportHistoryPdfBtn) {
        exportHistoryPdfBtn.addEventListener('click', exportHistoryToPdf);
    }

    // Delete selected history button
    const deleteHistorySelectedBtn = document.getElementById('deleteHistorySelectedBtn');
    if (deleteHistorySelectedBtn) {
        deleteHistorySelectedBtn.addEventListener('click', deleteSelectedHistory);
    }

    // Initialize sortable columns
    initSortableColumns();

    // Inventory form
    document.getElementById('inventoryForm').addEventListener('submit', handleInventorySubmit);

    // Handover form
    const handoverFormEl = document.getElementById('handoverForm');
    if (handoverFormEl) {
        handoverFormEl.addEventListener('submit', submitHandover);
    }

    // Handover dynamic item selectors (reliable JS event listeners)
    const handoverKatEl = document.getElementById('handoverKategori');
    if (handoverKatEl) {
        handoverKatEl.addEventListener('change', loadItemsByCategory);
    }
    const handoverItemEl = document.getElementById('handoverItem');
    if (handoverItemEl) {
        handoverItemEl.addEventListener('change', loadHandoverItemDetails);
    }
    const handoverJenisEl = document.getElementById('handoverJenis');
    if (handoverJenisEl) {
        handoverJenisEl.addEventListener('change', toggleHandoverFields);
    }

    // Print QR button
    document.getElementById('printQrBtn').addEventListener('click', printQRCode);

    // Set today's date
    document.getElementById('itemDate').valueAsDate = new Date();
    document.getElementById('handoverTanggal').valueAsDate = new Date();
    if (typeof renderBASTChecklistChips === 'function') renderBASTChecklistChips();

    // Handover search and filter listeners
    const handoverSearchInput = document.getElementById('handoverSearchInput');
    if (handoverSearchInput) {
        handoverSearchInput.addEventListener('input', updateHandoverTable);
    }
    const handoverJenisFilter = document.getElementById('handoverJenisFilter');
    if (handoverJenisFilter) {
        handoverJenisFilter.addEventListener('change', updateHandoverTable);
    }

    // Handover export buttons
    const exportHandoverExcel = document.getElementById('exportHandoverExcel');
    if (exportHandoverExcel) {
        exportHandoverExcel.addEventListener('click', exportHandoverToExcel);
    }
    const exportHandoverPdf = document.getElementById('exportHandoverPdf');
    if (exportHandoverPdf) {
        exportHandoverPdf.addEventListener('click', exportHandoverToPdf);
    }

    // Handover delete selected button
    const deleteHandoverSelectedBtn = document.getElementById('deleteHandoverSelectedBtn');
    if (deleteHandoverSelectedBtn) {
        deleteHandoverSelectedBtn.addEventListener('click', deleteSelectedHandover);
    }

    // Show/hide SN Converter based on item name
    document.getElementById('itemName').addEventListener('change', function () {
        const snConverterRow = document.getElementById('snConverterRow');
        if (this.value === 'Headset') {
            snConverterRow.style.display = 'flex';
        } else {
            snConverterRow.style.display = 'none';
            document.getElementById('itemSnConverter').value = '';
        }
    });

    // Show/hide SN Converter in Edit Modal
    const editItemNameElem = document.getElementById('editItemName');
    if (editItemNameElem) {
        editItemNameElem.addEventListener('change', function () {
            const snConvRow = document.getElementById('editSnConverterRow');
            if (snConvRow) {
                if (this.value === 'Headset') {
                    snConvRow.style.display = 'flex';
                } else {
                    snConvRow.style.display = 'none';
                    const editSnConvInput = document.getElementById('editSnConverter');
                    if (editSnConvInput) editSnConvInput.value = '';
                }
            }
        });
    }

    // Close modal when clicking outside
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function (e) {
            if (e.target === this) {
                this.classList.remove('show');
            }
        });
    });
}

// ========================================
// AUTHENTICATION
// ========================================
function logout() {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('activePage');
    sessionStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

// ========================================
// NAVIGATION
// ========================================
// ========================================
// DASHBOARD FUNCTIONS (SMART DYNAMIC CATEGORY MONITORING)
// ========================================
function getDashboardCategoryStyle(catName) {
    const low = (catName || '').toLowerCase().trim();
    if (low.includes('monitor') || low.includes('layar')) {
        return { icon: 'fa-desktop', cssClass: 'monitor', gradient: 'linear-gradient(135deg, #10b981, #34d399)' };
    }
    if (low.includes('keyboard')) {
        return { icon: 'fa-keyboard', cssClass: 'keyboard', gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)' };
    }
    if (low.includes('mouse')) {
        return { icon: 'fa-mouse', cssClass: 'mouse', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' };
    }
    if (low.includes('headset') || low.includes('headphone')) {
        return { icon: 'fa-headset', cssClass: 'headset', gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)' };
    }
    if (low.includes('laptop')) {
        return { icon: 'fa-laptop', cssClass: 'laptop', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' };
    }
    if (low.includes('pc') || low.includes('cpu') || low.includes('komputer')) {
        return { icon: 'fa-server', cssClass: 'pc', gradient: 'linear-gradient(135deg, #334155, #475569)' };
    }
    if (low.includes('tv') || low.includes('televisi')) {
        return { icon: 'fa-tv', cssClass: 'tv', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' };
    }
    // SMART MATCHING UNTUK KATEGORI FASILITAS / HARDWARE BARU:
    if (low.includes('ac') || low.includes('air conditioner') || low.includes('pendingin')) {
        return { icon: 'fa-snowflake', cssClass: 'ac', gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)' };
    }
    if (low.includes('print') || low.includes('scanner')) {
        return { icon: 'fa-print', cssClass: 'printer', gradient: 'linear-gradient(135deg, #059669, #34d399)' };
    }
    if (low.includes('router') || low.includes('switch') || low.includes('network') || low.includes('hub') || low.includes('mikrotik')) {
        return { icon: 'fa-network-wired', cssClass: 'network', gradient: 'linear-gradient(135deg, #d97706, #f59e0b)' };
    }
    if (low.includes('cctv') || low.includes('kamera') || low.includes('cam')) {
        return { icon: 'fa-video', cssClass: 'cctv', gradient: 'linear-gradient(135deg, #e11d48, #fb7185)' };
    }
    if (low.includes('proyektor') || low.includes('projector')) {
        return { icon: 'fa-film', cssClass: 'projector', gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)' };
    }
    if (low.includes('server')) {
        return { icon: 'fa-database', cssClass: 'server', gradient: 'linear-gradient(135deg, #1e293b, #3b82f6)' };
    }
    if (low.includes('ups') || low.includes('genset') || low.includes('listrik') || low.includes('power')) {
        return { icon: 'fa-bolt', cssClass: 'power', gradient: 'linear-gradient(135deg, #ca8a04, #eab308)' };
    }
    if (low.includes('meja') || low.includes('kursi') || low.includes('lemari') || low.includes('furniture')) {
        return { icon: 'fa-couch', cssClass: 'furniture', gradient: 'linear-gradient(135deg, #9a3412, #c2410c)' };
    }
    return { icon: 'fa-cube', cssClass: 'custom', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)' };
}

function filterAndNavigateCategory(catName) {
    if (typeof navigateTo === 'function') {
        navigateTo('inventory');
    }
    const exportFilter = document.getElementById('exportFilter');
    if (exportFilter) {
        exportFilter.value = catName;
        if (typeof currentPage !== 'undefined') currentPage = 1;
        if (typeof updateInventoryTable === 'function') {
            updateInventoryTable();
        }
    }
}
window.filterAndNavigateCategory = filterAndNavigateCategory;
window.getDashboardCategoryStyle = getDashboardCategoryStyle;

function updateDashboard() {
    console.log('Updating Dashboard with', inventoryData.length, 'items');

    const totalItems = inventoryData.length;

    // Kumpulkan seluruh kategori: 7 kategori utama + kategori dari master + kategori yang ada di inventaris
    const defaultOrder = ['Monitor', 'Keyboard', 'Mouse', 'Headset', 'Laptop', 'PC', 'TV'];
    const allCategoriesSet = new Set(defaultOrder);

    if (Array.isArray(categoriesData)) {
        categoriesData.forEach(c => {
            if (c && typeof c === 'string' && c.trim()) allCategoriesSet.add(c.trim());
        });
    }

    if (Array.isArray(inventoryData)) {
        inventoryData.forEach(item => {
            const cat = item.name || item.nama_barang || item.item_name;
            if (cat && typeof cat === 'string' && cat.trim()) allCategoriesSet.add(cat.trim());
        });
    }

    // Render Kartu Kategori Secara Dinamis
    const gridContainer = document.getElementById('dashboardCategoryStatsGrid');
    if (gridContainer) {
        gridContainer.innerHTML = Array.from(allCategoriesSet).map(catName => {
            const style = getDashboardCategoryStyle(catName);
            const count = inventoryData.filter(item => {
                const itemName = item.name || item.nama_barang || item.item_name;
                if (!itemName) return false;
                const n = itemName.toString().toLowerCase().trim();
                const k = catName.toLowerCase().trim();
                return n === k || n.includes(k) || k.includes(n);
            }).length;

            const safeId = `total_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_Dashboard`;

            return `
                <div class="stat-card ${style.cssClass} premium-glow" 
                     onclick="filterAndNavigateCategory('${escapeChecklistText(catName)}')" 
                     title="Klik untuk filter data ${escapeChecklistText(catName)} di inventaris">
                    <div class="icon" style="background: ${style.gradient}; color: #ffffff;">
                        <i class="fas ${style.icon}"></i>
                    </div>
                    <div class="number gradient-text" id="${safeId}">${count}</div>
                    <div class="label" title="${escapeChecklistText(catName)}">${escapeChecklistText(catName)}</div>
                </div>
            `;
        }).join('');
    }

    // Main total items animation
    if (document.getElementById('totalItems')) {
        if (typeof animateCountUp === 'function') {
            animateCountUp('totalItems', totalItems);
        } else {
            document.getElementById('totalItems').textContent = totalItems;
        }
    }

    // Operational Status Metrics (Digunakan, Ready Spare di Gudang, Rusak/Maintenance)
    let inUseCount = 0;
    let inStockCount = 0;
    let damagedCount = 0;

    inventoryData.forEach(item => {
        const kondisi = (item.kondisi_after || item.kondisiAfter || item.kondisi || 'Baik').toString().toLowerCase();
        const lokasi = (item.lokasi || item.location || '').toString().toLowerCase();
        const isDamaged = kondisi.includes('rusak') || kondisi.includes('repair') || kondisi.includes('perbaikan');

        if (isDamaged) {
            damagedCount++;
        } else if (lokasi.includes('gudang') || lokasi.includes('storage') || !lokasi || lokasi === '-') {
            inStockCount++;
        } else {
            inUseCount++;
        }
    });

    if (typeof animateCountUp === 'function') {
        animateCountUp('totalInUseDashboard', inUseCount);
        animateCountUp('totalInStockDashboard', inStockCount);
        animateCountUp('totalDamagedDashboard', damagedCount);
    } else {
        if (document.getElementById('totalInUseDashboard')) document.getElementById('totalInUseDashboard').textContent = inUseCount;
        if (document.getElementById('totalInStockDashboard')) document.getElementById('totalInStockDashboard').textContent = inStockCount;
        if (document.getElementById('totalDamagedDashboard')) document.getElementById('totalDamagedDashboard').textContent = damagedCount;
    }

    // Occupancy Analytics (Idea 3)
    if (cubiclePositions && cubiclePositions.length > 0) {
        const validCubicles = cubiclePositions.filter(p => p.type !== 'label' && (!p.cubicle_id || !p.cubicle_id.startsWith('LABEL_')));
        const occupiedCount = validCubicles.filter(pos =>
            inventoryData.some(inv => getCubicleId(inv) === pos.cubicle_id)
        ).length;
        const totalValid = validCubicles.length || 1;
        const percent = Math.round((occupiedCount / totalValid) * 100);

        const percentEl = document.getElementById('occupiedPercent');
        const barEl = document.getElementById('occupancyBar');
        if (percentEl) percentEl.textContent = `${percent}%`;
        if (barEl) barEl.style.width = `${percent}%`;
    }

    // Update Recent Activities
    updateRecentActivities();

    // Update charts if available
    if (typeof updateChartsData === 'function') updateChartsData();

    // Update Recent BAST & Low Stock Alerts
    updateDashboardRecentBast();
    checkDashboardLowStock();
}

async function updateDashboardRecentBast() {
    const tbody = document.getElementById('recentBastTableBody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/handover');
        if (!res.ok) return;
        const handovers = await res.json();
        if (!Array.isArray(handovers) || handovers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 25px;"><i class="fas fa-inbox" style="font-size: 20px; display: block; margin-bottom: 6px;"></i>Belum ada dokumen Berita Acara yang diterbitkan</td></tr>';
            return;
        }

        const recent = handovers.slice(0, 5);
        tbody.innerHTML = recent.map(item => {
            const noBA = item.no_berita_acara || item.noBeritaAcara || '-';
            const jenis = item.jenis_transaksi || item.jenisTransaksi || 'Penyerahan';
            const namaBarang = item.item_name || item.itemName || 'Perangkat IT';
            const sn = item.item_sn || item.itemSn || '-';
            const penyerah = item.pihak_penyerah || item.pihakPenyerah || '-';
            const penerima = item.pihak_penerima || item.pihakPenerima || '-';
            const lokasi = item.lokasi_baru || item.lokasiBaru || '-';
            const tgl = item.tanggal_serah_terima || item.tanggalSerahTerima ? new Date(item.tanggal_serah_terima || item.tanggalSerahTerima).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

            const badgeColor = jenis.toLowerCase() === 'penyerahan' ? '#3b82f6' : '#10b981';

            return `
                <tr>
                    <td>
                        <strong style="color: var(--text-primary); font-family: monospace; font-size: 12.5px;">${noBA}</strong>
                        <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
                            <i class="fas fa-calendar-alt"></i> ${tgl}
                        </div>
                    </td>
                    <td>
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 600; background: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">
                            ${jenis}
                        </span>
                    </td>
                    <td>
                        <strong>${namaBarang}</strong>
                        <div style="font-size: 11.5px; color: var(--text-secondary); font-family: monospace;">SN: ${sn}</div>
                    </td>
                    <td>
                        <div style="font-size: 12.5px;">
                            <span style="color: var(--text-secondary);">${penyerah}</span>
                            <i class="fas fa-arrow-right" style="font-size: 10px; margin: 0 4px; color: var(--primary);"></i>
                            <strong style="color: var(--text-primary);">${penerima}</strong>
                        </div>
                    </td>
                    <td>
                        <span style="font-size: 12px; color: var(--text-secondary);">
                            <i class="fas fa-map-marker-alt" style="color: var(--primary); margin-right: 4px;"></i>${lokasi}
                        </span>
                    </td>
                    <td style="text-align: center;">
                        <a href="/api/handover/${item.id}/pdf?token=${encodeURIComponent(sessionStorage.getItem('authToken') || '')}" class="btn-bast-pdf-download" target="_blank" title="Unduh Dokumen PDF Resmi BAST">
                            <i class="fas fa-file-pdf"></i> Unduh PDF
                        </a>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading recent BAST for dashboard:', e);
    }
}

async function checkDashboardLowStock() {
    const alertEl = document.getElementById('dashboardLowStockAlert');
    const listEl = document.getElementById('lowStockItemsList');
    if (!alertEl || !listEl) return;

    try {
        const res = await fetch('/api/non-inventory');
        if (!res.ok) return;
        const items = await res.json();
        if (!Array.isArray(items)) return;

        const lowItems = items.filter(it => (parseInt(it.jumlah, 10) || 0) <= 5);
        if (lowItems.length > 0) {
            alertEl.style.display = 'flex';
            listEl.textContent = lowItems.map(it => `${it.namaBarang || it.nama_barang || 'Barang'} (sisa ${it.jumlah} ${it.satuan || 'pcs'})`).join(', ');
        } else {
            alertEl.style.display = 'none';
        }
    } catch (e) {
        // silent
    }
}

function filterAndNavigateInventory(mode) {
    navigateTo('inventory');
    const searchInput = document.getElementById('searchInput');
    const exportFilter = document.getElementById('exportFilter');
    if (!searchInput) return;

    if (mode === 'in-stock') {
        searchInput.value = 'Gudang';
        filterInventory();
    } else if (mode === 'maintenance') {
        searchInput.value = 'Rusak';
        filterInventory();
    } else {
        searchInput.value = '';
        if (exportFilter) exportFilter.value = 'all';
        filterInventory();
    }
}

function updateRecentActivities() {
    const recentTableBody = document.getElementById('recentTableBody');
    if (!recentTableBody) return;

    // Get last 5 items
    const recentItems = [...inventoryData].slice(-5).reverse();

    if (recentItems.length === 0) {
        recentTableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-secondary);">Belum ada aktivitas</td></tr>';
    } else {
        recentTableBody.innerHTML = recentItems.map((item, index) => {
            const itemName = item.name || item.nama_barang || item.item_name || '-';
            const kondisiBefore = item.kondisi_before || item.kondisiBefore || '-';
            const kondisiAfter = item.kondisi_after || item.kondisiAfter || '-';

            const kbClass = getStatusBadgeClass(kondisiBefore);
            const kaClass = getStatusBadgeClass(kondisiAfter);
            const chkClass = item.checklist === 'Ya' ? 'checked' : 'unchecked';

            return `
                <tr>
                    <td>${getCategoryBadgeHtml(itemName)}</td>
                    <td>${item.merk || '-'}</td>
                    <td><span class="barcode-display">${item.sn || '-'}</span></td>
                    <td>${item.lokasi || '-'}</td>
                    <td><span class="status-badge ${kbClass}">${kondisiBefore}</span></td>
                    <td><span class="status-badge ${kaClass}">${kondisiAfter}</span></td>
                    <td><span class="status-badge ${chkClass}">${item.checklist || '-'}</span></td>
                    <td>${item.catatan || '-'}</td>
                    <td>${item.date || item.created_at || '-'}</td>
                    <td><span class="barcode-display">${item.id || '-'}</span></td>
                </tr>
            `;
        }).join('');
    }
}

// Helper to extract cubicle code from any location string (e.g. "A-01", "Cubicle B-04", "a01")
function extractCubicleId(lokasiStr) {
    if (!lokasiStr || typeof lokasiStr !== 'string') return '';
    const match = lokasiStr.trim().match(/\b([A-Fa-f])-?0*([1-9]|[1-3][0-9])\b/);
    if (match) {
        const block = match[1].toUpperCase();
        const num = String(parseInt(match[2], 10)).padStart(2, '0');
        return `${block}-${num}`;
    }
    return '';
}

// Helper to get cubicle_id consistently (from cubicle_id property or auto-extracted from lokasi)
function getCubicleId(item) {
    if (!item) return '';
    if (item.cubicle_id && String(item.cubicle_id).trim()) return String(item.cubicle_id).trim().toUpperCase();
    if (item.cubicleId && String(item.cubicleId).trim()) return String(item.cubicleId).trim().toUpperCase();
    if (item.lokasi) {
        return extractCubicleId(item.lokasi);
    }
    return '';
}

// ==========================================================================
// MODERN ENTERPRISE DASHBOARD FLOORPLAN ENGINE (Stop-Slop Suite)
// ==========================================================================
let dashboardMapState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    currentFilter: 'all',
    currentZone: 'all',
    hasUserInteracted: false,
    stageBounds: { minX: 0, maxX: 1200, minY: 0, maxY: 1600 }
};

function renderDashboardMap() {
    const container = document.getElementById('dashboardMiniMap');
    if (!container) return;

    let stage = document.getElementById('dashboardMapStage');
    if (!stage) {
        stage = document.createElement('div');
        stage.id = 'dashboardMapStage';
        stage.className = 'map-stage';
        stage.style.position = 'absolute';
        stage.style.left = '0';
        stage.style.top = '0';
        stage.style.transformOrigin = '0 0';
        container.appendChild(stage);
    }
    stage.innerHTML = '';

    const validPositions = (cubiclePositions || []).filter(p => (p.x > 0 || p.y > 0));

    if (validPositions.length === 0) {
        stage.innerHTML = `
            <div class="empty-state mini" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center;">
                <i class="fas fa-map-marked-alt" style="font-size: 32px; color: var(--text-tertiary); margin-bottom: 8px;"></i>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">Belum ada denah yang diletakkan di kanvas</p>
                <a href="#map-designer" style="font-size: 11px; color: var(--primary); text-decoration: underline; margin-top: 4px; display: inline-block;">Atur Tata Letak di Designer</a>
            </div>
        `;
        updateDashboardMapCounters(0, 0, 0, 0);
        return;
    }

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    validPositions.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    dashboardMapState.stageBounds = { minX, maxX, minY, maxY };

    // Group items by cluster/block for island pod cards
    const clusterMap = {};
    let totalOccupied = 0;
    let totalVacant = 0;
    let totalRooms = 0;
    let totalAll = 0;

    validPositions.forEach(pos => {
        const isLabel = pos.type === 'label' || (pos.cubicle_id && pos.cubicle_id.startsWith('LABEL_'));
        if (isLabel) return;

        totalAll++;
        const isRoom = pos.type === 'room' || (pos.cubicle_id && (pos.cubicle_id.toUpperCase().includes('LOBBY') || pos.cubicle_id.toUpperCase().includes('NOC') || pos.cubicle_id.toUpperCase().includes('SERVER') || pos.cubicle_id.toUpperCase().includes('MEETING')));
        if (isRoom) {
            totalRooms++;
        }

        const items = inventoryData.filter(inv => getCubicleId(inv) === pos.cubicle_id);
        if (items.length > 0) totalOccupied++;
        else if (!isRoom) totalVacant++;

        // Cluster detection by prefix (e.g. A, B, C, D, E, F)
        if (!isRoom) {
            const block = (pos.cubicle_id.split('-')[0] || '').trim().toUpperCase();
            if (block && block.length === 1 && block >= 'A' && block <= 'Z') {
                if (!clusterMap[block]) clusterMap[block] = [];
                clusterMap[block].push(pos);
            }
        }
    });

    updateDashboardMapCounters(totalAll, totalOccupied, totalVacant, totalRooms);

    // 1. Render Cluster Pod Cards (Island Enclosures)
    Object.keys(clusterMap).sort().forEach(block => {
        const nodes = clusterMap[block];
        if (nodes.length >= 2) {
            let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
            nodes.forEach(n => {
                if (n.x < bMinX) bMinX = n.x;
                if (n.x > bMaxX) bMaxX = n.x;
                if (n.y < bMinY) bMinY = n.y;
                if (n.y > bMaxY) bMaxY = n.y;
            });

            const podCard = document.createElement('div');
            podCard.className = `cluster-pod-card pod-block-${block}`;
            podCard.style.left = `${bMinX - 16}px`;
            podCard.style.top = `${bMinY - 26}px`;
            podCard.style.width = `${(bMaxX - bMinX) + 84}px`;
            podCard.style.height = `${(bMaxY - bMinY) + 88}px`;

            podCard.innerHTML = `
                <div class="pod-header">
                    <span class="pod-dot"></span>
                    <span>Kluster ${block}</span>
                    <span class="pod-badge">(${nodes.length} Meja)</span>
                </div>
            `;
            stage.appendChild(podCard);
        }
    });

    // 2. Render Desks & Rooms
    validPositions.forEach(pos => {
        const isLabel = pos.type === 'label' || (pos.cubicle_id && pos.cubicle_id.startsWith('LABEL_'));
        if (isLabel) {
            const div = document.createElement('div');
            div.className = 'view-label mini';
            div.style.left = `${pos.x}px`;
            div.style.top = `${pos.y}px`;
            div.style.fontSize = '9px';
            div.style.padding = '3px 8px';
            div.style.borderRadius = '6px';
            div.style.background = 'rgba(16, 185, 129, 0.12)';
            div.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            div.style.color = '#34d399';
            div.style.fontWeight = '700';
            div.style.zIndex = '3';
            div.textContent = pos.text || '';
            stage.appendChild(div);
            return;
        }

        const items = inventoryData.filter(inv => getCubicleId(inv) === pos.cubicle_id);
        const isOccupied = items.length > 0;
        const isRoom = pos.type === 'room' || (pos.cubicle_id && (pos.cubicle_id.toUpperCase().includes('LOBBY') || pos.cubicle_id.toUpperCase().includes('NOC') || pos.cubicle_id.toUpperCase().includes('SERVER') || pos.cubicle_id.toUpperCase().includes('MEETING')));

        const div = document.createElement('div');
        div.setAttribute('data-id', pos.cubicle_id);
        div.setAttribute('data-type', isRoom ? 'room' : 'cubicle');
        div.setAttribute('data-occupied', isOccupied ? 'true' : 'false');
        div.style.left = `${pos.x}px`;
        div.style.top = `${pos.y}px`;

        if (isRoom) {
            div.className = `cubicle-view mini room-card ${isOccupied ? 'occupied' : ''}`;
            let roomIcon = 'fa-building';
            const upper = pos.cubicle_id.toUpperCase();
            if (upper.includes('NOC')) roomIcon = 'fa-network-wired';
            else if (upper.includes('SERVER')) roomIcon = 'fa-server';
            else if (upper.includes('MEETING') || upper.includes('RAPAT')) roomIcon = 'fa-users';

            div.innerHTML = `
                <div class="room-header-wrap">
                    <i class="fas ${roomIcon} room-icon"></i>
                    <span class="room-title">${pos.cubicle_id}</span>
                </div>
                <span class="room-subtitle">${isOccupied ? `${items.length} Aset Terpasang` : 'Area Publik'}</span>
                ${isOccupied ? `<span class="item-count-badge">${items.length}</span>` : ''}
                <div class="cubicle-tooltip">
                    <strong style="color: #34d399;">${pos.cubicle_id}</strong><br>
                    <span style="font-size: 10px; color: #94a3b8;">${isOccupied ? `${items.length} Barang Terpasang` : 'Ruangan Khusus / Belum ada barang'}</span>
                </div>
            `;
        } else {
            div.className = `cubicle-view mini desk-node ${isOccupied ? 'occupied' : ''}`;

            let iconClass = 'fa-plus';
            if (isOccupied) {
                const hasLaptop = items.some(i => (i.name || '').toLowerCase().includes('laptop'));
                const hasPC = items.some(i => (i.name || '').toLowerCase().includes('pc') || (i.name || '').toLowerCase().includes('server'));
                iconClass = hasLaptop ? 'fa-laptop' : (hasPC ? 'fa-server' : 'fa-desktop');
            }

            const itemsPreview = isOccupied ? items.slice(0, 2).map(i => `• ${i.name || 'Barang'}`).join('<br>') : '';
            div.innerHTML = `
                <span class="cubicle-id">${pos.cubicle_id}</span>
                <i class="fas ${iconClass} cubicle-icon"></i>
                ${isOccupied ? `<span class="item-count-badge">${items.length}</span>` : ''}
                <div class="cubicle-tooltip">
                    <strong>${pos.cubicle_id}</strong> • <span style="color: ${isOccupied ? '#60a5fa' : '#94a3b8'};">${isOccupied ? 'Terisi Aset' : 'Kosong'}</span><br>
                    ${isOccupied ? `<div style="font-size: 10px; color: #cbd5e1; margin-top: 3px;">${itemsPreview}${items.length > 2 ? `<br>+${items.length - 2} lainnya` : ''}</div>` : '<span style="font-size: 10px; color: #94a3b8;">Klik untuk tambah/assign aset</span>'}
                </div>
            `;
        }

        // Click to view detail modal
        div.onclick = (e) => {
            e.stopPropagation();
            if (typeof handleCubicleClick === 'function') {
                handleCubicleClick(pos.cubicle_id);
            }
        };

        stage.appendChild(div);
    });

    // Auto-fit floorplan to container on initial render
    if (!dashboardMapState.hasUserInteracted) {
        setTimeout(() => fitDashboardMap(), 50);
    } else {
        applyDashboardMapTransform();
    }

    // Attach pan/drag listeners
    setupDashboardMapPanListeners(container);
}

function fitDashboardMap() {
    const container = document.getElementById('dashboardMiniMap');
    const stage = document.getElementById('dashboardMapStage');
    if (!container || !stage) return;

    const bounds = dashboardMapState.stageBounds;
    const contentW = Math.max(300, (bounds.maxX - bounds.minX) + 140);
    const contentH = Math.max(300, (bounds.maxY - bounds.minY) + 140);

    const contW = container.clientWidth || 1000;
    const contH = container.clientHeight || 560;

    // Calculate optimal scale to fit entire floor plan
    const scaleX = (contW - 40) / contentW;
    const scaleY = (contH - 40) / contentH;
    const optimalScale = Math.max(0.3, Math.min(scaleX, scaleY, 1.1));

    dashboardMapState.zoom = optimalScale;

    // Center the content in the viewport
    dashboardMapState.panX = Math.round((contW - contentW * optimalScale) / 2 - (bounds.minX - 70) * optimalScale);
    dashboardMapState.panY = Math.round((contH - contentH * optimalScale) / 2 - (bounds.minY - 70) * optimalScale);

    applyDashboardMapTransform();

    // Reset zone pill active state to 'all'
    document.querySelectorAll('.zone-pill-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-zone') === 'all'));
}

function zoomDashboardMap(delta) {
    dashboardMapState.hasUserInteracted = true;
    const newZoom = Math.max(0.25, Math.min(2.5, dashboardMapState.zoom + delta));
    dashboardMapState.zoom = newZoom;
    applyDashboardMapTransform();
}

function focusDashboardZone(zone) {
    dashboardMapState.hasUserInteracted = true;
    document.querySelectorAll('.zone-pill-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-zone') === zone));

    if (zone === 'all') {
        fitDashboardMap();
        return;
    }

    const container = document.getElementById('dashboardMiniMap');
    if (!container) return;

    const contW = container.clientWidth || 1000;
    const contH = container.clientHeight || 560;

    // Filter items in that zone
    const targetBlocks = zone.split('');
    const targetItems = (cubiclePositions || []).filter(p => (p.x > 0 || p.y > 0) && targetBlocks.some(b => p.cubicle_id && p.cubicle_id.startsWith(b + '-')));

    if (targetItems.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    targetItems.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    const contentW = Math.max(200, (maxX - minX) + 100);
    const contentH = Math.max(200, (maxY - minY) + 100);

    const scale = Math.max(0.5, Math.min((contW - 60) / contentW, (contH - 60) / contentH, 1.25));
    dashboardMapState.zoom = scale;
    dashboardMapState.panX = Math.round((contW - contentW * scale) / 2 - (minX - 50) * scale);
    dashboardMapState.panY = Math.round((contH - contentH * scale) / 2 - (minY - 50) * scale);

    applyDashboardMapTransform();
}

function setDashboardMapFilter(filter) {
    dashboardMapState.currentFilter = filter;
    document.querySelectorAll('.map-filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });

    const nodes = document.querySelectorAll('#dashboardMapStage .cubicle-view');
    nodes.forEach(node => {
        const isOccupied = node.getAttribute('data-occupied') === 'true';
        const type = node.getAttribute('data-type');

        let match = false;
        if (filter === 'all') match = true;
        else if (filter === 'occupied') match = isOccupied;
        else if (filter === 'vacant') match = (!isOccupied && type !== 'room');
        else if (filter === 'rooms') match = (type === 'room');

        if (match) {
            node.classList.remove('dimmed');
        } else {
            node.classList.add('dimmed');
        }
    });
}

function updateDashboardMapCounters(all, occupied, vacant, rooms) {
    const elAll = document.getElementById('mapCountAll');
    const elOcc = document.getElementById('mapCountOccupied');
    const elVac = document.getElementById('mapCountVacant');
    const elRms = document.getElementById('mapCountRooms');

    if (elAll) elAll.textContent = all;
    if (elOcc) elOcc.textContent = occupied;
    if (elVac) elVac.textContent = vacant;
    if (elRms) elRms.textContent = rooms;
}

function applyDashboardMapTransform() {
    const stage = document.getElementById('dashboardMapStage');
    if (!stage) return;
    stage.style.transform = `translate(${dashboardMapState.panX}px, ${dashboardMapState.panY}px) scale(${dashboardMapState.zoom})`;
}

let isPanListenerAttached = false;
function setupDashboardMapPanListeners(container) {
    if (isPanListenerAttached || !container) return;
    isPanListenerAttached = true;

    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('.cubicle-view') || e.target.closest('button')) return;
        dashboardMapState.isDragging = true;
        dashboardMapState.hasUserInteracted = true;
        dashboardMapState.dragStartX = e.clientX - dashboardMapState.panX;
        dashboardMapState.dragStartY = e.clientY - dashboardMapState.panY;
        container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dashboardMapState.isDragging) return;
        dashboardMapState.panX = e.clientX - dashboardMapState.dragStartX;
        dashboardMapState.panY = e.clientY - dashboardMapState.dragStartY;
        applyDashboardMapTransform();
    });

    window.addEventListener('mouseup', () => {
        if (dashboardMapState.isDragging) {
            dashboardMapState.isDragging = false;
            container.style.cursor = 'grab';
        }
    });

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        dashboardMapState.hasUserInteracted = true;
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        zoomDashboardMap(delta);
    }, { passive: false });
}

// Idea 2: Smart Highlight Search
function highlightDashboardMap() {
    const query = (document.getElementById('dashboardMapSearch')?.value || '').toLowerCase().trim();
    const cubicles = document.querySelectorAll('#dashboardMapStage .cubicle-view');

    if (!query) {
        cubicles.forEach(c => c.classList.remove('highlight-pulse', 'dimmed'));
        if (dashboardMapState.currentFilter !== 'all') {
            setDashboardMapFilter(dashboardMapState.currentFilter);
        }
        return;
    }

    cubicles.forEach(c => {
        const cubicleId = c.getAttribute('data-id') || '';
        const items = inventoryData.filter(inv => getCubicleId(inv) === cubicleId);

        const match = cubicleId.toLowerCase().includes(query) ||
            items.some(inv =>
                (inv.name && inv.name.toLowerCase().includes(query)) ||
                (inv.sn && inv.sn.toLowerCase().includes(query)) ||
                (inv.merk && inv.merk.toLowerCase().includes(query))
            );

        if (match) {
            c.classList.add('highlight-pulse');
            c.classList.remove('dimmed');
        } else {
            c.classList.remove('highlight-pulse');
            c.classList.add('dimmed');
        }
    });
}

// Expose to global window
window.renderDashboardMap = renderDashboardMap;
window.fitDashboardMap = fitDashboardMap;
window.zoomDashboardMap = zoomDashboardMap;
window.focusDashboardZone = focusDashboardZone;
window.setDashboardMapFilter = setDashboardMapFilter;
window.highlightDashboardMap = highlightDashboardMap;

function getInitialPage() {
    const validPages = [
        'dashboard', 'inventory', 'input', 'scan',
        'history', 'handover-data', 'handover-input',
        'map-designer', 'map-view',
    'non-inventory'
    ];

    let page = '';
    // 1. Check URL hash first (e.g. #inventory)
    if (window.location.hash) {
        page = window.location.hash.replace(/^#\/?/, '').trim();
    }
    // 2. Check sessionStorage if no hash
    if (!page) {
        try {
            page = sessionStorage.getItem('activePage') || '';
        } catch (e) {}
    }

    // Normalization aliases
    if (page === 'handover') page = 'handover-data';
    if (page === 'map') page = 'map-view';
    if (page === 'scanPage') page = 'scan';

    if (validPages.includes(page)) {
        return page;
    }
    return 'dashboard';
}

async function navigateTo(page, updateHistory = true) {
    if (!page) page = 'dashboard';
    // Alias mappings
    if (page === 'handover') page = 'handover-data';
    if (page === 'map') page = 'map-view';
    if (page === 'scanPage') page = 'scan';

    // 1. Update menu highlight
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });

    const targetSubmenuItem = document.querySelector(`.submenu-item[data-page="${page}"]`);
    if (targetSubmenuItem) {
        targetSubmenuItem.classList.add('active');
        const submenu = targetSubmenuItem.closest('.submenu');
        if (submenu) {
            submenu.classList.add('open');
            const parentHasSubmenu = submenu.previousElementSibling;
            if (parentHasSubmenu && parentHasSubmenu.classList.contains('has-submenu')) {
                parentHasSubmenu.classList.add('open');
            }
        }
    } else {
        const topItem = document.querySelector(`.menu-item:not(.submenu-item)[data-page="${page}"]`);
        if (topItem) {
            topItem.classList.add('active');
        }
        // If navigating to top-level page, close all submenus for clean UI
        document.querySelectorAll('.menu-item.has-submenu').forEach(h => h.classList.remove('open'));
        document.querySelectorAll('.submenu').forEach(s => s.classList.remove('open'));
    }

    // 2. Update page with animation
    console.log('[NAV] Navigating to:', page);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Fix: Close any open modals when navigating
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));

    // Sync mobile bottom navigation bar active state
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.remove('active');
        const btnPage = btn.getAttribute('data-page');
        if (btnPage) {
            if (btnPage === page) {
                btn.classList.add('active');
            } else if (btnPage === 'inventory' && (page === 'input' || page === 'inventory')) {
                btn.classList.add('active');
            } else if (btnPage === 'handover-data' && (page === 'handover-data' || page === 'handover-input')) {
                btn.classList.add('active');
            }
        }
    });

    const pageId = page + 'Page';
    const targetPage = document.getElementById(pageId);

    if (targetPage) {
        console.log('[NAV] Target page found:', pageId);
        targetPage.classList.add('active');

        // Add stagger animation to cards on dashboard
        if (page === 'dashboard') {
            const cards = targetPage.querySelectorAll('.stat-card');
            cards.forEach((card, index) => {
                card.style.animationDelay = `${index * 0.1}s`;
                card.style.opacity = '0';
                card.style.animation = 'fadeSlideIn 0.5s ease forwards';
            });
        }
    } else {
        console.error('[NAV] CRITICAL: Page not found!', pageId);
    }

    // 3. Update title
    const pageTitles = {
        'dashboard': 'Dashboard',
        'inventory': 'Inventory',
        'input': 'Input Inventaris',
        'scan': 'Cek Inventaris',
        'history': 'History',
        'handover': 'Serah Terima',
        'handover-data': 'Data Serah Terima',
        'handover-input': 'Input Serah Terima',
        'map-designer': 'Mapping Lokasi',
        'map-view': 'Visualisasi Denah',
    'non-inventory': 'Non-Inventaris'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
        titleEl.textContent = pageTitles[page] || 'Inventory System';
    }

    // 4. Persist active page state in URL hash and sessionStorage
    if (updateHistory) {
        try {
            const currentHash = window.location.hash.replace(/^#\/?/, '').trim();
            if (currentHash !== page) {
                history.pushState({ page }, '', '#' + page);
            }
        } catch (e) {
            window.location.hash = page;
        }
    }
    try {
        sessionStorage.setItem('activePage', page);
    } catch (e) {
        console.warn('sessionStorage not available:', e);
    }

    // 5. Update content
    if (page === 'dashboard') {
        // Small delay to ensure the DOM is ready for map rendering
        setTimeout(() => {
            updateDashboard();
            if (typeof renderDashboardMap === 'function') renderDashboardMap();
        }, 100);
    } else if (page === 'inventory') {
        updateInventoryTable();
    } else if (page === 'map-designer' || page === 'map-view') {
        renderMap();
    } else if (page === 'scan') {
        initScanPage();
    } else if (page === 'history') {
        loadHistory();
    } else if (page === 'handover' || page === 'handover-data') {
        loadHandover();
    } else if (page === 'handover-input') {
        loadHandover();
        // Pastikan data inventaris termuat untuk dropdown pemilihan unit
        if (!inventoryData || inventoryData.length === 0) {
            loadInventory().then(() => {
                const kat = document.getElementById('handoverKategori');
                if (kat && kat.value && typeof loadItemsByCategory === 'function') loadItemsByCategory();
            });
        } else {
            const kat = document.getElementById('handoverKategori');
            if (kat && kat.value && typeof loadItemsByCategory === 'function') loadItemsByCategory();
        }
        if (typeof renderBASTChecklistChips === 'function') renderBASTChecklistChips();
        // Reinit signature pad after brief delay to ensure canvas is visible
        setTimeout(() => {
            if (typeof initSignaturePad === 'function') initSignaturePad();
        }, 150);
    } else if (page === 'non-inventory') {
        if (typeof loadNonInventory === 'function') loadNonInventory();
    }
}

// ========================================
// API FUNCTIONS
// ========================================
async function loadInventory() {
    try {
        const response = await fetch('/api/inventory');
        inventoryData = await response.json();
        updateDashboard();
        initializePagination();

        // Synchronize Cek Inventaris page
        if (typeof loadCheckedItems === 'function') loadCheckedItems();
        if (typeof renderScanTable === 'function') renderScanTable();
        if (typeof updateScanStats === 'function') updateScanStats();
    } catch (error) {
        console.error('Error loading inventory:', error);
        showToast('Gagal memuat data inventaris!', true);
    }
}

async function addInventory(item) {
    try {
        const response = await fetch('/api/inventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(item)
        });

        const data = await response.json();
        if (data.success) {
            inventoryData.push(data.item);
            updateDashboard();
            updateInventoryTable();
            return data.item;
        }
    } catch (error) {
        console.error('Error adding inventory:', error);
        showToast('Gagal menambahkan item!', true);
    }
    return null;
}

async function updateInventoryItem(id, updatedItem) {
    try {
        const response = await fetch(`/api/inventory/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedItem)
        });

        const data = await response.json();
        if (data.success) {
            const index = inventoryData.findIndex(item => item.id === id);
            if (index !== -1) {
                inventoryData[index] = data.item;
            }
            updateDashboard();
            updateInventoryTable();
            return true;
        }
    } catch (error) {
        console.error('Error updating inventory:', error);
        showToast('Gagal memperbarui item!', true);
    }
    return false;
}

async function deleteInventoryItem(id) {
    try {
        const response = await fetch(`/api/inventory/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            inventoryData = inventoryData.filter(item => item.id !== id);
            updateDashboard();
            updateInventoryTable();
            return true;
        }
    } catch (error) {
        console.error('Error deleting inventory:', error);
        showToast('Gagal menghapus item!', true);
    }
    return false;
}

function toggleItemSelection(id) {
    if (selectedItems.has(id)) {
        selectedItems.delete(id);
    } else {
        selectedItems.add(id);
    }
    updateSelectedCount();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.row-checkbox');

    if (selectAllCheckbox.checked) {
        const search = document.getElementById('searchInput').value.toLowerCase();
        const filterSelect = document.getElementById('exportFilter');
        const filterValue = filterSelect ? filterSelect.value : 'all';

        const filtered = inventoryData.filter(item => {
            if (filterValue !== 'all' && (!item.name || item.name.toLowerCase() !== filterValue.toLowerCase())) {
                return false;
            }
            const matchesSearch = (item.name && item.name.toLowerCase().includes(search)) ||
                (item.merk && item.merk.toLowerCase().includes(search)) ||
                (item.sn && item.sn.toLowerCase().includes(search)) ||
                (item.lokasi && item.lokasi.toLowerCase().includes(search));
            return matchesSearch;
        });

        filtered.forEach(item => selectedItems.add(item.id));
    } else {
        selectedItems.clear();
    }

    checkboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
    });

    updateSelectedCount();
}

function updateSelectedCount() {
    const countEl = document.getElementById('selectedCount');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const count = selectedItems.size;

    if (countEl) countEl.textContent = count;

    if (deleteBtn) {
        deleteBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (generateQrBtn) {
        generateQrBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

function updateActionButtons() {
    // Same as updateSelectedCount - duplicate for compatibility
    updateSelectedCount();
}

let isDeletingInventory = false;
async function deleteSelectedItems() {
    if (isDeletingInventory) return;
    if (selectedItems.size === 0) {
        showToast('Pilih item yang ingin dihapus!', true);
        return;
    }

    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Item Inventaris',
        message: `Apakah Anda yakin ingin menghapus <strong>${selectedItems.size} item</strong> inventaris terpilih? Tindakan ini tidak dapat dibatalkan.`,
        confirmText: 'Ya, Hapus Sekarang',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;

    isDeletingInventory = true;
    try {
        const response = await fetch('/api/inventory/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(selectedItems) })
        });

        const data = await response.json();
        if (data.success) {
            inventoryData = inventoryData.filter(item => !selectedItems.has(item.id));
            selectedItems.clear();
            updateSelectedCount();
            updateDashboard();
            updateInventoryTable();
            showToast(`${data.count} item berhasil dihapus!`);
        }
    } catch (error) {
        console.error('Error deleting selected items:', error);
        showToast('Gagal menghapus item!', true);
    } finally {
        isDeletingInventory = false;
    }
}

// ========================================
// DASHBOARD
// ========================================
// Redundant updateDashboard removed (consolidated at the top)


// ========================================
// COUNT-UP ANIMATION
// ========================================
function animateCountUp(elementId, targetValue, duration = 1500) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = 0;
    const startTime = performance.now();

    function updateValue(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOut = 1 - Math.pow(1 - progress, 3);

        const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOut);
        element.textContent = currentValue;

        if (progress < 1) {
            requestAnimationFrame(updateValue);
        } else {
            element.textContent = targetValue;
        }
    }

    requestAnimationFrame(updateValue);
}

// ========================================
// INVENTORY TABLE
// ========================================
let currentPage = 1;
let itemsPerPage = 10;

function changeViewLimit() {
    const select = document.getElementById('viewLimit');
    if (select) {
        itemsPerPage = parseInt(select.value);
    }
    currentPage = 1;
    updateInventoryTable();
}

function initializePagination() {
    const select = document.getElementById('viewLimit');
    if (select) {
        itemsPerPage = parseInt(select.value);
    }
    currentPage = 1;
    console.log('Initializing pagination - Items per page:', itemsPerPage, 'Total data:', inventoryData.length);
    updateInventoryTable();
}

function changePage(direction) {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const filterSelect = document.getElementById('exportFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    let filtered = inventoryData.filter(item => {
        if (filterValue !== 'all' && (!item.name || item.name.toLowerCase() !== filterValue.toLowerCase())) return false;
        const matchesSearch = (item.name && item.name.toLowerCase().includes(search)) ||
            (item.merk && item.merk.toLowerCase().includes(search)) ||
            (item.sn && item.sn.toLowerCase().includes(search)) ||
            (item.lokasi && item.lokasi.toLowerCase().includes(search));
        return matchesSearch;
    });

    if (sortState['inventoryTable'] && sortState['inventoryTable'].key) {
        filtered = sortData(filtered, sortState['inventoryTable'].key, sortState['inventoryTable'].dir);
    }

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage += direction;

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    updateInventoryTable();
}

function goToPage(page) {
    currentPage = page;
    updateInventoryTable();
}

function updateInventoryTable() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const filterSelect = document.getElementById('exportFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    let filtered = inventoryData.filter(item => {
        if (filterValue !== 'all' && (!item.name || item.name.toLowerCase() !== filterValue.toLowerCase())) return false;
        const matchesSearch = (item.name && item.name.toLowerCase().includes(search)) ||
            (item.merk && item.merk.toLowerCase().includes(search)) ||
            (item.sn && item.sn.toLowerCase().includes(search)) ||
            (item.lokasi && item.lokasi.toLowerCase().includes(search));
        return matchesSearch;
    });

    if (sortState['inventoryTable'] && sortState['inventoryTable'].key) {
        filtered = sortData(filtered, sortState['inventoryTable'].key, sortState['inventoryTable'].dir);
    }

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // Ensure itemsPerPage is valid
    if (!itemsPerPage || itemsPerPage < 1) itemsPerPage = 10;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    // Debug log
    console.log('Pagination - Page:', currentPage, 'ItemsPerPage:', itemsPerPage, 'Start:', startIndex, 'End:', endIndex, 'Total:', totalItems);

    // Force slice to work correctly
    const paginatedData = filtered.slice(startIndex, endIndex);
    console.log('Paginated data count:', paginatedData.length);

    const tableBody = document.getElementById('inventoryTableBody');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('inventoryPagination');
    const showingStart = document.getElementById('showingStart');
    const showingEnd = document.getElementById('showingEnd');
    const totalData = document.getElementById('totalData');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageNumbers = document.getElementById('pageNumbers');

    if (totalItems === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'block';
        if (pagination) pagination.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
        if (pagination) pagination.style.display = 'flex';

        tableBody.innerHTML = paginatedData.map((item, index) => {
            const isSelected = selectedItems.has(item.id);
            // Status badge classes - ensure proper styling
            const kondisiBeforeClass = getStatusBadgeClass(item.kondisiBefore);
            const kondisiAfterClass = getStatusBadgeClass(item.kondisiAfter);
            const checklistClass = item.checklist === 'Ya' ? 'checked' : 'unchecked';
            const categoryClass = getCategoryBadgeClass(item.name);

            return `
            <tr data-id="${item.id}" class="${isSelected ? 'selected-row' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    <div class="unit-cell">
                        ${getCategoryBadgeHtml(item.name)}
                        <span class="unit-id-badge">#${item.id || '-'}</span>
                    </div>
                </td>
                <td>
                    <div class="spec-cell">
                        <span class="spec-merk">${item.merk || '-'}</span>
                        <span class="spec-sn font-mono">SN: ${item.sn || '-'}</span>
                        ${item.snConverter ? `<span class="spec-converter font-mono">Conv: ${item.snConverter}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                        <span class="loc-tag">
                            <i class="fas fa-map-marker-alt"></i> ${item.lokasi || '-'}
                        </span>
                        ${(() => {
                            const latestBast = (typeof handoverData !== 'undefined' && Array.isArray(handoverData))
                                ? handoverData.find(h => String(h.item_id) === String(item.id) || (item.sn && h.item_sn === item.sn))
                                : null;
                            const hasBastDiff = latestBast && latestBast.lokasi_baru && latestBast.lokasi_baru.trim() !== '-' &&
                                latestBast.lokasi_baru.trim().toLowerCase() !== (item.lokasi || '').trim().toLowerCase();
                            if (hasBastDiff) {
                                return `<span class="sync-discrepancy-pill" onclick="quickSyncItemLocation('${item.id}', '${latestBast.lokasi_baru}')" title="BAST terakhir mencatat lokasi '${latestBast.lokasi_baru}'. Klik untuk samakan!">
                                    <i class="fas fa-sync-alt"></i> BAST: ${latestBast.lokasi_baru}
                                </span>`;
                            }
                            return '';
                        })()}
                    </div>
                </td>
                <td>
                    <div class="condition-flow">
                        <span class="status-badge ${kondisiBeforeClass}">${item.kondisiBefore || '-'}</span>
                        <span class="cond-arrow">➔</span>
                        <span class="status-badge ${kondisiAfterClass}">${item.kondisiAfter || '-'}</span>
                    </div>
                </td>
                <td>
                    <div class="checklist-notes">
                        <span class="status-badge ${checklistClass}">${item.checklist === 'Ya' ? '✓ Ya' : '✕ Tidak'}</span>
                        ${item.catatan ? `<span class="notes-preview" title="${item.catatan}"><i class="fas fa-comment-dots"></i> ${item.catatan}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div class="date-qr-cell">
                        <span class="doc-date"><i class="far fa-calendar-alt"></i> ${item.date || item.tanggalMasuk || '-'}</span>
                        ${item.qrCode ? `<img src="${item.qrCode}" alt="QR" class="qr-thumbnail" title="Klik untuk lihat">` : ''}
                    </div>
                </td>
                <td>
                    <div class="table-actions-cluster action-buttons">
                        <button class="action-btn view btn-action-icon btn-view" title="Lihat"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit btn-action-icon btn-edit" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="action-btn print btn-action-icon btn-print" title="Cetak Label"><i class="fas fa-print"></i></button>
                        <button class="action-btn delete btn-action-icon btn-del" title="Hapus"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');

        // Attach checkbox event listeners AFTER rendering
        attachCheckboxListeners();

        // Attach action button event listeners
        attachActionButtonListeners();

        if (showingStart) showingStart.textContent = totalItems > 0 ? startIndex + 1 : 0;
        if (showingEnd) showingEnd.textContent = endIndex;
        if (totalData) totalData.textContent = totalItems;

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                    html += `<button class="page-number ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
                } else if (i === currentPage - 2 || i === currentPage + 2) {
                    html += `<span class="ellipsis">...</span>`;
                }
            }
            pageNumbers.innerHTML = html;
        }

        // Re-attach checkbox listeners after table render
        attachCheckboxListeners();
    }
}

// ========================================
// CATEGORIES MANAGEMENT (DATABASE SYNC)
// ========================================
let categoriesData = [];
let fullCategoriesData = [];

async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        if (data.success && Array.isArray(data.categories)) {
            fullCategoriesData = data.categories;
            categoriesData = data.categories.map(c => c.name);
        } else {
            categoriesData = ['Monitor', 'Laptop', 'Keyboard', 'Mouse', 'Headset', 'PC', 'TV'];
            fullCategoriesData = categoriesData.map((name, idx) => ({ id: idx + 1, name }));
        }
    } catch (err) {
        console.error('Failed to load categories:', err);
        categoriesData = ['Monitor', 'Laptop', 'Keyboard', 'Mouse', 'Headset', 'PC', 'TV'];
        fullCategoriesData = categoriesData.map((name, idx) => ({ id: idx + 1, name }));
    }
    renderCategoryOptions();
}

function renderCategoryOptions() {
    const itemNameSelect = document.getElementById('itemName');
    const exportFilterSelect = document.getElementById('exportFilter');
    const editItemNameSelect = document.getElementById('editItemName');

    // 1. Form Tambah Inventaris
    if (itemNameSelect) {
        const currentVal = itemNameSelect.value;
        itemNameSelect.innerHTML = `
            <option value="">Pilih Kategori</option>
            ${categoriesData.map(c => `<option value="${c}">${c}</option>`).join('')}
            <option value="__custom__" style="color: var(--primary); font-weight: 600;">+ Tambah / Kelola Kategori...</option>
        `;
        if (currentVal && categoriesData.includes(currentVal)) {
            itemNameSelect.value = currentVal;
        }
    }

    // 2. Filter Table Inventaris (Ambil Data Kategori dari Database)
    if (exportFilterSelect) {
        const currentFilter = exportFilterSelect.value;
        exportFilterSelect.innerHTML = `
            <option value="all">Semua Data</option>
            ${categoriesData.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
        if (currentFilter && (currentFilter === 'all' || categoriesData.includes(currentFilter))) {
            exportFilterSelect.value = currentFilter;
        }
    }

    // 3. Edit Form
    if (editItemNameSelect) {
        const currentEditVal = editItemNameSelect.value;
        editItemNameSelect.innerHTML = `
            <option value="">Pilih Nama Barang</option>
            ${categoriesData.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
        if (currentEditVal) {
            editItemNameSelect.value = currentEditVal;
        }
    }

    // 4. Form Serah Terima
    const handoverKatSelect = document.getElementById('handoverKategori');
    if (handoverKatSelect) {
        const currentHandoverVal = handoverKatSelect.value;
        handoverKatSelect.innerHTML = `
            <option value="">Pilih Kategori</option>
            ${categoriesData.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
        if (currentHandoverVal && categoriesData.includes(currentHandoverVal)) {
            handoverKatSelect.value = currentHandoverVal;
        }
    }

    // 5. Filter Cek Inventaris (Scan Barcode Page)
    const scanFilterSelect = document.getElementById('scanFilter');
    if (scanFilterSelect) {
        const currentScanFilter = scanFilterSelect.value;
        scanFilterSelect.innerHTML = `
            <option value="all">Semua</option>
            ${categoriesData.map(c => `<option value="${c}">${c}</option>`).join('')}
        `;
        if (currentScanFilter && (currentScanFilter === 'all' || categoriesData.includes(currentScanFilter))) {
            scanFilterSelect.value = currentScanFilter;
        }
    }
}

function openAddCategoryModal() {
    const input = document.getElementById('newCategoryInput');
    if (input) input.value = '';
    renderManageCategoryList();
    openModal('addCategoryModal');
    setTimeout(() => { if (input) input.focus(); }, 150);
}

function renderManageCategoryList() {
    const listEl = document.getElementById('categoryManageList');
    const badgeEl = document.getElementById('categoryCountBadge');
    if (!listEl) return;

    if (badgeEl) badgeEl.textContent = fullCategoriesData.length;

    if (!fullCategoriesData || fullCategoriesData.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 12px; font-size: 13px;">Belum ada kategori tersimpan</div>';
        return;
    }

    listEl.innerHTML = fullCategoriesData.map(cat => {
        const catName = cat.name || cat;
        const catId = cat.id;
        const count = inventoryData.filter(i => (i.name || '').toLowerCase() === catName.toLowerCase()).length;
        const isDeletable = Boolean(catId);

        return `
            <div class="category-manage-item">
                <div class="category-item-info">
                    <i class="fas fa-tag" style="color: var(--primary); font-size: 13px;"></i>
                    <span class="category-item-name">${catName}</span>
                    <span class="category-item-count">${count} barang</span>
                </div>
                ${isDeletable ? `
                    <button type="button" class="category-delete-btn" onclick="deleteCategoryItem(${catId}, '${catName.replace(/'/g, "\\'")}', ${count})" title="${count > 0 ? 'Sedang dipakai oleh ' + count + ' barang' : 'Hapus kategori'}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function deleteCategoryItem(id, name, count) {
    if (count > 0) {
        showToast(`Kategori "${name}" masih digunakan oleh ${count} barang inventaris! Ubah kategori barang terkait terlebih dahulu.`, 'warning');
        return;
    }

    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Kategori',
        message: `Apakah Anda yakin ingin menghapus kategori <strong>"${name}"</strong> dari sistem?`,
        confirmText: 'Ya, Hapus Kategori',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;

    try {
        const res = await fetch(`/api/categories/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Kategori "${name}" berhasil dihapus!`);
            await loadCategories();
            renderManageCategoryList();
        } else {
            showToast(data.message || 'Gagal menghapus kategori!', true);
        }
    } catch (err) {
        console.error('Error delete category:', err);
        showToast('Gagal menghapus kategori!', true);
    }
}

async function submitNewCategory() {
    const input = document.getElementById('newCategoryInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        showToast('Nama kategori tidak boleh kosong!', true);
        return;
    }

    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success && data.category) {
            showToast(`Kategori "${data.category.name}" berhasil disimpan ke database!`);
            input.value = '';
            await loadCategories();
            renderManageCategoryList();

            // Auto select newly created category in form
            const itemNameSelect = document.getElementById('itemName');
            if (itemNameSelect) {
                itemNameSelect.value = data.category.name;
                handleNewItemCategoryChange();
                updateLiveAssetPreview();
            }
        } else {
            showToast(data.message || 'Gagal menambahkan kategori', true);
        }
    } catch (err) {
        console.error(err);
        showToast('Gagal menambahkan kategori!', true);
    }
}

window.openAddCategoryModal = openAddCategoryModal;
window.submitNewCategory = submitNewCategory;
window.deleteCategoryItem = deleteCategoryItem;
window.renderManageCategoryList = renderManageCategoryList;
window.loadCategories = loadCategories;

// ========================================
// INPUT INVENTORY
// ========================================
function handleNewItemCategoryChange() {
    const itemSelect = document.getElementById('itemName');
    const snConverterRow = document.getElementById('snConverterRow');
    if (!itemSelect) return;

    if (itemSelect.value === '__custom__') {
        itemSelect.value = '';
        openAddCategoryModal();
        return;
    }

    if (itemSelect.value === 'Headset') {
        if (snConverterRow) snConverterRow.style.display = 'flex';
    } else {
        if (snConverterRow) snConverterRow.style.display = 'none';
        const snConv = document.getElementById('itemSnConverter');
        if (snConv) snConv.value = '';
    }
    updateLiveAssetPreview();
}

function updateLiveAssetPreview() {
    const name = document.getElementById('itemName') ? document.getElementById('itemName').value : '';
    const merk = document.getElementById('itemMerk') ? document.getElementById('itemMerk').value : '';
    const sn = document.getElementById('itemSn') ? document.getElementById('itemSn').value : '';
    const kondisiAfter = document.getElementById('itemKondisiAfter') ? document.getElementById('itemKondisiAfter').value : 'Baik';

    const liveItemTitle = document.getElementById('liveItemTitle');
    const liveMerk = document.getElementById('liveMerk');
    const liveSn = document.getElementById('liveSn');
    const liveAvatarIcon = document.getElementById('liveAvatarIcon');
    const liveStatusText = document.getElementById('liveStatusText');
    const liveStatusPill = document.getElementById('liveStatusPill');

    if (liveItemTitle) {
        liveItemTitle.textContent = name ? `${name} ${merk}`.trim() : 'Pilih Nama Barang...';
    }
    if (liveMerk) liveMerk.textContent = merk || '-';
    if (liveSn) liveSn.textContent = sn || '-';

    // Live Cubicle Link Badge
    const locInput = document.getElementById('itemLocation');
    const locVal = locInput ? locInput.value.trim() : '';
    const cubicleMatch = extractCubicleId(locVal);
    const linkBadge = document.getElementById('liveCubicleLinkBadge');
    const cubicleNameEl = document.getElementById('liveCubicleName');
    if (linkBadge && cubicleNameEl) {
        if (cubicleMatch) {
            cubicleNameEl.textContent = cubicleMatch;
            linkBadge.style.display = 'inline-flex';
        } else {
            linkBadge.style.display = 'none';
        }
    }

    if (liveStatusText) liveStatusText.textContent = kondisiAfter;
    if (liveStatusPill) {
        liveStatusPill.className = 'asset-status-pill';
        if (kondisiAfter === 'Rusak Ringan') liveStatusPill.classList.add('status-rusak-ringan');
        else if (kondisiAfter === 'Rusak Berat') liveStatusPill.classList.add('status-rusak-berat');
    }

    if (liveAvatarIcon) {
        const cat = name.toLowerCase();
        let icon = 'fa-box';
        let bg = 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)';
        if (cat.includes('laptop')) { icon = 'fa-laptop'; bg = 'linear-gradient(135deg, #3b82f6, #1d4ed8)'; }
        else if (cat.includes('pc')) { icon = 'fa-desktop'; bg = 'linear-gradient(135deg, #06b6d4, #0891b2)'; }
        else if (cat.includes('monitor')) { icon = 'fa-tv'; bg = 'linear-gradient(135deg, #10b981, #047857)'; }
        else if (cat.includes('headset')) { icon = 'fa-headphones'; bg = 'linear-gradient(135deg, #a855f7, #7e22ce)'; }
        else if (cat.includes('keyboard')) { icon = 'fa-keyboard'; bg = 'linear-gradient(135deg, #6366f1, #4338ca)'; }
        else if (cat.includes('mouse')) { icon = 'fa-mouse'; bg = 'linear-gradient(135deg, #f97316, #c2410c)'; }
        else if (cat.includes('tv')) { icon = 'fa-tv'; bg = 'linear-gradient(135deg, #eab308, #a16207)'; }
        liveAvatarIcon.style.background = bg;
        liveAvatarIcon.innerHTML = `<i class="fas ${icon}"></i>`;
    }
}
window.handleNewItemCategoryChange = handleNewItemCategoryChange;
window.updateLiveAssetPreview = updateLiveAssetPreview;

async function handleInventorySubmit(e) {
    e.preventDefault();

    const rawLoc = document.getElementById('itemLocation').value;
    const resolvedCubicle = extractCubicleId(rawLoc);

    const newItem = {
        name: document.getElementById('itemName').value,
        merk: document.getElementById('itemMerk').value,
        sn: document.getElementById('itemSn').value,
        snConverter: document.getElementById('itemSnConverter').value,
        lokasi: rawLoc,
        cubicle_id: resolvedCubicle,
        kondisiBefore: document.getElementById('itemKondisiBefore').value,
        checklist: document.getElementById('itemChecklist').value,
        kondisiAfter: document.getElementById('itemKondisiAfter').value,
        catatan: document.getElementById('itemCatatan').value,
        tanggalMasuk: document.getElementById('itemTanggalMasuk').value,
        date: document.getElementById('itemDate').value,
        qrCode: ''
    };

    // First save to server to get the ID
    const savedItem = await addInventory(newItem);

    if (savedItem) {
        // Now generate QR code with the correct ID
        const qrData = JSON.stringify({
            id: savedItem.id,
            name: savedItem.name,
            merk: savedItem.merk,
            sn: savedItem.sn,
            lokasi: savedItem.lokasi
        });

        // Clear previous QR code
        const qrcodeDiv = document.getElementById('qrcode');
        const qrPlaceholder = document.getElementById('qrPlaceholder');
        qrcodeDiv.innerHTML = '';
        qrcodeDiv.style.display = 'block';
        qrcodeDiv.style.margin = '12px auto';
        qrcodeDiv.style.width = 'fit-content';
        qrPlaceholder.style.display = 'none';

        // Generate new QR code with correct ID
        new QRCode(qrcodeDiv, {
            text: qrData,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Get QR code as data URL, hide duplicate img element, and update on server
        setTimeout(() => {
            const canvas = qrcodeDiv.querySelector('canvas');
            const img = qrcodeDiv.querySelector('img');
            if (canvas && img) {
                img.style.setProperty('display', 'none', 'important');
            }
            if (canvas) {
                savedItem.qrCode = canvas.toDataURL('image/png');
                updateInventoryItem(savedItem.id, { qrCode: savedItem.qrCode });
            } else if (img) {
                img.style.setProperty('display', 'block', 'important');
                savedItem.qrCode = img.src;
                updateInventoryItem(savedItem.id, { qrCode: savedItem.qrCode });
            }
        }, 100);

        // Update UI
        document.getElementById('qrInfo').style.display = 'block';
        document.getElementById('qrItemName').textContent = savedItem.name;
        document.getElementById('qrItemId').textContent = 'ID: ' + savedItem.id;
        document.getElementById('printQrBtn').classList.add('show');

        showToast(resolvedCubicle ? `Item berhasil ditambahkan & terhubung ke Kubikel ${resolvedCubicle}!` : 'Item berhasil ditambahkan!');
        document.getElementById('inventoryForm').reset();
        document.getElementById('itemDate').valueAsDate = new Date();
        const badge = document.getElementById('liveCubicleLinkBadge');
        if (badge) badge.style.display = 'none';

        // Instant refresh for map views and dashboard
        loadInventory().then(() => {
            renderDashboardMap();
            renderMap();
            updateDashboard();
        });
    }
}

function printQRCode() {
    try {
        var qrcodeDiv = document.getElementById('qrcode');
        if (!qrcodeDiv) {
            showToast('Elemen QR Code tidak ditemukan!', true);
            return;
        }

        // Cari canvas atau img di dalam qrcode div
        var qrImage = qrcodeDiv.querySelector('canvas');
        var imgSrc = '';

        if (qrImage) {
            // Jika canvas, convert ke dataURL
            imgSrc = qrImage.toDataURL('image/png');
        } else {
            // Coba cari img
            qrImage = qrcodeDiv.querySelector('img');
            if (qrImage) {
                imgSrc = qrImage.src;
            }
        }

        // Jika masih tidak ada, coba cari di dalam child lain
        if (!imgSrc) {
            var children = qrcodeDiv.querySelectorAll('*');
            for (var i = 0; i < children.length; i++) {
                if (children[i].tagName === 'CANVAS') {
                    imgSrc = children[i].toDataURL('image/png');
                    break;
                } else if (children[i].tagName === 'IMG') {
                    imgSrc = children[i].src;
                    break;
                }
            }
        }

        if (!imgSrc || imgSrc === '' || imgSrc === 'data:,') {
            showToast('QR Code belum tersedia! Silakan input data terlebih dahulu.', true);
            return;
        }

        var itemIdEl = document.getElementById('qrItemId');
        var itemId = itemIdEl ? itemIdEl.textContent : '';

        // Buka window baru untuk print
        var printWindow = window.open('', '_blank', 'width=400,height=500');
        if (!printWindow) {
            showToast('Popup blocker mencegah membuka jendela print!', true);
            return;
        }

        var htmlContent = '<!DOCTYPE html>' +
            '<html>' +
            '<head>' +
            '<title>Print QR Code - Inventaris</title>' +
            '<style>' +
            'body { margin: 0; padding: 20px; font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; }' +
            '.container { text-align: center; border: 2px solid #333; padding: 20px; border-radius: 10px; }' +
            'img { width: 180px; height: 180px; }' +
            '.item-id { margin-top: 15px; font-size: 20px; font-weight: bold; font-family: monospace; }' +
            '</style>' +
            '</head>' +
            '<body>' +
            '<div class="container">' +
            '<img src="' + imgSrc + '" />' +
            '<div class="item-id">' + itemId + '</div>' +
            '</div>' +
            '<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }<\/script>' +
            '</body>' +
            '</html>';

        printWindow.document.write(htmlContent);
        printWindow.document.close();

    } catch (e) {
        console.error('Print QR Error:', e);
        showToast('Gagal print QR Code: ' + e.message, true);
    }
}

// ============================================
// HELPER: Export PDF Style
// ============================================
function createPdfDoc(title, orientation) {
    orientation = orientation || 'landscape';
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF(orientation, 'mm', 'a4');
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var margin = 20;

    // Header Logo
    try {
        doc.addImage('img/logo1.png', 'PNG', margin, 10, 35, 12);
    } catch (e) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 70, 229);
        doc.text('ICONNET', margin, 18);
    }

    // Header Title - Modern Design
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229); // Indigo 600
    doc.text(title, pageWidth / 2, 20, { align: 'center' });

    // Subtitle / Tanggal
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text('Dicetak pada: ' + formatDate(new Date()), pageWidth / 2, 28, { align: 'center' });

    // Decorative Line
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.8);
    doc.line(margin, 35, pageWidth - margin, 35);

    return { doc: doc, pageWidth: pageWidth, pageHeight: pageHeight };
}

function applyPdfTableStyle(doc, options) {
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();

    var defaultOptions = {
        theme: 'grid',
        styles: {
            fontSize: 7.5,
            cellPadding: 3,
            overflow: 'linebreak',
            valign: 'middle',
            halign: 'center',
            lineColor: [226, 232, 240], // Slate 200
            lineWidth: 0.1,
            font: 'helvetica'
        },
        headStyles: {
            fillColor: [79, 70, 229], // Indigo 600
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            fontSize: 8.5
        },
        bodyStyles: {
            textColor: [30, 41, 59], // Slate 800
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252] // Slate 50
        },
        margin: { left: 15, right: 15, top: 35, bottom: 20 },
        tableWidth: 'auto', // Auto-fit to page width
        pageBreak: 'auto',
        didDrawPage: function (data) {
            // Footer
            var pageNum = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(148, 163, 184); // Slate 400
            doc.text('Halaman ' + data.pageNumber, pageWidth / 2, pageHeight - 10, { align: 'center' });

            // Branding Footer
            doc.setFontSize(7);
            doc.text('ICONNET - Inventory Management System', 15, pageHeight - 10);
        }
    };

    // Merge options
    if (options) {
        for (var key in options) {
            if (options.hasOwnProperty(key)) {
                if (key === 'styles' || key === 'headStyles' || key === 'margin') {
                    // Deep merge for some objects
                    for (var subKey in options[key]) {
                        defaultOptions[key][subKey] = options[key][subKey];
                    }
                } else {
                    defaultOptions[key] = options[key];
                }
            }
        }
    }

    return defaultOptions;
}

// ========================================
// MODAL FUNCTIONS
// ========================================
function getCondBadgeClass(kondisi) {
    if (!kondisi) return '';
    const k = kondisi.toLowerCase();
    if (k.includes('rusak berat')) return 'cond-rusak-berat';
    if (k.includes('rusak') || k.includes('ringan')) return 'cond-rusak-ringan';
    return 'cond-baik';
}

function viewItem(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    // Store current item ID for print & quick edit
    window.currentViewItemId = id;

    // Header Badges
    const idDisplay = document.getElementById('viewItemIdDisplay');
    if (idDisplay) idDisplay.textContent = `#${item.id || '-'}`;

    const catBadge = document.getElementById('viewCategoryBadge');
    if (catBadge) {
        catBadge.textContent = item.name || 'Device';
        const styleObj = getCategoryBadgeStyle(item.name);
        if (styleObj) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme');
            const themeStyle = isDark ? styleObj.dark : styleObj.light;
            catBadge.style.background = themeStyle.bg;
            catBadge.style.color = themeStyle.color;
            catBadge.style.borderColor = themeStyle.border;
        }
    }

    document.getElementById('viewItemName').textContent = item.name || '-';
    document.getElementById('viewMerk').textContent = item.merk || '-';
    document.getElementById('viewSn').textContent = item.sn || '-';

    // SN Converter Row (Show only if present)
    const snConverterRow = document.getElementById('viewSnConverterRow');
    const snConverterVal = document.getElementById('viewSnConverter');
    if (snConverterRow && snConverterVal) {
        if (item.snConverter && item.snConverter.trim() !== '') {
            snConverterVal.textContent = item.snConverter;
            snConverterRow.style.display = 'flex';
        } else {
            snConverterVal.textContent = '-';
            snConverterRow.style.display = 'none';
        }
    }

    // Lokasi
    const locElem = document.getElementById('viewLocation');
    if (locElem) {
        locElem.innerHTML = `<span class="loc-tag" style="background: rgba(37,99,235,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); padding: 3px 10px; border-radius: 6px;"><i class="fas fa-map-marker-alt"></i> ${item.lokasi || '-'}</span>`;
    }

    // Kondisi Before & After with styled mini badges
    const condBeforeElem = document.getElementById('viewKondisiBefore');
    const condAfterElem = document.getElementById('viewKondisiAfter');
    if (condBeforeElem) {
        condBeforeElem.textContent = item.kondisiBefore || '-';
        condBeforeElem.className = 'badge-mini-cond ' + getCondBadgeClass(item.kondisiBefore);
    }
    if (condAfterElem) {
        condAfterElem.textContent = item.kondisiAfter || '-';
        condAfterElem.className = 'badge-mini-cond ' + getCondBadgeClass(item.kondisiAfter);
    }

    // Checklist
    const chkElem = document.getElementById('viewChecklist');
    if (chkElem) {
        const isYa = item.checklist === 'Ya';
        chkElem.innerHTML = `<span class="status-badge ${isYa ? 'checked' : 'unchecked'}">${isYa ? '✓ Ya (Sesuai)' : '✕ Tidak (Belum)'}</span>`;
    }

    // Catatan
    const catatanElem = document.getElementById('viewCatatan');
    if (catatanElem) {
        catatanElem.textContent = item.catatan && item.catatan.trim() ? item.catatan : 'Tidak ada catatan tambahan.';
    }

    // Tanggal
    document.getElementById('viewItemDate').textContent = formatDate(item.date || item.tanggalMasuk);

    // Generate QR in modal
    const modalQr = document.getElementById('modal-qrcode');
    modalQr.innerHTML = '';
    if (item.qrCode) {
        const img = document.createElement('img');
        img.src = item.qrCode;
        img.alt = 'QR Code ' + item.id;
        modalQr.appendChild(img);
    }

    openModal('viewModal');
}

// Copy SN to Clipboard
function copySnToClipboard() {
    const id = window.currentViewItemId;
    if (!id) return;
    const item = inventoryData.find(i => i.id === id);
    if (!item || !item.sn) {
        showToast('Tidak ada Serial Number yang dapat disalin', 'warning');
        return;
    }

    const fallbackPrompt = () => {
        showPromptDialog({
            title: 'Salin Serial Number',
            message: 'Silakan salin nomor seri aset berikut:',
            defaultValue: item.sn,
            confirmText: 'Selesai',
            cancelText: 'Tutup'
        });
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(item.sn).then(() => {
            showToast(`Serial Number "${item.sn}" berhasil disalin ke clipboard!`, 'success');
        }).catch(() => {
            fallbackPrompt();
        });
    } else {
        fallbackPrompt();
    }
}
window.copySnToClipboard = copySnToClipboard;

// Quick Edit directly from View Modal
function editFromViewModal() {
    const id = window.currentViewItemId;
    if (!id) return;
    closeModal('viewModal');
    setTimeout(() => {
        editItem(id);
    }, 150);
}
window.editFromViewModal = editFromViewModal;

// Print Barcode Function
function printBarcode() {
    const id = window.currentViewItemId;
    if (!id) return;

    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    // Create print window
    const printWindow = window.open('', '_blank', 'width=400,height=500');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Barcode - ${item.id}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 20px;
                }
                .qrcode-img {
                    width: 180px;
                    height: 180px;
                    margin: 20px 0;
                }
                .item-info {
                    margin-top: 15px;
                    font-size: 14px;
                }
                .item-id {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                @media print {
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div class="item-id">${item.id}</div>
            <img class="qrcode-img" src="${item.qrCode || ''}" alt="QR Code" onerror="this.style.display='none'">
            <div class="item-info">
                <strong>${item.name || '-'}</strong><br>
                ${item.merk || '-'} | ${item.sn || '-'}
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

function editItem(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    const idBadge = document.getElementById('editItemIdBadge');
    if (idBadge) idBadge.textContent = `#${item.id}`;

    document.getElementById('editItemId').value = item.id;
    document.getElementById('editItemName').value = item.name || '';
    document.getElementById('editMerk').value = item.merk || '';
    document.getElementById('editSn').value = item.sn || '';
    document.getElementById('editSnConverter').value = item.snConverter || '';
    document.getElementById('editLocation').value = item.lokasi || '';
    document.getElementById('editKondisiBefore').value = item.kondisiBefore || 'Baik';
    document.getElementById('editChecklist').value = item.checklist || 'Tidak';
    document.getElementById('editKondisiAfter').value = item.kondisiAfter || 'Baik';
    document.getElementById('editCatatan').value = item.catatan || '';
    document.getElementById('editTanggalMasuk').value = item.tanggalMasuk || item.date || '';
    document.getElementById('editItemDate').value = item.date || '';

    const snConverterRow = document.getElementById('editSnConverterRow');
    if (snConverterRow) {
        if (item.name === 'Headset') {
            snConverterRow.style.display = 'flex';
        } else {
            snConverterRow.style.display = 'none';
        }
    }

    openModal('editModal');
}

async function saveEdit() {
    const id = document.getElementById('editItemId').value;
    const rawLoc = document.getElementById('editLocation').value;
    const resolvedCubicle = extractCubicleId(rawLoc);

    const updatedItem = {
        name: document.getElementById('editItemName').value,
        merk: document.getElementById('editMerk').value,
        sn: document.getElementById('editSn').value,
        snConverter: document.getElementById('editSnConverter').value,
        lokasi: rawLoc,
        cubicle_id: resolvedCubicle,
        kondisiBefore: document.getElementById('editKondisiBefore').value,
        checklist: document.getElementById('editChecklist').value,
        kondisiAfter: document.getElementById('editKondisiAfter').value,
        catatan: document.getElementById('editCatatan').value,
        tanggalMasuk: document.getElementById('editTanggalMasuk').value,
        date: document.getElementById('editItemDate').value
    };

    // Generate QR code if item doesn't have one
    const currentItem = inventoryData.find(i => i.id === id);
    if (!currentItem || !currentItem.qrCode) {
        const qrData = JSON.stringify({
            id: id,
            name: updatedItem.name,
            merk: updatedItem.merk,
            sn: updatedItem.sn,
            lokasi: updatedItem.lokasi
        });

        // Generate QR code
        const qrContainer = document.createElement('div');
        new QRCode(qrContainer, {
            text: qrData,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Wait for QR code to generate
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            updatedItem.qrCode = canvas.toDataURL('image/png');
        } else {
            const img = qrContainer.querySelector('img');
            if (img) {
                updatedItem.qrCode = img.src;
            }
        }
    }

    const success = await updateInventoryItem(id, updatedItem);

    if (success) {
        closeModal('editModal');
        showToast('Item berhasil diperbarui! Lokasi telah disinkronkan ke BAST & Denah.');
        if (typeof loadHandover === 'function') await loadHandover();
        if (typeof renderHandoverTable === 'function') renderHandoverTable();
        renderDashboardMap();
        renderMap();
        updateDashboard();
    }
}

async function quickSyncItemLocation(id, newLoc) {
    if (!id || !newLoc) return;
    try {
        const resolvedCubicle = extractCubicleId(newLoc);
        const success = await updateInventoryItem(id, { lokasi: newLoc, cubicle_id: resolvedCubicle });
        if (success) {
            showToast(`Lokasi item #${id} berhasil diselaraskan ke "${newLoc}"!`, 'success');
            if (typeof loadHandover === 'function') await loadHandover();
            if (typeof updateInventoryTable === 'function') updateInventoryTable();
            if (typeof renderHandoverTable === 'function') renderHandoverTable();
            renderDashboardMap();
            renderMap();
            updateDashboard();
        }
    } catch (err) {
        console.error('Quick sync error:', err);
        showToast('Gagal menyelaraskan lokasi', 'error');
    }
}
window.quickSyncItemLocation = quickSyncItemLocation;

function deleteItem(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    deleteItemId = id;
    document.getElementById('deleteItemName').textContent = item.name;
    openModal('deleteModal');
}

async function confirmDelete() {
    if (deleteItemId) {
        const success = await deleteInventoryItem(deleteItemId);

        if (success) {
            deleteItemId = null;
            closeModal('deleteModal');
            showToast('Item berhasil dihapus!');
        }
    }
}

// ========================================
// EXPORT FUNCTIONS
// ========================================
async function exportToExcel() {
    if (inventoryData.length === 0) {
        showToast('Tidak ada data untuk diexport!', true);
        return;
    }

    // Get filter value
    const filterValue = document.getElementById('exportFilter') ? document.getElementById('exportFilter').value : 'all';

    // Filter data based on selection
    let filteredData = inventoryData;
    if (filterValue !== 'all') {
        filteredData = inventoryData.filter(item => item.name && item.name.toLowerCase() === filterValue.toLowerCase());
    }

    if (filteredData.length === 0) {
        showToast('Tidak ada data untuk filter ini!', true);
        return;
    }

    showToast('Sedang menyiapkan file Excel...');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory');

    // Add headers
    const headers = ['ID', 'QR Code', 'Nama Barang', 'Merk', 'SN', 'SN Converter', 'Lokasi', 'Kondisi (Before)', 'Kondisi (After)', 'Checklist', 'Catatan', 'Tanggal Barang Masuk', 'Tanggal Input'];
    const headerRow = worksheet.addRow(headers);

    // Style header
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF037A89' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Set column widths
    worksheet.columns = [
        { width: 12 }, // ID
        { width: 15 }, // QR Code
        { width: 20 }, // Nama Barang
        { width: 15 }, // Merk
        { width: 20 }, // SN
        { width: 20 }, // SN Converter
        { width: 20 }, // Lokasi
        { width: 18 }, // Kondisi (Before)
        { width: 18 }, // Kondisi (After)
        { width: 12 }, // Checklist
        { width: 25 }, // Catatan
        { width: 18 }, // Tanggal Barang Masuk
        { width: 15 }  // Tanggal Input
    ];

    // Add data
    for (let i = 0; i < filteredData.length; i++) {
        const item = filteredData[i];
        const rowIndex = i + 2; // +1 for 1-based index, +1 for header

        const rowData = [
            item.id,
            '', // Placeholder for QR code
            item.name,
            item.merk,
            item.sn,
            item.snConverter || '',
            item.lokasi,
            item.kondisiBefore,
            item.kondisiAfter,
            item.checklist,
            item.catatan,
            formatDate(item.tanggalMasuk),
            formatDate(item.date)
        ];

        const row = worksheet.addRow(rowData);
        row.height = 80; // Make row tall enough for image
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Add QR code image if exists
        if (item.qrCode) {
            try {
                let base64Data;
                if (item.qrCode.startsWith('data:image')) {
                    // Strip the data URI prefix to get raw base64
                    base64Data = item.qrCode.split(',')[1];
                } else {
                    // It's a URL path, need to fetch it
                    const response = await fetch(item.qrCode);
                    const blob = await response.blob();
                    const dataUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    base64Data = dataUrl.split(',')[1];
                }

                const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: 'png',
                });

                worksheet.addImage(imageId, {
                    tl: { col: 1, row: rowIndex - 1 },
                    br: { col: 2, row: rowIndex },
                    editAs: 'oneCell'
                });
            } catch (error) {
                console.error('Error adding image to Excel:', error);
            }
        }
    }

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const filterText = filterValue === 'all' ? 'Semua' : filterValue;
    anchor.download = `Inventory_${filterText}_${formatDate(new Date())}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    showToast('Berhasil export ke Excel dengan QR Code!');
}

function exportToPdf() {
    if (inventoryData.length === 0) {
        showToast('Tidak ada data untuk diexport!', true);
        return;
    }

    const filterValue = document.getElementById('exportFilter') ? document.getElementById('exportFilter').value : 'all';

    let filteredData = inventoryData;
    if (filterValue !== 'all') {
        filteredData = inventoryData.filter(item => item.name && item.name.toLowerCase() === filterValue.toLowerCase());
    }

    if (filteredData.length === 0) {
        showToast('Tidak ada data untuk filter ini!', true);
        return;
    }

    const result = createPdfDoc('LAPORAN DATA INVENTARIS', 'landscape');
    const doc = result.doc;

    const tableData = filteredData.map((item, index) => [
        index + 1,
        item.id || '-',
        item.name || '-',
        item.merk || '-',
        item.sn || '-',
        item.snConverter || '-',
        item.lokasi || '-',
        item.kondisiBefore || '-',
        item.kondisiAfter || '-',
        item.checklist || '-',
        item.catatan || '-',
        formatTanggalIndonesia(item.tanggalMasuk),
        formatTanggalIndonesia(item.date)
    ]);

    const tableOptions = applyPdfTableStyle(doc, {
        head: [['No', 'ID', 'Nama', 'Merk', 'SN', 'SN Conv', 'Lokasi', 'Kondisi(B)', 'Kondisi(A)', 'Cek', 'Catatan', 'Tgl Barang Masuk', 'Tgl Input']],
        body: tableData,
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 18 },
            2: { cellWidth: 20, halign: 'left' },
            3: { cellWidth: 18 },
            4: { cellWidth: 22 },
            5: { cellWidth: 20 },
            6: { cellWidth: 22, halign: 'left' },
            7: { cellWidth: 16 },
            8: { cellWidth: 16 },
            9: { cellWidth: 10 },
            10: { cellWidth: 35, halign: 'left' },
            11: { cellWidth: 30 },
            12: { cellWidth: 'auto' }
        }
    });

    doc.autoTable(tableOptions);

    const filterText = filterValue === 'all' ? 'Semua' : filterValue;
    doc.save(`Inventory_${filterText}_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('Berhasil export ke PDF!');
}

// ========================================
// GENERATE QR FOR SELECTED ITEMS
// ========================================
function generateQRForSelected() {
    const selected = Array.from(selectedItems);

    if (selected.length === 0) {
        showToast('Pilih item terlebih dahulu!', true);
        return;
    }

    let successCount = 0;
    let alreadyExistCount = 0;
    let errorCount = 0;

    selected.forEach(id => {
        const item = inventoryData.find(i => i.id === id);
        if (!item) return;

        // CEK DULU: Apakah QR sudah ada?
        if (item.qrCode && item.qrCode.length > 0) {
            // QR sudah ada - jangan generate ulang
            alreadyExistCount++;
            console.log(`QR already exists for item: ${item.id} - ${item.name}`);
            return;
        }

        // QR belum ada - generate baru
        // Konsisten: QR selalu dibuat dari SN (jika ada), kalau tidak dari ID
        const qrValue = item.sn || item.id;

        if (!qrValue) {
            console.log(`Cannot generate QR: no SN or ID for item: ${item.id}`);
            errorCount++;
            return;
        }

        // Generate QR code menggunakan QRCode library
        const qrContainer = document.createElement('div');
        qrContainer.style.display = 'none';
        document.body.appendChild(qrContainer);

        try {
            new QRCode(qrContainer, {
                text: qrValue,
                width: 128,
                height: 128,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            // Tunggu QR code selesai digenerate
            setTimeout(() => {
                const canvas = qrContainer.querySelector('canvas');
                const img = qrContainer.querySelector('img');

                let qrBase64 = '';
                if (canvas) {
                    qrBase64 = canvas.toDataURL('image/png');
                } else if (img) {
                    qrBase64 = img.src;
                }

                if (qrBase64) {
                    // Update local data
                    item.qrCode = qrBase64;
                    item.qrData = qrValue; // Simpan value untuk konsistensi

                    // Save ke database
                    fetch(`/api/inventory/${item.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            qrCode: qrBase64,
                            qrData: qrValue
                        })
                    })
                        .then(res => res.json())
                        .then(result => {
                            if (result.success) {
                                successCount++;
                                console.log(`QR generated successfully for: ${item.id}`);
                            }
                        })
                        .catch(err => {
                            console.error('Error saving QR:', err);
                            errorCount++;
                        });
                }

                // Clean up
                document.body.removeChild(qrContainer);
            }, 100);
        } catch (e) {
            console.error('Error generating QR:', e);
            errorCount++;
            if (qrContainer.parentNode) {
                document.body.removeChild(qrContainer);
            }
        }
    });

    // Tampilkan hasil setelah proses
    setTimeout(() => {
        let message = '';

        if (alreadyExistCount > 0 && successCount === 0) {
            message = `QR Code sudah tersedia untuk ${alreadyExistCount} item!`;
            showToast(message, true);
        } else if (alreadyExistCount > 0 && successCount > 0) {
            message = `${successCount} QR baru digenerate, ${alreadyExistCount} sudah ada!`;
            showToast(message);
        } else if (successCount > 0) {
            message = `${successCount} QR Code berhasil digenerate!`;
            showToast(message);
            updateInventoryTable();
        } else if (errorCount > 0) {
            message = `${errorCount} QR gagal digenerate!`;
            showToast(message, true);
        } else {
            showToast('Tidak ada QR yang perlu digenerate!', true);
        }
    }, 800);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

function showToast(message, typeOrIsError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;

    let isError = false;
    let isWarning = false;

    if (typeof typeOrIsError === 'boolean') {
        isError = typeOrIsError;
    } else if (typeof typeOrIsError === 'string') {
        const type = typeOrIsError.toLowerCase().trim();
        if (type === 'error' || type === 'danger' || type === 'fail') {
            isError = true;
        } else if (type === 'warning' || type === 'warn') {
            isWarning = true;
        } else {
            // 'success', 'info', default
            isError = false;
            isWarning = false;
        }
    }

    toastMessage.textContent = message;
    toast.classList.remove('error', 'warning', 'success');

    const icon = toast.querySelector('i');
    if (isError) {
        toast.classList.add('error');
        if (icon) icon.className = 'fas fa-exclamation-circle';
    } else if (isWarning) {
        toast.classList.add('warning');
        if (icon) icon.className = 'fas fa-exclamation-triangle';
    } else {
        toast.classList.add('success');
        if (icon) icon.className = 'fas fa-check-circle';
    }

    toast.classList.add('show');

    if (window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

// ========================================
// UNIVERSAL MODERN CONFIRM & PROMPT DIALOGS
// ========================================
function showConfirmDialog(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('appConfirmDialogModal');
        if (!modal) {
            resolve(confirm(options.message ? options.message.replace(/<[^>]*>/g, '') : 'Apakah Anda yakin?'));
            return;
        }

        const titleEl = document.getElementById('appConfirmTitle');
        const msgEl = document.getElementById('appConfirmMessage');
        const iconEl = document.getElementById('appConfirmIcon');
        const iconBadge = document.getElementById('appConfirmIconBadge');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');
        const actionBtn = document.getElementById('appConfirmActionBtn');

        const title = options.title || 'Konfirmasi';
        const message = options.message || 'Apakah Anda yakin ingin melanjutkan tindakan ini?';
        const confirmText = options.confirmText || 'Ya, Lanjutkan';
        const cancelText = options.cancelText || 'Batal';
        const isDanger = options.danger !== false;

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.innerHTML = message;
        if (cancelBtn) cancelBtn.textContent = cancelText;
        if (actionBtn) {
            actionBtn.textContent = confirmText;
            if (isDanger) {
                actionBtn.style.background = '#ef4444';
                actionBtn.style.color = '#ffffff';
                if (iconBadge) {
                    iconBadge.style.background = 'rgba(239, 68, 68, 0.12)';
                    iconBadge.style.color = '#ef4444';
                }
                if (iconEl) iconEl.className = options.icon || 'fas fa-trash-alt';
            } else {
                actionBtn.style.background = 'var(--primary)';
                actionBtn.style.color = '#ffffff';
                if (iconBadge) {
                    iconBadge.style.background = 'rgba(37, 99, 235, 0.12)';
                    iconBadge.style.color = 'var(--primary)';
                }
                if (iconEl) iconEl.className = options.icon || 'fas fa-info-circle';
            }
        }

        const cleanup = () => {
            modal.classList.remove('show');
            cancelBtn.removeEventListener('click', onCancel);
            actionBtn.removeEventListener('click', onConfirm);
            modal.removeEventListener('click', onOverlay);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onOverlay = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        };

        cancelBtn.addEventListener('click', onCancel);
        actionBtn.addEventListener('click', onConfirm);
        modal.addEventListener('click', onOverlay);

        modal.classList.add('show');
    });
}
window.showConfirmDialog = showConfirmDialog;

function showPromptDialog(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('appPromptDialogModal');
        if (!modal) {
            resolve(prompt(options.message || 'Input teks:', options.defaultValue || ''));
            return;
        }

        const titleEl = document.getElementById('appPromptTitle');
        const msgEl = document.getElementById('appPromptMessage');
        const inputEl = document.getElementById('appPromptInput');
        const cancelBtn = document.getElementById('appPromptCancelBtn');
        const actionBtn = document.getElementById('appPromptActionBtn');

        if (titleEl) titleEl.textContent = options.title || 'Input Teks';
        if (msgEl) msgEl.textContent = options.message || 'Masukkan keterangan:';
        if (inputEl) {
            inputEl.value = options.defaultValue || '';
            inputEl.placeholder = options.placeholder || 'Ketik di sini...';
        }
        if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Batal';
        if (actionBtn) actionBtn.textContent = options.confirmText || 'Simpan';

        const cleanup = () => {
            modal.classList.remove('show');
            cancelBtn.removeEventListener('click', onCancel);
            actionBtn.removeEventListener('click', onConfirm);
            if (inputEl) inputEl.removeEventListener('keydown', onKeyDown);
            modal.removeEventListener('click', onOverlay);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const onConfirm = () => {
            const val = inputEl ? inputEl.value : '';
            cleanup();
            resolve(val);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };

        cancelBtn.addEventListener('click', onCancel);
        actionBtn.addEventListener('click', onConfirm);
        if (inputEl) inputEl.addEventListener('keydown', onKeyDown);
        modal.addEventListener('click', onOverlay);

        modal.classList.add('show');
        setTimeout(() => inputEl && inputEl.focus(), 120);
    });
}
window.showPromptDialog = showPromptDialog;

// ========================================
// SCAN/CHECK INVENTORY FUNCTIONS
// ========================================
let checkedItems = {};
let html5QrcodeScanner = null;
let scanInitialized = false;

async function initScanPage() {
    if (!inventoryData || inventoryData.length === 0) {
        await loadInventory();
    } else {
        loadCheckedItems();
        renderScanTable();
        updateScanStats();
    }

    if (scanInitialized) {
        const scanInput = document.getElementById('scanInput');
        if (scanInput) scanInput.focus();
        return;
    }
    scanInitialized = true;

    // Set up scan input
    const scanInput = document.getElementById('scanInput');
    const scanBtn = document.getElementById('scanBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const resetBtn = document.getElementById('resetCheckBtn');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const exportExcelBtn = document.getElementById('exportCheckExcelBtn');
    const exportPdfBtn = document.getElementById('exportCheckPdfBtn');

    if (scanBtn) {
        scanBtn.addEventListener('click', performScan);
    }

    if (scanInput) {
        scanInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                performScan();
            }
        });
        scanInput.focus();
    }

    // Camera button
    if (cameraBtn) {
        cameraBtn.addEventListener('click', toggleCamera);
    }

    // Close scanner button
    if (closeScannerBtn) {
        closeScannerBtn.addEventListener('click', stopCamera);
    }

    setupScannerControls();

    // Reset button
    if (resetBtn) {
        let isResetting = false;
        resetBtn.addEventListener('click', async function () {
            if (isResetting) return;
            const confirmReset = await showConfirmDialog({
                title: 'Reset Audit Checklist',
                message: 'Apakah Anda yakin ingin mereset seluruh status checklist fisik aset di database menjadi belum tercentang?',
                confirmText: 'Ya, Reset Semua',
                cancelText: 'Batal',
                danger: true,
                icon: 'fa-history'
            });
            if (!confirmReset) return;
            isResetting = true;
                try {
                    const response = await fetch('/api/inventory/reset-checklist', { method: 'POST' });
                    const data = await response.json();

                    if (data.success) {
                        checkedItems = {};
                        saveCheckedItems();

                        // Update local inventoryData
                        inventoryData.forEach(item => item.checklist = 'Tidak');

                        renderScanTable();
                        updateScanStats();
                        showToast('Semua status checklist telah direset');
                    } else {
                        showToast('Gagal mereset checklist!', true);
                    }
                } catch (error) {
                    console.error('Error resetting checklist:', error);
                    showToast('Terjadi kesalahan saat mereset!', true);
                } finally {
                    isResetting = false;
                }
        });
    }

    // Export buttons
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportChecklistToExcel);
    }
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportChecklistToPdf);
    }

    // Scan filter dropdown
    const scanFilter = document.getElementById('scanFilter');
    if (scanFilter) {
        scanFilter.addEventListener('change', function () {
            scanPage = 1;
            renderScanTable();
            updateScanStats();
        });
    }

    // Scan view limit dropdown
    const scanViewLimit = document.getElementById('scanViewLimit');
    if (scanViewLimit) {
        scanViewLimit.addEventListener('change', function () {
            var newLimit = parseInt(this.value);
            scanItemsPerPage = newLimit;
            scanPage = 1;
            renderScanTable();
        });
    }
}

let availableCameras = [];
let currentCameraIndex = 0;

function preprocessImageFile(file, maxDim = 1200) {
    return new Promise((resolve) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return resolve(file);
        }
        const img = new Image();
        const reader = new FileReader();

        reader.onload = function(e) {
            img.onload = function() {
                try {
                    let { width, height } = img;
                    if (width <= maxDim && height <= maxDim) {
                        return resolve(file);
                    }
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const processedFile = new File([blob], file.name || 'scanned.jpg', {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(processedFile);
                        } else {
                            resolve(file);
                        }
                    }, 'image/jpeg', 0.9);
                } catch (err) {
                    console.warn('Canvas resize error, fallback to raw file:', err);
                    resolve(file);
                }
            };
            img.onerror = function() {
                resolve(file);
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            resolve(file);
        };
        reader.readAsDataURL(file);
    });
}

function setupScannerControls() {
    const cameraSelect = document.getElementById('cameraSelect');
    const switchCameraBtn = document.getElementById('switchCameraBtn');

    // HTTPS notice setup for mobile browsers accessing over HTTP LAN
    const httpsNotice = document.getElementById('httpsCameraNotice');
    const httpsSwitchLink = document.getElementById('httpsSwitchLink');
    if (httpsNotice && httpsSwitchLink) {
        const isHttpLan = window.location.protocol === 'http:' && 
                          window.location.hostname !== 'localhost' && 
                          window.location.hostname !== '127.0.0.1';
        if (isHttpLan) {
            httpsNotice.style.display = 'block';
            httpsSwitchLink.href = `https://${window.location.hostname}:3443/index.html#scan`;
        } else {
            httpsNotice.style.display = 'none';
        }
    }

    if (switchCameraBtn && !switchCameraBtn.dataset.bound) {
        switchCameraBtn.dataset.bound = 'true';
        switchCameraBtn.addEventListener('click', switchCamera);
    }

    if (cameraSelect && !cameraSelect.dataset.bound) {
        cameraSelect.dataset.bound = 'true';
        cameraSelect.addEventListener('change', function() {
            if (this.value) {
                stopCamera().then(() => {
                    startCamera(this.value);
                });
            }
        });
    }
}

function triggerCameraPhotoScan() {
    const camInput = document.getElementById('scanCameraInput') || document.getElementById('scanFileInput');
    if (camInput) {
        camInput.click();
    }
}

function triggerGalleryScan() {
    const galleryInput = document.getElementById('scanGalleryInput');
    if (galleryInput) {
        galleryInput.click();
    }
}

function triggerPhotoScan() {
    triggerCameraPhotoScan();
}

async function handleScanFile(file) {
    if (!file) return;
    showToast('Memproses & membaca barcode dari foto...', false, 2500);

    let scannerInstance = null;
    try {
        if (typeof Html5Qrcode === 'undefined') {
            showToast('Library pemindai belum siap. Silakan muat ulang halaman.', true);
            return;
        }

        scannerInstance = new Html5Qrcode("reader");

        // Multi-pass scanning:
        // Pass 1: Scale to 1200px max (optimal for 1D & 2D barcodes)
        // Pass 2: Scale to 800px max (better for smaller/dense barcodes)
        // Pass 3: Original raw file
        let decodedText = null;
        const passDimensions = [1200, 800, null];

        for (const dim of passDimensions) {
            try {
                const targetFile = dim ? await preprocessImageFile(file, dim) : file;
                decodedText = await scannerInstance.scanFile(targetFile, true);
                if (decodedText) break;
            } catch (errPass) {
                // Try next resolution pass
            }
        }

        if (decodedText) {
            onScanSuccess(decodedText, null);
        } else {
            showToast('Barcode tidak terbaca dari foto. Pastikan foto tegak, fokus, dan tidak silau.', true, 4500);
        }
    } catch (err) {
        console.error("Gagal membaca barcode dari file/foto:", err);
        showToast('Barcode tidak terbaca dari foto. Pastikan gambar jelas & tegak lurus.', true, 4500);
    } finally {
        if (scannerInstance) {
            try { await scannerInstance.clear(); } catch(e) {}
        }
    }
}

async function switchCamera() {
    if (!availableCameras || availableCameras.length < 2) return;
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[currentCameraIndex];
    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) cameraSelect.value = nextCamera.id;
    await stopCamera();
    startCamera(nextCamera.id);
}

function toggleCamera() {
    const scannerContainer = document.getElementById('scannerContainer');
    if (!scannerContainer) return;

    if (scannerContainer.style.display === 'none' || !html5QrcodeScanner) {
        startCamera();
    } else {
        stopCamera();
    }
}

async function startCamera(preferredCameraId = null) {
    if (typeof Html5Qrcode === 'undefined') {
        showToast('Library barcode scanner belum siap. Silakan refresh halaman.', true);
        return;
    }

    const scannerContainer = document.getElementById('scannerContainer');

    if (html5QrcodeScanner) {
        return;
    }

    // Check mediaDevices support
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // In modern browsers, live video camera strictly requires HTTPS on mobile/LAN IP
    if (!hasMediaDevices || (!isSecure && !navigator.mediaDevices)) {
        const httpsNotice = document.getElementById('httpsCameraNotice');
        if (httpsNotice) {
            httpsNotice.style.display = 'block';
            httpsNotice.scrollIntoView({ behavior: 'smooth' });
        }
        showToast('Scan kamera live di HP memerlukan HTTPS. Silakan klik tombol "Buka HTTPS" di atas.', true, 5000);
        return;
    }

    if (scannerContainer) scannerContainer.style.display = 'block';

    try {
        html5QrcodeScanner = new Html5Qrcode("reader");
        const config = { 
            fps: 15, 
            qrbox: function(viewfinderWidth, viewfinderHeight) {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const edge = Math.floor(minEdge * 0.72);
                return { width: Math.max(edge, 180), height: Math.max(edge, 180) };
            },
            aspectRatio: 1.0
        };

        // Try enumerating cameras
        try {
            availableCameras = await Html5Qrcode.getCameras();
        } catch (e) {
            console.warn('Enumerate cameras failed:', e);
            availableCameras = [];
        }

        const cameraSelect = document.getElementById('cameraSelect');
        const switchCameraBtn = document.getElementById('switchCameraBtn');

        if (availableCameras && availableCameras.length > 0) {
            if (cameraSelect) {
                cameraSelect.innerHTML = availableCameras.map((c, i) => 
                    `<option value="${c.id}">${c.label || ('Kamera ' + (i + 1))}</option>`
                ).join('');
                if (availableCameras.length > 1) {
                    cameraSelect.style.display = 'inline-block';
                    if (switchCameraBtn) switchCameraBtn.style.display = 'inline-block';
                }
            }

            let targetCameraId = preferredCameraId;
            if (!targetCameraId) {
                const backCam = availableCameras.find(c => /back|rear|environment|belakang/i.test(c.label));
                targetCameraId = backCam ? backCam.id : availableCameras[0].id;
            }

            currentCameraIndex = availableCameras.findIndex(c => c.id === targetCameraId);
            if (currentCameraIndex === -1) currentCameraIndex = 0;
            if (cameraSelect) cameraSelect.value = targetCameraId;

            await html5QrcodeScanner.start(targetCameraId, config, onScanSuccess, onScanFailure);
        } else {
            // No camera list returned yet, attempt direct start with environment fallback
            try {
                await html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
            } catch (errEnv) {
                console.warn("FacingMode environment failed, trying user camera:", errEnv);
                await html5QrcodeScanner.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure);
            }
        }
        showToast('Kamera aktif! Arahkan ke barcode / QR code.');
    } catch (err) {
        console.error("Error starting camera:", err);
        if (html5QrcodeScanner) {
            try { await html5QrcodeScanner.stop(); } catch(e) {}
            try { await html5QrcodeScanner.clear(); } catch(e) {}
            html5QrcodeScanner = null;
        }
        showToast('Kamera tidak terdeteksi atau izin akses ditolak. Pastikan izin kamera aktif.', true, 4500);
    }
}

async function stopCamera() {
    const scannerContainer = document.getElementById('scannerContainer');

    if (html5QrcodeScanner) {
        try {
            await html5QrcodeScanner.stop();
        } catch (err) {
            console.error("Error stopping camera:", err);
        }
        try {
            await html5QrcodeScanner.clear();
        } catch (err) {
            console.error("Error clearing camera element:", err);
        }
        html5QrcodeScanner = null;
    }

    if (scannerContainer) {
        scannerContainer.style.display = 'none';
    }
}

function onScanSuccess(decodedText, decodedResult) {
    const scanInput = document.getElementById('scanInput');

    let searchId = String(decodedText).trim();
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && typeof parsed === 'object') {
            searchId = parsed.id || parsed.sn || decodedText;
        }
    } catch (e) {
        if (searchId.includes('|')) {
            const parts = searchId.split('|').map(s => s.trim()).filter(Boolean);
            searchId = parts[0] || searchId;
        }
    }

    if (scanInput) {
        scanInput.value = searchId;
    }
    performScan();
    stopCamera();
}

function onScanFailure(error) {
    // Continuous scanning, ignore normal per-frame scan misses
}

async function performScan() {
    const scanInput = document.getElementById('scanInput');
    const searchValue = (scanInput.value || '').trim();

    if (!searchValue) {
        showToast('Mohon masukkan ID atau barcode', true);
        return;
    }

    try {
        const response = await fetch('/api/inventory/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchValue })
        });

        const data = await response.json();

        if (data.success) {
            const item = data.item;
            const alreadyChecked = data.status === 'already_checked';

            // Sync local inventoryData
            const localIdx = inventoryData.findIndex(i => i.id === item.id);
            if (localIdx !== -1) {
                inventoryData[localIdx].checklist = 'Ya';
            } else {
                await loadInventory();
            }

            // Update local checkedItems for immediate UI updates
            checkedItems[item.id] = {
                checked: true,
                checkTime: item.checkTime || new Date().toISOString()
            };

            saveCheckedItems();
            renderScanTable();
            updateScanStats();

            // Clear input FIRST to prevent double trigger
            scanInput.value = '';
            scanInput.focus();

            // Show scan result popup
            showScanResultPopup(item, alreadyChecked);
        } else {
            showToast(data.status === 'not_found' ? 'Barang tidak ditemukan!' : (data.message || 'Error checking item'), true);
        }
    } catch (error) {
        console.error('Error in performScan:', error);
        showToast(`Gagal: ${error.message || 'Koneksi bermasalah'}`, true);
    }
}

let currentScannedItem = null;

function showScanResultPopup(item, isDuplicate) {
    currentScannedItem = item;
    const modal = document.getElementById('scanResultModal');
    if (!modal) return;

    const statusBadge = document.getElementById('scanStatusBadge');
    const headerSubtitle = document.getElementById('scanHeaderSubtitle');
    const uncheckBtn = document.getElementById('scanUncheckBtn');

    if (isDuplicate) {
        modal.classList.remove('scan-result-modal-new');
        modal.classList.add('scan-result-modal-duplicate');
        if (statusBadge) {
            statusBadge.className = 'audit-status-chip warning';
            statusBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sudah Dicek Sebelumnya';
        }
        if (headerSubtitle) {
            headerSubtitle.textContent = 'Peringatan: Item ini sudah terverifikasi';
        }
    } else {
        modal.classList.remove('scan-result-modal-duplicate');
        modal.classList.add('scan-result-modal-new');
        if (statusBadge) {
            statusBadge.className = 'audit-status-chip success';
            statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Berhasil Dicek';
        }
        if (headerSubtitle) {
            headerSubtitle.textContent = 'Audit Fisik Lapangan Terverifikasi';
        }
    }

    // Hero Avatar icon
    const avatarEl = document.getElementById('scanHeroAvatar');
    if (avatarEl) {
        const cat = (item.name || '').toLowerCase();
        let icon = 'fa-box';
        let bg = 'linear-gradient(135deg, #2563eb, #1e3a8a)';
        if (cat.includes('laptop')) { icon = 'fa-laptop'; bg = 'linear-gradient(135deg, #3b82f6, #1d4ed8)'; }
        else if (cat.includes('pc') || cat.includes('komputer')) { icon = 'fa-desktop'; bg = 'linear-gradient(135deg, #06b6d4, #0891b2)'; }
        else if (cat.includes('monitor')) { icon = 'fa-tv'; bg = 'linear-gradient(135deg, #10b981, #047857)'; }
        else if (cat.includes('headset')) { icon = 'fa-headphones'; bg = 'linear-gradient(135deg, #a855f7, #7e22ce)'; }
        else if (cat.includes('keyboard')) { icon = 'fa-keyboard'; bg = 'linear-gradient(135deg, #6366f1, #4338ca)'; }
        else if (cat.includes('mouse')) { icon = 'fa-mouse'; bg = 'linear-gradient(135deg, #f97316, #c2410c)'; }
        else if (cat.includes('printer')) { icon = 'fa-print'; bg = 'linear-gradient(135deg, #14b8a6, #0f766e)'; }
        else if (cat.includes('ac')) { icon = 'fa-snowflake'; bg = 'linear-gradient(135deg, #38bdf8, #0284c7)'; }
        else if (cat.includes('switch') || cat.includes('router')) { icon = 'fa-network-wired'; bg = 'linear-gradient(135deg, #64748b, #334155)'; }
        avatarEl.style.background = bg;
        avatarEl.innerHTML = `<i class="fas ${icon}"></i>`;
    }

    // Hero Data
    const nameEl = document.getElementById('scanHeroName');
    const idEl = document.getElementById('scanHeroId');
    const snEl = document.getElementById('scanHeroSn');
    const locTextEl = document.getElementById('scanHeroLocText');

    if (nameEl) nameEl.textContent = `${item.name || 'Barang'} ${item.merk ? '(' + item.merk + ')' : ''}`;
    if (idEl) idEl.textContent = item.id || '-';
    if (snEl) snEl.textContent = item.sn || '-';
    if (locTextEl) locTextEl.textContent = item.lokasi || 'Belum di-assign';

    // 2-Column Info
    const catEl = document.getElementById('scanSpecCategory');
    const merkEl = document.getElementById('scanSpecMerk');
    const snConvEl = document.getElementById('scanSpecSnConv');
    const checklistEl = document.getElementById('scanAuditChecklist');
    const statusTagEl = document.getElementById('scanAuditStatusTag');
    const timeEl = document.getElementById('scanAuditTime');

    if (catEl) catEl.textContent = item.name || '-';
    if (merkEl) merkEl.textContent = item.merk || '-';
    if (snConvEl) snConvEl.textContent = item.snConverter || '-';

    const isChecked = item.checklist === 'Ya';
    if (checklistEl) {
        checklistEl.innerHTML = isChecked
            ? '<span class="badge-status-pill verified"><i class="fas fa-check"></i> Sudah</span>'
            : '<span class="badge-status-pill unverified"><i class="fas fa-times"></i> Belum</span>';
    }

    if (statusTagEl) {
        statusTagEl.innerHTML = isDuplicate
            ? '<span class="badge-status-pill already"><i class="fas fa-history"></i> Sudah Pernah</span>'
            : '<span class="badge-status-pill first-time"><i class="fas fa-star"></i> Pertama Kali</span>';
    }

    const checkTime = item.checkTime || new Date().toISOString();
    if (timeEl) timeEl.textContent = formatDateTime(checkTime);

    // Condition Selection State
    const currentKondisi = item.kondisiAfter || item.kondisiBefore || 'Baik';
    selectAuditCondition(currentKondisi, false);

    // Uncheck button state
    if (uncheckBtn) {
        if (isChecked) {
            uncheckBtn.style.display = 'inline-flex';
            uncheckBtn.innerHTML = '<i class="fas fa-undo"></i> <span>Batalkan Cek (Uncheck)</span>';
            uncheckBtn.className = 'btn-audit-uncheck';
        } else {
            uncheckBtn.style.display = 'inline-flex';
            uncheckBtn.innerHTML = '<i class="fas fa-check"></i> <span>Tandai Sudah Dicek</span>';
            uncheckBtn.className = 'btn-audit-next';
        }
    }

    openModal('scanResultModal');
}

function copyCurrentScanSn() {
    if (!currentScannedItem || !currentScannedItem.sn) {
        showToast('Nomor seri tidak tersedia', 'warning');
        return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentScannedItem.sn).then(() => {
            showToast(`Serial Number "${currentScannedItem.sn}" berhasil disalin!`, 'success');
        }).catch(() => {
            showToast(currentScannedItem.sn, 'info');
        });
    } else {
        showToast(currentScannedItem.sn, 'info');
    }
}
window.copyCurrentScanSn = copyCurrentScanSn;

async function selectAuditCondition(kondisi, persist = true) {
    const hiddenInput = document.getElementById('scanSelectedCondition');
    if (hiddenInput) hiddenInput.value = kondisi;

    // Update chips visual state
    const chipsContainer = document.getElementById('scanConditionChips');
    if (chipsContainer) {
        const buttons = chipsContainer.querySelectorAll('.cond-chip');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.trim().toLowerCase().includes(kondisi.toLowerCase())) {
                btn.classList.add('active');
            }
        });
    }

    if (!persist || !currentScannedItem || !currentScannedItem.id) return;

    try {
        const res = await fetch('/api/inventory/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchValue: currentScannedItem.id, kondisi: kondisi })
        });
        const data = await res.json();
        if (data.success) {
            currentScannedItem.kondisiAfter = kondisi;
            const idx = inventoryData.findIndex(i => i.id === currentScannedItem.id);
            if (idx !== -1) inventoryData[idx].kondisiAfter = kondisi;
            renderScanTable();
            showToast(`Kondisi fisik diperbarui menjadi "${kondisi}"`, 'success');
        }
    } catch (err) {
        console.error('Error updating audit condition:', err);
    }
}
window.selectAuditCondition = selectAuditCondition;

async function toggleCurrentScanChecklist(forceStatus = null) {
    if (!currentScannedItem || !currentScannedItem.id) return;

    try {
        const target = forceStatus !== null ? forceStatus : (currentScannedItem.checklist === 'Ya' ? 'Tidak' : 'Ya');
        const res = await fetch('/api/inventory/toggle-checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentScannedItem.id, status: target })
        });
        const data = await res.json();
        if (data.success) {
            currentScannedItem.checklist = data.checklist;
            currentScannedItem.checkTime = data.item.checkTime;

            const idx = inventoryData.findIndex(i => i.id === currentScannedItem.id);
            if (idx !== -1) {
                inventoryData[idx].checklist = data.checklist;
                inventoryData[idx].checkTime = data.item.checkTime;
            }

            if (data.checklist === 'Ya') {
                checkedItems[currentScannedItem.id] = { checked: true, checkTime: data.item.checkTime };
                showToast(`Item ${currentScannedItem.id} ditandai Sudah Dicek`, 'success');
            } else {
                delete checkedItems[currentScannedItem.id];
                showToast(`Checklist item ${currentScannedItem.id} dibatalkan (Belum Dicek)`, 'info');
            }

            renderScanTable();
            updateScanStats();
            showScanResultPopup(currentScannedItem, false);
        } else {
            showToast(data.message || 'Gagal mengubah status', true);
        }
    } catch (err) {
        console.error('Error toggle checklist in modal:', err);
        showToast('Koneksi bermasalah', true);
    }
}
window.toggleCurrentScanChecklist = toggleCurrentScanChecklist;

function continueNextScan() {
    closeModal('scanResultModal');
    setTimeout(() => {
        const scanInput = document.getElementById('scanInput');
        if (scanInput) {
            scanInput.value = '';
            scanInput.focus();
        }
    }, 150);
}
window.continueNextScan = continueNextScan;

async function toggleItemAuditCheck(id, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!id) return;

    try {
        const res = await fetch('/api/inventory/toggle-checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            const idx = inventoryData.findIndex(i => i.id === id);
            if (idx !== -1) {
                inventoryData[idx].checklist = data.checklist;
                inventoryData[idx].checkTime = data.item.checkTime;
            }

            if (data.checklist === 'Ya') {
                checkedItems[id] = { checked: true, checkTime: data.item.checkTime };
                showToast(`"${id}" ditandai Sudah Dicek`, 'success');
            } else {
                delete checkedItems[id];
                showToast(`"${id}" dibatalkan (Belum Dicek)`, 'info');
            }

            renderScanTable();
            updateScanStats();
        } else {
            showToast(data.message || 'Gagal mengubah status', true);
        }
    } catch (err) {
        console.error('Error toggling audit item:', err);
        showToast('Terjadi kesalahan', true);
    }
}
window.toggleItemAuditCheck = toggleItemAuditCheck;

// SCAN PAGINATION
let scanPage = 1;
let scanItemsPerPage = 10;

function updateScanTable() {
    scanPage = 1;
    renderScanTable();
    updateScanStats();
}
window.updateScanTable = updateScanTable;

function changeScanPage(direction) {
    const filterSelect = document.getElementById('scanFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';
    const limitSelect = document.getElementById('scanViewLimit');
    scanItemsPerPage = limitSelect ? (parseInt(limitSelect.value) || 10) : 10;

    let filtered = inventoryData;
    if (filterValue !== 'all') {
        filtered = inventoryData.filter(item => item.name === filterValue);
    }

    const totalPages = Math.ceil(filtered.length / scanItemsPerPage);
    scanPage += direction;

    if (scanPage < 1) scanPage = 1;
    if (scanPage > totalPages) scanPage = totalPages;

    renderScanTable();
}

function goToScanPage(page) {
    scanPage = page;
    renderScanTable();
}

function renderScanTable() {
    const tableBody = document.getElementById('scanTableBody');
    if (!tableBody) return;

    const filterSelect = document.getElementById('scanFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    const statusSelect = document.getElementById('scanStatusFilter');
    const statusValue = statusSelect ? statusSelect.value : 'all';

    const limitSelect = document.getElementById('scanViewLimit');
    scanItemsPerPage = limitSelect ? (parseInt(limitSelect.value) || 10) : 10;

    let filteredData = inventoryData;

    // Filter Kategori
    if (filterValue !== 'all') {
        filteredData = filteredData.filter(item => item.name === filterValue);
    }

    // Filter Status Cek Fisik
    if (statusValue === 'checked') {
        filteredData = filteredData.filter(item => checkedItems[item.id] && checkedItems[item.id].checked);
    } else if (statusValue === 'unchecked') {
        filteredData = filteredData.filter(item => !checkedItems[item.id] || !checkedItems[item.id].checked);
    }

    if (sortState['scanTable'] && sortState['scanTable'].key) {
        filteredData = filteredData.map(item => {
            const isChecked = checkedItems[item.id] && checkedItems[item.id].checked;
            const checkTime = isChecked ? checkedItems[item.id].checkTime : null;
            return {
                ...item,
                status: isChecked ? 1 : 0,
                checkTime: checkTime || ''
            };
        });
        filteredData = sortData(filteredData, sortState['scanTable'].key, sortState['scanTable'].dir);
    }

    const totalItems = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / scanItemsPerPage));

    if (scanPage > totalPages) scanPage = totalPages;
    if (scanPage < 1) scanPage = 1;

    const startIndex = (scanPage - 1) * scanItemsPerPage;
    const endIndex = Math.min(startIndex + scanItemsPerPage, totalItems);
    const paginatedData = totalItems > 0 ? filteredData.slice(startIndex, endIndex) : [];

    const pagination = document.getElementById('scanPagination');
    const showingStart = document.getElementById('scanShowingStart');
    const showingEnd = document.getElementById('scanShowingEnd');
    const totalData = document.getElementById('scanTotalData');
    const prevBtn = document.getElementById('scanPrevBtn');
    const nextBtn = document.getElementById('scanNextBtn');
    const pageNumbers = document.getElementById('scanPageNumbers');

    if (totalItems === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data inventaris</td></tr>';
        if (pagination) pagination.style.display = 'none';
        return;
    }

    if (pagination) pagination.style.display = 'flex';

    tableBody.innerHTML = paginatedData.map(item => {
        const isChecked = checkedItems[item.id] && checkedItems[item.id].checked;
        const checkTime = isChecked ? checkedItems[item.id].checkTime : null;
        const rowClass = isChecked ? 'scan-item-checked' : '';
        const statusBadge = isChecked
            ? `<button type="button" class="status-badge checked interactive-toggle" onclick="toggleItemAuditCheck('${item.id}', event)" title="Klik untuk membatalkan checklist (Uncheck)">
                <i class="fas fa-check-circle"></i> Sudah Dicek
               </button>`
            : `<button type="button" class="status-badge unchecked interactive-toggle" onclick="toggleItemAuditCheck('${item.id}', event)" title="Klik untuk tandai sudah dicek">
                <i class="far fa-circle"></i> Belum Dicek
               </button>`;

        return `
            <tr class="${rowClass}" data-id="${item.id}">
                <td>${statusBadge}</td>
                <td><span class="barcode-display">${item.id || '-'}</span></td>
                <td>${getCategoryBadgeHtml(item.name)}</td>
                <td>${item.merk || '-'}</td>
                <td><span class="barcode-display">${item.sn || '-'}</span></td>
                <td>${item.lokasi || '-'}</td>
                <td>${checkTime ? formatDateTime(checkTime) : '-'}</td>
            </tr>
        `;
    }).join('');

    if (showingStart) showingStart.textContent = totalItems > 0 ? startIndex + 1 : 0;
    if (showingEnd) showingEnd.textContent = endIndex;
    if (totalData) totalData.textContent = totalItems;

    if (prevBtn) prevBtn.disabled = scanPage === 1;
    if (nextBtn) nextBtn.disabled = scanPage >= totalPages;

    if (pageNumbers) {
        let html = '';
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= scanPage - 1 && i <= scanPage + 1)) {
                html += `<button class="page-number ${i === scanPage ? 'active' : ''}" onclick="goToScanPage(${i})">${i}</button>`;
            } else if (i === scanPage - 2 || i === scanPage + 2) {
                html += `<span class="ellipsis">...</span>`;
            }
        }
        pageNumbers.innerHTML = html;
    }
}

function updateScanStats() {
    // Get filter value
    const filterSelect = document.getElementById('scanFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';

    // Filter inventory data for stats
    let filteredData = inventoryData;
    if (filterValue !== 'all') {
        filteredData = inventoryData.filter(item => item.name === filterValue);
    }

    if (sortState['scanTable'] && sortState['scanTable'].key) {
        filteredData = filteredData.map(item => {
            const isChecked = checkedItems[item.id] && checkedItems[item.id].checked;
            const checkTime = isChecked ? checkedItems[item.id].checkTime : null;
            return {
                ...item,
                status: isChecked ? 1 : 0,
                checkTime: checkTime || ''
            };
        });
        filteredData = sortData(filteredData, sortState['scanTable'].key, sortState['scanTable'].dir);
    }

    const total = filteredData.length;
    let checked = 0;

    filteredData.forEach(item => {
        if (checkedItems[item.id] && checkedItems[item.id].checked) {
            checked++;
        }
    });

    const unchecked = total - checked;

    const elTotal = document.getElementById('totalToCheck');
    const elChecked = document.getElementById('totalChecked');
    const elUnchecked = document.getElementById('totalUnchecked');

    if (elTotal) elTotal.textContent = total;
    if (elChecked) elChecked.textContent = checked;
    if (elUnchecked) elUnchecked.textContent = unchecked;

    // Highlight aktif pada kartu counter berdasarkan pilihan filter status
    const statusSelect = document.getElementById('scanStatusFilter');
    const statusVal = statusSelect ? statusSelect.value : 'all';

    const cardAll = document.getElementById('cardFilterAll');
    const cardChecked = document.getElementById('cardFilterChecked');
    const cardUnchecked = document.getElementById('cardFilterUnchecked');

    if (cardAll) cardAll.classList.toggle('active-filter', statusVal === 'all');
    if (cardChecked) cardChecked.classList.toggle('active-filter', statusVal === 'checked');
    if (cardUnchecked) cardUnchecked.classList.toggle('active-filter', statusVal === 'unchecked');
}

function setScanStatusFilter(status) {
    const statusSelect = document.getElementById('scanStatusFilter');
    if (statusSelect) {
        statusSelect.value = status;
        scanPage = 1;
        updateScanTable();
    }
}
window.setScanStatusFilter = setScanStatusFilter;

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function loadCheckedItems() {
    // RESET checkedItems and populate from current inventoryData
    // This ensures data is synchronized from the database
    checkedItems = {};
    inventoryData.forEach(item => {
        if (item.checklist === 'Ya') {
            checkedItems[item.id] = {
                checked: true,
                checkTime: item.checkTime || null
            };
        }
    });
    console.log('[SYNC] Checked items loaded from server data:', Object.keys(checkedItems).length);
}

function saveCheckedItems() {
    // No-op: Data is now stored in the database
    // We no longer use localStorage to ensure multi-device sync
}

// Export checklist to Excel
async function exportChecklistToExcel() {
    if (inventoryData.length === 0) {
        showToast('Tidak ada data untuk diexport!', true);
        return;
    }

    // Get filter values
    const filterSelect = document.getElementById('scanFilter');
    const filterValue = filterSelect ? filterSelect.value : 'all';
    const statusSelect = document.getElementById('scanStatusFilter');
    const statusValue = statusSelect ? statusSelect.value : 'all';

    // Filter inventory data
    let filteredData = inventoryData;
    if (filterValue !== 'all') {
        filteredData = inventoryData.filter(item => item.name === filterValue);
    }
    if (statusValue === 'checked') {
        filteredData = filteredData.filter(item => checkedItems[item.id] && checkedItems[item.id].checked);
    } else if (statusValue === 'unchecked') {
        filteredData = filteredData.filter(item => !checkedItems[item.id] || !checkedItems[item.id].checked);
    }

    if (sortState['scanTable'] && sortState['scanTable'].key) {
        filteredData = filteredData.map(item => {
            const isChecked = checkedItems[item.id] && checkedItems[item.id].checked;
            const checkTime = isChecked ? checkedItems[item.id].checkTime : null;
            return {
                ...item,
                status: isChecked ? 1 : 0,
                checkTime: checkTime || ''
            };
        });
        filteredData = sortData(filteredData, sortState['scanTable'].key, sortState['scanTable'].dir);
    }

    if (filteredData.length === 0) {
        showToast('Tidak ada data untuk diexport!', true);
        return;
    }

    showToast('Sedang menyiapkan file Excel...');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cek Inventaris');

    // Add headers
    const headers = ['Status', 'ID', 'QR Code', 'Nama Barang', 'Merk', 'SN', 'SN Converter', 'Lokasi', 'Kondisi (Before)', 'Kondisi (After)', 'Checklist', 'Waktu Cek'];
    const headerRow = worksheet.addRow(headers);

    // Style header
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF037A89' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Set column widths
    worksheet.columns = [
        { width: 15 }, // Status
        { width: 12 }, // ID
        { width: 15 }, // QR Code
        { width: 20 }, // Nama Barang
        { width: 15 }, // Merk
        { width: 20 }, // SN
        { width: 20 }, // SN Converter
        { width: 20 }, // Lokasi
        { width: 18 }, // Kondisi (Before)
        { width: 18 }, // Kondisi (After)
        { width: 12 }, // Checklist
        { width: 20 }  // Waktu Cek
    ];

    // Add data
    for (let i = 0; i < filteredData.length; i++) {
        const item = filteredData[i];
        const rowIndex = i + 2;
        const isChecked = checkedItems[item.id] && checkedItems[item.id].checked;
        const checkTime = isChecked ? checkedItems[item.id].checkTime : null;

        const rowData = [
            isChecked ? 'Sudah Dicek' : 'Belum Dicek',
            item.id,
            '', // QR Code placeholder
            item.name,
            item.merk,
            item.sn,
            item.snConverter || '',
            item.lokasi,
            item.kondisiBefore,
            item.kondisiAfter,
            item.checklist,
            checkTime ? formatDateTime(checkTime) : '-'
        ];

        const row = worksheet.addRow(rowData);
        row.height = 80;
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'Sudah Dicek') {
                cell.font = { color: { argb: 'FF28A745' }, bold: true };
            } else if (cell.value === 'Belum Dicek') {
                cell.font = { color: { argb: 'FFDC3545' }, bold: true };
            }
        });

        // Add QR code image
        if (item.qrCode) {
            try {
                let base64Image;
                if (item.qrCode.startsWith('data:image')) {
                    base64Image = item.qrCode;
                } else {
                    const response = await fetch(item.qrCode);
                    const blob = await response.blob();
                    base64Image = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }

                const imageId = workbook.addImage({
                    base64: base64Image,
                    extension: 'png',
                });

                worksheet.addImage(imageId, {
                    tl: { col: 2, row: rowIndex - 1 },
                    ext: { width: 100, height: 100 },
                    editAs: 'oneCell'
                });
            } catch (error) {
                console.error('Error adding image to Excel:', error);
            }
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Cek_Inventaris_${formatDate(new Date())}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    showToast('Berhasil export checklist ke Excel!');
}

// Export checklist to PDF
function exportChecklistToPdf() {
    try {
        if (!inventoryData || inventoryData.length === 0) {
            showToast('Tidak ada data untuk diexport!', true);
            return;
        }

        var filterSelect = document.getElementById('scanFilter');
        var filterValue = filterSelect ? filterSelect.value : 'all';
        var statusSelect = document.getElementById('scanStatusFilter');
        var statusValue = statusSelect ? statusSelect.value : 'all';

        var filteredData = [];
        for (var i = 0; i < inventoryData.length; i++) {
            var item = inventoryData[i];
            if (!item) continue;
            if (filterValue !== 'all' && item.name !== filterValue) continue;
            var isItemChecked = checkedItems[item.id] && checkedItems[item.id].checked;
            if (statusValue === 'checked' && !isItemChecked) continue;
            if (statusValue === 'unchecked' && isItemChecked) continue;
            filteredData.push(item);
        }

        if (filteredData.length === 0) {
            showToast('Tidak ada data untuk diexport!', true);
            return;
        }

        var result = createPdfDoc('LAPORAN CEK INVENTARIS', 'landscape');
        var doc = result.doc;

        var tableData = filteredData.map(item => {
            var isChecked = checkedItems && checkedItems[item.id] && checkedItems[item.id].checked;
            var checkTime = isChecked && checkedItems[item.id].checkTime ? checkedItems[item.id].checkTime : null;
            return [
                item.id || '-',
                item.name || '-',
                item.merk || '-',
                item.sn || '-',
                item.snConverter || '-',
                item.lokasi || '-',
                item.kondisiBefore || '-',
                item.kondisiAfter || '-',
                item.checklist || '-',
                checkTime ? formatDateTime(checkTime) : '-',
                isChecked ? '✓' : '✗'
            ];
        });

        var tableOptions = applyPdfTableStyle(doc, {
            head: [['ID', 'Nama', 'Merk', 'SN', 'SN Conv', 'Lokasi', 'Kondisi(B)', 'Kondisi(A)', 'Checklist', 'Waktu Cek', 'Status']],
            body: tableData,
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 30, halign: 'left' },
                2: { cellWidth: 20 },
                3: { cellWidth: 30 },
                4: { cellWidth: 25 },
                5: { cellWidth: 30, halign: 'left' },
                6: { cellWidth: 20 },
                7: { cellWidth: 20 },
                8: { cellWidth: 15 },
                9: { cellWidth: 30 },
                10: { cellWidth: 'auto', halign: 'center' }
            }
        });

        doc.autoTable(tableOptions);

        doc.save('Cek_Inventaris_' + formatDate(new Date()) + '.pdf');
        showToast('Berhasil export PDF!');

    } catch (e) {
        console.error('Export PDF Error:', e);
        showToast('Gagal export PDF: ' + e.message, true);
    }
}

// ========================================
// HISTORY FUNCTIONS
// ========================================
let historyData = [];

async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        historyData = await response.json();
        renderHistoryTable();
    } catch (error) {
        console.error('Error loading history:', error);
        showToast('Gagal memuat data history!', true);
    }
}

// HISTORY PAGINATION
let historyPage = 1;
let historyItemsPerPage = 10;

function changeHistoryPage(direction) {
    const limitSelect = document.getElementById('historyViewLimit');
    historyItemsPerPage = parseInt(limitSelect.value);

    const search = document.getElementById('historySearchInput') ? document.getElementById('historySearchInput').value.toLowerCase() : '';
    const actionFilter = document.getElementById('historyActionFilter') ? document.getElementById('historyActionFilter').value : 'all';
    const itemFilter = document.getElementById('historyItemFilter') ? document.getElementById('historyItemFilter').value : 'all';

    let filtered = historyData.filter(h => {
        if (actionFilter !== 'all' && h.action !== actionFilter) return false;
        if (itemFilter !== 'all' && (!h.itemName || h.itemName.toLowerCase() !== itemFilter.toLowerCase())) return false;
        if (search) {
            const matchesSearch =
                (h.itemId && h.itemId.toLowerCase().includes(search)) ||
                (h.itemName && h.itemName.toLowerCase().includes(search)) ||
                (h.itemMerk && h.itemMerk.toLowerCase().includes(search)) ||
                (h.itemSn && h.itemSn.toLowerCase().includes(search)) ||
                (h.itemLokasi && h.itemLokasi.toLowerCase().includes(search)) ||
                (h.details && h.details.toLowerCase().includes(search));
            if (!matchesSearch) return false;
        }
        return true;
    });

    if (sortState['historyTable'] && sortState['historyTable'].key) {
        filtered = sortData(filtered, sortState['historyTable'].key, sortState['historyTable'].dir);
    }

    const totalPages = Math.ceil(filtered.length / historyItemsPerPage);
    historyPage += direction;

    if (historyPage < 1) historyPage = 1;
    if (historyPage > totalPages) historyPage = totalPages;

    renderHistoryTable();
}

function goToHistoryPage(page) {
    historyPage = page;
    renderHistoryTable();
}

function renderHistoryTable() {
    const tableBody = document.getElementById('historyTableBody');
    const emptyState = document.getElementById('historyEmptyState');
    if (!tableBody) return;

    const selectAllCheckbox = document.getElementById('selectAllHistoryCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    const search = document.getElementById('historySearchInput') ? document.getElementById('historySearchInput').value.toLowerCase() : '';
    const actionFilter = document.getElementById('historyActionFilter') ? document.getElementById('historyActionFilter').value : 'all';
    const itemFilter = document.getElementById('historyItemFilter') ? document.getElementById('historyItemFilter').value : 'all';
    const limitSelect = document.getElementById('historyViewLimit');
    historyItemsPerPage = parseInt(limitSelect.value);

    let filtered = historyData.filter(h => {
        if (actionFilter !== 'all' && h.action !== actionFilter) return false;
        if (itemFilter !== 'all' && (!h.itemName || h.itemName.toLowerCase() !== itemFilter.toLowerCase())) return false;
        if (search) {
            const matchesSearch =
                (h.itemId && h.itemId.toLowerCase().includes(search)) ||
                (h.itemName && h.itemName.toLowerCase().includes(search)) ||
                (h.itemMerk && h.itemMerk.toLowerCase().includes(search)) ||
                (h.itemSn && h.itemSn.toLowerCase().includes(search)) ||
                (h.itemLokasi && h.itemLokasi.toLowerCase().includes(search)) ||
                (h.details && h.details.toLowerCase().includes(search));
            if (!matchesSearch) return false;
        }
        return true;
    });

    if (sortState['historyTable'] && sortState['historyTable'].key) {
        filtered = sortData(filtered, sortState['historyTable'].key, sortState['historyTable'].dir);
    }

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / historyItemsPerPage));

    if (historyPage > totalPages) historyPage = totalPages;
    if (historyPage < 1) historyPage = 1;

    const startIndex = (historyPage - 1) * historyItemsPerPage;
    const endIndex = Math.min(startIndex + historyItemsPerPage, totalItems);
    const paginatedData = totalItems > 0 ? filtered.slice(startIndex, endIndex) : [];

    const pagination = document.getElementById('historyPagination');
    const showingStart = document.getElementById('historyShowingStart');
    const showingEnd = document.getElementById('historyShowingEnd');
    const totalData = document.getElementById('historyTotalData');
    const prevBtn = document.getElementById('historyPrevBtn');
    const nextBtn = document.getElementById('historyNextBtn');
    const pageNumbers = document.getElementById('historyPageNumbers');

    if (totalItems === 0) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (pagination) pagination.style.display = 'none';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (pagination) pagination.style.display = 'flex';

        tableBody.innerHTML = paginatedData.map(h => {
            const actionClass = h.action.toLowerCase();
            const actionLabel = h.action === 'CREATE' ? 'Input' : h.action === 'UPDATE' ? 'Update' : 'Delete';
            return `
                <tr>
                    <td><input type="checkbox" class="history-row-checkbox" value="${h.id}" ${selectedHistoryItems.has(h.id) ? 'checked' : ''} onchange="toggleHistorySelection('${h.id}')"></td>
                    <td><span class="history-action-badge ${actionClass}">${actionLabel}</span></td>
                    <td>${h.itemId || '-'}</td>
                    <td>${h.itemName || '-'}</td>
                    <td>${h.itemMerk || '-'}</td>
                    <td>${h.itemSn || '-'}</td>
                    <td>${h.itemLokasi || '-'}</td>
                    <td>${h.details || '-'}</td>
                    <td>${h.timestamp ? formatDateTime(h.timestamp) : '-'}</td>
                </tr>
            `;
        }).join('');

        if (showingStart) showingStart.textContent = totalItems > 0 ? startIndex + 1 : 0;
        if (showingEnd) showingEnd.textContent = endIndex;
        if (totalData) totalData.textContent = totalItems;

        if (prevBtn) prevBtn.disabled = historyPage === 1;
        if (nextBtn) nextBtn.disabled = historyPage >= totalPages;

        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= historyPage - 1 && i <= historyPage + 1)) {
                    html += `<button class="page-number ${i === historyPage ? 'active' : ''}" onclick="goToHistoryPage(${i})">${i}</button>`;
                } else if (i === historyPage - 2 || i === historyPage + 2) {
                    html += `<span class="ellipsis">...</span>`;
                }
            }
            pageNumbers.innerHTML = html;
        }
    }
}

function toggleHistorySelection(id) {
    if (selectedHistoryItems.has(id)) {
        selectedHistoryItems.delete(id);
    } else {
        selectedHistoryItems.add(id);
    }
    updateHistorySelectedCount();
}

function toggleSelectAllHistory() {
    const selectAllCheckbox = document.getElementById('selectAllHistoryCheckbox');
    const checkboxes = document.querySelectorAll('.history-row-checkbox');

    if (selectAllCheckbox.checked) {
        const search = document.getElementById('historySearchInput') ? document.getElementById('historySearchInput').value.toLowerCase() : '';
        const actionFilter = document.getElementById('historyActionFilter') ? document.getElementById('historyActionFilter').value : 'all';
        const itemFilter = document.getElementById('historyItemFilter') ? document.getElementById('historyItemFilter').value : 'all';

        const filtered = historyData.filter(h => {
            if (actionFilter !== 'all' && h.action !== actionFilter) return false;
            if (itemFilter !== 'all' && (!h.itemName || h.itemName.toLowerCase() !== itemFilter.toLowerCase())) return false;
            if (search) {
                const matchesSearch =
                    (h.itemId && h.itemId.toLowerCase().includes(search)) ||
                    (h.itemName && h.itemName.toLowerCase().includes(search)) ||
                    (h.itemMerk && h.itemMerk.toLowerCase().includes(search)) ||
                    (h.itemSn && h.itemSn.toLowerCase().includes(search)) ||
                    (h.itemLokasi && h.itemLokasi.toLowerCase().includes(search)) ||
                    (h.details && h.details.toLowerCase().includes(search));
                if (!matchesSearch) return false;
            }
            return true;
        });

        filtered.forEach(h => selectedHistoryItems.add(h.id));
    } else {
        selectedHistoryItems.clear();
    }

    checkboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
    });

    updateHistorySelectedCount();
}

function updateHistorySelectedCount() {
    const deleteSelectedBtn = document.getElementById('deleteHistorySelectedBtn');
    const selectedCount = document.getElementById('historySelectedCount');

    if (selectedHistoryItems.size > 0) {
        deleteSelectedBtn.style.display = 'inline-flex';
        selectedCount.textContent = selectedHistoryItems.size;
    } else {
        deleteSelectedBtn.style.display = 'none';
    }
}

async function deleteSelectedHistory() {
    if (selectedHistoryItems.size === 0) {
        showToast('Pilih item yang ingin dihapus!', true);
        return;
    }

    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Riwayat Aktivitas',
        message: `Apakah Anda yakin ingin menghapus <strong>${selectedHistoryItems.size} catatan riwayat</strong> terpilih? Data riwayat yang terhapus tidak dapat dipulihkan.`,
        confirmText: 'Ya, Hapus Riwayat',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;

    try {
        console.log('Deleting history IDs:', Array.from(selectedHistoryItems));

        const response = await fetch('/api/history/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: Array.from(selectedHistoryItems) })
        });

        console.log('Response status:', response.status);

        const data = await response.json();
        console.log('Response data:', data);

        if (data.success) {
            historyData = historyData.filter(h => !selectedHistoryItems.has(h.id));
            selectedHistoryItems.clear();
            updateHistorySelectedCount();
            renderHistoryTable();
            showToast(`${data.count} history berhasil dihapus!`);
        } else {
            showToast('Gagal menghapus: ' + (data.message || 'Unknown error'), true);
        }
    } catch (error) {
        console.error('Error deleting selected history:', error);
        showToast('Gagal menghapus history! Error: ' + error.message, true);
    }
}

async function exportHistoryToExcel() {
    const btn = document.getElementById('exportHistoryExcelBtn');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
        if (historyData.length === 0) {
            showToast('Tidak ada data history untuk diexport!', true);
            return;
        }

        const actionFilter = document.getElementById('historyActionFilter') ? document.getElementById('historyActionFilter').value : 'all';
        const itemFilter = document.getElementById('historyItemFilter') ? document.getElementById('historyItemFilter').value : 'all';

        let filtered = historyData.filter(h => {
            if (actionFilter !== 'all' && h.action !== actionFilter) return false;
            if (itemFilter !== 'all' && (!h.itemName || h.itemName.toLowerCase() !== itemFilter.toLowerCase())) return false;
            return true;
        });

        if (filtered.length === 0) {
            showToast('Tidak ada data untuk filter ini!', true);
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('History');

        const headers = ['Aksi', 'ID Item', 'Nama Barang', 'Merk', 'SN', 'Lokasi', 'Detail', 'Waktu'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF037A89' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        worksheet.columns = [
            { width: 12 }, { width: 12 }, { width: 20 }, { width: 15 },
            { width: 20 }, { width: 20 }, { width: 35 }, { width: 22 }
        ];

        filtered.forEach(h => {
            const actionLabel = h.action === 'CREATE' ? 'Input' : h.action === 'UPDATE' ? 'Update' : 'Delete';
            const row = worksheet.addRow([
                actionLabel, h.itemId || '-', h.itemName || '-', h.itemMerk || '-',
                h.itemSn || '-', h.itemLokasi || '-', h.details || '-',
                h.timestamp ? formatDateTime(h.timestamp) : '-'
            ]);
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'history_inventaris.xlsx';
        anchor.click();
        window.URL.revokeObjectURL(url);
        showToast('Berhasil export history ke Excel!');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function exportHistoryToPdf() {
    var btn = document.getElementById('exportHistoryPdfBtn');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
        if (!historyData || historyData.length === 0) {
            showToast('Tidak ada data history untuk diexport!', true);
            return;
        }

        var actionFilter = document.getElementById('historyActionFilter') ? document.getElementById('historyActionFilter').value : 'all';
        var itemFilter = document.getElementById('historyItemFilter') ? document.getElementById('historyItemFilter').value : 'all';

        var filtered = [];
        for (var i = 0; i < historyData.length; i++) {
            var h = historyData[i];
            if (!h) continue;
            if (actionFilter !== 'all' && h.action !== actionFilter) continue;
            if (itemFilter !== 'all' && h.itemName && h.itemName.toLowerCase() !== itemFilter.toLowerCase()) continue;
            filtered.push(h);
        }

        if (filtered.length === 0) {
            showToast('Tidak ada data untuk filter ini!', true);
            return;
        }

        var result = createPdfDoc('LAPORAN HISTORY INVENTARIS', 'landscape');
        var doc = result.doc;

        var tableData = [];
        for (var j = 0; j < filtered.length; j++) {
            var h = filtered[j];
            var actionLabel = '-';
            if (h.action === 'CREATE') actionLabel = 'Input';
            else if (h.action === 'UPDATE') actionLabel = 'Update';
            else if (h.action === 'DELETE') actionLabel = 'Delete';

            tableData.push([
                actionLabel,
                h.itemId || '-',
                h.itemName || '-',
                h.itemMerk || '-',
                h.itemSn || '-',
                h.itemLokasi || '-',
                h.details || '-',
                h.timestamp ? formatDateTime(h.timestamp) : '-'
            ]);
        }

        var tableOptions = applyPdfTableStyle(doc, {
            head: [['Aksi', 'ID Item', 'Nama', 'Merk', 'SN', 'Lokasi', 'Detail', 'Waktu']],
            body: tableData,
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 20 },
                2: { cellWidth: 30, halign: 'left' },
                3: { cellWidth: 25 },
                4: { cellWidth: 30 },
                5: { cellWidth: 30, halign: 'left' },
                6: { cellWidth: 'auto', halign: 'left' },
                7: { cellWidth: 35 }
            }
        });

        doc.autoTable(tableOptions);

        doc.save('history_' + formatDate(new Date()) + '.pdf');
        showToast('Berhasil export PDF!');

    } catch (e) {
        console.error('Export PDF Error:', e);
        showToast('Gagal export PDF: ' + e.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ========================================
// SORTABLE TABLE COLUMNS
// ========================================
let sortState = {};

function initSortableColumns() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', function () {
            const table = this.closest('table');
            const tableId = table.id;
            const sortKey = this.dataset.sort;

            // Toggle sort direction
            if (!sortState[tableId]) sortState[tableId] = {};
            if (sortState[tableId].key === sortKey) {
                sortState[tableId].dir = sortState[tableId].dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState[tableId] = { key: sortKey, dir: 'asc' };
            }

            // Update header icons
            table.querySelectorAll('.sortable').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            this.classList.add(sortState[tableId].dir === 'asc' ? 'sort-asc' : 'sort-desc');

            // Sort and re-render based on table
            if (tableId === 'inventoryTable') {
                sortAndRenderInventory();
            } else if (tableId === 'scanTable') {
                sortAndRenderScan();
            } else if (tableId === 'historyTable') {
                sortAndRenderHistory();
            }
        });
    });
}

function sortData(data, key, dir) {
    return [...data].sort((a, b) => {
        let valA = a ? (a[key] ?? '') : '';
        let valB = b ? (b[key] ?? '') : '';
        if (key === 'date') {
            valA = (a.date || a.tanggalMasuk || '');
            valB = (b.date || b.tanggalMasuk || '');
        }
        if (typeof valA === 'string') valA = valA.trim().toLowerCase();
        if (typeof valB === 'string') valB = valB.trim().toLowerCase();
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

function sortAndRenderInventory() {
    updateInventoryTable();
}

function sortAndRenderScan() {
    renderScanTable();
}

function sortAndRenderHistory() {
    renderHistoryTable();
}

// ========================================
// IMPORT FUNCTIONS
// ========================================
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
        showToast('Format file tidak didukung! Gunakan file Excel (.xlsx, .xls) atau CSV.', true);
        return;
    }

    showToast('Memproses file...');

    try {
        const data = await readExcelFile(file);
        if (!data || data.length === 0) {
            showToast('File kosong atau tidak valid!', true);
            return;
        }

        // Map Excel columns to inventory fields
        const items = data.map((row, index) => {
            // Debug: log first row keys to see actual column names
            if (index === 0) {
                console.log('First row keys:', Object.keys(row));
                console.log('First row sample:', row);
            }

            // Get value with more flexible matching
            const getValue = (possibleNames) => {
                for (const name of possibleNames) {
                    // Direct match
                    if (row[name] !== undefined && row[name] !== null) {
                        return row[name];
                    }
                    // Case insensitive match
                    const nameLower = name.toLowerCase().trim();
                    for (const key of Object.keys(row)) {
                        if (key.toLowerCase().trim() === nameLower) {
                            return row[key];
                        }
                    }
                }
                return '';
            };

            const name = getValue(['Nama Barang', 'name', 'Name', 'NAMA BARANG']);
            const id = getValue(['ID', 'id', 'ID', 'Barcode', 'barcode']);
            const merk = getValue(['Merk', 'merk', 'MERK']);
            const sn = getValue(['SN', 'sn', 'Serial Number', 'SERIAL NUMBER']);
            const snConverter = getValue(['SN Converter', 'snConverter', 'sn_converter', 'SN CONVERTER', 'Sn Converter', 'Sn converter']);
            const lokasi = getValue(['Lokasi', 'lokasi', 'LOKASI']);
            const kondisiBefore = getValue(['Kondisi (Before)', 'kondisiBefore', 'Kondisi Before', 'KONDISI BEFORE']) || 'Baik';
            const kondisiAfter = getValue(['Kondisi (After)', 'kondisiAfter', 'Kondisi After', 'KONDISI AFTER']);
            const checklist = getValue(['Checklist', 'checklist', 'CHECKLIST']) || 'Tidak';
            const catatan = getValue(['Catatan', 'catatan', 'CATATAN']);
            const date = getValue(['Tanggal', 'date', 'TANGGAL']) || new Date().toISOString().split('T')[0];
            const qrData = getValue(['QR Code', 'qrCode', 'QR Data', 'qrData', 'QR']);

            if (!name) return null;

            return {
                id: String(id || ''),
                name: String(name),
                merk: String(merk || ''),
                sn: String(sn || ''),
                snConverter: String(snConverter || ''),
                lokasi: String(lokasi || ''),
                kondisiBefore: String(kondisiBefore),
                kondisiAfter: String(kondisiAfter || ''),
                checklist: String(checklist),
                catatan: String(catatan || ''),
                date: date,
                qrData: String(qrData || '')
            };
        }).filter(item => item !== null);

        if (items.length === 0) {
            showToast('Tidak ada data yang valid ditemukan dalam file!', true);
            return;
        }

        // Send to server for bulk import
        const response = await fetch('/api/inventory/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`Berhasil import ${result.count} item!`);

            // Regenerate QR codes for imported items if they don't have QR codes
            if (items.some(item => item.qrData || item.sn)) {
                setTimeout(() => {
                    regenerateQRCodes();
                }, 1000);
            }

            loadInventory();
        } else {
            showToast('Gagal import: ' + (result.message || 'Unknown error'), true);
        }
    } catch (error) {
        console.error('Import error:', error);
        showToast('Error saat memproses file: ' + error.message, true);
    }

    event.target.value = '';
}

// Regenerate QR codes for items without QR codes
function regenerateQRCodes() {
    let count = 0;

    inventoryData.forEach(item => {
        if (!item.qrCode && (item.sn || item.id)) {
            const qrData = item.sn || item.id;

            const qrContainer = document.createElement('div');
            qrContainer.style.display = 'none';
            document.body.appendChild(qrContainer);

            try {
                new QRCode(qrContainer, {
                    text: qrData,
                    width: 128,
                    height: 128,
                    correctLevel: QRCode.CorrectLevel.H
                });

                setTimeout(() => {
                    const canvas = qrContainer.querySelector('canvas');
                    const img = qrContainer.querySelector('img');

                    let qrBase64 = '';
                    if (canvas) {
                        qrBase64 = canvas.toDataURL('image/png');
                    } else if (img) {
                        qrBase64 = img.src;
                    }

                    if (qrBase64) {
                        fetch(`/api/inventory/${item.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ qrCode: qrBase64 })
                        })
                            .then(res => res.json())
                            .then(result => {
                                if (result.success) {
                                    count++;
                                    item.qrCode = qrBase64;
                                    updateInventoryTable();
                                }
                            });
                    }

                    document.body.removeChild(qrContainer);
                }, 100);
            } catch (e) {
                console.error('Error generating QR:', e);
                document.body.removeChild(qrContainer);
            }
        }
    });

    setTimeout(() => {
        if (count > 0) {
            showToast(`${count} QR Code berhasil diregenerate!`);
        }
    }, 2000);
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                resolve(jsonData);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ========================================
// HANDOVER FUNCTIONS
// ========================================
let handoverData = [];
let selectedHandoverItems = new Set();

async function loadHandover() {
    try {
        const response = await fetch('/api/handover');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        handoverData = Array.isArray(data) ? data : [];

        renderHandoverTable();
    } catch (error) {
        console.error('Error loading handover:', error);
        handoverData = [];
        renderHandoverTable();
    }
}

async function loadItemsByCategory() {
    const kategoriSelect = document.getElementById('handoverKategori');
    const itemSelect = document.getElementById('handoverItem');
    if (!kategoriSelect || !itemSelect) return;

    const kategori = (kategoriSelect.value || '').trim();

    if (!kategori) {
        itemSelect.innerHTML = '<option value="">Pilih Kategori Terlebih Dahulu</option>';
        itemSelect.disabled = true;
        if (typeof updateChecklistByCategory === 'function') updateChecklistByCategory('laptop');
        if (typeof loadHandoverItemDetails === 'function') loadHandoverItemDetails();
        return;
    }

    // Perbarui checklist bawaan sesuai kategori yang dipilih secara dinamis
    if (typeof updateChecklistByCategory === 'function') {
        updateChecklistByCategory(kategori);
    }

    itemSelect.disabled = true;
    itemSelect.innerHTML = '<option value="">Memuat unit...</option>';

    // Pastikan inventoryData sudah terisi dari API
    if (!inventoryData || inventoryData.length === 0) {
        try {
            const res = await fetch('/api/inventory');
            const data = await res.json();
            if (Array.isArray(data)) {
                inventoryData = data;
            }
        } catch (e) {
            console.error('[Handover] Gagal memuat inventoryData:', e);
        }
    }

    const filteredItems = (inventoryData || []).filter(item => {
        const itemCat = (item.name || '').toLowerCase().trim();
        const selCat = kategori.toLowerCase();
        return itemCat === selCat || itemCat.includes(selCat) || selCat.includes(itemCat);
    });

    if (filteredItems.length === 0) {
        itemSelect.innerHTML = `<option value="">Tidak ada unit tersedia untuk kategori "${kategori}"</option>`;
        itemSelect.disabled = true;
        if (typeof loadHandoverItemDetails === 'function') loadHandoverItemDetails();
        return;
    }

    itemSelect.disabled = false;
    itemSelect.innerHTML = '<option value="">-- Pilih Unit Item --</option>';

    filteredItems.forEach(item => {
        const merk = item.merk ? ` (${item.merk})` : '';
        const sn = item.sn ? ` [SN: ${item.sn}]` : '';
        itemSelect.innerHTML += `<option value="${item.id}" data-name="${item.name}" data-merk="${item.merk || ''}" data-sn="${item.sn || ''}" data-lokasi="${item.lokasi || ''}">${item.id} - ${item.name}${merk}${sn}</option>`;
    });

    // Otomatis refresh kartu detail aset
    if (typeof loadHandoverItemDetails === 'function') {
        loadHandoverItemDetails();
    }
}

function loadHandoverItemDetails() {
    const select = document.getElementById('handoverItem');
    const emptyState = document.getElementById('handoverItemEmptyState');
    const activeState = document.getElementById('handoverItemActiveState');
    if (!select) return;

    const itemId = select.value;
    const detailIdBadge = document.getElementById('detailIdBadge');
    const detailNama = document.getElementById('detailNama');
    const detailMerk = document.getElementById('detailMerk');
    const detailSn = document.getElementById('detailSn');
    const detailLokasi = document.getElementById('detailLokasi');
    const detailKondisiText = document.getElementById('detailKondisiText');
    const detailKondisiBadge = document.getElementById('detailKondisiBadge');
    const avatarIcon = document.getElementById('assetAvatarIcon');
    const miniQr = document.getElementById('handoverMiniQr');
    const snConverterTile = document.getElementById('detailSnConverterTile');
    const detailSnConverter = document.getElementById('detailSnConverter');

    // Backward compatibility hidden elements
    const detailId = document.getElementById('detailId');
    const detailKondisi = document.getElementById('detailKondisi');

    if (!itemId) {
        if (emptyState) emptyState.style.display = 'block';
        if (activeState) activeState.style.display = 'none';
        if (detailId) detailId.textContent = '-';
        if (detailKondisi) detailKondisi.textContent = '-';
        return;
    }

    const item = inventoryData.find(i => i.id === itemId);

    if (item) {
        if (emptyState) emptyState.style.display = 'none';
        if (activeState) activeState.style.display = 'flex';

        if (detailIdBadge) detailIdBadge.textContent = item.id;
        if (detailNama) detailNama.textContent = item.name || '-';
        if (detailMerk) detailMerk.textContent = item.merk || '-';
        if (detailSn) detailSn.textContent = item.sn || '-';
        if (detailLokasi) detailLokasi.textContent = item.lokasi || '-';

        // Backward compatibility
        if (detailId) detailId.textContent = item.id;
        if (detailKondisi) detailKondisi.textContent = item.kondisiAfter || item.kondisiBefore || '-';

        // Kondisi text & badge class
        const kondisi = item.kondisiAfter || item.kondisiBefore || 'Baik';
        if (detailKondisiText) detailKondisiText.textContent = kondisi;
        if (detailKondisiBadge) {
            detailKondisiBadge.className = 'asset-status-pill';
            if (kondisi === 'Rusak Ringan') {
                detailKondisiBadge.classList.add('status-rusak-ringan');
            } else if (kondisi === 'Rusak Berat') {
                detailKondisiBadge.classList.add('status-rusak-berat');
            }
        }

        // Avatar Icon by Category
        if (avatarIcon) {
            const cat = (item.name || '').toLowerCase();
            let iconClass = 'fa-boxes-stacked';
            let bgGradient = 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)';

            if (cat.includes('laptop')) {
                iconClass = 'fa-laptop';
                bgGradient = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
            } else if (cat.includes('pc') || cat.includes('komputer')) {
                iconClass = 'fa-desktop';
                bgGradient = 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
            } else if (cat.includes('monitor')) {
                iconClass = 'fa-tv';
                bgGradient = 'linear-gradient(135deg, #10b981 0%, #047857 100%)';
            } else if (cat.includes('headset')) {
                iconClass = 'fa-headphones';
                bgGradient = 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)';
            } else if (cat.includes('keyboard')) {
                iconClass = 'fa-keyboard';
                bgGradient = 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)';
            } else if (cat.includes('mouse')) {
                iconClass = 'fa-mouse';
                bgGradient = 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)';
            } else if (cat.includes('tv')) {
                iconClass = 'fa-tv';
                bgGradient = 'linear-gradient(135deg, #eab308 0%, #a16207 100%)';
            }

            avatarIcon.style.background = bgGradient;
            avatarIcon.innerHTML = `<i class="fas ${iconClass}"></i>`;
        }

        // SN Converter visibility for Headset
        if (snConverterTile && detailSnConverter) {
            if (item.name && item.name.toLowerCase() === 'headset') {
                snConverterTile.style.display = 'flex';
                detailSnConverter.textContent = item.snConverter || '-';
            } else {
                snConverterTile.style.display = 'none';
            }
        }

        // Generate Live Mini QR Code
        if (miniQr && typeof QRCode !== 'undefined') {
            miniQr.innerHTML = '';
            try {
                new QRCode(miniQr, {
                    text: `${item.id}|${item.sn || ''}|${item.name || ''}`,
                    width: 60,
                    height: 60,
                    colorDark: '#0f172a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) {
                console.warn('Mini QR generation error:', err);
            }
        }
    } else {
        if (emptyState) emptyState.style.display = 'block';
        if (activeState) activeState.style.display = 'none';
    }
}

function toggleHandoverFields() {
    const jenis = document.getElementById('handoverJenis') ? document.getElementById('handoverJenis').value : '';
    const labelDari = document.getElementById('labelHandoverDari');
    const labelKepada = document.getElementById('labelHandoverKepada');
    const inputDari = document.getElementById('handoverDari');
    const inputKepada = document.getElementById('handoverKepada');

    if (jenis === 'Penerimaan') {
        if (labelDari) labelDari.innerHTML = '<i class="fas fa-truck-loading"></i> Pihak Penyerah (Vendor / Mitra) <span class="required">*</span>';
        if (labelKepada) labelKepada.innerHTML = '<i class="fas fa-user-check"></i> Pihak Penerima (Admin / Logistik) <span class="required">*</span>';
        if (inputDari) inputDari.placeholder = 'Contoh: PT Mitra Solusi / Vendor Pengadaan';
        if (inputKepada) inputKepada.placeholder = 'Nama PIC penerima kantor ICONNET';
    } else {
        if (labelDari) labelDari.innerHTML = '<i class="fas fa-user-check"></i> Pihak Penyerah (Dari) <span class="required">*</span>';
        if (labelKepada) labelKepada.innerHTML = '<i class="fas fa-user-plus"></i> Pihak Penerima (Kepada) <span class="required">*</span>';
        if (inputDari) inputDari.placeholder = 'Nama pihak yang menyerahkan aset';
        if (inputKepada) inputKepada.placeholder = 'Nama karyawan penerima aset';
    }
}

function generateAutoNoBA() {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);
    const noBA = `SMG08.006/ICONNET/BASTB/${mm}-${dd}-${yyyy}/${rand}`;
    const input = document.getElementById('handoverNoBA');
    if (input) {
        input.value = noBA;
        input.focus();
        if (typeof showToast === 'function') {
            showToast('Nomor Berita Acara berhasil dibuat!');
        }
    }
}

// Expose Handover functions globally for seamless HTML interaction
window.loadItemsByCategory = loadItemsByCategory;
window.loadHandoverItemDetails = loadHandoverItemDetails;
window.generateAutoNoBA = generateAutoNoBA;
window.toggleHandoverFields = toggleHandoverFields;

let uploadedEvidentPhotos = [];

function compressImage(file, maxWidth = 1280, quality = 0.78) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
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
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleEvidentPhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
        try {
            const compressed = await compressImage(file, 1280, 0.78);
            uploadedEvidentPhotos.push(compressed);
        } catch (err) {
            console.error('Error compressing image:', err);
        }
    }
    renderEvidentPhotoPreviews();
    event.target.value = '';
}

function removeEvidentPhoto(index) {
    uploadedEvidentPhotos.splice(index, 1);
    renderEvidentPhotoPreviews();
}

function renderEvidentPhotoPreviews() {
    const container = document.getElementById('evidentPhotoPreviewContainer');
    if (!container) return;
    container.innerHTML = uploadedEvidentPhotos.map((src, idx) => `
        <div class="evident-preview-item">
            <img src="${src}" alt="Dokumentasi ${idx + 1}">
            <button type="button" class="evident-remove-btn" onclick="removeEvidentPhoto(${idx})" title="Hapus foto">&times;</button>
        </div>
    `).join('');
}

// Edit Modal Evident Photos State & Handlers
let editUploadedEvidentPhotos = [];

async function handleEditEvidentPhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
        try {
            const compressed = await compressImage(file, 1280, 0.78);
            editUploadedEvidentPhotos.push(compressed);
        } catch (err) {
            console.error('Error compressing image for edit modal:', err);
        }
    }
    renderEditEvidentPhotoPreviews();
    event.target.value = '';
}

function removeEditEvidentPhoto(index) {
    if (index >= 0 && index < editUploadedEvidentPhotos.length) {
        editUploadedEvidentPhotos.splice(index, 1);
        renderEditEvidentPhotoPreviews();
    }
}

function renderEditEvidentPhotoPreviews() {
    const container = document.getElementById('editEvidentPhotoPreviewContainer');
    if (!container) return;
    container.innerHTML = editUploadedEvidentPhotos.map((src, idx) => `
        <div class="evident-preview-item">
            <img src="${src}" alt="Dokumentasi ${idx + 1}">
            <button type="button" class="evident-remove-btn" onclick="removeEditEvidentPhoto(${idx})" title="Hapus foto">&times;</button>
        </div>
    `).join('');
}

window.handleEditEvidentPhotoUpload = handleEditEvidentPhotoUpload;
window.removeEditEvidentPhoto = removeEditEvidentPhoto;
window.renderEditEvidentPhotoPreviews = renderEditEvidentPhotoPreviews;

// ======================================================
// DYNAMIC CATEGORY CHECKLIST FOR BAST (SMART CHIPS)
// ======================================================
const DEFAULT_CATEGORY_CHECKLIST = {
    laptop: [
        { name: 'Laptop', checked: true, icon: 'fa-laptop' },
        { name: 'Charger', checked: true, icon: 'fa-plug' },
        { name: 'Dus', checked: false, icon: 'fa-box' },
        { name: 'Tas Laptop', checked: true, icon: 'fa-briefcase' }
    ],
    monitor: [
        { name: 'Unit Monitor', checked: true, icon: 'fa-desktop' },
        { name: 'Kabel Power', checked: true, icon: 'fa-plug' },
        { name: 'Kabel HDMI / VGA', checked: true, icon: 'fa-random' },
        { name: 'Stand / Kaki Monitor', checked: true, icon: 'fa-tv' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ],
    pc: [
        { name: 'Unit PC / CPU', checked: true, icon: 'fa-server' },
        { name: 'Kabel Power', checked: true, icon: 'fa-plug' },
        { name: 'Keyboard', checked: true, icon: 'fa-keyboard' },
        { name: 'Mouse', checked: true, icon: 'fa-mouse' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ],
    keyboard: [
        { name: 'Unit Keyboard', checked: true, icon: 'fa-keyboard' },
        { name: 'Kabel USB / Dongle', checked: true, icon: 'fa-plug' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ],
    mouse: [
        { name: 'Unit Mouse', checked: true, icon: 'fa-mouse' },
        { name: 'Kabel / Dongle USB', checked: true, icon: 'fa-plug' },
        { name: 'Baterai', checked: true, icon: 'fa-battery-full' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ],
    headset: [
        { name: 'Unit Headset', checked: true, icon: 'fa-headphones' },
        { name: 'Kabel Audio / USB', checked: true, icon: 'fa-plug' },
        { name: 'Busa Mic / Earpad', checked: true, icon: 'fa-circle' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ],
    tv: [
        { name: 'Unit TV', checked: true, icon: 'fa-tv' },
        { name: 'Remote Control', checked: true, icon: 'fa-gamepad' },
        { name: 'Kabel Power', checked: true, icon: 'fa-plug' },
        { name: 'Bracket / Kaki TV', checked: true, icon: 'fa-border-all' },
        { name: 'Dus', checked: false, icon: 'fa-box' }
    ]
};

let activeChecklistItems = [
    { name: 'Laptop', checked: true, icon: 'fa-laptop' },
    { name: 'Charger', checked: true, icon: 'fa-plug' },
    { name: 'Dus', checked: false, icon: 'fa-box' },
    { name: 'Tas Laptop', checked: true, icon: 'fa-briefcase' }
];

function escapeChecklistText(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderBASTChecklistChips() {
    const container = document.getElementById('bastChecklistChipsContainer');
    if (!container) return;

    if (!activeChecklistItems || activeChecklistItems.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--text-tertiary); font-style: italic;">Belum ada item kelengkapan. Tambahkan melalui input di bawah.</span>';
        return;
    }

    container.innerHTML = activeChecklistItems.map((item, idx) => `
        <label class="checklist-chip-label" data-index="${idx}">
            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleChecklistChip(${idx})">
            <span class="chip-content">
                <i class="fas ${item.icon || 'fa-tag'}"></i>
                <span class="chip-text">${escapeChecklistText(item.name)}</span>
            </span>
            <button type="button" class="checklist-chip-remove" onclick="event.stopPropagation(); event.preventDefault(); removeChecklistChip(${idx});" title="Hapus item">&times;</button>
        </label>
    `).join('');
}

function updateChecklistByCategory(category) {
    const cat = (category || 'laptop').toLowerCase().trim();
    let matched = null;

    if (DEFAULT_CATEGORY_CHECKLIST[cat]) {
        matched = DEFAULT_CATEGORY_CHECKLIST[cat];
    } else {
        for (const key of Object.keys(DEFAULT_CATEGORY_CHECKLIST)) {
            if (cat.includes(key) || key.includes(cat)) {
                matched = DEFAULT_CATEGORY_CHECKLIST[key];
                break;
            }
        }
    }

    if (matched) {
        activeChecklistItems = matched.map(i => ({ ...i }));
    } else {
        activeChecklistItems = [
            { name: category ? `${category}` : 'Unit Barang', checked: true, icon: 'fa-cube' },
            { name: 'Kabel Power / Adaptor', checked: true, icon: 'fa-plug' },
            { name: 'Dus', checked: false, icon: 'fa-box' }
        ];
    }

    renderBASTChecklistChips();
}

function addCustomChecklistChip() {
    const input = document.getElementById('newChecklistInput');
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
        input.focus();
        return;
    }

    // Mendukung pemisahan dengan koma (misal "Mouse, Baterai")
    const items = val.split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(name => {
        const exists = activeChecklistItems.some(i => i.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
            let icon = 'fa-tag';
            const low = name.toLowerCase();
            if (low.includes('mouse')) icon = 'fa-mouse';
            else if (low.includes('keyboard')) icon = 'fa-keyboard';
            else if (low.includes('baterai') || low.includes('battery')) icon = 'fa-battery-full';
            else if (low.includes('kabel') || low.includes('cable')) icon = 'fa-random';
            else if (low.includes('adaptor') || low.includes('charger')) icon = 'fa-plug';
            else if (low.includes('tas')) icon = 'fa-briefcase';
            else if (low.includes('dus') || low.includes('box')) icon = 'fa-box';

            activeChecklistItems.push({
                name: name,
                checked: true,
                icon: icon
            });
        }
    });

    input.value = '';
    renderBASTChecklistChips();
}

function removeChecklistChip(index) {
    if (index >= 0 && index < activeChecklistItems.length) {
        activeChecklistItems.splice(index, 1);
        renderBASTChecklistChips();
    }
}

function toggleChecklistChip(index) {
    if (index >= 0 && index < activeChecklistItems.length) {
        activeChecklistItems[index].checked = !activeChecklistItems[index].checked;
    }
}

function getSelectedChecklistBAST() {
    return JSON.stringify(activeChecklistItems.map(item => ({
        name: item.name,
        checked: Boolean(item.checked)
    })));
}

function getChecklistIconByName(name) {
    if (!name) return 'fa-tag';
    const low = name.toLowerCase();
    if (low.includes('mouse')) return 'fa-mouse';
    if (low.includes('keyboard')) return 'fa-keyboard';
    if (low.includes('baterai') || low.includes('battery')) return 'fa-battery-full';
    if (low.includes('kabel') || low.includes('cable') || low.includes('hdmi')) return 'fa-random';
    if (low.includes('adaptor') || low.includes('charger') || low.includes('power')) return 'fa-plug';
    if (low.includes('tas')) return 'fa-briefcase';
    if (low.includes('dus') || low.includes('box')) return 'fa-box';
    if (low.includes('monitor') || low.includes('layar')) return 'fa-desktop';
    if (low.includes('pc') || low.includes('cpu')) return 'fa-server';
    if (low.includes('headset') || low.includes('headphone')) return 'fa-headphones';
    if (low.includes('tv')) return 'fa-tv';
    return 'fa-tag';
}

// Edit Modal Checklist State & Handlers
let editActiveChecklistItems = [];

function renderEditBASTChecklistChips() {
    const container = document.getElementById('editBastChecklistChipsContainer');
    if (!container) return;

    if (!editActiveChecklistItems || editActiveChecklistItems.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--text-tertiary); font-style: italic;">Belum ada item kelengkapan. Tambahkan melalui input di bawah.</span>';
        return;
    }

    container.innerHTML = editActiveChecklistItems.map((item, idx) => `
        <label class="checklist-chip-label" data-index="${idx}">
            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleEditChecklistChip(${idx})">
            <span class="chip-content">
                <i class="fas ${item.icon || getChecklistIconByName(item.name)}"></i>
                <span class="chip-text">${escapeChecklistText(item.name)}</span>
            </span>
            <button type="button" class="checklist-chip-remove" onclick="event.stopPropagation(); event.preventDefault(); removeEditChecklistChip(${idx});" title="Hapus item">&times;</button>
        </label>
    `).join('');
}

function addCustomEditChecklistChip() {
    const input = document.getElementById('newEditChecklistInput');
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
        input.focus();
        return;
    }

    const items = val.split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(name => {
        const exists = editActiveChecklistItems.some(i => i.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
            editActiveChecklistItems.push({
                name: name,
                checked: true,
                icon: getChecklistIconByName(name)
            });
        }
    });

    input.value = '';
    renderEditBASTChecklistChips();
}

function removeEditChecklistChip(index) {
    if (index >= 0 && index < editActiveChecklistItems.length) {
        editActiveChecklistItems.splice(index, 1);
        renderEditBASTChecklistChips();
    }
}

function toggleEditChecklistChip(index) {
    if (index >= 0 && index < editActiveChecklistItems.length) {
        editActiveChecklistItems[index].checked = !editActiveChecklistItems[index].checked;
    }
}

window.renderBASTChecklistChips = renderBASTChecklistChips;
window.updateChecklistByCategory = updateChecklistByCategory;
window.addCustomChecklistChip = addCustomChecklistChip;
window.removeChecklistChip = removeChecklistChip;
window.toggleChecklistChip = toggleChecklistChip;
window.getSelectedChecklistBAST = getSelectedChecklistBAST;
window.renderEditBASTChecklistChips = renderEditBASTChecklistChips;
window.addCustomEditChecklistChip = addCustomEditChecklistChip;
window.removeEditChecklistChip = removeEditChecklistChip;
window.toggleEditChecklistChip = toggleEditChecklistChip;

function autoFillBASTEmail(name) {
    if (!name) return;
    const emailInput = document.getElementById('handoverEmail');
    if (emailInput && !emailInput.dataset.manualEdited) {
        const sanitized = name.trim().toLowerCase().replace(/\s+/g, '.');
        emailInput.value = sanitized ? `${sanitized}@iconpln.co.id` : '';
    }
}

function updateTanggalTerbilangPreview(dateVal) {
    const previewEl = document.getElementById('handoverTanggalTerbilangPreview');
    if (!previewEl) return;
    if (!dateVal) {
        previewEl.textContent = '';
        return;
    }
    const d = new Date(dateVal);
    const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const hari = hariArr[d.getDay()];
    const tgl = d.getDate();
    const bln = bulanArr[d.getMonth()];
    const thn = d.getFullYear();
    previewEl.innerHTML = `<i class="fas fa-calendar-check"></i> Hari: <strong>${hari}</strong>, ${tgl} ${bln} ${thn}`;
}

window.handleEvidentPhotoUpload = handleEvidentPhotoUpload;
window.removeEvidentPhoto = removeEvidentPhoto;
window.autoFillBASTEmail = autoFillBASTEmail;
window.updateTanggalTerbilangPreview = updateTanggalTerbilangPreview;

async function submitHandover(e) {
    e.preventDefault();

    const select = document.getElementById('handoverItem');
    const itemId = select.value;
    const item = inventoryData.find(i => i.id === itemId);

    const handoverRecord = {
        jenis: document.getElementById('handoverJenis').value,
        itemId: itemId,
        itemName: item ? item.name : '',
        itemMerk: item ? item.merk : '',
        itemSn: item ? item.sn : '',
        pihakPenyerah: document.getElementById('handoverDari').value,
        pihakPenerima: document.getElementById('handoverKepada').value,
        tanggalSerahTerima: document.getElementById('handoverTanggal').value,
        kondisiBefore: document.getElementById('handoverKondisiBefore').value,
        kondisiAfter: document.getElementById('handoverKondisiAfter').value,
        lokasiBaru: document.getElementById('handoverLokasi').value,
        catatan: document.getElementById('handoverCatatan').value,
        noBeritaAcara: document.getElementById('handoverNoBA').value,
        nip: document.getElementById('handoverNip')?.value || '',
        email: document.getElementById('handoverEmail')?.value || '',
        hp: document.getElementById('handoverHp')?.value || '',
        checklist: getSelectedChecklistBAST(),
        photos: uploadedEvidentPhotos,
        signature: signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL() : null
    };

    try {
        const response = await fetch('/api/handover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(handoverRecord)
        });

        const data = await response.json();
        if (data.success) {
            showToast('Serah terima berhasil disimpan!');
            document.getElementById('handoverForm').reset();
            const itemSelect = document.getElementById('handoverItem');
            if (itemSelect) {
                itemSelect.innerHTML = '<option value="">Pilih Kategori Terlebih Dahulu</option>';
                itemSelect.disabled = true;
            }
            if (typeof loadHandoverItemDetails === 'function') {
                loadHandoverItemDetails();
            }
            if (signaturePad) signaturePad.clear();
            uploadedEvidentPhotos = [];
            renderEvidentPhotoPreviews();
            if (typeof updateChecklistByCategory === 'function') {
                updateChecklistByCategory('laptop');
            }
            loadHandover();
            loadInventory();
        } else {
            showToast('Gagal menyimpan serah terima!', true);
        }
    } catch (error) {
        console.error('Error saving handover:', error);
        showToast('Gagal menyimpan serah terima!', true);
    }
}

// HANDOVER PAGINATION
let handoverPage = 1;
let handoverItemsPerPage = 10;
let handoverSortKey = '';
let handoverSortDir = 'asc';

function changeHandoverPage(direction) {
    const limitSelect = document.getElementById('handoverViewLimit');
    if (limitSelect) handoverItemsPerPage = parseInt(limitSelect.value);

    handoverPage += direction;

    const totalPages = Math.ceil(filteredHandoverData().length / handoverItemsPerPage);
    if (handoverPage < 1) handoverPage = 1;
    if (handoverPage > totalPages) handoverPage = totalPages;

    renderHandoverTable();
}

function goToHandoverPage(page) {
    handoverPage = page;
    renderHandoverTable();
}

function sortHandoverTable(key) {
    if (handoverSortKey === key) {
        handoverSortDir = handoverSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        handoverSortKey = key;
        handoverSortDir = 'asc';
    }
    renderHandoverTable();
}

function filteredHandoverData() {
    if (!handoverData || !Array.isArray(handoverData)) {
        return [];
    }

    const search = document.getElementById('handoverSearchInput') ? document.getElementById('handoverSearchInput').value.toLowerCase() : '';
    const jenisFilter = document.getElementById('handoverJenisFilter') ? document.getElementById('handoverJenisFilter').value : 'all';

    var filtered = handoverData.filter(function (h) {
        if (!h) return false;
        if (jenisFilter !== 'all' && h.jenis !== jenisFilter) return false;
        if (search) {
            var matchesSearch =
                (h.item_id && h.item_id.toLowerCase().includes(search)) ||
                (h.item_name && h.item_name.toLowerCase().includes(search)) ||
                (h.pihak_penyerah && h.pihak_penyerah.toLowerCase().includes(search)) ||
                (h.pihak_penerima && h.pihak_penerima.toLowerCase().includes(search)) ||
                (h.no_berita_acara && h.no_berita_acara.toLowerCase().includes(search));
            if (!matchesSearch) return false;
        }
        return true;
    });

    if (sortState['historyTable'] && sortState['historyTable'].key) {
        filtered = sortData(filtered, sortState['historyTable'].key, sortState['historyTable'].dir);
    }

    // Apply sorting
    if (handoverSortKey) {
        filtered.sort(function (a, b) {
            var valA = a[handoverSortKey] || '';
            var valB = b[handoverSortKey] || '';

            // Handle date sorting
            if (handoverSortKey === 'tanggal_serah_terima' || handoverSortKey === 'timestamp') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            }

            if (valA < valB) return handoverSortDir === 'asc' ? -1 : 1;
            if (valA > valB) return handoverSortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return filtered;
}

function renderHandoverTable() {
    const tableBody = document.getElementById('handoverTableBody');
    const emptyState = document.getElementById('handoverEmptyState');
    const pagination = document.getElementById('handoverPagination');
    if (!tableBody) return;

    const selectAllCheckbox = document.getElementById('selectAllHandoverCheckbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    const limitSelect = document.getElementById('handoverViewLimit');
    if (limitSelect) handoverItemsPerPage = parseInt(limitSelect.value);

    const filtered = filteredHandoverData();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / handoverItemsPerPage));

    if (handoverPage > totalPages) handoverPage = totalPages;
    if (handoverPage < 1) handoverPage = 1;

    const startIndex = (handoverPage - 1) * handoverItemsPerPage;
    const endIndex = Math.min(startIndex + handoverItemsPerPage, totalItems);
    const paginatedData = totalItems > 0 ? filtered.slice(startIndex, endIndex) : [];

    const showingStart = document.getElementById('handoverShowingStart');
    const showingEnd = document.getElementById('handoverShowingEnd');
    const totalData = document.getElementById('handoverTotalData');
    const prevBtn = document.getElementById('handoverPrevBtn');
    const nextBtn = document.getElementById('handoverNextBtn');
    const pageNumbers = document.getElementById('handoverPageNumbers');

    if (totalItems === 0) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (pagination) pagination.style.display = 'none';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (pagination) pagination.style.display = 'flex';

        tableBody.innerHTML = paginatedData.map(h => {
            const isPenerimaan = (h.jenis || '').toLowerCase().includes('penerimaan');
            const jenisClass = isPenerimaan ? 'pill-penerimaan' : 'pill-penyerahan';
            const jenisIcon = isPenerimaan ? 'fa-arrow-down' : 'fa-arrow-up';
            const tgl = formatTanggalIndonesia(h.tanggal_serah_terima) || '-';

            const condBefore = (h.kondisi_before || 'Baik').trim();
            const condAfter = (h.kondisi_after || 'Baik').trim();
            const condBeforeClass = condBefore.toLowerCase().replace(/\s+/g, '-');
            const condAfterClass = condAfter.toLowerCase().replace(/\s+/g, '-');

            return `
                <tr data-id="${h.id}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="handover-row-checkbox" value="${h.id}" onchange="toggleHandoverSelection('${h.id}')" ${selectedHandoverItems.has(h.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="doc-cell">
                            <span class="ba-number-chip" onclick="openHandoverDetailModal('${h.id}')" title="Klik untuk lihat detail">${h.no_berita_acara || 'Tanpa No. BA'}</span>
                            <span class="doc-date"><i class="far fa-calendar-alt"></i> ${tgl}</span>
                        </div>
                    </td>
                    <td>
                        <span class="handover-pill ${jenisClass}">
                            <i class="fas ${jenisIcon}"></i> ${h.jenis || '-'}
                        </span>
                    </td>
                    <td>
                        <div class="unit-cell">
                            <span class="unit-name">${h.item_name || 'Item'}</span>
                            <span class="unit-id-badge">#${h.item_id || '-'}</span>
                        </div>
                    </td>
                    <td>
                        <div class="transfer-flow">
                            <span class="party-tag sender" title="Penyerah: ${h.pihak_penyerah || '-'}"><i class="fas fa-user-circle"></i> ${h.pihak_penyerah || '-'}</span>
                            <i class="fas fa-arrow-right flow-arrow"></i>
                            <span class="party-tag receiver" title="Penerima: ${h.pihak_penerima || '-'}"><i class="fas fa-user-check"></i> ${h.pihak_penerima || '-'}</span>
                        </div>
                    </td>
                    <td>
                        <div class="condition-flow">
                            <span class="cond-pill cond-${condBeforeClass}">${condBefore}</span>
                            <span class="cond-arrow">➔</span>
                            <span class="cond-pill cond-${condAfterClass}">${condAfter}</span>
                        </div>
                    </td>
                    <td>
                        <div class="location-notes">
                            <span class="loc-tag"><i class="fas fa-map-marker-alt"></i> ${h.lokasi_baru || 'Kantor'}</span>
                            ${h.catatan ? `<span class="notes-preview" title="${h.catatan}"><i class="fas fa-comment-dots"></i> ${h.catatan}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <div class="table-actions-cluster">
                            <button class="btn-action-icon btn-view" onclick="openHandoverDetailModal('${h.id}')" title="Lihat Detail BASTB & TTD"><i class="fas fa-eye"></i></button>
                            <button class="btn-action-icon btn-edit" onclick="openEditHandoverModal('${h.id}')" title="Edit Data Serah Terima"><i class="fas fa-edit"></i></button>
                            <button class="btn-action-icon btn-pdf" onclick="generateBA_pdf('${h.id}')" title="Download BASTB PDF"><i class="fas fa-file-pdf"></i></button>
                            <button class="btn-action-icon btn-excel" onclick="generateBA_excel('${h.id}')" title="Download BASTB Excel"><i class="fas fa-file-excel"></i></button>
                            <button class="btn-action-icon btn-del" onclick="deleteSingleHandover('${h.id}')" title="Hapus Data"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (showingStart) showingStart.textContent = totalItems > 0 ? startIndex + 1 : 0;
        if (showingEnd) showingEnd.textContent = endIndex;
        if (totalData) totalData.textContent = totalItems;

        if (prevBtn) prevBtn.disabled = handoverPage === 1;
        if (nextBtn) nextBtn.disabled = handoverPage >= totalPages;

        if (pageNumbers) {
            let html = '';
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= handoverPage - 1 && i <= handoverPage + 1)) {
                    html += `<button class="page-number ${i === handoverPage ? 'active' : ''}" onclick="goToHandoverPage(${i})">${i}</button>`;
                } else if (i === handoverPage - 2 || i === handoverPage + 2) {
                    html += `<span class="ellipsis">...</span>`;
                }
            }
            pageNumbers.innerHTML = html;
        }
    }
}

function updateHandoverTable() {
    handoverPage = 1;
    renderHandoverTable();
}

function toggleHandoverSelection(id) {
    if (selectedHandoverItems.has(id)) {
        selectedHandoverItems.delete(id);
    } else {
        selectedHandoverItems.add(id);
    }
    updateHandoverSelectedCount();
}

function toggleSelectAllHandover() {
    const selectAllCheckbox = document.getElementById('selectAllHandoverCheckbox');
    const checkboxes = document.querySelectorAll('.handover-row-checkbox');

    if (!selectAllCheckbox) return;

    if (selectAllCheckbox.checked) {
        filteredHandoverData().forEach(h => selectedHandoverItems.add(h.id));
    } else {
        selectedHandoverItems.clear();
    }

    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateHandoverSelectedCount();
}

function updateHandoverSelectedCount() {
    const deleteSelectedBtn = document.getElementById('deleteHandoverSelectedBtn');
    const selectedCount = document.getElementById('handoverSelectedCount');

    if (selectedHandoverItems.size > 0) {
        if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'inline-flex';
        if (selectedCount) selectedCount.textContent = selectedHandoverItems.size;
    } else {
        if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none';
    }
}

let isDeletingHandover = false;
async function deleteSelectedHandover() {
    if (isDeletingHandover) return;
    if (selectedHandoverItems.size === 0) {
        showToast('Pilih item yang ingin dihapus!', true);
        return;
    }

    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Berita Acara',
        message: `Apakah Anda yakin ingin menghapus <strong>${selectedHandoverItems.size} berkas BAST</strong> terpilih? Dokumen serah terima ini akan dihapus dari sistem.`,
        confirmText: 'Ya, Hapus Data',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;

    isDeletingHandover = true;
    try {
        const response = await fetch('/api/handover/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: Array.from(selectedHandoverItems) })
        });

        const data = await response.json();
        if (data.success) {
            handoverData = handoverData.filter(h => !selectedHandoverItems.has(h.id));
            selectedHandoverItems.clear();
            updateHandoverSelectedCount();
            renderHandoverTable();
            showToast(`${data.count} data berhasil dihapus!`);
        }
    } catch (error) {
        console.error('Error deleting handover:', error);
        showToast('Gagal menghapus!', true);
    } finally {
        isDeletingHandover = false;
    }
}

async function deleteSingleHandover(id) {
    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Berita Acara',
        message: 'Apakah Anda yakin ingin menghapus data serah terima (BAST) ini dari sistem?',
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;
    try {
        const response = await fetch('/api/handover/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] })
        });
        const data = await response.json();
        if (data.success) {
            handoverData = handoverData.filter(h => h.id != id);
            selectedHandoverItems.delete(id);
            updateHandoverSelectedCount();
            renderHandoverTable();
            showToast('Data serah terima berhasil dihapus');
        } else {
            showToast('Gagal menghapus data!', true);
        }
    } catch (e) {
        console.error('Error delete handover:', e);
        showToast('Gagal menghapus data!', true);
    }
}

function openHandoverDetailModal(id) {
    const item = handoverData.find(h => h.id == id);
    if (!item) {
        showToast('Data serah terima tidak ditemukan!', true);
        return;
    }

    const modal = document.getElementById('handoverDetailModal');
    if (!modal) return;

    const modalNo = document.getElementById('modalBastbNo');
    const modalJenis = document.getElementById('modalBastbJenis');
    const modalTanggal = document.getElementById('modalBastbTanggal');
    const modalPenyerah = document.getElementById('modalBastbPenyerah');
    const modalPenerima = document.getElementById('modalBastbPenerima');
    const modalItemName = document.getElementById('modalBastbItemName');
    const modalItemId = document.getElementById('modalBastbItemId');
    const modalMerk = document.getElementById('modalBastbMerk');
    const modalSn = document.getElementById('modalBastbSn');
    const modalKondisiBefore = document.getElementById('modalBastbKondisiBefore');
    const modalKondisiAfter = document.getElementById('modalBastbKondisiAfter');
    const modalLokasi = document.getElementById('modalBastbLokasi');
    const modalCatatan = document.getElementById('modalBastbCatatan');

    if (modalNo) modalNo.textContent = item.no_berita_acara || '-';
    if (modalJenis) modalJenis.textContent = item.jenis || '-';
    if (modalTanggal) modalTanggal.textContent = formatTanggalIndonesia(item.tanggal_serah_terima) || '-';
    if (modalPenyerah) modalPenyerah.textContent = item.pihak_penyerah || '-';
    if (modalPenerima) modalPenerima.textContent = item.pihak_penerima || '-';
    if (modalItemName) modalItemName.textContent = item.item_name || '-';
    if (modalItemId) modalItemId.textContent = '#' + (item.item_id || '-');
    if (modalMerk) modalMerk.textContent = item.item_merk || '-';
    if (modalSn) modalSn.textContent = item.item_sn || '-';
    if (modalKondisiBefore) modalKondisiBefore.textContent = item.kondisi_before || 'Baik';
    if (modalKondisiAfter) modalKondisiAfter.textContent = item.kondisi_after || 'Baik';
    if (modalLokasi) modalLokasi.textContent = item.lokasi_baru || 'Kantor';
    if (modalCatatan) modalCatatan.textContent = item.catatan || 'Tidak ada catatan tambahan';

    // Signature preview
    const sigImg = document.getElementById('modalBastbSignatureImg');
    const noSigNotice = document.getElementById('modalBastbNoSignature');
    if (item.signature && item.signature.startsWith('data:image')) {
        if (sigImg) {
            sigImg.src = item.signature;
            sigImg.style.display = 'block';
        }
        if (noSigNotice) noSigNotice.style.display = 'none';
    } else {
        if (sigImg) sigImg.style.display = 'none';
        if (noSigNotice) noSigNotice.style.display = 'block';
    }

    // Action button bindings
    const btnPdf = document.getElementById('modalBastbBtnPdf');
    if (btnPdf) {
        btnPdf.onclick = () => generateBA_pdf(item.id);
    }
    const btnExcel = document.getElementById('modalBastbBtnExcel');
    if (btnExcel) {
        btnExcel.onclick = () => generateBA_excel(item.id);
    }

    window.currentHandoverDetailId = id;
    modal.classList.add('show');
}

window.openHandoverDetailModal = openHandoverDetailModal;
window.deleteSingleHandover = deleteSingleHandover;

// ======================================================
// EDIT HANDOVER (BAST) FUNCTIONS
// ======================================================
function openEditHandoverModal(id) {
    const item = handoverData.find(h => String(h.id) === String(id));
    if (!item) {
        showToast('Data serah terima tidak ditemukan!', 'warning');
        return;
    }

    // Set banner info
    const baDisplay = document.getElementById('editHandoverBaNoDisplay');
    if (baDisplay) baDisplay.textContent = item.no_berita_acara || 'BAST';

    const itemNameElem = document.getElementById('editHandoverItemName');
    if (itemNameElem) itemNameElem.textContent = item.item_name || 'Item';

    const itemIdElem = document.getElementById('editHandoverItemId');
    if (itemIdElem) itemIdElem.textContent = '#' + (item.item_id || '-');

    const itemMerkElem = document.getElementById('editHandoverItemMerk');
    if (itemMerkElem) itemMerkElem.textContent = item.item_merk || '-';

    const itemSnElem = document.getElementById('editHandoverItemSn');
    if (itemSnElem) itemSnElem.textContent = item.item_sn || '-';

    // Set form fields
    const idInput = document.getElementById('editHandoverId');
    if (idInput) idInput.value = item.id;

    const noBaInput = document.getElementById('editHandoverNoBa');
    if (noBaInput) noBaInput.value = item.no_berita_acara || '';

    const jenisInput = document.getElementById('editHandoverJenis');
    if (jenisInput) jenisInput.value = item.jenis || 'Penerimaan';

    const tglInput = document.getElementById('editHandoverTanggal');
    if (tglInput) {
        let tglVal = '';
        if (item.tanggal_serah_terima) {
            tglVal = item.tanggal_serah_terima.split('T')[0];
        }
        tglInput.value = tglVal;
    }

    const penyerahInput = document.getElementById('editHandoverPenyerah');
    if (penyerahInput) penyerahInput.value = item.pihak_penyerah || '';

    const penerimaInput = document.getElementById('editHandoverPenerima');
    if (penerimaInput) penerimaInput.value = item.pihak_penerima || '';

    const nipInput = document.getElementById('editHandoverNip');
    if (nipInput) nipInput.value = item.nip || '';

    const hpInput = document.getElementById('editHandoverHp');
    if (hpInput) hpInput.value = item.hp || '';

    const emailInput = document.getElementById('editHandoverEmail');
    if (emailInput) emailInput.value = item.email || '';

    const lokasiInput = document.getElementById('editHandoverLokasi');
    if (lokasiInput) lokasiInput.value = item.lokasi_baru || '';

    const condBeforeInput = document.getElementById('editHandoverKondisiBefore');
    if (condBeforeInput) condBeforeInput.value = item.kondisi_before || 'Baik';

    const condAfterInput = document.getElementById('editHandoverKondisiAfter');
    if (condAfterInput) condAfterInput.value = item.kondisi_after || 'Baik';

    // Inisialisasi checklist interaktif untuk Edit Modal
    editActiveChecklistItems = [];
    if (item.checklist) {
        let raw = item.checklist;
        if (typeof raw === 'string') {
            try {
                raw = JSON.parse(raw);
            } catch (e) {
                raw = raw.split(',').map(s => s.trim()).filter(Boolean);
            }
        }
        if (Array.isArray(raw)) {
            editActiveChecklistItems = raw.map(i => {
                if (typeof i === 'object' && i !== null) {
                    return {
                        name: (i.name || i.label || 'Item').trim(),
                        checked: i.checked !== false,
                        icon: getChecklistIconByName(i.name || i.label)
                    };
                } else if (typeof i === 'string' && i.trim()) {
                    return {
                        name: i.trim(),
                        checked: true,
                        icon: getChecklistIconByName(i)
                    };
                }
                return null;
            }).filter(Boolean);
        }
    }

    // Jika checklist masih kosong, sediakan default sesuai kategori barang
    if (editActiveChecklistItems.length === 0) {
        const cat = (item.item_name || 'laptop').toLowerCase().trim();
        let matched = null;
        if (DEFAULT_CATEGORY_CHECKLIST[cat]) {
            matched = DEFAULT_CATEGORY_CHECKLIST[cat];
        } else {
            for (const key of Object.keys(DEFAULT_CATEGORY_CHECKLIST)) {
                if (cat.includes(key) || key.includes(cat)) {
                    matched = DEFAULT_CATEGORY_CHECKLIST[key];
                    break;
                }
            }
        }
        if (matched) {
            editActiveChecklistItems = matched.map(i => ({ ...i }));
        } else {
            editActiveChecklistItems = [
                { name: item.item_name || 'Unit Barang', checked: true, icon: 'fa-cube' },
                { name: 'Kabel Power', checked: true, icon: 'fa-plug' },
                { name: 'Dus', checked: false, icon: 'fa-box' }
            ];
        }
    }

    renderEditBASTChecklistChips();

    // Inisialisasi foto evident untuk Edit Modal
    editUploadedEvidentPhotos = [];
    if (item.photos) {
        if (Array.isArray(item.photos)) {
            editUploadedEvidentPhotos = [...item.photos];
        } else if (typeof item.photos === 'string') {
            try {
                const parsed = JSON.parse(item.photos);
                if (Array.isArray(parsed)) editUploadedEvidentPhotos = parsed;
                else if (item.photos.startsWith('data:image') || item.photos.length > 50) editUploadedEvidentPhotos = [item.photos];
            } catch (e) {
                if (item.photos.startsWith('data:image') || item.photos.length > 50) editUploadedEvidentPhotos = [item.photos];
            }
        }
    }
    renderEditEvidentPhotoPreviews();

    const catInput = document.getElementById('editHandoverCatatan');
    if (catInput) catInput.value = item.catatan || '';

    openModal('editHandoverModal');
}
window.openEditHandoverModal = openEditHandoverModal;

function editFromHandoverDetailModal() {
    const id = window.currentHandoverDetailId;
    if (!id) return;
    closeModal('handoverDetailModal');
    setTimeout(() => {
        openEditHandoverModal(id);
    }, 150);
}
window.editFromHandoverDetailModal = editFromHandoverDetailModal;

async function saveEditHandover() {
    const id = document.getElementById('editHandoverId')?.value;
    if (!id) return;

    // Ambil checklist terstruktur dari editActiveChecklistItems
    const serializedChecklist = JSON.stringify(editActiveChecklistItems.map(item => ({
        name: item.name,
        checked: Boolean(item.checked)
    })));

    const payload = {
        noBeritaAcara: document.getElementById('editHandoverNoBa')?.value?.trim() || '',
        jenis: document.getElementById('editHandoverJenis')?.value || 'Penerimaan',
        tanggalSerahTerima: document.getElementById('editHandoverTanggal')?.value || '',
        pihakPenyerah: document.getElementById('editHandoverPenyerah')?.value?.trim() || '',
        pihakPenerima: document.getElementById('editHandoverPenerima')?.value?.trim() || '',
        nip: document.getElementById('editHandoverNip')?.value?.trim() || '',
        hp: document.getElementById('editHandoverHp')?.value?.trim() || '',
        email: document.getElementById('editHandoverEmail')?.value?.trim() || '',
        lokasiBaru: document.getElementById('editHandoverLokasi')?.value?.trim() || '',
        kondisiBefore: document.getElementById('editHandoverKondisiBefore')?.value || 'Baik',
        kondisiAfter: document.getElementById('editHandoverKondisiAfter')?.value || 'Baik',
        checklist: serializedChecklist,
        photos: editUploadedEvidentPhotos,
        catatan: document.getElementById('editHandoverCatatan')?.value?.trim() || ''
    };

    if (!payload.noBeritaAcara || !payload.pihakPenyerah || !payload.pihakPenerima) {
        showToast('Nomor BA, Pihak Penyerah, dan Pihak Penerima wajib diisi!', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/handover/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resData = await response.json();
        if (response.ok && resData.success) {
            closeModal('editHandoverModal');
            showToast('Data serah terima berhasil diperbarui!', 'success');

            // Refresh local handover data & table
            if (typeof loadHandover === 'function') {
                await loadHandover();
            } else if (typeof updateHandoverTable === 'function') {
                updateHandoverTable();
            }
            if (typeof loadInventoryData === 'function') {
                loadInventoryData();
            }
            if (typeof renderDashboardMap === 'function') {
                renderDashboardMap();
            }
        } else {
            showToast(resData.error || 'Gagal memperbarui data serah terima', 'error');
        }
    } catch (err) {
        console.error('Save edit handover error:', err);
        showToast('Terjadi kesalahan saat menyimpan perubahan serah terima', 'error');
    }
}
window.saveEditHandover = saveEditHandover;

function formatTanggalIndonesia(dateStr, includeTime) {
    if (!dateStr) return '-';

    // Check if it's an ISO string or has 'T'
    const isIso = dateStr.includes('T');
    const dateObj = new Date(dateStr);

    // If invalid date object and not ISO-like, try to parse
    if (isNaN(dateObj.getTime()) && !isIso) {
        const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const parts = dateStr.split('-');
        if (parts.length >= 3) {
            const tahun = parts[0];
            const bulanIdx = parseInt(parts[1]) - 1;
            const hari = parts[2].split('T')[0];
            return `${hari} ${bulan[bulanIdx]} ${tahun}`;
        }
        return dateStr;
    }

    // Use toLocaleString for better formatting if it's a valid date
    const options = {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    };

    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
        const formatted = dateObj.toLocaleString('id-ID', options).replace(/\./g, ':');
        // If it already contains 'pukul', just fix dots. Otherwise add it.
        return formatted.includes('pukul') ? formatted : formatted.replace(/ (\d{2}:\d{2})/, ' pukul $1');
    }

    return dateObj.toLocaleString('id-ID', options);
}

function generateNomorBA(tanggal, id) {
    if (!tanggal) return 'SMG08.001/ICONNET/BASTB/04-12-2026/0';

    const tgl = tanggal.includes('T') ? tanggal.split('T')[0] : tanggal;
    const parts = tgl.split('-');
    const tahun = parts[0];
    const bulan = parts[1];
    const hari = parts[2];
    const nomor = String(id).padStart(3, '0');

    return `SMG08.${nomor}/ICONNET/BASTB/${bulan}-${hari}-${tahun}/0`;
}

function generateBA_pdf(id) {
    if (!id) {
        showToast('ID Berita Acara tidak valid!', true);
        return;
    }
    showToast('Menyiapkan Berita Acara Serah Terima (BAST) resmi...');
    const token = encodeURIComponent(sessionStorage.getItem('authToken') || '');
    const downloadUrl = `/api/handover/${id}/pdf?token=${token}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.setAttribute('download', `BAST_${id}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function formatTerbilang(angka) {
    const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    angka = parseInt(angka, 10);
    if (isNaN(angka)) return '';
    if (angka < 12) return bilangan[angka];
    if (angka < 20) return formatTerbilang(angka - 10) + ' Belas';
    if (angka < 100) return formatTerbilang(Math.floor(angka / 10)) + ' Puluh ' + (angka % 10 !== 0 ? formatTerbilang(angka % 10) : '');
    if (angka < 200) return 'Seratus ' + (angka % 100 !== 0 ? formatTerbilang(angka - 100) : '');
    if (angka < 1000) return formatTerbilang(Math.floor(angka / 100)) + ' Ratus ' + (angka % 100 !== 0 ? formatTerbilang(angka % 100) : '');
    if (angka < 2000) return 'Seribu ' + (angka % 1000 !== 0 ? formatTerbilang(angka - 1000) : '');
    if (angka < 1000000) return formatTerbilang(Math.floor(angka / 1000)) + ' Ribu ' + (angka % 1000 !== 0 ? formatTerbilang(angka % 1000) : '');
    return String(angka);
}

async function generateBA_excel(id) {
    let data = handoverData.find(h => h.id == id);
    if (!data) {
        try {
            const res = await fetch(`/api/handover/${id}`);
            if (res.ok) data = await res.json();
        } catch (e) {}
    }
    if (!data) {
        showToast('Data serah terima tidak ditemukan!', true);
        return;
    }

    showToast('Sedang menyiapkan Berita Acara Excel resmi...');

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PLN Icon Plus';
        workbook.lastModifiedBy = 'PLN Icon Plus System';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Berita Acara', {
            views: [{ showGridLines: true }]
        });

        // 6 Kolom Utama (Presisi Layout A4 Cetak Portrait)
        worksheet.columns = [
            { key: 'colA', width: 7 },   // A: No / Indent
            { key: 'colB', width: 22 },  // B: Nama Barang / Label Identitas
            { key: 'colC', width: 24 },  // C: Merk / Kolom Tengah
            { key: 'colD', width: 24 },  // D: Serial Number / Kolom Tengah
            { key: 'colE', width: 11 },  // E: Quantity / Kolom Kanan
            { key: 'colF', width: 13 }   // F: Satuan / Kolom Kanan
        ];

        // Border Helpers
        const thinBorder = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        function setRangeBorder(startRow, startCol, endRow, endCol, border = thinBorder) {
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    worksheet.getCell(r, c).border = border;
                }
            }
        }

        function setBoxOutline(startRow, startCol, endRow, endCol) {
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    const cell = worksheet.getCell(r, c);
                    const b = { ...(cell.border || {}) };
                    if (r === startRow) b.top = { style: 'thin', color: { argb: 'FF000000' } };
                    if (r === endRow) b.bottom = { style: 'thin', color: { argb: 'FF000000' } };
                    if (c === startCol) b.left = { style: 'thin', color: { argb: 'FF000000' } };
                    if (c === endCol) b.right = { style: 'thin', color: { argb: 'FF000000' } };
                    cell.border = b;
                }
            }
        }

        // Variabel Identitas & Tanggal Format Resmi Terbilang
        const tgl = data.tanggal_serah_terima || data.tanggalSerahTerima ? new Date(data.tanggal_serah_terima || data.tanggalSerahTerima) : new Date();
        const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const bulanArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        const namaHari = hariArr[tgl.getDay()] || 'Senin';
        const tglNum = tgl.getDate();
        const namaBulan = bulanArr[tgl.getMonth()] || 'Januari';
        const tahunNum = tgl.getFullYear();
        const tanggalTerbilang = formatTerbilang(tglNum).trim();
        const tahunTerbilang = formatTerbilang(tahunNum).trim();
        const tglNumerik = String(tglNum).padStart(2, '0') + '-' + String(tgl.getMonth() + 1).padStart(2, '0') + '-' + tahunNum;

        const nomorBA = data.no_berita_acara || data.noBeritaAcara || generateNomorBA(data.tanggal_serah_terima, data.id);
        const rawItemName = (data.item_name || data.itemName || 'LAPTOP').toUpperCase();
        const titleItem = rawItemName.includes('LAPTOP') ? 'LAPTOP' : (rawItemName.includes('MONITOR') ? 'MONITOR' : (rawItemName.includes('PC') ? 'PC / DESKTOP' : rawItemName));

        // 1. HEADER SECTION (Logo & Pita Dekorasi Resmi PLN Icon Plus)
        worksheet.getRow(1).height = 30;
        try {
            const decorRes = await fetch('img/bast_header_decor.png');
            if (decorRes.ok) {
                const decorBuf = await decorRes.arrayBuffer();
                const decorId = workbook.addImage({ buffer: decorBuf, extension: 'png' });
                worksheet.addImage(decorId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: 280, height: 22 }
                });
            }
        } catch (e) {}

        try {
            const logoRes = await fetch('img/pln_icon_plus.png');
            if (logoRes.ok) {
                const logoBuf = await logoRes.arrayBuffer();
                const logoId = workbook.addImage({ buffer: logoBuf, extension: 'png' });
                worksheet.addImage(logoId, {
                    tl: { col: 4.0, row: 0.1 },
                    ext: { width: 125, height: 38 }
                });
            }
        } catch (e) {}

        worksheet.getRow(2).height = 10;

        // 2. KOTAK 1: JUDUL BERITA ACARA & NOMOR DOKUMEN
        worksheet.mergeCells('A3:F3');
        const cTitle = worksheet.getCell('A3');
        cTitle.value = `BERITA ACARA SERAH TERIMA ${titleItem}`;
        cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
        cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(3).height = 19;

        worksheet.mergeCells('A4:F4');
        const cSite = worksheet.getCell('A4');
        cSite.value = 'CONTACT CENTER RITEL SITE SEMARANG';
        cSite.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
        cSite.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(4).height = 16;

        worksheet.mergeCells('A5:F5');
        const cNo = worksheet.getCell('A5');
        cNo.value = nomorBA;
        cNo.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF000000' } };
        cNo.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(5).height = 18;

        setBoxOutline(3, 1, 5, 6);

        // 3. KOTAK 2: KALIMAT PEMBUKA FORMAT RESMI DENGAN TANGGAL TERBILANG
        worksheet.mergeCells('A6:F7');
        const cOpen = worksheet.getCell('A6');
        cOpen.value = `Pada hari ini ${namaHari}, tanggal ${tanggalTerbilang} Bulan ${namaBulan} Tahun ${tahunTerbilang} (${tglNumerik}), kami yang bertanda tangan dibawah ini menyatakan bahwa Perangkat telah diterima ke Technical Support dengan rincian sebagai berikut:`;
        cOpen.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF000000' } };
        cOpen.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left', indent: 1 };
        worksheet.getRow(6).height = 18;
        worksheet.getRow(7).height = 18;
        setBoxOutline(6, 1, 7, 6);

        // 4. KOTAK 3: TABEL RINCIAN BARANG
        const rowHeaderTbl = worksheet.getRow(8);
        rowHeaderTbl.values = ['No', 'Nama Barang', 'Merk', 'Serial Number', 'Quantity', 'Satuan'];
        rowHeaderTbl.height = 20;
        rowHeaderTbl.eachCell(cell => {
            cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2F7' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const itemName = data.item_name || data.itemName || 'Laptop';
        const itemMerk = data.item_merk || data.itemMerk || '-';
        const itemSn = data.item_sn || data.itemSn || '-';

        const rowDataTbl = worksheet.getRow(9);
        rowDataTbl.values = [1, itemName, itemMerk, itemSn, 1, 'Unit'];
        rowDataTbl.height = 20;
        rowDataTbl.eachCell(cell => {
            cell.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF000000' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        setRangeBorder(8, 1, 9, 6);

        // 5. KOTAK 4: KELENGKAPAN PERANGKAT (CHECKBOX DINAMIS SESUAI KATEGORI)
        let checklistItems = [];
        if (data.checklist) {
            let raw = data.checklist;
            if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch (e) { raw = raw.split(',').map(s => s.trim()).filter(Boolean); }
            }
            if (Array.isArray(raw)) {
                checklistItems = raw.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        return { name: (item.name || item.label || 'Item').trim(), checked: item.checked !== false };
                    } else if (typeof item === 'string' && item.trim()) {
                        return { name: item.trim(), checked: true };
                    }
                    return null;
                }).filter(Boolean);
            }
        }

        if (checklistItems.length === 0) {
            const itemLow = itemName.toLowerCase();
            if (itemLow.includes('laptop')) {
                checklistItems = [
                    { name: 'Laptop', checked: true },
                    { name: 'Dus', checked: false },
                    { name: 'Charger', checked: true },
                    { name: 'Tas Laptop', checked: true }
                ];
            } else if (itemLow.includes('monitor')) {
                checklistItems = [
                    { name: 'Unit Monitor', checked: true },
                    { name: 'Dus', checked: false },
                    { name: 'Kabel Power', checked: true },
                    { name: 'Kabel HDMI / VGA', checked: true }
                ];
            } else if (itemLow.includes('pc')) {
                checklistItems = [
                    { name: 'Unit PC / CPU', checked: true },
                    { name: 'Dus', checked: false },
                    { name: 'Kabel Power', checked: true },
                    { name: 'Keyboard', checked: true },
                    { name: 'Mouse', checked: true }
                ];
            } else {
                checklistItems = [
                    { name: itemName, checked: true },
                    { name: 'Dus', checked: false },
                    { name: 'Kabel Power / Adaptor', checked: true }
                ];
            }
        }

        worksheet.mergeCells('A10:F10');
        const cKlg = worksheet.getCell('A10');
        cKlg.value = 'Kelengkapan :';
        cKlg.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
        cKlg.alignment = { vertical: 'middle', indent: 1 };
        worksheet.getRow(10).height = 18;

        const startCheckRow = 11;
        const pairCount = Math.max(1, Math.ceil(checklistItems.length / 2));
        for (let i = 0; i < pairCount; i++) {
            const curRow = startCheckRow + i;
            const leftItem = checklistItems[i * 2];
            const rightItem = checklistItems[i * 2 + 1];

            worksheet.mergeCells(`A${curRow}:C${curRow}`);
            const leftCell = worksheet.getCell(`A${curRow}`);
            leftCell.value = leftItem ? `${leftItem.checked ? '[ ✓ ]' : '[   ]'}  ${leftItem.name}` : '';
            leftCell.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF000000' } };
            leftCell.alignment = { vertical: 'middle', indent: 2 };

            worksheet.mergeCells(`D${curRow}:F${curRow}`);
            const rightCell = worksheet.getCell(`D${curRow}`);
            rightCell.value = rightItem ? `${rightItem.checked ? '[ ✓ ]' : '[   ]'}  ${rightItem.name}` : '';
            rightCell.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF000000' } };
            rightCell.alignment = { vertical: 'middle', indent: 2 };

            worksheet.getRow(curRow).height = 16;
        }
        const endCheckRow = startCheckRow + pairCount - 1;
        setBoxOutline(10, 1, endCheckRow, 6);

        // 6. KOTAK 5: HEADER BARIS PERNYATAAN PENGGUNA
        const headerPernyataanRow = endCheckRow + 1;
        worksheet.mergeCells(`A${headerPernyataanRow}:F${headerPernyataanRow}`);
        const cHP = worksheet.getCell(`A${headerPernyataanRow}`);
        cHP.value = 'Pernyataan Pengguna';
        cHP.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
        cHP.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF2F7' } };
        cHP.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(headerPernyataanRow).height = 18;
        setBoxOutline(headerPernyataanRow, 1, headerPernyataanRow, 6);

        // 7. KOTAK 6: IDENTITAS & 10 BUTIR PERNYATAAN PENGGUNA
        const namaPenerima = data.pihak_penerima || data.pihakPenerima || 'Rofi Andiyono';
        const nipVal = data.nip || '97231446ICN';
        const namaVal = namaPenerima;
        const emailVal = data.email || (namaVal.toLowerCase().replace(/\s+/g, '.') + '@iconpln.co.id');
        const hpVal = data.hp || '0895375427610';

        const idStartRow = headerPernyataanRow + 1;
        worksheet.mergeCells(`A${idStartRow}:F${idStartRow}`);
        const cSaya = worksheet.getCell(`A${idStartRow}`);
        cSaya.value = 'Saya Pengguna Perangkat ini';
        cSaya.font = { name: 'Calibri', size: 8, color: { argb: 'FF000000' } };
        cSaya.alignment = { vertical: 'middle', indent: 1 };
        worksheet.getRow(idStartRow).height = 15;

        const identities = [
            { label: 'NIP', val: nipVal },
            { label: 'Nama', val: namaVal },
            { label: 'Email', val: emailVal },
            { label: 'HP', val: hpVal }
        ];

        let curIdRow = idStartRow + 1;
        identities.forEach(idItem => {
            const row = worksheet.getRow(curIdRow);
            row.getCell(1).value = '';
            row.getCell(2).value = idItem.label;
            row.getCell(2).font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF000000' } };
            row.getCell(2).alignment = { vertical: 'middle', indent: 1 };

            worksheet.mergeCells(`C${curIdRow}:F${curIdRow}`);
            const vCell = worksheet.getCell(`C${curIdRow}`);
            vCell.value = `: ${idItem.val}`;
            vCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF000000' } };
            vCell.alignment = { vertical: 'middle' };

            row.height = 14;
            curIdRow++;
        });

        worksheet.mergeCells(`A${curIdRow}:F${curIdRow}`);
        const cNyata = worksheet.getCell(`A${curIdRow}`);
        cNyata.value = 'Dengan ini menyatakan :';
        cNyata.font = { name: 'Calibri', size: 8, color: { argb: 'FF000000' } };
        cNyata.alignment = { vertical: 'middle', indent: 1 };
        worksheet.getRow(curIdRow).height = 15;
        curIdRow++;

        // 10 Butir Pernyataan Resmi Sesuai Standar BAST PLN
        const statements = [
            { num: '1.', text: 'Bersedia menjaga perangkat fasilitas kerja ini dengan sebaik-baiknya.' },
            { num: '2.', text: 'Bersedia menggunakan perangkat ini dengan sebagaimana mestinya untuk keperluan pekerjaan di lingkungan Contact Center Ritel' },
            { num: '3.', text: 'Bersedia untuk tidak memuat/menggunakan data/aplikasi yang tidak sesuai dengan ketentuan penggunaan yang ada di lingkungan Contact Center Ritel' },
            { num: '4.', text: 'Bersedia tidak memindahtangankan barang/perangkat ke pihak lain tanpa sepersetujuan Top Management' },
            { num: '5.', text: 'Bersedia tidak membuka casing perangkat secara mandiri.' },
            { num: '6.', text: 'Bersedia untuk tidak memperbaiki perangkat secara mandiri atau diluar Service Center resmi.' },
            { num: '7.', text: 'Bersedia mengembalikan perangkat dan kelengkapannya sesuai yang tercantum pada Berita Acara ini' },
            { num: '8.', text: 'Dalam hal kekurangan, kehilangan dan kerusakan perangkat serta kelengkapannya yang dikembalikan menjadi tanggung jawab Pengguna.' },
            { num: '9.', text: 'Jika ada perbedaan/perselisihan yang timbul dari atau sehubungan dengan penggunaan perangkat fasilitas kerja atau syarat dan ketentuan dari perjanjian ini, sebagai tindaklanjut perihal itu akan diproses dan dipertimbangkan untuk kemudian diputuskan oleh Top Management' },
            { num: '10.', text: 'Saya mengakui bahwa saya telah membaca dan memahami syarat dan ketentuan dari Berita Acara ini dan selanjutnya menyetujui untuk mematuhi semua persyaratan dan ketentuan yang diterapkan di lingkungan Contact Center Ritel' }
        ];

        statements.forEach(st => {
            const row = worksheet.getRow(curIdRow);
            const numCell = row.getCell(1);
            numCell.value = st.num;
            numCell.font = { name: 'Calibri', size: 7.5, color: { argb: 'FF000000' } };
            numCell.alignment = { horizontal: 'right', vertical: 'top' };

            worksheet.mergeCells(`B${curIdRow}:F${curIdRow}`);
            const textCell = worksheet.getCell(`B${curIdRow}`);
            textCell.value = st.text;
            textCell.font = { name: 'Calibri', size: 7.5, color: { argb: 'FF000000' } };
            textCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

            row.height = st.text.length > 120 ? 25 : (st.text.length > 80 ? 20 : 16);
            curIdRow++;
        });

        const endStatementRow = curIdRow - 1;
        setBoxOutline(idStartRow, 1, endStatementRow, 6);

        // 8. KOTAK 7: CATATAN LAIN
        const catRow = endStatementRow + 1;
        worksheet.mergeCells(`A${catRow}:F${catRow}`);
        const cCat = worksheet.getCell(`A${catRow}`);
        cCat.value = data.catatan ? `Catatan Lain : ${data.catatan}` : 'Catatan Lain :';
        cCat.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF000000' } };
        cCat.alignment = { vertical: 'middle', indent: 1 };
        worksheet.getRow(catRow).height = 18;
        setBoxOutline(catRow, 1, catRow, 6);

        // 9. KOTAK 8: KALIMAT PENUTUP
        const penutupRow = catRow + 1;
        worksheet.mergeCells(`A${penutupRow}:F${penutupRow}`);
        const cPenutup = worksheet.getCell(`A${penutupRow}`);
        cPenutup.value = 'Demikian Berita Acara Serah Terima barang ini dibuat dan ditandatangani untuk dapat dipergunakan sebagaimana mestinya.';
        cPenutup.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF000000' } };
        cPenutup.alignment = { vertical: 'middle', indent: 1 };
        worksheet.getRow(penutupRow).height = 18;
        setBoxOutline(penutupRow, 1, penutupRow, 6);

        // 10. KOTAK 9: KOTAK TANDA TANGAN 3 KOLOM
        const signHeaderRow = penutupRow + 1;

        worksheet.mergeCells(`A${signHeaderRow}:B${signHeaderRow}`);
        const sHead1 = worksheet.getCell(`A${signHeaderRow}`);
        sHead1.value = 'Yang Menyerahkan';
        sHead1.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
        sHead1.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`C${signHeaderRow}:D${signHeaderRow}`);
        const sHead2 = worksheet.getCell(`C${signHeaderRow}`);
        sHead2.value = 'Yang Menerima';
        sHead2.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
        sHead2.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`E${signHeaderRow}:F${signHeaderRow}`);
        const sHead3 = worksheet.getCell(`E${signHeaderRow}`);
        sHead3.value = 'Yang Mengetahui';
        sHead3.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF000000' } };
        sHead3.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.getRow(signHeaderRow).height = 18;

        // Area Kosong / TTD Image
        const signSpaceStart = signHeaderRow + 1;
        worksheet.getRow(signSpaceStart).height = 16;
        worksheet.getRow(signSpaceStart + 1).height = 16;
        worksheet.getRow(signSpaceStart + 2).height = 16;

        // Embed Tanda Tangan Digital pada Kolom "Yang Menyerahkan"
        const namaPenyerahVal = data.pihak_penyerah || data.pihakPenyerah || '-';
        let sigImageId = null;

        if (data.signature && typeof data.signature === 'string' && data.signature.length > 50) {
            try {
                sigImageId = workbook.addImage({
                    base64: data.signature,
                    extension: 'png'
                });
            } catch (e) {}
        }

        if (!sigImageId) {
            try {
                const ttdFile = namaPenyerahVal.toLowerCase().includes('rofi') ? 'img/ttd_rofi.png' : 'img/ttd_gustian.png';
                const sigRes = await fetch(ttdFile);
                if (sigRes.ok) {
                    const sigBuf = await sigRes.arrayBuffer();
                    sigImageId = workbook.addImage({ buffer: sigBuf, extension: 'png' });
                }
            } catch (e) {}
        }

        if (sigImageId) {
            worksheet.addImage(sigImageId, {
                tl: { col: 0.35, row: signSpaceStart - 0.9 },
                ext: { width: 85, height: 42 }
            });
        }

        // Baris Nama Pejabat / Pihak
        const signNameRow = signSpaceStart + 3;
        worksheet.mergeCells(`A${signNameRow}:B${signNameRow}`);
        const sName1 = worksheet.getCell(`A${signNameRow}`);
        sName1.value = namaPenyerahVal;
        sName1.font = { name: 'Calibri', size: 8.5, bold: true, underline: true, color: { argb: 'FF000000' } };
        sName1.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`C${signNameRow}:D${signNameRow}`);
        const sName2 = worksheet.getCell(`C${signNameRow}`);
        sName2.value = namaVal;
        sName2.font = { name: 'Calibri', size: 8.5, bold: true, underline: true, color: { argb: 'FF000000' } };
        sName2.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`E${signNameRow}:F${signNameRow}`);
        const sName3 = worksheet.getCell(`E${signNameRow}`);
        sName3.value = 'Erya Sari Dewi';
        sName3.font = { name: 'Calibri', size: 8.5, bold: true, underline: true, color: { argb: 'FF000000' } };
        sName3.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.getRow(signNameRow).height = 16;

        // Baris Jabatan
        const signJabatanRow = signNameRow + 1;
        worksheet.mergeCells(`A${signJabatanRow}:B${signJabatanRow}`);
        const sJab1 = worksheet.getCell(`A${signJabatanRow}`);
        sJab1.value = 'Technical Support';
        sJab1.font = { name: 'Calibri', size: 7.5, color: { argb: 'FF000000' } };
        sJab1.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`C${signJabatanRow}:D${signJabatanRow}`);
        const sJab2 = worksheet.getCell(`C${signJabatanRow}`);
        sJab2.value = 'Team Leader';
        sJab2.font = { name: 'Calibri', size: 7.5, color: { argb: 'FF000000' } };
        sJab2.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells(`E${signJabatanRow}:F${signJabatanRow}`);
        const sJab3 = worksheet.getCell(`E${signJabatanRow}`);
        sJab3.value = 'Head of Site';
        sJab3.font = { name: 'Calibri', size: 7.5, color: { argb: 'FF000000' } };
        sJab3.alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.getRow(signJabatanRow).height = 16;

        // Garis pemisah 3 Kolom Tanda Tangan
        setBoxOutline(signHeaderRow, 1, signJabatanRow, 2);
        setBoxOutline(signHeaderRow, 3, signJabatanRow, 4);
        setBoxOutline(signHeaderRow, 5, signJabatanRow, 6);
        setBoxOutline(signHeaderRow, 1, signJabatanRow, 6);

        // 11. PITA DEKORASI FOOTER
        try {
            const footRes = await fetch('img/bast_footer_decor.png');
            if (footRes.ok) {
                const footBuf = await footRes.arrayBuffer();
                const footId = workbook.addImage({ buffer: footBuf, extension: 'png' });
                worksheet.addImage(footId, {
                    tl: { col: 2.2, row: signJabatanRow + 0.6 },
                    ext: { width: 280, height: 22 }
                });
            }
        } catch (e) {}

        // Page Setup Standar Cetak A4 Portrait Presisi
        worksheet.pageSetup = {
            paperSize: 9, // A4
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            margins: {
                left: 0.35,
                right: 0.35,
                top: 0.35,
                bottom: 0.35,
                header: 0.15,
                footer: 0.15
            }
        };

        // 12. SHEET 2: DOKUMENTASI FOTO EVIDENT (Jika Tersedia)
        let photosList = [];
        if (data.photos) {
            if (Array.isArray(data.photos)) {
                photosList = data.photos;
            } else if (typeof data.photos === 'string') {
                try {
                    const parsed = JSON.parse(data.photos);
                    if (Array.isArray(parsed)) photosList = parsed;
                    else if (data.photos.trim().length > 10) photosList = [data.photos];
                } catch (e) {
                    if (data.photos.startsWith('data:image')) photosList = [data.photos];
                }
            }
        }

        if (photosList.length > 0) {
            const photoSheet = workbook.addWorksheet('Dokumentasi Evident', {
                views: [{ showGridLines: true }]
            });
            photoSheet.columns = [
                { width: 8 }, { width: 38 }, { width: 38 }, { width: 8 }
            ];

            photoSheet.mergeCells('A2:D2');
            const phTitle = photoSheet.getCell('A2');
            phTitle.value = `DOKUMENTASI FOTO EVIDENT - SERAH TERIMA ${titleItem}`;
            phTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
            phTitle.alignment = { horizontal: 'center', vertical: 'middle' };
            photoSheet.getRow(2).height = 24;

            photoSheet.mergeCells('A3:D3');
            const phSub = photoSheet.getCell('A3');
            phSub.value = `${nomorBA} | ${itemName} - ${itemSn}`;
            phSub.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
            phSub.alignment = { horizontal: 'center', vertical: 'middle' };
            photoSheet.getRow(3).height = 18;

            let curPhotoRow = 5;
            for (let i = 0; i < photosList.length; i += 2) {
                const photo1 = photosList[i];
                const photo2 = photosList[i + 1];

                photoSheet.getRow(curPhotoRow).height = 140;

                if (photo1 && photo1.startsWith('data:image')) {
                    try {
                        const imgExt = photo1.includes('png') ? 'png' : 'jpeg';
                        const imgId = workbook.addImage({ base64: photo1, extension: imgExt });
                        photoSheet.addImage(imgId, {
                            tl: { col: 1.1, row: curPhotoRow - 0.9 },
                            ext: { width: 220, height: 130 }
                        });
                    } catch (e) {}
                }

                if (photo2 && photo2.startsWith('data:image')) {
                    try {
                        const imgExt = photo2.includes('png') ? 'png' : 'jpeg';
                        const imgId = workbook.addImage({ base64: photo2, extension: imgExt });
                        photoSheet.addImage(imgId, {
                            tl: { col: 2.1, row: curPhotoRow - 0.9 },
                            ext: { width: 220, height: 130 }
                        });
                    } catch (e) {}
                }

                // Caption Baris Foto
                const capRow = curPhotoRow + 1;
                photoSheet.getCell(`B${capRow}`).value = `Dokumentasi Fisik ${i + 1}`;
                photoSheet.getCell(`B${capRow}`).font = { name: 'Calibri', size: 8.5, bold: true };
                photoSheet.getCell(`B${capRow}`).alignment = { horizontal: 'center' };

                if (photo2) {
                    photoSheet.getCell(`C${capRow}`).value = `Dokumentasi Fisik ${i + 2}`;
                    photoSheet.getCell(`C${capRow}`).font = { name: 'Calibri', size: 8.5, bold: true };
                    photoSheet.getCell(`C${capRow}`).alignment = { horizontal: 'center' };
                }

                photoSheet.getRow(capRow).height = 18;
                curPhotoRow += 3;
            }

            photoSheet.pageSetup = {
                paperSize: 9,
                orientation: 'portrait',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 1
            };
        }

        // Export and Download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const cleanName = namaVal.replace(/\s+/g, '_');
        link.download = `BAST_${titleItem.replace(/[\/\s]+/g, '_')}_${cleanName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showToast('Berita Acara Excel resmi berhasil diunduh!');
    } catch (error) {
        console.error('Error generating Excel:', error);
        showToast('Gagal membuat file Excel: ' + (error.message || error), true);
    }
}

// ============================================
// EXPORT EXCEL - DATA SERAH TERIMA
// ============================================
async function exportHandoverToExcel() {
    var btn = document.getElementById('exportHandoverExcel');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
        showToast('Sedang menyiapkan laporan Excel...');

        // Load data
        let data = handoverData || [];
        if (data.length === 0) {
            try {
                const response = await fetch('/api/handover');
                if (response.ok) {
                    const apiData = await response.json();
                    data = Array.isArray(apiData) ? apiData : [];
                }
            } catch (e) { console.warn('Fetch error:', e); }
        }

        if (data.length === 0) {
            showToast('Tidak ada data untuk diexport!', true);
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Laporan Serah Terima');

        // 1. SET COLUMNS
        worksheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'Jenis', key: 'jenis', width: 12 },
            { header: 'No Berita Acara', key: 'no_ba', width: 35 },
            { header: 'ID Item', key: 'id_item', width: 15 },
            { header: 'Nama Barang', key: 'nama', width: 25 },
            { header: 'Penyerah', key: 'penyerah', width: 20 },
            { header: 'Penerima', key: 'penerima', width: 20 },
            { header: 'Tanggal', key: 'tanggal', width: 22 },
            { header: 'Kondisi Before', key: 'before', width: 18 },
            { header: 'Kondisi After', key: 'after', width: 18 },
            { header: 'Lokasi Baru', key: 'lokasi', width: 22 },
            { header: 'Catatan', key: 'catatan', width: 30 }
        ];

        // 2. HEADER LAPORAN (MANUAL INSERTION AT TOP)
        // Shift worksheet down to make room for header
        worksheet.insertRow(1, []);
        worksheet.insertRow(1, []);
        worksheet.insertRow(1, []);
        worksheet.insertRow(1, []);

        // Title
        worksheet.mergeCells('A1:L1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'LAPORAN SERAH TERIMA INVENTARIS';
        titleCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // Subtitle (Date)
        worksheet.mergeCells('A2:L2');
        const dateCell = worksheet.getCell('A2');
        dateCell.value = 'Dicetak pada: ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        dateCell.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // 3. LOGO
        try {
            const logoResponse = await fetch('img/logo1.png');
            if (logoResponse.ok) {
                const logoBuffer = await logoResponse.arrayBuffer();
                const logoId = workbook.addImage({
                    buffer: logoBuffer,
                    extension: 'png',
                });
                worksheet.addImage(logoId, {
                    tl: { col: 10, row: 0.1 }, // Column K
                    ext: { width: 120, height: 40 }
                });
            }
        } catch (e) { console.warn('Logo error:', e); }

        // 4. STYLE THE TABLE HEADERS (Row 5 now)
        const headerRow = worksheet.getRow(5);
        headerRow.values = ['No', 'Jenis', 'No BA', 'ID Item', 'Nama Barang', 'Penyerah', 'Penerima', 'Tanggal', 'Kondisi Before', 'Kondisi After', 'Lokasi Baru', 'Catatan'];
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo 600
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
            };
        });

        // 5. DATA ROWS
        data.forEach((item, index) => {
            const row = worksheet.addRow([
                index + 1,
                item.jenis || '-',
                item.no_berita_acara || '-',
                item.item_id || '-',
                item.item_name || '-',
                item.pihak_penyerah || '-',
                item.pihak_penerima || '-',
                item.tanggal_serah_terima ? formatTanggalIndonesia(item.tanggal_serah_terima) : '-',
                item.kondisi_before || '-',
                item.kondisi_after || '-',
                item.lokasi_baru || '-',
                item.catatan || '-'
            ]);

            row.height = 22;
            const isEven = index % 2 === 0;

            row.eachCell((cell, colNumber) => {
                // Zebra Striping
                if (!isEven) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }

                // Borders
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };

                // Alignment
                cell.font = { name: 'Arial', size: 9 };
                const colKey = [1, 2, 8].includes(colNumber) ? 'center' : ([5, 11, 12].includes(colNumber) ? 'left' : 'center');
                cell.alignment = { horizontal: colKey, vertical: 'middle', wrapText: true, indent: colKey === 'left' ? 1 : 0 };
            });
        });

        // 6. FOOTER
        worksheet.addRow([]);
        const footerStart = worksheet.addRow([]);
        const footerRow1 = worksheet.addRow(['Dicetak oleh sistem']);
        const footerRow2 = worksheet.addRow(['ICONNET']);

        [footerRow1, footerRow2].forEach(row => {
            worksheet.mergeCells(`A${row.number}:L${row.number}`);
            row.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
            row.getCell(1).alignment = { horizontal: 'left' };
        });

        // Export
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Laporan_Serah_Terima_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();

        showToast('Laporan Excel berhasil diunduh!');
    } catch (error) {
        console.error('Export Excel Error:', error);
        showToast('Gagal export Excel: ' + error.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function exportHandoverToPdf() {
    var btn = document.getElementById('exportHandoverPdf');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
        var data = handoverData || [];

        if (data.length === 0) {
            showToast('Tidak ada data untuk export!', true);
            return;
        }

        var result = createPdfDoc('LAPORAN DATA SERAH TERIMA', 'landscape');
        var doc = result.doc;

        var tableData = [];
        for (var i = 0; i < data.length; i++) {
            var h = data[i] || {};
            tableData.push([
                i + 1,
                h.jenis || '-',
                h.no_berita_acara || '-',
                h.item_id || '-',
                h.item_name || '-',
                h.pihak_penyerah || '-',
                h.pihak_penerima || '-',
                h.timestamp ? formatTanggalIndonesia(h.timestamp, true) : (h.tanggal_serah_terima ? formatTanggalIndonesia(h.tanggal_serah_terima, true) : '-'),
                h.kondisi_before || '-',
                h.kondisi_after || '-',
                h.lokasi_baru || '-',
                h.catatan || '-'
            ]);
        }

        var tableOptions = applyPdfTableStyle(doc, {
            head: [['No', 'Jenis', 'No BA', 'ID Item', 'Nama', 'Penyerah', 'Penerima', 'Tanggal', 'Kondisi(B)', 'Kondisi(A)', 'Lokasi', 'Catatan']],
            body: tableData,
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 18 },
                2: { cellWidth: 35 },
                3: { cellWidth: 18 },
                4: { cellWidth: 22, halign: 'left' },
                5: { cellWidth: 20, halign: 'left' },
                6: { cellWidth: 20, halign: 'left' },
                7: { cellWidth: 22 },
                8: { cellWidth: 18 },
                9: { cellWidth: 18 },
                10: { cellWidth: 22, halign: 'left' },
                11: { cellWidth: 'auto', halign: 'left' }
            }
        });

        doc.autoTable(tableOptions);

        doc.save('serah_terima_' + new Date().toISOString().split('T')[0] + '.pdf');
        showToast('PDF berhasil diunduh!');

    } catch (e) {
        console.error('Export PDF Error:', e);
        showToast('Gagal export PDF: ' + e.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ========================================
// PROFESSIONAL UPGRADE: THEME, CHARTS, SIGNATURE
// ========================================

function initTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
    // Update charts text color if they exist
    if (typeof updateChartsData === 'function') {
        updateChartsData();
    }
}

function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;

    // Destroy previous instance if exists
    if (signaturePad) {
        try { signaturePad.off(); } catch (e) { }
        signaturePad = null;
    }

    // Resize the canvas to match its displayed CSS size (fix HiDPI & SPA hidden element issue)
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        if (w === 0 || h === 0) return; // not visible yet, skip
        canvas.width = w * ratio;
        canvas.height = h * ratio;
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        if (signaturePad) signaturePad.clear(); // clear after resize to avoid artifacts
    }

    // Remove any previous resize listener
    if (window._signatureResizeHandler) {
        window.removeEventListener('resize', window._signatureResizeHandler);
    }
    window._signatureResizeHandler = resizeCanvas;
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255,255,255,0)',
        penColor: '#1e293b'
    });

    const clearBtn = document.getElementById('clearSignature');
    if (clearBtn) {
        // Clone to remove old listeners
        const newBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newBtn, clearBtn);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signaturePad.clear();
        });
    }
}

// ========================================
// MODERN APEXCHARTS & FALLBACK ANALYTICS
// ========================================
let apexDistChart = null;
let apexCondChart = null;

function initCharts() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.body.getAttribute('data-theme') === 'dark' ||
        localStorage.getItem('theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const bgCutout = isDark ? '#1e293b' : '#ffffff';

    // 1. Check if ApexCharts is available
    if (typeof ApexCharts !== 'undefined' && document.getElementById('inventoryDistChartApex')) {
        const distEl = document.getElementById('inventoryDistChartApex');

        if (distEl && !apexDistChart) {
            const distOptions = {
                chart: {
                    type: 'donut',
                    height: 290,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    toolbar: { show: false },
                    foreColor: textColor,
                    animations: {
                        enabled: true,
                        easing: 'easeinout',
                        speed: 700
                    }
                },
                series: [1],
                labels: ['Memuat...'],
                colors: ['#2563eb', '#10b981', '#7c3aed', '#0891b2', '#db2777', '#d97706'],
                stroke: {
                    width: 3,
                    colors: [bgCutout]
                },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '72%',
                            labels: {
                                show: true,
                                name: {
                                    show: true,
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: isDark ? '#94a3b8' : '#475569',
                                    offsetY: -4
                                },
                                value: {
                                    show: true,
                                    fontSize: '24px',
                                    fontFamily: "'Outfit', sans-serif",
                                    fontWeight: 800,
                                    color: isDark ? '#f8fafc' : '#0f172a',
                                    offsetY: 6,
                                    formatter: val => val + ' Unit'
                                },
                                total: {
                                    show: true,
                                    label: 'Total Aset',
                                    color: isDark ? '#cbd5e1' : '#334155',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    formatter: w => {
                                        return w.globals.seriesTotals.reduce((a, b) => a + b, 0) + ' Unit';
                                    }
                                }
                            }
                        }
                    }
                },
                dataLabels: { enabled: false },
                legend: {
                    position: 'bottom',
                    fontSize: '12px',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 600,
                    labels: { colors: textColor },
                    itemMargin: { horizontal: 8, vertical: 4 },
                    formatter: function(seriesName, opts) {
                        return seriesName + ' (' + opts.w.globals.series[opts.seriesIndex] + ')';
                    }
                },
                tooltip: {
                    theme: isDark ? 'dark' : 'light',
                    y: { formatter: val => val + ' Unit' }
                }
            };
            apexDistChart = new ApexCharts(distEl, distOptions);
            apexDistChart.render();
        }

        // Initialize Health Index progress bars
        updateChartsData();
        return;
    }

    // 2. Chart.js Fallback
    const distCanvas = document.getElementById('inventoryDistChart');
    if (!distCanvas) return;
    distCanvas.style.display = 'block';

    const distCtx = distCanvas.getContext('2d');

    if (!inventoryDistChart) {
        inventoryDistChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#2563eb', '#10b981', '#7c3aed', '#0891b2', '#db2777', '#d97706'],
                    borderWidth: 2,
                    borderColor: bgCutout
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, font: { weight: '600' } }
                    }
                }
            }
        });
    }

    updateChartsData();
}

function updateChartsData() {
    if (!inventoryData || inventoryData.length === 0) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.body.getAttribute('data-theme') === 'dark' ||
        localStorage.getItem('theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const bgCutout = isDark ? '#1e293b' : '#ffffff';

    // 1. Calculate Distribution Counts
    const dist = {};
    inventoryData.forEach(item => {
        const name = (item.name || item.nama_barang || 'Perangkat').trim();
        dist[name] = (dist[name] || 0) + 1;
    });

    const distLabels = Object.keys(dist);
    const distSeries = Object.values(dist);

    // Dynamic smart colors matching category palette
    const distColors = distLabels.map(label => {
        if (typeof getCategoryBadgeStyle === 'function') {
            const style = getCategoryBadgeStyle(label);
            if (style) return isDark ? style.dark.color : style.light.color;
        }
        return '#2563eb';
    });

    // Update total badge
    const totalBadge = document.getElementById('distTotalBadge');
    if (totalBadge) totalBadge.textContent = `${inventoryData.length} Unit`;

    // 2. Calculate Condition Counts for Health Index (Opsi A)
    const cond = { 'Baik': 0, 'Rusak Ringan': 0, 'Rusak Berat': 0 };
    inventoryData.forEach(item => {
        const kAfter = (item.kondisiAfter || item.kondisi_after || '').trim();
        const kBefore = (item.kondisiBefore || item.kondisi_before || 'Baik').trim();
        if (cond[kAfter] !== undefined) cond[kAfter]++;
        else if (cond[kBefore] !== undefined) cond[kBefore]++;
        else cond['Baik']++;
    });

    const totalAset = inventoryData.length;
    const countBaik = cond['Baik'];
    const countRusakRingan = cond['Rusak Ringan'];
    const countRusakBerat = cond['Rusak Berat'];

    const pctBaik = totalAset > 0 ? Math.round((countBaik / totalAset) * 100) : 100;
    const pctRusakRingan = totalAset > 0 ? Math.round((countRusakRingan / totalAset) * 100) : 0;
    const pctRusakBerat = totalAset > 0 ? Math.round((countRusakBerat / totalAset) * 100) : 0;

    // Update Health Score UI elements
    const healthScoreBig = document.getElementById('healthScoreBig');
    const healthScoreDesc = document.getElementById('healthScoreDesc');
    const healthRateStatus = document.getElementById('healthRateStatus');
    const healthRatePill = document.getElementById('healthRatePill');

    if (healthScoreBig) healthScoreBig.textContent = `${pctBaik}%`;
    if (healthRateStatus) healthRateStatus.textContent = `${pctBaik}% Siap Pakai`;

    if (healthScoreDesc) {
        if (pctBaik === 100) {
            healthScoreDesc.textContent = 'Semua aset terdata dalam kondisi prima dan siap digunakan di operasional.';
            if (healthScoreBig) healthScoreBig.style.color = '#10b981';
            if (healthRatePill) {
                healthRatePill.style.background = 'rgba(16, 185, 129, 0.12)';
                healthRatePill.style.color = '#10b981';
                healthRatePill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            }
        } else if (pctBaik >= 80) {
            healthScoreDesc.textContent = `${countRusakRingan + countRusakBerat} unit memerlukan perhatian atau pemeliharaan berkala.`;
            if (healthScoreBig) healthScoreBig.style.color = '#f59e0b';
            if (healthRatePill) {
                healthRatePill.style.background = 'rgba(245, 158, 11, 0.12)';
                healthRatePill.style.color = '#f59e0b';
                healthRatePill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            }
        } else {
            healthScoreDesc.textContent = 'Perhatian: Terdapat unit dalam kondisi rusak yang memerlukan perbaikan segera.';
            if (healthScoreBig) healthScoreBig.style.color = '#ef4444';
            if (healthRatePill) {
                healthRatePill.style.background = 'rgba(239, 68, 68, 0.12)';
                healthRatePill.style.color = '#ef4444';
                healthRatePill.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            }
        }
    }

    // Update Progress Bars
    const hBaikVal = document.getElementById('healthBaikVal');
    const hBarBaik = document.getElementById('healthBarBaik');
    if (hBaikVal) hBaikVal.textContent = `${countBaik} Unit (${pctBaik}%)`;
    if (hBarBaik) hBarBaik.style.width = `${pctBaik}%`;

    const hRusakRinganVal = document.getElementById('healthRusakRinganVal');
    const hBarRusakRingan = document.getElementById('healthBarRusakRingan');
    if (hRusakRinganVal) hRusakRinganVal.textContent = `${countRusakRingan} Unit (${pctRusakRingan}%)`;
    if (hBarRusakRingan) hBarRusakRingan.style.width = `${pctRusakRingan}%`;

    const hRusakBeratVal = document.getElementById('healthRusakBeratVal');
    const hBarRusakBerat = document.getElementById('healthBarRusakBerat');
    if (hRusakBeratVal) hRusakBeratVal.textContent = `${countRusakBerat} Unit (${pctRusakBerat}%)`;
    if (hBarRusakBerat) hBarRusakBerat.style.width = `${pctRusakBerat}%`;

    // Update Mini Metrics
    const mTotal = document.getElementById('healthMetricTotal');
    const mIssue = document.getElementById('healthMetricIssue');
    const mAudit = document.getElementById('healthMetricAudit');

    if (mTotal) mTotal.textContent = totalAset;
    if (mIssue) mIssue.textContent = countRusakRingan + countRusakBerat;

    const checkedCount = inventoryData.filter(i => i.checklist === 'Ya').length;
    const pctAudit = totalAset > 0 ? Math.round((checkedCount / totalAset) * 100) : 0;
    if (mAudit) mAudit.textContent = `${pctAudit}% (${checkedCount}/${totalAset})`;

    // 3. Update ApexCharts Donut if active
    if (apexDistChart) {
        apexDistChart.updateOptions({
            labels: distLabels,
            series: distSeries,
            colors: distColors.length > 0 ? distColors : ['#2563eb', '#10b981'],
            stroke: {
                colors: [bgCutout]
            },
            legend: {
                labels: { colors: textColor }
            },
            plotOptions: {
                pie: {
                    donut: {
                        labels: {
                            name: { color: isDark ? '#94a3b8' : '#475569' },
                            value: { color: isDark ? '#f8fafc' : '#0f172a' },
                            total: { color: isDark ? '#cbd5e1' : '#334155' }
                        }
                    }
                }
            },
            tooltip: { theme: isDark ? 'dark' : 'light' }
        });
    }

    // 4. Update Chart.js if active
    if (inventoryDistChart) {
        inventoryDistChart.data.labels = distLabels;
        inventoryDistChart.data.datasets[0].data = distSeries;
        inventoryDistChart.data.datasets[0].backgroundColor = distColors;
        inventoryDistChart.data.datasets[0].borderColor = bgCutout;
        inventoryDistChart.options.plugins.legend.labels.color = textColor;
        inventoryDistChart.update();
    }
}

// ========================================
// PROFESSIONAL LABEL PRINTING
// ========================================
function printProfessionalLabel(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=600,height=600');

    // Build the print document
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetak Label - ${item.id}</title>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .label-box {
                    display: flex;
                    align-items: center;
                    padding: 15px;
                    border: 1px solid #eee;
                    border-radius: 8px;
                    width: fit-content;
                }
                .qr-side {
                    width: 150px;
                    height: 150px;
                    margin-right: 20px;
                }
                .qr-side img {
                    width: 100%;
                    height: 100%;
                }
                .info-side {
                    display: flex;
                    flex-direction: column;
                }
                .logo {
                    height: 30px;
                    margin-bottom: 10px;
                    object-fit: contain;
                }
                .item-name {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: #1e293b;
                }
                .item-text {
                    font-size: 14px;
                    color: #64748b;
                    margin: 2px 0;
                }
                .item-id {
                    font-size: 18px;
                    font-weight: bold;
                    margin-top: 10px;
                    color: #1e293b;
                    font-family: monospace;
                }
                @media print {
                    @page { margin: 0; }
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="label-box">
                <div class="qr-side">
                    ${item.qrCode ? `<img src="${item.qrCode}" alt="QR">` : ''}
                </div>
                <div class="info-side">
                    <img src="img/logo1.png" alt="Iconnet" class="logo">
                    <div class="item-name">${item.name || 'Inventaris'}</div>
                    <div class="item-text">SN: ${item.sn || '-'}</div>
                    <div class="item-text">Lok: ${item.lokasi || '-'}</div>
                    <div class="item-id">${item.id}</div>
                </div>
            </div>
            <script>
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}

// ========================================
// INTERACTIVE MAP / FLOOR PLAN
// ========================================
const cubicleConfig = {
    'A': 20, 'B': 20, 'C': 27, 'D': 26, 'E': 36, 'F': 28
};
let cubiclePositions = [];
let isDataLoaded = false;

async function loadCubiclePositions() {
    try {
        const res = await fetch('/api/cubicle-positions');
        cubiclePositions = await res.json();
        isDataLoaded = true;

        populateCubicleSuggestions();

        // Trigger renders if we are on dashboard or map pages
        renderDashboardMap();
        renderMap();

        // Also update dashboard occupancy stats if inventory is already loaded
        if (inventoryData.length > 0) {
            updateDashboard();
        }
    } catch (e) {
        console.error('Error loading positions:', e);
        cubiclePositions = [];
    }
}

function populateCubicleSuggestions() {
    const datalist = document.getElementById('cubicleSuggestions');
    if (!cubiclePositions || cubiclePositions.length === 0) return;

    const uniqueCubicles = getSortedCubicleList();
    cachedCubiclesList = uniqueCubicles;
    if (datalist) {
        datalist.innerHTML = uniqueCubicles.map(id => `<option value="${id}">Kubikel ${id}</option>`).join('');
    }
}

let cubiclePickerTargetInput = 'itemLocation';
let cachedCubiclesList = [];

function getSortedCubicleList() {
    if (!cubiclePositions || cubiclePositions.length === 0) return [];
    const validCubicles = cubiclePositions
        .filter(p => p.type !== 'label' && p.cubicle_id && !p.cubicle_id.startsWith('LABEL_'))
        .map(p => p.cubicle_id)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return [...new Set(validCubicles)];
}

function renderCubiclePickerQuickChips() {
    const wrap = document.getElementById('cubiclePickerQuickOptions');
    if (!wrap) return;

    const customRooms = (cubiclePositions || [])
        .filter(p => p.type === 'room')
        .map(p => p.cubicle_id);

    const standardChips = ['-', 'Gudang', 'Ruang Server'];
    const allChips = [...new Set([...standardChips, ...customRooms])];

    wrap.innerHTML = allChips.map(chip => {
        let icon = 'fa-building';
        if (chip === '-') icon = 'fa-minus-circle';
        else if (chip.toLowerCase().includes('gudang')) icon = 'fa-warehouse';
        else if (chip.toLowerCase().includes('server')) icon = 'fa-server';
        else if (chip.toLowerCase().includes('meeting') || chip.toLowerCase().includes('rapat')) icon = 'fa-users';
        else if (chip.toLowerCase().includes('noc')) icon = 'fa-network-wired';

        const label = chip === '-' ? 'Tanpa Kubikel (-)' : chip;
        return `
            <button type="button" class="cubicle-badge-chip" onclick="selectCubicleForTarget('${chip}')">
                <i class="fas ${icon}"></i> ${label}
            </button>
        `;
    }).join('');
}

function toggleAddNewLocationForm(forceShow) {
    const wrap = document.getElementById('addNewLocationWrap');
    if (!wrap) return;
    const isShowing = wrap.style.display !== 'none';
    const shouldShow = forceShow !== undefined ? forceShow : !isShowing;

    wrap.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) {
        const input = document.getElementById('newLocationNameInput');
        if (input) {
            input.value = (document.getElementById('cubiclePickerSearch')?.value || '').trim();
            input.focus();
        }
    }
}

async function submitAddNewLocation() {
    const nameInput = document.getElementById('newLocationNameInput');
    const typeSelect = document.getElementById('newLocationTypeSelect');
    if (!nameInput || !nameInput.value.trim()) {
        showToast('Nama lokasi wajib diisi', 'error');
        return;
    }

    const name = nameInput.value.trim();
    const type = typeSelect ? typeSelect.value : 'cubicle';

    try {
        const res = await fetch('/api/cubicle-positions/add-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const newLoc = data.location;
            if (!cubiclePositions.find(p => p.cubicle_id === newLoc.cubicle_id)) {
                cubiclePositions.push(newLoc);
            }
            populateCubicleSuggestions();
            renderCubiclePickerQuickChips();
            toggleAddNewLocationForm(false);
            selectCubicleForTarget(newLoc.cubicle_id);
            showToast(`Lokasi "${newLoc.cubicle_id}" berhasil didaftarkan dan dipilih!`);
            if (typeof renderDesigner === 'function') renderDesigner();
        } else {
            showToast(data.message || 'Gagal menambahkan lokasi', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Gagal menghubungi server', 'error');
    }
}

async function quickAddLocationFromSearch(queryName) {
    if (!queryName || !queryName.trim()) return;
    const name = queryName.trim();
    const isCubicleFormat = /^[a-zA-Z]-?[0-9]+$/i.test(name) || /^[a-zA-Z][0-9]+$/i.test(name);
    const type = isCubicleFormat ? 'cubicle' : 'room';

    try {
        const res = await fetch('/api/cubicle-positions/add-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const newLoc = data.location;
            if (!cubiclePositions.find(p => p.cubicle_id === newLoc.cubicle_id)) {
                cubiclePositions.push(newLoc);
            }
            populateCubicleSuggestions();
            renderCubiclePickerQuickChips();
            selectCubicleForTarget(newLoc.cubicle_id);
            showToast(`Lokasi "${newLoc.cubicle_id}" berhasil didaftarkan dan dipilih!`);
            if (typeof renderDesigner === 'function') renderDesigner();
        } else {
            showToast(data.message || 'Gagal menambahkan lokasi', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Gagal menghubungi server', 'error');
    }
}

function openCubiclePicker(targetInputId = 'itemLocation') {
    cubiclePickerTargetInput = targetInputId;
    cachedCubiclesList = getSortedCubicleList();

    const searchInput = document.getElementById('cubiclePickerSearch');
    if (searchInput) searchInput.value = '';

    toggleAddNewLocationForm(false);
    renderCubiclePickerQuickChips();
    renderCubiclePickerGrid(cachedCubiclesList);
    openModal('cubiclePickerModal');

    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 200);
}

function renderCubiclePickerGrid(cubicles, currentQuery = '') {
    const grid = document.getElementById('cubiclePickerGrid');
    if (!grid) return;

    if (!cubicles || cubicles.length === 0) {
        if (currentQuery) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 22px 14px; background: var(--bg-secondary); border: 1.5px dashed var(--border); border-radius: 10px;">
                    <p style="margin: 0 0 10px; font-size: 13px; color: var(--text-secondary);">Lokasi "<strong>${currentQuery}</strong>" belum terdaftar di sistem.</p>
                    <button type="button" class="primary-btn" onclick="quickAddLocationFromSearch('${currentQuery}')" style="padding: 8px 16px; border-radius: 6px; font-size: 12px; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
                        <i class="fas fa-plus-circle"></i> Daftarkan "${currentQuery.toUpperCase()}" & Pilih
                    </button>
                </div>
            `;
        } else {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-tertiary); padding: 20px;">Tidak ada kubikel yang cocok</div>';
        }
        return;
    }

    grid.innerHTML = cubicles.map(id => {
        return `<button type="button" class="cubicle-picker-btn" onclick="selectCubicleForTarget('${id}')">${id}</button>`;
    }).join('');
}

function filterCubiclePicker(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
        renderCubiclePickerGrid(cachedCubiclesList);
        return;
    }
    const filtered = cachedCubiclesList.filter(id => id.toLowerCase().includes(q));
    renderCubiclePickerGrid(filtered, query.trim());
}

function selectCubicleForTarget(val) {
    const targetEl = document.getElementById(cubiclePickerTargetInput);
    if (targetEl) {
        targetEl.value = val;
        // If this is itemLocation, trigger live asset preview
        if (cubiclePickerTargetInput === 'itemLocation' && typeof updateLiveAssetPreview === 'function') {
            updateLiveAssetPreview();
        }
    }
    closeModal('cubiclePickerModal');
}

window.openCubiclePicker = openCubiclePicker;
window.filterCubiclePicker = filterCubiclePicker;
window.selectCubicleForTarget = selectCubicleForTarget;

async function renderMap() {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    // Load data only once if not loaded
    if (!isDataLoaded) {
        await loadCubiclePositions();
    }

    try {
        if (activePage.id === 'map-designerPage') {
            renderDesigner();
        } else if (activePage.id === 'map-viewPage') {
            renderNormalView();
        }
    } catch (err) {
        console.error('[MAP] Render error:', err);
    }
}

// ==========================================================================
// MODERN ENTERPRISE INTERACTIVE MAP VIEW ENGINE (Stop-Slop Suite)
// ==========================================================================
let mapViewState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    currentFilter: 'all',
    currentZone: 'all',
    hasUserInteracted: false,
    stageBounds: { minX: 0, maxX: 1200, minY: 0, maxY: 1600 },
    isSidebarCollapsed: false
};

function renderNormalView() {
    const stage = document.getElementById('officeMapStage') || document.getElementById('officeMap');
    const poolContainer = document.getElementById('unassignedPool');
    const viewport = document.getElementById('officeMapViewport');
    if (!stage || !poolContainer) return;

    // 1. Render Pool Sidebar (Unassigned Items)
    const unassigned = inventoryData.filter(item => !getCubicleId(item));
    const poolCountBadge = document.getElementById('poolCountBadge');
    const poolToggleText = document.getElementById('poolToggleText');
    if (poolCountBadge) poolCountBadge.textContent = unassigned.length;
    if (poolToggleText) poolToggleText.textContent = `Barang (${unassigned.length})`;

    if (unassigned.length === 0) {
        poolContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 15px; color: var(--text-secondary);">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(16, 185, 129, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; color: #10b981;">
                    <i class="fas fa-check-circle" style="font-size: 22px;"></i>
                </div>
                <p style="font-size: 12.5px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px;">Semua Aset Terpetakan</p>
                <p style="font-size: 10.5px; color: var(--text-tertiary); margin: 0 0 12px; line-height: 1.4;">Tidak ada barang menganggur tanpa lokasi meja.</p>
                <button type="button" class="btn-sm primary-btn" onclick="navigateTo('input')" style="font-size: 11px; padding: 6px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px; margin: 0 auto;">
                    <i class="fas fa-plus"></i> Tambah Inventaris
                </button>
            </div>
        `;
    } else {
        poolContainer.innerHTML = unassigned.map(item => `
            <div class="pool-item" draggable="true" ondragstart="dragItemToMap(event, '${item.id}')" title="Tarik ke kubikel di denah untuk menugaskan">
                <h4>
                    <span>${item.name}</span>
                    <span style="font-size: 9px; color: var(--primary); background: rgba(37,99,235,0.1); padding: 1px 5px; border-radius: 4px;">${item.kategori || 'Aset'}</span>
                </h4>
                <p><i class="fas fa-tag" style="font-size: 9px; opacity: 0.7;"></i> ${item.merk || '-'} • SN: <strong>${item.sn || '-'}</strong></p>
                <p style="font-size: 9.5px; color: var(--text-tertiary); margin-top: 2px;"><i class="fas fa-map-marker-alt"></i> ${item.lokasi || 'Tanpa Lokasi'}</p>
            </div>
        `).join('');
    }

    // 2. Render Office Map Stage
    stage.innerHTML = '';
    const validPositions = (cubiclePositions || []).filter(p => (p.x > 0 || p.y > 0));

    if (validPositions.length === 0) {
        stage.innerHTML = `
            <div class="empty-state mini" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center;">
                <i class="fas fa-map-marked-alt" style="font-size: 32px; color: var(--text-tertiary); margin-bottom: 8px;"></i>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">Belum ada denah yang diletakkan di kanvas</p>
                <a href="#map-designer" style="font-size: 11px; color: var(--primary); text-decoration: underline; margin-top: 4px; display: inline-block;">Atur Tata Letak di Designer</a>
            </div>
        `;
        updateMapViewCounters(0, 0, 0, 0);
        return;
    }

    // Calculate Bounding Box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    validPositions.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    mapViewState.stageBounds = { minX, maxX, minY, maxY };

    // Group items by cluster/block for island pod cards
    const clusterMap = {};
    let totalOccupied = 0;
    let totalVacant = 0;
    let totalRooms = 0;
    let totalAll = 0;

    validPositions.forEach(pos => {
        const isLabel = pos.type === 'label' || (pos.cubicle_id && pos.cubicle_id.startsWith('LABEL_'));
        if (isLabel) return;

        totalAll++;
        const isRoom = pos.type === 'room' || (pos.cubicle_id && (pos.cubicle_id.toUpperCase().includes('LOBBY') || pos.cubicle_id.toUpperCase().includes('NOC') || pos.cubicle_id.toUpperCase().includes('SERVER') || pos.cubicle_id.toUpperCase().includes('MEETING')));
        if (isRoom) {
            totalRooms++;
        }

        const items = inventoryData.filter(inv => getCubicleId(inv) === pos.cubicle_id);
        if (items.length > 0) totalOccupied++;
        else if (!isRoom) totalVacant++;

        if (!isRoom) {
            const block = (pos.cubicle_id.split('-')[0] || '').trim().toUpperCase();
            if (block && block.length === 1 && block >= 'A' && block <= 'Z') {
                if (!clusterMap[block]) clusterMap[block] = [];
                clusterMap[block].push(pos);
            }
        }
    });

    updateMapViewCounters(totalAll, totalOccupied, totalVacant, totalRooms);

    // 2A. Render Cluster Pod Cards (Island Enclosures)
    Object.keys(clusterMap).sort().forEach(block => {
        const nodes = clusterMap[block];
        if (nodes.length >= 2) {
            let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
            nodes.forEach(n => {
                if (n.x < bMinX) bMinX = n.x;
                if (n.x > bMaxX) bMaxX = n.x;
                if (n.y < bMinY) bMinY = n.y;
                if (n.y > bMaxY) bMaxY = n.y;
            });

            const podCard = document.createElement('div');
            podCard.className = `cluster-pod-card pod-block-${block}`;
            podCard.style.left = `${bMinX - 16}px`;
            podCard.style.top = `${bMinY - 26}px`;
            podCard.style.width = `${(bMaxX - bMinX) + 84}px`;
            podCard.style.height = `${(bMaxY - bMinY) + 88}px`;

            podCard.innerHTML = `
                <div class="pod-header">
                    <span class="pod-dot"></span>
                    <span>Kluster ${block}</span>
                    <span class="pod-badge">(${nodes.length} Meja)</span>
                </div>
            `;
            stage.appendChild(podCard);
        }
    });

    // 2B. Render Desks & Rooms
    validPositions.forEach(pos => {
        const isLabel = pos.type === 'label' || (pos.cubicle_id && pos.cubicle_id.startsWith('LABEL_'));
        if (isLabel) {
            const div = document.createElement('div');
            div.className = 'view-label mini';
            div.style.left = `${pos.x}px`;
            div.style.top = `${pos.y}px`;
            div.style.fontSize = '9px';
            div.style.padding = '3px 8px';
            div.style.borderRadius = '6px';
            div.style.background = 'rgba(16, 185, 129, 0.12)';
            div.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            div.style.color = '#34d399';
            div.style.fontWeight = '700';
            div.style.zIndex = '3';
            div.textContent = pos.text || '';
            stage.appendChild(div);
            return;
        }

        const items = inventoryData.filter(inv => getCubicleId(inv) === pos.cubicle_id);
        const isOccupied = items.length > 0;
        const isRoom = pos.type === 'room' || (pos.cubicle_id && (pos.cubicle_id.toUpperCase().includes('LOBBY') || pos.cubicle_id.toUpperCase().includes('NOC') || pos.cubicle_id.toUpperCase().includes('SERVER') || pos.cubicle_id.toUpperCase().includes('MEETING')));

        const div = document.createElement('div');
        div.setAttribute('data-id', pos.cubicle_id);
        div.setAttribute('data-type', isRoom ? 'room' : 'cubicle');
        div.setAttribute('data-occupied', isOccupied ? 'true' : 'false');
        div.style.left = `${pos.x}px`;
        div.style.top = `${pos.y}px`;

        if (isRoom) {
            div.className = `cubicle-view mini room-card ${isOccupied ? 'occupied' : ''}`;
            let roomIcon = 'fa-building';
            const upper = pos.cubicle_id.toUpperCase();
            if (upper.includes('NOC')) roomIcon = 'fa-network-wired';
            else if (upper.includes('SERVER')) roomIcon = 'fa-server';
            else if (upper.includes('MEETING') || upper.includes('RAPAT')) roomIcon = 'fa-users';

            div.innerHTML = `
                <div class="room-header-wrap">
                    <i class="fas ${roomIcon} room-icon"></i>
                    <span class="room-title">${pos.cubicle_id}</span>
                </div>
                <span class="room-subtitle">${isOccupied ? `${items.length} Aset Terpasang` : 'Area Publik'}</span>
                ${isOccupied ? `<span class="item-count-badge">${items.length}</span>` : ''}
                <div class="cubicle-tooltip">
                    <strong style="color: #34d399;">${pos.cubicle_id}</strong><br>
                    <span style="font-size: 10px; color: #94a3b8;">${isOccupied ? `${items.length} Barang Terpasang` : 'Ruangan Khusus / Belum ada barang'}</span>
                </div>
            `;
        } else {
            div.className = `cubicle-view mini desk-node ${isOccupied ? 'occupied' : ''}`;

            let iconClass = 'fa-plus';
            if (isOccupied) {
                const hasLaptop = items.some(i => (i.name || '').toLowerCase().includes('laptop'));
                const hasPC = items.some(i => (i.name || '').toLowerCase().includes('pc') || (i.name || '').toLowerCase().includes('server'));
                iconClass = hasLaptop ? 'fa-laptop' : (hasPC ? 'fa-server' : 'fa-desktop');
            }

            const itemsPreview = isOccupied ? items.slice(0, 2).map(i => `• ${i.name || 'Barang'}`).join('<br>') : '';
            div.innerHTML = `
                <span class="cubicle-id">${pos.cubicle_id}</span>
                <i class="fas ${iconClass} cubicle-icon"></i>
                ${isOccupied ? `<span class="item-count-badge">${items.length}</span>` : ''}
                <div class="cubicle-tooltip">
                    <strong>${pos.cubicle_id}</strong> • <span style="color: ${isOccupied ? '#60a5fa' : '#94a3b8'};">${isOccupied ? 'Terisi Aset' : 'Kosong'}</span><br>
                    ${isOccupied ? `<div style="font-size: 10px; color: #cbd5e1; margin-top: 3px;">${itemsPreview}${items.length > 2 ? `<br>+${items.length - 2} lainnya` : ''}</div>` : '<span style="font-size: 10px; color: #94a3b8;">Klik untuk kelola / drag barang ke sini</span>'}
                </div>
            `;
        }

        // Click handler to open detail modal
        div.onclick = (e) => {
            e.stopPropagation();
            if (typeof handleCubicleClick === 'function') {
                handleCubicleClick(pos.cubicle_id);
            }
        };

        // Drag & Drop Handlers from Pool Sidebar
        div.ondragover = (e) => {
            e.preventDefault();
            div.classList.add('drag-over');
        };

        div.ondragleave = () => {
            div.classList.remove('drag-over');
        };

        div.ondrop = (e) => {
            e.preventDefault();
            div.classList.remove('drag-over');
            dropItemToCubicle(e, pos.cubicle_id);
        };

        stage.appendChild(div);
    });

    // Auto-fit to viewport on initial render
    if (!mapViewState.hasUserInteracted) {
        setTimeout(() => fitMapViewMap(), 50);
    } else {
        applyMapViewTransform();
    }

    // Attach pan/drag listeners to viewport
    setupMapViewPanListeners(viewport || document.getElementById('officeMapViewport'));
}

function fitMapViewMap() {
    const viewport = document.getElementById('officeMapViewport');
    const stage = document.getElementById('officeMapStage');
    if (!viewport || !stage) return;

    const bounds = mapViewState.stageBounds;
    const contentW = Math.max(300, (bounds.maxX - bounds.minX) + 140);
    const contentH = Math.max(300, (bounds.maxY - bounds.minY) + 140);

    const contW = viewport.clientWidth || 900;
    const contH = viewport.clientHeight || 560;

    const scaleX = (contW - 40) / contentW;
    const scaleY = (contH - 40) / contentH;
    const optimalScale = Math.max(0.3, Math.min(scaleX, scaleY, 1.15));

    mapViewState.zoom = optimalScale;
    mapViewState.panX = Math.round((contW - contentW * optimalScale) / 2 - (bounds.minX - 70) * optimalScale);
    mapViewState.panY = Math.round((contH - contentH * optimalScale) / 2 - (bounds.minY - 70) * optimalScale);

    applyMapViewTransform();

    document.querySelectorAll('.zone-pill-btn[data-map-zone]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-map-zone') === 'all');
    });
}

function zoomMapViewMap(delta) {
    mapViewState.hasUserInteracted = true;
    const newZoom = Math.max(0.25, Math.min(2.5, mapViewState.zoom + delta));
    mapViewState.zoom = newZoom;
    applyMapViewTransform();
}

function focusMapViewZone(zone) {
    mapViewState.hasUserInteracted = true;
    document.querySelectorAll('.zone-pill-btn[data-map-zone]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-map-zone') === zone);
    });

    if (zone === 'all') {
        fitMapViewMap();
        return;
    }

    const viewport = document.getElementById('officeMapViewport');
    if (!viewport) return;

    const contW = viewport.clientWidth || 900;
    const contH = viewport.clientHeight || 560;

    const targetBlocks = zone.split('');
    const targetItems = (cubiclePositions || []).filter(p => (p.x > 0 || p.y > 0) && targetBlocks.some(b => p.cubicle_id && p.cubicle_id.startsWith(b + '-')));

    if (targetItems.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    targetItems.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    const contentW = Math.max(200, (maxX - minX) + 100);
    const contentH = Math.max(200, (maxY - minY) + 100);

    const scale = Math.max(0.5, Math.min((contW - 60) / contentW, (contH - 60) / contentH, 1.25));
    mapViewState.zoom = scale;
    mapViewState.panX = Math.round((contW - contentW * scale) / 2 - (minX - 50) * scale);
    mapViewState.panY = Math.round((contH - contentH * scale) / 2 - (minY - 50) * scale);

    applyMapViewTransform();
}

function setMapViewFilter(filter) {
    mapViewState.currentFilter = filter;
    document.querySelectorAll('.map-filter-pill[data-map-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-map-filter') === filter);
    });

    const nodes = document.querySelectorAll('#officeMapStage .cubicle-view');
    nodes.forEach(node => {
        const isOccupied = node.getAttribute('data-occupied') === 'true';
        const type = node.getAttribute('data-type');

        let match = false;
        if (filter === 'all') match = true;
        else if (filter === 'occupied') match = isOccupied;
        else if (filter === 'vacant') match = (!isOccupied && type !== 'room');
        else if (filter === 'rooms') match = (type === 'room');

        if (match) {
            node.classList.remove('dimmed');
        } else {
            node.classList.add('dimmed');
        }
    });
}

function updateMapViewCounters(all, occupied, vacant, rooms) {
    const elAll = document.getElementById('mapViewCountAll');
    const elOcc = document.getElementById('mapViewCountOccupied');
    const elVac = document.getElementById('mapViewCountVacant');
    const elRms = document.getElementById('mapViewCountRooms');

    if (elAll) elAll.textContent = all;
    if (elOcc) elOcc.textContent = occupied;
    if (elVac) elVac.textContent = vacant;
    if (elRms) elRms.textContent = rooms;
}

function applyMapViewTransform() {
    const stage = document.getElementById('officeMapStage');
    if (!stage) return;
    stage.style.transform = `translate(${mapViewState.panX}px, ${mapViewState.panY}px) scale(${mapViewState.zoom})`;
}

function toggleMapViewSidebar() {
    const sidebar = document.getElementById('mapPoolSidebar');
    const btn = document.getElementById('btnTogglePoolSidebar');
    if (!sidebar) return;

    mapViewState.isSidebarCollapsed = !mapViewState.isSidebarCollapsed;
    if (mapViewState.isSidebarCollapsed) {
        sidebar.classList.add('collapsed');
        if (btn) btn.classList.add('active');
    } else {
        sidebar.classList.remove('collapsed');
        if (btn) btn.classList.remove('active');
    }

    setTimeout(() => fitMapViewMap(), 300);
}

let isMapViewPanListenerAttached = false;
function setupMapViewPanListeners(viewport) {
    if (isMapViewPanListenerAttached || !viewport) return;
    isMapViewPanListenerAttached = true;

    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.cubicle-view') || e.target.closest('button')) return;
        mapViewState.isDragging = true;
        mapViewState.hasUserInteracted = true;
        mapViewState.dragStartX = e.clientX - mapViewState.panX;
        mapViewState.dragStartY = e.clientY - mapViewState.panY;
        viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!mapViewState.isDragging) return;
        mapViewState.panX = e.clientX - mapViewState.dragStartX;
        mapViewState.panY = e.clientY - mapViewState.dragStartY;
        applyMapViewTransform();
    });

    window.addEventListener('mouseup', () => {
        if (mapViewState.isDragging) {
            mapViewState.isDragging = false;
            viewport.style.cursor = 'grab';
        }
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        mapViewState.hasUserInteracted = true;
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        zoomMapViewMap(delta);
    }, { passive: false });
}

function highlightMapViewMap() {
    const query = (document.getElementById('mapViewSearchInput')?.value || '').toLowerCase().trim();
    const cubicles = document.querySelectorAll('#officeMapStage .cubicle-view');

    if (!query) {
        cubicles.forEach(c => c.classList.remove('highlight-pulse', 'dimmed'));
        if (mapViewState.currentFilter !== 'all') {
            setMapViewFilter(mapViewState.currentFilter);
        }
        return;
    }

    cubicles.forEach(c => {
        const cubicleId = c.getAttribute('data-id') || '';
        const items = inventoryData.filter(inv => getCubicleId(inv) === cubicleId);

        const match = cubicleId.toLowerCase().includes(query) ||
            items.some(inv =>
                (inv.name && inv.name.toLowerCase().includes(query)) ||
                (inv.sn && inv.sn.toLowerCase().includes(query)) ||
                (inv.merk && inv.merk.toLowerCase().includes(query))
            );

        if (match) {
            c.classList.add('highlight-pulse');
            c.classList.remove('dimmed');
        } else {
            c.classList.remove('highlight-pulse');
            c.classList.add('dimmed');
        }
    });
}

// Global exposures
window.renderNormalView = renderNormalView;
window.fitMapViewMap = fitMapViewMap;
window.zoomMapViewMap = zoomMapViewMap;
window.focusMapViewZone = focusMapViewZone;
window.setMapViewFilter = setMapViewFilter;
window.toggleMapViewSidebar = toggleMapViewSidebar;
window.highlightMapViewMap = highlightMapViewMap;

function renderDesigner() {
    const palette = document.getElementById('cubiclePalette');
    const canvas = document.getElementById('designerCanvas');
    if (!palette || !canvas) return;

    let paletteHtml = '';
    const renderedIds = new Set();

    // 1. Configured blocks (A-F)
    Object.keys(cubicleConfig).forEach(block => {
        for (let i = 1; i <= cubicleConfig[block]; i++) {
            const id = `${block}-${String(i).padStart(2, '0')}`;
            renderedIds.add(id);
            if (!cubiclePositions.find(p => p.cubicle_id === id && (p.x > 0 || p.y > 0))) {
                const isSelected = selectedPaletteItems.has(id);
                paletteHtml += `
                    <div class="palette-item ${isSelected ? 'selected' : ''}" 
                         draggable="true" 
                         ondragstart="dragPaletteStart(event, '${id}')"
                         onclick="togglePaletteItem(event, '${id}')">
                        ${id}
                    </div>
                `;
            }
        }
    });

    // 2. Custom cubicles/rooms registered in cubiclePositions that are not yet placed on the canvas
    (cubiclePositions || []).forEach(p => {
        const isLabel = p.type === 'label' || (p.cubicle_id && p.cubicle_id.startsWith('LABEL_'));
        if (!isLabel && p.cubicle_id && !renderedIds.has(p.cubicle_id)) {
            renderedIds.add(p.cubicle_id);
            const isPlacedOnCanvas = (p.x > 0 || p.y > 0);
            if (!isPlacedOnCanvas) {
                const isSelected = selectedPaletteItems.has(p.cubicle_id);
                paletteHtml += `
                    <div class="palette-item custom-palette-item ${isSelected ? 'selected' : ''}" 
                         draggable="true" 
                         ondragstart="dragPaletteStart(event, '${p.cubicle_id}')"
                         onclick="togglePaletteItem(event, '${p.cubicle_id}')"
                         title="${p.type === 'room' ? 'Ruangan' : 'Kubikel'} - Klik untuk pilih, tarik ke kanvas"
                         style="border-color: rgba(16, 185, 129, 0.5); position: relative; padding-right: 18px;">
                        <span>${p.cubicle_id}</span>
                        <span onclick="deleteCustomCubiclePermanently(event, '${p.cubicle_id}')" title="Hapus Permanen" style="position: absolute; right: 4px; top: 2px; font-size: 11px; color: #ef4444; opacity: 0.7; cursor: pointer; padding: 0 2px;">×</span>
                    </div>
                `;
            }
        }
    });

    palette.innerHTML = paletteHtml || '<div style="color: var(--text-tertiary); font-size: 12px; padding: 12px; text-align: center; width: 100%;">Semua kubikel telah diletakkan di kanvas. Klik "+ Kubikel Baru" untuk menambah nomor meja.</div>';

    // Update bulk add button
    const bulkAddBtn = document.getElementById('bulkAddBtn');
    const selectedCountSpan = document.getElementById('selectedPaletteCount');
    if (bulkAddBtn && selectedCountSpan) {
        if (selectedPaletteItems.size > 0) {
            bulkAddBtn.style.display = 'block';
            selectedCountSpan.textContent = selectedPaletteItems.size;
        } else {
            bulkAddBtn.style.display = 'none';
        }
    }

    const hint = canvas.querySelector('.canvas-grid-hint');
    if (cubiclePositions.length > 0) hint.style.display = 'none';
    else hint.style.display = 'block';

    const existing = canvas.querySelectorAll('.placed-cubicle, .placed-label');
    existing.forEach(el => el.remove());

    cubiclePositions.forEach(pos => {
        const isLabel = pos.type === 'label' || (pos.cubicle_id && pos.cubicle_id.startsWith('LABEL_'));
        // Meja atau ruangan yang belum ditaruh di kanvas (x: 0, y: 0) tidak digambar di kanvas (menunggu di palette)
        if (!isLabel && (!pos.x || pos.x <= 0) && (!pos.y || pos.y <= 0)) {
            return;
        }

        const div = document.createElement('div');

        if (isLabel) {
            div.className = 'placed-label';
            div.setAttribute('data-id', pos.cubicle_id);
            div.style.left = `${pos.x}px`;
            div.style.top = `${pos.y}px`;
            div.innerHTML = `
                <span class="label-text">${pos.text || 'Label'}</span>
                <button class="remove-placed-btn" onclick="removeFromCanvas(event, '${pos.cubicle_id}')">×</button>
            `;
            div.ondblclick = () => editLabelText(pos.cubicle_id);
        } else {
            div.className = 'placed-cubicle';
            div.setAttribute('data-id', pos.cubicle_id);
            div.style.left = `${pos.x}px`;
            div.style.top = `${pos.y}px`;
            div.innerHTML = `
                <span class="cubicle-id">${pos.cubicle_id}</span>
                <i class="fas fa-th cubicle-icon"></i>
                <button class="remove-placed-btn" onclick="removeFromCanvas(event, '${pos.cubicle_id}')">×</button>
            `;
        }

        div.onmousedown = (e) => startMoveOnCanvas(e, pos.cubicle_id);
        canvas.appendChild(div);
    });
}

function removeFromCanvas(event, cubicleId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    console.log('Kembalikan ke palette:', cubicleId);

    const matches = (cubiclePositions || []).filter(p => p.cubicle_id === cubicleId);
    const isLabel = matches.some(m => m.type === 'label' || (m.cubicle_id && m.cubicle_id.startsWith('LABEL_')));

    if (isLabel) {
        cubiclePositions = cubiclePositions.filter(p => p.cubicle_id !== cubicleId);
    } else {
        const itemType = matches.length > 0 ? (matches[0].type || 'cubicle') : 'cubicle';
        // Hapus duplikat dan pastikan tersimpan 1 instance dengan koordinat x:0, y:0
        cubiclePositions = cubiclePositions.filter(p => p.cubicle_id !== cubicleId);
        cubiclePositions.push({
            cubicle_id: cubicleId,
            x: 0,
            y: 0,
            type: itemType,
            text: cubicleId
        });
        showToast(`"${cubicleId}" dikembalikan ke Daftar Kubikel`);
    }

    renderDesigner();
}

async function deleteCustomCubiclePermanently(event, cubicleId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Kubikel Permanen',
        message: `Hapus data kubikel / meja <strong>"${cubicleId}"</strong> secara permanen dari sistem denah?`,
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;

    try {
        const res = await fetch(`/api/cubicle-positions/${encodeURIComponent(cubicleId)}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            cubiclePositions = cubiclePositions.filter(p => p.cubicle_id !== cubicleId);
            showToast(`"${cubicleId}" berhasil dihapus permanen`);
            populateCubicleSuggestions();
            renderDesigner();
        } else {
            showToast('Gagal menghapus', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Gagal menghapus', 'error');
    }
}
window.deleteCustomCubiclePermanently = deleteCustomCubiclePermanently;

// EXPOSE TO GLOBAL SCOPE
window.dragPaletteStart = dragPaletteStart;
window.dropToCanvas = dropToCanvas;
window.allowDrop = allowDrop;
window.removeFromCanvas = removeFromCanvas;
window.saveMapLayout = saveMapLayout;
window.startMoveOnCanvas = startMoveOnCanvas;

// DRAG FROM PALETTE TO CANVAS
function dragPaletteStart(e, cubicleId) {
    e.dataTransfer.setData("type", "palette");
    e.dataTransfer.setData("cubicleId", cubicleId);
    if (e.target) e.target.style.opacity = '0.5';
}

function dropToCanvas(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData("type");
    const cubicleId = e.dataTransfer.getData("cubicleId");

    console.log('Dropped type:', type, 'cubicle:', cubicleId);

    if (type !== "palette" || !cubicleId) return;

    const canvas = document.getElementById('designerCanvas');
    const rect = canvas.getBoundingClientRect();

    const x = Math.max(10, Math.round((e.clientX - rect.left - 30) / 10) * 10);
    const y = Math.max(10, Math.round((e.clientY - rect.top - 30) / 10) * 10);

    const existingType = (cubiclePositions.find(p => p.cubicle_id === cubicleId)?.type) || 'cubicle';
    cubiclePositions = cubiclePositions.filter(p => p.cubicle_id !== cubicleId);
    cubiclePositions.push({
        cubicle_id: cubicleId,
        x: x,
        y: y,
        type: existingType,
        text: cubicleId
    });

    renderDesigner();
}

function allowDrop(e) {
    e.preventDefault();
}

function startMoveOnCanvas(e, cubicleId) {
    if (e.target && e.target.classList.contains('remove-placed-btn')) return;

    const canvas = document.getElementById('designerCanvas');
    const rect = canvas.getBoundingClientRect();
    const item = cubiclePositions.find(p => p.cubicle_id === cubicleId);
    if (!item) return;

    function onMouseMove(moveEvent) {
        const x = Math.round((moveEvent.clientX - rect.left - 30) / 10) * 10;
        const y = Math.round((moveEvent.clientY - rect.top - 30) / 10) * 10;

        item.x = Math.max(0, x);
        item.y = Math.max(0, y);

        const el = document.querySelector(`.placed-cubicle[data-id="${cubicleId}"]`);
        if (el) {
            el.style.left = `${item.x}px`;
            el.style.top = `${item.y}px`;
        }
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        renderDesigner();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

async function saveMapLayout() {
    try {
        const response = await fetch('/api/cubicle-positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions: cubiclePositions })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Denah berhasil disimpan!');
            navigateTo('map-view');
        } else {
            showToast('Gagal menyimpan denah!', 'error');
        }
    } catch (err) {
        console.error(err);
    }
}

// NEW: Bulk Selection and Addition Functions
function togglePaletteItem(event, id) {
    if (selectedPaletteItems.has(id)) {
        selectedPaletteItems.delete(id);
    } else {
        selectedPaletteItems.add(id);
    }
    renderDesigner();
}

async function addSelectedToCanvas() {
    if (selectedPaletteItems.size === 0) return;

    // Arrange items in a grid starting from an empty space
    let startX = 50;
    let startY = 50;
    let index = 0;
    const cols = 5;
    const spacing = 80;

    const itemsToAdd = Array.from(selectedPaletteItems);
    itemsToAdd.forEach(id => {
        const row = Math.floor(index / cols);
        const col = index % cols;

        cubiclePositions.push({
            cubicle_id: id,
            x: startX + (col * spacing),
            y: startY + (row * spacing)
        });
        index++;
    });

    selectedPaletteItems.clear();
    renderDesigner();
    showToast(`Berhasil menambahkan ${itemsToAdd.length} kubikel`);
}

async function addNewLabel() {
    const labelText = await showPromptDialog({
        title: 'Tambah Label Denah',
        message: 'Masukkan teks label nama area, zona, atau ruangan:',
        placeholder: 'Contoh: Area A, Ruang Meeting, Server...',
        confirmText: 'Tambahkan Label',
        cancelText: 'Batal'
    });
    if (!labelText || !labelText.trim()) return;

    const id = `LABEL_${Date.now()}`;
    cubiclePositions.push({
        cubicle_id: id,
        type: 'label',
        text: labelText.trim(),
        x: 100,
        y: 100
    });
    renderDesigner();
}

async function editLabelText(id) {
    const item = cubiclePositions.find(p => p.cubicle_id === id);
    if (!item || item.type !== 'label') return;

    const newText = await showPromptDialog({
        title: 'Edit Teks Label',
        message: 'Perbarui teks label pada denah:',
        defaultValue: item.text,
        confirmText: 'Simpan',
        cancelText: 'Batal'
    });
    if (newText !== null && newText.trim() !== '') {
        item.text = newText.trim();
        renderDesigner();
    }
}

// SHARED FUNCTIONS
function filterPoolItems() {
    const search = document.getElementById('poolSearchInput').value.toLowerCase();
    const poolItems = document.querySelectorAll('.pool-item');
    poolItems.forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(search) ? 'block' : 'none';
    });
}

function dragItemToMap(e, itemId) {
    e.dataTransfer.setData("type", "item");
    e.dataTransfer.setData("itemId", itemId);
}

function allowDrop(e) { e.preventDefault(); }

async function dropItemToCubicle(event, cubicleId) {
    event.preventDefault();
    const type = event.dataTransfer.getData("type");
    const itemId = event.dataTransfer.getData("itemId");
    if (type !== "item" || !itemId) return;
    await assignItemToCubicle(itemId, cubicleId);
}

let selectedCubicleId = null;
async function handleCubicleClick(cubicleId) {
    if (!cubicleId) return;
    console.log('Opening cubicle detail:', cubicleId);

    selectedCubicleId = cubicleId;
    const cubicleIdEl = document.getElementById('detailCubicleId');
    if (cubicleIdEl) cubicleIdEl.innerText = cubicleId;

    const itemsList = document.getElementById('cubicleItemsList');
    if (!itemsList) return;

    itemsList.innerHTML = `
        <div class="skeleton-shimmer" style="height: 50px; margin-bottom: 10px; border-radius: 8px;"></div>
        <div class="skeleton-shimmer" style="height: 50px; margin-bottom: 10px; border-radius: 8px;"></div>
        <div class="skeleton-shimmer" style="height: 50px; border-radius: 8px;"></div>
    `;

    // Ensure data is fresh
    const items = inventoryData.filter(item => getCubicleId(item) === cubicleId);

    if (items.length === 0) {
        itemsList.innerHTML = `
            <div class="empty-state-card" style="text-align: center; padding: 35px 20px; animation: fadeIn 0.4s ease;">
                <div style="width: 55px; height: 55px; background: rgba(37, 99, 235, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;">
                    <i class="fas fa-box-open" style="font-size: 24px; color: var(--primary);"></i>
                </div>
                <p style="font-weight: 700; margin-bottom: 6px; color: var(--text-primary); font-size: 15px;">Belum Ada Inventaris</p>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px; max-width: 320px; margin-left: auto; margin-right: auto;">Kubikel ini belum memiliki aset terpasang. Klik tombol di bawah untuk memilih dan menugaskan barang.</p>
                <button type="button" class="primary-btn" onclick="openAssignFromDetail()" style="padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; margin: 0 auto; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-plus-circle"></i> Pilih & Pasang Barang
                </button>
            </div>
        `;
    } else {
        itemsList.innerHTML = items.map((item, idx) => {
            const kondisi = item.kondisiAfter || item.kondisiBefore || 'Baik';
            const statusClass = getStatusBadgeClass(kondisi);

            return `
            <div class="detailed-item-card" style="display: flex; align-items: center; background: var(--bg-secondary); padding: 16px; border-radius: 14px; margin-bottom: 15px; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); animation: slideInUp 0.4s ease forwards; animation-delay: ${idx * 0.08}s; opacity: 0;">
                <div class="item-icon-circle" style="width: 50px; height: 50px; border-radius: 14px; background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%); color: var(--primary); display: flex; align-items: center; justify-content: center; margin-right: 18px; font-size: 20px; border: 1px solid rgba(37, 99, 235, 0.1);">
                    <i class="fas ${getItemIcon(item.name)}"></i>
                </div>
                <div class="item-info" style="flex: 1;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 700; font-size: 15px; color: var(--text-primary);">${item.name}</span>
                        <span class="status-badge ${statusClass}" style="font-size: 10px; font-weight: 600; text-transform: uppercase;">${kondisi}</span>
                    </div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 2px;">
                        <span style="color: var(--primary); font-weight: 600;">${item.id}</span> | ${item.merk || '-'}
                    </div>
                    <div style="font-size: 11px; color: var(--text-tertiary); display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
                        <span><i class="fas fa-barcode"></i> SN: ${item.sn || '-'}</span>
                        ${item.name.toLowerCase().includes('headset') && (item.snConverter || item.sn_converter) ? `<span><i class="fas fa-link"></i> Conv: ${item.snConverter || item.sn_converter}</span>` : ''}
                        <span><i class="fas fa-map-marker-alt"></i> ${item.lokasi || '-'}</span>
                    </div>
                </div>
                <div class="item-actions" style="margin-left: 10px; display: flex; gap: 8px;">
                    <button class="action-btn-mini" onclick="closeModal('cubicleDetailModal'); viewItem('${item.id}')" title="Buka Detail Aset" style="width: 36px; height: 36px; border-radius: 10px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="unassign-btn" onclick="assignItemToCubicle('${item.id}', '')" title="Keluarkan dari kubikel" style="width: 36px; height: 36px; border-radius: 10px;">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');
    }

    openModal('cubicleDetailModal');
}

let currentAssignFilterTab = 'available';

function openAssignFromDetail() {
    if (!selectedCubicleId) return;
    closeModal('cubicleDetailModal');
    openAssignModal(selectedCubicleId);
}

function openAssignModal(cubicleId) {
    selectedCubicleId = cubicleId;
    const badge = document.getElementById('assignTargetCubicleBadge');
    if (badge) badge.textContent = cubicleId;

    const searchInput = document.getElementById('assignModalSearchInput');
    if (searchInput) searchInput.value = '';

    currentAssignFilterTab = 'available';
    updateAssignFilterTabsUI();
    renderAssignItemsList();
    openModal('assignItemToCubicleModal');
}

function setAssignFilterTab(tab) {
    currentAssignFilterTab = tab;
    updateAssignFilterTabsUI();
    renderAssignItemsList();
}

function updateAssignFilterTabsUI() {
    const tabAvailable = document.getElementById('assignTabAvailable');
    const tabAll = document.getElementById('assignTabAll');
    if (tabAvailable) {
        if (currentAssignFilterTab === 'available') {
            tabAvailable.style.background = 'var(--primary)';
            tabAvailable.style.color = '#ffffff';
            tabAvailable.style.borderColor = 'var(--primary)';
            tabAvailable.style.fontWeight = '600';
        } else {
            tabAvailable.style.background = 'var(--bg-card)';
            tabAvailable.style.color = 'var(--text-secondary)';
            tabAvailable.style.borderColor = 'var(--border)';
            tabAvailable.style.fontWeight = '500';
        }
    }
    if (tabAll) {
        if (currentAssignFilterTab === 'all') {
            tabAll.style.background = 'var(--primary)';
            tabAll.style.color = '#ffffff';
            tabAll.style.borderColor = 'var(--primary)';
            tabAll.style.fontWeight = '600';
        } else {
            tabAll.style.background = 'var(--bg-card)';
            tabAll.style.color = 'var(--text-secondary)';
            tabAll.style.borderColor = 'var(--border)';
            tabAll.style.fontWeight = '500';
        }
    }
}

function renderAssignItemsList() {
    const container = document.getElementById('assignModalItemsList');
    const countInfo = document.getElementById('assignModalCountInfo');
    if (!container) return;

    const q = (document.getElementById('assignModalSearchInput')?.value || '').toLowerCase().trim();

    let items = Array.isArray(inventoryData) ? [...inventoryData] : [];

    if (currentAssignFilterTab === 'available') {
        items = items.filter(item => {
            const cId = getCubicleId(item);
            return !cId || cId === '-' || (item.lokasi && item.lokasi.toLowerCase().includes('gudang'));
        });
    }

    if (q) {
        items = items.filter(item => {
            return (item.name || '').toLowerCase().includes(q) ||
                   (item.merk || '').toLowerCase().includes(q) ||
                   (item.sn || '').toLowerCase().includes(q) ||
                   (item.id || '').toLowerCase().includes(q) ||
                   (item.lokasi || '').toLowerCase().includes(q);
        });
    }

    if (countInfo) {
        countInfo.textContent = `${items.length} barang inventaris`;
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: var(--primary); font-size: 22px;">
                    <i class="fas fa-box-open"></i>
                </div>
                <p style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: var(--text-primary);">Tidak Ada Barang Ditemukan</p>
                <p style="font-size: 12px; margin-bottom: 16px;">${currentAssignFilterTab === 'available' ? 'Semua barang sudah terpasang di kubikel, atau coba beralih ke tab \"Semua Inventaris\".' : 'Tidak ada data barang yang sesuai dengan kata kunci pencarian.'}</p>
                <button type="button" onclick="quickRegisterNewAssetForCubicle()" class="primary-btn" style="padding: 8px 16px; border-radius: 8px; font-size: 12px; margin: 0 auto; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fas fa-plus"></i> Daftarkan Barang Baru ke ${selectedCubicleId}
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const currentCubicle = getCubicleId(item);
        const isAlreadyHere = currentCubicle === selectedCubicleId;
        const kondisi = item.kondisiAfter || item.kondisiBefore || 'Baik';
        const statusClass = getStatusBadgeClass(kondisi);

        let locationBadge = '';
        if (!currentCubicle) {
            locationBadge = `<span style="font-size: 10.5px; padding: 2px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 500;"><i class="fas fa-warehouse"></i> ${item.lokasi || 'Standby'}</span>`;
        } else if (isAlreadyHere) {
            locationBadge = `<span style="font-size: 10.5px; padding: 2px 7px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 600;"><i class="fas fa-check"></i> Sudah di ${selectedCubicleId}</span>`;
        } else {
            locationBadge = `<span style="font-size: 10.5px; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 500;"><i class="fas fa-exchange-alt"></i> Di Kubikel ${currentCubicle}</span>`;
        }

        return `
            <div class="assign-item-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; transition: all 0.2s ease; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; border: 1px solid rgba(37, 99, 235, 0.15);">
                        <i class="fas ${getItemIcon(item.name)}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">${item.name}</span>
                            <span class="status-badge ${statusClass}" style="font-size: 9.5px; padding: 1px 6px;">${kondisi}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span><strong style="color: var(--primary);">${item.id}</strong> | ${item.merk || '-'}</span>
                            <span><i class="fas fa-barcode"></i> SN: ${item.sn || '-'}</span>
                            ${locationBadge}
                        </div>
                    </div>
                </div>
                <div style="flex-shrink: 0;">
                    ${isAlreadyHere ? `
                        <button type="button" disabled style="padding: 7px 12px; border-radius: 8px; background: var(--bg-card); color: var(--text-tertiary); border: 1px solid var(--border); font-size: 12px; font-weight: 600; cursor: not-allowed;">
                            Terpasang
                        </button>
                    ` : `
                        <button type="button" onclick="submitAssignItem('${item.id}', '${selectedCubicleId}')" class="primary-btn" style="padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
                            <i class="fas fa-plus"></i> Pasang
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

async function submitAssignItem(itemId, cubicleId) {
    closeModal('assignItemToCubicleModal');
    await assignItemToCubicle(itemId, cubicleId);
}

function closeAssignModalAndReturn() {
    closeModal('assignItemToCubicleModal');
    if (selectedCubicleId) {
        handleCubicleClick(selectedCubicleId);
    }
}

function quickRegisterNewAssetForCubicle() {
    const cubicle = selectedCubicleId;
    closeModal('assignItemToCubicleModal');
    closeModal('cubicleDetailModal');
    navigateTo('add-inventory');
    setTimeout(() => {
        const locInput = document.getElementById('itemLocation');
        if (locInput && cubicle) {
            locInput.value = cubicle;
            if (typeof updateLiveAssetPreview === 'function') updateLiveAssetPreview();
        }
    }, 300);
}

// Helper for icons
function getItemIcon(name) {
    if (!name) return 'fa-box';
    const n = name.toLowerCase();
    if (n.includes('monitor')) return 'fa-desktop';
    if (n.includes('laptop')) return 'fa-laptop';
    if (n.includes('keyboard')) return 'fa-keyboard';
    if (n.includes('mouse')) return 'fa-mouse';
    if (n.includes('headset')) return 'fa-headset';
    if (n.includes('pc')) return 'fa-server';
    if (n.includes('tv')) return 'fa-tv';
    if (n.includes('print')) return 'fa-print';
    if (n.includes('switch') || n.includes('router') || n.includes('network')) return 'fa-network-wired';
    if (n.includes('server')) return 'fa-server';
    if (n.includes('phone') || n.includes('telepon')) return 'fa-phone-alt';
    if (n.includes('camera') || n.includes('kamera') || n.includes('cctv')) return 'fa-video';
    return 'fa-box';
}

async function assignItemToCubicle(itemId, cubicleId) {
    try {
        const response = await fetch('/api/inventory/assign-cubicle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: itemId, cubicle_id: cubicleId })
        });
        if (response.ok) {
            const resData = await response.json();
            const item = inventoryData.find(inv => inv.id === itemId);
            if (item) {
                item.cubicle_id = cubicleId;
                item.cubicleId = cubicleId;
                if (cubicleId) item.lokasi = cubicleId;
                else item.lokasi = 'Gudang';
            }
            showToast(cubicleId ? `Barang berhasil ditugaskan ke ${cubicleId}` : 'Barang dikeluarkan dari kubikel');

            // Re-render denah interaktif & dashboard
            renderNormalView();
            if (typeof renderDashboardMap === 'function') renderDashboardMap();
            if (typeof renderMap === 'function') renderMap();

            // Re-open atau perbarui modal detail kubikel agar langsung menampilkan perubahan
            if (selectedCubicleId) {
                handleCubicleClick(selectedCubicleId);
            }
        } else {
            const err = await response.json();
            showToast(err.message || 'Gagal memproses', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Gagal memproses penugasan kubikel', 'error');
    }
}

// --- NON-INVENTORY MANAGEMENT ---
let nonInventoryData = [];

async function loadNonInventory() {
    try {
        const res = await fetch('/api/non-inventory');
        if (res.ok) {
            nonInventoryData = await res.json();
            renderNonInventoryTable();
        }
    } catch (err) {
        console.error('Gagal memuat data non-inventaris:', err);
    }
}

function renderNonInventoryTable() {
    const tbody = document.getElementById('nonInventoryTableBody');
    const emptyState = document.getElementById('nonInventoryEmptyState');
    if (!tbody) return;

    // Update KPI stats
    const totalItemsEl = document.getElementById('statNonInvTotalItems');
    const totalQtyEl = document.getElementById('statNonInvTotalQty');
    const lowStockEl = document.getElementById('statNonInvLowStock');

    const totalItems = nonInventoryData.length;
    const totalQty = nonInventoryData.reduce((acc, curr) => acc + (parseInt(curr.jumlah, 10) || 0), 0);
    const lowStockCount = nonInventoryData.filter(i => (parseInt(i.jumlah, 10) || 0) <= 5).length;

    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (totalQtyEl) totalQtyEl.textContent = totalQty;
    if (lowStockEl) lowStockEl.textContent = lowStockCount;

    const searchTerm = (document.getElementById('nonInvSearchInput')?.value || '').toLowerCase().trim();
    const filtered = nonInventoryData.filter(item => 
        (item.namaBarang || '').toLowerCase().includes(searchTerm) ||
        (item.kategori || '').toLowerCase().includes(searchTerm) ||
        (item.lokasi || '').toLowerCase().includes(searchTerm) ||
        (item.keterangan || '').toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(item => {
        const qtyNum = parseInt(item.jumlah, 10) || 0;
        const isLow = qtyNum <= 5;

        // Dynamic icon based on item name / category
        let itemIcon = 'fa-box';
        const nameLower = (item.namaBarang || '').toLowerCase();
        if (nameLower.includes('kabel') || nameLower.includes('lan') || nameLower.includes('utp') || nameLower.includes('rj45')) itemIcon = 'fa-network-wired';
        else if (nameLower.includes('lem') || nameLower.includes('tape') || nameLower.includes('solasi')) itemIcon = 'fa-tape';
        else if (nameLower.includes('kertas') || nameLower.includes('hvs') || nameLower.includes('buku')) itemIcon = 'fa-scroll';
        else if (nameLower.includes('tinta') || nameLower.includes('toner') || nameLower.includes('cartridge')) itemIcon = 'fa-print';
        else if (nameLower.includes('spidol') || nameLower.includes('pulpen') || nameLower.includes('pen')) itemIcon = 'fa-pen';
        else if (nameLower.includes('baterai') || nameLower.includes('battery')) itemIcon = 'fa-car-battery';

        const qtyBadge = isLow
            ? `<span style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; gap: 5px;">${qtyNum} <i class="fas fa-exclamation-circle" title="Stok Kritis (≤ 5)"></i></span>`
            : `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center;">${qtyNum}</span>`;

        return `
            <tr style="vertical-align: middle;">
                <td style="padding: 14px 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 38px; height: 38px; border-radius: 8px; background: rgba(37, 99, 235, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; border: 1px solid rgba(37, 99, 235, 0.15);">
                            <i class="fas ${itemIcon}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); text-transform: capitalize;">
                                ${item.namaBarang}
                            </div>
                            ${isLow ? `
                                <div style="margin-top: 3px;">
                                    <span style="font-size: 9.5px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">
                                        <i class="fas fa-exclamation-triangle"></i> STOK MENIPIS
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding: 14px 16px;">
                    <span class="badge" style="background: rgba(37, 99, 235, 0.12); color: #3b82f6; border: 1px solid rgba(37, 99, 235, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600; text-transform: uppercase;">
                        ${item.kategori || 'Umum'}
                    </span>
                </td>
                <td style="padding: 14px 16px;">${qtyBadge}</td>
                <td style="padding: 14px 16px; font-weight: 500; color: var(--text-secondary); font-size: 13px;">${item.satuan || 'Pcs'}</td>
                <td style="padding: 14px 16px;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-primary);">
                        <i class="fas fa-map-marker-alt" style="color: var(--primary); font-size: 12px;"></i>
                        <span>${item.lokasi || '-'}</span>
                    </div>
                </td>
                <td style="padding: 14px 16px;">
                    <span style="font-size: 12px; color: var(--text-secondary); max-width: 200px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.keterangan || ''}">
                        ${item.keterangan || '-'}
                    </span>
                </td>
                <td style="padding: 14px 16px; text-align: center; white-space: nowrap;">
                    <div class="non-inv-actions-wrap" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                        <button class="btn-stock-adjust btn-stock-in" onclick="openStockAdjustModal('${item.id}', 'IN')" title="Tambah Stok Masuk (Restock)">
                            <i class="fas fa-plus"></i> <span>Masuk</span>
                        </button>
                        <button class="btn-stock-adjust btn-stock-out" onclick="openStockAdjustModal('${item.id}', 'OUT')" title="Pakai / Pengeluaran Barang">
                            <i class="fas fa-minus"></i> <span>Pakai</span>
                        </button>
                        <div style="width: 1px; height: 18px; background: var(--border); margin: 0 3px;"></div>
                        <button class="btn-action-icon btn-edit" onclick="editNonInventory('${item.id}')" title="Edit Data Barang">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-action-icon btn-del" onclick="deleteNonInventory('${item.id}')" title="Hapus Barang">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openStockAdjustModal(id, type) {
    const item = nonInventoryData.find(i => i.id === id);
    if (!item) return;

    document.getElementById('stockItemId').value = item.id;
    document.getElementById('stockAdjustType').value = type;
    document.getElementById('stockItemNameDisplay').textContent = item.namaBarang || '-';
    document.getElementById('stockCurrentQtyDisplay').textContent = item.jumlah || 0;
    document.getElementById('stockSatuanDisplay').textContent = item.satuan || 'Pcs';
    document.getElementById('stockAmountInput').value = '';
    document.getElementById('stockReasonInput').value = '';
    document.getElementById('stockOperatorInput').value = '';

    const isIncoming = type === 'IN';
    const titleEl = document.getElementById('stockModalTitle');
    const submitBtn = document.getElementById('stockSubmitBtn');
    const amountLabel = document.getElementById('stockAmountLabel');
    const reasonLabel = document.getElementById('stockReasonLabel');

    if (isIncoming) {
        titleEl.innerHTML = '<i class="fas fa-arrow-down" style="color: #10b981;"></i> Tambah Stok Masuk (Restock)';
        submitBtn.style.background = '#10b981';
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Simpan Penambahan';
        amountLabel.innerHTML = '<i class="fas fa-calculator"></i> Jumlah Masuk <span style="color: red;">*</span>';
        reasonLabel.innerHTML = '<i class="fas fa-truck-loading"></i> Sumber Pengadaan / Catatan <span style="color: red;">*</span>';
        document.getElementById('stockReasonInput').placeholder = 'Contoh: Pengadaan Baru Logistik / Sisa Pekerjaan';
    } else {
        titleEl.innerHTML = '<i class="fas fa-arrow-up" style="color: #f59e0b;"></i> Pengeluaran Stok (Pakai Barang)';
        submitBtn.style.background = '#f59e0b';
        submitBtn.innerHTML = '<i class="fas fa-minus"></i> Simpan Pengeluaran';
        amountLabel.innerHTML = '<i class="fas fa-calculator"></i> Jumlah Dipakai <span style="color: red;">*</span>';
        reasonLabel.innerHTML = '<i class="fas fa-map-pin"></i> Keperluan / Meja Penggunaan <span style="color: red;">*</span>';
        document.getElementById('stockReasonInput').placeholder = 'Contoh: Pemasangan Kubikel A-14 / Ganti Kabel Putus';
    }

    document.getElementById('nonInventoryStockModal').classList.add('show');
}

async function submitStockAdjustment() {
    const id = document.getElementById('stockItemId').value;
    const type = document.getElementById('stockAdjustType').value;
    const amount = parseInt(document.getElementById('stockAmountInput').value, 10);
    const reason = document.getElementById('stockReasonInput').value.trim();
    const operator = document.getElementById('stockOperatorInput').value.trim();

    if (!amount || amount <= 0) {
        showToast('Jumlah mutasi harus lebih besar dari 0!', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/non-inventory/${id}/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, amount, reason, operator })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal menyimpan mutasi stok');
        }

        closeModal('nonInventoryStockModal');
        await loadNonInventory();
        if (typeof checkDashboardLowStock === 'function') checkDashboardLowStock();
        showToast(`Berhasil mencatat mutasi stok: ${type === 'IN' ? '+' : '-'}${amount}!`, 'success');
    } catch (e) {
        showToast(e.message || 'Gagal mutasi stok', 'error');
    }
}

function filterNonInventoryTable() {
    renderNonInventoryTable();
}

function openNonInventoryModal(id = null) {
    document.getElementById('nonInventoryForm').reset();
    document.getElementById('nonInvEditId').value = '';
    document.getElementById('nonInventoryModalTitle').innerHTML = '<i class="fas fa-boxes" style="color: var(--primary);"></i> Tambah Barang Non-Inventaris';

    if (id) {
        const item = nonInventoryData.find(i => i.id === id);
        if (item) {
            document.getElementById('nonInventoryModalTitle').innerHTML = '<i class="fas fa-edit" style="color: var(--primary);"></i> Edit Barang Non-Inventaris';
            document.getElementById('nonInvEditId').value = item.id;
            document.getElementById('nonInvName').value = item.namaBarang || '';
            document.getElementById('nonInvCategory').value = item.kategori || '';
            document.getElementById('nonInvJumlah').value = item.jumlah || 0;
            document.getElementById('nonInvSatuan').value = item.satuan || 'Pcs';
            document.getElementById('nonInvLokasi').value = item.lokasi || '';
            document.getElementById('nonInvKeterangan').value = item.keterangan || '';
        }
    }
    document.getElementById('nonInventoryModal').classList.add('show');
}

function editNonInventory(id) {
    openNonInventoryModal(id);
}

async function saveNonInventoryItem() {
    const id = document.getElementById('nonInvEditId').value;
    const payload = {
        namaBarang: document.getElementById('nonInvName').value,
        kategori: document.getElementById('nonInvCategory').value,
        jumlah: parseInt(document.getElementById('nonInvJumlah').value, 10) || 0,
        satuan: document.getElementById('nonInvSatuan').value,
        lokasi: document.getElementById('nonInvLokasi').value,
        keterangan: document.getElementById('nonInvKeterangan').value
    };

    try {
        const url = id ? `/api/non-inventory/${id}` : '/api/non-inventory';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast('Berhasil menyimpan barang non-inventaris!');
            closeModal('nonInventoryModal');
            loadNonInventory();
        } else {
            showToast('Gagal menyimpan data!', true);
        }
    } catch (err) {
        console.error(err);
        showToast('Terjadi kesalahan koneksi', true);
    }
}

async function deleteNonInventory(id) {
    const confirmDelete = await showConfirmDialog({
        title: 'Hapus Barang Non-Inventaris',
        message: 'Apakah Anda yakin ingin menghapus barang non-inventaris ini dari sistem?',
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        danger: true,
        icon: 'fa-trash-alt'
    });
    if (!confirmDelete) return;
    try {
        const res = await fetch(`/api/non-inventory/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Barang berhasil dihapus');
            loadNonInventory();
        } else {
            showToast('Gagal menghapus barang', true);
        }
    } catch (err) {
        console.error(err);
        showToast('Terjadi kesalahan', true);
    }
}

// --- SCAN KONDISI UPDATE ---
async function applyScanKondisiUpdate() {
    if (!currentScannedItem || !currentScannedItem.id) {
        showToast('Tidak ada item aktif yang dipilih', true);
        return;
    }
    const newKondisi = document.getElementById('scanUpdateKondisi')?.value || 'Baik';
    try {
        const res = await fetch('/api/inventory/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchValue: currentScannedItem.id, kondisi: newKondisi })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Kondisi item ${currentScannedItem.id} diperbarui jadi "${newKondisi}" & Dicek!`);
            currentScannedItem.kondisiAfter = newKondisi;
            currentScannedItem.checklist = 'Ya';
            loadInventory();
        } else {
            showToast('Gagal memperbarui kondisi', true);
        }
    } catch (err) {
        console.error(err);
        showToast('Terjadi kesalahan koneksi', true);
    }
}

// Hook loadNonInventory into startup init
const originalInitApp = window.initApp || function() {};
window.initApp = function() {
    originalInitApp();
    loadNonInventory();
};

function openDesignerAddCubicleModal() {
    const input = document.getElementById('designerCubicleInput');
    if (input) input.value = '';
    openModal('addCubicleDesignerModal');
    setTimeout(() => {
        if (input) input.focus();
    }, 200);
}

function quickFillDesignerCubicle(val) {
    const input = document.getElementById('designerCubicleInput');
    if (input) {
        input.value = val;
        input.focus();
    }
}

async function submitDesignerAddCubicle() {
    const input = document.getElementById('designerCubicleInput');
    if (!input || !input.value.trim()) {
        showToast('Nomor kubikel wajib diisi', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmitDesignerCubicle');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    }

    const items = input.value.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    let successCount = 0;

    for (const name of items) {
        try {
            const res = await fetch('/api/cubicle-positions/add-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type: 'cubicle' })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                cubiclePositions = cubiclePositions.filter(p => p.cubicle_id !== data.location.cubicle_id);
                cubiclePositions.push(data.location);
                successCount++;
            }
        } catch (e) {
            console.error(e);
        }
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Daftarkan ke Palette';
    }

    if (successCount > 0) {
        closeModal('addCubicleDesignerModal');
        showToast(`${successCount} kubikel baru berhasil disimpan di database & siap di palette!`);
        populateCubicleSuggestions();
        renderDesigner();
    } else {
        showToast('Gagal menambahkan kubikel', 'error');
    }
}

window.openDesignerAddCubicleModal = openDesignerAddCubicleModal;
window.promptAddCustomCubicleToDesigner = openDesignerAddCubicleModal;
window.quickFillDesignerCubicle = quickFillDesignerCubicle;
window.submitDesignerAddCubicle = submitDesignerAddCubicle;
