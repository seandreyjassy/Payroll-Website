'use strict';
/*
 * ════════════════════════════════════════════════════════════════
 *  PayrollPH — Web Payroll Information System
 *
 *  IMPORTANT NOTE ON LANGUAGES:
 *  ─────────────────────────────
 *  The original project is written in JAVA (desktop/server app).
 *  This website uses JAVASCRIPT — a completely different language.
 *  Java ≠ JavaScript. Despite the similar name, they are unrelated.
 *
 *  Java:        runs on desktop/server (JVM)
 *  JavaScript:  runs in web browsers
 *  HTML + CSS:  structure and styling of web pages
 *
 *  This JavaScript mirrors the Java OOP class structure:
 *    Java class Employee       → JS objects in db.employees[]
 *    Java class FullTimeEmployee   → emp objects with type:'ft'
 *    Java class PartTimeEmployee   → emp objects with type:'pt'
 *    Java class Deduction      → computeDeductions() function
 *    Java class Payslip        → renderSlip() function
 *    Java class PayrollSystem  → db state + all system functions
 *    Java ArrayList<Employee>  → db.employees  (JS Array)
 *    Java HashMap<...>         → db.slips       (JS Object)
 *    Java Stack<String>        → db.audit       (JS Array, LIFO)
 *    Java Queue (LinkedList)   → [...db.employees] spread copy
 *    Java Merge Sort           → mergeSort() + merge()
 *    Java Linear Search        → searchByName()
 *    Java Binary Search        → searchById()
 * ════════════════════════════════════════════════════════════════
 */

/* ── Deduction rate constants (mirrors Java static finals) ── */
const SSS_RATE   = 0.045,  SSS_CAP   = 900;
const PH_RATE    = 0.025;
const PGIBIG_RATE = 0.02,  PGIBIG_CAP = 100;

/* ── System state (mirrors PayrollSystem fields) ── */
const db = {
    employees : [],   /* ArrayList<Employee>           */
    slips     : {},   /* HashMap<String, List<Payslip>> */
    audit     : [],   /* Stack<String>                  */
    runs      : 0     /* payroll run counter            */
};

/* ── Page metadata ── */
const META = {
    dashboard : ['Dashboard',       'System overview and statistics'],
    employees : ['All Employees',   'View, sort, and manage the employee directory'],
    add       : ['Add Employee',    'Register a new full-time or part-time employee'],
    search    : ['Search',          'Linear search by name · Binary search by ID'],
    payroll   : ['Process Payroll', 'Generate payslips with automatic government deductions'],
    history   : ['Payslip History', 'Browse past payslips per employee'],
    audit     : ['Audit Log',       'All system events recorded — most recent first (Stack)']
};

/* ══════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════ */
const go = id => showPage(id);

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sb-item').forEach(n => n.classList.remove('active'));

    const pg = document.getElementById('page-' + id);
    if (pg) pg.classList.add('active');

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

/* ══════════════════════════════════════════════════════════════
   DEDUCTIONS (mirrors Java Deduction class)
══════════════════════════════════════════════════════════════ */
function computeDeductions(gross) {
    const sss    = Math.min(gross * SSS_RATE,    SSS_CAP);
    const ph     = gross * PH_RATE;
    const pgibig = Math.min(gross * PGIBIG_RATE, PGIBIG_CAP);
    const tax    = withholdingTax(gross);
    return { sss, ph, pgibig, tax, total: sss + ph + pgibig + tax };
}

/* mirrors computeWithholdingTax() */
function withholdingTax(gp) {
    if (gp <= 20833)  return 0;
    if (gp <= 33332)  return (gp - 20833)  * 0.20;
    if (gp <= 66667)  return 2500  + (gp - 33333)  * 0.25;
    if (gp <= 166667) return 10833 + (gp - 66667)  * 0.30;
    return              40833 + (gp - 166667) * 0.35;
}

/* ══════════════════════════════════════════════════════════════
   GROSS PAY (mirrors Employee.computeGrossPay())
══════════════════════════════════════════════════════════════ */
const gross = e =>
    e.type === 'ft' ? e.monthly + e.allow : e.hrate * e.hrs;

/* ══════════════════════════════════════════════════════════════
   ADD EMPLOYEE (mirrors PayrollSystem.addEmployee())
══════════════════════════════════════════════════════════════ */
let empType = 'ft';

function setType(t) {
    empType = t;
    document.getElementById('tgl-ft').classList.toggle('on', t === 'ft');
    document.getElementById('tgl-pt').classList.toggle('on', t === 'pt');
    show('ft-monthly-f', t === 'ft');
    show('ft-allow-f',   t === 'ft');
    show('pt-hr-f',      t === 'pt');
    show('pt-hrs-f',     t === 'pt');
}

function addEmployee() {
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

    db.employees.push(emp);
    db.slips[id] = [];
    log(`ADDED: ${name} [${id}] — ${dept} · ${pos} · ${empType === 'ft' ? 'Full-Time' : 'Part-Time'}`);
    syncBadge();

    flash('add-alert', 'ok', `Employee "${name}" added successfully!`);
    clearForm();
}

function clearForm() {
    ['f-id','f-name','f-pos','f-monthly','f-allow','f-hrate','f-hrs']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('f-dept').value  = '';
    document.getElementById('f-allow').value = '0';
}

/* ══════════════════════════════════════════════════════════════
   REMOVE EMPLOYEE (mirrors PayrollSystem.removeEmployee())
══════════════════════════════════════════════════════════════ */
function removeEmployee(id) {
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return;
    const { name } = db.employees[idx];
    if (!confirm(`Remove "${name}" (${id})? This action cannot be undone.`)) return;
    db.employees.splice(idx, 1);
    log(`REMOVED: ${name} [${id}]`);
    syncBadge();
    redrawEmpTable();
    flash('emp-alert', 'ok', `"${name}" was removed from the directory.`);
}

/* ══════════════════════════════════════════════════════════════
   SORT — Merge Sort (mirrors PayrollSystem.sortByName())
══════════════════════════════════════════════════════════════ */
function doSort() {
    db.employees = mergeSort([...db.employees], 'name');
    log('SORTED: All employees sorted alphabetically by name (Merge Sort)');
    redrawEmpTable();
    flash('emp-alert', 'ok', 'Employees sorted A–Z by name using Merge Sort.');
}

function mergeSort(arr, key) {
    if (arr.length <= 1) return arr;
    const mid = arr.length >> 1;
    const L   = mergeSort(arr.slice(0, mid), key);
    const R   = mergeSort(arr.slice(mid),    key);
    return merge(L, R, key);
}

function merge(L, R, key) {
    const out = [];
    let i = 0, j = 0;
    while (i < L.length && j < R.length) {
        const a = L[i][key].toLowerCase();
        const b = R[j][key].toLowerCase();
        (a <= b) ? out.push(L[i++]) : out.push(R[j++]);
    }
    while (i < L.length) out.push(L[i++]);
    while (j < R.length) out.push(R[j++]);
    return out;
}

/* ══════════════════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════════════════ */
let srchMode = 'name';

function setSrch(m) {
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
}

/* ─ Linear Search: searchByName() ─ */
function searchByName(q) {
    for (const e of db.employees)
        if (e.name.toLowerCase() === q.toLowerCase()) return e;
    return null;
}

/* ─ Binary Search: searchById() ─ */
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

function doSearch() {
    const q    = document.getElementById('srch-q').value.trim();
    const out  = document.getElementById('srch-out');
    if (!q) return;

    const found = srchMode === 'name' ? searchByName(q) : searchById(q);

    if (!found) {
        out.innerHTML = `<div class="alert alert-err">
            <i class="fas fa-circle-xmark"></i>
            No employee found matching "<b>${q}</b>".
        </div>`;
        return;
    }

    const g = gross(found);
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
}

/* ══════════════════════════════════════════════════════════════
   PROCESS PAYROLL (mirrors PayrollSystem.processPayroll())
   Uses a queue (spread copy) — processes all employees in order
══════════════════════════════════════════════════════════════ */
function runPayroll() {
    if (!db.employees.length)
        return flash('pay-alert', 'err', 'No employees to process. Add employees first.');

    const period = document.getElementById('pay-period').value.trim();
    if (!period)
        return flash('pay-alert', 'err', 'Please enter a pay period (e.g. August 2026).');

    db.runs++;
    const out = document.getElementById('pay-out');
    out.innerHTML = '';

    /* Queue (LinkedList in Java): spread copy, process all in order */
    const queue = [...db.employees];

    queue.forEach(emp => {
        const g      = gross(emp);
        const ded    = computeDeductions(g);
        const net    = g - ded.total;
        const slip   = { emp, period, gross: g, ded, net };

        db.slips[emp.id] = db.slips[emp.id] || [];
        db.slips[emp.id].push(slip);

        log(`PAYROLL · ${emp.name} [${emp.id}] | ${period} | Net: ${p(net)}`);
        out.insertAdjacentHTML('beforeend', renderSlip(slip));
    });

    flash('pay-alert', 'ok',
        `Payroll Run #${db.runs} complete — ${queue.length} payslip(s) generated for <b>${period}</b>.`);
    syncBadge();
}

/* ─ Render a single payslip (mirrors Payslip.generatePayslip()) ─ */
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

/* ══════════════════════════════════════════════════════════════
   PAYSLIP HISTORY (mirrors displayPayslipHistory)
══════════════════════════════════════════════════════════════ */
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

function viewHistory() {
    const id  = document.getElementById('hist-sel').value;
    const out = document.getElementById('hist-out');
    if (!id)
        return (out.innerHTML = `<div class="alert alert-err"><i class="fas fa-circle-xmark"></i> Please select an employee.</div>`);

    const records = db.slips[id] || [];
    if (!records.length)
        return (out.innerHTML = `<div class="empty"><i class="fas fa-file-invoice"></i><p>No payslip history yet. Run payroll first.</p></div>`);

    out.innerHTML = records.map(s => renderSlip(s)).join('');
}

/* ══════════════════════════════════════════════════════════════
   AUDIT LOG (mirrors displayAuditLog — Stack: most recent first)
══════════════════════════════════════════════════════════════ */
function log(action) {
    db.audit.push({ action, time: nowStr() });  /* push onto stack */
}

function redrawAudit() {
    const out = document.getElementById('audit-out');
    document.getElementById('audit-badge').textContent = db.audit.length + ' entries';

    if (!db.audit.length)
        return (out.innerHTML = `<div class="empty"><i class="fas fa-clipboard-list"></i><p>No audit entries yet.</p></div>`);

    /* Stack: pop order = reverse array (most recent first) */
    out.innerHTML = [...db.audit].reverse().map(e => `
        <div class="audit-item">
            <div class="audit-dot"></div>
            <div>
                <div class="audit-action">${e.action}</div>
                <div class="audit-time"><i class="fas fa-clock" style="font-size:9px;"></i> ${e.time}</div>
            </div>
        </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   REDRAW DASHBOARD & EMPLOYEE TABLE
══════════════════════════════════════════════════════════════ */
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
            <p>No employees yet. <a href="#" onclick="go('add');return false;">Add one now →</a></p>
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
            <p>No employees on record. <a href="#" onclick="go('add');return false;">Add one →</a></p>
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

/* ══════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════ */
const p   = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fv  = id => document.getElementById(id)?.value ?? '';
const show = (id, vis) => { const el = document.getElementById(id); if (el) el.style.display = vis ? '' : 'none'; };
const ini  = name => name.split(' ').map(w => w[0]||'').join('').toUpperCase().slice(0,2);

function avClass(dept) {
    const m = { HR:'av-HR', IT:'av-IT', Finance:'av-Finance', Marketing:'av-Marketing',
                Operations:'av-Operations', Admin:'av-Admin' };
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

/* ══════════════════════════════════════════════════════════════
   SAMPLE DATA — mirrors Java Main.java hardcoded employees
══════════════════════════════════════════════════════════════ */
(function loadSample() {
    [
        { id:'E001', name:'Maria Santos',    dept:'HR',        pos:'HR Manager',    type:'ft', monthly:35000, allow:3000 },
        { id:'E002', name:'Juan dela Cruz',  dept:'IT',        pos:'Developer',     type:'ft', monthly:40000, allow:2500 },
        { id:'E003', name:'Ana Reyes',       dept:'Marketing', pos:'Graphic Artist',type:'pt', hrate:150,    hrs:80     },
        { id:'E004', name:'Carlos Bautista', dept:'Finance',   pos:'Accountant',    type:'ft', monthly:30000, allow:2000 },
        { id:'E005', name:'Luisa Garcia',    dept:'IT',        pos:'QA Tester',     type:'pt', hrate:120,    hrs:100    }
    ].forEach(e => {
        db.employees.push(e);
        db.slips[e.id] = [];
        log(`ADDED: ${e.name} [${e.id}] — ${e.dept} · ${e.pos} · ${e.type==='ft'?'Full-Time':'Part-Time'}`);
    });

    syncBadge();
    redrawDash();
    document.getElementById('pay-period').value = 'August 2026';
})();