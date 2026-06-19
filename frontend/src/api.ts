import type { TaskLabel } from './lib/labels'
import { reportClientError } from './lib/errorReporter'

const API = '/api'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      /* ignore */
    }
    if (res.status >= 500) {
      reportClientError({
        message: typeof detail === 'string' ? detail : 'API error',
        source: 'api',
        url: `${API}${path}`,
        context: { status: res.status, method: init?.method ?? 'GET' },
      })
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  authConfig: () => request<AuthConfig>('/auth/config'),
  devLogin: (body?: { access_level: number; has_ca_access: boolean; vk_id?: number }) => {
    const payload = body ?? { access_level: 3, has_ca_access: true }
    const q = new URLSearchParams({
      json: 'true',
      access_level: String(payload.access_level),
      has_ca_access: String(payload.has_ca_access),
    })
    if (payload.vk_id != null) q.set('vk_id', String(payload.vk_id))
    return request<{ ok: boolean; redirect: string }>(`/auth/dev-login?${q}`)
  },
  me: () => request<UserProfile>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  dashboard: () => request<DashboardSummary>('/dashboard/summary'),
  staff: (params?: { q?: string; level?: number }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.level != null) q.set('level', String(params.level))
    const s = q.toString()
    return request<StaffResponse>(`/staff${s ? `?${s}` : ''}`)
  },
  staffMember: (vkId: number) => request<StaffMemberDetail>(`/staff/${vkId}`),
  updateStaffMember: (vkId: number, body: StaffMemberUpdateBody) =>
    request<StaffMemberUpdateResponse>(`/staff/${vkId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  leaders: (params?: { q?: string }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    const s = q.toString()
    return request<LeadersResponse>(`/staff/leaders${s ? `?${s}` : ''}`)
  },
  leaderMember: (vkId: number) => request<LeaderMemberDetail>(`/staff/leaders/${vkId}`),
  updateLeader: (vkId: number, body: LeaderMemberUpdateBody) =>
    request<LeaderMemberUpdateResponse>(`/staff/leaders/${vkId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  devLeadership: (params?: { q?: string }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    const s = q.toString()
    return request<DevLeadershipResponse>(`/dev/leadership${s ? `?${s}` : ''}`)
  },
  updateDevLeadership: (vkId: number, data: { is_leader: boolean; faction?: string }) =>
    request<{ ok: boolean; is_leader: boolean }>(`/dev/leadership/${vkId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  staffExportUrl: () => `${API}/staff/export.csv`,
  updateStaffNote: (vkId: number, note: string) =>
    request(`/staff/${vkId}/note`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),
  updateStaffDiscord: (vkId: number, discord_id: string | null) =>
    request<{ ok: boolean; discord_id: string | null }>(`/staff/${vkId}/discord`, {
      method: 'PATCH',
      body: JSON.stringify({ discord_id }),
    }),
  projects: () => request<{ projects: Project[] }>('/projects'),
  project: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (data: { title: string; description?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  tasks: (params?: {
    view?: string
    mine?: boolean
    project_id?: number
    assignee_vk_id?: number
    priority?: string
    status?: string
  }) => {
    const q = new URLSearchParams()
    if (params?.view) q.set('view', params.view)
    if (params?.mine) q.set('mine', 'true')
    if (params?.project_id != null) q.set('project_id', String(params.project_id))
    if (params?.assignee_vk_id != null) q.set('assignee_vk_id', String(params.assignee_vk_id))
    if (params?.priority) q.set('priority', params.priority)
    if (params?.status) q.set('status', params.status)
    const s = q.toString()
    return request<TaskListResponse>(`/tasks${s ? `?${s}` : ''}`)
  },
  task: (id: number) => request<TaskDetail>(`/tasks/${id}`),
  createTask: (data: Partial<Task>) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: number, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: number) => request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  deleteAttachment: (taskId: number, attachmentId: number) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  addComment: (taskId: number, body: string) =>
    request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  addAttachment: (taskId: number, url: string, title?: string) =>
    request(`/tasks/${taskId}/attachments`, {
      method: 'POST',
      body: JSON.stringify({ url, title: title || '' }),
    }),
  uploadFile: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API}/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail || detail
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail)
    }
    return res.json() as Promise<{ url: string; filename: string; size: number }>
  },
  uploadGallery: async (files: File[], galleryId?: string) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    const q = galleryId ? `?gallery_id=${encodeURIComponent(galleryId)}` : ''
    const res = await fetch(`${API}/uploads/gallery${q}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      let detail = 'Ошибка загрузки альбома'
      try {
        const body = await res.json()
        detail = body.detail || detail
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail)
    }
    return res.json() as Promise<{
      gallery_id: string
      url: string
      count: number
      images: string[]
    }>
  },
  checklist: (week: string) => request<ChecklistResponse>(`/checklist?week=${encodeURIComponent(week)}`),
  updateChecklistCell: (params: {
    week: string
    day_offset: number
    task_slug: string
    member_vk_id: number
    proof_urls?: string[]
    proof_url?: string | null
    proof_note?: string
    proof_video_url?: string | null
  }) => {
    const q = new URLSearchParams({
      week: params.week,
      day_offset: String(params.day_offset),
      task_slug: params.task_slug,
      member_vk_id: String(params.member_vk_id),
    })
    return request(`/checklist/cells?${q}`, {
      method: 'PATCH',
      body: JSON.stringify({
        proof_urls: params.proof_urls ?? [],
        proof_url: params.proof_url ?? null,
        proof_note: params.proof_note ?? '',
        proof_video_url: params.proof_video_url ?? null,
      }),
    })
  },
  generateChecklistTasks: (week: string) =>
    request<{ ok: boolean; created: number }>(`/checklist/generate-tasks?week=${encodeURIComponent(week)}`, {
      method: 'POST',
    }),
  checklistSettings: () => request<ChecklistSettings>('/checklist/settings'),
  updateChecklistTasks: (data: {
    tasks: { slug: string; title: string; is_header: boolean; days_of_week: number[] }[]
  }) => request('/checklist/tasks', { method: 'PUT', body: JSON.stringify(data) }),
  updateChecklistMembers: (data: { vk_ids: number[] }) =>
    request('/checklist/members', { method: 'PUT', body: JSON.stringify(data) }),
  checklistMembersOnlyMe: () =>
    request<{ ok: boolean; vk_id?: number }>('/checklist/members/only-me', {
      method: 'PUT',
      body: JSON.stringify({}),
    }),
  devErrors: (params?: { limit?: number; offset?: number; level?: string; source?: string }) => {
    const q = new URLSearchParams()
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.offset) q.set('offset', String(params.offset))
    if (params?.level) q.set('level', params.level)
    if (params?.source) q.set('source', params.source)
    const suffix = q.toString() ? `?${q}` : ''
    return request<DevErrorListResponse>(`/dev/errors${suffix}`)
  },
  clearDevErrors: () => request<{ ok: boolean; deleted: number }>('/dev/errors', { method: 'DELETE' }),
}

export interface AuthConfig {
  dev_mode: boolean
  dev_skip_ca: boolean
  dev_vk_id?: number | null
  discord_configured: boolean
  bot_login_enabled: boolean
  vk_group_id?: number | null
  access_levels?: { value: number; label: string }[]
}

export interface UserProfile {
  vk_id: number
  nickname: string | null
  username: string | null
  avatar_url?: string | null
  access_level: number
  access_level_name: string
  has_ca_access: boolean
  panel_role: string
  server_id: number
  dev_persona?: boolean
  can_dev_panel?: boolean
  can_manage_discord_links?: boolean
  can_manage_leaders?: boolean
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
}

export interface DevErrorItem {
  id: number
  level: string
  source: string
  message: string
  stack: string
  url: string
  method: string
  user_agent: string
  user_vk_id: number | null
  context: Record<string, unknown> | null
  created_at: string | null
}

export interface DevErrorListResponse {
  total: number
  items: DevErrorItem[]
}

export interface DashboardSummary {
  my_open_tasks: number
  overdue_tasks: number
  active_projects: number
  staff_count: number
  recent_tasks: { id: number; title: string; status: string; updated_at: string }[]
}

export interface StaffMember {
  vk_id: number
  nickname: string
  display_name?: string
  avatar_url?: string
  username: string | null
  access_level: number
  access_level_name: string
  access_role_title?: string
  sphere?: string
  badges: string[]
  has_ca_access: boolean
  ca_source: string | null
  granted_by: number | null
  granted_at: string | null
  note: string
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
}

export interface StaffMemberPermissions {
  edit_nickname: boolean
  edit_access_level: boolean
  edit_ca_access: boolean
  edit_sphere: boolean
  edit_discord: boolean
  revoke_staff_access: boolean
  max_access_level: number
}

export interface StaffMemberDetail extends StaffMember {
  server_id?: number
  panel_role?: string
  permissions: StaffMemberPermissions
}

export interface StaffMemberUpdateBody {
  nickname?: string | null
  access_level?: number
  has_ca_access?: boolean
  note?: string | null
  discord_id?: string | null
  revoke_staff_access?: boolean
}

export type StaffMemberUpdateResponse = StaffMemberDetail & {
  ok?: boolean
  removed?: boolean
  vk_id?: number
}

export interface StaffResponse {
  total: number
  groups: { level: number; members: StaffMember[] }[]
  members: StaffMember[]
}

export interface LeaderMember {
  vk_id: number
  nickname: string
  display_name?: string
  avatar_url?: string
  username?: string | null
  position?: string | null
  note?: string | null
  faction?: string | null
  is_leader_flag?: boolean
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
  badges?: string[]
}

export interface LeaderMemberPermissions {
  edit_nickname: boolean
  edit_position: boolean
  edit_note: boolean
  edit_discord: boolean
  clear_nickname: boolean
  remove_from_registry: boolean
}

export interface LeaderMemberDetail extends LeaderMember {
  server_id?: number
  permissions: LeaderMemberPermissions
}

export interface LeaderMemberUpdateBody {
  nickname?: string | null
  position?: string | null
  note?: string | null
  discord_id?: string | null
  clear_nickname?: boolean
  remove_from_registry?: boolean
}

export type LeaderMemberUpdateResponse = LeaderMemberDetail & {
  removed?: boolean
  ok?: boolean
}

export interface LeadersResponse {
  server_id: number
  peer_id: number | null
  total: number
  members: LeaderMember[]
  warning?: string | null
}

export interface LeadershipCandidate {
  vk_id: number
  nickname: string
  display_name?: string
  avatar_url?: string
  is_leader: boolean
  position?: string | null
  note?: string | null
  faction?: string | null
}

export interface DevLeadershipResponse {
  server_id: number
  total: number
  leaders_count: number
  members: LeadershipCandidate[]
}

export interface Project {
  id: number
  title: string
  description: string
  status: string
  owner_vk_id: number
  task_count?: number
}

export interface ProjectDetail extends Project {
  tasks: { id: number; title: string; status: string; priority: string }[]
}

export interface Task {
  id?: number
  title: string
  description?: string
  status?: string
  priority?: string
  task_type?: string
  assignee_vk_id?: number | null
  assignee_vk_ids?: number[]
  assignee_names?: string[]
  reporter_vk_id?: number
  project_id?: number | null
  project_title?: string | null
  assignee_name?: string | null
  reporter_name?: string | null
  due_date?: string | null
  labels?: TaskLabel[]
  comment_count?: number
  attachment_count?: number
  last_comment_author_vk_id?: number | null
  last_comment_author_name?: string | null
  last_comment_author_avatar_url?: string | null
  created_at?: string
  updated_at?: string
}

export interface TaskDetail extends Task {
  id: number
  comments: { id: number; author_vk_id: number; author_name?: string; body: string; created_at: string }[]
  attachments: { id: number; url: string; title: string; is_image?: boolean }[]
}

export interface ChecklistResponse {
  week_start: string
  week_end: string
  members: {
    vk_id: number
    display_name: string
    access_level?: number
    access_level_name?: string
    team_eligible?: boolean
    personal_column?: boolean
  }[]
  tasks?: { slug: string; title: string; is_header: boolean }[]
  rows: {
    day_offset: number
    day_date: string
    day_label: string
    task_slug: string
    task_title: string
    is_header: boolean
    cells: {
      id: number | null
      member_vk_id: number
      member_name: string
      proof_urls?: string[]
      proof_url: string | null
      proof_note: string
      proof_video_url?: string | null
      proof_gallery?: boolean
      proof_gallery_url?: string | null
      proof_image_count?: number
      done: boolean
      can_edit?: boolean
    }[]
  }[]
  current_vk_id?: number
  can_edit_all?: boolean
  is_locked?: boolean
}

export interface ChecklistSettings {
  tasks: {
    slug: string
    title: string
    is_header: boolean
    sort_order: number
    days_of_week: number[]
  }[]
  members: { vk_id: number; display_name: string; access_level: number; access_level_name: string }[]
  candidates: {
    vk_id: number
    display_name: string
    access_level: number
    access_level_name: string
    in_checklist: boolean
    is_self?: boolean
  }[]
  current_vk_id?: number
  can_manage?: boolean
  can_edit_all?: boolean
  template_note?: string
}

export interface TaskListResponse {
  view: string
  tasks?: TaskDetail[]
  columns?: Record<string, TaskDetail[]>
}

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Бэклог',
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Готово',
  cancelled: 'Отменено',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочно',
}

export const KANBAN_COLUMN_LABELS: Record<string, string> = {
  idea: 'Идея',
  in_progress: 'В работе',
  discussion: 'На обсуждении',
  accepted: 'Принято',
  deferred: 'Отложено',
  rejected: 'Отклонено',
}
