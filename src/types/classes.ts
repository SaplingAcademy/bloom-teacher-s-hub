import { CEFRLevel, CourseFocus, StudentType } from "@/lib/calendar-sync";

export type ClassType = "pair" | "group";
export type ClassStatus = "active" | "paused" | "archived";
export type MemberStatus = "active" | "transferred" | "removed";
export type AttendanceStatusType = "present" | "absent" | "justified" | "makeup" | "cancelled";

export interface ClassEntity {
  id: string;
  teacher_id: string;
  name: string;
  type: ClassType;
  language: string;
  level: CEFRLevel;
  status: ClassStatus;
  start_date: string;
  package_id?: string | null;
  notes?: string | null;
  color_key?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ClassMember {
  id: string;
  class_id: string;
  student_id: string;
  teacher_id: string;
  joined_at: string;
  left_at?: string | null;
  status: MemberStatus;
  created_at?: string;
  updated_at?: string;
  // Joined student relation fields
  student_name?: string;
  student_email?: string;
  student_phone?: string;
  student_avatar?: string;
}

export interface ClassSchedule {
  id: string;
  class_id: string;
  teacher_id: string;
  weekday: string; // "Monday", "Tuesday", etc.
  start_time: string; // "19:00" or "19:00:00"
  end_time: string; // "20:00" or "20:00:00"
  duration: number; // 60
  delivery_mode: "Online" | "In person";
  location_link?: string | null;
  created_at?: string;
}

export interface ClassSession {
  id: string;
  class_id: string;
  calendar_event_id?: string | null;
  teacher_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  duration: number;
  status: "scheduled" | "completed" | "cancelled";
  topic?: string | null;
  content?: string | null;
  homework?: string | null;
  materials_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClassAttendance {
  id: string;
  class_session_id: string;
  student_id: string;
  teacher_id: string;
  status: AttendanceStatusType;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined relation fields
  student_name?: string;
}
