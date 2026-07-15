document.addEventListener('DOMContentLoaded', () => {
  // --- STATE DEFINITIONS ---
  const DIVISIONS = {
    hr: {
      id: 'hr',
      name: 'Human Resources',
      emoji: '👥',
      class: 'division-hr'
    },
    sf: {
      id: 'sf',
      name: 'Special Force',
      emoji: '🎯',
      class: 'division-sf'
    },
    mp: {
      id: 'mp',
      name: 'Military Police',
      emoji: '🛡️',
      class: 'division-mp'
    },
    af: {
      id: 'af',
      name: 'Air Force',
      emoji: '✈️',
      class: 'division-af'
    },
    mpy: {
      id: 'mpy',
      name: 'Main Payout',
      emoji: '🔐',
      class: 'division-mpy'
    }
  };

  let activeDivisionId = null;

  // --- DOM ELEMENTS ---
  const hotspots = document.querySelectorAll('.hotspot');
  const modal = document.getElementById('payout-modal');
  const modalContent = modal.querySelector('.modal-content');
  const closeModalBtn = document.getElementById('close-modal');
  const modalTitle = document.getElementById('modal-title');
  const payoutForm = document.getElementById('payout-form');
  const divisionInput = document.getElementById('payout-division');
  const recipientInput = document.getElementById('payout-recipient');
  const amountInput = document.getElementById('payout-amount');
  const purposeInput = document.getElementById('payout-purpose');
  const historyListEl = document.getElementById('payout-history-list');
  const historyCardEl = document.querySelector('.history-card');
  const modalGridEl = document.querySelector('.modal-grid');
  const modalFormSectionEl = document.querySelector('.modal-form-section');
  const modalStatsSectionEl = document.querySelector('.modal-stats-section');
  const adminGridEl = document.getElementById('modal-admin-grid');
  const adminPayoutListEl = document.getElementById('admin-payout-list');
  const passwordInput = document.getElementById('payout-password');
  const passwordGroup = document.getElementById('password-group');
  const passwordNote = document.getElementById('password-note');
  const passwordManagerList = document.getElementById('password-manager-list');
  const pendingSummaryList = document.getElementById('pending-summary-list');
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const confirmMessageEl = document.getElementById('confirm-message');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  const mainPayoutLoginModal = document.getElementById('main-payout-login-modal');
  const mainPayoutAccessPasswordInput = document.getElementById('main-payout-access-password');
  const loginConfirmBtn = document.getElementById('login-confirm-btn');
  const loginCancelBtn = document.getElementById('login-cancel-btn');
  const MASTER_ACCESS_PASSWORD = '120801-R-87010';
  let pendingDeleteIndex = null;
  let mainPayoutUnlocked = false;
  
  // Dashboard overall stats
  const globalTotalSpentEl = document.getElementById('global-total-spent');
  const globalPendingTotalEl = document.getElementById('global-pending-total');
  const syncStatusEl = document.getElementById('sync-status');
  const liveTimeEl = document.getElementById('live-time');

  const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1caffNc0TQMuvZTdptFPRnD-5CefuS9Eqs4kr91BkDKY/edit?usp=sharing';
  const GOOGLE_SHEET_ID = '1caffNc0TQMuvZTdptFPRnD-5CefuS9Eqs4kr91BkDKY';
  const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxUKzUqJ5LaLBuo6uz9bSdtG5jFygJVspw-Z5lwV992mWXv54idcjivz2dfPfc7cTSTIg/exec';

  // --- INITIALIZATION ---
  initData().then(() => {
    updateGlobalStats();
    setupEventListeners();
    startClock();
  });

  // --- FUNCTIONS ---

  // Initialize localStorage data if empty and import from Google Sheets if possible
  async function initData() {
    Object.keys(DIVISIONS).forEach(key => {
      const historyKey = `payout_history_${key}`;
      if (localStorage.getItem(historyKey) === null) {
        localStorage.setItem(historyKey, JSON.stringify([]));
      }
    });

    try {
      await importFromGoogleSheet();
    } catch (error) {
      console.warn('Google Sheet import failed:', error);
      setSyncStatus('offline', 'Google Sheet nicht verfügbar, lokale Daten bleiben aktiv');
    }
  }

  // Live digital clock update
  function startClock() {
    const formatNumber = num => String(num).padStart(2, '0');
    
    const updateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timeStr = `${formatNumber(now.getHours())}:${formatNumber(now.getMinutes())}:${formatNumber(now.getSeconds())}`;
      liveTimeEl.textContent = `${dateStr} | ${timeStr} UTC`;
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  }

  // Update Global Header Dashboard Numbers
  function updateGlobalStats() {
    let totalSpent = 0;

    Object.keys(DIVISIONS).forEach(key => {
      const history = JSON.parse(localStorage.getItem(`payout_history_${key}`)) || [];
      history.forEach(item => {
        totalSpent += parseFloat(item.amount) || 0;
      });
    });

    let pendingTotal = 0;
    Object.keys(DIVISIONS).forEach(key => {
      const history = JSON.parse(localStorage.getItem(`payout_history_${key}`)) || [];
      history.forEach(item => {
        if (item.status === 'Bearbeitung') {
          pendingTotal += parseFloat(item.amount) || 0;
        }
      });
    });

    const formatCurrency = num => num.toLocaleString('de-DE') + ' $';
    globalTotalSpentEl.textContent = formatCurrency(totalSpent);
    globalPendingTotalEl.textContent = formatCurrency(pendingTotal);
  }

  function setSyncStatus(state, message) {
    if (!syncStatusEl) return;
    syncStatusEl.textContent = message;
    syncStatusEl.classList.toggle('synced', state === 'synced');
    syncStatusEl.classList.toggle('offline', state !== 'synced');
    syncStatusEl.title = message;
  }

  async function saveLocalAndSync() {
    updateGlobalStats();
    await persistToGoogleSheet();
  }

  function buildSheetPayload() {
    const payoutHistory = {};
    const divisionPasswords = {};

    Object.keys(DIVISIONS).forEach(key => {
      payoutHistory[key] = JSON.parse(localStorage.getItem(`payout_history_${key}`)) || [];
      divisionPasswords[key] = localStorage.getItem(`division_password_${key}`) || '';
    });

    return {
      spreadsheetUrl: GOOGLE_SHEET_URL,
      payoutHistory,
      divisionPasswords,
      lastUpdated: new Date().toISOString()
    };
  }

  async function persistToGoogleSheet() {
    const payload = buildSheetPayload();

    if (!GOOGLE_APPS_SCRIPT_URL) {
      setSyncStatus('synced', 'Lokal gespeichert');
      return;
    }

    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Export fehlgeschlagen (${response.status}): ${errText}`);
      }
      const body = await response.json().catch(() => ({}));
      if (body && body.ok) {
        setSyncStatus('synced', 'Google Sheet synchronisiert');
      } else {
        throw new Error(body && body.error ? body.error : 'Unbekannter Fehler beim Export');
      }
    } catch (error) {
      console.warn('Google Sheet export failed:', error);
      const reason = error && error.message ? error.message : 'Unbekannter Fehler';
      setSyncStatus('offline', `Export fehlgeschlagen: ${reason}`);
      showToast(`Google-Export fehlgeschlagen: ${reason}`, 'warning');
    }
  }

  async function importFromGoogleSheet() {
    try {
      const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Import fehlgeschlagen (${response.status})`);

      const body = await response.json().catch(() => null);
      if (!body || !body.ok) {
        throw new Error(body && body.error ? body.error : 'No valid import payload from Apps Script');
      }

      const data = body.data || null;
      if (!data || !Array.isArray(data)) {
        setSyncStatus('synced', 'Lokal gespeichert');
        return;
      }

      const transactionsByDivision = {};
      const passwordsByDivision = {};

      Object.keys(DIVISIONS).forEach(key => {
        transactionsByDivision[key] = [];
      });

      data.forEach(entry => {
        if (entry.type === 'password' && entry.division) {
          passwordsByDivision[entry.division] = entry.password || '';
          return;
        }

        if (entry.type === 'transaction' && entry.division) {
          const amount = parseFloat(entry.amount || 0);
          transactionsByDivision[entry.division].push({
            recipient: entry.recipient || 'Unbekannt',
            amount,
            purpose: entry.purpose || '',
            status: entry.status || 'Bearbeitung',
            timestamp: entry.timestamp || new Date().toISOString()
          });
        }
      });

      Object.keys(DIVISIONS).forEach(key => {
        const stored = transactionsByDivision[key] || [];
        localStorage.setItem(`payout_history_${key}`, JSON.stringify(stored));
        if (passwordsByDivision[key]) {
          localStorage.setItem(`division_password_${key}`, passwordsByDivision[key]);
        } else {
          localStorage.removeItem(`division_password_${key}`);
        }
      });

      setSyncStatus('synced', 'Google Sheet importiert');
    } catch (error) {
      console.warn('Google Sheet import failed:', error);
      throw error;
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Hotspots clicking
    hotspots.forEach(hotspot => {
      hotspot.addEventListener('click', () => {
        const divId = hotspot.getAttribute('data-division');
        openModal(divId);
      });
    });

    // Close buttons
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Handle Form Submit
    payoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handlePayoutSubmit();
    });

    loginConfirmBtn.addEventListener('click', () => {
      const entered = mainPayoutAccessPasswordInput.value.trim();
      if (entered === MASTER_ACCESS_PASSWORD) {
        mainPayoutUnlocked = true;
        hideMainPayoutLogin();
        openModal('mpy');
      } else {
        showToast('Master-Passwort falsch. Zugriff verweigert.', 'warning');
        mainPayoutAccessPasswordInput.value = '';
      }
    });

    loginCancelBtn.addEventListener('click', () => {
      hideMainPayoutLogin();
    });

    mainPayoutLoginModal.addEventListener('click', (e) => {
      if (e.target === mainPayoutLoginModal) hideMainPayoutLogin();
    });

    mainPayoutAccessPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        loginConfirmBtn.click();
      }
    });
  }

  // Open Modal Console for specific division
  function openModal(divId) {
    const division = DIVISIONS[divId];
    if (!division) return;

    if (divId === 'mpy' && !mainPayoutUnlocked) {
      showMainPayoutLogin();
      return;
    }

    activeDivisionId = divId;
    
    // Setup Modal Classes & Styles
    modal.className = `modal active ${division.class}`;
    modalTitle.textContent = `${division.emoji} ${division.name.toUpperCase()} SYSTEM`;
    divisionInput.value = divId;

    // Render stats & history
    renderModalStats();
  }

  // Close Modal
  function closeModal() {
    if (activeDivisionId === 'mpy') {
      mainPayoutUnlocked = false;
    }
    modal.classList.remove('active');
    activeDivisionId = null;
    payoutForm.reset();
  }

  function showMainPayoutLogin() {
    mainPayoutAccessPasswordInput.value = '';
    mainPayoutLoginModal.classList.add('active');
    mainPayoutLoginModal.setAttribute('aria-hidden', 'false');
    mainPayoutAccessPasswordInput.focus();
  }

  function hideMainPayoutLogin() {
    mainPayoutLoginModal.classList.remove('active');
    mainPayoutLoginModal.setAttribute('aria-hidden', 'true');
  }

  function getAllPayoutEntries() {
    const allEntries = [];
    Object.keys(DIVISIONS).forEach(key => {
      const division = DIVISIONS[key];
      const history = JSON.parse(localStorage.getItem(`payout_history_${key}`)) || [];
      history.forEach(item => {
        allEntries.push({
          divisionId: key,
          divisionName: division.name,
          ...item
        });
      });
    });
    return allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function getDivisionPassword(divisionId) {
    return localStorage.getItem(`division_password_${divisionId}`) || '';
  }

  function setDivisionPassword(divisionId, password) {
    if (!password) return;
    localStorage.setItem(`division_password_${divisionId}`, password);
    saveLocalAndSync();
  }

  function renderPendingSummary(isMainPayout) {
    if (!isMainPayout) {
      pendingSummaryList.innerHTML = '';
      return;
    }

    pendingSummaryList.innerHTML = '';
    Object.keys(DIVISIONS).forEach(key => {
      if (key === 'mpy') return;
      const history = JSON.parse(localStorage.getItem(`payout_history_${key}`)) || [];
      const pending = history
        .filter(item => item.status === 'Bearbeitung')
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

      const row = document.createElement('div');
      row.className = 'pending-summary-row';
      row.innerHTML = `
        <span>${escapeHTML(DIVISIONS[key].name)}</span>
        <strong>${pending.toLocaleString('de-DE')} $ ausstehend</strong>
      `;
      pendingSummaryList.appendChild(row);
    });
  }

  function renderPasswordManager(isMainPayout) {
    if (!isMainPayout) {
      passwordManagerList.innerHTML = '';
      return;
    }

    passwordManagerList.innerHTML = '';
    Object.keys(DIVISIONS).forEach(key => {
      if (key === 'mpy') return;
      const existingPassword = getDivisionPassword(key);
      const passwordStatus = existingPassword ? 'Passwort gesetzt' : 'Kein Passwort';
      const row = document.createElement('div');
      row.className = 'password-manager-row';
      row.innerHTML = `
        <div class="password-manager-label">
          <span>${escapeHTML(DIVISIONS[key].name)}</span>
          <small>${passwordStatus}</small>
        </div>
        <div>
          <input type="password" placeholder="Neues Passwort" class="division-password-input" data-division="${key}">
        </div>
      `;
      passwordManagerList.appendChild(row);
    });

    passwordManagerList.querySelectorAll('.division-password-input').forEach(input => {
      input.addEventListener('change', (event) => {
        const divisionId = event.target.getAttribute('data-division');
        setDivisionPassword(divisionId, event.target.value.trim());
        showToast(`Passwort für ${DIVISIONS[divisionId].name} gespeichert.`, 'success');
      });
    });
  }

  // Render division details inside the modal
  function renderModalStats() {
    if (!activeDivisionId) return;

    const divKey = activeDivisionId;
    const division = DIVISIONS[divKey];
    const isMainPayout = divKey === 'mpy';
    const history = isMainPayout
      ? getAllPayoutEntries()
      : JSON.parse(localStorage.getItem(`payout_history_${divKey}`)) || [];

    document.getElementById('history-title').textContent = isMainPayout
      ? 'Zusammenfassung aller Auszahlungen'
      : `Transaktionsverlauf – ${division.name}`;

    passwordNote.textContent = isMainPayout
      ? 'Hier können Sie den Main Payout-Code verwalten und Division-Passwörter setzen.'
      : 'Geben Sie das Passwort für diese Division ein, um Auszahlungen freizugeben.';
    passwordInput.value = '';
    passwordInput.required = !isMainPayout;
    passwordGroup.style.display = isMainPayout ? 'none' : 'block';
    modalStatsSectionEl.style.display = isMainPayout ? 'none' : 'flex';
    modalFormSectionEl.style.display = isMainPayout ? 'none' : 'block';
    modalGridEl.classList.toggle('single-column', isMainPayout);
    adminGridEl.classList.toggle('full-width', isMainPayout);
    historyCardEl.style.display = isMainPayout ? 'none' : 'flex';

    renderPendingSummary(isMainPayout);
    renderPasswordManager(isMainPayout);

    historyListEl.innerHTML = '';
    if (history.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.style.color = 'var(--text-muted)';
      emptyItem.style.textAlign = 'center';
      emptyItem.style.padding = '20px';
      emptyItem.style.fontSize = '1.3cqw';
      emptyItem.textContent = 'Keine Transaktionen erfasst';
      historyListEl.appendChild(emptyItem);
    } else {
      history.forEach(item => {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const statusText = item.status || 'Bearbeitung';

        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';
        
        itemEl.innerHTML = `
          <div class="history-item-details">
            <span class="history-item-recipient">${escapeHTML(item.recipient)}${isMainPayout ? ` · ${escapeHTML(item.divisionName)}` : ''}</span>
            <span class="history-item-purpose">${formatPurposeText(item.purpose)}</span>
            <span class="history-item-meta">${dateStr} | ${timeStr} · ${escapeHTML(statusText)}</span>
          </div>
          <span class="history-item-amount">-${parseFloat(item.amount).toLocaleString('de-DE')} $</span>
        `;
        historyListEl.appendChild(itemEl);
      });
    }

    renderAdminGrid(isMainPayout);
  }

  function renderAdminGrid(showAdmin) {
    if (!showAdmin) {
      adminGridEl.style.display = 'none';
      adminPayoutListEl.innerHTML = '';
      return;
    }

    adminGridEl.style.display = 'block';
    const sortedEntries = getAllPayoutEntries();
    adminPayoutListEl.innerHTML = '';

    if (sortedEntries.length === 0) {
      adminPayoutListEl.innerHTML = '<tr><td colspan="8" style="text-align:center; color: #ccc; padding: 18px;">Keine Auszahlungen vorhanden</td></tr>';
      return;
    }

    sortedEntries.forEach((item, index) => {
      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const status = item.status || 'Bearbeitung';

      const row = document.createElement('tr');
      row.className = `status-row status-${status.toLowerCase().replace(/ä/g, 'ae')}`;
      row.innerHTML = `
        <td>${escapeHTML(item.divisionName)}</td>
        <td>${escapeHTML(item.recipient)}</td>
        <td>${parseFloat(item.amount).toLocaleString('de-DE')} $</td>
        <td>${formatPurposeText(item.purpose)}</td>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td><span class="status-badge status-badge-${status.toLowerCase().replace(/ä/g, 'ae')}">${escapeHTML(status)}</span></td>
        <td class="status-action-cell">
          <button type="button" class="status-btn" data-index="${index}" data-status="Bearbeitung">Bearbeitung</button>
          <button type="button" class="status-btn" data-index="${index}" data-status="Ausbezahlt">Ausbezahlt</button>
          <button type="button" class="status-btn" data-index="${index}" data-status="Abgelehnt">Abgelehnt</button>
          <button type="button" class="delete-btn" data-index="${index}">Löschen</button>
        </td>
      `;
      adminPayoutListEl.appendChild(row);
    });

    adminPayoutListEl.querySelectorAll('.status-btn').forEach(button => {
      button.addEventListener('click', () => {
        const itemIndex = parseInt(button.getAttribute('data-index'), 10);
        const newStatus = button.getAttribute('data-status');
        updateTransactionStatus(itemIndex, newStatus);
      });
    });

    adminPayoutListEl.querySelectorAll('.delete-btn').forEach(button => {
      button.addEventListener('click', () => {
        const itemIndex = parseInt(button.getAttribute('data-index'), 10);
        promptDeleteTransaction(itemIndex);
      });
    });
  }

  function promptDeleteTransaction(entryIndex) {
    const sortedEntries = getAllPayoutEntries();
    const entry = sortedEntries[entryIndex];
    if (!entry) return;

    pendingDeleteIndex = entryIndex;
    confirmMessageEl.textContent = `Auszahlung von ${entry.recipient} (${parseFloat(entry.amount).toLocaleString('de-DE')} $) löschen?`;
    deleteConfirmModal.classList.add('active');
  }

  function hideDeleteConfirmModal() {
    deleteConfirmModal.classList.remove('active');
    pendingDeleteIndex = null;
  }

  confirmDeleteBtn.addEventListener('click', () => {
    if (pendingDeleteIndex === null) return;
    deleteTransaction(pendingDeleteIndex);
    hideDeleteConfirmModal();
  });

  cancelDeleteBtn.addEventListener('click', () => {
    hideDeleteConfirmModal();
  });

  deleteConfirmModal.addEventListener('click', (event) => {
    if (event.target === deleteConfirmModal) {
      hideDeleteConfirmModal();
    }
  });

  function updateTransactionStatus(entryIndex, newStatus) {
    const sortedEntries = getAllPayoutEntries();
    const entry = sortedEntries[entryIndex];
    if (!entry) return;

    const divisionHistory = JSON.parse(localStorage.getItem(`payout_history_${entry.divisionId}`)) || [];
    const historyItem = divisionHistory.find(h =>
      h.timestamp === entry.timestamp &&
      h.recipient === entry.recipient &&
      parseFloat(h.amount) === parseFloat(entry.amount) &&
      h.purpose === entry.purpose
    );
    if (!historyItem) return;

    historyItem.status = newStatus;
    localStorage.setItem(`payout_history_${entry.divisionId}`, JSON.stringify(divisionHistory));
    renderModalStats();
    saveLocalAndSync();
    showToast(`Status gesetzt auf ${newStatus}`, 'success');
  }

  function deleteTransaction(entryIndex) {
    const sortedEntries = getAllPayoutEntries();
    const entry = sortedEntries[entryIndex];
    if (!entry) return;

    const divisionHistory = JSON.parse(localStorage.getItem(`payout_history_${entry.divisionId}`)) || [];
    const remainingHistory = divisionHistory.filter(h => !(h.timestamp === entry.timestamp && h.recipient === entry.recipient && parseFloat(h.amount) === parseFloat(entry.amount) && h.purpose === entry.purpose));
    localStorage.setItem(`payout_history_${entry.divisionId}`, JSON.stringify(remainingHistory));
    renderModalStats();
    saveLocalAndSync();
    showToast('Auszahlung gelöscht.', 'success');
  }

  // Process Payout Form Submission
  function handlePayoutSubmit() {
    if (!activeDivisionId) return;

    const divKey = activeDivisionId;
    const recipient = recipientInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const password = passwordInput.value.trim();
    const purpose = purposeInput.value.trim();

    if (!recipient || isNaN(amount) || amount <= 0 || !purpose) {
      showToast('Ungültige Eingabedaten', 'warning');
      return;
    }

    if (divKey !== 'mpy') {
      const expectedPassword = getDivisionPassword(divKey);
      if (!expectedPassword) {
        showToast('Kein Passwort für diese Division gesetzt. Main Payout öffnen und Passwort definieren.', 'warning');
        return;
      }
      if (password !== expectedPassword) {
        showToast('Division-Passwort falsch.', 'warning');
        return;
      }
    }

    const submitBtn = payoutForm.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'TRANSMITTING ENCRYPTED LEDGER...';
    submitBtn.disabled = true;

    setTimeout(() => {
      const history = JSON.parse(localStorage.getItem(`payout_history_${divKey}`)) || [];
      const newTransaction = {
        recipient,
        amount,
        purpose,
        status: 'Bearbeitung',
        timestamp: new Date().toISOString()
      };
      history.push(newTransaction);
      localStorage.setItem(`payout_history_${divKey}`, JSON.stringify(history));

      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      payoutForm.reset();

      renderModalStats();
      saveLocalAndSync();
      showToast(`Auszahlung von ${amount.toLocaleString('de-DE')} $ an ${recipient} freigegeben.`, 'success');
    }, 1200);
  }

  // Toast Notification System
  function formatPurposeText(text) {
    if (!text) return '';
    const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<]+/gi;
    const escaped = escapeHTML(text);
    return escaped.replace(urlPattern, url => {
      const normalizedUrl = url.startsWith('www.') ? `https://${url}` : url;
      return `<a href="${normalizedUrl}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a>`;
    });
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '⚡' : '⚠️';
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Fade out after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'fadeIn 0.3s ease reverse forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // Simple HTML Escaping for Security
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});
