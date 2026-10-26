"""Pure normalization, explicit BBCode slots and legacy template conversion."""
from __future__ import annotations

import hashlib
import html
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

MSK = timezone(timedelta(hours=3))
MAX_TEMPLATE = 150_000
MAX_SLOT = 200
PERSON_FIELDS = {
    "nickname": "Никнейм", "rank_name": "Должность", "vk_id": "VK ID",
    "vk_url": "Ссылка VK", "vk_link": "VK — готовая BBCode-ссылка", "discord_id": "Discord ID",
    "post_date": "Дата назначения", "planned_end_date": "Плановое окончание срока",
    "term_days": "Срок, дней", "days_served": "Дней в должности", "online_7_days": "Онлайн за 7 дней",
    "points": "Баллы", "reprimands": "Выговоры", "unremovable_reprimands": "Неснимаемые выговоры",
    "ministerial_reprimands": "Министерские выговоры", "warnings": "Предупреждения",
    "post_reason": "Причина назначения",
}
ADMIN_FIELDS = {"nickname": "Никнейм", "role": "Должность", "spheres": "Сферы", "online_7_days": "Онлайн за 7 дней"}
FRACTION_FIELDS = {"name": "Название организации", "fraction_name": "Сокращение", "leader_count": "Руководителей", "deputy_count": "Заместителей"}
ROLE_LABELS = {"leaders": "Руководители", "deputies": "Заместители", "vice_governors": "Вице-губернатор"}
META_FIELDS = {"generated_at": "Время формирования (МСК)", "server_id": "Сервер внешнего API"}
TOKEN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
LEGACY = re.compile(r"PLACEHOLDER_(LEADER|DEPUTY|MINCNN)_([A-Z0-9_]+?)_(NICK|VK|DISCORD|DATEAPPOINTMENT|DATEWITHDRAWAL)", re.I)
LEGACY_CODES = {"GOV": 6, "LIC": 9, "CNN": 10, "RADIO_LS": 10, "RADIO_LV": 24, "RADIO_SF": 26,
                "FBI": 3, "LSPD": 1, "COUNTY": 2, "SFPD": 4, "LVPD": 23, "PRISON": 7,
                "ARMY_LS": 20, "ARMY_SF": 27, "HOSPITAL_LS": 5, "HOSPITAL_LV": 22,
                "HOSPITAL_SF": 8, "HOSPITAL_JEFF": 31, "INSURANCE": 29, "FIRE_DEPT": 32,
                "FIRE": 32, "HOSPITAL": 5, "DEFENSE": 20}


def clean(value) -> str:
    return " ".join(str(value).split())[:512] if value is not None else ""


def date_value(value) -> str:
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date().isoformat()
    except (ValueError, TypeError):
        return ""


def number(value, default=0) -> int:
    return value if type(value) is int else default


def person(raw: dict) -> dict:
    result = {field: clean(raw.get(field)) for field in PERSON_FIELDS if field != "vk_link"}
    result.update(leader_id=number(raw.get("leader_id")), rank=number(raw.get("rank")))
    for key in ("term_days", "points", "reprimands", "unremovable_reprimands", "ministerial_reprimands", "warnings"):
        result[key] = raw.get(key) if type(raw.get(key)) is int else None
    result["days_served"] = raw.get("days_served", raw.get("days_elapsed"))
    if type(result["days_served"]) is not int:
        result["days_served"] = None
    result["post_date"] = date_value(raw.get("post_date"))
    result["planned_end_date"] = ""
    if result["post_date"] and type(result["term_days"]) is int and 0 < result["term_days"] <= 36500:
        result["planned_end_date"] = (datetime.fromisoformat(result["post_date"]) + timedelta(days=result["term_days"])).date().isoformat()
    url = result["vk_url"]
    if not re.fullmatch(r"https://(?:www\.)?vk\.(?:ru|com)/[\w.-]+", url, re.ASCII):
        result["vk_url"] = f"https://vk.ru/id{result['vk_id']}" if re.fullmatch(r"[1-9]\d*", result["vk_id"]) else ""
    return result


def person_order(row: dict):
    return row.get("post_date") or "9999-12-31", row.get("leader_id", 0)


def normalize(sources: dict, external_server_id: int) -> dict:
    fractions, all_people = [], {}
    for raw in sources["fractions"]:
        fid = number(raw.get("fraction_id"))
        if fid <= 0:
            raise ValueError("invalid_fraction")
        fractions.append({"id": fid, "name": clean(raw.get("name")) or clean(raw.get("fraction_name")),
                          "fraction_name": clean(raw.get("fraction_name")), "government": raw.get("government") is True,
                          "leaders": [], "deputies": [], "vice_governors": []})
        for entry in raw.get("leaders") or []:
            if number(entry.get("leader_id")) > 0:
                all_people[entry["leader_id"]] = {**entry, "fraction_id": fid}
    for source in ("leaders", "judges", "ministers"):
        for raw in sources[source]:
            if number(raw.get("leader_id")) <= 0:
                raise ValueError("invalid_leader")
            prior = all_people.get(raw["leader_id"], {})
            all_people[raw["leader_id"]] = {**prior, **{k: v for k, v in raw.items() if v is not None and v != ""}}
    by_fraction = {f["id"]: f for f in fractions}
    unknown = []
    for raw in all_people.values():
        rank, fid = number(raw.get("rank")), number(raw.get("fraction_id"))
        if rank in (9, 10):
            if fid not in by_fraction:
                unknown.append(f"Организация {fid} отсутствует в каталоге API.")
                continue
            role = "leaders" if rank == 10 else "deputies"
            if fid == 6 and re.search(r"вице[\s-]*губернатор", clean(raw.get("rank_name")), re.I):
                role = "vice_governors"
            by_fraction[fid][role].append(person(raw))
        elif rank not in (11, 12):
            unknown.append(f"Неизвестная должность API: {clean(raw.get('rank_name'))} ({rank}).")
    for f in fractions:
        for role in ROLE_LABELS:
            f[role].sort(key=person_order)
        f["leader_count"], f["deputy_count"] = len(f["leaders"]), len(f["deputies"])
    judges = sorted([person(r) for r in all_people.values() if number(r.get("rank")) == 12], key=person_order)
    ministers = sorted([person(r) for r in all_people.values() if number(r.get("rank")) == 11], key=person_order)
    groups = {}
    for raw in sources["administration"]:
        if not clean(raw.get("nickname")) or not clean(raw.get("role")) or not isinstance(raw.get("spheres"), list):
            raise ValueError("invalid_administration")
        role = clean(raw.get("role"))
        spheres = sorted(set(clean(s) for s in raw.get("spheres", []) if clean(s)))
        key = "g" + hashlib.sha256(json.dumps([role, spheres], ensure_ascii=False).encode()).hexdigest()[:16]
        group = groups.setdefault(key, {"key": key, "name": role + (" · " + ", ".join(spheres) if spheres else " · Без сферы"), "rows": []})
        group["rows"].append({"nickname": clean(raw.get("nickname")), "role": role,
                              "spheres": spheres, "online_7_days": clean(raw.get("online_7_days"))})
    for group in groups.values():
        group["rows"].sort(key=lambda r: r["nickname"].casefold())
    return {"server_id": external_server_id, "fractions": sorted(fractions, key=lambda f: f["id"]),
            "judges": judges, "ministers": ministers, "admin": sorted(groups.values(), key=lambda g: g["name"]),
            "warnings": [], "errors": sorted(set(unknown)),
            "unavailable_groups": ["fraction.6.vice_governors"] if 6 in by_fraction and not by_fraction[6]["vice_governors"] else []}


def catalog(data: dict) -> dict:
    return {"fractions": [{k: f[k] for k in ("id", "name", "fraction_name", "government", "leader_count", "deputy_count")} for f in data.get("fractions", [])],
            "admin": [{"key": g["key"], "name": g["name"], "count": len(g["rows"])} for g in data.get("admin", [])],
            "judges_count": len(data.get("judges", [])), "ministers_count": len(data.get("ministers", [])),
            "person_fields": PERSON_FIELDS, "admin_fields": ADMIN_FIELDS, "fraction_fields": FRACTION_FIELDS, "meta_fields": META_FIELDS,
            "legacy_mappings": {code: fid for code, fid in LEGACY_CODES.items() if fid in {f["id"] for f in data.get("fractions", [])}}}


def escape(value) -> str:
    return html.escape(str(value), quote=False).replace("[", "&#91;").replace("]", "&#93;")


def field_value(row: dict | None, field: str) -> str:
    if row is None:
        return "Вакантно" if field == "nickname" else "—"
    if field == "vk_link":
        url = row.get("vk_url")
        return f"[URL='{url}']VK[/URL]" if url else "—"
    value = row.get(field)
    if value is None or value == "" or value == []:
        return "Вакантно" if field == "nickname" else "—"
    if field in ("post_date", "planned_end_date"):
        value = datetime.fromisoformat(value).strftime("%d.%m.%Y")
    return escape(", ".join(value) if isinstance(value, list) else value)


def render(template: str, data: dict, now: datetime | None = None) -> dict:
    errors, used = list(data.get("errors", [])), {}
    fractions = {str(f["id"]): f for f in data.get("fractions", [])}
    admin = {g["key"]: g for g in data.get("admin", [])}
    def replace(match):
        token = match[1].strip()
        if token == "generated_at":
            return (now or datetime.now(MSK)).astimezone(MSK).strftime("%d.%m.%Y %H:%M")
        if token == "server_id":
            return str(data.get("server_id", "—"))
        parts, rows, fields = token.split("."), None, PERSON_FIELDS
        if len(parts) == 3 and parts[0] == "fraction" and parts[1] in fractions and parts[2] in FRACTION_FIELDS:
            return field_value(fractions[parts[1]], parts[2])
        if len(parts) == 5 and parts[0] == "fraction" and parts[1] in fractions and parts[2] in ROLE_LABELS and (parts[2] != "vice_governors" or parts[1] == "6"):
            rows, slot, field = fractions[parts[1]].get(parts[2], []), parts[3], parts[4]
            group_key = ".".join(parts[:3])
        elif len(parts) == 3 and parts[0] in ("judges", "ministers"):
            rows, slot, field = data.get(parts[0], []), parts[1], parts[2]
            group_key = parts[0]
        elif len(parts) == 4 and parts[0] == "admin" and parts[1] in admin:
            rows, slot, field = admin[parts[1]]["rows"], parts[2], parts[3]
            fields, group_key = ADMIN_FIELDS, ".".join(parts[:2])
        if rows is None or not slot.isdigit() or not 1 <= int(slot) <= MAX_SLOT or field not in fields:
            errors.append("{{" + token + "}}")
            return match[0]
        label = (fractions[parts[1]]["name"] + " · " + ROLE_LABELS[parts[2]]) if parts[0] == "fraction" else (
            admin[parts[1]]["name"] if parts[0] == "admin" else "Судьи" if parts[0] == "judges" else "Министры")
        used.setdefault(group_key, {"rows": rows, "slots": set(), "label": label})["slots"].add(int(slot))
        if group_key in data.get("unavailable_groups", []) or group_key == "fraction.6.vice_governors" and not rows:
            return "—"
        return field_value(rows[int(slot)-1] if int(slot) <= len(rows) else None, field)
    result = TOKEN.sub(replace, template)
    for old in re.findall(r"PLACEHOLDER_[A-Z0-9_]+", result, re.I):
        errors.append(old)
    warnings = list(data.get("warnings", []))
    for key, group in used.items():
        omitted = sum(i not in group["slots"] for i in range(1, len(group["rows"])+1))
        if omitted:
            warnings.append(f"{group['label']}: не вошло сотрудников — {omitted}. Добавьте места в шаблоне.")
    # Prevent legacy/manual URL wrappers from linking a vacant slot.
    result = re.sub(r"\[url\s*=\s*['\"]?(?:https?://)?—['\"]?\].*?\[/url\]", "—", result, flags=re.I | re.S)
    if "{{" in TOKEN.sub("", template) or "}}" in TOKEN.sub("", template):
        errors.append("Незакрытый плейсхолдер")
    return {"rendered": result if not errors else None, "errors": sorted(set(errors)), "warnings": warnings}


def default_template(data: dict) -> str:
    return (Path(__file__).resolve().parents[1] / "assets" / "forum_list_default.bbcode").read_text(encoding="utf-8")


def import_legacy(template: str, data: dict, mappings: dict) -> dict:
    ids = {f["id"] for f in data.get("fractions", [])}
    orgs = {**LEGACY_CODES, **mappings}
    counts, current, conversions, errors = Counter(), {}, {}, []
    fields = {"NICK": "nickname", "VK": "vk_url", "DISCORD": "discord_id", "DATEAPPOINTMENT": "post_date", "DATEWITHDRAWAL": "planned_end_date"}
    def replace(m):
        role, org, field = [s.upper() for s in m.groups()]
        if role == "MINCNN":
            errors.append("MINCNN_GOV: подтвердите соответствие премьер-министра через каталог министров; автоматической замены нет.")
            return m[0]
        if org == "COURT":
            prefix = "judges"
        elif org in orgs and orgs[org] in ids:
            prefix = f"fraction.{orgs[org]}.{'leaders' if role == 'LEADER' else 'deputies'}"
        else:
            errors.append(f"Не сопоставлена организация: {org}")
            return m[0]
        if field == "NICK":
            counts[prefix] += 1
            current[prefix] = counts[prefix]
        slot = current.get(prefix, 1)
        new = "{{"+f"{prefix}.{slot}.{fields[field]}"+"}}"
        conversions.setdefault(m[0], set()).add(new)
        return new
    converted = LEGACY.sub(replace, re.sub("PLACEHOLDER_LAST_UPDATE", "{{generated_at}}", template, flags=re.I))
    errors.extend(render(converted, data)["errors"])
    return {"template": converted, "errors": sorted(set(errors)),
            "conversions": [{"from": key, "to": sorted(values)} for key, values in conversions.items()]}
