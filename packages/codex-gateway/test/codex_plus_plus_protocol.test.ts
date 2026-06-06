import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatCompletionsResponseToResponses,
  responsesRequestToChatCompletions,
  translateChatCompletionsSseToResponsesEvents,
} from '../src/index.js';

test('codex++ port: request maps custom and namespace tools to Chat functions', () => {
  const chat = responsesRequestToChatCompletions({
    model: 'gpt-5-mini',
    input: 'open the file',
    tools: [{
      type: 'custom',
      name: 'exec',
      description: 'Run a command.',
    }, {
      type: 'namespace',
      name: 'mcp__vscode_mcp__',
      description: 'VS Code MCP tools.',
      tools: [{
        type: 'function',
        name: 'open_file',
        description: 'Open a file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      }],
    }],
    tool_choice: {
      type: 'function',
      namespace: 'mcp__vscode_mcp__',
      name: 'open_file',
    },
    parallel_tool_calls: true,
  });

  const names = chat.tools.map((tool: any) => tool.function.name);
  assert.deepEqual(names, ['exec', 'mcp__vscode_mcp__open_file']);
  assert.equal(chat.tools[0].function.parameters.properties.input.type, 'string');
  assert.equal(chat.tools[1].function.description.includes('VS Code MCP tools.'), true);
  assert.equal(chat.tool_choice.function.name, 'mcp__vscode_mcp__open_file');
  assert.equal(chat.parallel_tool_calls, true);
});

test('codex++ port: request expands apply_patch custom tool into structured proxy tools', () => {
  const chat = responsesRequestToChatCompletions({
    model: 'gpt-5-mini',
    input: 'patch files',
    stream: true,
    tools: [{
      type: 'custom',
      name: 'apply_patch',
      description: 'Patch files.',
    }],
    tool_choice: {
      type: 'custom',
      name: 'apply_patch',
    },
  });

  const names = chat.tools.map((tool: any) => tool.function.name);
  assert.deepEqual(names, [
    'apply_patch_add_file',
    'apply_patch_delete_file',
    'apply_patch_update_file',
    'apply_patch_replace_file',
    'apply_patch_batch',
  ]);
  assert.equal(chat.tool_choice.function.name, 'apply_patch_batch');
  assert.equal(chat.stream_options.include_usage, true);
});

test('codex++ port: request replays custom apply_patch history as proxy tool call', () => {
  const chat = responsesRequestToChatCompletions({
    model: 'gpt-5-mini',
    input: [{
      type: 'custom_tool_call',
      call_id: 'call_patch',
      name: 'apply_patch',
      input: [
        '*** Begin Patch',
        '*** Add File: hello.txt',
        '+hello',
        '*** End Patch',
      ].join('\n'),
    }, {
      type: 'custom_tool_call_output',
      call_id: 'call_patch',
      output: 'Done',
    }],
    tools: [{
      type: 'custom',
      name: 'apply_patch',
    }],
  });

  assert.equal(chat.messages[0].role, 'assistant');
  assert.equal(chat.messages[0].tool_calls[0].id, 'call_patch');
  assert.equal(chat.messages[0].tool_calls[0].function.name, 'apply_patch_add_file');
  assert.deepEqual(JSON.parse(chat.messages[0].tool_calls[0].function.arguments), {
    path: 'hello.txt',
    content: 'hello',
  });
  assert.equal(chat.messages[1].role, 'tool');
  assert.equal(chat.messages[1].tool_call_id, 'call_patch');
  assert.equal(chat.messages[1].content, 'Done');
});

test('codex++ port: request flattens namespace function-call history', () => {
  const chat = responsesRequestToChatCompletions({
    model: 'gpt-5-mini',
    input: [{
      type: 'function_call',
      call_id: 'call_ns',
      namespace: 'mcp__vscode_mcp__',
      name: 'open_file',
      arguments: '{"path":"README.md"}',
    }, {
      type: 'function_call_output',
      call_id: 'call_ns',
      output: 'opened',
    }],
    tools: [{
      type: 'namespace',
      name: 'mcp__vscode_mcp__',
      tools: [{
        type: 'function',
        name: 'open_file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
        },
      }],
    }],
  });

  assert.equal(chat.messages[0].tool_calls[0].function.name, 'mcp__vscode_mcp__open_file');
  assert.equal(chat.messages[1].tool_call_id, 'call_ns');
});

test('codex++ port: non-streaming response restores custom and namespace tool calls', () => {
  const request = {
    model: 'gpt-5-mini',
    input: 'run tools',
    tools: [{
      type: 'custom',
      name: 'exec',
    }, {
      type: 'namespace',
      name: 'mcp__vscode_mcp__',
      tools: [{
        type: 'function',
        name: 'open_file',
        parameters: { type: 'object' },
      }],
    }],
  };
  const response = chatCompletionsResponseToResponses({
    id: 'chatcmpl_tools',
    choices: [{
      message: {
        tool_calls: [{
          id: 'call_custom',
          type: 'function',
          function: {
            name: 'exec',
            arguments: '{"input":"ls -la"}',
          },
        }, {
          id: 'call_ns',
          type: 'function',
          function: {
            name: 'mcp__vscode_mcp__open_file',
            arguments: '{"path":"README.md"}',
          },
        }],
      },
    }],
  }, {
    request,
  });

  assert.equal(response.output[0].type, 'custom_tool_call');
  assert.equal(response.output[0].name, 'exec');
  assert.equal(response.output[0].input, 'ls -la');
  assert.equal(response.output[1].type, 'function_call');
  assert.equal(response.output[1].namespace, 'mcp__vscode_mcp__');
  assert.equal(response.output[1].name, 'open_file');
});

test('codex++ port: non-streaming response reconstructs apply_patch proxy call', () => {
  const response = chatCompletionsResponseToResponses({
    id: 'chatcmpl_patch',
    choices: [{
      message: {
        tool_calls: [{
          id: 'call_patch',
          type: 'function',
          function: {
            name: 'apply_patch_add_file',
            arguments: '{"path":"hello.txt","content":"hello"}',
          },
        }],
      },
    }],
  }, {
    request: {
      model: 'gpt-5-mini',
      input: 'patch files',
      tools: [{
        type: 'custom',
        name: 'apply_patch',
      }],
    },
  });

  assert.equal(response.output[0].type, 'custom_tool_call');
  assert.equal(response.output[0].name, 'apply_patch');
  assert.equal(response.output[0].input, [
    '*** Begin Patch',
    '*** Add File: hello.txt',
    '+hello',
    '*** End Patch',
  ].join('\n'));
});

test('codex++ port: non-streaming response extracts reasoning details', () => {
  const response = chatCompletionsResponseToResponses({
    id: 'chatcmpl_reasoning_details',
    model: 'MiniMax-M2.7',
    choices: [{
      message: {
        reasoning_details: [
          { summary: 'Step one.' },
          { parts: [{ text: 'Step two.' }] },
        ],
        content: 'final',
      },
    }],
  });

  assert.equal(response.output[0].type, 'reasoning');
  assert.equal(response.output[0].reasoning_content, 'Step one.\n\nStep two.');
  assert.equal(response.output[0].summary[0].text, 'Step one.\n\nStep two.');
  assert.equal(response.output[1].type, 'message');
  assert.equal(response.output[1].content[0].text, 'final');
});

test('codex++ port: non-streaming response splits leading inline think block', () => {
  const response = chatCompletionsResponseToResponses({
    id: 'chatcmpl_think',
    model: 'MiniMax-M2.7',
    choices: [{
      message: {
        content: '<think>\nNeed context.\n</think>\n\npong',
      },
    }],
  });

  assert.equal(response.output[0].type, 'reasoning');
  assert.equal(response.output[0].summary[0].text, 'Need context.');
  assert.equal(response.output[1].type, 'message');
  assert.equal(response.output[1].content[0].text, 'pong');
});

test('codex++ port: streaming response restores custom tool call with request context', () => {
  const events = translateChatCompletionsSseToResponsesEvents([
    JSON.stringify({
      id: 'chatcmpl_custom_stream',
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_custom',
            type: 'function',
            function: {
              name: 'exec',
            },
          }],
        },
      }],
    }),
    JSON.stringify({
      id: 'chatcmpl_custom_stream',
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: {
              arguments: '{"input":"ls',
            },
          }],
        },
      }],
    }),
    JSON.stringify({
      id: 'chatcmpl_custom_stream',
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: {
              arguments: ' -la"}',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    }),
  ], {
    request: {
      model: 'gpt-5-mini',
      tools: [{
        type: 'custom',
        name: 'exec',
      }],
    },
  });

  assert.equal(events.some((event) => event.type === 'response.function_call_arguments.delta'), false);
  assert.equal(events.some((event) => event.type === 'response.custom_tool_call_input.delta' && event.delta === 'ls -la'), true);
  const completed = events.at(-1)?.response;
  assert.equal(completed.output[0].type, 'custom_tool_call');
  assert.equal(completed.output[0].name, 'exec');
  assert.equal(completed.output[0].input, 'ls -la');
});

test('codex++ port: streaming response reconstructs apply_patch proxy call', () => {
  const events = translateChatCompletionsSseToResponsesEvents([
    JSON.stringify({
      id: 'chatcmpl_patch_stream',
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_patch',
            type: 'function',
            function: {
              name: 'apply_patch_add_file',
              arguments: '{"path":"hello.txt"',
            },
          }],
        },
      }],
    }),
    JSON.stringify({
      id: 'chatcmpl_patch_stream',
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: {
              arguments: ',"content":"hello"}',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    }),
  ], {
    request: {
      model: 'gpt-5-mini',
      tools: [{
        type: 'custom',
        name: 'apply_patch',
      }],
    },
  });

  const patch = [
    '*** Begin Patch',
    '*** Add File: hello.txt',
    '+hello',
    '*** End Patch',
  ].join('\n');
  assert.equal(events.some((event) => event.type === 'response.custom_tool_call_input.delta' && event.delta === patch), true);
  const completed = events.at(-1)?.response;
  assert.equal(completed.output[0].type, 'custom_tool_call');
  assert.equal(completed.output[0].name, 'apply_patch');
  assert.equal(completed.output[0].input, patch);
});

test('codex++ port: streaming response converts reasoning content before text', () => {
  const events = translateChatCompletionsSseToResponsesEvents([
    JSON.stringify({
      id: 'chatcmpl_reasoning',
      model: 'deepseek-reasoner',
      choices: [{
        delta: {
          reasoning_content: 'Need context. ',
        },
      }],
    }),
    JSON.stringify({
      id: 'chatcmpl_reasoning',
      model: 'deepseek-reasoner',
      choices: [{
        delta: {
          content: 'Done',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 4,
        completion_tokens: 6,
        total_tokens: 10,
        completion_tokens_details: {
          reasoning_tokens: 3,
        },
      },
    }),
  ], {
    request: {
      model: 'deepseek-reasoner',
    },
  });

  assert.equal(events.some((event) => event.type === 'response.reasoning_summary_text.delta' && event.delta === 'Need context. '), true);
  const completed = events.at(-1)?.response;
  assert.equal(completed.output[0].type, 'reasoning');
  assert.equal(completed.output[0].reasoning_content, 'Need context. ');
  assert.equal(completed.output[1].content[0].text, 'Done');
  assert.equal(completed.usage.output_tokens_details.reasoning_tokens, 3);
});

test('codex++ port: streaming response splits inline think across chunks', () => {
  const events = translateChatCompletionsSseToResponsesEvents([
    JSON.stringify({
      id: 'chatcmpl_inline_think',
      model: 'MiniMax-M2.7',
      choices: [{
        delta: {
          content: '<think>\nNeed',
        },
      }],
    }),
    JSON.stringify({
      id: 'chatcmpl_inline_think',
      model: 'MiniMax-M2.7',
      choices: [{
        delta: {
          content: ' context.</think>\n\npong',
        },
        finish_reason: 'stop',
      }],
    }),
  ], {
    request: {
      model: 'MiniMax-M2.7',
    },
  });

  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('<think>'), false);
  assert.equal(serialized.includes('</think>'), false);
  const completed = events.at(-1)?.response;
  assert.equal(completed.output[0].type, 'reasoning');
  assert.equal(completed.output[0].summary[0].text, 'Need context.');
  assert.equal(completed.output[1].content[0].text, 'pong');
});
