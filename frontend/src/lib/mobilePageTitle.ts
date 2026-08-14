const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Сводка',
  '/access': 'Доступы',
  '/staff': 'Следящие',
  '/leaders': 'Руководство',
  '/tasks': 'Задачи',
  '/checklist': 'Чеклист',
  '/question-banks': 'Банки вопросов',
  '/assign': 'Назначить',
  '/activity': 'Журнал действий',
  '/forum/judge-list': 'Список судей',
  '/forum/formatting': 'Форматирование',
  '/projects': 'Проекты',
  '/profile': 'Кабинет',
  '/dev': 'Лог ошибок',
  '/dev/leadership': 'Флаги руководства',
  '/dev/cases': 'Кейсы',
}

export function getMobilePageTitle(pathname: string): string {
  if (pathname.startsWith('/staff/')) return 'Следящий'
  if (pathname.startsWith('/leaders/')) return 'Профиль'
  if (pathname.startsWith('/projects/')) return 'Проект'
  if (pathname.includes('/question-banks/') && pathname.endsWith('/review')) return 'Проверка'
  if (pathname.startsWith('/question-banks/')) return 'Банк вопросов'
  if (pathname.startsWith('/dev/cases/') && pathname.endsWith('/spin')) return 'Прокрутка кейса'
  if (pathname.startsWith('/dev/cases/')) return 'Кейс'

  const exact = ROUTE_TITLES[pathname]
  if (exact) return exact

  for (const [path, title] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title
  }

  return 'State Love'
}
