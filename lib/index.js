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
// ⚠ 已知不确定项（本版没法验证，写在这免得忘）：
//   1) resume 到底要不要 agentOptions（provider/model）—— 这里做成可选，
//      配了就用，没配就交给宿主默认。
//   2) DSH 会不会自己回收闲置 agent —— 如果不会，resume 一次就一劳永逸，
//      定时器只是保险；如果会，就靠它一直保着。
//
// 配置：~/.dsh/session-keeper.json
//   {
//     "开关": true,
//     "会话": ["session-6c5580a6-8161-4de3-9b69-6ceacac435c6"],
//     "间隔分钟": 5
//   }

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 插件的对外名字（也是日志前缀）。 */
export const name = 'session-keeper'

const 配置文件 = join(homedir(), '.dsh', 'session-keeper.json')

const 默认配置 = {
  开关: false, // 安全默认：装上来什么都不做，先在配置里点名要保活的会话
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

export function apply(ctx) {
  let 定时器 = null
  let 停 = false
  let 上次说 = ''

  const 记账 = (文) => {
    try {
      ctx.logger.info(`[keeper] ${文}`)
    } catch { /* 日志不可用不影响保活 */ }
    // 同一句话不必每 5 分钟刷一遍
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
      } catch { /* 单个 id 出错不打断整轮巡�� */ }
    }
    return undefined
  }

  async function 巡检() {
    if (停) return
    const 配置 = 读配置()
    if (!配置.开关) return
    const 目标们 = Array.isArray(配置.会话) ? 配置.会话 : []
    for (const 原 of 目标们) {
      const id = String(原 || '').trim()
      if (!id) continue
      if (找agent(id)) continue // 活着就不管
      try {
        if (typeof ctx.agents.resume !== 'function') {
          记账('这台宿主的 ctx.agents 没有 resume 方法，本次跳过（DSH 版本太老？）')
          return
        }
        const 参数 = { resumeSessionId: id, setup: async () => {} }
        if (配置.agentOptions && typeof 配置.agentOptions === 'object') {
          参数.agentOptions = { ...配置.agentOptions }
        }
        const handle = await ctx.agents.resume(参数)
        // 故意不 dispose —— 要的就是它一直在内存里
        void handle
        记账(`${id} 不在内存里，已 resume 回来`)
      } catch (error) {
        const 文 = `resume ${id} 失败：${String((error && error.message) || error)}`
        if (文 !== 上次说) 记账(文)
      }
    }
  }

  function 开表() {
    const 配置 = 读配置()
    const 分钟 = Math.max(1, Number(配置.间隔分钟) || 5)
    if (定时器) clearInterval(定时器)
    定时器 = setInterval(() => { void 巡检() }, 分钟 * 60 * 1000)
    void 巡检() // 启动时先看一次
    记账(
      `v0.1.0 已加载｜开关 ${配置.开关 ? '开' : '关'}｜间隔 ${分钟} 分钟｜` +
      `目标 ${(配置.会话 || []).length} 间｜配置文件 ${配置文件}`,
    )
  }

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

  // 供设置页/调试用：手动跑一次
  void 会话键
}
