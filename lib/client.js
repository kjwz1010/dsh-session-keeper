// DSH「会话保活」· 设置页半边
//
// 挂在「设置 → 会话保活」里，改开关、间隔、勾选要保活哪几间，还能手动点一次检查。
// 走三个接口：
//   GET  /dsh-session-keeper/config   读配置（含每间活着没）
//   POST /dsh-session-keeper/config   写配置
//   GET  /dsh-session-keeper/sessions 所有会话清单（扫盘，含没打开过的）
//   POST /dsh-session-keeper/check    手动跑一次巡检
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

    const 短id = (id) => {
      const s = String(id || '').replace(/^session-/, '')
      return s.length <= 8 ? s : s.slice(0, 8)
    }

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
      search: {
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid rgba(128,128,128,.35)',
        background: 'transparent',
        color: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
        marginBottom: 8,
      },
      box: {
        maxHeight: 260,
        overflowY: 'auto',
        border: '1px solid rgba(128,128,128,.28)',
        borderRadius: 8,
        padding: '4px 10px',
      },
      line: (on) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 0',
        borderTop: '1px solid rgba(128,128,128,.12)',
        cursor: 'pointer',
        opacity: on ? 1 : 0.82,
      }),
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
      name: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 },
      mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, opacity: 0.45 },
      dot: (on) => ({ width: 7, height: 7, borderRadius: 4, background: on ? '#1a9c50' : 'rgba(128,128,128,.45)', flex: '0 0 auto' }),
      tag: { fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(128,128,128,.18)', marginLeft: 6 },
    }

    function Section() {
      const [载入, 设载入] = React.useState(true)
      const [保存中, 设保存中] = React.useState(false)
      const [开关, 设开关] = React.useState(false)
      const [间隔, 设间隔] = React.useState(5)
      const [会话们, 设会话们] = React.useState([])
      const [选中, 设选中] = React.useState([])
      const [搜, 设搜] = React.useState('')
      const [提示, 设提示] = React.useState('')

      const 拉 = React.useCallback(() => {
        Promise.all([get('/config'), get('/sessions')])
          .then(([c, s]) => {
            if (c && c.ok) {
              设开关(Boolean(c.配置 && c.配置.开关))
              设间隔(Number(c.配置 && c.配置.间隔分钟) || 5)
            }
            if (s && s.ok) {
              设会话们(s.会话们 || [])
              设选中(s.已选 || [])
            } else if (s && s.说) {
              设提示('读会话清单失败：' + s.说)
            }
          })
          .catch((e) => 设提示('读取失败：' + String(e)))
          .finally(() => 设载入(false))
      }, [])

      React.useEffect(() => { 拉() }, [拉])

      const 切 = (id) => {
        设选中((旧) => (旧.indexOf(id) >= 0 ? 旧.filter((x) => x !== id) : 旧.concat([id])))
      }

      const 存 = () => {
        if (!选中.length) {
          设提示('还没勾任何会话')
          return
        }
        设保存中(true)
        设提示('')
        post('/config', { 开关, 间隔分钟: Number(间隔) || 5, 会话: 选中 })
          .then((r) => {
            设提示(r && r.ok ? `已保存 ${选中.length} 间，立刻按新配置跑` : ((r && r.说) || '保存失败'))
            if (r && r.ok) 拉()
          })
          .catch((e) => 设提示('保存失败：' + String(e)))
          .finally(() => 设保存中(false))
      }

      const 检查 = () => {
        设提示('检查中…')
        post('/check', {})
          .then((r) => {
            设提示(r && r.ok ? '检查完了' : ((r && r.说) || '检查失败'))
            拉()
          })
          .catch((e) => 设提示('检查失败：' + String(e)))
      }

      if (载入) return React.createElement('div', { style: S.wrap }, '读配置…')

      const 关 = String(搜 || '').trim().toLowerCase()
      const 过滤后 = 关
        ? 会话们.filter((x) => String(x.标题 || '').toLowerCase().indexOf(关) >= 0 || String(x.id || '').toLowerCase().indexOf(关) >= 0)
        : 会话们
      // 已选但盘上找不到的（会话可能被删了），单独列出来，别让人看不见
      const 幽灵 = 选中.filter((id) => !会话们.some((x) => x.id === id))

      const 一行 = (x, 是幽灵) =>
        React.createElement(
          'label',
          { key: x.id, style: S.line(选中.indexOf(x.id) >= 0) },
          React.createElement('input', {
            type: 'checkbox',
            checked: 选中.indexOf(x.id) >= 0,
            onChange: () => 切(x.id),
          }),
          React.createElement('span', { style: S.name }, 是幽灵 ? '（盘上找不到这个会话）' : (x.标题 || '（未命名会话）')),
          React.createElement('span', { style: S.mono }, 短id(x.id)),
          是幽灵 ? null : React.createElement('span', { style: S.dot(Boolean(x.活着)) }),
          是幽灵 ? React.createElement('span', { style: S.tag }, '幽灵') : null,
        )

      return React.createElement(
        'div',
        { style: S.wrap },
        React.createElement('div', { style: S.title }, '会话保活'),
        React.createElement(
          'div',
          { style: S.sub },
          '定时检查勾选的会话还在不在内存里，不在就把它装回来。',
          React.createElement('br'),
          '不发消息、不开对话轮、不花 token。QQ 桥那类「只往活着的会话投递」的插件靠它才投得进去。',
        ),

        React.createElement(
          'div',
          { style: S.row },
          React.createElement('div', { style: S.label }, '总开关'),
          React.createElement('input', { type: 'checkbox', checked: 开关, onChange: (e) => 设开关(e.target.checked) }),
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

        React.createElement(
          'div',
          { style: { ...S.label, minWidth: 0, margin: '18px 0 6px' } },
          `要保活的会话（已勾 ${选中.length} 间）`,
        ),
        React.createElement('input', {
          style: S.search,
          placeholder: '搜标题或 id…',
          value: 搜,
          onChange: (e) => 设搜(e.target.value),
        }),
        React.createElement(
          'div',
          { style: S.box },
          幽灵.map((id) => 一行({ id, 标题: '', 活着: false }, true)),
          过滤后.map((x) => 一行(x, false)),
          !幽灵.length && !过滤后.length
            ? React.createElement('div', { style: { ...S.hint, padding: '10px 0' } }, '没找到匹配的会话')
            : null,
        ),
        React.createElement('div', { style: S.hint }, '绿点 = 现在活着（在内存里）；灰点 = 没在内存里，巡检时会被装回来。'),

        React.createElement(
          'div',
          { style: { marginTop: 16 } },
          React.createElement('button', { style: S.btnMain, onClick: 存, disabled: 保存中 }, 保存中 ? '保存中…' : '保存'),
          React.createElement('button', { style: S.btn, onClick: 检查 }, '立即检查一次'),
        ),

        提示 ? React.createElement('div', { style: S.hint }, 提示) : null,
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
