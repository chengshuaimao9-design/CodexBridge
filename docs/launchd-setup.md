# CodexBridge launchd 服务

桥接已注册为 macOS launchd 服务，不再依赖 `screen` + 看门狗脚本。

## 启动/停止

```bash
# 启动（已配置开机自启，一般不需要手动操作）
launchctl kickstart gui/502/com.codexbridge

# 停止
launchctl bootout gui/502/com.codexbridge

# 查看状态
launchctl print gui/502/com.codexbridge
```

## 配置文件

`~/Library/LaunchAgents/com.codexbridge.plist`

## 特性

- **开机自启**：登录后自动加载
- **崩溃重启**：launchd KeepAlive 自动拉起（5秒节流）
- **休眠恢复**：Mac 唤醒后自动重启进程
- **日志**：`bridge_data/logs/stdout.log` / `stderr.log`
