// DSH「会话保活」· 宿主半边
//
// 干一件事：**让指定的会话一直活在内存里。**
//
//   定时器到点 → 挨个看目标会话
//     ├─ ctx.agents.get(id) 拿得到 → 活着，什么都不做
//     └─ 拿不到 → ctx.agents.resume({ resumeSessionId }) 把它装回来
//
// 为什么需要它：
//   QQ 桥（dsh-qq-bridge）投递消息前只调 ctx.agents.get()，拿不到就直接放弃，
//   回一句「那间会话现在没活着」。会话闲置太久被卸载之后，群消息就永远进不去。
//   补投窗口只有 10 分钟，等下次有人打开那间再补也来不及。
//
// ⚠ 本插件**不发消息、不开对话轮、不调模型**，所以一个 token 都不花。
//   它只是调用 DSH 自己的 agents.resume()，把持久化的会话重新装进内存。
//
// 配置：~/.dsh/session-keeper.json（设置页可改）
//   {
//     "开关": true,
//     "会话": ["session-6c5580a6-8161-4de3-9b69-6ceacac435c6"],
//     "间隔分钟": 5
//   }

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 插件的对外名字（也是路由前缀、日志前缀）。 */
export const name = 'session-keeper'

/**
 * ⚠ 必须声明用到的宿主服务，否则 cordis 不会往 ctx 上注入 ——
 *    ctx.agents / ctx.webServer 全是 undefined，插件加载即抛错，
 *    而宿主是**静默跳过**的：路由 404、设置页照常出现（前端不依赖后端），
 *    看起来像「插件装上了但没反应」。这个坑吃过一次。
 */
export const inject = ['agents', 'webServer']

const 家 = join(homedir(), '.dsh')
const 配置文件 = join(家, 'session-keeper.json')
const 日志文件 = join(家, 'session-keeper.log')
const 路由前缀 = '/dsh-session-keeper'

/** 排查用的落盘日志：ctx.logger 只在宿主控制台，出问题时看不到，所以另写一份。 */
function 记文件(文) {
  try {
    appendFileSync(日志文件, `${new Date().toISOString()} ${文}\n`, 'utf8')
  } catch { /* 记不下来不影响功能 */ }
}

const 默认配置 = {
  开关: false, // 安全默认：装上来什么都不做，先在设置页点名要保活的会话
  会话: [],
  间隔分钟: 5,
  agentOptions: null, // 可选：{ provider: 'deepseek-account', model: 'deepseek-flash' }
}

/**
 * 扫盘列出所有会话（含没打开过的）。
 * 抄 self 之外的老路子：`~/.dsh/storages/session_projcache/sessions/*.json`，
 * 每份里 `record.rows.title.val` 是标题、`record.rows.subagent.val.identity` 是子智能体会话（滤掉）。
 * 为什么不用 ctx.sessions.list()：那个只给"已经装进内存"的那些，而保活要选的多半正是没装进来的。
 */
function 扫盘会话() {
  const 出 = []
  try {
    const 目录 = join(家, 'storages', 'session_projcache', 'sessions')
    for (const 名 of readdirSync(目录)) {
      if (!String(名).endsWith('.json')) continue
      const id = String(名).slice(0, -5)
      let 记 = null
      try {
        记 = JSON.parse(readFileSync(join(目录, 名), 'utf8'))
      } catch { continue }
      const rows = (记 && 记.record && 记.record.rows) || {}
      const 子 = rows.subagent && rows.subagent.val && rows.subagent.val.identity
      if (子) continue // 子智能体的会话不列
      const 标题 = rows.title && typeof rows.title.val === 'string' ? rows.title.val : ''
      const 时 = Number(记 && 记.seq) || 0
      // ⚠ id 用文件名原样，**不要**加也不要去掉 `session-` 前缀：
      //   盘上 84 个文件带前缀、59 个不带，主目录也是两种都有（`0589f2eb-…` / `session-2d4e24af-…`）。
      //   任何"统一成一种写法"都会让另一半对不上，查 agent 查不到，永远是灰的。
      出.push({ id, 标题, 排序: 时 })
    }
  } catch { /* 目录不存在就当没有 */ }
  // 有标题的排前面，其次按序号倒序（大致等于最近用过的靠前）
  return 出.sort((a, b) => (b.排序 || 0) - (a.排序 || 0))
}

/**
 * 从会话文件里读出它原本用的模型。
 *
 * ⚠ 为什么必须带：resume 只是把会话装回来，**不会自动装上模型**。不传 agentOptions 的话
 *   拿回的 agent 是个"没有模型的空壳"，它一开口就炸在
 *   `prompt variable "{{model}}" has no value ... (section "deployment:persona-prefix")`
 *   —— 因为那段人设前缀模板 `You are a coding agent powered by the {{model}} model.`
 *   要靠 agent 的模型选择来填。
 */
function 读会话模型(id) {
  const 原 = String(id || '').trim()
  if (!原) return null
  const 目录 = join(家, 'storages', 'session_projcache', 'sessions')
  // 盘上文件名两种写法都有，所以三种都试一遍（原样 / 去前缀 / 加前缀）
  const 候 = [
    原,
    原.replace(/^session-/, ''),
    原.startsWith('session-') ? 原 : 'session-' + 原,
  ]
  for (const 名 of 候) {
    try {
      const p = join(目录, 名 + '.json')
      const d = JSON.parse(readFileSync(p, 'utf8'))
      const rows = (d && d.record && d.record.rows) || {}
      const ms = rows.modelSelection && rows.modelSelection.val
      const 选 = (ms && (ms.lastUsed || ms.pending)) || null
      if (!选 || !选.provider || !选.model) continue
      const 出 = { provider: 选.provider, model: 选.model }
      if (选.reasoningEffort) 出.reasoningEffort = 选.reasoningEffort
      return 出
    } catch {
      continue
    }
  }
  return null
}

function 读配置() {
  try {
    const raw = JSON.parse(readFileSync(配置文件, 'utf8'))
    return { ...默认配置, ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch {
    return { ...默认配置 }
  }
}

function 写配置(新) {
  const 干净 = {
    开关: Boolean(新 && 新.开关),
    会话: Array.isArray(新 && 新.会话)
      ? 新.会话.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    间隔分钟: Math.min(240, Math.max(1, Number((新 && 新.间隔分钟) || 5))),
    agentOptions: (新 && 新.agentOptions && typeof 新.agentOptions === 'object') ? { ...新.agentOptions } : null,
  }
  try {
    mkdirSync(家, { recursive: true })
  } catch { /* 已存在 */ }
  writeFileSync(配置文件, JSON.stringify(干净, null, 2), 'utf8')
  return 干净
}

/** 读请求体（JSON）。
 *  ⚠ DSH 的 req 只保证是**异步可迭代对象**，不一定有 on('data') 事件 ——
 *    照普通 Node 那样挂事件监听会读到空字符串，后端直接抛，前端看到的是空响应。 */
async function 读体(req) {
  let raw = ''
  try {
    for await (const chunk of req) raw += chunk
  } catch { /* 读失败就当空体 */ }
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function 回(res, o) {
  try {
    res.setHeader?.('content-type', 'application/json; charset=utf-8')
    res.end?.(JSON.stringify(o))
  } catch { /* 连接已断 */ }
}

export function apply(ctx) {
  let 定时器 = null
  let 停 = false
  let 上次说 = ''

  const 记账 = (文) => {
    try { ctx.logger.info(`[keeper] ${文}`) } catch { /* 日志不可用不影响保活 */ }
    上次说 = 文
  }

  /** 找一间会话现在在不在内存里（带/不带 session- 前缀都试）。 */
  const 找agent = (id) => {
    const 原 = String(id || '').trim()
    if (!原) return undefined
    const 候选 = 原.startsWith('session-') ? [原, 原.slice('session-'.length)] : [原, 'session-' + 原]
    for (const 一个 of 候选) {
      try {
        const a = ctx.agents.get(一个)
        if (a !== undefined) return a
      } catch { /* 单个 id 出错不打断整轮巡检 */ }
    }
    return undefined
  }

  /** 跑一轮巡检，返回每一间的结果（设置页也用这个显示状态）。 */
  async function 巡检() {
    const 配置 = 读配置()
    const 结果 = []
    if (!配置.开关) {
      return { 开关: false, 结果: (配置.会话 || []).map((id) => ({ 会话: id, 活着: Boolean(找agent(id)), 说明: '开关关着，没动' })) }
    }
    for (const id of 配置.会话 || []) {
      if (找agent(id)) {
        结果.push({ 会话: id, 活着: true, 说明: '活着' })
        continue
      }
      try {
        if (typeof ctx.agents.resume !== 'function') {
          结果.push({ 会话: id, 活着: false, 说明: '这台宿主的 ctx.agents 没有 resume（DSH 版本太老？）' })
          continue
        }
        const 参数 = { resumeSessionId: id, setup: async () => {} }
        // 模型：配置里显式填了就用配置的；否则读会话自己原本用的那个。
        // 两个都没有就**不 resume** —— 宁可它挂着等人打开，也不要造一个没模型的空壳出来炸。
        const 模型 = (配置.agentOptions && typeof 配置.agentOptions === 'object')
          ? { ...配置.agentOptions }
          : 读会话模型(id)
        if (!模型) {
          结果.push({ 会话: id, 活着: false, 说明: '读不到它原本的模型，没敢 resume（怕造出没模型的空壳）' })
          记账(`${id} 读不到模型，跳过 resume`)
          continue
        }
        参数.agentOptions = 模型
        const handle = await ctx.agents.resume(参数)
        void handle // 故意不 dispose —— 要的就是它一直在内存里
        结果.push({ 会话: id, 活着: true, 说明: '刚 resume 回来' })
        记账(`${id} 不在内存里，已 resume 回来`)
      } catch (error) {
        const 文 = String((error && error.message) || error)
        结果.push({ 会话: id, 活着: false, 说明: 'resume 失败：' + 文 })
        if (`resume ${id} 失败：${文}` !== 上次说) 记账(`resume ${id} 失败：${文}`)
      }
    }
    return { 开关: true, 结果 }
  }

  /** 按当前配置（重）开定时器。 */
  function 开表() {
    if (停) return
    const 配置 = 读配置()
    const 分钟 = Math.max(1, Number(配置.间隔分钟) || 5)
    if (定时器) clearInterval(定时器)
    定时器 = setInterval(() => { void 巡检() }, 分钟 * 60 * 1000)
    void 巡检() // 启动/改配置后先跑一次
    记账(
      `v0.2.0 已加载｜开关 ${配置.开关 ? '开' : '关'}｜间隔 ${分钟} 分钟｜` +
      `目标 ${(配置.会话 || []).length} 间｜配置文件 ${配置文件}`,
    )
  }

  // ---------- 路由（设置页用） ----------

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: 路由前缀 + '/config',
    handler: async (req, res) => {
      记文件(`进入 config handler｜method=${req && req.method}｜url=${req && req.url}`)
      try {
        if (req && req.method === 'GET') {
          const 配置 = 读配置()
          const 状态 = (配置.会话 || []).map((id) => ({ 会话: id, 活着: Boolean(找agent(id)) }))
          return 回(res, { ok: true, 配置, 状态, 配置文件 })
        }
        const 新 = await 读体(req)
        记文件(`读到体：${JSON.stringify(新).slice(0, 200)}`)
        const 存好 = 写配置(新)
        记文件('写配置完成')
        开表() // 改完立刻按新配置跑
        记文件('开表完成')
        回(res, { ok: true, 配置: 存好, 说: '已保存' })
      } catch (error) {
        记文件(`异常：${String((error && error.stack) || error)}`)
        回(res, { ok: false, 说: String((error && error.message) || error) })
      }
    },
  }), 'session-keeper: 配置接口')

  // 会话清单（给设置页的下拉/勾选列表用）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: 路由前缀 + '/sessions',
    handler: async (req, res) => {
      try {
        const 配置 = 读配置()
        // 比较时统一去掉 session- 前缀（盘上两种写法都有）；但存回配置时保持原样，
        // 因为 agents.get 两种都认，而原样才是盘上真实的 id。
        const 键 = (v) => String(v || '').trim().replace(/^session-/, '')
        const 已选键 = new Set((配置.会话 || []).map(键).filter(Boolean))
        const 们 = 扫盘会话().map((x) => ({
          ...x,
          活着: Boolean(找agent(x.id)),
          已选: 已选键.has(键(x.id)),
        }))
        回(res, { ok: true, 会话们: 们, 已选: 配置.会话 || [] })
      } catch (error) {
        回(res, { ok: false, 说: String((error && error.message) || error) })
      }
    },
  }), 'session-keeper: 会话清单接口')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: 路由前缀 + '/check',
    handler: async (req, res) => {
      try {
        回(res, { ok: true, ...(await 巡检()) })
      } catch (error) {
        回(res, { ok: false, 说: String((error && error.message) || error) })
      }
    },
  }), 'session-keeper: 手动检查接口')

  // ---------- 定时器 ----------

  ctx.effect(() => {
    开表()
    return () => {
      停 = true
      if (定时器) {
        clearInterval(定时器)
        定时器 = null
      }
    }
  }, 'session-keeper: 定时巡检')
}
