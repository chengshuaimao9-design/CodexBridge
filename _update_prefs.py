#!/usr/bin/env python3
"""Update CodexBridge section's User preferences, Reusable knowledge, and Failures"""

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'r') as f:
    content = f.read()

# Replace User preferences
old_prefs = """## User preferences

- when the user got a turn is already in progress response, they expected automatic interruption: auto-interrupt old turn. [Task 7]
- when asked about model, user expected bridge model to match desktop Codex. Changed to gpt-5.4. [Task 3]
- when the bridge kept disconnecting: stability is the top priority, speed second. [Task 4][Task 6]
- when optimizations needed: systematic architecture analysis, not piecemeal patching. [Task 4]
- when data was scattered: all WeChat data goes under a single project directory. [Task 5]
- when building watchdog: bridge should auto-recover without user intervention. [Task 6]"""

new_prefs = """## User preferences

- when the user got a turn is already in progress response, they expected automatic interruption: auto-interrupt old turn. [Task 7]
- when asked about model, user expected bridge model to match desktop Codex. Changed to gpt-5.4. [Task 3]
- when the bridge kept disconnecting: stability is the top priority, speed second. [Task 4][Task 6][Task 12]
- when optimizations needed: systematic architecture analysis, not piecemeal patching. [Task 4]
- when data was scattered: all WeChat data goes under a single project directory. [Task 5]
- when building watchdog: bridge should auto-recover without user intervention. [Task 6]
- the user strongly expected WeChat experience to match desktop: "应该是微信端的和电脑桌面端的直接操作一模一样". They reacted strongly against sandbox limitations ("网络被沙箱封死了"). Fix requires hard permissions override (codexCliArgs + sessionSettings), not just instructions. [Task 9]
- when the user complained about speed, they insisted on pushing parameters to the limit. Do not prematurely declare optimal. Test aggressively and iterate. [Task 10]
- when the bridge process kept dying, user said "怎么搞得又断线了那么长时间？" and "我这个电脑不会经常关机". Focus on process isolation from terminal, not boot-time auto-start. [Task 12]
- the user explicitly said "不要舍近求远舍本逐末" -- prefers straightforward process isolation (screen) over complex launchd setups. [Task 12]
- when the agent suggested migrating the project directory, the user strongly objected. Do not suggest moving the project root. [Task 12]
- the user expects GitHub repos to look professional: "像一些大佬一样非常明确详细的那种归档". Rewrite READMEs, remove unrelated CI files, keep clean. [Task 13]
- when asked about skills, user said compare installed skills and use the best one. Do not try to install new dependencies. [Task 14]"""

content = content.replace(old_prefs, new_prefs)

# Replace Reusable knowledge
old_knowledge = """## Reusable knowledge

- CodexBridge root: /Users/zhuanz/Desktop/Githup/codex运行项目/CodexBridge/. Scripts: pnpm weixin:login, weixin:serve, weixin:clear-context. [Task 1]
- Node.js >=24 required. Install via nvm. [Task 1]
- WeChat iLink login: getBotQr -> scan -> confirm -> polling confirmed. Base URL: ilinkai.weixin.qq.com. [Task 2]
- Clash DNS hijack returns 198.18.x.x. Fix: DoH + TLS servername. [Task 2]
- Bridge: npx tsx src/cli.ts weixin serve --state-dir. Default API: localhost:43182. [Task 3]
- Network optimization: DoH + 5-min DNS cache + KeepAlive. [Task 4]
- Delete-safe: packages/codex-gateway, src/platforms/telegram, scripts/service, ops, *.cmd. [Task 4]
- Default model: .env CODEX_NATIVE_API_DEFAULT_MODEL -> profile -> code constant. [Task 3]
- Watchdog: while-true loop, nohup + disown. launchd blocked by TCC. [Task 6]
- Auto-interrupt: tryInterruptCurrentTurn + scopeChains.delete. [Task 7]"""

new_knowledge = """## Reusable knowledge

- CodexBridge root: /Users/zhuanz/Desktop/Githup/codex运行项目/CodexBridge/. Scripts: pnpm weixin:login, weixin:serve, weixin:clear-context. [Task 1]
- Node.js >=24 required. Install via nvm (nvm install 24). [Task 1]
- WeChat iLink login: getBotQr -> scan -> confirm on Open Cloud page -> polling confirmed. Base URL: ilinkai.weixin.qq.com. [Task 2]
- Clash DNS hijack returns 198.18.x.x. Fix: DoH via dns.google + direct connection bypassing proxy. [Task 2]
- DoH resolution: curl -sL "https://dns.google/resolve?name=ilinkai.weixin.qq.com&type=A" gives real IP (43.163.179.90). Add 5-min DNS TTL cache. [Task 2]
- Key files for network fix: src/platforms/weixin/official/proxy_tunnel.ts (createProxyTunnel, upgradeToTls), src/platforms/weixin/official/api.ts (DoH + direct connect). [Task 2]
- Bridge: npx tsx src/cli.ts weixin serve --state-dir. Default API: localhost:43182. [Task 3]
- Network optimization: DoH + 5-min DNS cache + KeepAlive. [Task 4]
- Delete-safe: packages/codex-gateway, src/platforms/telegram, scripts/service, ops, *.cmd. [Task 4]
- Default model: .env CODEX_NATIVE_API_DEFAULT_MODEL -> profile -> code constant. [Task 3]
- Sandbox bypass: modify src/providers/codex/config.ts (add codexCliArgs: ['--dangerously-bypass-approvals-and-sandbox']) AND src/providers/codex/plugin.ts (set permissionsMode: 'full-access', approvalPolicy: 'never', sandboxMode: 'danger-full-access' as defaults). Both changes needed; instructions alone insufficient. [Task 9]
- Speed tuning: previewSoftTargetBytes=300, previewIntervalMs=500, paragraphInterval=500ms, sendTimeout=15000ms, DEFAULT_LONG_POLL_TIMEOUT_MS=5000, messageSendInterval=200ms. Files: src/runtime/weixin_bridge_runtime.ts, src/platforms/weixin/plugin.ts, src/platforms/weixin/official/api.ts. [Task 10]
- File output directory: set CODEXBRIDGE_DEFAULT_CWD to ~/Desktop/Githup/weixin-end/generated-files/ in bridge-runner.sh and launchd plist. [Task 11]
- Process isolation: screen -dmS codexbridge bash -c 'while true; do npx tsx src/cli.ts weixin serve; sleep 2; done'. screen -ls to check, screen -S codexbridge -X quit to stop. [Task 12]
- Watchdog script bridge-runner.sh: while-true loop. Do not use exec in the loop (it prevents restart). [Task 12]
- launchd blocked on Desktop paths by TCC on macOS. Do not attempt for Desktop-based projects. [Task 12]
- GitHub cleanup: remove .github/workflows/ (ci.yml, live-agent-tests.yml) for unrelated projects. Rewrite README with actual project description. [Task 13]
- bridge-runner.sh generic version at $CODEXBRIDGE_ROOT/bridge-runner.sh. [Task 13]
- Skill optimization: add ABSOLUTE RULE instructions at top of CODEXBRIDGE_NON_INTERACTIVE_INSTRUCTIONS array. Set approvalPolicy: 'never' as hard default. [Task 14]
- Auto-interrupt: tryInterruptCurrentTurn + scopeChains.delete. [Task 7]
- Watchdog: while-true loop, nohup + disown. screen -dmS more reliable. launchd blocked by TCC. [Task 6][Task 12]"""

content = content.replace(old_knowledge, new_knowledge)

# Replace Failures
old_failures = """## Failures and how to do differently

- Direct HTTPS fails with 198.18.x.x DNS. Use DoH. [Task 2]
- Proxy tunnel fails with fake IP; use DoH, connect directly. [Task 2]
- Deleting telegram/ causes import errors; update references. [Task 4]
- Chinese paths in bash cause Node.js failures. Use English paths/symlinks. [Task 5]
- launchd blocked by TCC on Desktop paths. Use nohup/disown. [Task 6]
- git push fails if SSH key not authorized. Check before push. [Task 8]"""

new_failures = """## Failures and how to do differently

- Direct HTTPS fails with 198.18.x.x DNS. Use DoH. [Task 2]
- Proxy tunnel fails with fake IP; use DoH, connect directly. [Task 2]
- First proxy_tunnel body parsing did not handle Content-Length; listen for end event correctly. [Task 2]
- Python scripts modifying TS files often cause syntax errors. Use git checkout to recover and rewrite carefully, or use node scripts. [Task 2][Task 9][Task 10]
- Deleting telegram/ causes import errors; update references. [Task 4]
- Chinese paths in bash cause Node.js failures. Use English paths/symlinks. [Task 5]
- launchd blocked by TCC on Desktop paths. Use screen or nohup instead. [Task 6][Task 12]
- git push fails if SSH key not authorized. Check before push. [Task 8]
- Instructions alone insufficient to prevent approval prompts. Must also set hard permissions in plugin.ts. [Task 9]
- Do not prematurely declare speed optimal. Push parameters aggressively before declaring limit. [Task 10]
- Do not suggest migrating project root directory. User strongly dislikes project location changes. [Task 12]
- nohup and disown in zsh may not fully detach processes. Use screen reliably instead. [Task 12]
- exec in while-true loops prevents restart. Call command directly, not via exec. [Task 12]
- Before installing new dependencies, check existing installed skills first. [Task 14]"""

content = content.replace(old_failures, new_failures)

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'w') as f:
    f.write(content)

print("Updated preferences, knowledge, and failures sections")
