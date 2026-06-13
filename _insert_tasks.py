#!/usr/bin/env python3
import sys
new_tasks = """

## Task 9: Sandbox permissions override for WeChat bridge

task: Remove all sandbox and approval restrictions so WeChat-side experience matches desktop Codex exactly. Required codexCliArgs with --dangerously-bypass-approvals-and-sandbox and hard permissions override in plugin.ts.
task_outcome: success

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (cwd=/Users/zhuanz/Desktop/Githup/codex运行项目, rollout_path=/Users/zhuanz/.codex/sessions/2026/06/12/rollout-2026-06-12T02-57-25-019eb80b-dcf4-7781-987e-df9b86794a69.jsonl, updated_at=2026-06-12T15:42:14+00:00, thread_id=019eb80b-dcf4-7781-987e-df9b86794a69)

### keywords

- codexCliArgs, dangerously-bypass-approvals-and-sandbox, full-access, approvalPolicy, sandboxMode, danger-full-access, permissions, bridge-plugin

## Task 10: Response speed optimization

task: Reduce WeChat bridge response latency. Cleaned debug logs, tuned polling interval (20s->5s), preview thresholds (800->300 bytes), paragraph interval (1500->500ms), message send interval (500->200ms), send timeout (30s->15s).
task_outcome: success

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (same as Task 9)

### keywords

- speed, latency, long-polling, preview-interval, previewSoftTargetBytes, previewIntervalMs, paragraph-interval, send-timeout, optimization

## Task 11: File output directory unification

task: Route all WeChat-generated files (messages, images, documents) to a single desktop directory at user's request.
task_outcome: success

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (same as Task 9)

### keywords

- file-output, weixin-output-dir, CODEXBRIDGE_DEFAULT_CWD, weixin-end, generated-files, desktop-directory

## Task 12: Bridge process stability with screen

task: Ensure bridge process runs detached from terminal session. nohup/disown failed in zsh; launchd blocked by TCC on Desktop paths. Final solution: screen -dmS with while-true auto-restart loop.
task_outcome: partial (screen works, launchd not feasible on Desktop path)

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (same as Task 9)

### keywords

- screen, screen-dmS, detach, terminal, watchdog, bridge-runner.sh, launchd, tcc, desktop-path

## Task 13: GitHub repository cleanup and README rewrite

task: Remove unrelated CI files, rewrite README with architecture diagram, command reference, features, and quick-start. Push to remote.
task_outcome: success

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (same as Task 9)

### keywords

- github, ci-cleanup, workflows, readme, architecture-diagram, command-table, remote-push, professional-presentation

## Task 14: Skill/plugin usage optimization for bridge

task: Ensure Codex bridge uses already-installed skills (PPT-master, pdf, imagegen) and avoids installing new dependencies. Added absolute rules in instructions + hard permissions to block approval prompts.
task_outcome: success

### rollout_summary_files

- 2026-06-11T18-57-25-GlAJ-wechat_codex_bridge_setup_optimization_proxy_permissions_spe.md (same as Task 9)

### keywords

- skills, ppt-master, approval-policy, never, absolute-rule, developer-instructions, no-new-dependencies

"""

with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'r') as f:
    content = f.read()

marker = "\n## User preferences\n"
idx = content.find(marker)
if idx >= 0:
    new_content = content[:idx] + new_tasks + content[idx:]
    with open('/Users/zhuanz/.codex/memories/MEMORY.md', 'w') as f:
        f.write(new_content)
    print("Inserted tasks 9-14 before User preferences")
else:
    print("Could not find insertion point")
