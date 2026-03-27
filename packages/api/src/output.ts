import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

export const STATUS_COLORS = {
  completed: chalk.hex('#00d4aa'),   // teal
  active: chalk.hex('#f59e0b'),      // amber
  failed: chalk.hex('#ef4444'),      // red
  pending: chalk.hex('#6b7280'),     // gray
  claimed: chalk.hex('#3b82f6'),     // blue
  sealed: chalk.hex('#8b5cf6'),      // purple
} as const;

export function colorStatus(status: string): string {
  const colorFn = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? chalk.white;
  return colorFn(status.toUpperCase());
}

export function createSpinner(text: string) {
  return ora(text);
}

export function createTable(head: string[]) {
  return new Table({ head: head.map(h => chalk.cyan(h)) });
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// Bead color cycling for logs (per D-13)
const BEAD_COLORS = ['#00d4aa', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];
const beadColorMap = new Map<string, string>();
let colorIndex = 0;

export function getBeadColor(beadId: string): string {
  if (!beadColorMap.has(beadId)) {
    beadColorMap.set(beadId, BEAD_COLORS[colorIndex % BEAD_COLORS.length]!);
    colorIndex++;
  }
  return beadColorMap.get(beadId)!;
}
