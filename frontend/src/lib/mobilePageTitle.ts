const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Сводка',
  '/staff': 'Следящие',
  '/leaders': 'Руководство',
  '/tasks': 'Задачи',
  '/checklist': 'Чеклист',
  '/question-banks': 'Банки вопросов',
  '/projects': 'Проекты',
  '/profile': 'Профиль',
  '/dev': 'Лог ошибок',
  '/dev/leadership': 'Флаги руководства',
}

export function getMobilePageTitle(pathname: string): string {
  if (pathname.startsWith('/staff/')) return 'Следящий'
  if (pathname.startsWith('/leaders/')) return 'Профиль'
  if (pathname.startsWith('/projects/')) return 'Проект'
  if (pathname.includes('/question-banks/') && pathname.endsWith('/review')) return 'Проверка'
  if (pathname.startsWith('/question-banks/')) return 'Банк вопросов'

  const exact = ROUTE_TITLES[pathname]
  if (exact) return exact

  for (const [path, title] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title
  }

  return 'State Love'
}
