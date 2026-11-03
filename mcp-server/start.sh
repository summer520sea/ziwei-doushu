#!/usr/bin/env bash
set -euo pipefail

PID_FILE=".mcp-server.pid"
LOG_FILE=".mcp-server.log"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "紫微 MCP 服务已经在运行。"
  exit 0
fi

nohup npm run mcp > "$LOG_FILE" 2>&1 < /dev/null &
echo $! > "$PID_FILE"

sleep 2
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "MCP 服务启动失败，日志如下："
  cat "$LOG_FILE"
  exit 1
fi

echo "紫微 MCP 服务已在后台启动。"
echo "查看运行日志：tail -f .mcp-server.log"
echo "查看访问令牌：cat .mcp-auth-token"
