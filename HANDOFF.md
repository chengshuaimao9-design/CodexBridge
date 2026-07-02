# HANDOFF — WeChatAgent 项目交接文档

## 项目概览

| 项目 | 说明 |
|------|------|
| **项目名** | WeChatAgent（原名 CodexBridge） |
| **本地路径** | `/Users/zhuanz/Desktop/Githup/运行项目/CodexBridge/` |
| **GitHub** | `git@github.com:chengshuaimao9-design/CodexBridge.git`（未改名） |
| **核心功能** | 微信 ↔ Codex 桌面引擎桥接（微信轻前端收发，Codex 重后端处理） |

---

## 架构

```
微信 App ←→ iLink Bot ←→ WeChatAgent 桥接（Node.js）
                              ↓
                     Codex CLI app-server（本地桌面）
                              ↓
                       OpenAI API（gpt-5.4）
```

- **微信端**：只负责发送消息和接收回复/文件
- **桥接层**：Node.js 进程，轮询微信消息 → 转发给 Codex → 回传结果
- **Codex 引擎**：桌面版 `/Applications/Codex.app/`，负责所有 AI 处理

---

## 环境依赖

| 工具 | 版本/路径 | 用途 |
|------|-----------|------|
| Node.js | v24.16.0（nvm 管理） | 桥接运行时 |
| Codex | 桌面版 `/Applications/Codex.app/` | AI 引擎 |
| launchd | `com.wechatagent` | 进程守护 |
| tsx | node_modules | TypeScript 即时编译 |
| ffmpeg-static / ffprobe-static | node_modules | 微信语音/视频处理 |
| 输出目录 | `~/Desktop/Githup/微信端运营/生成的文件/` | 所有生成文件统一存放 |

---

## 启动/停止/状态

```bash
# launchd 管理（开机自启+崩溃重启+休眠恢复）
launchctl kickstart gui/502/com.wechatagent    # 启动
launchctl bootout gui/502/com.wechatagent      # 停止
launchctl print gui/502/com.wechatagent        # 查看状态

# 日志
tail -f bridge_data/logs/bridge.log            # 桥接日志
tail -f bridge_data/logs/stdout.log            # launchd stdout
tail -f bridge_data/logs/stderr.log            # launchd stderr
```

**launchd plist：** `~/Library/LaunchAgents/com.wechatagent.plist`

---

## 微信端支持的命令

**自然语言触发（无需 `/` 前缀）：**
- `把那个文件发给我` / `把调研报告发给我` — 模糊文件搜索+发送
- `那个调研跑得怎么样了` / `进度` / `结果呢` — 查询当前任务状态
- `老板我在，请吩咐。` — 首次连接的欢迎语

**斜杠命令：**
| 命令 | 说明 |
|------|------|
| `/stop` / 停止/中断 | 中断当前处理 |
| `/status` / 状态 | 桥接运行状态 |
| `/health` / 健康 | 完整链路诊断 |
| `/pause` / 暂停 | 暂停消息处理 |
| `/resume` / 继续 | 恢复消息处理 |
| `/tasks` / 任务 | 查看当前任务 |
| `/search <关键词>` / 搜索 | 联网搜索 |
| `/send` / 发文件 | 发送最新生成的文件 |
| `/send <文件名>` | 发送指定文件 |
| `/shutdown` / 关闭/退出 | 关闭桥接 |
| `/helps` / 帮助 | 显示全部命令 |
| `/new` / 新对话 | 开启新会话 |

**快捷指令模板（自动展开为完整 Prompt）：**
| 指令 | 功能 |
|------|------|
| `/调研 <主题>` | 搜索并生成调研报告 |
| `/research <topic>` | 同上（英文） |
| `/总结 <内容>` | 提取核心观点和结论 |
| `/summary <text>` | 同上（英文） |
| `/翻译 <内容>` | 翻译成中文 |
| `/translate <text>` | 同上（英文） |
| `/写 <主题>` | 写一篇文章 |
| `/write <topic>` | 同上（英文） |
| `/代码 <需求>` | 生成完整代码 |
| `/code <requirement>` | 同上（英文） |
| `/方案 <需求>` | 制定执行方案 |
| `/plan <requirement>` | 同上（英文） |

---

## 关键改动记录（按时间倒序）

| 提交 | 说明 |
|------|------|
| `1c9668b` | 欢迎语改为"老板我在，请吩咐。" |
| `4271fd2` | 项目改名 CodexBridge → WeChatAgent |
| `5cfe95e` | 新增自然语言任务查询+模糊文件搜索 |
| `2bd0de6` | 错误友好化+快捷指令+文件自动回传+多轮引导 |
| `1205f42` | launchd 取代 screen+看门狗，解决休眠断连 |
| `fc332c7` | 看门狗v2+断线重连优化+turn超时缩减+清理 |
| `74590cf` | 审批请求自动批准 |
| `e777a55` | 产品优化：shutdown/tasks命令+看门狗重启限制 |

---

## 核心优化点

### 1. 进程守护（launchd）
- 取代了之前的 `screen` + bash 看门狗
- `KeepAlive` 自动重启，`ThrottleInterval` 5s 防循环崩溃
- 休眠唤醒后自动恢复（内核级，不会被系统杀）

### 2. 断线自动重连
- 重连冷却从 60s 降到 10s
- 每次错误都触发重连（不是每隔 10 次）
- 连续 3 次重连失败 → 进程自退出 → launchd 干净重启

### 3. 错误消息友好化
- 超时 → "回复等待超时，已自动重试"
- 图片 → "微信暂不支持发送图片给模型分析"
- 网络问题 → "网络连接不稳定，已自动重连"
- JSON 反序列化 → 自动跳过并继续处理

### 4. 文件自动回传
- Codex 生成文件后 60s 内自动检测并推送到微信
- 支持模糊搜索：Desktop / Downloads / Documents / 输出目录

### 5. 多轮对话引导
- 新消息自动携带上下文标记，让 Codex 理解是补充/修改

---

## 微信端常用配置

| 配置 | 值 |
|------|-----|
| 默认模型 | gpt-5.4（三层保障：env → config → 硬编码回退） |
| 思考深度 | medium |
| 审批策略 | `never`（微信端自动批准所有请求） |
| 沙箱模式 | `danger-full-access` |
| Turn 超时 | 8 分钟（原 15 分钟） |

---

## 文件结构（关键文件）

```
CodexBridge/
├── src/
│   ├── cli.ts                        # 入口：weixin serve 命令
│   ├── runtime/
│   │   └── weixin_bridge_runtime.ts  # 核心桥接逻辑（2796行）
│   ├── providers/codex/
│   │   ├── plugin.ts                 # Codex 提供者插件（输入构建）
│   │   ├── app_client.ts            # Codex CLI 通信客户端
│   │   └── config.ts                # 提供者配置（含模型/参数）
│   ├── platforms/weixin/
│   │   ├── plugin.ts                # 微信平台插件
│   │   └── poller.ts                # 微信消息轮询器
│   └── core/
│       ├── bridge_coordinator.ts    # 协调整合（21479行）
│       └── bridge_session_service.ts
├── bridge_data/
│   ├── logs/                        # 运行日志
│   └── runtime/                     # 运行时状态
├── docs/
│   ├── launchd-setup.md
│   └── weixin-commands.md
├── wechat-agent.sh                  # launchd 包装脚本
├── 启动说明.txt
└── 换电脑恢复流程.txt
```

---

## 待办 / 已知限制

- [ ] GitHub 仓库名还未从 `CodexBridge` 改为 `WeChatAgent`（需手动在网页改名）
- [ ] Railway 部署方案已规划但未实施（见下方"远期规划"）
- [ ] 任务队列（多任务并发排队）未实现
- [ ] 发送图片给模型分析不支持（gpt-5.4 不支持 image_url）

---

## 远期规划（方案已定，待落地）

```
Railway（服务器）←→ WebSocket ←→ 你的 Mac（Codex 引擎）

1. Railway 上部署桥接转发层（Node.js）
2. Mac 端现有环境不变，加 WebSocket 客户端
3. iLink Bot token 放 Railway 环境变量
4. 实现后你不需背电脑，服务器 24h 在线收消息
```

---

## 注意事项

1. **不要删除 `packages/` 目录** — `mission-control` / `codex-native-api` / `codex-provider-relay` 被源码引用
2. **不要删除 `node_modules` 中的 `ffmpeg-static` 和 `ffprobe-static`** — 微信语音处理依赖
3. **修改代码后重启**：`launchctl kickstart gui/502/com.wechatagent`
4. **端口 43182** 是桥接的 Codex 原生 API 端口，不要占用
5. **本地 git 用户**：`zhuanz` / `zhuanz@users.noreply.github.com`
6. **SSH key**：`~/.ssh/id_rsa_localhost`（对应 GitHub 账号 `chengshuaimao9-design`）

---

> 最后更新：2026-07-02
> 生成于 Codex 桌面端
