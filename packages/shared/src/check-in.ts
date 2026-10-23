export interface CheckInSession { id: string; name: string; startTime: string; endTime: string }
export interface CheckInDeviceView {
  id: string; name: string; branchId: string; beforeMinutes: number; afterMinutes: number; soundEnabled: boolean; volume: number;
  revokedAt?: string; activatedAt?: string; lastSeenAt?: string; sessionExpiresAt?: string;
}
export interface CheckInResult {
  kind: "SUCCESS" | "WARNING";
  firstName: string;
  message: string;
  session: CheckInSession;
  financialNotice?: string;
}
export type CheckInScanResponse = CheckInResult | { kind: "SELECT"; sessions: CheckInSession[] };
