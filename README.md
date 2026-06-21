<h1 align="center">WeChatAgent</h1>
<p align="center"><strong>微信 × Codex — 轻前端、重引擎的 AI 助手桥接层</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS_ARM64-brightgreen" />
  <img src="https://img.shields.io/badge/node-%3E%3D24-blue" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## 概述

WeChatAgent 是一个将 **桌面 Codex 引擎** 接入 **微信** 的桥接层。  
微信端只负责收发消息，所有计算都在桌面 Codex 上完成。

## 核心架构

```
微信 App → iLink Bot → WeChatAgent → Codex CLI (桌面)
              ↑                          ↓
         消息收发                  模型推理 / 技能 / 插件
              ↑                          ↓
          你收到回复 ← 桥接转发 ← Codex 生成结果
```

## 功能特性

- **全权限访问** — 跳过审批和沙箱，桌面能做什么微信就能做什么
- **自动断线恢复** — 轮询失败自动重试，指数退避 + 熔断
- **一键安装** — `bash setup.sh` 自动处理环境
- **开机自启** — 配置后 launchd 守护进程
- **中文命令** — 停止 / 状态 / 健康 / 暂停 / 新对话 等
- **速度优化** — 首段预览 300 字节触发，每 500ms 推送一个段落
- **文件统一输出** — 所有生成文件集中到 `微信端运营/生成的文件/`

## 快速开始

```bash
git clone git@github.com:chengshuaimao9-design/WeChatAgent.git
cd WeChatAgent
bash setup.sh        # 自动安装 Node.js + 依赖 + 扫码
bash bridge-runner.sh &  # 启动桥接
```

## 微信命令

| 命令 | 说明 |
|------|------|
| 停止 / 中断 | 停止当前处理 |
| 状态 | 查看桥接在线/离线 |
| 健康 | 全链路诊断 |
| 暂停 / 继续 | 暂停/恢复消息处理 |
| 新对话 | 开启新会话 |
| 帮助 | 显示全部命令 |

## 项目结构

```
WeChatAgent/
├── src/                    # 桥接核心代码
│   ├── cli.ts              # 入口
│   ├── runtime/            # 运行时（消息调度、中断、预览推送）
│   ├── platforms/weixin/   # 微信平台适配
│   └── providers/codex/    # Codex 引擎适配
├── bridge_data/            # 运行时数据（凭证、日志）
├── setup.sh                # 一键安装脚本
├── bridge-runner.sh        # 启动脚本
└── 换电脑恢复流程.txt       # 灾难恢复指南
```

## 依赖

- macOS（Apple Silicon）
- [Codex 桌面版](https://codex.ai)
- Node.js ≥ 24（setup.sh 自动安装）

## 仓库

https://github.com/chengshuaimao9-design/WeChatAgent
