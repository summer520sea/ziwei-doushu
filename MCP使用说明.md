# 紫微斗数 MCP（Codespaces 一键运行）

本目录把仓库原有的 `generateChart()` 包装成 MCP 工具，不复制、不改写排盘算法。

## 已提供的 MCP 工具

- `generate_ziwei_chart`：调用 `lib/ziwei/algorithm.ts::generateChart`，返回完整命盘 JSON（十二宫、星曜、亮度、四化、大限、命主身主、五行局等）。
- `ziwei_engine_info`：返回引擎入口和排盘口径。

排盘时间处理直接调用 `lib/ziwei/true-solar-time.ts`。传入经度时会应用经度修正和 NOAA 均时差，并按仓库的晚子时规则决定排盘日期。时区参数使用固定 UTC 偏移分钟，不自动推断历史夏令时。

## 在 GitHub Codespaces 启动

1. 打开自己的仓库：<https://github.com/summer520sea/ziwei-doushu>
2. 点击绿色 **Code** → **Codespaces** → **Create codespace on main**。
3. 首次创建时会自动安装 npm 依赖并运行排盘自检；环境启动后会自动启动 MCP 服务。
4. 在 Codespaces 底部的 **Ports** 面板确认 8787 端口已转发。默认是 Private。
5. MCP 地址格式为 `https://<你的-codespace-名称>-8787.app.github.dev/mcp`。
6. 访问令牌可在 Codespaces 终端运行 `cat .mcp-auth-token` 查看。MCP 客户端须使用 HTTP Bearer Token 认证。

## 手动命令

```bash
npm install
npm run mcp:smoke
npm run mcp
```

健康检查地址：`http://localhost:8787/health`。

## 安全提示

- 服务会在 Codespaces 工作区生成本地访问令牌文件 `.mcp-auth-token`，该文件已加入 `.gitignore`，不会提交到 GitHub。
- 8787 端口默认 Private。只有确实需要外部 MCP 客户端访问时才将端口改为 Public；不要公开令牌或把令牌提交到仓库。
- 服务不保存出生资料，也不会把出生参数写入日志；每次调用只在内存中计算并返回结果。
- Codespaces 停止或休眠时，服务也会停止；需要调用时重新启动 Codespace。
- ChatGPT 是否能添加该服务器取决于账号计划和当前自定义 MCP 接入权限。Free 账号不能直接连接自定义 MCP；本服务仍可供支持远程 MCP 的其他客户端使用。
