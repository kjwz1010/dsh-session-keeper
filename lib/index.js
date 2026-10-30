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

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
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
        if (配置.agentOptions && typeof 配置.agentOptions === 'object') {
          参数.agentOptions = { ...配置.agentOptions }
        }
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
