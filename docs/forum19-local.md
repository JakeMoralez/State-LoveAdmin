# Arizona API 1.9: локальная совместимость

В соседнем State-LoveBot закреплён коммит
`f904e7fc03f67907f542658e3f7c3d13d3058263` (версия 1.9). Рабочий сервер не обновлялся.
Предыдущие `venv` и `.venv` не менялись. Проверочное окружение —
`data/forum19-check` в State-LoveAdmin, Python 3.14, Arizona API 1.9 установлен в его
собственный site-packages. Остальные зависимости тестов доступны через `.pth`
из существующего `.venv` бота на той же версии Python.

Проверяется реальная metadata установленного пакета, включая direct_url revision,
публичный `session`, отмена ожидающего запроса и штатная очередь. Очередь по
умолчанию: 2 секунды между запросами, максимум 30 за 60 секунд. Живую позицию
клиента не предоставляет и панель её не показывает.

`services/forum_diagnostics.py` бота собирает только безопасные поля. Полное время
проверки включает очередь; HTTP trace измеряет отдельно время самого запроса.
В API нет тел, headers, query, cookie значений, полного proxy URL или произвольного
текста SDK exceptions. `configure_logging()` не используется из-за затенения
параметра handler в этой версии SDK; установлен собственный whitelist-handler.
Сырые диагностические сообщения SDK не пересылаются в панель.

Таймауты бота: health 15 с, reconnect / apply cookies 35 с, sync judges 75 с.
Внешний клиент панели сохраняет 20 / 45 / 90 с. Таймаут отменяет и дожидается
пробной операции, закрывает её candidate session, не отменяет общую очередь.
Сохранение cookies и переключение сессии синхронны; если таймаут попал уже в
закрытие предыдущей сессии, committed-результат остаётся успешным. Ошибка
транспорта панели показывает неизвестный результат, а не ложное «не применены».
Синхронизация судей при таймауте явно предупреждает о возможном частичном результате.

Локальные команды (из State-LoveAdmin, в PowerShell):

```powershell
$env:PYTHONPATH = (Resolve-Path ../State-LoveBot).Path
data/forum19-check/Scripts/python.exe -X utf8 -m unittest discover -s ../State-LoveBot/tests -p test_forum_session.py
data/forum19-check/Scripts/python.exe -X utf8 -m unittest discover -s ../State-LoveBot/tests -p test_forum_proxy_check.py
data/forum19-check/Scripts/python.exe -X utf8 -m unittest discover -s ../State-LoveBot/tests -p test_forum_pin_state.py
data/forum19-check/Scripts/python.exe -X utf8 backend/scripts/test_forum19_compat.py
```

Тесты используют поддельные сессии / локальные HTTP-серверы. Свежие реальные cookies
и подключение к рабочему форуму не использовались. Устранение исходного 401 этими
проверками не подтверждается: для этого нужен отдельный успешный `/account/`
и определение аккаунта с сервера бота.
