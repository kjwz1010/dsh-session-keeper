# 会话巡检（dsh-session-keeper）

让指定的会话一直活在内存里。**不发消息、不开对话轮、不调模型，一个 token 都不花**——只是定时调 `ctx.agents.resume()`，把被卸载的会话重新装回来。

> 插件页显示名「会话巡检」来自包内 `locale/zh.json` 的 `meta.title`；包名和各项标识仍是 `dsh-session-keeper`。

## 为什么需要

QQ 桥投递消息前只调 `ctx.agents.get(id)`，拿不到就放弃，回一句「那间会话现在没活着」。闲置太久的会话被卸载后，消息就再也进不去，而补投窗口只有 10 分钟。

保活的本质是：**在消息来之前，先让那间是活的。**

## 装

```json
"dependencies": {
  "dsh-session-keeper": "https://gitee.com/zhuminming/dsh-session-keeper/repository/archive/master.tar.gz"
}
```

再把 `dsh-session-keeper` 加进 profile `package.json` 的 `dsh.profile.bundles`（**漏了插件不加载**），跑 `pnpm install`。

**装完必须重启 DSH**：bundle 列表只在启动时合成，运行中热装任何新 bundle 都会报 `operation-error / next is not a function`。

## 用

设置 → 会话巡检，直接改：总开关、检查间隔、要保活的会话（勾选）、「立即检查一次」（能当场看到每间活没活着，不在的顺手装回来）。

也可以手写 `~/.dsh/session-keeper.json`：

```json
{
  "开关": true,
  "会话": ["session-6c5580a6-8161-4de3-9b69-6ceacac435c6"],
  "间隔分钟": 5
}
```

| 字段 | 说明 |
| --- | --- |
| `开关` | 默认 `false`，装上先不干活，等你点名 |
| `会话` | 要保活的 id，`session-xxx` 和 `xxx` 都认 |
| `间隔分钟` | 默认 5。QQ 桥补投窗口是 10 分钟，设在 10 以下才有意义 |
| `agentOptions` | 可选。`{ "provider": "deepseek-account", "model": "deepseek-flash" }`，不填用宿主默认 |

## 做不到的

- **只保证“在内存里”，不保证“回消息”**——正在跑的轮次唤不醒。
- `resume` 是否真需要 `agentOptions`、DSH 会不会自己回收闲置 agent，都没实测，所以前者做成可选。
