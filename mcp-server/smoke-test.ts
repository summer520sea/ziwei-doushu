import assert from 'node:assert/strict';
import { generateChart } from '../lib/ziwei/algorithm';
import { calculateTrueSolarTime, resolveZiweiDayOffset, shiftGregorianDate } from '../lib/ziwei/true-solar-time';

const input = {
  year: 1990,
  month: 6,
  day: 15,
  clockHour: 12,
  clockMinute: 30,
  longitude: 120,
  utcOffsetMinutes: 480,
};

const solar = calculateTrueSolarTime(input);
assert.equal(solar.dateValid, true);

const dayOffset = resolveZiweiDayOffset(solar, 'next-day');
const date = shiftGregorianDate(input, dayOffset);
const chart = generateChart({
  year: date.year,
  month: date.month,
  day: date.day,
  hour: solar.branch,
  gender: 'female',
  longitude: input.longitude,
});

assert.equal(chart.palaces.length, 12, '本命盘必须有十二宫');
assert.ok(chart.palaces.some((palace) => palace.isMingGong), '必须标记命宫');
assert.ok(chart.palaces.some((palace) => palace.isShenGong), '必须标记身宫');
assert.ok(chart.daXians.length > 0, '必须生成大限');
assert.equal(chart.birthInfo.hour, solar.branch, '排盘时辰必须使用真太阳时计算结果');

console.log('MCP 排盘引擎自检通过：真实调用 generateChart()，十二宫与大限数据完整。');
