#!/usr/bin/env python3
"""Update memory_summary.md with new preferences and recent memory window"""

with open('/Users/zhuanz/.codex/memories/memory_summary.md', 'r') as f:
    content = f.read()

# Clean up "[Task from new rollout]" tags in user preferences
content = content.replace('[Task from new rollout 2026-06-07]', '')

# Add new user preferences before "# General Tips"
old_general = "## General Tips"
new_prefs = """- When the user strongly demands parity between WeChat-side and desktop: "应该是微信端的和电脑桌面端的直接操作一模一样", bypass all sandbox/approval restrictions at the config level (codexCliArgs + sessionSettings), not just instructions.
- When the bridge process dies, user says "怎么搞得又断线了那么长时间？". Use screen -dmS for process isolation, not nohup/disown (which fail in zsh). Do not suggest migrating project directories.
- When told "不要舍近求远舍本逐末", stop pushing complex solutions (launchd) and use simple ones (screen).
- When the user asks why GitHub shows a red X, clean the repo: remove unrelated CI files and rewrite README.
- When investigating desktop app issues the user says "我从底层去分析一下这个问题" -- do bottom-up investigation, not surface guesses.
- When user asks about skills (e.g., "PPT-master 和 Presentations 哪个更好"), compare existing installed skills and use the best one. Do not attempt to install new tools.
- When user reports a fix didn't work after multiple restarts ("插件还是没有显示，只有显示七个"), dig deeper instead of repeating restart instructions.
- The user corrected "我说的是codex" when the agent focused on file system paths instead of the desktop app. Keep investigation centered on user-facing symptom.

## General Tips"""

content = content.replace(old_general, new_prefs)

# Add Platform knowledge to General Tips
old_end = "## What's in Memory"
new_tips_end = """- CodexBridge sandbox bypass: two changes needed. 1) src/providers/codex/config.ts: add codexCliArgs: ['--dangerously-bypass-approvals-and-sandbox']. 2) src/providers/codex/plugin.ts: default sessionSettings to { permissionsMode: 'full-access', approvalPolicy: 'never', sandboxMode: 'danger-full-access' }.
- Bridge speed tuning: previewSoftTargetBytes=300, previewIntervalMs=500, paragraphInterval=500ms, sendTimeout=15000ms, DEFAULT_LONG_POLL_TIMEOUT_MS=5000, messageSendInterval=200ms.
- Bridge process isolation: screen -dmS codexbridge bash -c 'while true; do npx tsx src/cli.ts weixin serve; sleep 2; done'. Use screen -ls and screen -S codexbridge -X quit for management.
- Codex marketplace configuration: ~/.codex/config.toml [marketplaces.*] sections. Three sources: openai-bundled (4 plugins), openai-primary-runtime (3), openai-curated (173). App-server restart may be needed after config changes.
- Desktop Codex may have its own bundled marketplace at /Applications/Codex.app/Contents/Resources/plugins/openai-bundled/ ignoring config.toml. If CLI shows plugins but desktop doesn't, this is the likely cause.
- Codex version (current): 26.609.30741 (build 3808), CLI codex-cli 0.140.0-alpha.2.
- Bridge file output directory: set CODEXBRIDGE_DEFAULT_CWD to ~/Desktop/Githup/weixin-end/generated-files/.

## What's in Memory"""

content = content.replace(old_end, new_tips_end)

# Update the 2026-06-12 recent window entry to include marketplace fix learnings
old_0612 = """### /Users/zhuanz/Desktop/Githup/codex运行项目


#### 2026-06-12

- Codex diagnostics - slow startup and plugin marketplace: logs_2.sqlite, vacuum, wal-checkpoint, codex plugin add, sandbox_mode, openai-curated, CLI-install
  - desc: Diagnosed Codex slow startup (logs_2.sqlite cleaning with VACUUM+WAL checkpoint) and plugin marketplace UI limitation (CLI install via codex plugin add PLUGIN@MARKETPLACE, sandbox_mode=read-only may restrict UI).
  - learnings: Clean logs: DELETE + VACUUM + PRAGMA wal_checkpoint(TRUNCATE). Keep 7 days. CLI install bypasses UI limitations. sandbox_mode=read-only may limit marketplace browsing."""

new_0612 = """### /Users/zhuanz/Desktop/Githup/codex运行项目


#### 2026-06-12

- Codex diagnostics - plugin marketplace investigation: config.toml, marketplaces, openai-curated, codex plugin add, app-server, bundled-marketplace, app.asar
  - desc: Fixed missing openai-curated marketplace in config.toml (all 173 plugins now visible via CLI). Deep debug of desktop UI still only showing bundled plugins -- app may use its own marketplace at /Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.
  - learnings: Marketplace config: last_updated + source_type:local + source:path. App-server restart may be needed (kill PID). Desktop may not read config.toml marketplaces. Check app.asar for plugin-loading JS. Three marketplaces: openai-bundled (4), openai-primary-runtime (3), openai-curated (173).
- Codex diagnostics - slow startup: logs_2.sqlite, vacuum, wal-checkpoint, codex plugin add, sandbox_mode, CLI-install
  - desc: Diagnosed Codex slow startup (logs_2.sqlite cleaning with VACUUM+WAL checkpoint) and plugin marketplace CLI install workflow.
  - learnings: Clean logs: DELETE + VACUUM + PRAGMA wal_checkpoint(TRUNCATE). Keep 7 days. CLI install bypasses UI limitations.
- CodexBridge WeChat bridge setup (second rollout): codexbridge, sandbox-bypass, dangerously-bypass-approvals, screen, speed-tuning, file-output, github-cleanup, skill-optimization
  - desc: Second CodexBridge rollout adding sandbox/approval bypass for full desktop parity, speed optimization (poll interval 20s->5s, preview 800->300 bytes), file output directory unification, screen-based process stability, GitHub repo cleanup, and skill usage optimization.
  - learnings: Sandbox bypass requires BOTH codexCliArgs AND sessionSettings override. screen -dmS more reliable than nohup/disown in zsh. User strongly objects to project migration. Speed tuning pushed parameters to limit (3-5s of 5-8s total is Codex model time, not bridge)."""

content = content.replace(old_0612, new_0612)

with open('/Users/zhuanz/.codex/memories/memory_summary.md', 'w') as f:
    f.write(content)

print("Updated memory_summary.md")
