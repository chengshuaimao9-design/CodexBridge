#!/usr/bin/env python3
"""Add Tasks 3 and 4 to Codex diagnostics section"""

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'r') as f:
    content = f.read()

new_tasks = """
## Task 3: Fix missing openai-curated marketplace in config.toml

task: Codex desktop app only shows bundled plugins because config.toml was missing the openai-curated marketplace entry. After adding it, desktop UI still shows "more plugins coming soon" -- the desktop may use its own bundled marketplace instead of config.toml.
task_outcome: partial

### rollout_summary_files

- 2026-06-07T16-49-55-mXo0-fix_codex_missing_curated_marketplace_plugins.md (cwd=/Users/zhuanz/Desktop/Githup/codex运行项目, rollout_path=/Users/zhuanz/.codex/sessions/2026/06/08/rollout-2026-06-08T00-49-55-019ea2fd-affc-7a50-babf-fc3c352ba0cc.jsonl, updated_at=2026-06-12T15:21:35+00:00, thread_id=019ea2fd-affc-7a50-babf-fc3c352ba0cc)

### keywords

- config.toml, marketplaces, openai-curated, openai-bundled, openai-primary-runtime, codex plugin marketplace list, codex plugin list, codex plugin add, app-server, kill

## Task 4: Deep debug desktop plugin UI showing only bundled plugins

task: After marketplace config fix, desktop UI still shows only 7 bundled plugins and "more plugins coming soon". Discovered app bundle has its own marketplace (5 plugins) at /Applications/Codex.app/Contents/Resources/plugins/openai-bundled/. App.asar contains plugin-loading code but desktop may not query app-server for plugin lists.
task_outcome: uncertain

### rollout_summary_files

- 2026-06-07T16-49-55-mXo0-fix_codex_missing_curated_marketplace_plugins.md (same as Task 3)

### keywords

- desktop-ui, app-bundle, bundled-marketplace, marketplace.json, app.asar, list-plugins, marketplace-kind, curated-marketplace, more-plugins-coming-soon
"""

# Insert after Task 2's keyword section, before User preferences
marker = "### keywords\n\n- codex plugin add, plugin marketplace, sandbox_mode, read-only, openai-curated, 173-plugins, codex plugin list, CLI-install, ~/.codex/.tmp/plugins\n\n## User preferences"
idx = content.find(marker)
if idx >= 0:
    idx = idx + len(marker) - len("\n## User preferences")
    new_content = content[:idx] + new_tasks + content[idx:]
    with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'w') as f:
        f.write(new_content)
    print("Added Tasks 3-4 to Codex diagnostics section")
else:
    print("Could not find insertion point for Tasks 3-4")
