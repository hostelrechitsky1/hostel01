export interface Student {
  id: string;
  name: string;
  roomNumber: string;
  pin?: string;
}

export interface Machine {
  id: string;
  name: string;
  status: 'available' | 'maintenance';
}

export interface Booking {
  id: string;
  machineId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  weekId: string; // YYYY-Www
  studentName?: string; // Snapshot for easier display/printing
  roomNumber?: string; // Snapshot
  createdAt: number;
}

export const TIME_SLOTS = [
  "09:00",
  "10:30",
  "12:00",
  "13:30",
  "15:00",
  "16:30",
  "18:00",
  "19:30",
  "21:00"
] as const;

export const SLOT_DURATION_MINUTES = 90;

export interface CalendarSlot {
  time: string;
  machineId: string;
  isBooked: boolean;
  isYourBooking: boolean;
  booking?: Booking;
}

export interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  previewImageUrl?: string;
  optimizedImageUrl?: string;
  mobileImageUrl?: string;
  desktopImageUrl?: string;
  responsiveSrcSet?: string;
  responsiveSizes?: string;
  linkUrl?: string; // Optional external link
  isActive: boolean;
  createdAt: number;
  priority: number; // For sorting (1 = top)
  type: 'image' | 'alert'; // Future proofing
  message?: string; // For text-only alerts
}

export type FeedbackType = 'bug' | 'feature' | 'other';

export interface FeedbackReply {
  text: string;
  repliedAt: number;
  repliedBy: string;
}

export interface Feedback {
  id: string;
  studentId?: string;
  studentName: string;
  roomNumber: string;
  text: string;
  type: 'bug' | 'feature' | 'other';
  timestamp: number;
  read: boolean;
  adminReply?: FeedbackReply;
}

export interface TopAlert {
  message: string;
  isActive: boolean;
  type: 'info' | 'warning' | 'urgent';
}

export interface VipRecurringRule {
  id: string;
  studentId: string;
  machineId: string;
  weekday: number; // 0=Sun, 1=Mon ... 6=Sat
  startTime: string; // HH:mm
  isActive: boolean;
  createdAt: number;
}

export interface AppSettings {
  forceShowNextWeek: boolean;
  forceCloseBookings: boolean;
  maintenanceDay: number; // 0=Sun, 1=Mon, ..., 6=Sat
  autoOpenWeekday: number; // 0=Sun, 1=Mon, ..., 6=Sat
  autoOpenTime: string; // HH:mm (Belarus local)
  autoOpenDurationHours: number; // Opening window length
  vipAutoEnabled?: boolean;
  vipLastAppliedWeekId?: string;
  topAlert?: TopAlert;
}
