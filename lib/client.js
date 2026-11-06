// DSH「会话巡检」· 设置页半边
//
// 挂在「设置 → 会话巡检」里，改开关、间隔、勾选要巡检哪几间，还能手动跑一轮。
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
      const s = String(id || '').replace(/^(session-)+/, '')
      return s.length <= 8 ? s : s.slice(0, 8)
    }

    const S = {
      wrap: { padding: '4px 0 18px' },
      title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: 12, opacity: 0.6, margin: '0 0 16px', lineHeight: 1.6 },
      row: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' },
      label: { fontSize: 13, minWidth: 72, opacity: 0.85 },
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
      const [看全部, 设看全部] = React.useState(false)
      const [提示, 设提示] = React.useState('')
      const [默认模型, 设默认模型] = React.useState('')
      const [模型们, 设模型们] = React.useState([])

      const 拉 = React.useCallback(() => {
        Promise.all([get('/config'), get('/sessions'), get('/models')])
          .then(([c, s, m]) => {
            if (m && m.ok) 设模型们(m.模型们 || [])
            if (c && c.ok) {
              设开关(Boolean(c.配置 && c.配置.开关))
              设间隔(Number(c.配置 && c.配置.间隔分钟) || 5)
              const ao = c.配置 && c.配置.agentOptions
              设默认模型(ao && ao.provider && ao.model ? ao.provider + '/' + ao.model : '')
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
        const 模型 = (() => {
          const t = String(默认模型 || '').trim()
          if (!t) return null
          const i = t.indexOf('/')
          if (i <= 0 || i === t.length - 1) return undefined
          return { provider: t.slice(0, i), model: t.slice(i + 1) }
        })()
        if (模型 === undefined) {
          设提示('默认模型要写成 provider/model，比如 deepseek-account/deepseek-flash')
          return
        }
        设保存中(true)
        设提示('')
        post('/config', { 开关, 间隔分钟: Number(间隔) || 5, 会话: 选中, agentOptions: 模型 })
          .then((r) => {
            设提示(r && r.ok ? `已保存 ${选中.length} 间，立刻按新配置跑` : ((r && r.说) || '保存失败'))
            if (r && r.ok) 拉()
          })
          .catch((e) => 设提示('保存失败：' + String(e)))
          .finally(() => 设保存中(false))
      }

      const 巡检一轮 = () => {
        设提示('巡检中…')
        post('/check', {})
          .then((r) => {
            设提示(r && r.ok ? '巡检完了' : ((r && r.说) || '巡检失败'))
            拉()
          })
          .catch((e) => 设提示('巡检失败：' + String(e)))
      }

      if (载入) return React.createElement('div', { style: S.wrap }, '读配置…')

      const 关 = String(搜 || '').trim().toLowerCase()
      const 搜后 = 关
        ? 会话们.filter((x) => String(x.标题 || '').toLowerCase().indexOf(关) >= 0 || String(x.id || '').toLowerCase().indexOf(关) >= 0)
        : 会话们
      // 默认只列「现在活着的」+「已经勾过的」（勾过的必须留着，否则取消不了勾）。
      // 刚启动时可能一间活的都没有，那就没有能勾的对象了 —— 所以给一个「看全部」的口子。
      const 过滤后 = 看全部
        ? 搜后
        : 搜后.filter((x) => Boolean(x.活着) || 选中.indexOf(x.id) >= 0)
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
        React.createElement('div', { style: S.title }, '会话巡检'),
        React.createElement(
          'div',
          { style: S.sub },
          '定时巡检勾选的会话还在不在内存里，不在就把它装回来。',
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
          React.createElement('div', { style: S.label }, '间隔'),
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
          { style: S.row },
          React.createElement('div', { style: S.label }, '默认模型'),
          React.createElement(
            'select',
            {
              value: 默认模型,
              style: { ...S.input, width: 360, cursor: 'pointer' },
              onChange: (e) => 设默认模型(e.target.value),
            },
            [
              ...(默认模型 && !模型们.some((m) => m.值 === 默认模型)
                ? [React.createElement('option', { key: '__cur', value: 默认模型 }, 默认模型 + '（当前值，不在清单里）')]
                : []),
              React.createElement('option', { key: '__none', value: '' }, '（不指定，按宿主默认 deepseek-flash）'),
              ...模型们.map((m) => React.createElement('option', { key: m.值, value: m.值 }, m.标签 || m.值)),
            ],
          ),
        ),
        React.createElement(
          'div',
          { style: S.hint },
          '点开直接选，不用手打。选项前面是 provider 名、后面是模型名，选中后存成 provider/model。新接进来的 provider 不用先跑一次就会出现在这里。',
        ),
        React.createElement(
          'div',
          { style: S.hint },
          '会话自己带模型就用自己的；这栏是分支会话那类没带模型时的默认值。选「不指定」就用宿主默认的 deepseek-flash。下拉是空的话，说明宿主的模型服务没返回清单，这时只能先不指定。',
        ),
        React.createElement(
          'div',
          { style: S.hint },
          'QQ 桥的补投窗口是 10 分钟，所以设在 10 以下才有意义。不花 token，设小一点也不心疼。',
        ),

        React.createElement(
          'div',
          { style: { ...S.label, minWidth: 0, margin: '18px 0 6px' } },
          `要巡检的会话（已勾 ${选中.length} 间）`,
        ),
        React.createElement('input', {
          style: S.search,
          placeholder: '搜标题或 id…',
          value: 搜,
          onChange: (e) => 设搜(e.target.value),
        }),
        React.createElement(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.8, margin: '0 0 8px', cursor: 'pointer' } },
          React.createElement('input', { type: 'checkbox', checked: 看全部, onChange: (e) => 设看全部(e.target.checked) }),
          '显示全部会话（含未在内存里的）',
        ),
        React.createElement(
          'div',
          { style: S.box },
          幽灵.map((id) => 一行({ id, 标题: '', 活着: false }, true)),
          过滤后.map((x) => 一行(x, false)),
          !幽灵.length && !过滤后.length
            ? React.createElement(
                'div',
                { style: { ...S.hint, padding: '10px 0' } },
                看全部 ? '没找到匹配的会话' : '现在没有活着的会话（勾过的照常列在这里）；要选没活的，勾上「显示全部会话」',
              )
            : null,
        ),
        React.createElement('div', { style: S.hint }, '绿点 = 现在活着（在内存里）；灰点 = 没在内存里，巡检时会被装回来。默认只列活着的和已经勾选的。'),

        React.createElement(
          'div',
          { style: { marginTop: 16 } },
          React.createElement('button', { style: S.btnMain, onClick: 存, disabled: 保存中 }, 保存中 ? '保存中…' : '保存'),
          React.createElement('button', { style: S.btn, onClick: 巡检一轮 }, '巡检'),
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
            label: () => '会话巡检',
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
