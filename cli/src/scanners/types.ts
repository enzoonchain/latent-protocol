/** Per-agent scan result (counts only — no prompt content). */
export interface AgentScanResult {
  agent: string;
  label: string;
  detected: boolean;
  sessions: number;
  userTurns: number;
  thinkingStates: number;
  billableSlots: number;
  detail: string;
}

export interface ScanReport {
  scanVersion: string;
  daysScanned: number;
  agents: AgentScanResult[];
  totalBillableSlots: number;
  topBid: number;
  missedUsdEstimate: number;
}

export const SCAN_VERSION = "1";
export const DEFAULT_SCAN_DAYS = 30;
