#!/usr/bin/env python3
"""Update Codex diagnostics User preferences, Reusable knowledge, and Failures"""

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'r') as f:
    content = f.read()

# Update User preferences
old = """## User preferences

- when the user asked "是不是我告诉你插件名称你就争取下载安装？" -> the user wants the agent to install plugins directly via CLI. Preferred workflow: user names a plugin, agent installs it using codex plugin add PLUGIN@MARKETPLACE. [Task 2]
- when the user asked "我说我告诉你其他的插件，然后你是不是可以自行下载安装？" -> the user expects the agent to be able to install any plugin from the marketplace without user manual steps. [Task 2]
- when cleaning logs, the user said "只清理七天以前的" -> keep recent logs, do not full delete. [Task 1]
- the user asked "清理这个日志数据库不会有什么不好的影响吧" -> wants clear reassurance about what data is being removed and that it is safe. [Task 1]"""

new = """## User preferences

- when the user asked "是不是我告诉你插件名称你就争取下载安装？" -> the user wants the agent to install plugins directly via CLI. Preferred workflow: user names a plugin, agent installs it using codex plugin add PLUGIN@MARKETPLACE. [Task 2]
- when the user asked "我说我告诉你其他的插件，然后你是不是可以自行下载安装？" -> the user expects the agent to be able to install any plugin from the marketplace without user manual steps. [Task 2]
- when cleaning logs, the user said "只清理七天以前的" -> keep recent logs, do not full delete. [Task 1]
- the user asked "清理这个日志数据库不会有什么不好的影响吧" -> wants clear reassurance about what data is being removed and that it is safe. [Task 1]
- user said "我从底层去分析一下这个问题，这到底在哪？" -> the user wants bottom-up, deep analysis of desktop app behavior, not guesswork. [Task 3]
- user repeated "插件还是没有显示，只有显示七个" and "而且显示更多插件即将退出，但这不正常" after multiple restarts -> the user expects the fix to actually work; when it doesn't, dig deeper instead of repeating restart instructions. [Task 3][Task 4]
- user corrected the agent's initial focus on plugin cache structure by saying "我说的是codex" -> the user wants analysis centered on the desktop app's plugin display mechanism, not the file system. [Task 3]"""

content = content.replace(old, new)

# Update Reusable knowledge
old2 = """## Reusable knowledge

- Codex logs stored in ~/.codex/logs_2.sqlite (SQLite). Schema: logs table with columns (id, ts, ts_nanos, level, target, feedback_log_body, module_path, file, line, thread_id, process_uuid, estimated_bytes). Indexes on ts, thread_id, process_uuid. [Task 1]
- TRACE level logs are internal telemetry (app server, thread spawn, shell snapshot), not user conversation data. [Task 1]
- Clean procedure: DELETE FROM logs WHERE ts < cutoff_timestamp; then VACUUM; then PRAGMA wal_checkpoint(TRUNCATE); [Task 1]
- After cleaning 26k rows (7+ days old), main file reduced 937->817 MB. WAL was 823 MB before checkpoint, 0 after. [Task 1]
- Directory size: ~/.codex/ is 1.4 GB total. logs_2.sqlite was the largest file. [Task 1]
- Plugin marketplaces: openai-curated (173 plugins, git snapshot at ~/.codex/.tmp/plugins, commit c6ea566), openai-bundled (4), openai-primary-runtime (3). All are local snapshots. [Task 2]
- CLI install: codex plugin add PLUGIN@MARKETPLACE (e.g., codex plugin add slack@openai-curated). CLI list: codex plugin list. [Task 2]
- CLI codex plugin marketplace upgrade only works for Git-configured marketplaces, not local snapshots. [Task 2]
- Desktop UI limitation may be due to sandbox_mode = read-only or model_provider = custom. Only 14 plugins in cache (UI may show only cached ones). [Task 2]
- Codex config: sandbox_mode = read-only, model_provider = custom, base_url = http://localhost:3000/v1. [Task 1][Task 2]"""

new2 = """## Reusable knowledge

- Codex logs stored in ~/.codex/logs_2.sqlite (SQLite). Schema: logs table with columns (id, ts, ts_nanos, level, target, feedback_log_body, module_path, file, line, thread_id, process_uuid, estimated_bytes). Indexes on ts, thread_id, process_uuid. [Task 1]
- TRACE level logs are internal telemetry (app server, thread spawn, shell snapshot), not user conversation data. [Task 1]
- Clean procedure: DELETE FROM logs WHERE ts < cutoff_timestamp; then VACUUM; then PRAGMA wal_checkpoint(TRUNCATE); [Task 1]
- After cleaning 26k rows (7+ days old), main file reduced 937->817 MB. WAL was 823 MB before checkpoint, 0 after. [Task 1]
- Directory size: ~/.codex/ is 1.4 GB total. logs_2.sqlite was the largest file. [Task 1]
- Plugin marketplaces: openai-curated (173 plugins, git snapshot at ~/.codex/.tmp/plugins, commit c6ea566), openai-bundled (4), openai-primary-runtime (3). All are local snapshots. [Task 2]
- CLI install: codex plugin add PLUGIN@MARKETPLACE (e.g., codex plugin add slack@openai-curated). CLI list: codex plugin list. [Task 2]
- CLI codex plugin marketplace upgrade only works for Git-configured marketplaces, not local snapshots. [Task 2]
- Desktop UI limitation may be due to sandbox_mode = read-only or model_provider = custom. Only 14 plugins in cache (UI may show only cached ones). [Task 2]
- Codex config: sandbox_mode = read-only, model_provider = custom, base_url = http://localhost:3000/v1. [Task 1][Task 2]
- Marketplace configuration in ~/.codex/config.toml: each marketplace needs last_updated (ISO datetime), source_type = "local", source = "<path>". [Task 3]
- The three marketplaces: openai-bundled (~/.codex/.tmp/bundled-marketplaces/openai-bundled, 4 plugins), openai-primary-runtime (~/.cache/codex-runtimes/.../openai-primary-runtime, 3 plugins), openai-curated (~/.codex/.tmp/plugins, 173 plugins). [Task 3]
- CLI commands: codex plugin marketplace list, codex plugin list, codex plugin add <plugin>@<marketplace>. [Task 3]
- The desktop app has its own bundled marketplace at /Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json containing 5 plugins (sites, browser, chrome, computer-use, latex). The desktop UI may prefer this bundle over config.toml marketplaces. [Task 4]
- App-server may need restart after config changes: check PID start time, then kill <pid> (the app restarts it). [Task 3]
- App.asar contains plugin-loading JS referencing "marketplace-kind", "list-plugins", and "curated-marketplace". Future investigation should examine app.asar to understand desktop plugin list source. [Task 4]
- Codex version: 26.609.30741 (build 3808), CLI codex-cli 0.140.0-alpha.2. [Task 3]"""

content = content.replace(old2, new2)

# Update Failures
old3 = """## Failures and how to do differently

- VACUUM alone insufficient if WAL is large. Always checkpoint the WAL (PRAGMA wal_checkpoint(TRUNCATE)) after VACUUM. [Task 1]
- The UI plugin limitation was not definitively resolved; more investigation needed (e.g., toggle sandbox_mode, check UI logs, or update Codex). [Task 2]"""

new3 = """## Failures and how to do differently

- VACUUM alone insufficient if WAL is large. Always checkpoint the WAL (PRAGMA wal_checkpoint(TRUNCATE)) after VACUUM. [Task 1]
- The UI plugin limitation was not definitively resolved; more investigation needed (e.g., toggle sandbox_mode, check UI logs, or update Codex). [Task 2]
- When editing config.toml, always check the app-server start time. If app-server started before the edit, kill it to force reload. [Task 3]
- If the desktop UI still shows "more plugins coming soon" after adding the marketplace, suspect the desktop app's plugin UI does not use config.toml marketplaces. Further investigation should examine app.asar for plugin loading JS or check if the desktop only reads the bundled marketplace from the app bundle. [Task 4]
- Plugin install via CLI works and adds to config.toml, but may not automatically appear in the desktop UI if the desktop doesn't sync with config.toml. [Task 3][Task 4]"""

content = content.replace(old3, new3)

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'w') as f:
    f.write(content)

print("Updated Codex diagnostics preferences, knowledge, and failures")
