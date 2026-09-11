import { initializeApp }            from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth,
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         updateProfile,
         signOut,
         onAuthStateChanged }        from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase,
         ref, set, get, remove,
         onValue, push }             from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
    apiKey:            "AIzaSyAt09lOFjgkW8VIqqTvgtgzCvjYBXtX9wQ",
    authDomain:        "payroll-5515e.firebaseapp.com",
    databaseURL:       "https://payroll-5515e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "payroll-5515e",
    storageBucket:     "payroll-5515e.firebasestorage.app",
    messagingSenderId: "449642120756",
    appId:             "1:449642120756:web:2d2fca62b19e8ebb1cac61"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const rtdb = getDatabase(app);

window.switchTab = (tab) => {
    document.getElementById('panel-signin').classList.toggle('active', tab === 'signin');
    document.getElementById('panel-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('signin-msg').innerHTML = '';
    document.getElementById('signup-msg').innerHTML = '';
};

function authMsg(id, type, text) {
    const el = document.getElementById(id);
    const icon = type === 'ok' ? 'check-circle' : 'circle-xmark';
    el.innerHTML = `<div class="auth-msg auth-msg-${type}">
        <i class="fas fa-${icon}"></i> ${text}
    </div>`;
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="auth-spin"></span> Please wait…`;
    } else {
        btn.disabled = false;
    }
}

window.doSignUp = async () => {
    const name  = document.getElementById('su-name').value.trim();
    const email = document.getElementById('su-email').value.trim();
    const pass  = document.getElementById('su-pass').value;

    if (!name || !email || !pass)
        return authMsg('signup-msg', 'err', 'Please fill in all fields.');
    if (pass.length < 6)
        return authMsg('signup-msg', 'err', 'Password must be at least 6 characters.');

    setLoading('signup-btn', true);
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        authMsg('signup-msg', 'ok', 'Account created! Signing you in…');

    } catch (err) {
        authMsg('signup-msg', 'err', friendlyError(err.code));
        document.getElementById('signup-btn').disabled = false;
        document.getElementById('signup-btn').innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
};

window.doSignIn = async () => {
    const email = document.getElementById('si-email').value.trim();
    const pass  = document.getElementById('si-pass').value;

    if (!email || !pass)
        return authMsg('signin-msg', 'err', 'Please enter your email and password.');

    setLoading('signin-btn', true);
    try {
        await signInWithEmailAndPassword(auth, email, pass);

    } catch (err) {
        authMsg('signin-msg', 'err', friendlyError(err.code));
        document.getElementById('signin-btn').disabled = false;
        document.getElementById('signin-btn').innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
    }
};

window.doSignOut = async () => {
    if (!confirm('Sign out of Employees Payroll?')) return;
    await signOut(auth);
};

function friendlyError(code) {
    const map = {
        'auth/email-already-in-use':    'That email is already registered. Try signing in instead.',
        'auth/invalid-email':           'Please enter a valid email address.',
        'auth/weak-password':           'Password is too weak. Use at least 6 characters.',
        'auth/user-not-found':          'No account found with that email.',
        'auth/wrong-password':          'Incorrect password. Please try again.',
        'auth/invalid-credential':      'Email or password is incorrect.',
        'auth/too-many-requests':       'Too many attempts. Please try again in a few minutes.',
        'auth/network-request-failed':  'Network error. Check your internet connection.',
    };
    return map[code] || `Error: ${code}`;
}

onAuthStateChanged(auth, async (user) => {
    if (user) {

        await user.reload();
        const fresh = auth.currentUser;

        showApp(fresh);
        await loadUserData(fresh.uid);
    } else {
        showAuth();
    }
});

function showApp(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-wrap').style.display    = 'flex';

    const name = user.displayName || user.email;
    document.getElementById('sb-name').textContent  = name;
    document.getElementById('sb-email').textContent = user.email;
    document.getElementById('sb-avatar').textContent = ini(name);

    redrawDash();
}

function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-wrap').style.display    = 'none';

    document.getElementById('signin-btn').disabled = false;
    document.getElementById('signin-btn').innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
    document.getElementById('signup-btn').disabled = false;
    document.getElementById('signup-btn').innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
}

let uid = null;

async function loadUserData(userUid) {
    uid = userUid;
    syncBadge();
    setSyncState('syncing');

    const userRef = ref(rtdb, `users/${uid}`);

    onValue(userRef, (snapshot) => {
        const data = snapshot.val() || {};

        db.employees = [];
        if (data.employees) {
            Object.values(data.employees).forEach(emp => db.employees.push(emp));
        }

        db.slips = {};
        if (data.payslips) {
            Object.entries(data.payslips).forEach(([empId, slipMap]) => {
                db.slips[empId] = Object.values(slipMap);
            });
        }

        db.audit = [];
        if (data.audit) {
            db.audit = Object.values(data.audit);
        }

        db.runs = data.runs || 0;

        syncBadge();
        setSyncState('ok');

        const activePage = document.querySelector('.page.active');
        if (activePage) {
            const id = activePage.id.replace('page-', '');
            if (id === 'dashboard') redrawDash();
            if (id === 'employees') redrawEmpTable();
            if (id === 'audit')     redrawAudit();
            if (id === 'history')   redrawHistSel();
        }
    });
}

function setSyncState(state) {
    const dot   = document.getElementById('sync-dot');
    const label = document.getElementById('sync-label');
    if (state === 'syncing') {
        dot.classList.add('syncing');
        label.textContent = 'Syncing…';
    } else {
        dot.classList.remove('syncing');
        label.textContent = 'Cloud synced';
    }
}

async function saveEmployee(emp) {
    setSyncState('syncing');
    await set(ref(rtdb, `users/${uid}/employees/${emp.id}`), emp);
    setSyncState('ok');
}

async function deleteEmployee(empId) {
    setSyncState('syncing');
    await remove(ref(rtdb, `users/${uid}/employees/${empId}`));
    await remove(ref(rtdb, `users/${uid}/payslips/${empId}`));
    setSyncState('ok');
}

async function savePayslip(empId, slip) {
    setSyncState('syncing');
    const slipRef = ref(rtdb, `users/${uid}/payslips/${empId}`);
    await push(slipRef, slip);
    setSyncState('ok');
}

async function saveAuditEntry(entry) {
    const auditRef = ref(rtdb, `users/${uid}/audit`);
    await push(auditRef, entry);
}

async function saveRunCount(n) {
    await set(ref(rtdb, `users/${uid}/runs`), n);
}

const SSS_RATE    = 0.045,  SSS_CAP    = 900;
const PH_RATE     = 0.025;
const PGIBIG_RATE = 0.02,   PGIBIG_CAP = 100;

const db = { employees: [], slips: {}, audit: [], runs: 0 };

const META = {
    dashboard : ['Dashboard',       'System overview and statistics'],
    employees : ['All Employees',   'View, sort, and manage the employee directory'],
    add       : ['Add Employee',    'Register a new full-time or part-time employee'],
    search    : ['Search',          'Linear search by name · Binary search by ID'],
    payroll   : ['Process Payroll', 'Generate payslips with automatic government deductions'],
    history   : ['Payslip History', 'Browse past payslips per employee'],
    audit     : ['Audit Log',       'All system events recorded - most recent first (Stack)']
};

window.go = id => showPage(id);

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sb-item').forEach(n => n.classList.remove('active'));
    const pg  = document.getElementById('page-' + id);
    if (pg)  pg.classList.add('active');
    const nav = document.querySelector(`.sb-item[data-page="${id}"]`);
    if (nav) nav.classList.add('active');
    const [title, sub] = META[id] || [id, ''];
    document.getElementById('pg-title').textContent = title;
    document.getElementById('pg-sub').textContent   = sub;
    if (id === 'dashboard') redrawDash();
    if (id === 'employees') redrawEmpTable();
    if (id === 'audit')     redrawAudit();
    if (id === 'history')   redrawHistSel();
}

document.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => showPage(el.dataset.page));
});

function computeDeductions(gross) {
    const sss    = Math.min(gross * SSS_RATE,    SSS_CAP);
    const ph     = gross * PH_RATE;
    const pgibig = Math.min(gross * PGIBIG_RATE, PGIBIG_CAP);
    const tax    = withholdingTax(gross);
    return { sss, ph, pgibig, tax, total: sss + ph + pgibig + tax };
}

function withholdingTax(gp) {
    if (gp <= 20833)  return 0;
    if (gp <= 33332)  return (gp - 20833)  * 0.20;
    if (gp <= 66667)  return 2500  + (gp - 33333)  * 0.25;
    if (gp <= 166667) return 10833 + (gp - 66667)  * 0.30;
    return              40833 + (gp - 166667) * 0.35;
}

const gross = e => e.type === 'ft' ? e.monthly + e.allow : e.hrate * e.hrs;

let empType = 'ft';

window.setType = (t) => {
    empType = t;
    document.getElementById('tgl-ft').classList.toggle('on', t === 'ft');
    document.getElementById('tgl-pt').classList.toggle('on', t === 'pt');
    showEl('ft-monthly-f', t === 'ft');
    showEl('ft-allow-f',   t === 'ft');
    showEl('pt-hr-f',      t === 'pt');
    showEl('pt-hrs-f',     t === 'pt');
};

window.addEmployee = async () => {
    const id   = fv('f-id').trim();
    const name = fv('f-name').trim();
    const dept = fv('f-dept');
    const pos  = fv('f-pos').trim();

    if (!id || !name || !dept || !pos)
        return flash('add-alert', 'err', 'Please fill in all required fields (*).');
    if (db.employees.find(e => e.id === id))
        return flash('add-alert', 'err', `Employee ID "${id}" already exists.`);

    const emp = { id, name, dept, pos, type: empType };

    if (empType === 'ft') {
        const monthly = parseFloat(fv('f-monthly'));
        const allow   = parseFloat(fv('f-allow')) || 0;
        if (isNaN(monthly) || monthly < 0)
            return flash('add-alert', 'err', 'Please enter a valid monthly rate.');
        emp.monthly = monthly;
        emp.allow   = allow;
    } else {
        const hrate = parseFloat(fv('f-hrate'));
        const hrs   = parseFloat(fv('f-hrs'));
        if (isNaN(hrate) || isNaN(hrs) || hrate < 0 || hrs < 0)
            return flash('add-alert', 'err', 'Please enter valid hourly rate and hours worked.');
        emp.hrate = hrate;
        emp.hrs   = hrs;
    }

    await saveEmployee(emp);
    await logAction(`ADDED: ${name} [${id}] — ${dept} · ${pos} · ${empType === 'ft' ? 'Full-Time' : 'Part-Time'}`);
    flash('add-alert', 'ok', `Employee "${name}" added and saved to cloud.`);
    clearForm();
};

window.clearForm = () => {
    ['f-id','f-name','f-pos','f-monthly','f-allow','f-hrate','f-hrs']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('f-dept').value  = '';
    document.getElementById('f-allow').value = '0';
};

window.removeEmployee = async (id) => {
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return;
    const { name } = db.employees[idx];
    if (!confirm(`Remove "${name}" (${id})? This cannot be undone.`)) return;
    await deleteEmployee(id);
    await logAction(`REMOVED: ${name} [${id}]`);
    flash('emp-alert', 'ok', `"${name}" was removed.`);
};

window.doSort = async () => {
    db.employees = mergeSort([...db.employees], 'name');
    await logAction('SORTED: All employees sorted alphabetically (Merge Sort)');
    redrawEmpTable();
    flash('emp-alert', 'ok', 'Employees sorted A–Z by name using Merge Sort.');
};

function mergeSort(arr, key) {
    if (arr.length <= 1) return arr;
    const mid = arr.length >> 1;
    const L   = mergeSort(arr.slice(0, mid), key);
    const R   = mergeSort(arr.slice(mid),    key);
    return merge(L, R, key);
}

function merge(L, R, key) {
    const out = []; let i = 0, j = 0;
    while (i < L.length && j < R.length) {
        (L[i][key].toLowerCase() <= R[j][key].toLowerCase())
            ? out.push(L[i++]) : out.push(R[j++]);
    }
    while (i < L.length) out.push(L[i++]);
    while (j < R.length) out.push(R[j++]);
    return out;
}

let srchMode = 'name';

window.setSrch = (m) => {
    srchMode = m;
    document.getElementById('srch-nm').classList.toggle('on', m === 'name');
    document.getElementById('srch-id').classList.toggle('on', m === 'id');
    document.getElementById('srch-q').placeholder =
        m === 'name' ? 'Enter employee name...' : 'Enter employee ID...';
    document.getElementById('srch-info-txt').textContent =
        m === 'name'
            ? 'Linear search scans all records sequentially — O(n) time complexity.'
            : 'Binary search sorts by ID first, then narrows the range — O(log n) time.';
    document.getElementById('srch-out').innerHTML = '';
};

function searchByName(q) {
    for (const e of db.employees)
        if (e.name.toLowerCase() === q.toLowerCase()) return e;
    return null;
}

function searchById(q) {
    const sorted = mergeSort([...db.employees], 'id');
    let lo = 0, hi = sorted.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cmp = sorted[mid].id.localeCompare(q);
        if (cmp === 0)    return sorted[mid];
        else if (cmp < 0) lo = mid + 1;
        else              hi = mid - 1;
    }
    return null;
}

window.doSearch = () => {
    const q   = document.getElementById('srch-q').value.trim();
    const out = document.getElementById('srch-out');
    if (!q) return;

    const found = srchMode === 'name' ? searchByName(q) : searchById(q);

    if (!found) {
        out.innerHTML = `<div class="alert alert-err">
            <i class="fas fa-circle-xmark"></i>
            No employee found matching "<b>${q}</b>".
        </div>`;
        return;
    }

    const g  = gross(found);
    const av = avClass(found.dept);
    out.innerHTML = `
    <div class="found-panel">
        <div class="found-head">
            <div class="found-av ${av}">${ini(found.name)}</div>
            <div style="flex:1;">
                <div style="font-size:17px;font-weight:700;">${found.name}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${found.pos} · ${found.dept}</div>
                <span class="pill ${found.type==='ft'?'pill-ft':'pill-pt'}" style="margin-top:6px;display:inline-flex;">
                    ${found.type==='ft'?'<i class="fas fa-user-tie"></i> Full-Time':'<i class="fas fa-user-clock"></i> Part-Time'}
                </span>
            </div>
            <div class="alert alert-ok" style="margin:0;padding:7px 12px;align-self:center;">
                <i class="fas fa-check-circle"></i> Found
            </div>
        </div>
        <div class="found-body">
            <div class="found-grid">
                <div class="found-item"><label>Employee ID</label><span class="mono">${found.id}</span></div>
                <div class="found-item"><label>Gross Pay</label><span class="peso">${p(g)}</span></div>
                ${found.type === 'ft' ? `
                <div class="found-item"><label>Monthly Rate</label><span class="mono">${p(found.monthly)}</span></div>
                <div class="found-item"><label>Allowances</label><span class="mono">${p(found.allow)}</span></div>
                ` : `
                <div class="found-item"><label>Hourly Rate</label><span class="mono">${p(found.hrate)}/hr</span></div>
                <div class="found-item"><label>Hours Worked</label><span class="mono">${found.hrs} hrs</span></div>
                `}
            </div>
        </div>
    </div>`;
};

window.runPayroll = async () => {
    if (!db.employees.length)
        return flash('pay-alert', 'err', 'No employees to process. Add employees first.');
    const period = document.getElementById('pay-period').value.trim();
    if (!period)
        return flash('pay-alert', 'err', 'Please enter a pay period (e.g. August 2026).');

    db.runs++;
    await saveRunCount(db.runs);

    const out   = document.getElementById('pay-out');
    out.innerHTML = '';
    const queue = [...db.employees];

    for (const emp of queue) {
        const g    = gross(emp);
        const ded  = computeDeductions(g);
        const net  = g - ded.total;
        const slip = { emp, period, gross: g, ded, net };

        await savePayslip(emp.id, slip);
        await logAction(`PAYROLL · ${emp.name} [${emp.id}] | ${period} | Net: ${p(net)}`);
        out.insertAdjacentHTML('beforeend', renderSlip(slip));
    }

    flash('pay-alert', 'ok',
        `Payroll Run #${db.runs} complete — ${queue.length} payslip(s) for <b>${period}</b> saved to cloud.`);
    syncBadge();
};

function renderSlip({ emp, period, gross: g, ded, net }) {
    const earningDesc = emp.type === 'ft'
        ? `Monthly Rate ${p(emp.monthly)} + Allowances ${p(emp.allow)}`
        : `${p(emp.hrate)}/hr × ${emp.hrs} hours worked`;

    return `
    <div class="slip">
        <div class="slip-head">
            <div class="slip-head-top">
                <div>
                    <div class="slip-org">PAYROLL INFORMATION SYSTEM</div>
                    <div class="slip-title">Payroll Payslip</div>
                </div>
                <div class="slip-stamp">
                    <div class="period">${period}</div>
                    <div class="label">PAY PERIOD</div>
                </div>
            </div>
            <div class="slip-meta">
                <span><b>Employee:</b> ${emp.name}</span>
                <span><b>ID:</b> ${emp.id}</span>
                <span><b>Department:</b> ${emp.dept}</span>
                <span><b>Position:</b> ${emp.pos}</span>
                <span><b>Type:</b> ${emp.type==='ft'?'Full-Time (Monthly)':'Part-Time (Hourly)'}</span>
            </div>
        </div>
        <div class="slip-body">
            <div class="slip-sec">
                <div class="slip-sec-title">Earnings</div>
                <div class="slip-row">
                    <span class="lbl">${earningDesc}</span>
                    <span class="val" style="color:var(--text-1);font-weight:700;">${p(g)}</span>
                </div>
            </div>
            <div class="slip-sec">
                <div class="slip-sec-title">Government Deductions</div>
                <div class="slip-row ded">
                    <span class="lbl">SSS Contribution (${(SSS_RATE*100).toFixed(1)}%, max ₱${SSS_CAP})</span>
                    <span class="val">− ${p(ded.sss)}</span>
                </div>
                <div class="slip-row ded">
                    <span class="lbl">PhilHealth (${(PH_RATE*100).toFixed(1)}%)</span>
                    <span class="val">− ${p(ded.ph)}</span>
                </div>
                <div class="slip-row ded">
                    <span class="lbl">Pag-IBIG Fund (${(PGIBIG_RATE*100).toFixed(1)}%, max ₱${PGIBIG_CAP})</span>
                    <span class="val">− ${p(ded.pgibig)}</span>
                </div>
                <div class="slip-row ded">
                    <span class="lbl">Withholding Tax (BIR graduated rate)</span>
                    <span class="val">− ${p(ded.tax)}</span>
                </div>
                <hr class="slip-sep">
                <div class="slip-row totded">
                    <span class="lbl" style="color:var(--text-1);">Total Deductions</span>
                    <span class="val">− ${p(ded.total)}</span>
                </div>
            </div>
            <div class="slip-net">
                <span class="lbl">
                    <i class="fas fa-money-bill-wave" style="color:var(--gold);"></i>
                    NET PAY
                </span>
                <span class="amount">${p(net)}</span>
            </div>
        </div>
    </div>`;
}

function redrawHistSel() {
    const sel  = document.getElementById('hist-sel');
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Select Employee —</option>';
    db.employees.forEach(e => {
        sel.insertAdjacentHTML('beforeend',
            `<option value="${e.id}" ${e.id===prev?'selected':''}>${e.name} (${e.id})</option>`);
    });
    document.getElementById('hist-out').innerHTML = '';
}

window.viewHistory = () => {
    const id  = document.getElementById('hist-sel').value;
    const out = document.getElementById('hist-out');
    if (!id)
        return (out.innerHTML = `<div class="alert alert-err"><i class="fas fa-circle-xmark"></i> Please select an employee.</div>`);
    const records = db.slips[id] || [];
    if (!records.length)
        return (out.innerHTML = `<div class="empty"><i class="fas fa-file-invoice"></i><p>No payslip history yet. Run payroll first.</p></div>`);
    out.innerHTML = records.map(s => renderSlip(s)).join('');
};

async function logAction(action) {
    const entry = { action, time: nowStr() };
    db.audit.push(entry);
    await saveAuditEntry(entry);
}

function redrawAudit() {
    const out = document.getElementById('audit-out');
    document.getElementById('audit-badge').textContent = db.audit.length + ' entries';
    if (!db.audit.length)
        return (out.innerHTML = `<div class="empty"><i class="fas fa-clipboard-list"></i><p>No audit entries yet.</p></div>`);
    out.innerHTML = [...db.audit].reverse().map(e => `
        <div class="audit-item">
            <div class="audit-dot"></div>
            <div>
                <div class="audit-action">${e.action}</div>
                <div class="audit-time"><i class="fas fa-clock" style="font-size:9px;"></i> ${e.time}</div>
            </div>
        </div>`).join('');
}

function redrawDash() {
    const ft = db.employees.filter(e => e.type==='ft').length;
    const pt = db.employees.filter(e => e.type==='pt').length;
    document.getElementById('s-total').textContent = db.employees.length;
    document.getElementById('s-ft').textContent    = ft;
    document.getElementById('s-pt').textContent    = pt;
    document.getElementById('s-runs').textContent  = db.runs;

    const tbody = document.getElementById('dash-tbody');
    if (!db.employees.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty">
            <i class="fas fa-users"></i>
            <p>No employees yet. <a href="#" onclick="go('add');return false;">Add one now </a></p>
        </div></td></tr>`;
        return;
    }

    tbody.innerHTML = [...db.employees].slice(-5).reverse().map(e => `
        <tr>
            <td><div class="emp-cell">
                <div class="avatar ${avClass(e.dept)}">${ini(e.name)}</div>
                <div><div class="emp-name">${e.name}</div><div class="emp-dept">${e.dept}</div></div>
            </div></td>
            <td class="mono">${e.id}</td>
            <td>${e.dept}</td>
            <td><span class="pill ${e.type==='ft'?'pill-ft':'pill-pt'}">${e.type==='ft'?'Full-Time':'Part-Time'}</span></td>
            <td class="peso">${p(gross(e))}</td>
        </tr>`).join('');
}

function redrawEmpTable() {
    const tbody = document.getElementById('emp-tbody');
    if (!db.employees.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty">
            <i class="fas fa-users"></i>
            <p>No employees on record. <a href="#" onclick="go('add');return false;">Add one </a></p>
        </div></td></tr>`;
        return;
    }
    tbody.innerHTML = db.employees.map(e => `
        <tr>
            <td><div class="emp-cell">
                <div class="avatar ${avClass(e.dept)}">${ini(e.name)}</div>
                <div><div class="emp-name">${e.name}</div><div class="emp-dept">${e.dept}</div></div>
            </div></td>
            <td class="mono">${e.id}</td>
            <td>${e.pos}</td>
            <td><span class="pill ${e.type==='ft'?'pill-ft':'pill-pt'}">${e.type==='ft'?'Full-Time':'Part-Time'}</span></td>
            <td class="peso">${p(gross(e))}</td>
            <td>
                <button class="btn btn-danger btn-xs btn-ico"
                    onclick="removeEmployee('${e.id}')" title="Remove employee">
                    <i class="fas fa-trash-can"></i>
                </button>
            </td>
        </tr>`).join('');
}

const p    = n   => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fv   = id  => document.getElementById(id)?.value ?? '';
const showEl = (id, vis) => { const el = document.getElementById(id); if (el) el.style.display = vis ? '' : 'none'; };
const ini  = name => name.split(' ').map(w => w[0]||'').join('').toUpperCase().slice(0,2);

function avClass(dept) {
    const m = { HR:'av-HR', IT:'av-IT', Finance:'av-Finance',
                Marketing:'av-Marketing', Operations:'av-Operations', Admin:'av-Admin' };
    return m[dept] || 'av-Other';
}

function nowStr() {
    return new Date().toLocaleString('en-PH', {
        year:'numeric', month:'short', day:'numeric',
        hour:'2-digit', minute:'2-digit'
    });
}

function flash(id, type, html) {
    const el = document.getElementById(id);
    if (!el) return;
    const icon = { ok:'check-circle', err:'circle-xmark', info:'info-circle', warn:'triangle-exclamation' };
    el.innerHTML = `<div class="alert alert-${type}">
        <i class="fas fa-${icon[type]||'info-circle'}"></i><span>${html}</span>
    </div>`;
    setTimeout(() => { if (el) el.innerHTML = ''; }, 4500);
}

function syncBadge() {
    const n = db.employees.length;
    document.getElementById('emp-badge').innerHTML =
        `<i class="fas fa-users"></i> ${n} Employee${n!==1?'s':''}`;
}

document.getElementById('pay-period').value = 'August 2026';
