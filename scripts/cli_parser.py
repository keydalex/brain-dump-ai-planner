#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Завантажуємо локальні змінні з файлу .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("❌ Помилка: GEMINI_API_KEY не знайдено у файлі .env!")
    sys.exit(1)

# Pydantic схема для структурування завдання
class TaskSchema(BaseModel):
    title: str = Field(description="Назва завдання українською мовою")
    category: str = Field(description="Категорія: Deep Work, Admin, Learning, Fitness, Rest")
    priority: int = Field(description="Пріоритет від 1 (найвищий) до 4 (найнижчий)")
    duration: int = Field(default=30, description="Очікуваний час виконання у хвилинах")
    due_date: str = Field(description="Дата виконання у форматі YYYY-MM-DD")

def parse_thought_cli(text: str):
    """
    Аналізує сирий текст (brain dump) за допомогою Gemini 3.5 Flash у Python.
    """
    print(f"🧠 Аналізуємо сирий вкид: \"{text}\"...\n")
    
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    # Викликаємо Gemini з Structured Output
    response = client.models.generate_content(
        model="gemini-2.5-flash",  # Gemini 2.5 Flash / 3.5 Flash
        contents=text,
        config=types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=TaskSchema,
            system_instruction=(
                "Ти — AI-асистент планувальника. Твоє завдання — розібрати хаотичний текст "
                "користувача (українською мовою) та витягнути з нього деталі завдання у строгому форматі JSON."
            )
        )
    )
    
    print("✅ Результат структурування від AI:")
    print(response.text)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("💡 Використання: python cli_parser.py \"<твій сирий текст завдання>\"")
        print("Приклад: python cli_parser.py \"треба завтра о 15:00 сходити в зал на півтори години це терміново\"")
        sys.exit(0)
        
    user_text = sys.argv[1]
    try:
        parse_thought_cli(user_text)
    except Exception as e:
        print(f"❌ Сталася помилка під час аналізу: {e}")
