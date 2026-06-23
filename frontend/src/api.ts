import type { TaskLabel } from './lib/labels'
import { reportClientError } from './lib/errorReporter'

const API = '/api'

function withSphere(path: string, sphere?: string) {
  if (!sphere) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}sphere=${encodeURIComponent(sphere)}`
}

function withSpheres(path: string, spheres?: string[]) {
  if (!spheres?.length) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${spheres.map((s) => `sphere=${encodeURIComponent(s)}`).join('&')}`
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function formatApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg)
        return JSON.stringify(item)
      })
      .join('; ')
  }
  if (detail && typeof detail === 'object' && 'msg' in detail) return String((detail as { msg: unknown }).msg)
  return String(detail)
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
      detail = body.detail != null ? formatApiDetail(body.detail) : detail
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
  devLogin: (body: { access_level: number; vk_id?: number; spheres: string[] }) =>
    request<{ ok: boolean; redirect: string }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  assignStaff: (body: StaffAssignBody) =>
    request<StaffMemberDetail>('/staff/assign', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
  projects: (spheres?: string[]) =>
    request<{ projects: Project[]; permissions?: { can_create: boolean } }>(withSpheres('/projects', spheres)),
  project: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (data: { title: string; description?: string }, sphere?: string) =>
    request<Project>(withSphere('/projects', sphere), { method: 'POST', body: JSON.stringify(data) }),
  tasks: (params?: {
    view?: string
    mine?: boolean
    project_id?: number
    assignee_vk_id?: number
    priority?: string
    status?: string
    sphere?: string
    spheres?: string[]
  }) => {
    const q = new URLSearchParams()
    if (params?.view) q.set('view', params.view)
    if (params?.mine) q.set('mine', 'true')
    if (params?.project_id != null) q.set('project_id', String(params.project_id))
    if (params?.assignee_vk_id != null) q.set('assignee_vk_id', String(params.assignee_vk_id))
    if (params?.priority) q.set('priority', params.priority)
    if (params?.status) q.set('status', params.status)
    if (params?.spheres?.length) {
      for (const s of params.spheres) q.append('sphere', s)
    } else if (params?.sphere) {
      q.set('sphere', params.sphere)
    }
    const s = q.toString()
    return request<TaskListResponse>(`/tasks${s ? `?${s}` : ''}`)
  },
  task: (id: number) => request<TaskDetail>(`/tasks/${id}`),
  createTask: (data: Partial<Task>, sphere?: string) =>
    request<Task>(withSphere('/tasks', sphere), { method: 'POST', body: JSON.stringify(data) }),
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
  checklist: (week: string, sphere?: string) =>
    request<ChecklistResponse>(withSphere(`/checklist?week=${encodeURIComponent(week)}`, sphere)),
  updateChecklistCell: (params: {
    week: string
    day_offset: number
    task_slug: string
    member_vk_id: number
    sphere?: string
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
    if (params.sphere) q.set('sphere', params.sphere)
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
  generateChecklistTasks: (week: string, sphere?: string) =>
    request<{ ok: boolean; created: number }>(
      withSphere(`/checklist/generate-tasks?week=${encodeURIComponent(week)}`, sphere),
      { method: 'POST' },
    ),
  checklistSettings: (sphere?: string) => request<ChecklistSettings>(withSphere('/checklist/settings', sphere)),
  updateChecklistTasks: (
    data: { tasks: { slug: string; title: string; is_header: boolean; days_of_week: number[] }[] },
    sphere?: string,
  ) =>
    request(withSphere('/checklist/tasks', sphere), { method: 'PUT', body: JSON.stringify(data) }),
  updateChecklistMembers: (data: { vk_ids: number[] }, sphere?: string) =>
    request(withSphere('/checklist/members', sphere), { method: 'PUT', body: JSON.stringify(data) }),
  checklistMembersOnlyMe: (sphere?: string) =>
    request<{ ok: boolean; vk_id?: number }>(withSphere('/checklist/members/only-me', sphere), {
      method: 'PUT',
      body: JSON.stringify({}),
    }),
  questionBankMeta: () => request<QuestionBankMeta>('/question-banks/meta'),
  questionBanks: (params?: { q?: string; sphere?: string; spheres?: string[] }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.spheres?.length) {
      for (const s of params.spheres) q.append('sphere', s)
    } else if (params?.sphere) {
      q.set('sphere', params.sphere)
    }
    const s = q.toString()
    return request<{ banks: QuestionBank[]; permissions: QuestionBankPermissions }>(
      `/question-banks${s ? `?${s}` : ''}`,
    )
  },
  questionBank: (id: number, params?: { status?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    const s = q.toString()
    return request<QuestionBankDetail>(`/question-banks/${id}${s ? `?${s}` : ''}`)
  },
  createQuestionBank: (body: QuestionBankBody) =>
    request<QuestionBank>('/question-banks', { method: 'POST', body: JSON.stringify(body) }),
  updateQuestionBank: (id: number, body: QuestionBankBody) =>
    request<QuestionBank>(`/question-banks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuestionBank: (id: number) =>
    request<{ ok: boolean }>(`/question-banks/${id}`, { method: 'DELETE' }),
  createQuestionBankItem: (bankId: number, body: QuestionBankItemBody, direct?: boolean) => {
    const q = direct ? '?direct=true' : ''
    return request<QuestionBankItem>(`/question-banks/${bankId}/questions${q}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  updateQuestionBankItem: (bankId: number, itemId: number, body: Partial<QuestionBankItemBody>) =>
    request<QuestionBankItem>(`/question-banks/${bankId}/questions/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteQuestionBankItem: (bankId: number, itemId: number) =>
    request<{ ok: boolean }>(`/question-banks/${bankId}/questions/${itemId}`, { method: 'DELETE' }),
  submitQuestionBankItem: (bankId: number, itemId: number) =>
    request<QuestionBankItem>(`/question-banks/${bankId}/questions/${itemId}/submit`, { method: 'POST' }),
  reviewQuestionBankItem: (bankId: number, itemId: number, body: QuestionBankReviewBody) =>
    request<QuestionBankItem>(`/question-banks/${bankId}/questions/${itemId}/review`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  questionBankItemHistory: (bankId: number, itemId: number) =>
    request<{ events: QuestionBankItemEvent[] }>(`/question-banks/${bankId}/questions/${itemId}/history`),
  questionBankPendingReview: () =>
    request<{ items: QuestionBankPendingItem[]; permissions: QuestionBankPermissions }>(
      '/question-banks/pending-review',
    ),
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
  judgeForumListServers: () =>
    request<{ servers: JudgeForumServer[] }>('/forum/judge-list/servers'),
  judgeForumListSettings: (serverId: number) =>
    request<JudgeForumListSettings>(`/forum/judge-list?server_id=${serverId}`),
  saveJudgeForumListSettings: (body: JudgeForumListSaveBody) =>
    request<JudgeForumListSettings>('/forum/judge-list', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  previewJudgeForumList: (body: JudgeForumListPreviewBody) =>
    request<{ rendered: string }>('/forum/judge-list/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  validateJudgeForumThread: (body: JudgeForumValidateThreadBody) =>
    request<JudgeForumValidateThreadResult>('/forum/judge-list/validate-thread', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignOptions: () => request<AssignOptionsResponse>('/assign/options'),
  assignRole: (body: AssignBody) =>
    request<AssignResult>('/assign', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activityLog: (params?: { q?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const s = q.toString()
    return request<ActivityLogResponse>(`/activity${s ? `?${s}` : ''}`)
  },
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
  bot_nickname?: string | null
  username: string | null
  avatar_url?: string | null
  access_level: number
  access_level_name: string
  access_role_title?: string
  has_ca_access: boolean
  panel_role: string
  server_id: number
  sphere?: string
  spheres?: string[]
  dev_persona?: boolean
  can_dev_panel?: boolean
  can_manage_discord_links?: boolean
  can_manage_leaders?: boolean
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
  work_spheres?: WorkSphere[]
}

export interface WorkSphere {
  id: string
  label: string
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
  bot_nickname?: string | null
  display_name?: string
  avatar_url?: string
  username: string | null
  access_level: number
  access_level_name: string
  access_role_title?: string
  sphere?: string
  spheres?: string[]
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
  edit_spheres: boolean
  edit_sphere: boolean
  edit_discord: boolean
  revoke_staff_access: boolean
  assign_staff?: boolean
  max_access_level: number
  grantable_spheres?: string[]
  locked_spheres?: string[]
  unrestricted_sphere_edit?: boolean
}

export interface StaffAssignBody {
  vk_id: number
  discord_id?: string | null
  nickname: string
  nickname_tag?: string | null
  access_level: number
  spheres: string[]
}

export interface StaffMemberDetail extends StaffMember {
  server_id?: number
  panel_role?: string
  permissions: StaffMemberPermissions
}

export interface StaffMemberUpdateBody {
  nickname?: string | null
  nickname_tag?: string | null
  access_level?: number
  has_ca_access?: boolean
  spheres?: string[]
  note?: string | null
  discord_id?: string | null
  revoke_staff_access?: boolean
  resync_nickname?: boolean
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
  bot_nickname?: string | null
  display_name?: string
  avatar_url?: string
  username?: string | null
  position?: string | null
  note?: string | null
  faction?: string | null
  is_leader_flag?: boolean
  is_judge?: boolean
  discord_id?: string | null
  discord_username?: string | null
  discord_display_name?: string | null
  badges?: string[]
}

export interface LeaderMemberPermissions {
  edit_nickname: boolean
  edit_forum_account: boolean
  edit_position: boolean
  edit_note: boolean
  edit_discord: boolean
  clear_nickname: boolean
  remove_from_registry: boolean
  manage_registry?: boolean
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
  forum_account?: string | null
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
  sphere?: string
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
  sphere?: string
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
    has_ca_access?: boolean
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

export interface QuestionBankPermissions {
  can_manage: boolean
  can_submit: boolean
  can_review: boolean
  can_direct_confirm: boolean
}

export interface QuestionBankMeta {
  permissions: QuestionBankPermissions
  status_labels: Record<string, string>
  difficulty_labels: Record<string, string>
  contributor_visibility_labels?: Record<string, string>
  contributor_visibility_modes?: { value: string; label: string }[]
  tag_suggestions: string[]
  access_levels: { value: number; label: string }[]
}

export interface QuestionBank {
  id: number
  sphere?: string
  title: string
  description: string
  emoji?: string
  min_submit_level: number
  min_approve_level: number
  contributor_visibility?: string
  contributor_visibility_label?: string
  min_submit_level_label?: string
  min_approve_level_label?: string
  question_count: number
  pending_count?: number
  sort_order: number
  is_active: boolean
  created_by_vk_id?: number
  created_at?: string
  updated_at?: string
  permissions?: QuestionBankPermissions
}

export interface QuestionBankBody {
  title: string
  description?: string
  emoji?: string
  sphere?: string
  min_submit_level?: number
  min_approve_level?: number
  contributor_visibility?: string
  sort_order?: number
  is_active?: boolean
}

export type QuestionBankItemStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'needs_revision'

export interface QuestionBankItem {
  id: number
  bank_id: number
  text: string
  correct_answer: string
  source: string
  answer_comment: string
  tags: string[]
  difficulty: number
  difficulty_label?: string
  status: QuestionBankItemStatus
  status_label?: string
  created_by_vk_id?: number
  author_name?: string
  reviewed_by_vk_id?: number | null
  reviewer_name?: string | null
  reviewed_at?: string | null
  review_note?: string
  created_at?: string
  updated_at?: string
}

export interface QuestionBankPendingItem extends QuestionBankItem {
  bank_title: string
}

export interface QuestionBankItemBody {
  text: string
  correct_answer?: string
  source?: string
  answer_comment?: string
  tags?: string[]
  difficulty?: number
}

export interface QuestionBankReviewBody extends Partial<QuestionBankItemBody> {
  action: 'approve' | 'reject' | 'needs_revision'
  review_note?: string
}

export interface QuestionBankDetail extends QuestionBank {
  questions: QuestionBankItem[]
  bank_totals?: { confirmed: number; pending_review: number } | null
  visibility_restricted?: boolean
}

export interface QuestionBankItemEvent {
  id: number
  action: string
  action_label: string
  actor_vk_id: number
  actor_display_name: string
  actor_role: string
  comment: string
  changes?: Record<string, { old: unknown; new: unknown }> | null
  created_at: string
  summary: string
}

export const QB_STATUS_LABELS: Record<QuestionBankItemStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  confirmed: 'Подтверждён',
  rejected: 'Отклонён',
  needs_revision: 'Требует доработки',
}

export interface JudgeForumServer {
  id: number
  name: string
  slug: string
  tag: string | null
  judge_forum_id: number | null
  judge_forum_url: string | null
}

export interface JudgeForumListSettings {
  server_id: number
  thread_id: number | null
  thread_url: string | null
  required_forum_id: number | null
  required_forum_url: string | null
  enabled: boolean
  body_template: string
  line_template: string
  empty_text: string
  updated_by_vk_id: number | null
  updated_at: string | null
  warning?: string | null
}

export interface JudgeForumListSaveBody {
  server_id: number
  thread_id?: number | null
  thread_url?: string
  enabled: boolean
  body_template: string
  line_template: string
  empty_text: string
}

export interface JudgeForumListPreviewBody {
  server_id: number
  body_template?: string
  line_template?: string
  empty_text?: string
}

export interface JudgeForumValidateThreadBody {
  server_id: number
  thread_id?: number | null
  thread_url?: string
}

export interface JudgeForumValidateThreadResult {
  valid: boolean | null
  skipped: boolean
  error?: string | null
  title?: string | null
  forum_name?: string | null
  category_id?: number | null
  required_forum_url: string
}

export type AssignRoleType = 'staff' | 'judge' | 'congress'

export interface AssignOptionsResponse {
  role_types: { id: AssignRoleType; label: string }[]
  judge_positions: string[]
  congress_roles: { id: 'speaker' | 'vice'; label: string }[]
}

export interface AssignBody {
  role_type: AssignRoleType
  vk_id: string
  discord_id?: string | null
  forum_account: string
  nickname: string
  access_level?: number
  spheres?: string[]
  nickname_tag?: string | null
  judge_position?: string
  congress_role?: 'speaker' | 'vice'
}

export interface AssignResult {
  role_type: AssignRoleType
  vk_id: number
  nickname: string
  forum_account: string
  position?: string
  access_level?: number
  congress_role?: 'speaker' | 'vice'
}

export interface ActivityLogItem {
  id: number
  action: string
  action_label: string
  entity_type: string
  entity_id: string
  actor_vk_id: number
  actor_name: string
  target_vk_id?: number | null
  target_name?: string | null
  message: string
  detail: Record<string, unknown>
  created_at: string
}

export interface ActivityLogResponse {
  total: number
  items: ActivityLogItem[]
  limit: number
  offset: number
}
