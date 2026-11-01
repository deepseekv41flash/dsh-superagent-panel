/**
 * dsh-superagent-panel —— client 半（纯 JS，ModuleLoader 包装）。
 *
 * 两个注册：
 *   sidebar.panellist / id=superagent → 左上角面板图标（和「自动化任务」同一排），点击切到 main 面板
 *   main / key=superagent             → 页面：顶部工具条 + 「面板」内嵌 3082 / 「状态」服务卡片
 *
 * 数据来自同源 host 接口 /dsh-superagent-panel/api/*。
 */
window.__ModuleLoader__.load({
  id: 'dsh-superagent-panel',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');
    const h = React.createElement;

    const API = '/@dsh-superagent-panel/api';
    /** 同源代理路径：宿主把实例的 Superagent 反向代理到 <PROXY_PATH><id>/，iframe 因同源而可正常加载。 */
    const PROXY_PATH = '/@dsh-superagent-panel/proxy/';
    const HEADERS = { 'x-dsh-superagent-panel': '1' };
    const PANEL_ID = 'superagent';
    /** 记住当前选中的实例，刷新/重开后保持。 */
    const STORAGE_KEY = 'dsh-superagent-panel:instance';
    /** 桥接页是独立文档，拿不到 DSH 的主题变量；由这里读出来 postMessage 过去。 */
    const THEME_TOKENS = [
      '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3',
      '--dsw-alias-bg-mask-1', '--dsw-alias-bg-module-platform',
      '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption',
      '--dsw-alias-label-dimmed', '--dsw-alias-label-primary-foreground',
      '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
      '--dsw-alias-brand-primary', '--dsw-alias-link',
      '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary', '--dsw-alias-state-error-primary',
      '--dsw-alias-state-idle-primary', '--dsw-alias-state-business-primary',
      '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active',
      '--dsw-alias-button-primary-fill', '--dsw-alias-button-primary-hover',
      '--dsw-alias-button-ghost-active-fill', '--dsw-alias-button-ghost-active-border',
      '--dsw-alias-toast-bg', '--dsw-alias-tooltip-bg', '--dsw-static-neutral-bluish-00',
      '--dsw-elevation-prominent', '--dsw-elevation-soft', '--dsw-shadow-lv3', '--dsw-mask-blur',
    ];
    const themeVars = () => {
      const computed = getComputedStyle(document.documentElement);
      const vars = {};
      for (const name of THEME_TOKENS) {
        const value = computed.getPropertyValue(name).trim();
        if (value) vars[name] = value;
      }
      return vars;
    };

    const TEXTS = {
      zh: {
        label: 'Superagent',
        title: 'Superagent',
        tabPanel: '面板',
        tabStatus: '状态',
        openSession: '打开主 Session',
        openTab: '新标签',
        refresh: '刷新',
        start: '启动',
        stop: '停止',
        restart: '重启',
        running: '运行中',
        stopped: '未运行',
        waiting: '等待 setup',
        partError: '部件报错',
        unknown: '状态未知',
        pids: '进程',
        health: '部件健康',
        setupNeed: '还缺的配置',
        errors: '部件错误',
        workers: '执行器',
        lastCheck: '检查于',
        busy: '操作中…',
        auto: '每 15 秒自动刷新',
        failed: '请求失败',
        iframeEmpty: '服务未启动，无法内嵌面板。',
        iframeHint: '点「启动」拉起服务后，这里会显示 3082 的 Superagent 面板。',
        embedTitle: '内嵌面板暂不可用',
        embedHint: 'DSH NEXT 页面走 dsh-app:// 自定义协议，Chromium 不允许它嵌入 http:// 页面（iframe 被静默拦截）；原生 webview 试验会导致渲染进程崩溃，已回滚。请用「新标签打开」，或在侧栏「浏览器」面板里打开同一地址。',
        copy: '复制地址',
        copied: '地址已复制',
        iframeBlocked: '内嵌面板 6 秒内没有加载出来：可能被宿主页面策略拦截，或该地址不可用。点右上角「新标签」可在外层浏览器直接打开同一地址。',
        noSession: '还没取到主 Session（服务未运行或未初始化）。',
        actionDone: '操作完成',
        instances: '实例',
        switchInstance: '切换实例',
      },
      en: {
        label: 'Superagent',
        title: 'Superagent',
        tabPanel: 'Panel',
        tabStatus: 'Status',
        openSession: 'Open main Session',
        openTab: 'New tab',
        refresh: 'Refresh',
        start: 'Start',
        stop: 'Stop',
        restart: 'Restart',
        running: 'Running',
        stopped: 'Stopped',
        waiting: 'Waiting for setup',
        partError: 'Part failed',
        unknown: 'Unknown',
        pids: 'Process',
        health: 'Parts',
        setupNeed: 'Setup still needs',
        errors: 'Part errors',
        workers: 'Workers',
        lastCheck: 'Checked at',
        busy: 'Working…',
        auto: 'Refreshes every 15 s',
        failed: 'Request failed',
        iframeEmpty: 'Service is not running; the embedded panel is unavailable.',
        iframeHint: 'Press Start; the Superagent panel from 3082 shows up here.',
        embedTitle: 'Embedded panel unavailable',
        embedHint: 'The DSH NEXT page runs on the dsh-app:// custom protocol, and Chromium silently blocks http:// frames from it. The native webview experiment crashed the renderer, so it was rolled back. Use "New tab", or open the same address in the sidebar Browser panel.',
        copy: 'Copy address',
        copied: 'Address copied',
        iframeBlocked: 'The embedded panel did not load within 6 s: the host page may block framing, or the address is unavailable. Use "New tab" to open the same address outside.',
        noSession: 'No main Session yet (service not running or not initialised).',
        actionDone: 'Done',
        instances: 'Instances',
        switchInstance: 'Switch instance',
      },
    };

    const STATE_TEXT = (t, code) => code === 0 ? t.running : code === 2 ? t.partError : code === 3 ? t.waiting : code === 1 ? t.stopped : t.unknown;
    const STATE_COLOR = (code) => code === 0 ? 'var(--dsw-alias-state-success-primary)'
      : code === 2 ? 'var(--dsw-alias-state-warn-primary)'
      : code === 3 ? 'var(--dsw-alias-brand-primary)'
      : code === 1 ? 'var(--dsw-alias-state-error-primary)'
      : 'var(--dsw-alias-state-idle-primary)';
    const PART_COLOR = (state) => state === 'ready' ? 'var(--dsw-alias-state-success-primary)'
      : state === 'error' ? 'var(--dsw-alias-state-error-primary)'
      : state === 'paused' || state === 'starting' ? 'var(--dsw-alias-state-warn-primary)'
      : 'var(--dsw-alias-state-idle-primary)';

    const styles = {
      page: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', color: 'var(--dsw-alias-label-primary)' },
      bar: { flex: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--dsw-alias-border-l1)', flexWrap: 'wrap' },
      title: { fontSize: '14px', fontWeight: 600, margin: 0 },
      pill: { fontSize: '11px', padding: '1px 8px', borderRadius: '999px', border: '1px solid var(--dsw-alias-border-l1)' },
      tabs: { display: 'flex', gap: '2px', padding: '2px', borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-2)' },
      tab: { fontSize: '12px', padding: '3px 10px', borderRadius: '6px', border: 0, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' },
      tabActive: { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)' },
      instances: { display: 'flex', alignItems: 'center', gap: '2px', padding: '2px', borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-2)', maxWidth: '46vw', overflow: 'auto' },
      instance: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '3px 10px', borderRadius: '6px', border: 0, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' },
      instanceActive: { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)' },
      instanceLabel: { overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' },
      dot: { width: '7px', height: '7px', borderRadius: '50%', flex: 'none' },
      spacer: { flex: 1 },
      button: { fontSize: '12px', padding: '4px 10px', borderRadius: '7px', cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)' },
      primary: { borderColor: 'var(--dsw-alias-brand-primary)', background: 'transparent', color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 },
      disabled: { opacity: 0.45, cursor: 'default' },
      body: { flex: 1, minHeight: 0, position: 'relative' },
      iframe: { border: 0, width: '100%', display: 'block', background: 'var(--dsw-alias-bg-base)' },
      blocked: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-base)', textAlign: 'center', padding: '24px' },
      empty: { padding: '24px', fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' },
      statusScroll: { height: '100%', overflow: 'auto', padding: '16px' },
      card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px', padding: '14px' },
      row: { display: 'flex', gap: '12px', alignItems: 'baseline', padding: '5px 0', fontSize: '13px' },
      key: { width: '96px', flex: 'none', color: 'var(--dsw-alias-label-secondary)' },
      value: { wordBreak: 'break-all' },
      parts: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '12px', alignItems: 'center' },
      meta: { marginTop: '10px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' },
    };

    const langOf = (ctx) => {
      try {
        const locale = ctx.get('locale');
        const active = locale && locale.getSnapshot ? locale.getSnapshot().active : '';
        return String(active || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch { return 'zh'; }
    };

    function useLang(ctx) {
      const [lang, setLang] = React.useState(() => langOf(ctx));
      React.useEffect(() => {
        let locale;
        try { locale = ctx.get('locale'); } catch { locale = undefined; }
        if (!locale || !locale.subscribe) return undefined;
        return locale.subscribe(() => setLang(langOf(ctx)));
      }, []);
      return lang;
    }

    function Icon(props) {
      const size = (props && props.size) || 18;
      const active = props && props.active;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: active ? 'var(--dsw-alias-brand-primary)' : 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block', flex: 'none' },
      },
      h('path', { d: 'M12 3c2.8 1.6 4.5 4.4 4.5 7.6 0 1.4-.3 2.7-.9 3.9H8.4a8.9 8.9 0 0 1-.9-3.9C7.5 7.4 9.2 4.6 12 3Z' }),
      h('circle', { cx: 12, cy: 8.6, r: 1.6 }),
      h('path', { d: 'M8.4 14.5 6.5 17l2.6-.6M15.6 14.5l1.9 2.5-2.6-.6M10 20h4M9 17l-1 3M15 17l1 3' }));
    }

    function Pill({ text, color }) {
      return h('span', { style: { ...styles.pill, color, borderColor: color } }, text);
    }

    /** 页面内诊断回报：写到宿主 .artifacts/panel-diag.log，用于排查嵌入失败。 */
    const sendDiag = (event, payload) => fetch(API + '/diag', {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
    }).catch(() => {});

    /** DSH NEXT 桌面端暴露的浏览器桥（自带侧栏浏览器就用它创建 webview 租约）。 */
    const desktopBrowser = () => (typeof window !== 'undefined' && window.dshDesktop && window.dshDesktop.browser) ? window.dshDesktop.browser : null;

    /**
     * 桌面端用 Electron `<webview>` 内嵌：主进程只放行带租约的 webview
     * （`will-attach-webview` 校验 name=lease、partition 与 src=about:blank#lease），
     * 所以必须走 dshDesktop.browser.acquire → 建元素 → dom-ready 后 loadURL，卸载时 release。
     */
    function DesktopPanel({ panelUrl, height, onState }) {
      const hostRef = React.useRef(null);
      React.useEffect(() => {
        const host = hostRef.current;
        const bridge = desktopBrowser();
        if (!host || !panelUrl) return undefined;
        if (!bridge) { onState('blocked'); return undefined; }
        let disposed = false;
        let lease = null;
        const element = document.createElement('webview');
        element.style.cssText = 'width:100%;height:100%;display:block;border:0';
        element.setAttribute('allowpopups', '');
        element.addEventListener('dom-ready', () => {
          if (disposed) return;
          onState('ok');
          element.loadURL(panelUrl).catch((error) => {
            sendDiag('webview', { result: 'loadURL-failed', error: String(error).slice(0, 200) });
            onState('blocked');
          });
        }, { once: true });
        element.addEventListener('did-fail-load', (event) => {
          if (event && event.isMainFrame && event.errorCode !== -3) {
            sendDiag('webview', { result: 'did-fail-load', code: event.errorCode, description: event.errorDescription });
            onState('blocked');
          }
        });
        (async () => {
          try {
            let reservation;
            let lastError;
            for (const workspace of ['superagent', undefined, 'global', '']) {
              try { reservation = await bridge.acquire(workspace); break } catch (error) { lastError = error; }
            }
            if (!reservation) throw lastError ?? new Error('browser.acquire failed');
            if (disposed) { try { bridge.release(reservation.lease); } catch { /* already gone */ } return; }
            lease = reservation.lease;
            element.setAttribute('name', reservation.lease);
            element.setAttribute('partition', reservation.partition);
            element.setAttribute('src', 'about:blank#' + reservation.lease);
            host.replaceChildren(element);
            sendDiag('webview', { result: 'attached', partition: String(reservation.partition).slice(0, 40) });
          } catch (error) {
            sendDiag('webview', { result: 'acquire-failed', error: String(error).slice(0, 200) });
            onState('blocked');
          }
        })();
        return () => {
          disposed = true;
          try { element.remove(); } catch { /* already gone */ }
          if (lease) { try { bridge.release(lease); } catch { /* already gone */ } }
        };
      }, [panelUrl]);
      return h('div', { ref: hostRef, style: { height: height + 'px', width: '100%', minHeight: 0 } });
    }

    function Button({ children, onClick, disabled, primary, title }) {
      const base = primary ? { ...styles.button, ...styles.primary } : styles.button;
      return h('button', { type: 'button', onClick, disabled, title, style: disabled ? { ...base, ...styles.disabled } : base }, children);
    }

    const readStoredInstance = () => {
      try { return (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) || ''; } catch { return ''; }
    };
    const writeStoredInstance = (id) => {
      try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id); } catch { /* 隐私模式/禁用存储 */ }
    };
    /** 单实例接口的返回值里带 instances 清单；老版本宿主没有时退化成当前实例。 */
    const instanceListOf = (seed) => {
      const list = seed && Array.isArray(seed.instances) && seed.instances.length
        ? seed.instances
        : [{ id: (seed && seed.id) || 'default', label: (seed && seed.label) || (seed && seed.id) || 'default' }];
      return list.filter(item => item && item.id).map(item => ({ id: String(item.id), label: String(item.label || item.id) }));
    };
    const statusOf = (id) => {
      const suffix = id ? '?id=' + encodeURIComponent(String(id)) : '';
      return fetch(API + '/status' + suffix, { headers: HEADERS, cache: 'no-store' }).then(async (response) => {
        const value = await response.json().catch(() => null);
        if (!response.ok) throw new Error((value && value.error) || 'HTTP ' + response.status);
        return value;
      });
    };

    function Page(props) {
      const ctx = props.__ctx;
      const lang = useLang(ctx);
      const t = TEXTS[lang];
      const [instances, setInstances] = React.useState([]);
      const [selected, setSelected] = React.useState(() => readStoredInstance());
      const [statuses, setStatuses] = React.useState({});
      const [ready, setReady] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [nonce, setNonce] = React.useState(0);
      const instancesRef = React.useRef([]);
      const selectedRef = React.useRef(selected);
      const bodyRef = React.useRef(null);
      const frameRef = React.useRef(null);
      const [avail, setAvail] = React.useState(() => Math.max(320, (typeof window === 'undefined' ? 800 : window.innerHeight) - 52));
      const [frameState, setFrameState] = React.useState('loading');

      React.useEffect(() => {
        const measure = () => {
          const el = bodyRef.current;
          const height = el && el.clientHeight > 80 ? el.clientHeight : Math.max(320, window.innerHeight - 52);
          setAvail(height);
        };
        measure();
        window.addEventListener('resize', measure);
        let observer;
        if (typeof ResizeObserver !== 'undefined' && bodyRef.current) {
          observer = new ResizeObserver(measure);
          observer.observe(bodyRef.current);
        }
        return () => { window.removeEventListener('resize', measure); if (observer) observer.disconnect(); };
      }, []);

      React.useEffect(() => {
        const report = (event, payload) => sendDiag(event, payload);
        // 环境探针：dsh-app 自定义协议页面里 same-origin iframe 是否可用、桌面桥暴露了哪些能力。
        const probe = document.createElement('iframe');
        probe.style.display = 'none';
        probe.src = API + '/status';
        probe.addEventListener('load', () => report('same-origin-iframe', { ok: true }));
        probe.addEventListener('error', () => report('same-origin-iframe', { ok: false }));
        document.body.appendChild(probe);
        const timer = setTimeout(() => {
          report('env', {
            origin: location.origin,
            protocol: location.protocol,
            href: location.href,
            base: document.baseURI,
            desktopKeys: Object.keys(window.dshDesktop || {}),
          });
          try { probe.remove(); } catch { /* already gone */ }
        }, 2500);
        return () => { clearTimeout(timer); try { probe.remove(); } catch { /* already gone */ } };
      }, []);

      // 刷新所有实例的状态：当前实例决定错误提示，其它实例只用来画切换器上的状态徽标。
      const refreshAll = React.useCallback(async () => {
        const ids = instancesRef.current.map(item => item.id);
        if (ids.length === 0) return;
        const results = await Promise.allSettled(ids.map(id => statusOf(id)));
        const next = {};
        let failure = null;
        results.forEach((result, index) => {
          const id = ids[index];
          if (result.status === 'fulfilled') next[id] = result.value;
          else if (id === selectedRef.current) failure = result.reason;
        });
        setStatuses(prev => ({ ...prev, ...next }));
        if (failure) setError(failure instanceof Error ? failure.message : String(failure));
        else setError(null);
      }, []);

      // 首次进入：先（按记住的实例）取一次状态，响应里的 instances 就是实例清单；
      // 记住的 id 已不存在时退回不带 id 的默认实例。
      React.useEffect(() => {
        let cancelled = false;
        (async () => {
          const stored = readStoredInstance();
          try {
            let seed;
            try { seed = await statusOf(stored); }
            catch (reason) {
              if (!stored) throw reason;
              seed = await statusOf('');
            }
            if (cancelled) return;
            const list = instanceListOf(seed);
            const chosen = list.some(item => item.id === stored) ? stored : list[0].id;
            instancesRef.current = list;
            selectedRef.current = chosen;
            setInstances(list);
            setSelected(chosen);
            setStatuses(seed && seed.id === chosen ? { [chosen]: seed } : {});
            setError(null);
            setReady(true);
            writeStoredInstance(chosen);
          } catch (reason) {
            if (!cancelled) {
              setError(reason instanceof Error ? reason.message : String(reason));
              setReady(true);
            }
          }
        })();
        return () => { cancelled = true; };
      }, []);

      React.useEffect(() => {
        if (!ready) return undefined;
        refreshAll();
        const timer = setInterval(refreshAll, 15000);
        return () => clearInterval(timer);
      }, [ready, refreshAll]);

      const selectInstance = React.useCallback((id) => {
        if (!id || id === selectedRef.current) return;
        selectedRef.current = id;
        setSelected(id);
        writeStoredInstance(id);
        setNotice(null);
        setError(null);
        statusOf(id)
          .then(value => setStatuses(prev => ({ ...prev, [id]: value })))
          .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
      }, []);

      const act = React.useCallback(async (action) => {
        const id = selectedRef.current;
        if (!id) return;
        const instance = instancesRef.current.find(item => item.id === id);
        const label = (instance && instance.label) || id;
        setBusy(action);
        setNotice(null);
        try {
          const response = await fetch(API + '/action', {
            method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({ action, id }),
          });
          const value = await response.json().catch(() => null);
          if (!response.ok) throw new Error((value && value.error) || 'HTTP ' + response.status);
          if (value && value.status) setStatuses(prev => ({ ...prev, [id]: value.status }));
          setNotice(`${t.actionDone} · ${label} (${action}, exit ${value ? value.exitCode : '?'})`);
          setNonce(n => n + 1);
          refreshAll();
        } catch (reason) {
          setNotice(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
          setBusy(null);
        }
      }, [t, refreshAll]);

      const data = (selected && statuses[selected]) || null;
      const openMaster = React.useCallback(() => {
        const id = data && data.masterId;
        if (!id) { setError(t.noSession); return; }
        try {
          const ui = ctx.get('uiWorkspace');
          if (ui && typeof ui.openSession === 'function') { setError(null); ui.openSession(id); }
          else setError(t.noSession);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }, [data, t]);

      const pushTheme = React.useCallback(() => {
        const frame = frameRef.current;
        if (!frame || !frame.contentWindow) return;
        try {
          frame.contentWindow.postMessage({ type: 'superagent-bridge:theme', vars: themeVars(), lang }, '*');
        } catch { /* 跨文档失败时由桥接页内置的默认主题兜底 */ }
      }, [lang]);

      // 桥接面板（同源代理 iframe）通过 postMessage 回到这里：请求主题、打开主 Session。
      React.useEffect(() => {
        const onMessage = (event) => {
          const value = event && event.data;
          if (!value) return;
          if (value.type === 'superagent-bridge:request-theme') { pushTheme(); return; }
          if (value.type !== 'superagent-bridge:open-session' || !value.sessionId) return;
          try {
            const ui = ctx.get('uiWorkspace');
            if (ui && typeof ui.openSession === 'function') { ui.openSession(String(value.sessionId)); return; }
          } catch { /* 走下面的错误提示 */ }
          setError(t.noSession);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, [pushTheme, t]);

      const code = data ? data.exitCode : undefined;
      const panelUrl = data && data.panelUrl ? data.panelUrl : null;
      const running = code === 0;
      const frameSrc = selected ? PROXY_PATH + encodeURIComponent(selected) + '/superagent-bridge/?lang=' + lang : null;

      return h('div', { style: styles.page },
        h('div', { style: styles.bar },
          h(Pill, { text: STATE_TEXT(t, code), color: STATE_COLOR(code) }),
          instances.length > 1 ? h('div', { style: styles.instances, role: 'tablist', 'aria-label': t.instances },
            instances.map((instance) => {
              const instanceStatus = statuses[instance.id];
              const active = instance.id === selected;
              const stateText = instanceStatus ? STATE_TEXT(t, instanceStatus.exitCode) : t.unknown;
              return h('button', {
                key: instance.id,
                type: 'button',
                role: 'tab',
                'aria-selected': active,
                title: t.switchInstance + ': ' + instance.label + ' · ' + stateText,
                onClick: () => selectInstance(instance.id),
                style: active ? { ...styles.instance, ...styles.instanceActive } : styles.instance,
              },
              h('span', { style: { ...styles.dot, background: STATE_COLOR(instanceStatus ? instanceStatus.exitCode : undefined) }, 'aria-hidden': true }),
              h('span', { style: styles.instanceLabel }, instance.label));
            })) : null,
          h('span', { style: styles.spacer }),
          h(Button, { primary: true, disabled: !(data && data.masterId), onClick: openMaster, title: data && data.masterId ? data.masterId : t.noSession }, t.openSession),
          h(Button, { disabled: !!busy, onClick: () => { refreshAll(); setNonce(n => n + 1); } }, t.refresh),
          running
            ? h(Button, { disabled: !!busy, onClick: () => act('stop') }, busy === 'stop' ? t.busy : t.stop)
            : h(Button, { primary: true, disabled: !!busy, onClick: () => act('start') }, busy === 'start' ? t.busy : t.start),
          h(Button, { disabled: !!busy, onClick: () => act('restart') }, busy === 'restart' ? t.busy : t.restart),
          h(Button, { disabled: !panelUrl, onClick: () => panelUrl && window.open(panelUrl, '_blank', 'noopener') }, t.openTab)),
        h('div', { style: styles.body, ref: bodyRef },
          panelUrl && frameSrc
            ? h('iframe', {
              key: 'bridge-' + selected + '-' + nonce,
              ref: frameRef,
              src: frameSrc,
              title: t.title,
              style: { ...styles.iframe, height: avail + 'px' },
              onLoad: () => { sendDiag('bridge-iframe', { result: 'load' }); pushTheme(); },
              onError: () => sendDiag('bridge-iframe', { result: 'error' }),
            })
            : h('div', { style: styles.empty },
              h('div', null, t.iframeEmpty),
              h('div', { style: { marginTop: '6px' } }, t.iframeHint),
              h('div', { style: { marginTop: '14px' } },
                h(Button, { primary: true, disabled: !!busy, onClick: () => act('start') }, busy === 'start' ? t.busy : t.start)))),
        error
          ? h('div', { style: { ...styles.empty, color: 'var(--dsw-alias-state-error-primary)', paddingTop: 0, paddingBottom: '8px' } }, t.failed + ': ' + error)
          : null,
        notice
          ? h('div', { style: { ...styles.empty, color: 'var(--dsw-alias-state-success-primary)', paddingTop: 0, paddingBottom: '8px' } }, notice)
          : null);
    }

    const inject = ['slots'];

    function apply(ctx) {
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => TEXTS[langOf(ctx)].label,
      }, Icon)), 'dsh-superagent-panel: sidebar entry');

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID,
      }, (props) => h(Page, { ...props, __ctx: ctx }))), 'dsh-superagent-panel: panel page');
    }

    module.exports = { inject, apply };
    return module.exports;
  },
});
