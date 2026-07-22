#!/usr/bin/env python3
"""
Planner Task Exporter & Local Backup Tool
Цей скрипт підключається до твоєї бази Supabase, витягує всі завдання
та створює красивий локальний Markdown-звіт для бекапу твого дня/тижня.
"""

import os
import re
from datetime import datetime
from dotenv import load_dotenv

# Завантажуємо конфігурацію з .env
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def parse_pg_url(url):
    """
    Парсить postgresql connection string для підключення за допомогою стандартних бібліотек.
    """
    if not url:
        return None
    # Прибираємо префікси pgbouncer якщо є
    url = url.split("?")[0]
    pattern = r"postgresql://(?P<user>[^:]+):(?P<password>[^@]+)@(?P<host>[^:/]+):(?P<port>\d+)/(?P<db>.+)"
    match = re.match(pattern, url)
    if match:
        return match.groupdict()
    return None

def export_tasks():
    # Намагаємося імпортувати psycopg2
    try:
        import psycopg2
    except ImportError:
        print("❌ Помилка: Бібліотеку 'psycopg2-binary' не знайдено!")
        print("💡 Встанови її через: pip install psycopg2-binary")
        return

    db_params = parse_pg_url(DATABASE_URL)
    if not db_params:
        print("❌ Помилка: DATABASE_URL має некоректний формат у файлі .env")
        return

    print("🔌 Підключаємося до Supabase...")
    try:
        conn = psycopg2.connect(
            dbname=db_params['db'],
            user=db_params['user'],
            password=db_params['password'],
            host=db_params['host'],
            port=db_params['port']
        )
        cursor = conn.cursor()
        
        # Запит для отримання всіх завдань
        cursor.execute("SELECT id, title, status, priority, category, duration, \"dueDate\", \"isCarriedOver\" FROM \"Task\" ORDER BY \"dueDate\" DESC, priority ASC;")
        tasks = cursor.fetchall()
        
        if not tasks:
            print("📭 У базі даних немає завдань для експорту.")
            return

        # Створюємо папку для бекапів, якщо її немає
        os.makedirs("backups", exist_ok=True)
        filename = f"backups/backup_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.md"
        
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"# 🧠 Brain Dump Planner - Резервна копія ({datetime.now().strftime('%Y-%m-%d %H:%M')})\n\n")
            f.write(f"Усього знайдено завдань у базі: **{len(tasks)}**\n\n")
            
            # Групування по статусу
            todo_tasks = [t for t in tasks if t[2] == "todo"]
            done_tasks = [t for t in tasks if t[2] == "done"]
            
            f.write("## 📥 Активні завдання (To Do)\n")
            if todo_tasks:
                for t in todo_tasks:
                    prio_indicator = "🔴" if t[3] == 1 else "🟠" if t[3] == 2 else "🔵" if t[3] == 3 else "⚪"
                    carry_indicator = " 🔄 (перенесено)" if t[7] else ""
                    due = t[6].strftime('%Y-%m-%d') if t[6] else "Без дати"
                    f.write(f"- {prio_indicator} **{t[1]}** | Категорія: *{t[4]}* | Час: {t[5]} хв | Дедлайн: `{due}`{carry_indicator}\n")
            else:
                f.write("*Немає активних завдань.*\n")
                
            f.write("\n## ✅ Виконані завдання (Done)\n")
            if done_tasks:
                for t in done_tasks:
                    f.write(f"- [x] ~~{t[1]}~~ (Категорія: {t[4]})\n")
            else:
                f.write("*Немає виконаних завдань.*\n")
                
        print(f"🎉 Експорт завершено успішно! Створено файл: {filename}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Сталася помилка при роботі з базою: {e}")

if __name__ == "__main__":
    export_tasks()
