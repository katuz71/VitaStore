from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Union, Any
import sqlite3
import json
import os
import shutil
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime
import requests

# --- PYDANTIC MODELS ---
class XMLImportRequest(BaseModel):
    url: str

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
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
MY_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
MONOBANK_API_TOKEN = os.getenv("MONOBANK_API_TOKEN")

# --- DATABASE REPAIR ---
def reset_orders_table():
    import sqlite3
    try:
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # 1. Удаляем старую таблицу (Сносим всё старое)
        cursor.execute("DROP TABLE IF EXISTS orders")
        print("🗑️ Старая таблица orders удалена.")

        # 2. Создаем новую ЧИСТУЮ таблицу ровно под наши нужды
        cursor.execute("""
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT,
                name TEXT,
                phone TEXT,
                city TEXT,
                cityRef TEXT,
                warehouse TEXT,
                warehouseRef TEXT,
                items TEXT,
                total REAL,
                totalPrice REAL,
                status TEXT,
                payment_method TEXT,
                invoiceId TEXT,
                date TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.commit()
        conn.close()
        print("✨ Новая таблица orders создана с нуля!")
    except Exception as e:
        print(f"⚠️ Ошибка сброса БД: {e}")

# Вызываем один раз, чтобы починить базу
reset_orders_table()
# -----------------------

app = FastAPI()

# Добавляем CORS middleware для работы с React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене лучше указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for admin.html and other static assets
try:
    if os.path.exists('admin.html'):
        # If admin.html exists in root, serve it via static mount
        app.mount("/static", StaticFiles(directory="."), name="static")
except Exception as e:
    print(f"⚠️ Could not mount static files: {e}")

DB_NAME = 'shop.db'

def fix_db():
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    
    # Добавляем колонку payment_method
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash'")
        conn.commit()
        print("✅ База обновлена: колонка payment_method добавлена.")
    except Exception:
        pass
    
    # Добавляем колонку invoice_id для связи с Monobank
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN invoice_id TEXT")
        conn.commit()
        print("✅ База обновлена: колонка invoice_id добавлена.")
    except Exception:
        pass
    
    # Добавляем колонку status для отслеживания статуса оплаты
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'Pending'")
        conn.commit()
        print("✅ База обновлена: колонка status добавлена.")
    except Exception:
        pass
    
    # Добавляем колонки в таблицу products
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN weight TEXT")
        conn.commit()
        print("✅ База обновлена: колонка weight добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN ingredients TEXT")
        conn.commit()
        print("✅ База обновлена: колонка ingredients добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN category TEXT")
        conn.commit()
        print("✅ База обновлена: колонка category добавлена в products.")
    except Exception:
        pass
    
    # Добавляем новые колонки для добавок (Supplements)
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN composition TEXT")
        conn.commit()
        print("✅ База обновлена: колонка composition добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN usage TEXT")
        conn.commit()
        print("✅ База обновлена: колонка usage добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN pack_sizes TEXT")
        conn.commit()
        print("✅ База обновлена: колонка pack_sizes добавлена в products.")
    except Exception:
        pass
    
    # Добавляем новые колонки для цены и единиц измерения
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN old_price REAL")
        conn.commit()
        print("✅ База обновлена: колонка old_price добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'шт'")
        conn.commit()
        print("✅ База обновлена: колонка unit добавлена в products.")
    except Exception:
        pass
    
    # Миграция таблицы orders - добавляем новые поля если их нет
    try:
        cursor.execute("PRAGMA table_info(orders)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'name' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN name TEXT")
            print("✅ Добавлена колонка name в orders")
        if 'phone' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN phone TEXT")
            print("✅ Добавлена колонка phone в orders")
        if 'city' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN city TEXT")
            print("✅ Добавлена колонка city в orders")
        if 'cityRef' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN cityRef TEXT")
            print("✅ Добавлена колонка cityRef в orders")
        if 'warehouse' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN warehouse TEXT")
            print("✅ Добавлена колонка warehouse в orders")
        if 'warehouseRef' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN warehouseRef TEXT")
            print("✅ Добавлена колонка warehouseRef в orders")
        if 'totalPrice' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN totalPrice REAL")
            print("✅ Добавлена колонка totalPrice в orders")
        if 'date' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN date TEXT DEFAULT (datetime('now', 'localtime'))")
            print("✅ Добавлена колонка date в orders")
        
        conn.commit()
    except Exception as e:
        print(f"⚠️ Ошибка миграции таблицы orders: {e}")
    
    # Создаем таблицу categories
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )
        """)
        conn.commit()
        print("✅ Таблица categories создана.")
    except Exception as e:
        print(f"⚠️ Ошибка создания таблицы categories: {e}")
    
    # Автозаполнение категорий из существующих продуктов
    try:
        cursor.execute("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''")
        existing_categories = cursor.fetchall()
        
        for row in existing_categories:
            category_name = row[0]
            if category_name:
                try:
                    cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (category_name,))
                except Exception:
                    pass  # Игнорируем дубликаты
        
        conn.commit()
        print(f"✅ Автозаполнение категорий выполнено: добавлено {len(existing_categories)} категорий.")
    except Exception as e:
        print(f"⚠️ Ошибка автозаполнения категорий: {e}")
    
    conn.close()
    print("ℹ️ Проверка структуры базы завершена.")

fix_db()

NP_API_KEY = "02971cadca463a19240b2a8798ee7817"
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
MY_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def get_db_connection():
    conn = sqlite3.connect('shop.db')
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
                <table id="ordersTable">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>City</th>
                            <th>Warehouse</th>
                            <th>Total</th>
                            <th>Товары</th>
                            <th>Status</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody id="ordersBody">
                        <tr><td colspan="9" style="text-align: center; color: #999;">Загрузка...</td></tr>
                    </tbody>
                </table>
            </div>
            <script>
                async function loadOrders() {
                    try {
                        const response = await fetch('/api/orders');
                        const orders = await response.json();
                        const tbody = document.getElementById('ordersBody');
                        
                        if (orders.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #999;">Нет заказов</td></tr>';
                            return;
                        }
                        
                        tbody.innerHTML = orders.map(order => {
                            let itemsDisplay = '-';
                            try {
                                if (order.items) {
                                    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                                    if (Array.isArray(items) && items.length > 0) {
                                        itemsDisplay = items.map(item => {
                                            const name = item.name || 'Товар';
                                            const qty = item.quantity || 1;
                                            return `${name} (${qty})`;
                                        }).join(', ');
                                    }
                                }
                            } catch (e) {
                                itemsDisplay = '-';
                            }
                            
                            const date = order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : '-';
                            
                            return `
                                <tr>
                                    <td>${order.id || '-'}</td>
                                    <td>${order.name || order.user_email || '-'}</td>
                                    <td>${order.phone || '-'}</td>
                                    <td>${order.city || '-'}</td>
                                    <td>${order.warehouse || '-'}</td>
                                    <td>${order.total || order.total_price || 0} ₴</td>
                                    <td>${itemsDisplay}</td>
                                    <td><span class="status status-new">${order.status || 'New'}</span></td>
                                    <td>${date}</td>
                                </tr>
                            `;
                        }).join('');
                    } catch (error) {
                        console.error('Error loading orders:', error);
                        document.getElementById('ordersBody').innerHTML = 
                            '<tr><td colspan="9" style="text-align: center; color: #f00;">Ошибка загрузки заказов</td></tr>';
                    }
                }
                
                // Load orders when page loads
                loadOrders();
                
                // Refresh every 30 seconds
                setInterval(loadOrders, 30000);
            </script>
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

@app.post("/api/import_xml")
async def import_xml_from_url(request: XMLImportRequest):
    import sqlite3
    try:
        # Fetch XML from URL
        response = requests.get(request.url, timeout=30)
        response.raise_for_status()
        xml_text = response.text
        
        # Parse XML
        tree = ET.fromstring(xml_text)
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        count = 0
        
        # Try to find products in different possible tags
        items = tree.findall('.//product') + tree.findall('.//offer') + tree.findall('.//item')
        
        for item in items:
            try:
                # Extract fields with fallbacks
                name = item.findtext('name', default='') or item.findtext('title', default='') or 'Без названия'
                price_text = item.findtext('price', default='0') or item.findtext('cost', default='0')
                price = int(''.join(filter(str.isdigit, price_text))) if price_text else 0
                image = item.findtext('image', default='') or item.findtext('picture', default='') or item.findtext('url', default='')
                description = item.findtext('description', default='') or item.findtext('desc', default='')
                weight = item.findtext('weight', default='') or item.findtext('mass', default='') or None
                ingredients = item.findtext('ingredients', default='') or None
                category = item.findtext('categoryId', default='') or item.findtext('category', default='') or item.findtext('category_id', default='') or None
                # New fields for supplements
                composition = item.findtext('composition', default='') or item.findtext('склад', default='') or None
                usage = item.findtext('usage', default='') or item.findtext('прийом', default='') or item.findtext('прием', default='') or None
                pack_sizes = item.findtext('pack_sizes', default='') or item.findtext('фасування', default='') or item.findtext('packaging', default='') or None
                
                # Insert into database
                cursor.execute("""
                    INSERT INTO products (name, price, image, description, weight, ingredients, category, composition, usage, pack_sizes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (name, price, image, description, weight, ingredients, category, composition, usage, pack_sizes))
                count += 1
            except Exception as e:
                print(f"Error processing item: {e}")
                continue
        
        conn.commit()
        conn.close()
        return {"message": f"Successfully imported {count} products", "count": count}
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch XML from URL: {str(e)}")
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse XML: {str(e)}")
    except Exception as e:
        print(f"Error importing XML: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    """Проверка доступности сервера"""
    return JSONResponse(content={"status": "ok", "message": "Server is running"})

@app.get("/admin")
async def read_admin():
    return FileResponse('admin.html')

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

@app.post("/monobank-webhook")
async def monobank_webhook(request: Request):
    try:
        data = await request.json()
        print(f"🔔 Webhook received: {data}")
        
        # Monobank sends 'status': 'success' when paid
        if data.get('status') == 'success':
            invoice_id = data.get('invoiceId')
            
            # Find order in DB
            conn = sqlite3.connect('shop.db')
            cursor = conn.cursor()
            cursor.execute("SELECT id, total, items, user_email FROM orders WHERE invoiceId = ?", (invoice_id,))
            order = cursor.fetchone()
            
            if order:
                # Update status to Paid
                cursor.execute("UPDATE orders SET status = 'Paid' WHERE invoiceId = ?", (invoice_id,))
                conn.commit()
                
                # Send Telegram Notification
                order_id, total, items_json, user_email = order
                msg = f"✅ <b>ОПЛАТА ПРОШЛА!</b>\n\n💰 Сумма: {total} грн\n📧 Клиент: {user_email}\n📦 Заказ #{order_id}"
                
                # Send to TG
                token = os.getenv("TELEGRAM_BOT_TOKEN")
                chat_id = os.getenv("TELEGRAM_CHAT_ID")
                if token and chat_id:
                    url = f"https://api.telegram.org/bot{token}/sendMessage"
                    async with httpx.AsyncClient() as client:
                        await client.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})
                        print("✈️ Telegram sent!")
                else:
                    print("⚠️ Telegram token or chat_id not configured")
            
            conn.close()
            
        return {"status": "ok"}
        
    except Exception as e:
        print(f"❌ Webhook error: {e}")
        return {"status": "error"}

@app.get("/get_cities")
async def get_cities(search: str = ""):
    import requests
    
    if not search or len(search) < 2:
        return JSONResponse(content={"success": False, "data": [], "message": "Search query too short"})
    
    url = "https://api.novaposhta.ua/v2.0/json/"
    api_key = NP_API_KEY
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    # Метод 1: searchSettlements
    data_search = {
        "apiKey": api_key,
        "modelName": "Address",
        "calledMethod": "searchSettlements",
        "methodProperties": {
            "CityName": search,
            "Limit": "50",
            "Page": "1"
        }
    }

    try:
        response = requests.post(url, json=data_search, headers=headers, timeout=20)
        print(f"DEBUG Request URL: {url}, Search: '{search}'")
        print(f"DEBUG Request status: {response.status_code}")
        
        if response.status_code == 200:
            res_json = response.json()
            print(f"DEBUG Nova Poshta searchSettlements response: success={res_json.get('success')}")
            print(f"DEBUG Errors: {res_json.get('errors')}")
            print(f"DEBUG Warnings: {res_json.get('warnings')}")
            print(f"DEBUG Data type: {type(res_json.get('data'))}, Length: {len(res_json.get('data', [])) if res_json.get('data') else 0}")
            
            if not res_json.get('success'):
                print(f"DEBUG API returned success=False, errors: {res_json.get('errors')}")
            
            if res_json.get('success') and res_json.get('data'):
                cities = []
                data_list = res_json['data']
                print(f"DEBUG Processing {len(data_list)} settlement groups")
                
                # Обрабатываем структуру ответа searchSettlements
                for idx, settlement_group in enumerate(data_list):
                    print(f"DEBUG Group {idx}: type={type(settlement_group)}, keys={settlement_group.keys() if isinstance(settlement_group, dict) else 'not dict'}")
                    if isinstance(settlement_group, dict):
                        # Попробуем разные варианты ключей
                        addresses = settlement_group.get('Addresses') or settlement_group.get('addresses') or []
                        if addresses:
                            print(f"DEBUG Found {len(addresses)} addresses in group {idx}")
                            for item in addresses:
                                city_ref = item.get('DeliveryCity') or item.get('CityRef') or item.get('DeliveryCityRef', '')
                                description = item.get('Present') or item.get('Description') or item.get('SettlementDescription', '')
                                if city_ref and description:
                                    cities.append({
                                        "Ref": city_ref,
                                        "Description": description
                                    })
                
                # Убираем дубликаты по Ref
                seen = set()
                unique_cities = []
                for city in cities:
                    if city['Ref'] not in seen:
                        seen.add(city['Ref'])
                        unique_cities.append(city)
                
                print(f"DEBUG Found {len(unique_cities)} unique cities")
                if unique_cities:
                    result = {"success": True, "data": unique_cities[:50]}  # Ограничиваем до 50
                    print(f"DEBUG Returning success result with {len(result['data'])} cities")
                    return JSONResponse(content=result)
                else:
                    print(f"DEBUG No cities found in response data")
            else:
                print(f"DEBUG No data in response or success=False")
        
        # Метод 2: getCities (если searchSettlements не сработал)
        print("Trying getCities as fallback...")
        data_cities = {
            "apiKey": api_key,
            "modelName": "Address",
            "calledMethod": "getCities",
            "methodProperties": {}
        }
        
        response2 = requests.post(url, json=data_cities, headers=headers, timeout=20)
        if response2.status_code == 200:
            res_json2 = response2.json()
            if res_json2.get('success') and res_json2.get('data'):
                # Фильтруем города по поисковому запросу
                search_lower = search.lower()
                filtered_cities = []
                for city in res_json2['data']:
                    description = city.get('Description', '')
                    if search_lower in description.lower():
                        filtered_cities.append({
                            "Ref": city.get('Ref', ''),
                            "Description": description
                        })
                
                print(f"DEBUG getCities fallback found {len(filtered_cities)} cities")
                if filtered_cities:
                    result = {"success": True, "data": filtered_cities[:50]}
                    return JSONResponse(content=result)
                    
    except Exception as e:
        print(f"🔥 NP Error (Cities): {e}")
        import traceback
        traceback.print_exc()
    
    result = {"success": False, "data": [], "message": "No cities found"}
    print(f"DEBUG Returning final result: {result}")
    return JSONResponse(content=result)

@app.post("/get_warehouses")
async def get_warehouses(request: Request):
    import requests
    try:
        body = await request.json()
        city_ref = body.get('cityRef')
        if not city_ref:
            return []

        url = "https://api.novaposhta.ua/v2.0/json/"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/json'
        }
        
        data = {
            "apiKey": NP_API_KEY,
            "modelName": "Address",
            "calledMethod": "getWarehouses",
            "methodProperties": {
                "CityRef": city_ref
            }
        }

        response = requests.post(url, json=data, headers=headers, timeout=15)
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get('success'):
                warehouses = []
                for item in res_json['data']:
                    warehouses.append({
                        "Ref": item['Ref'],
                        "Description": item['Description']
                    })
                return warehouses
                
    except Exception as e:
        print(f"🔥 NP Error (Warehouses): {e}")

    return []

def send_telegram_notification(order_data):
    """Отправляет уведомление о новом заказе в Telegram"""
    if not TELEGRAM_TOKEN or not MY_CHAT_ID:
        print("⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping notification.")
        return
    
    # Безопасное извлечение данных с проверкой на None
    name = order_data.get('name') or 'Не указано'
    phone = order_data.get('phone') or 'Не указано'
    city = order_data.get('city') or 'Не указано'
    warehouse = order_data.get('warehouse') or 'Не указано'
    total = order_data.get('total') or 0
    order_id = order_data.get('order_id', 'N/A')
    payment_method = order_data.get('payment_method', 'card')
    
    payment_method_text = "💳 Онлайн оплата" if payment_method == 'card' else "💵 Накладений платіж"
    
    message = f"""🚀 НОВЫЙ ЗАКАЗ #{order_id}!
👤 Клиент: {name}
📞 Телефон: {phone}
📍 Город: {city}
📦 Склад: {warehouse}
💰 Сумма: {total} грн
{payment_method_text}"""
    
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": MY_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        print(f"✅ Telegram notification sent successfully for order {order_id}")
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to send Telegram notification: {str(e)}")
        # Не пробрасываем исключение дальше, чтобы не сломать создание заказа
    except Exception as e:
        print(f"❌ Unexpected error in Telegram notification: {str(e)}")

class Item(BaseModel):
    id: Any             # Accept string or int
    name: str
    price: Any          # Accept string or number
    image: Optional[str] = "" 
    quantity: Optional[int] = 1
    unit: Optional[str] = None
    packSize: Optional[Any] = None

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
    packSize: Optional[Any] = None
    unit: Optional[str] = None

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

class Product(BaseModel):
    id: int
    name: str
    price: int
    image: str
    description: Optional[str] = None
    category: Optional[str] = None
    # ADD THESE NEW FIELDS:
    weight: Optional[str] = None
    composition: Optional[str] = None
    usage: Optional[str] = None
    pack_sizes: Optional[List[str]] = None  # Returned as list from API
    old_price: Optional[float] = None  # For discount logic
    unit: Optional[str] = "шт"  # Measurement unit (e.g., "г", "мл")

    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    name: str
    price: int
    image: Optional[str] = ""
    description: Optional[str] = ""
    weight: Optional[str] = None
    ingredients: Optional[str] = None
    category: Optional[str] = None
    composition: Optional[str] = None  # Склад
    usage: Optional[str] = None  # Прийом
    pack_sizes: Optional[Union[str, List[str]]] = None  # Фасування - accepts string or list, converted to string in endpoint
    old_price: Optional[float] = None  # For discount logic
    unit: Optional[str] = "шт"  # Measurement unit (e.g., "г", "мл")

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[int] = None
    image: Optional[str] = None
    description: Optional[str] = None
    weight: Optional[str] = None
    ingredients: Optional[str] = None
    category: Optional[str] = None
    composition: Optional[str] = None  # Склад
    usage: Optional[str] = None  # Прийом
    pack_sizes: Optional[Union[str, List[str]]] = None  # Фасування - accepts string or list
    old_price: Optional[float] = None  # For discount logic
    unit: Optional[str] = None  # Measurement unit (e.g., "г", "мл")

class CategoryCreate(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: str

@app.get("/products", response_model=List[Product])
async def get_products():
    try:
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row # Allow accessing columns by name
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM products")
        rows = cursor.fetchall()

        results = []
        for row in rows:
            item = dict(row)

            # Safe Pack Sizes
            pack_sizes_val = item.get("pack_sizes")
            if pack_sizes_val and isinstance(pack_sizes_val, str):
                item["pack_sizes"] = [x.strip() for x in pack_sizes_val.split(",") if x.strip()]
            else:
                item["pack_sizes"] = []

            # Safe Unit
            if not item.get("unit"):
                item["unit"] = "шт"

            results.append(item)

        conn.close()
        return results
    except Exception as e:
        print(f"CRITICAL ERROR in GET /products: {e}")
        return [] # Return empty list instead of crashing

@app.post("/products")
async def create_product(product: ProductCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Handle pack_sizes: convert array to comma-separated string if needed
        pack_sizes_str = ", ".join(str(x) for x in product.pack_sizes) if isinstance(product.pack_sizes, list) else (product.pack_sizes or "")
        
        cursor.execute('''
            INSERT INTO products (name, price, description, category, image, composition, weight, pack_sizes, old_price, unit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (product.name, product.price, product.description, product.category, product.image, product.composition, product.weight, pack_sizes_str, product.old_price, product.unit))
        conn.commit()
        product_id = cursor.lastrowid
        conn.close()
        return {"id": product_id, "message": "Product created successfully"}
    except Exception as e:
        conn.close()
        print(f"Error creating product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- UPDATE PRODUCT ---
@app.put("/products/{product_id}")
async def update_product(product_id: int, product: ProductUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Ensure database schema columns exist
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN pack_sizes TEXT")
        conn.commit()
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN old_price REAL")
        conn.commit()
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'шт'")
        conn.commit()
    except Exception:
        pass
    
    # 2. Prepare other fields
    unit_val = product.unit if product.unit else "шт"
    old_price_val = product.old_price
    
    # Logic to ensure string format before binding
    safe_pack_sizes = ", ".join(str(x) for x in product.pack_sizes) if isinstance(product.pack_sizes, list) else str(product.pack_sizes or "")
    
    print(f"DEBUG UPDATE: ID={product_id}, Unit={unit_val}, OldPrice={old_price_val}, Packs={safe_pack_sizes}")

    try:
        # 3. Execute SQL with EXPLICIT fields
        cursor.execute("""
            UPDATE products 
            SET name=?, price=?, description=?, category=?, image=?, composition=?, weight=?, pack_sizes=?, old_price=?, unit=? 
            WHERE id=?
        """, (
            product.name, 
            product.price, 
            product.description, 
            product.category, 
            product.image, 
            product.composition, 
            product.weight, 
            safe_pack_sizes,  # <--- Explicitly use the converted string variable
            old_price_val, 
            unit_val, 
            product_id
        ))
        conn.commit()
    except Exception as e:
        print(f"CRITICAL SQL ERROR: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
        
    return {"message": "Product updated successfully"}

@app.delete("/products/{product_id}")
async def delete_product(product_id: int):
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="Product not found")
        
        conn.close()
        return {"message": "Product deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.close()
        print(f"Error deleting product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/categories")
async def get_categories():
    import sqlite3
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM categories ORDER BY name")
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching categories: {e}")
        return []
    finally:
        conn.close()

@app.post("/categories")
async def create_category(category: CategoryCreate):
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO categories (name) VALUES (?)", (category.name,))
        conn.commit()
        category_id = cursor.lastrowid
        conn.close()
        return {"id": category_id, "message": "Category created successfully"}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    except Exception as e:
        conn.close()
        print(f"Error creating category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- UPDATE CATEGORY ---
@app.put("/categories/{category_id}")
async def update_category(category_id: int, request: Request):
    import sqlite3
    data = await request.json()
    new_name = data.get('name')
    
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    try:
        # 1. Get old name
        cursor.execute("SELECT name FROM categories WHERE id=?", (category_id,))
        old_name = cursor.fetchone()[0]
        
        # 2. Update category table
        cursor.execute("UPDATE categories SET name=? WHERE id=?", (new_name, category_id))
        
        # 3. Update all products that had the old category name
        cursor.execute("UPDATE products SET category=? WHERE category=?", (new_name, old_name))
        
        conn.commit()
        return {"status": "updated"}
    except Exception as e:
        print(f"Error updating category: {e}")
        return {"error": str(e)}
    finally:
        conn.close()

@app.delete("/categories/{category_id}")
async def delete_category(category_id: int):
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    try:
        # Check if category exists
        cursor.execute("SELECT name FROM categories WHERE id = ?", (category_id,))
        category = cursor.fetchone()
        
        if not category:
            conn.close()
            raise HTTPException(status_code=404, detail="Category not found")
        
        category_name = category[0]
        
        # Set products with this category to "Uncategorized"
        cursor.execute("UPDATE products SET category = 'Uncategorized' WHERE category = ?", (category_name,))
        
        # Delete the category
        cursor.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        conn.commit()
        conn.close()
        return {"message": "Category deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.close()
        print(f"Error deleting category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/orders") # Ensure this matches what admin.html calls
async def get_orders():
    import sqlite3
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        # Order by newest first
        cursor.execute("SELECT * FROM orders ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error orders: {e}")
        return []
    finally:
        conn.close()

@app.put("/orders/{order_id}/status")
async def update_order_status(order_id: int, request: Request):
    """Update the status of an order by ID"""
    import sqlite3
    import json
    
    try:
        # Get new_status from JSON body
        data = await request.json()
        new_status = data.get('new_status') or data.get('status')
        
        if not new_status:
            raise HTTPException(status_code=400, detail="new_status is required in request body")
        
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # Check if order exists
        cursor.execute("SELECT id FROM orders WHERE id = ?", (order_id,))
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Order with id {order_id} not found")
        
        # Update the status
        cursor.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, order_id))
        conn.commit()
        conn.close()
        
        return {
            "message": "Order status updated successfully",
            "order_id": order_id,
            "new_status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        print(f"Error updating order status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create_order")
async def create_order(order_data: OrderRequest):
    import sqlite3, json, os, httpx
    from datetime import datetime
    
    print(f"📥 Получены данные от приложения: {order_data.dict()}")

    # Настройка Webhook (ТВОЙ NGROK)
    CURRENT_NGROK = "https://farrah-unenlightening-oversorrowfully.ngrok-free.dev"
    WEBHOOK_URL = f"{CURRENT_NGROK}/monobank-webhook"

    try:
        # Конвертируем totalPrice в копейки для Monobank (умножаем на 100)
        amount = order_data.totalPrice * 100
        
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # Сохраняем ВСЕ поля из OrderRequest
        cursor.execute("""
            INSERT INTO orders (
                name, phone, city, cityRef, warehouse, warehouseRef,
                items, total, totalPrice, status, payment_method, date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            order_data.name,
            order_data.phone,
            order_data.city,
            order_data.cityRef,
            order_data.warehouse,
            order_data.warehouseRef,
            json.dumps([item.dict() for item in order_data.items]),
            order_data.totalPrice,  # total для совместимости
            order_data.totalPrice,  # totalPrice
            "New",
            order_data.payment_method,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ))
        order_id = cursor.lastrowid
        conn.commit()
        
        # Отправляем Telegram уведомление (с обработкой ошибок)
        try:
            send_telegram_notification({
                'name': order_data.name,
                'phone': order_data.phone,
                'city': order_data.city,
                'warehouse': order_data.warehouse,
                'total': order_data.totalPrice,
                'payment_method': order_data.payment_method,
                'order_id': order_id
            })
        except Exception as tg_error:
            print(f"⚠️ Ошибка отправки Telegram уведомления: {tg_error}")
            # Не прерываем выполнение, если Telegram не работает
        
        # Логика оплаты
        if order_data.payment_method == "card":
            payload = {
                "amount": amount,
                "ccy": 980,
                "merchantPaymInfo": {
                    "reference": str(order_id),
                    "destination": "Test Purchase"
                },
                "redirectUrl": "https://google.com",
                "webHookUrl": WEBHOOK_URL
            }
            
            token = os.getenv("MONOBANK_API_TOKEN")
            if not token: 
                # Пробуем найти вручную, если env не сработал
                try:
                     with open('.env', 'r') as f:
                        for line in f:
                            if "MONOBANK_API_TOKEN" in line:
                                token = line.split('=')[1].strip()
                except: pass

            if not token:
                print("❌ Нет токена!")
                return {"error": "No token"}

            async with httpx.AsyncClient() as client:
                resp = await client.post("https://api.monobank.ua/api/merchant/invoice/create", 
                                         headers={'X-Token': token}, 
                                         json=payload)
                
                if resp.status_code == 200:
                    res_json = resp.json()
                    cursor.execute("UPDATE orders SET invoiceId = ? WHERE id = ?", (res_json['invoiceId'], order_id))
                    conn.commit()
                    conn.close()
                    return {"payment_url": res_json['pageUrl']}
                else:
                    print(f"❌ Ошибка банка: {resp.text}")
        
        conn.close()
        return {"message": "Created", "order_id": order_id}

    except Exception as e:
        print(f"🔥 ОШИБКА: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # Используем 0.0.0.0 чтобы слушать на всех интерфейсах
    # Это позволит подключаться и по localhost, и по IP адресу
    uvicorn.run(app, host="0.0.0.0", port=8000)
