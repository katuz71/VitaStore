from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Any
import sqlite3
import json
import os
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime
import requests

# --- РУЧНАЯ ЗАГРУЗКА .ENV ---
# Читаем файл как текст, чтобы не зависеть от библиотек
try:
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip() and not line.startswith('#') and '=' in line:
                key, value = line.strip().split('=', 1)
                os.environ[key] = value
                if key == "MONOBANK_API_TOKEN":
                    print(f"✅ Токен найден вручную: {value[:5]}...")
except Exception as e:
    print(f"⚠️ Не удалось прочитать .env вручную: {e}")

# Проверка
TOKEN = os.getenv("MONOBANK_API_TOKEN")
if not TOKEN:
    print("❌ КРИТИЧЕСКАЯ ОШИБКА: Токен всё ещё не найден!")
else:
    print("🚀 Система готова к оплате.")

# Получаем токены из переменных окружения
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
MY_CHAT_ID = os.getenv("MY_CHAT_ID")
MONOBANK_API_TOKEN = os.getenv("MONOBANK_API_TOKEN")

# 1. Функция пересоздания таблицы с данными доставки
def reinit_db_final():
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS orders") # Сносим неполную таблицу
    cursor.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            items TEXT,
            total REAL,
            status TEXT,
            payment_method TEXT,
            invoiceId TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            delivery_city TEXT,
            delivery_warehouse TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("✅ База обновлена! Поля для доставки добавлены.")

# Вызываем один раз при старте
reinit_db_final()

def create_test_product():
    import sqlite3
    try:
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # 1. Сначала узнаем, какие колонки есть в таблице products
        cursor.execute("PRAGMA table_info(products)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if not columns:
            print("⚠️ Таблица products не найдена. Пропускаем.")
            return

        print(f"ℹ️ Структура товаров: {columns}")

        # 2. Подготовим данные, которые хотим вставить
        # Пытаемся угадать названия колонок (name или title, и т.д.)
        target_data = {
            "price": 1,
            "description": "Спец. товар для проверки оплат",
            "image": "https://placehold.co/400?text=Test+1+UAH"
        }
        
        # Определяем имя (name или title)
        if "name" in columns: target_data["name"] = "Тестовый товар (1 грн)"
        elif "title" in columns: target_data["title"] = "Тестовый товар (1 грн)"
        
        # 3. Фильтруем: оставляем только те поля, которые реально есть в таблице
        final_keys = []
        final_values = []
        
        for key, val in target_data.items():
            if key in columns:
                final_keys.append(key)
                final_values.append(val)
        
        # 4. Проверяем, нет ли уже такого товара (чтобы не плодить дубли)
        name_key = "name" if "name" in columns else "title"
        if name_key in columns:
            cursor.execute(f"SELECT id FROM products WHERE {name_key} LIKE 'Тестовый товар%'")
            if cursor.fetchone():
                print("✅ Тестовый товар уже существует.")
                conn.close()
                return

        # 5. Вставляем
        if final_keys:
            cols_str = ", ".join(final_keys)
            q_marks = ", ".join(["?"] * len(final_values))
            query = f"INSERT INTO products ({cols_str}) VALUES ({q_marks})"
            
            cursor.execute(query, final_values)
            conn.commit()
            print("✨ Товар 'Тест' за 1 грн добавлен в магазин!")
        
        conn.close()
    except Exception as e:
        print(f"⚠️ Ошибка создания товара: {e}")

# Вызываем при запуске
create_test_product()

app = FastAPI()

# Добавляем CORS middleware для работы с React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене лучше указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
DB_NAME = 'shop.db'


NP_API_KEY = "02971cadca463a19240b2a8798ee7817"
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
MY_CHAT_ID = os.getenv("MY_CHAT_ID")

def get_db_connection():
    db_path = os.path.join(os.path.dirname(__file__), DB_NAME)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/", response_class=HTMLResponse)
def read_root():
    conn = get_db_connection()
    
    # Получаем товары
    items = conn.execute('SELECT * FROM products').fetchall()
    
    # Получаем заказы, отсортированные по дате создания (DESC)
    try:
        orders = conn.execute('''
            SELECT id, name, phone, city, warehouse, total_price, created_at 
            FROM orders 
            ORDER BY created_at DESC
        ''').fetchall()
    except sqlite3.OperationalError:
        # Таблица orders может не существовать
        orders = []
    
    conn.close()
    
    html_content = """
    <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: sans-serif; margin: 40px; background: #f4f4f9; }
                .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 40px; }
                th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                th { background-color: #222; color: white; }
                .upload-section { background: #eee; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                img { width: 50px; height: 50px; object-fit: cover; border-radius: 5px; }
                h2 { margin-top: 40px; margin-bottom: 20px; color: #333; }
                .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                .status-new { background-color: #4CAF50; color: white; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Управление товарами</h1>
                
                <div class="upload-section">
                    <h3>Массовый импорт XML</h3>
                    <form action="/upload_xml" method="post" enctype="multipart/form-data">
                        <input type="file" name="file" accept=".xml">
                        <button type="submit">Загрузить товары</button>
                    </form>
                </div>

                <h2>Товары</h2>
                <table>
                    <tr><th>ID</th><th>Фото</th><th>Название</th><th>Цена</th></tr>
    """
    for p in items:
        html_content += f"<tr><td>{p['id']}</td><td><img src='{p['image']}'></td><td>{p['name']}</td><td>{p['price']} ₴</td></tr>"
    
    html_content += """
                </table>
                
                <h2>Recent Orders</h2>
                <table>
                    <tr>
                        <th>ID</th>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>City</th>
                        <th>Warehouse</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
    """
    
    if orders:
        for order in orders:
            # Форматируем дату
            try:
                date_obj = datetime.fromisoformat(order['created_at'])
                formatted_date = date_obj.strftime('%Y-%m-%d %H:%M')
            except:
                formatted_date = order['created_at']
            
            html_content += f"""
                    <tr>
                        <td>{order['id']}</td>
                        <td>{order['name']}</td>
                        <td>{order['phone']}</td>
                        <td>{order['city']}</td>
                        <td>{order['warehouse']}</td>
                        <td>{order['total_price']} ₴</td>
                        <td><span class="status status-new">New</span></td>
                        <td>{formatted_date}</td>
                    </tr>
            """
    else:
        html_content += "<tr><td colspan='8' style='text-align: center; color: #999;'>Нет заказов</td></tr>"
    
    html_content += """
                </table>
            </div>
        </body>
    </html>
    """
    return html_content

@app.post("/upload_xml")
async def upload_xml(file: UploadFile = File(...)):
    try:
        content = await file.read()
        # Пробуем декодировать содержимое (важно для кириллицы)
        xml_text = content.decode('utf-8')
        tree = ET.fromstring(xml_text)
        
        conn = get_db_connection()
        count = 0
        
        for item in tree.findall('.//product'):
            # Используем .get() чтобы сервер не падал, если тега нет
            name = item.findtext('name', default='Без названия')
            price_text = item.findtext('price', default='0')
            price = int(''.join(filter(str.isdigit, price_text))) # Оставляем только цифры
            image = item.findtext('image', default='')
            desc = item.findtext('description', default='')
            
            conn.execute("INSERT INTO products (name, price, image, description) VALUES (?, ?, ?, ?)",
                         (name, price, image, desc))
            count += 1
        
        conn.commit()
        conn.close()
        print(f"Успешно загружено товаров: {count}")
        return RedirectResponse(url="/", status_code=303)
        
    except Exception as e:
        return HTMLResponse(content=f"<h1>Ошибка при чтении XML:</h1><p>{str(e)}</p><a href='/'>Назад</a>", status_code=500)

@app.get("/health")
def health_check():
    """Проверка доступности сервера"""
    return JSONResponse(content={"status": "ok", "message": "Server is running"})

@app.get("/payment-success")
async def payment_success():
    return HTMLResponse(content="""
        <html>
            <body style="text-align: center; font-family: sans-serif; padding-top: 50px;">
                <h1 style="color: #4CAF50;">Оплата успішна! 🎉</h1>
                <p>Дякуємо за замовлення. Ми вже готуємо його до відправки.</p>
                <p>Можете повернутися в додаток.</p>
            </body>
        </html>
    """)

@app.get("/order_status/{order_id}")
def get_order_status(order_id: int):
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM orders WHERE id = ?", (order_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {"status": row[0]} # 'New' or 'Paid'
    return {"error": "Order not found"}

@app.post("/monobank-webhook")
async def monobank_webhook(request: Request):
    import sqlite3, os, httpx, traceback
    try:
        data = await request.json()
        print(f"🔔 WEBHOOK DATA: {data}")
        
        if data.get('status') == 'success':
            invoice_id = data.get('invoiceId')
            print(f"🔎 Ищем заказ с invoiceId: {invoice_id}")
            
            conn = sqlite3.connect('shop.db')
            cursor = conn.cursor()
            
            # Проверяем структуру (debug)
            # cursor.execute("PRAGMA table_info(orders)")
            # print(f"Cols: {cursor.fetchall()}")

            cursor.execute("""
                SELECT id, total, customer_name, customer_phone, delivery_city, delivery_warehouse 
                FROM orders WHERE invoiceId = ?
            """, (invoice_id,))
            row = cursor.fetchone()
            conn.close() # Закрываем сразу, чтобы не держать
            
            if row:
                print(f"✅ Заказ найден в БД: {row}")
                oid, total, name, phone, city, wh = row
                
                # Обновляем статус (отдельное соединение)
                with sqlite3.connect('shop.db') as conn2:
                    conn2.execute("UPDATE orders SET status = 'Paid' WHERE id = ?", (oid,))
                    conn2.commit()
                
                # Токен Телеграм
                token = os.getenv("TELEGRAM_TOKEN")
                chat_id = os.getenv("MY_CHAT_ID")
                
                # Жесткий поиск токена, если env пустой
                if not token or not chat_id:
                    print("⚠️ Токен не в памяти, ищем в .env файле...")
                    try:
                        with open('.env', 'r', encoding='utf-8') as f:
                            for line in f:
                                if "TELEGRAM_TOKEN" in line: token = line.split('=')[1].strip().replace('"', '')
                                if "MY_CHAT_ID" in line: chat_id = line.split('=')[1].strip().replace('"', '')
                    except Exception as e:
                        print(f"⚠️ Не смог прочитать .env: {e}")

                print(f"📧 Готовим отправку. Токен есть? {'ДА' if token else 'НЕТ'}. ChatID: {chat_id}")

                if token and chat_id:
                    msg = (
                        f"✅ <b>ОПЛАТА ПРОШЛА!</b>\n"
                        f"💰 Сумма: {total} грн\n"
                        f"📦 Заказ: #{oid}\n"
                        f"------------------\n"
                        f"👤 <b>Клиент:</b> {name}\n"
                        f"📞 <b>Телефон:</b> {phone}\n"
                        f"🏙 <b>Город:</b> {city}\n"
                        f"🚚 <b>Доставка:</b> {wh}"
                    )
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(f"https://api.telegram.org/bot{token}/sendMessage", 
                                          json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})
                        print(f"✈️ Ответ Telegram: {resp.status_code} {resp.text}")
                else:
                    print("❌ ОШИБКА: Нет токена или Chat ID!")
            else:
                print("❌ Заказ с таким invoiceId НЕ НАЙДЕН в базе (возможно, id не сохранился при создании).")
            
        return {"status": "ok"}
    except Exception as e:
        print("🔥 КРИТИЧЕСКАЯ ОШИБКА ВЕБХУКА:")
        traceback.print_exc() # Выведет полную карту ошибки
        return {"status": "error"}

@app.get("/get_cities")
def get_cities(search: str = ""):
    try:
        payload = {
            "apiKey": NP_API_KEY,
            "modelName": "Address",
            "calledMethod": "getCities",
            "methodProperties": {
                "FindByString": search,
                "Limit": "10"
            }
        }
        response = requests.post("https://api.novaposhta.ua/v2.0/json/", json=payload, timeout=25)
        response.raise_for_status()
        data = response.json()
        return data
    except requests.exceptions.Timeout as e:
        print(f"Timeout error fetching cities from Nova Poshta API: {str(e)}")
        return JSONResponse(
            status_code=504,
            content={"success": False, "error": "API Nova Poshta не відповідає. Спробуйте пізніше."}
        )
    except requests.exceptions.RequestException as e:
        print(f"Error fetching cities from Nova Poshta API: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Помилка API Nova Poshta: {str(e)}"}
        )
    except Exception as e:
        print(f"Unexpected error in get_cities: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Помилка сервера: {str(e)}"}
        )

@app.get("/get_warehouses")
def get_warehouses(city_ref: str):
    try:
        print(f"Fetching warehouses for city_ref: {city_ref}")
        payload = {
            "apiKey": NP_API_KEY,
            "modelName": "Address",
            "calledMethod": "getWarehouses",
            "methodProperties": {
                "CityRef": city_ref
            }
        }
        print(f"Sending request to Nova Poshta API...")
        response = requests.post("https://api.novaposhta.ua/v2.0/json/", json=payload, timeout=25)
        response.raise_for_status()
        data = response.json()
        print(f"Received response from Nova Poshta API: success={data.get('success')}, data length={len(data.get('data', [])) if data.get('data') else 0}")
        
        # Проверяем, что API вернул успешный ответ
        if data.get('success') is False:
            errors = data.get('errors', [])
            error_msg = errors[0] if errors else 'Невідома помилка від API Nova Poshta'
            print(f"Nova Poshta API returned error: {error_msg}")
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": error_msg, "errors": errors}
            )
        
        return data
    except requests.exceptions.Timeout as e:
        print(f"Timeout error fetching warehouses from Nova Poshta API: {str(e)}")
        return JSONResponse(
            status_code=504,
            content={"success": False, "error": "API Nova Poshta не відповідає. Спробуйте пізніше."}
        )
    except requests.exceptions.RequestException as e:
        print(f"Error fetching warehouses from Nova Poshta API: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Помилка API Nova Poshta: {str(e)}"}
        )
    except Exception as e:
        print(f"Unexpected error in get_warehouses: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Помилка сервера: {str(e)}"}
        )

def send_telegram_notification(order_data):
    """Отправляет уведомление о новом заказе в Telegram"""
    if not TELEGRAM_TOKEN or not MY_CHAT_ID:
        print("Telegram bot token or chat ID not configured. Skipping notification.")
        return
    
    payment_method_text = "💳 Онлайн оплата" if order_data.get('payment_method') == 'card' else "💵 Накладений платіж"
    
    message = f"""🚀 НОВЫЙ ЗАКАЗ!
👤 Клиент: {order_data['name']}
📞 Телефон: {order_data['phone']}
📍 Город: {order_data['city']}
📦 Склад: {order_data['warehouse']}
💰 Сумма: {order_data['total']} грн
{payment_method_text}"""
    
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": MY_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        print(f"Telegram notification sent successfully for order {order_data.get('order_id', 'N/A')}")
    except Exception as e:
        print(f"Failed to send Telegram notification: {str(e)}")

class Item(BaseModel):
    id: Any             # Accept string or int
    name: str
    price: Any          # Accept string or number
    image: Optional[str] = "" 
    quantity: Optional[int] = 1

class Order(BaseModel):
    user_email: str
    items: List[Item]
    total: Any = 0                 # Accept string or number
    payment_method: str = "card"   # Default to "card" if missing!
    status: str = "New"            # Default value

# Keep OrderItem for backward compatibility with OrderRequest
class OrderItem(BaseModel):
    id: int
    name: str
    price: int
    quantity: int
    packSize: int

class OrderRequest(BaseModel):
    name: str
    phone: str
    city: str
    cityRef: str
    warehouse: str
    warehouseRef: str
    items: List[OrderItem]
    totalPrice: int
    payment_method: str = "card"  # Default value if app doesn't send it

@app.post("/create_order")
async def create_order(request: Request):
    import sqlite3, json, os, httpx
    
    # !!! ТВОЯ ССЫЛКА NGROK !!!
    CURRENT_NGROK = "https://farrah-unenlightening-oversorrowfully.ngrok-free.dev"
    WEBHOOK_URL = f"{CURRENT_NGROK}/monobank-webhook"

    try:
        data = await request.json()
        print(f"📥 ЗАКАЗ: {data}")

        # Данные
        name = data.get('name') or data.get('fullName') or "Не указано"
        phone = data.get('phone') or data.get('phoneNumber') or "Не указано"
        city_raw = data.get('city')
        city = city_raw if isinstance(city_raw, str) else (city_raw.get('Description') if city_raw else "Не указано")
        warehouse_raw = data.get('warehouse') or data.get('post_office')
        warehouse = warehouse_raw if isinstance(warehouse_raw, str) else (warehouse_raw.get('Description') if warehouse_raw else "Не указано")
        user_email = data.get('email') or "no-email"
        items = data.get('items') or []
        total_price = data.get('totalPrice') or data.get('total') or 0
        payment_method = data.get('payment_method') or "card" # card или cash

        amount_kopeks = int(float(total_price) * 100)

        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # Пишем в базу
        cursor.execute("""
            INSERT INTO orders 
            (user_email, items, total, status, payment_method, customer_name, customer_phone, delivery_city, delivery_warehouse) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_email, json.dumps(items), total_price, "New", payment_method, name, phone, city, warehouse))
        
        order_id = cursor.lastrowid
        conn.commit()

        # === РАЗВИЛКА ===
        if payment_method == "card":
            # --- ВЕТКА МОНОБАНКА ---
            payload = {
                "amount": amount_kopeks,
                "ccy": 980,
                "merchantPaymInfo": {
                    "reference": str(order_id),
                    "destination": f"Заказ #{order_id} от {name}"
                },
                "redirectUrl": "https://google.com",
                "webHookUrl": WEBHOOK_URL
            }
            
            token = os.getenv("MONOBANK_API_TOKEN")
            if not token:
                try:
                    with open('.env', 'r') as f:
                        for line in f:
                            if "MONOBANK_API_TOKEN" in line: token = line.split('=')[1].strip()
                except: pass

            async with httpx.AsyncClient() as client:
                resp = await client.post("https://api.monobank.ua/api/merchant/invoice/create", 
                                         headers={'X-Token': token}, 
                                         json=payload)
                
                if resp.status_code == 200:
                    res = resp.json()
                    cursor.execute("UPDATE orders SET invoiceId = ? WHERE id = ?", (res['invoiceId'], order_id))
                    conn.commit()
                    conn.close()
                    return {"payment_url": res['pageUrl'], "order_id": order_id}
                else:
                    print(f"❌ Mono Error: {resp.text}")
                    conn.close()
                    return {"error": "Payment create failed"}
        
        else:
            # --- ВЕТКА НАЛОЖЕННОГО ПЛАТЕЖА ---
            print("📦 Наложенный платеж. Отправляем уведомление сразу.")
            conn.close()
            
            # Шлем в ТГ
            token = os.getenv("TELEGRAM_TOKEN")
            chat_id = os.getenv("MY_CHAT_ID")
            if not token:
                try:
                    with open('.env', 'r') as f:
                        for line in f:
                            if "TELEGRAM_TOKEN" in line: token = line.split('=')[1].strip()
                            if "MY_CHAT_ID" in line: chat_id = line.split('=')[1].strip()
                except: pass

            if token and chat_id:
                msg = (
                    f"📦 <b>НОВЫЙ ЗАКАЗ (Наложка)!</b>\n"
                    f"💰 Сумма: {total_price} грн\n"
                    f"🔢 Номер: #{order_id}\n"
                    f"------------------\n"
                    f"👤 {name}\n"
                    f"📞 {phone}\n"
                    f"🏙 {city}\n"
                    f"🚚 {warehouse}"
                )
                async with httpx.AsyncClient() as client:
                    await client.post(f"https://api.telegram.org/bot{token}/sendMessage", 
                                      json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})
            
            return {"status": "created", "message": "Order placed successfully"}

    except Exception as e:
        print(f"🔥 Create Error: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # Используем 0.0.0.0 чтобы слушать на всех интерфейсах
    # Это позволит подключаться и по localhost, и по IP адресу
    uvicorn.run(app, host="0.0.0.0", port=8000)
