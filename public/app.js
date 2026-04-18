const state = {
  page: 'overview',
  overview: null,
  connections: [],
  scripts: [],
  compareResult: null,
  fileBrowser: null,
  scriptBrowser: null,
  selectedConnectionId: '',
  modalOpen: false,
};

const pages = [
  ['overview', '总览', '00'],
  ['adminer', '数据库工作台', '01'],
  ['compare', '文件比对', '02'],
  ['scripts', '脚本中心', '03'],
  ['settings', '连接设置', '04'],
];

const $ = (q, p = document) => p.querySelector(q);
const $$ = (q, p = document) => [...p.querySelectorAll(q)];
const safe = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '请求失败' }));
    throw new Error(error.message);
  }
  return (res.headers.get('content-type') || '').includes('application/json') ? res.json() : res.text();
}

async function refresh() {
  const [overview, connections, scripts, fileBrowser, scriptBrowser] = await Promise.all([
    api('/api/overview'),
    api('/api/connections'),
    api('/api/scripts'),
    api('/api/files/browse', { method: 'POST', body: JSON.stringify({ rootType: 'data', relativePath: '.' }) }),
    api('/api/files/browse', { method: 'POST', body: JSON.stringify({ rootType: 'scripts', relativePath: '.' }) }),
  ]);
  Object.assign(state, {
    overview,
    connections,
    scripts,
    fileBrowser,
    scriptBrowser,
    selectedConnectionId: state.selectedConnectionId || connections[0]?.id || '',
  });
}

function topbar(title, desc, actions = '') {
  return `<div class="topbar"><div><h2>${title}</h2><p>${desc}</p></div><div class="top-actions">${actions}</div></div>`;
}

function kpi(label, value, meta = '', tone = '') {
  return `<div class="kpi ${tone}"><span class="muted">${label}</span><strong>${value}</strong><div class="meta"><span>${meta}</span></div></div>`;
}

function statusPill(label, tone = 'neutral') {
  return `<span class="status-pill ${tone}">${label}</span>`;
}

function browserPanel(browser, root) {
  if (!browser?.entries?.length) return '<div class="empty">当前目录为空</div>';
  return `<div class="table-wrap"><table><thead><tr><th>名称</th><th>类型</th><th>路径</th><th>操作</th></tr></thead><tbody>${browser.entries.map((e) => `
    <tr>
      <td>${safe(e.name)}</td>
      <td>${e.type}</td>
      <td>${safe(e.relativePath)}</td>
      <td>${e.type === 'directory'
        ? `<button class="secondary" data-browse-root="${root}" data-browse-path="${e.relativePath}">打开</button>`
        : `<button class="secondary" data-select-root="${root}" data-select-path="${e.relativePath}">选择</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function overviewPage() {
  const st = state.overview.stats;
  const roots = state.overview.mappedRoots;
  return `${topbar('Enterprise Gateway', '数据库、目录映射、脚本调度与 Adminer 的统一控制中台。', '<button class="primary" id="open-modal">新增连接</button><button class="secondary" data-jump="compare">立即比对</button>')}
  <section class="page">
    <div class="hero-grid">
      <div class="hero">
        <span class="eyebrow">data gateway</span>
        <h3>单一入口完成数据库运维与数据比对</h3>
        <p>采用高信息密度仪表盘风格，强调清晰表格、快速入口和企业级控制台感。数据库账号仅在界面内录入，不进入 compose。</p>
        <div class="row"><span class="tag">single container</span><span class="tag">adminer embedded</span><span class="tag">latest deploy</span></div>
      </div>
      <div class="hero hero-metrics">
        <div class="metric-mini"><span class="muted">当前连接数</span><strong>${st.connections}</strong></div>
        <div class="metric-mini"><span class="muted">定时脚本</span><strong>${st.scheduledScripts}</strong></div>
        <div class="metric-mini"><span class="muted">数据根目录</span><strong style="font-size:14px;line-height:1.6">${safe(roots.data)}</strong></div>
      </div>
    </div>
    <div class="grid cols-3" style="margin-top:18px">${kpi('数据库连接', st.connections, `已保存 ${st.enabledConnections}`, st.connections ? 'ok' : 'warn')}${kpi('脚本任务', st.scripts, `定时 ${st.scheduledScripts}`, st.scheduledScripts ? 'info' : 'warn')}${kpi('Adminer 入口', safe(state.overview.adminerUrl), '内置路径', 'info')}</div>
    <div class="grid cols-2" style="margin-top:18px">
      <div class="panel"><div class="section-head"><div><h3>运行资源</h3><p>容器挂载目录概览</p></div></div><div class="list">
        <div class="list-item"><div><strong>DATA_ROOT</strong><div class="muted">${safe(roots.data)}</div></div><span class="file-pill">dataset</span></div>
        <div class="list-item"><div><strong>SCRIPTS_ROOT</strong><div class="muted">${safe(roots.scripts)}</div></div><span class="file-pill">job</span></div>
        <div class="list-item"><div><strong>LOGS_ROOT</strong><div class="muted">${safe(roots.logs)}</div></div><span class="file-pill">audit</span></div>
      </div></div>
      <div class="panel"><div class="section-head"><div><h3>推荐路径</h3><p>建议的使用顺序</p></div></div><div class="list">
        <div class="list-item"><div><strong>01 录入连接</strong><div class="muted">通过模态框或设置页保存数据库连接。</div></div></div>
        <div class="list-item"><div><strong>02 执行比对</strong><div class="muted">选择 JSON / CSV，对照数据表分析差异。</div></div></div>
        <div class="list-item"><div><strong>03 脚本自动化</strong><div class="muted">从映射目录挑选脚本并配置 cron。</div></div></div>
      </div></div>
    </div>
  </section>`;
}

function adminerPage() {
  return `${topbar('Adminer Workspace', '保留表结构、SQL、导入导出等成熟能力。', '<button class="primary" id="open-modal">新增连接</button>')}
  <section class="page"><div class="panel" style="margin-bottom:18px"><div class="section-head"><div><h3>嵌入式数据库工作台</h3><p>在同一服务内打开 Adminer，无需额外容器。</p></div><span class="file-pill">/adminer/index.php</span></div></div><iframe class="adminer" src="${state.overview.adminerUrl}" title="Adminer"></iframe></section>`;
}

function comparePage() {
  return `${topbar('Data Diff Console', '对比挂载目录中的 JSON/CSV 与数据库记录。', '<button class="secondary" id="open-modal">新增连接</button>')}
  <section class="page split">
    <div class="stack">
      <div class="panel"><div class="section-head"><div><h3>执行比对</h3><p>选连接、选表、选文件，然后执行分析</p></div></div><div class="stack">
        <label>数据库连接<select id="compare-connection">${state.connections.map((i) => `<option value="${i.id}" ${state.selectedConnectionId === i.id ? 'selected' : ''}>${safe(i.name)}</option>`).join('')}</select></label>
        <label>数据表名<input id="compare-table" placeholder="例如 users" /></label>
        <label>主键字段（可选）<input id="compare-key" placeholder="例如 id" /></label>
        <label>已选择文件<input id="compare-file" placeholder="从右侧目录选择文件" /></label>
        <div class="row"><button class="primary" id="run-compare">开始比对</button><button class="secondary" id="sync-compare">同步文件新增</button></div>
      </div></div>
      <div class="panel"><div class="section-head"><div><h3>差异结果</h3><p>summary + 原始明细</p></div>${state.compareResult ? statusPill(state.compareResult.summary.changed ? '检测到差异' : '结构一致', state.compareResult.summary.changed ? 'warn' : 'ok') : statusPill('等待执行', 'neutral')}</div>${state.compareResult
        ? `<div class="result-grid"><div class="result-card"><span class="muted">文件记录</span><strong>${state.compareResult.summary.fileRows}</strong>${statusPill(`仅文件侧 ${state.compareResult.summary.onlyInFile}`, state.compareResult.summary.onlyInFile ? 'warn' : 'ok')}</div><div class="result-card"><span class="muted">数据库记录</span><strong>${state.compareResult.summary.databaseRows}</strong>${statusPill(`仅数据库侧 ${state.compareResult.summary.onlyInDatabase}`, state.compareResult.summary.onlyInDatabase ? 'warn' : 'ok')}</div><div class="result-card"><span class="muted">字段差异</span><strong>${state.compareResult.summary.changed}</strong>${statusPill(state.compareResult.summary.changed ? '需要复核' : '已对齐', state.compareResult.summary.changed ? 'danger' : 'ok')}</div><div class="result-card"><span class="muted">同步动作</span><strong>${state.compareResult.onlyInFile?.length || 0}</strong><span class="muted">仅文件侧可同步新增</span></div></div><div class="codeblock" style="margin-top:14px">${safe(JSON.stringify(state.compareResult, null, 2))}</div>`
        : '<div class="empty">还没有执行比对</div>'}</div>
    </div>
    <div class="panel"><div class="section-head"><div><h3>数据目录浏览器</h3><p>当前位置：${safe(state.fileBrowser?.currentPath || '.')}</p></div></div>${browserPanel(state.fileBrowser, 'data')}</div>
  </section>`;
}

function scriptsPage() {
  return `${topbar('Script Control Center', '浏览脚本目录、配置定时任务、运行脚本并审查日志。', '<button class="secondary" data-jump="settings">去配置连接</button>')}
  <section class="page split"><div class="stack"><div class="panel"><div class="section-head"><div><h3>新增 / 更新脚本</h3><p>从映射目录中选择脚本并配置运行策略</p></div></div><div class="stack">
    <label>脚本名称<input id="script-name" placeholder="例如 nightly-sync" /></label>
    <label>脚本路径<input id="script-path" placeholder="从右侧浏览器选择" /></label>
    <label>工作目录<input id="script-cwd" value="." /></label>
    <label>Cron 定时<input id="script-schedule" placeholder="例如 0 2 * * *" /></label>
    <label>说明<textarea id="script-description" placeholder="脚本作用说明"></textarea></label>
    <label><input id="script-enabled" type="checkbox" style="width:auto;" /> 启用定时调度</label>
    <button class="primary" id="save-script">保存脚本</button></div></div>
    <div class="panel"><div class="section-head"><div><h3>已配置脚本</h3><p>查看运行状态与日志</p></div>${statusPill(`${state.scripts.filter((item) => item.enabled).length} 个启用`, state.scripts.some((item) => item.enabled) ? 'ok' : 'warn')}</div><div class="table-wrap"><table><thead><tr><th>名称</th><th>路径</th><th>计划</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.scripts.map((x) => `<tr><td>${safe(x.name)}</td><td>${safe(x.relativePath)}</td><td>${safe(x.schedule || '手动')}</td><td>${statusPill(safe(x.execution?.status || (x.enabled ? 'waiting' : 'disabled')), x.execution?.status === 'success' ? 'ok' : x.execution?.status === 'failed' ? 'danger' : x.enabled ? 'warn' : 'neutral')}</td><td><button class="secondary" data-run="${x.id}">运行</button> <button class="secondary" data-log="${x.id}">日志</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无脚本配置</td></tr>'}</tbody></table></div><div id="script-log-box" class="codeblock" style="margin-top:14px;">选择脚本后可查看日志</div></div></div>
    <div class="panel"><div class="section-head"><div><h3>脚本目录浏览器</h3><p>当前位置：${safe(state.scriptBrowser?.currentPath || '.')}</p></div></div>${browserPanel(state.scriptBrowser, 'scripts')}</div></section>`;
}

function settingsPage() {
  return `${topbar('Connection Registry', 'compose 中不保存数据库账号，所有连接信息都从这里录入和测试。', '<button class="primary" id="open-modal">弹窗快速添加</button>')}
  <section class="page"><div class="grid cols-2"><div class="panel"><div class="section-head"><div><h3>新增 / 更新连接</h3><p>支持 MySQL / MariaDB 与 PostgreSQL</p></div></div><div class="stack">
    <label>名称<input id="conn-name" placeholder="例如 OVH MySQL" /></label>
    <label>类型<select id="conn-client"><option value="mysql">MySQL / MariaDB</option><option value="postgres">PostgreSQL</option></select></label>
    <label>主机<input id="conn-host" placeholder="127.0.0.1 / db.example.com" /></label>
    <label>端口<input id="conn-port" value="3306" /></label>
    <label>用户<input id="conn-user" placeholder="root" /></label>
    <label>密码<input id="conn-password" type="password" placeholder="******" /></label>
    <label>数据库<input id="conn-database" placeholder="app" /></label>
    <label><input id="conn-enabled" type="checkbox" style="width:auto;" checked /> 启用此连接</label>
    <button class="primary" id="save-connection">保存连接</button></div></div>
    <div class="panel"><div class="section-head"><div><h3>连接列表</h3><p>已保存连接支持立即测试</p></div>${statusPill(`${state.connections.length} 个连接`, state.connections.length ? 'ok' : 'warn')}</div><div class="table-wrap"><table><thead><tr><th>名称</th><th>类型</th><th>地址</th><th>数据库</th><th>操作</th></tr></thead><tbody>${state.connections.map((c) => `<tr><td>${safe(c.name)}</td><td>${statusPill(safe(c.client), c.client === 'postgres' ? 'info' : 'neutral')}</td><td>${safe(c.host)}:${safe(c.port)}</td><td>${safe(c.database)}</td><td><button class="secondary" data-test="${c.id}">测试</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无连接，请先添加</td></tr>'}</tbody></table></div><div id="connection-result" class="empty" style="margin-top:14px;padding:16px">可点击测试验证连接</div></div></div></section>`;
}

function modal() {
  if (!state.modalOpen) return '';
  return `<div class="modal-mask" id="modal-mask"><div class="modal-card"><div class="section-head"><div><h3>快速添加数据库连接</h3><p>信息仅保存到挂载 storage 目录</p></div><button class="secondary" id="close-modal">关闭</button></div><div class="stack"><label>连接名称<input id="m-name" placeholder="例如 ovh-main" /></label><label>数据库类型<select id="m-client"><option value="mysql">MySQL / MariaDB</option><option value="postgres">PostgreSQL</option></select></label><label>主机<input id="m-host" value="127.0.0.1" /></label><label>端口<input id="m-port" value="3306" /></label><label>用户名<input id="m-user" value="root" /></label><label>密码<input id="m-password" type="password" /></label><label>数据库名<input id="m-database" /></label><div class="row"><button class="primary" id="save-modal">保存连接</button></div></div></div></div>`;
}

function page() {
  if (!state.overview) return '<div class="panel">正在加载...</div>';
  return ({
    overview: overviewPage,
    adminer: adminerPage,
    compare: comparePage,
    scripts: scriptsPage,
    settings: settingsPage,
  }[state.page] || overviewPage)();
}

function render() {
  const app = $('#app');
  app.innerHTML = `<div class="layout"><aside class="sidebar"><div class="brand"><div class="brand-badge">DM</div><h1>Data Manager</h1><p>Adminer + File Diff + Script Control 的企业级数据操作中台。</p><div class="status-chip">single service runtime</div></div><div class="nav">${pages.map(([id, label, no]) => `<button class="${state.page === id ? 'active' : ''}" data-page="${id}"><span>${label}</span><span>${no}</span></button>`).join('')}</div><div class="sidebar-foot"><strong>Gateway Notes</strong><span>采用高信息密度的紫橙浅色体系，突出路径选择与表格可读性。</span></div></aside><main class="main">${page()}</main></div>${modal()}`;
  $$('[data-page]').forEach((b) => { b.onclick = () => { state.page = b.dataset.page; render(); }; });
  $$('[data-jump]').forEach((b) => { b.onclick = () => { state.page = b.dataset.jump; render(); }; });
  bind();
}

async function saveModalConnection() {
  const payload = {
    name: $('#m-name').value || `${$('#m-client').value}@${$('#m-host').value}`,
    client: $('#m-client').value,
    host: $('#m-host').value,
    port: $('#m-port').value,
    user: $('#m-user').value,
    password: $('#m-password').value,
    database: $('#m-database').value,
    enabled: true,
  };
  const saved = await api('/api/connections', { method: 'POST', body: JSON.stringify(payload) });
  state.modalOpen = false;
  await refresh();
  state.selectedConnectionId = saved.id;
  render();
}

function bind() {
  $$('[data-browse-root]').forEach((b) => {
    b.onclick = async () => {
      const rootType = b.dataset.browseRoot;
      const res = await api('/api/files/browse', { method: 'POST', body: JSON.stringify({ rootType, relativePath: b.dataset.browsePath }) });
      if (rootType === 'data') state.fileBrowser = res; else state.scriptBrowser = res;
      render();
    };
  });

  $$('[data-select-path]').forEach((b) => {
    b.onclick = () => {
      const input = $(b.dataset.selectRoot === 'data' ? '#compare-file' : '#script-path');
      if (input) input.value = b.dataset.selectPath;
    };
  });

  $('#open-modal')?.addEventListener('click', () => { state.modalOpen = true; render(); });
  $('#close-modal')?.addEventListener('click', () => { state.modalOpen = false; render(); });
  $('#modal-mask')?.addEventListener('click', (ev) => { if (ev.target.id === 'modal-mask') { state.modalOpen = false; render(); } });
  $('#save-modal')?.addEventListener('click', saveModalConnection);

  $('#run-compare')?.addEventListener('click', async () => {
    state.selectedConnectionId = $('#compare-connection').value;
    state.compareResult = await api('/api/compare', { method: 'POST', body: JSON.stringify({ connectionId: state.selectedConnectionId, tableName: $('#compare-table').value, keyField: $('#compare-key').value, filePath: $('#compare-file').value }) });
    render();
  });

  $('#sync-compare')?.addEventListener('click', async () => {
    if (!state.compareResult?.onlyInFile?.length) return alert('当前没有仅文件侧新增的数据可同步。');
    const res = await api('/api/compare/sync', { method: 'POST', body: JSON.stringify({ connectionId: $('#compare-connection').value, tableName: $('#compare-table').value, rows: state.compareResult.onlyInFile }) });
    alert(`同步完成，影响行数：${res.affectedRows}`);
  });

  $('#save-script')?.addEventListener('click', async () => {
    await api('/api/scripts', { method: 'POST', body: JSON.stringify({ name: $('#script-name').value, relativePath: $('#script-path').value, workingDirectory: $('#script-cwd').value, schedule: $('#script-schedule').value, description: $('#script-description').value, enabled: $('#script-enabled').checked }) });
    state.scripts = await api('/api/scripts');
    render();
  });

  $$('[data-run]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/scripts/${b.dataset.run}/run`, { method: 'POST' });
      state.scripts = await api('/api/scripts');
      render();
    };
  });

  $$('[data-log]').forEach((b) => {
    b.onclick = async () => {
      const target = $('#script-log-box');
      if (target) target.textContent = await api(`/api/scripts/${b.dataset.log}/logs`) || '暂无日志';
    };
  });

  $('#save-connection')?.addEventListener('click', async () => {
    await api('/api/connections', { method: 'POST', body: JSON.stringify({ name: $('#conn-name').value, client: $('#conn-client').value, host: $('#conn-host').value, port: $('#conn-port').value, user: $('#conn-user').value, password: $('#conn-password').value, database: $('#conn-database').value, enabled: $('#conn-enabled').checked }) });
    state.connections = await api('/api/connections');
    render();
  });

  $$('[data-test]').forEach((b) => {
    b.onclick = async () => {
      const res = await api(`/api/connections/${b.dataset.test}/test`, { method: 'POST' });
      const target = $('#connection-result');
      if (target) target.innerHTML = res.ok ? `${statusPill('连接成功', 'ok')}<div style="margin-top:8px" class="muted">数据库已通过即时连通性测试。</div>` : `${statusPill('连接失败', 'danger')}<div style="margin-top:8px" class="muted">请检查主机、端口、用户和密码。</div>`;
    };
  });
}

refresh().then(render).catch((error) => {
  $('#app').innerHTML = `<div class="panel" style="margin:24px">加载失败：${safe(error.message)}</div>`;
});
