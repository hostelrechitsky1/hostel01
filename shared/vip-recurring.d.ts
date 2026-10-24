import type { AppSettings, Booking, Machine, Student, VipRecurringRule } from '../src/types';

export interface VipWeek { start: string; end: string; weekId: string }
export interface VipApplyResult {
    applied: boolean;
    nextWeekId: string;
    success: number;
    skipped: number;
    overridden: number;
    failed: number;
    blocked: number;
}
export function getVipWeeks(now?: Date): VipWeek[];
export function getVipRuleDate(rule: VipRecurringRule, week: VipWeek): string;
export function getVipSlotId(rule: VipRecurringRule, date: string): string;
export function getVipRuleProblem(rule: VipRecurringRule, rules: VipRecurringRule[], settings: AppSettings): string | null;
export function reconcileVipBookings(options: {
    now?: Date;
    settings: AppSettings;
    rules: VipRecurringRule[];
    students: Student[];
    machines: Machine[];
    bookings: Booking[];
    reserve: (booking: Booking, previous: Booking[], rule: VipRecurringRule) => Promise<{ overridden: number }>;
}): Promise<VipApplyResult>;
