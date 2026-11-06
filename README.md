# 会话巡检（dsh-session-keeper）

> 插件页显示名「会话巡检」，来自包内 `locale/zh.json` 的 `meta.title`（英文界面显示 Session Keeper）；包名和各项标识仍是 `dsh-session-keeper`。

DSH 插件：**让指定的会话一直活在内存里。**

不发消息、不开对话轮、不调模型 —— 一个 token 都不花。它只是定时调用 DSH 自己的 `ctx.agents.resume()`，把被卸载的会话重新装回内存。

## 为什么需要它

QQ 桥（`dsh-qq-bridge`）投递消息前只调 `ctx.agents.get(id)`，拿不到就直接放弃，回一句「那间会话现在没活着」。会话闲置太久被卸载之后，群消息就再也进不去；而补投窗口只有 10 分钟，等下次有人打开那间再补也来不及。

保活的本质就是：**在消息来之前，先让那间是活的。**

## 装

跟其他第三方 DSH 插件一样，走 profile 的 `package.json`：

```json
"dependencies": {
  "dsh-session-keeper": "https://gitee.com/zhuminming/dsh-session-keeper/repository/archive/master.tar.gz"
}
```

并把 `dsh-session-keeper` 加进 `dsh.profile.bundles` 数组（**这一步漏了插件就不加载**）。

改完关掉 DSH，跑 `pnpm install`，再打开。

**装完必须重启**：profile 的 bundle 列表只在启动时合成，运行中热装任何新 bundle 都会报 `operation-error / next is not a function`，重启后才正常。

## 设置页

装好后在 DSH 的「设置 → 会话巡检」里，直接改：

- 总开关
- 检查间隔（分钟）
- 要保活的会话（一行一个 id）
- 「立即检查一次」——能当场看到每间现在活没活着，不在的会顺手装回来

改的就是下面这个配置文件，手写也行。

## 配置文件

写 `~/.dsh/session-keeper.json`：

```json
{
  "开关": true,
  "会话": ["session-6c5580a6-8161-4de3-9b69-6ceacac435c6"],
  "间隔分钟": 5
}
```

| 字段 | 说明 |
|---|---|
| `开关` | 默认 `false`。装上先不干活，等你点名要保活哪几间 |
| `会话` | 要保活的会话 id 列表，`session-xxx` 和 `xxx` 两种写法都认 |
| `间隔分钟` | 巡检间隔，默认 5。QQ 桥补投窗口是 10 分钟，所以设在 10 以下才有意义 |
| `agentOptions` | 可选。`{ "provider": "deepseek-account", "model": "deepseek-flash" }`，不填就交给宿主默认 |

## 它怎么工作

```
定时器到点 → 挨个看目标会话
   ├─ ctx.agents.get(id) 拿得到 → 活着，跳过
   └─ 拿不到 → ctx.agents.resume({ resumeSessionId }) 装回来
```

resume 返回的 handle **故意不 dispose** —— 要的就是它一直加载着。

## 做不到的 / 不确定的

- **不能唤醒正在跑的轮次**：它只负责"会话在不在内存里"，不负责"回不回消息"。
- **resume 要不要 agentOptions 没验证过**：所以做成可选，两种都由你试。
- **DSH 会不会自己回收闲置 agent 没验证过**：如果不会，resume 一次就一劳永逸，定时器只是保险；如果会，就靠它一直保着。
- 只在装了 `ctx.agents` 服务的宿主上有意义。

## 日志

`[keeper]` 前缀，走 `ctx.logger.info`。同一句报错不会每轮重复刷。
