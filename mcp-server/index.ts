import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

import { generateChart } from '../lib/ziwei/algorithm';
import { BRANCHES } from '../lib/ziwei/constants';
import {
  calculateTrueSolarTime,
  isValidGregorianDate,
  resolveZiweiDayOffset,
  shiftGregorianDate,
} from '../lib/ziwei/true-solar-time';

const PORT = Number(process.env.PORT || 8787);
const HOST = '0.0.0.0';
const TOKEN_FILE = resolve(process.cwd(), '.mcp-auth-token');

function loadOrCreateToken(): string {
  const configured = process.env.ZIWEI_MCP_TOKEN?.trim();
  if (configured) return configured;

  if (existsSync(TOKEN_FILE)) {
    const existing = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (existing) return existing;
  }

  const token = randomBytes(32).toString('hex');
  writeFileSync(TOKEN_FILE, token + '\n', { mode: 0o600 });
  console.log('已生成 MCP 访问令牌，保存在 .mcp-auth-token（不会提交到 GitHub）。');
  console.log('需要查看令牌时，在终端运行：cat .mcp-auth-token');
  return token;
}

const accessToken = loadOrCreateToken();

function authorized(header: string | undefined): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(accessToken, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function parseDateTime(birthDate: string, birthTime: string) {
  const [year, month, day] = birthDate.split('-').map(Number);
  const [clockHour, clockMinute] = birthTime.split(':').map(Number);

  if (!isValidGregorianDate(year, month, day)) {
    throw new RangeError(`出生日期无效：${birthDate}`);
  }
  if (
    !Number.isInteger(clockHour) || !Number.isInteger(clockMinute) ||
    clockHour < 0 || clockHour > 23 || clockMinute < 0 || clockMinute > 59
  ) {
    throw new RangeError(`出生时间无效：${birthTime}`);
  }
  return { year, month, day, clockHour, clockMinute };
}

function createZiweiMcpServer() {
  const server = new McpServer({
    name: 'ziwei-doushu-engine',
    version: '1.0.0',
  });

  server.registerTool(
    'generate_ziwei_chart',
    {
      title: '生成完整紫微斗数命盘',
      description:
        '调用本仓库原始 generateChart() 生成完整本命盘。输入公历出生日期、当地钟表时间、性别、经度和 UTC 时区偏移。提供经度时按仓库的真太阳时函数校正，并按晚子时规则确定排盘日期。返回完整 JSON：十二宫、星曜、亮度、四化、大限、命主身主、五行局等。不会保存输入的出生资料。',
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({
        birthDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe('公历出生日期，例如 1995-05-20'),
        birthTime: z.string().regex(/^\\d{2}:\\d{2}$/).describe('出生地当地钟表时间，例如 17:27'),
        gender: z.enum(['female', 'male']).describe('性别'),
        longitude: z.number().min(-180).max(180).optional().describe('出生地经度；不提供则不做真太阳时校正'),
        utcOffsetMinutes: z.number().int().min(-720).max(840).default(480).describe('出生地 UTC 固定时区偏移分钟；中国大陆填 480，东经/西经以东为正'),
        leapMonthPolicy: z.enum(['split', 'prev-month', 'next-month', 'origin-month']).default('split').describe('闰月处理规则，默认 split（月中分界）'),
      }),
    },
    async ({ birthDate, birthTime, gender, longitude, utcOffsetMinutes, leapMonthPolicy }) => {
      try {
        const input = parseDateTime(birthDate, birthTime);
        const solar = calculateTrueSolarTime({
          ...input,
          longitude,
          utcOffsetMinutes,
        });
        const ziweiDayOffset = resolveZiweiDayOffset(solar, 'next-day');
        const chartDate = shiftGregorianDate(input, ziweiDayOffset);

        const chart = generateChart(
          {
            year: chartDate.year,
            month: chartDate.month,
            day: chartDate.day,
            hour: solar.branch,
            gender,
            ...(longitude === undefined ? {} : { longitude }),
          },
          { leapMonth: leapMonthPolicy },
        );

        const result = {
          engine: 'summer520sea/ziwei-doushu',
          engineFunction: 'lib/ziwei/algorithm.ts::generateChart',
          generatedAt: new Date().toISOString(),
          input: {
            birthDate,
            birthTime,
            gender,
            longitude: longitude ?? null,
            utcOffsetMinutes,
            leapMonthPolicy,
          },
          timeCorrection: {
            corrected: solar.corrected,
            longitudeCorrectionMinutes: solar.longitudeCorrectionMinutes,
            equationOfTimeMinutes: solar.equationOfTimeMinutes,
            totalCorrectionMinutes: solar.totalCorrectionMinutes,
            trueSolarTime: [
              String(solar.hour).padStart(2, '0'),
              String(solar.minute).padStart(2, '0'),
              String(solar.second).padStart(2, '0'),
            ].join(':'),
            rawSolarDayOffset: solar.dayOffset,
            ziweiDayOffset,
            chartDate: [
              chartDate.year,
              String(chartDate.month).padStart(2, '0'),
              String(chartDate.day).padStart(2, '0'),
            ].join('-'),
            timeBranchIndex: solar.branch,
            timeBranch: BRANCHES[solar.branch],
            lateZishiRule: 'next-day',
          },
          chart,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error),
          }],
        };
      }
    },
  );

  server.registerTool(
    'ziwei_engine_info',
    {
      title: '查看紫微排盘引擎信息',
      description: '查看本 MCP 服务调用的排盘算法、时间处理和闰月默认口径。',
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          repository: 'https://github.com/summer520sea/ziwei-doushu',
          entryPoint: 'lib/ziwei/algorithm.ts::generateChart',
          timeEngine: 'lib/ziwei/true-solar-time.ts::calculateTrueSolarTime',
          defaultLeapMonthPolicy: 'split',
          lateZishiRule: 'next-day',
          output: 'complete ZiweiChart JSON',
          persistence: '出生参数只在本次请求内计算，不写入数据库或日志',
        }, null, 2),
      }],
    }),
  );

  return server;
}

const handler = createMcpHandler(createZiweiMcpServer, { responseMode: 'json' });
const nodeHandler = toNodeHandler(handler);

const httpServer = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'ziwei-doushu-mcp', endpoint: '/mcp' }));
    return;
  }

  if (path !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found. MCP endpoint: /mcp' }));
    return;
  }

  if (!authorized(req.headers.authorization)) {
    res.writeHead(401, {
      'content-type': 'application/json; charset=utf-8',
      'www-authenticate': 'Bearer',
    });
    res.end(JSON.stringify({ error: 'Unauthorized. Provide Authorization: Bearer <token>.' }));
    return;
  }

  void nodeHandler(req, res);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`紫微斗数 MCP 已启动：http://localhost:${PORT}/mcp`);
  console.log(`健康检查：http://localhost:${PORT}/health`);
  console.log('MCP 访问令牌已启用；如需查看，在终端运行：cat .mcp-auth-token');
});

async function shutdown() {
  await handler.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
