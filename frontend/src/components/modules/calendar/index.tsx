import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Phone,
  User,
  Check,
  CheckCircle2,
  X,
  Plus,
  Search,
  Filter,
  Bell,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Building,
  Mail,
  Trash2,
  CalendarDays,
  CheckSquare,
  Sparkles,
  Link2,
} from "lucide-react";

export interface CalendarEventRecord {
  id: string;
  user_id?: string;
  call_id?: string;
  report_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  company_name?: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  meeting_type: "google_meet" | "phone_call" | "in_person";
  meet_url?: string;
  status: "scheduled" | "completed" | "cancelled";
  reminder_minutes: number;
  remind_via: string;
  google_event_id?: string;
  synced_to_google: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarModuleProps {
  user?: any;
  session?: any;
  companyName?: string;
}

const API_BASE = (((import.meta.env as Record<string, any>)["VITE_BACKEND_URL"]) || "http://localhost:8000").replace(/\/$/, "");

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

export function CalendarModule({ user, session, companyName }: CalendarModuleProps) {
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "agenda">("month");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  // Modals & Selected Event
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // New Event Form State
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formCustomerEmail, setFormCustomerEmail] = useState("");
  const [formCustomerPhone, setFormCustomerPhone] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formTime, setFormTime] = useState("14:00");
  const [formDuration, setFormDuration] = useState(30);
  const [formType, setFormType] = useState<"google_meet" | "phone_call">("google_meet");
  const [formReminder, setFormReminder] = useState(15);
  const [submitting, setSubmitting] = useState(false);

  // Fetch events
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/calendar/events?limit=200`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (e) {
      console.error("Failed to load calendar events:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user]);

  // Temporary success banner
  const triggerSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  // Quick Action: Mark Done ("completed")
  const handleMarkDone = async (e: React.MouseEvent, eventId: string, currentStatus: string) => {
    e.stopPropagation();
    const newStatus = currentStatus === "completed" ? "scheduled" : "completed";
    try {
      const res = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((ev) => (ev.id === eventId ? { ...ev, status: newStatus } : ev))
        );
        if (selectedEvent?.id === eventId) {
          setSelectedEvent((prev) => prev ? { ...prev, status: newStatus } : null);
        }
        triggerSuccess(
          newStatus === "completed"
            ? "✓ Meeting marked as Completed (Done)!"
            : "Meeting reset to Scheduled"
        );
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this scheduled meeting?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/calendar/events/${eventId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
        setSelectedEvent(null);
        triggerSuccess("Meeting removed from calendar");
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  // Create new event
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerName.trim() || !formTitle.trim()) return;

    try {
      setSubmitting(true);
      const startDateTime = new Date(`${formDate}T${formTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + formDuration * 60000);

      const payload = {
        customer_name: formCustomerName.trim(),
        customer_email: formCustomerEmail.trim() || undefined,
        customer_phone: formCustomerPhone.trim() || undefined,
        company_name: companyName || undefined,
        title: formTitle.trim(),
        description: formDescription.trim(),
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        meeting_type: formType,
        reminder_minutes: Number(formReminder),
        remind_via: "popup",
      };

      const res = await fetch(`${API_BASE}/api/calendar/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.event) {
          setEvents((prev) => [...prev, data.event]);
        }
        setShowCreateModal(false);
        resetForm();
        triggerSuccess("✓ Meeting scheduled with Google Meet & Reminders set!");
      }
    } catch (err) {
      console.error("Failed to create event:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormCustomerName("");
    setFormCustomerEmail("");
    setFormCustomerPhone("");
    setFormTitle("");
    setFormDescription("");
    setFormDuration(30);
    setFormType("google_meet");
    setFormReminder(15);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (statusFilter !== "all" && ev.status !== statusFilter) return false;
      if (typeFilter !== "all" && ev.meeting_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCust = ev.customer_name?.toLowerCase().includes(q);
        const matchTitle = ev.title?.toLowerCase().includes(q);
        const matchCompany = ev.company_name?.toLowerCase().includes(q);
        if (!matchCust && !matchTitle && !matchCompany) return false;
      }
      return true;
    });
  }, [events, statusFilter, typeFilter, searchQuery]);

  // Date Nav Handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Helper formatting
  const formatTimeRange = (startStr: string, endStr: string) => {
    try {
      const s = new Date(startStr);
      const e = new Date(endStr);
      const sTime = s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const eTime = e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `${sTime} – ${eTime}`;
    } catch {
      return "TBD";
    }
  };

  // Month Grid Calculation
  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: Array<{
      date: Date;
      isCurrentMonth: boolean;
      dayNumber: number;
      events: CalendarEventRecord[];
    }> = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const d = new Date(year, month - 1, dayNum);
      const dayEvents = filteredEvents.filter((ev) => {
        const evD = new Date(ev.start_time);
        return evD.getFullYear() === d.getFullYear() &&
               evD.getMonth() === d.getMonth() &&
               evD.getDate() === d.getDate();
      });
      cells.push({ date: d, isCurrentMonth: false, dayNumber: dayNum, events: dayEvents });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dayEvents = filteredEvents.filter((ev) => {
        const evD = new Date(ev.start_time);
        return evD.getFullYear() === d.getFullYear() &&
               evD.getMonth() === d.getMonth() &&
               evD.getDate() === d.getDate();
      });
      cells.push({ date: d, isCurrentMonth: true, dayNumber: day, events: dayEvents });
    }

    // Next month padding to fill complete grid
    const totalNeeded = Math.ceil(cells.length / 7) * 7;
    let nextDay = 1;
    while (cells.length < totalNeeded) {
      const d = new Date(year, month + 1, nextDay);
      const dayEvents = filteredEvents.filter((ev) => {
        const evD = new Date(ev.start_time);
        return evD.getFullYear() === d.getFullYear() &&
               evD.getMonth() === d.getMonth() &&
               evD.getDate() === d.getDate();
      });
      cells.push({ date: d, isCurrentMonth: false, dayNumber: nextDay, events: dayEvents });
      nextDay++;
    }

    return cells;
  }, [currentDate, filteredEvents]);

  // Week Grid Calculation
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const sunday = new Date(curr.setDate(curr.getDate() - day));
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Notification */}
      {actionSuccessMsg && (
        <div className="flex items-center justify-between border border-lime bg-lime/10 px-4 py-2.5 text-xs font-mono text-lime-foreground transition-all">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime-700 dark:text-lime" />
            {actionSuccessMsg}
          </span>
          <button onClick={() => setActionSuccessMsg(null)} className="text-muted-foreground hover:text-ink">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Header Bar (Google Calendar-style Navigation) */}
      <div className="border border-ink bg-card p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Month/Year & Navigation */}
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center gap-1.5 border border-ink/30 bg-paper p-1">
              <button
                onClick={handlePrev}
                className="p-1 hover:bg-secondary text-ink transition-colors"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleToday}
                className="px-2.5 py-0.5 text-xs font-mono font-bold hover:bg-secondary text-ink transition-colors"
              >
                Today
              </button>
              <button
                onClick={handleNext}
                className="p-1 hover:bg-secondary text-ink transition-colors"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-tight">
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>

            {/* Google Sync & Reminder Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-ink/20 bg-paper text-[11px] font-mono text-muted-foreground">
              <Bell className="w-3 h-3 text-violet" />
              <span>Google Reminders Active</span>
            </div>
          </div>

          {/* Right: View Toggles & New Meeting Button */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* View switcher tabs */}
            <div className="flex border border-ink/30 bg-paper p-0.5">
              {(["month", "week", "day", "agenda"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs font-mono uppercase font-bold transition-all ${
                    viewMode === mode
                      ? "bg-ink text-paper"
                      : "text-muted-foreground hover:text-ink hover:bg-secondary/60"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 border border-ink bg-ink text-paper px-3.5 py-2 label-mono text-xs font-bold hover:bg-violet hover:border-violet transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-paper" />
              <span>Schedule Meeting / Call</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="mt-4 pt-4 border-t border-ink/10 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by customer or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-ink/30 bg-paper pl-8 pr-3 py-1.5 font-mono text-xs text-ink placeholder-muted-foreground focus:outline-none focus:border-violet transition-all"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-ink/30 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink focus:outline-none focus:border-violet"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed (Done)</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-ink/30 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink focus:outline-none focus:border-violet"
            >
              <option value="all">All Meeting Types</option>
              <option value="google_meet">Google Meet</option>
              <option value="phone_call">Phone Call</option>
            </select>

            <button
              onClick={fetchEvents}
              className="p-1.5 border border-ink/30 bg-paper hover:bg-secondary text-muted-foreground hover:text-ink transition-colors"
              title="Refresh calendar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-violet" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────── MAIN CALENDAR VIEWS ─────────────────── */}

      {/* 1. MONTH VIEW */}
      {viewMode === "month" && (
        <div className="border border-ink bg-card overflow-hidden">
          {/* Day of week headers */}
          <div className="grid grid-cols-7 border-b border-ink/30 bg-paper text-center">
            {DAYS_OF_WEEK.map((d, i) => (
              <div key={d} className={`py-2 text-[11px] font-mono font-bold tracking-wider ${i === 0 || i === 6 ? "text-muted-foreground" : "text-ink"}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Month day grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-ink/20">
            {monthData.map((cell, idx) => {
              const currentDayToday = isToday(cell.date);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setFormDate(cell.date.toISOString().split("T")[0]);
                    setShowCreateModal(true);
                  }}
                  className={`min-h-[110px] sm:min-h-[130px] p-1.5 sm:p-2 transition-colors cursor-pointer flex flex-col justify-between ${
                    cell.isCurrentMonth ? "bg-card hover:bg-secondary/40" : "bg-paper/60 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-mono font-bold flex items-center justify-center rounded-sm ${
                        currentDayToday
                          ? "bg-violet text-white w-5 h-5"
                          : "text-ink"
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.events.length > 0 && (
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {cell.events.length} {cell.events.length === 1 ? "event" : "events"}
                      </span>
                    )}
                  </div>

                  {/* Day Events Stack */}
                  <div className="space-y-1 overflow-y-auto max-h-[80px]">
                    {cell.events.slice(0, 3).map((ev) => {
                      const isDone = ev.status === "completed";
                      const isMeet = ev.meeting_type === "google_meet";
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                          }}
                          className={`px-1.5 py-1 text-[10px] font-mono border truncate flex items-center justify-between group transition-all ${
                            isDone
                              ? "border-ink/20 bg-secondary/80 text-muted-foreground line-through"
                              : isMeet
                              ? "border-violet/40 bg-violet/10 text-ink hover:border-violet"
                              : "border-lime/40 bg-lime/10 text-ink hover:border-lime"
                          }`}
                        >
                          <span className="truncate font-bold flex items-center gap-1">
                            {isDone ? (
                              <Check className="w-2.5 h-2.5 text-lime-700 dark:text-lime shrink-0" />
                            ) : isMeet ? (
                              <Video className="w-2.5 h-2.5 text-violet shrink-0" />
                            ) : (
                              <Phone className="w-2.5 h-2.5 text-lime-700 dark:text-lime shrink-0" />
                            )}
                            <span className="truncate">{ev.customer_name}</span>
                          </span>

                          {/* Quick Mark Done Button on Hover */}
                          <button
                            onClick={(e) => handleMarkDone(e, ev.id, ev.status)}
                            className="hidden group-hover:inline-block p-0.5 hover:bg-secondary text-ink ml-1"
                            title={isDone ? "Reset" : "Mark Done"}
                          >
                            <CheckSquare className="w-2.5 h-2.5 text-lime-700 dark:text-lime" />
                          </button>
                        </div>
                      );
                    })}

                    {cell.events.length > 3 && (
                      <div className="text-[9px] font-mono text-violet font-bold text-center">
                        +{cell.events.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. WEEK VIEW */}
      {viewMode === "week" && (
        <div className="border border-ink bg-card overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header row */}
            <div className="grid grid-cols-8 border-b border-ink/30 bg-paper text-center">
              <div className="py-2.5 border-r border-ink/20 text-[10px] font-mono text-muted-foreground uppercase">
                Time
              </div>
              {weekDays.map((d, i) => {
                const isCurToday = isToday(d);
                return (
                  <div
                    key={i}
                    className={`py-2 border-r border-ink/20 last:border-r-0 ${
                      isCurToday ? "bg-violet/10 font-bold" : ""
                    }`}
                  >
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">
                      {DAYS_OF_WEEK[d.getDay()]}
                    </div>
                    <div
                      className={`text-xs font-mono font-bold mt-0.5 inline-block px-1.5 ${
                        isCurToday ? "bg-violet text-white" : "text-ink"
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid Rows */}
            <div className="divide-y divide-ink/10">
              {HOURS.map((hour) => {
                const hourFormatted = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
                return (
                  <div key={hour} className="grid grid-cols-8 min-h-[56px]">
                    <div className="border-r border-ink/20 p-2 text-[10px] font-mono text-muted-foreground text-right pr-2">
                      {hourFormatted}
                    </div>
                    {weekDays.map((dayDate, dayIdx) => {
                      const hourEvents = filteredEvents.filter((ev) => {
                        const evD = new Date(ev.start_time);
                        return (
                          evD.getFullYear() === dayDate.getFullYear() &&
                          evD.getMonth() === dayDate.getMonth() &&
                          evD.getDate() === dayDate.getDate() &&
                          evD.getHours() === hour
                        );
                      });

                      return (
                        <div
                          key={dayIdx}
                          onClick={() => {
                            setFormDate(dayDate.toISOString().split("T")[0]);
                            setFormTime(`${hour.toString().padStart(2, "0")}:00`);
                            setShowCreateModal(true);
                          }}
                          className="border-r border-ink/10 last:border-r-0 p-1 hover:bg-secondary/40 transition-colors cursor-pointer space-y-1"
                        >
                          {hourEvents.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className={`p-1.5 text-[10px] font-mono border rounded-none ${
                                ev.status === "completed"
                                  ? "border-ink/20 bg-secondary line-through text-muted-foreground"
                                  : ev.meeting_type === "google_meet"
                                  ? "border-violet bg-violet/10 text-ink"
                                  : "border-lime bg-lime/10 text-ink"
                              }`}
                            >
                              <div className="font-bold truncate">{ev.customer_name}</div>
                              <div className="text-[9px] text-muted-foreground truncate">{ev.title}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. DAY VIEW */}
      {viewMode === "day" && (
        <div className="border border-ink bg-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-ink/20 pb-3">
            <div>
              <span className="label-mono text-muted-foreground">Selected Day</span>
              <h3 className="font-display text-lg font-extrabold uppercase">
                {currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </h3>
            </div>
            <span className="label-mono px-2.5 py-1 border border-ink/30 bg-paper">
              {filteredEvents.filter((ev) => {
                const d = new Date(ev.start_time);
                return d.toDateString() === currentDate.toDateString();
              }).length} Scheduled
            </span>
          </div>

          <div className="space-y-3">
            {filteredEvents
              .filter((ev) => new Date(ev.start_time).toDateString() === currentDate.toDateString())
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
              .map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  className={`border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-violet transition-all ${
                    ev.status === "completed"
                      ? "border-ink/20 bg-secondary/40 opacity-75"
                      : "border-ink bg-paper"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-extrabold uppercase tracking-tight">
                        {ev.title}
                      </span>
                      <span
                        className={`label-mono text-[10px] px-2 py-0.5 border ${
                          ev.status === "completed"
                            ? "border-lime bg-lime/20 text-lime-foreground"
                            : "border-violet bg-violet/10 text-violet"
                        }`}
                      >
                        {ev.status === "completed" ? "Completed" : "Scheduled"}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                      <User className="w-3 h-3 text-violet" /> Customer: <strong className="text-ink">{ev.customer_name}</strong>
                      {ev.company_name && `(${ev.company_name})`}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-violet" />
                        {formatTimeRange(ev.start_time, ev.end_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bell className="w-3 h-3 text-amber-500" />
                        {ev.reminder_minutes}m alert set
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {ev.meet_url && (
                      <a
                        href={ev.meet_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 border border-violet bg-violet text-white px-3 py-1.5 label-mono text-xs font-bold hover:bg-violet/90 transition-all"
                      >
                        <Video className="w-3.5 h-3.5 text-lime" />
                        <span>Join Google Meet</span>
                      </a>
                    )}
                    <button
                      onClick={(e) => handleMarkDone(e, ev.id, ev.status)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 label-mono text-xs font-bold border transition-all ${
                        ev.status === "completed"
                          ? "border-lime bg-lime text-lime-foreground"
                          : "border-ink bg-paper text-ink hover:bg-secondary"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{ev.status === "completed" ? "Done" : "Mark Done"}</span>
                    </button>
                  </div>
                </div>
              ))}

            {filteredEvents.filter((ev) => new Date(ev.start_time).toDateString() === currentDate.toDateString()).length === 0 && (
              <div className="text-center py-12 border border-dashed border-ink/20">
                <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="font-mono text-xs text-muted-foreground">No meetings scheduled for this day.</p>
                <button
                  onClick={() => {
                    setFormDate(currentDate.toISOString().split("T")[0]);
                    setShowCreateModal(true);
                  }}
                  className="mt-3 label-mono text-xs text-violet hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Schedule a meeting on this date
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. AGENDA / LIST VIEW */}
      {viewMode === "agenda" && (
        <div className="border border-ink bg-card divide-y divide-ink/20">
          <div className="p-4 bg-paper flex items-center justify-between">
            <span className="label-mono text-muted-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-violet" />
              All Scheduled Meetings & Calls ({filteredEvents.length})
            </span>
          </div>

          <div className="divide-y divide-ink/10">
            {filteredEvents.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-mono text-xs text-muted-foreground">No meetings match your filter criteria.</p>
              </div>
            ) : (
              filteredEvents
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map((ev) => {
                  const isDone = ev.status === "completed";
                  const startD = new Date(ev.start_time);
                  const isMeet = ev.meeting_type === "google_meet";

                  return (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all hover:bg-secondary/40 ${
                        isDone ? "bg-secondary/30 opacity-80" : "bg-card"
                      }`}
                    >
                      {/* Left: Date Badge & Title */}
                      <div className="flex items-start gap-3.5">
                        <div className="border border-ink/30 bg-paper p-2 text-center min-w-[58px] shrink-0">
                          <div className="text-[10px] font-mono text-muted-foreground uppercase font-bold">
                            {(MONTH_NAMES[startD.getMonth()] || "").slice(0, 3)}
                          </div>
                          <div className="font-display text-lg font-extrabold text-ink leading-none mt-0.5">
                            {startD.getDate()}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`font-display text-sm font-extrabold uppercase tracking-tight ${isDone ? "line-through text-muted-foreground" : "text-ink"}`}>
                              {ev.title}
                            </h4>
                            <span
                              className={`label-mono text-[9px] px-2 py-0.5 border ${
                                isDone
                                  ? "border-lime bg-lime/20 text-lime-foreground"
                                  : isMeet
                                  ? "border-violet bg-violet/10 text-violet"
                                  : "border-lime bg-lime/10 text-lime-foreground"
                              }`}
                            >
                              {isDone ? "✓ Completed" : isMeet ? "Google Meet" : "Phone Call"}
                            </span>
                            {ev.reminder_minutes > 0 && (
                              <span className="label-mono text-[9px] px-1.5 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-600 flex items-center gap-1">
                                <Bell className="w-2.5 h-2.5" />
                                {ev.reminder_minutes}m reminder
                              </span>
                            )}
                          </div>

                          <p className="font-mono text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>Customer: <strong className="text-ink">{ev.customer_name}</strong></span>
                            {ev.company_name && <span>• {ev.company_name}</span>}
                            {ev.customer_phone && <span>• {ev.customer_phone}</span>}
                          </p>

                          <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-violet" />
                              {formatTimeRange(ev.start_time, ev.end_time)}
                            </span>
                            {ev.call_id && (
                              <span className="text-violet flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-lime-700 dark:text-lime" />
                                Booked from AI Voice Call
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {ev.meet_url && (
                          <a
                            href={ev.meet_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 border border-violet bg-violet text-white px-3 py-1.5 label-mono text-xs font-bold hover:bg-violet/90 transition-all shadow-sm"
                          >
                            <Video className="w-3.5 h-3.5 text-lime" />
                            <span>Join Meet</span>
                          </a>
                        )}

                        <button
                          onClick={(e) => handleMarkDone(e, ev.id, ev.status)}
                          className={`flex items-center gap-1 px-3 py-1.5 label-mono text-xs font-bold border transition-all ${
                            isDone
                              ? "border-lime bg-lime text-lime-foreground"
                              : "border-ink bg-paper text-ink hover:bg-secondary"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isDone ? "Done" : "Mark Done"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* ─────────────────── EVENT DETAIL MODAL ─────────────────── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border border-ink bg-card max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink hover:bg-secondary"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div>
              <span className="label-mono text-violet text-[10px] uppercase tracking-wider">
                {selectedEvent.meeting_type === "google_meet" ? "Google Meet Video Call" : "Scheduled Phone Call"}
              </span>
              <h3 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-tight mt-1 text-ink">
                {selectedEvent.title}
              </h3>
            </div>

            {/* Details Grid */}
            <div className="divide-y divide-ink/10 border border-ink/20 bg-paper text-xs font-mono">
              <div className="p-3 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-violet" /> Customer
                </span>
                <span className="font-bold text-ink">{selectedEvent.customer_name}</span>
              </div>
              {selectedEvent.company_name && (
                <div className="p-3 flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-violet" /> Organization
                  </span>
                  <span className="text-ink">{selectedEvent.company_name}</span>
                </div>
              )}
              {selectedEvent.customer_email && (
                <div className="p-3 flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-violet" /> Email
                  </span>
                  <span className="text-ink">{selectedEvent.customer_email}</span>
                </div>
              )}
              {selectedEvent.customer_phone && (
                <div className="p-3 flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-lime-700 dark:text-lime" /> Phone
                  </span>
                  <span className="text-ink">{selectedEvent.customer_phone}</span>
                </div>
              )}
              <div className="p-3 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-violet" /> Scheduled Time
                </span>
                <span className="text-ink font-bold">
                  {new Date(selectedEvent.start_time).toLocaleDateString()} ({formatTimeRange(selectedEvent.start_time, selectedEvent.end_time)})
                </span>
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-500" /> Google Reminder
                </span>
                <span className="text-amber-600 font-bold">
                  {selectedEvent.reminder_minutes} minutes before
                </span>
              </div>
            </div>

            {/* Description / Agenda */}
            {selectedEvent.description && (
              <div className="space-y-1">
                <span className="label-mono text-muted-foreground text-[10px]">Meeting Agenda & Notes</span>
                <p className="font-mono text-xs bg-paper border border-ink/20 p-3 text-ink leading-relaxed">
                  {selectedEvent.description}
                </p>
              </div>
            )}

            {/* Meet Link */}
            {selectedEvent.meet_url && (
              <div className="border border-violet/40 bg-violet/10 p-3 flex items-center justify-between">
                <div className="truncate pr-2">
                  <span className="label-mono text-[9px] text-violet block uppercase">Google Meet Room</span>
                  <span className="font-mono text-xs text-ink truncate block font-bold">
                    {selectedEvent.meet_url}
                  </span>
                </div>
                <a
                  href={selectedEvent.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 bg-violet text-white px-3 py-1.5 label-mono text-xs font-bold hover:bg-violet/90 shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Join</span>
                </a>
              </div>
            )}

            {/* Bottom Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-ink/20">
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="flex items-center gap-1 text-xs font-mono text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleMarkDone(e, selectedEvent.id, selectedEvent.status)}
                  className={`flex items-center gap-1.5 px-4 py-2 label-mono text-xs font-bold border transition-all ${
                    selectedEvent.status === "completed"
                      ? "border-lime bg-lime text-lime-foreground"
                      : "border-ink bg-ink text-paper hover:bg-violet hover:border-violet"
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${selectedEvent.status === "completed" ? "text-lime-foreground" : "text-paper"}`} />
                  <span>{selectedEvent.status === "completed" ? "Done (Completed)" : "Mark Done"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── SCHEDULE MEETING MODAL ─────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="border border-ink bg-card max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink hover:bg-secondary"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="label-mono text-violet text-[10px] uppercase">Google Calendar Integration</span>
              <h3 className="font-display text-lg sm:text-xl font-extrabold uppercase tracking-tight text-ink mt-0.5">
                Schedule Meeting or Call
              </h3>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="label-mono text-muted-foreground block mb-1">Customer / Lead Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Shah"
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Customer Email</label>
                  <input
                    type="email"
                    placeholder="ramesh@company.com"
                    value={formCustomerEmail}
                    onChange={(e) => setFormCustomerEmail(e.target.value)}
                    className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
                  />
                </div>
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
                  />
                </div>
              </div>

              <div>
                <label className="label-mono text-muted-foreground block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vyepari X Platform Walkthrough & Pricing"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full border border-ink/30 bg-paper px-2 py-2 text-ink focus:outline-none focus:border-violet"
                  />
                </div>
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full border border-ink/30 bg-paper px-2 py-2 text-ink focus:outline-none focus:border-violet"
                  />
                </div>
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Duration</label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="w-full border border-ink/30 bg-paper px-2 py-2 text-ink focus:outline-none focus:border-violet"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Meeting Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full border border-ink/30 bg-paper px-2 py-2 text-ink focus:outline-none focus:border-violet"
                  >
                    <option value="google_meet">Google Meet (Auto-generate)</option>
                    <option value="phone_call">Phone Call Follow-up</option>
                  </select>
                </div>
                <div>
                  <label className="label-mono text-muted-foreground block mb-1">Google Reminder</label>
                  <select
                    value={formReminder}
                    onChange={(e) => setFormReminder(Number(e.target.value))}
                    className="w-full border border-ink/30 bg-paper px-2 py-2 text-ink focus:outline-none focus:border-violet"
                  >
                    <option value={10}>10 mins before</option>
                    <option value={15}>15 mins before</option>
                    <option value={30}>30 mins before</option>
                    <option value={60}>1 hour before</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label-mono text-muted-foreground block mb-1">Agenda & Notes</label>
                <textarea
                  rows={2}
                  placeholder="Topics to discuss, customer interests..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full border border-ink/30 bg-paper px-3 py-2 text-ink placeholder-muted-foreground focus:outline-none focus:border-violet"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-ink/20 bg-paper text-ink label-mono text-xs hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 border border-ink bg-ink text-paper label-mono text-xs font-bold hover:bg-violet hover:border-violet transition-all flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 text-paper" />
                  <span>{submitting ? "Scheduling..." : "Schedule Meeting"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
