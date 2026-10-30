// DSH「会话保活」· 设置页半边
//
// 挂在「设置 → 会话保活」里，改开关、间隔、要保活哪几间，还能手动点一次检查。
// 走 /dsh-session-keeper/config（读/写）和 /dsh-session-keeper/check（手动巡检）。
//
// ⚠ 会话列表那个 textarea 是**非受控**的（defaultValue + ref），保存时直接读
//   框里真实的文字。以前用受控 value + useState，屏幕上填了两行、state 却还是
//   旧的，保存发出去只有一条 —— 而且看界面完全看不出来。
window.__ModuleLoader__.load({
  id: 'dsh-session-keeper',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']
    const B = '/dsh-session-keeper'

    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json())
    const post = (p, body) =>
      fetch(B + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then((r) => r.json())

    const S = {
      wrap: { padding: '4px 0 18px' },
      title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: 12, opacity: 0.6, margin: '0 0 16px', lineHeight: 1.6 },
      row: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' },
      label: { fontSize: 13, minWidth: 96, opacity: 0.85 },
      input: {
        fontSize: 13,
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.35)',
        background: 'transparent',
        color: 'inherit',
        width: 90,
      },
      area: {
        fontSize: 12,
        fontFamily: 'ui-monospace, Consolas, monospace',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.35)',
        background: 'transparent',
        color: 'inherit',
        width: '100%',
        minHeight: 84,
        resize: 'vertical',
        lineHeight: 1.6,
        boxSizing: 'border-box',
      },
      btn: {
        fontSize: 13,
        padding: '7px 16px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.35)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        marginRight: 8,
      },
      btnMain: { fontSize: 13, padding: '7px 18px', borderRadius: 6, border: 'none', background: '#3b6ef5', color: '#fff', cursor: 'pointer', marginRight: 8 },
      hint: { fontSize: 12, opacity: 0.65, marginTop: 6, lineHeight: 1.6 },
      list: { margin: '10px 0 0', padding: 0, listStyle: 'none' },
      item: { fontSize: 12, padding: '6px 0', borderTop: '1px solid rgba(128,128,128,.16)', display: 'flex', gap: 8, alignItems: 'center' },
      dot: (on) => ({ width: 7, height: 7, borderRadius: 4, background: on ? '#1a9c50' : '#d14343', flex: '0 0 auto' }),
      mono: { fontFamily: 'ui-monospace, Consolas, monospace', opacity: 0.75 },
    }

    function Section() {
      const [载入, 设载入] = React.useState(true)
      const [保存中, 设保存中] = React.useState(false)
      const [开关, 设开关] = React.useState(false)
      const [间隔, 设间隔] = React.useState(5)
      const [状态, 设状态] = React.useState([])
      const [提示, 设提示] = React.useState('')
      const 会话框 = React.useRef(null)

      const 拉 = React.useCallback(() => {
        get('/config')
          .then((r) => {
            if (!r || !r.ok) { 设提示((r && r.说) || '读配置失败'); return }
            const c = r.配置 || {}
            设开关(Boolean(c.开关))
            设间隔(Number(c.间隔分钟) || 5)
            if (会话框.current) 会话框.current.value = (c.会话 || []).join('\n')
            设状态(r.状态 || [])
          })
          .catch((e) => 设提示('读配置失败：' + String(e)))
          .finally(() => 设载入(false))
      }, [])

      React.useEffect(() => { 拉() }, [拉])

      // ⚠ 直接读框里真实的文字，不依赖 state
      const 读会话 = () => {
        const 原 = 会话框.current ? 会话框.current.value : ''
        return String(原 || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      }

      const 存 = () => {
        设保存中(true)
        设提示('')
        const 新会话 = 读会话()
        if (!新会话.length) {
          设提示('还没填会话 id —— 一行一个')
          设保存中(false)
          return
        }
        post('/config', { 开关, 间隔分钟: Number(间隔) || 5, 会话: 新会话 })
          .then((r) => {
            设提示(r && r.ok ? `已保存 ${新会话.length} 间，立刻按新配置跑` : ((r && r.说) || '保存失败'))
            if (r && r.ok) 拉()
          })
          .catch((e) => 设提示('保存失败：' + String(e)))
          .finally(() => 设保存中(false))
      }

      const 检查 = () => {
        设提示('检查中…')
        post('/check', {})
          .then((r) => {
            设状态((r && r.结果) || [])
            设提示(r && r.ok ? '检查完了' : ((r && r.说) || '检查失败'))
          })
          .catch((e) => 设提示('检查失败：' + String(e)))
      }

      if (载入) return React.createElement('div', { style: S.wrap }, '读配置…')

      return React.createElement(
        'div',
        { style: S.wrap },
        React.createElement('div', { style: S.title }, '会话保活'),
        React.createElement(
          'div',
          { style: S.sub },
          '定时检查指定的会话还在不在内存里，不在就把它装回来。',
          React.createElement('br'),
          '不发消息、不开对话轮、不花 token。QQ 桥那类「只往活着的会话投递」的插件靠它才投得进去。',
        ),

        React.createElement(
          'div',
          { style: S.row },
          React.createElement('div', { style: S.label }, '总开关'),
          React.createElement('input', {
            type: 'checkbox',
            checked: 开关,
            onChange: (e) => 设开关(e.target.checked),
          }),
        ),

        React.createElement(
          'div',
          { style: S.row },
          React.createElement('div', { style: S.label }, '检查间隔'),
          React.createElement('input', {
            type: 'number',
            min: 1,
            max: 240,
            value: 间隔,
            style: S.input,
            onChange: (e) => 设间隔(e.target.value),
          }),
          React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, '分钟'),
        ),
        React.createElement(
          'div',
          { style: S.hint },
          'QQ 桥的补投窗口是 10 分钟，所以设在 10 以下才有意义。不花 token，设小一点也不心疼。',
        ),

        React.createElement('div', { style: { ...S.label, minWidth: 0, margin: '16px 0 6px' } }, '要保活的会话（一行一个 id）'),
        React.createElement('textarea', {
          style: S.area,
          defaultValue: '',
          ref: 会话框,
          placeholder: 'session-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          spellCheck: false,
        }),

        React.createElement(
          'div',
          { style: { marginTop: 16 } },
          React.createElement('button', { style: S.btnMain, onClick: 存, disabled: 保存中 }, 保存中 ? '保存中…' : '保存'),
          React.createElement('button', { style: S.btn, onClick: 检查 }, '立即检查一次'),
          React.createElement('button', { style: S.btn, onClick: 拉 }, '重新读取（会覆盖框里的内容）'),
        ),

        提示 ? React.createElement('div', { style: S.hint }, 提示) : null,

        状态 && 状态.length
          ? React.createElement(
              'ul',
              { style: S.list },
              状态.map((x, i) =>
                React.createElement(
                  'li',
                  { key: x.会话 || i, style: S.item },
                  React.createElement('span', { style: S.dot(Boolean(x.活着)) }),
                  React.createElement('span', { style: S.mono }, x.会话),
                  React.createElement('span', { style: { marginLeft: 'auto', opacity: 0.7 } }, x.说明 || (x.活着 ? '活着' : '不在')),
                ),
              ),
            )
          : null,
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          {
            name: 'settings.section',
            id: 'session-keeper',
            order: 52,
            label: () => '会话保活',
          },
          () => React.createElement('div', null, React.createElement(Section)),
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
