/** Матрица доступов к страницам портала — для ревью. */

export interface PageAccessRow {
  section: string
  page: string
  path: string
  portal: string
  sphere: string
  actions: string
}

export const PAGE_ACCESS_ROWS: PageAccessRow[] = [
  {
    section: 'Обзор',
    page: 'Сводка',
    path: '/dashboard',
    portal: 'ПГС (1+)',
    sphere: '—',
    actions: 'Просмотр сводки',
  },
  {
    section: 'Обзор',
    page: 'Доступы',
    path: '/access',
    portal: 'Разработчик (11)',
    sphere: '—',
    actions: 'Таблица правил доступа (только разработчик)',
  },
  {
    section: 'Разработка',
    page: 'Настройки',
    path: '/dev/settings',
    portal: 'Разработчик (11)',
    sphere: '—',
    actions: 'Беседы, справочники назначения, статус бота',
  },
  {
    section: 'Разработка',
    page: 'Флаги руководства',
    path: '/dev/leadership',
    portal: 'Разработчик (11)',
    sphere: '—',
    actions: 'is_leader в реестре руководства',
  },
  {
    section: 'Разработка',
    page: 'Лог ошибок',
    path: '/dev',
    portal: 'Разработчик (11)',
    sphere: '—',
    actions: 'Клиентские и серверные ошибки панели',
  },
  {
    section: 'Команда',
    page: 'Следящие',
    path: '/staff',
    portal: 'ПГС (1+)',
    sphere: '—',
    actions: 'Просмотр реестра; редактирование чужих — по staff_permissions',
  },
  {
    section: 'Команда',
    page: 'Руководители',
    path: '/leaders',
    portal: 'ПГС (1+)',
    sphere: '—',
    actions: 'Просмотр — ПГС (1+); правка — Следящий (2+), не свой профиль. Судьи в том же реестре, сфера ЦА.',
  },
  {
    section: 'Работа',
    page: 'Академия',
    path: '/academy',
    portal: 'ПГС (1+)',
    sphere: '—',
    actions: 'Академик — свои задания и сдача; наставник — очередь проверки; ЗГС+ — состав, выпуск, резерв; зачисление — Следящий структуры (5+)',
  },
  {
    section: 'Работа',
    page: 'Задачи',
    path: '/tasks',
    portal: 'ПГС (1+)',
    sphere: 'Назначенные; ЗГС/ГС сфер (+Гос); Гос./Нелег./Сервер — все операционные',
    actions: 'Создание/удаление: ЗГС (3+) или lead проекта',
  },
  {
    section: 'Работа',
    page: 'Чеклист',
    path: '/checklist',
    portal: 'ПГС (1+)',
    sphere: 'Назначенные; ЗГС/ГС сфер (+Гос); Гос./Нелег./Сервер — все операционные',
    actions: 'Чужие ячейки и настройки: ЗГС (3+)',
  },
  {
    section: 'Работа',
    page: 'Проекты',
    path: '/projects',
    portal: 'ПГС (1+)',
    sphere: 'Назначенные; ЗГС/ГС сфер (+Гос); Гос./Нелег./Сервер — все операционные',
    actions: 'Создание: куратор (8+) или owner',
  },
  {
    section: 'Работа',
    page: 'Банки вопросов',
    path: '/question-banks',
    portal: 'ПГС (1+)',
    sphere: 'Назначенные; ЗГС/ГС сфер (+Гос); Гос./Нелег./Сервер — все операционные',
    actions: 'Добавление — min_submit_level банка; модерация — min_approve_level',
  },
  {
    section: 'Команда',
    page: 'Назначить',
    path: '/assign',
    portal: 'Следящий (2+)',
    sphere: '—',
    actions: 'Судья и конгресс — Следящий (2+); следящий — Следящий структуры (5+)',
  },
  {
    section: 'Форум',
    page: 'Список судей',
    path: '/forum/judge-list',
    portal: 'ЗГС ГОС (6+)',
    sphere: '—',
    actions: 'BBCode-шаблон списка судей на форуме',
  },
  {
    section: 'Форум',
    page: 'Форматирование',
    path: '/forum/formatting',
    portal: 'ЗГС ГОС (6+)',
    sphere: '—',
    actions: 'Черновик закона → BBCode для тем на форуме',
  },
]
