from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse, StreamingResponse
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
import csv
import io
import pandas as pd
import uuid
from openai import OpenAI
from dotenv import load_dotenv
from PIL import Image as PILImage
import io
from typing import Optional
import logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Настройка логирования
logging.basicConfig(
    level=logging.INFO if os.getenv("ENVIRONMENT") == "production" else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Загружаем переменные окружения из .env
load_dotenv()

# Определяем окружение
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

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
                    logger.info(f"✅ Токен найден вручную: {value[:5]}...")
except Exception as e:
    logger.warning(f"⚠️ Не удалось прочитать .env вручную: {e}")

# Проверка
TOKEN = os.getenv("MONOBANK_API_TOKEN")
if not TOKEN:
    logger.error("❌ КРИТИЧЕСКАЯ ОШИБКА: Токен всё ещё не найден!")
else:
    logger.info("🚀 Система готова к оплате.")

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
        logger.info("🗑️ Старая таблица orders удалена.")

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
        logger.info("✨ Новая таблица orders создана с нуля!")
    except Exception as e:
        logger.error(f"⚠️ Ошибка сброса БД: {e}")

# Вызываем один раз, чтобы починить базу
reset_orders_table()
# -----------------------

app = FastAPI()

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Настройка CORS в зависимости от окружения
if IS_PRODUCTION:
    # В продакшене разрешаем только конкретные домены
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
    allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]
    if not allowed_origins:
        logger.warning("⚠️ ALLOWED_ORIGINS не настроен для продакшена! Используется '*' (небезопасно)")
        allowed_origins = ["*"]
else:
    # В разработке разрешаем все
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    logger.warning(f"⚠️ Could not mount static files: {e}")

# Create uploads directory if it doesn't exist
UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
logger.info(f"✅ Uploads directory ready: {UPLOADS_DIR}")

# Mount uploads directory for serving uploaded files
try:
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    logger.info(f"✅ Static files mounted: /uploads -> {UPLOADS_DIR}")
except Exception as e:
    logger.warning(f"⚠️ Could not mount uploads directory: {e}")

DB_NAME = 'shop.db'

def fix_db():
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    
    # Добавляем колонку payment_method
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash'")
        conn.commit()
        logger.info("✅ База обновлена: колонка payment_method добавлена.")
    except Exception:
        pass
    
    # Добавляем колонку invoice_id для связи с Monobank
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN invoice_id TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка invoice_id добавлена.")
    except Exception:
        pass
    
    # Добавляем колонку status для отслеживания статуса оплаты
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'Pending'")
        conn.commit()
        logger.info("✅ База обновлена: колонка status добавлена.")
    except Exception:
        pass
    
    # Создаем таблицу products (если не существует)
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price INTEGER NOT NULL,
                image TEXT,
                description TEXT,
                weight TEXT,
                ingredients TEXT,
                category TEXT,
                composition TEXT,
                usage TEXT,
                pack_sizes TEXT,
                old_price REAL,
                unit TEXT DEFAULT 'шт',
                variants TEXT
            )
        ''')
        conn.commit()
        logger.info("✅ Таблица products создана.")
    except Exception as e:
        logger.error(f"⚠️ Ошибка создания таблицы products: {e}")
    
    # Добавляем колонки в таблицу products (если они еще не существуют)
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN weight TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка weight добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN ingredients TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка ingredients добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN category TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка category добавлена в products.")
    except Exception:
        pass
    
    # Добавляем новые колонки для добавок (Supplements)
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN composition TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка composition добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN usage TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка usage добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN pack_sizes TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка pack_sizes добавлена в products.")
    except Exception:
        pass
    
    # Добавляем новые колонки для цены и единиц измерения
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN old_price REAL")
        conn.commit()
        logger.info("✅ База обновлена: колонка old_price добавлена в products.")
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'шт'")
        conn.commit()
        logger.info("✅ База обновлена: колонка unit добавлена в products.")
    except Exception:
        pass
    
    # Добавляем колонку variants для вариантов фасовки с ценами
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN variants TEXT")
        conn.commit()
        logger.info("✅ База обновлена: колонка variants добавлена в products.")
    except Exception:
        pass
    
    # Миграция таблицы orders - добавляем новые поля если их нет
    try:
        cursor.execute("PRAGMA table_info(orders)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'name' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN name TEXT")
            logger.info("✅ Добавлена колонка name в orders")
        if 'phone' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN phone TEXT")
            logger.info("✅ Добавлена колонка phone в orders")
        if 'city' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN city TEXT")
            logger.info("✅ Добавлена колонка city в orders")
        if 'cityRef' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN cityRef TEXT")
            logger.info("✅ Добавлена колонка cityRef в orders")
        if 'warehouse' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN warehouse TEXT")
            logger.info("✅ Добавлена колонка warehouse в orders")
        if 'warehouseRef' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN warehouseRef TEXT")
            logger.info("✅ Добавлена колонка warehouseRef в orders")
        if 'totalPrice' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN totalPrice REAL")
            logger.info("✅ Добавлена колонка totalPrice в orders")
        if 'date' not in columns:
            cursor.execute("ALTER TABLE orders ADD COLUMN date TEXT DEFAULT (datetime('now', 'localtime'))")
            logger.info("✅ Добавлена колонка date в orders")
        
        conn.commit()
    except Exception as e:
        logger.error(f"⚠️ Ошибка миграции таблицы orders: {e}")
    
    # Создаем таблицу categories
    try:
        cursor.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)')
        conn.commit()
        logger.info("✅ Таблица categories создана.")
    except Exception as e:
        logger.error(f"⚠️ Ошибка создания таблицы categories: {e}")
    
    # Создаем таблицу banners
    try:
        cursor.execute('CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, image_url TEXT)')
        conn.commit()
        logger.info("✅ Таблица banners создана.")
    except Exception as e:
        logger.error(f"⚠️ Ошибка создания таблицы banners: {e}")
    
    # Автоматическая миграция категорий из существующих продуктов
    try:
        cursor.execute("""
            INSERT OR IGNORE INTO categories (name) 
            SELECT DISTINCT category FROM products 
            WHERE category IS NOT NULL AND category != ''
        """)
        conn.commit()
        # Подсчитываем количество добавленных категорий
        cursor.execute("SELECT COUNT(*) FROM categories")
        count = cursor.fetchone()[0]
        logger.info(f"✅ Автоматическая миграция категорий выполнена. Всего категорий: {count}")
    except Exception as e:
        logger.error(f"⚠️ Ошибка автоматической миграции категорий: {e}")
    
    # Вставляем дефолтные категории, если таблица пустая
    try:
        cursor.execute("SELECT COUNT(*) FROM categories")
        count = cursor.fetchone()[0]
        
        if count == 0:
            default_categories = ["Пицца", "Напитки", "Роллы"]
            for cat_name in default_categories:
                try:
                    cursor.execute("INSERT INTO categories (name) VALUES (?)", (cat_name,))
                except Exception:
                    pass  # Игнорируем дубликаты
            conn.commit()
            logger.info(f"✅ Добавлены дефолтные категории: {', '.join(default_categories)}")
    except Exception as e:
        logger.error(f"⚠️ Ошибка добавления дефолтных категорий: {e}")
    
    conn.close()
    logger.info("ℹ️ Проверка структуры базы завершена.")

fix_db()

# API ключи из переменных окружения
NP_API_KEY = os.getenv("NOVA_POSHTA_API_KEY", "")
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
        logger.info(f"Успешно загружено товаров: {count}")
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
                logger.error(f"Error processing item: {e}")
                continue
        
        conn.commit()
        conn.close()
        return {"message": f"Successfully imported {count} products", "count": count}
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch XML from URL: {str(e)}")
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse XML: {str(e)}")
    except Exception as e:
        logger.error(f"Error importing XML: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Максимальный размер файла (10 MB)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

@app.post("/upload")
@limiter.limit("10/minute")
async def upload_image(request: Request, file: UploadFile = File(...)):
    """Upload an image file and return its URL"""
    try:
        # Validate file type (only images)
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Validate file extension
        file_extension = os.path.splitext(file.filename)[1].lower() if file.filename else ''
        if file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"File extension not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content
        content = await file.read()
        
        # Validate file size
        file_size = len(content)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {MAX_FILE_SIZE / (1024 * 1024):.1f} MB"
            )
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Generate unique filename
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        file_path = os.path.join(UPLOADS_DIR, unique_filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        # Return relative path (client will prepend API_URL)
        file_path_relative = f"/uploads/{unique_filename}"
        
        logger.info(f"✅ File uploaded: {unique_filename} ({file_size / 1024:.1f} KB) -> {file_path_relative}")
        return {"url": file_path_relative, "filename": unique_filename}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@app.post("/upload_csv")
async def upload_csv(file: UploadFile = File(...)):
    """
    Import products from CSV file.
    Expected columns: name, price, category, image_url, description, unit, pack_sizes
    """
    import sqlite3
    try:
        # Read file content
        content = await file.read()
        
        # Try to decode as UTF-8
        try:
            csv_text = content.decode('utf-8')
        except UnicodeDecodeError:
            # Try other common encodings
            try:
                csv_text = content.decode('utf-8-sig')  # Handle BOM
            except UnicodeDecodeError:
                try:
                    csv_text = content.decode('latin-1')
                except UnicodeDecodeError:
                    raise HTTPException(status_code=400, detail="Unable to decode file. Please use UTF-8 encoding.")
        
        # Detect delimiter (comma or semicolon)
        # Check first line for delimiter
        first_line = csv_text.split('\n')[0] if '\n' in csv_text else csv_text
        delimiter = ','
        if ';' in first_line and first_line.count(';') > first_line.count(','):
            delimiter = ';'
        
        # Parse CSV
        csv_reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)
        
        # Validate required columns
        required_columns = ['name', 'price']
        fieldnames = csv_reader.fieldnames or []
        missing_columns = [col for col in required_columns if col not in fieldnames]
        if missing_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_columns)}. Found columns: {', '.join(fieldnames)}"
            )
        
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        count = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (1 is header)
            try:
                # Extract fields with defaults
                name = row.get('name', '').strip() or 'Без названия'
                
                # Parse price (handle various formats)
                price_text = str(row.get('price', '0')).strip()
                price = int(''.join(filter(str.isdigit, price_text))) if price_text else 0
                
                # Map image_url to image (database column name)
                image = row.get('image_url', '').strip() or row.get('image', '').strip() or ''
                
                description = row.get('description', '').strip() or ''
                category = row.get('category', '').strip() or None
                unit = row.get('unit', '').strip() or 'шт'
                pack_sizes = row.get('pack_sizes', '').strip() or None
                
                # Optional fields (for consistency with XML import)
                weight = row.get('weight', '').strip() or None
                ingredients = row.get('ingredients', '').strip() or None
                composition = row.get('composition', '').strip() or None
                usage = row.get('usage', '').strip() or None
                
                # Insert into database using the same logic as XML import
                cursor.execute("""
                    INSERT INTO products (name, price, image, description, weight, ingredients, category, composition, usage, pack_sizes, unit)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (name, price, image, description, weight, ingredients, category, composition, usage, pack_sizes, unit))
                count += 1
                
            except Exception as e:
                error_msg = f"Error processing row {row_num}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)
                continue
        
        conn.commit()
        conn.close()
        
        result = {
            "message": f"Successfully imported {count} products",
            "count": count
        }
        
        if errors:
            result["warnings"] = errors[:10]  # Limit to first 10 errors
            result["error_count"] = len(errors)
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except csv.Error as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {str(e)}")
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
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
        logger.info(f"🔔 Webhook received: {data}")
        
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
                        logger.info("✈️ Telegram sent!")
                else:
                    logger.warning("⚠️ Telegram token or chat_id not configured")
            
            conn.close()
            
        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
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
        logger.debug(f"DEBUG Request URL: {url}, Search: '{search}'")
        logger.debug(f"DEBUG Request status: {response.status_code}")
        
        if response.status_code == 200:
            res_json = response.json()
            logger.debug(f"DEBUG Nova Poshta searchSettlements response: success={res_json.get('success')}")
            logger.debug(f"DEBUG Errors: {res_json.get('errors')}")
            logger.debug(f"DEBUG Warnings: {res_json.get('warnings')}")
            logger.debug(f"DEBUG Data type: {type(res_json.get('data'))}, Length: {len(res_json.get('data', [])) if res_json.get('data') else 0}")
            
            if not res_json.get('success'):
                logger.warning(f"DEBUG API returned success=False, errors: {res_json.get('errors')}")
            
            if res_json.get('success') and res_json.get('data'):
                cities = []
                data_list = res_json['data']
                logger.debug(f"DEBUG Processing {len(data_list)} settlement groups")
                
                # Обрабатываем структуру ответа searchSettlements
                for idx, settlement_group in enumerate(data_list):
                    logger.debug(f"DEBUG Group {idx}: type={type(settlement_group)}, keys={settlement_group.keys() if isinstance(settlement_group, dict) else 'not dict'}")
                    if isinstance(settlement_group, dict):
                        # Попробуем разные варианты ключей
                        addresses = settlement_group.get('Addresses') or settlement_group.get('addresses') or []
                        if addresses:
                            logger.debug(f"DEBUG Found {len(addresses)} addresses in group {idx}")
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
                
                logger.debug(f"DEBUG Found {len(unique_cities)} unique cities")
                if unique_cities:
                    result = {"success": True, "data": unique_cities[:50]}  # Ограничиваем до 50
                    logger.debug(f"DEBUG Returning success result with {len(result['data'])} cities")
                    return JSONResponse(content=result)
                else:
                    logger.debug(f"DEBUG No cities found in response data")
            else:
                logger.debug(f"DEBUG No data in response or success=False")
        
        # Метод 2: getCities (если searchSettlements не сработал)
        logger.warning("Trying getCities as fallback...")
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
                
                logger.debug(f"DEBUG getCities fallback found {len(filtered_cities)} cities")
                if filtered_cities:
                    result = {"success": True, "data": filtered_cities[:50]}
                    return JSONResponse(content=result)
                    
    except Exception as e:
        logger.error(f"🔥 NP Error (Cities): {e}")
        import traceback
        traceback.print_exc()
    
    result = {"success": False, "data": [], "message": "No cities found"}
    logger.debug(f"DEBUG Returning final result: {result}")
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
        logger.error(f"🔥 NP Error (Warehouses): {e}")

    return []

def send_telegram_notification(order_data):
    """Отправляет уведомление о новом заказе в Telegram"""
    if not TELEGRAM_TOKEN or not MY_CHAT_ID:
        logger.warning("⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping notification.")
        return
    
    # Безопасное извлечение данных с проверкой на None
    name = order_data.get('name') or 'Не указано'
    phone = order_data.get('phone') or 'Не указано'
    city = order_data.get('city') or 'Не указано'
    warehouse = order_data.get('warehouse') or 'Не указано'
    total = order_data.get('total') or 0
    order_id = order_data.get('order_id', 'N/A')
    payment_method = order_data.get('payment_method', 'card')
    items = order_data.get('items', [])
    
    payment_method_text = "💳 Онлайн оплата" if payment_method == 'card' else "💵 Накладений платіж"
    
    # Формируем список товаров
    items_list = []
    if items:
        items_list.append("🛒 ЗАКАЗ:")
        for item in items:
            product_name = item.get('name', 'Товар')
            quantity = item.get('quantity', 1)
            unit = item.get('unit') or ''
            pack_size = item.get('packSize') or item.get('pack_size') or ''
            
            # Формируем строку с единицей измерения или размером упаковки
            unit_info = ''
            if pack_size:
                unit_info = f" ({pack_size})"
            elif unit:
                unit_info = f" ({unit})"
            
            items_list.append(f"▪️ {product_name} x {quantity}{unit_info}")
    
    # Объединяем список товаров в строку
    items_text = '\n'.join(items_list) if items_list else ''
    
    message = f"""🚀 НОВЫЙ ЗАКАЗ #{order_id}!
👤 Клиент: {name}
📞 Телефон: {phone}
📍 Город: {city}
📦 Склад: {warehouse}
{items_text}
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
        logger.info(f"✅ Telegram notification sent successfully for order {order_id}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Failed to send Telegram notification: {str(e)}")
        # Не пробрасываем исключение дальше, чтобы не сломать создание заказа
    except Exception as e:
        logger.error(f"❌ Unexpected error in Telegram notification: {str(e)}")

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
    variant_info: Optional[str] = None  # Variant size information (e.g., "10 шт", "100 г")

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
    picture: Optional[str] = None  # For XML imports
    image_url: Optional[str] = None  # For CSV imports
    description: Optional[str] = None
    category: Optional[str] = None
    # ADD THESE NEW FIELDS:
    weight: Optional[str] = None
    composition: Optional[str] = None
    usage: Optional[str] = None
    pack_sizes: Optional[List[str]] = None  # Returned as list from API
    old_price: Optional[float] = None  # For discount logic
    unit: Optional[str] = "шт"  # Measurement unit (e.g., "г", "мл")
    variants: Optional[Any] = None  # Variants with prices: [{"size": "10 шт", "price": 100}, ...]

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
    variants: Optional[Any] = None  # Variants with prices: [{"size": "10 шт", "price": 100}, ...]

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
    variants: Optional[Any] = None  # Variants with prices: [{"size": "10 шт", "price": 100}, ...]

class CategoryBase(BaseModel):
    name: str

class Category(CategoryBase):
    id: int

    class Config:
        from_attributes = True

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(CategoryBase):
    pass

class Banner(BaseModel):
    image_url: str

class DeleteBatchRequest(BaseModel):
    ids: List[int]

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

            # Handle image fields: ensure picture always has a value if image_url exists
            # CSV imports save to 'image' column (mapped from image_url), XML may use 'picture' column
            image_value = item.get("image") or ""
            picture_value = item.get("picture") or ""
            image_url_value = item.get("image_url") or ""
            
            # First, set image_url from database 'image' column if image_url is empty
            # (CSV imports save image_url to 'image' column in DB)
            if not image_url_value:
                item["image_url"] = image_value
            
            # Critical: If picture is None/empty AND image_url has a value, assign picture = image_url
            # This ensures the frontend (which expects 'picture') always gets a valid URL for CSV-imported items
            if not picture_value and item.get("image_url"):
                item["picture"] = item["image_url"]
            # Fallback: if picture is empty but 'image' column has value, use it
            elif not picture_value and image_value:
                item["picture"] = image_value
                if not item.get("image_url"):
                    item["image_url"] = image_value

            # Safe Pack Sizes
            pack_sizes_val = item.get("pack_sizes")
            if pack_sizes_val and isinstance(pack_sizes_val, str):
                item["pack_sizes"] = [x.strip() for x in pack_sizes_val.split(",") if x.strip()]
            else:
                item["pack_sizes"] = []

            # Safe Unit
            if not item.get("unit"):
                item["unit"] = "шт"
            
            # Parse variants JSON if exists - CRITICAL: Always include variants field
            variants_val = item.get("variants")
            if variants_val and isinstance(variants_val, str):
                try:
                    parsed = json.loads(variants_val)
                    item["variants"] = parsed if parsed else None
                    logger.debug(f"✅ Product {item.get('id')} ({item.get('name')}): variants parsed = {parsed}")
                except Exception as e:
                    logger.warning(f"⚠️ Error parsing variants for product {item.get('id')}: {e}")
                    item["variants"] = None
            else:
                # Keep original value (could be None, empty string, or already parsed)
                item["variants"] = variants_val if variants_val else None
                if variants_val:
                    logger.debug(f"✅ Product {item.get('id')} ({item.get('name')}): variants (not string) = {variants_val}")
                else:
                    logger.debug(f"⚠️ Product {item.get('id')} ({item.get('name')}): variants is None/empty")

            # CRITICAL: Ensure variants field is always present in the dict
            if "variants" not in item:
                item["variants"] = None
                logger.warning(f"🔴 CRITICAL: Product {item.get('id')} missing variants field! Adding None.")

            results.append(item)

        conn.close()
        
        # Debug: Log first product to verify variants field
        if results and len(results) > 0:
            first_product = results[0]
            logger.debug(f"🔍 DEBUG GET /products: First product has variants field: {'variants' in first_product}")
            logger.debug(f"🔍 DEBUG GET /products: First product variants value: {first_product.get('variants')}")
            logger.debug(f"🔍 DEBUG GET /products: First product variants type: {type(first_product.get('variants'))}")
        
        return results
    except Exception as e:
        logger.error(f"CRITICAL ERROR in GET /products: {e}")
        return [] # Return empty list instead of crashing

@app.post("/products")
async def create_product(product: ProductCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Handle pack_sizes: convert array to comma-separated string if needed
        pack_sizes_str = ", ".join(str(x) for x in product.pack_sizes) if isinstance(product.pack_sizes, list) else (product.pack_sizes or "")
        
        # Handle variants: convert list to JSON string if needed
        variants_str = ""
        if product.variants:
            if isinstance(product.variants, list):
                variants_str = json.dumps(product.variants, ensure_ascii=False)
            elif isinstance(product.variants, str):
                variants_str = product.variants
        
        cursor.execute('''
            INSERT INTO products (name, price, description, category, image, composition, usage, weight, pack_sizes, old_price, unit, variants) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (product.name, product.price, product.description, product.category, product.image, product.composition, product.usage, product.weight, pack_sizes_str, product.old_price, product.unit, variants_str))
        conn.commit()
        product_id = cursor.lastrowid
        conn.close()
        return {"id": product_id, "message": "Product created successfully"}
    except Exception as e:
        conn.close()
        logger.error(f"Error creating product: {e}")
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
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN variants TEXT")
        conn.commit()
    except Exception:
        pass
    
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN usage TEXT")
        conn.commit()
    except Exception:
        pass
    
    # 2. Prepare other fields
    unit_val = product.unit if product.unit else "шт"
    old_price_val = product.old_price
    
    # Logic to ensure string format before binding
    safe_pack_sizes = ", ".join(str(x) for x in product.pack_sizes) if isinstance(product.pack_sizes, list) else str(product.pack_sizes or "")
    
    # Handle variants: convert list to JSON string if needed
    variants_str = ""
    if product.variants:
        if isinstance(product.variants, list):
            variants_str = json.dumps(product.variants, ensure_ascii=False)
        elif isinstance(product.variants, str):
            variants_str = product.variants
    
    logger.debug(f"DEBUG UPDATE: ID={product_id}, Unit={unit_val}, OldPrice={old_price_val}, Packs={safe_pack_sizes}, Variants={variants_str}")

    try:
        # 3. Execute SQL with EXPLICIT fields
        cursor.execute("""
            UPDATE products 
            SET name=?, price=?, description=?, category=?, image=?, composition=?, usage=?, weight=?, pack_sizes=?, old_price=?, unit=?, variants=? 
            WHERE id=?
        """, (
            product.name, 
            product.price, 
            product.description, 
            product.category, 
            product.image, 
            product.composition, 
            product.usage, 
            product.weight, 
            safe_pack_sizes,  # <--- Explicitly use the converted string variable
            old_price_val, 
            unit_val,
            variants_str,
            product_id
        ))
        conn.commit()
    except Exception as e:
        logger.error(f"CRITICAL SQL ERROR: {e}")
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
        logger.error(f"Error deleting product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/all-categories")
def get_categories():
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    # Ensure table exists just in case
    c.execute('CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)')
    
    # Auto-migrate if empty
    c.execute('SELECT count(*) FROM categories')
    if c.fetchone()[0] == 0:
        c.execute("INSERT OR IGNORE INTO categories (name) SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''")
        conn.commit()

    c.execute('SELECT * FROM categories')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/categories")
def create_category(category: CategoryCreate):
    try:
        conn = sqlite3.connect('shop.db')
        c = conn.cursor()
        c.execute('INSERT INTO categories (name) VALUES (?)', (category.name,))
        conn.commit()
        id = c.lastrowid
        conn.close()
        return {"id": id, "name": category.name}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Category already exists")

# --- UPDATE CATEGORY ---
@app.put("/categories/{category_id}")
async def update_category(category_id: int, category: CategoryUpdate):
    import sqlite3
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    try:
        # Check if category exists
        cursor.execute("SELECT name FROM categories WHERE id=?", (category_id,))
        result = cursor.fetchone()
        
        if not result:
            conn.close()
            raise HTTPException(status_code=404, detail="Category not found")
        
        old_name = result[0]
        
        # Update category table
        try:
            cursor.execute("UPDATE categories SET name=? WHERE id=?", (category.name, category_id))
            
            # Update all products that had the old category name
            cursor.execute("UPDATE products SET category=? WHERE category=?", (category.name, old_name))
            
            conn.commit()
            conn.close()
            return {"id": category_id, "message": "Category updated successfully"}
        except sqlite3.IntegrityError:
            conn.close()
            raise HTTPException(status_code=400, detail="Category with this name already exists")
    except HTTPException:
        raise
    except Exception as e:
        conn.close()
        logger.error(f"Error updating category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/categories/{category_id}")
def delete_category(category_id: int):
    conn = sqlite3.connect('shop.db')
    c = conn.cursor()
    # Uncategorize products linked to this category
    c.execute('SELECT name FROM categories WHERE id = ?', (category_id,))
    cat = c.fetchone()
    if cat:
        c.execute('UPDATE products SET category = NULL WHERE category = ?', (cat[0],))
    
    c.execute('DELETE FROM categories WHERE id = ?', (category_id,))
    conn.commit()
    conn.close()
    return {"message": "Deleted"}

@app.get("/banners")
def get_banners():
    conn = sqlite3.connect('shop.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM banners')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/banners")
def create_banner(banner: Banner):
    conn = sqlite3.connect('shop.db')
    c = conn.cursor()
    c.execute('INSERT INTO banners (image_url) VALUES (?)', (banner.image_url,))
    conn.commit()
    banner_id = c.lastrowid
    conn.close()
    return {"id": banner_id, "image_url": banner.image_url}

@app.delete("/banners/{banner_id}")
def delete_banner(banner_id: int):
    conn = sqlite3.connect('shop.db')
    c = conn.cursor()
    c.execute('DELETE FROM banners WHERE id = ?', (banner_id,))
    conn.commit()
    conn.close()
    return {"message": "Banner deleted"}

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
        logger.error(f"Error orders: {e}")
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
        logger.error(f"Error updating order status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/orders/{order_id}")
async def delete_order(order_id: int):
    """Delete an order by ID"""
    import sqlite3
    
    try:
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # Check if order exists
        cursor.execute("SELECT id FROM orders WHERE id = ?", (order_id,))
        order = cursor.fetchone()
        
        if not order:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Order with ID {order_id} not found")
        
        # Delete the order
        cursor.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()
        
        return {"message": f"Order {order_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        logger.error(f"Error deleting order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/orders/export")
async def export_orders_to_excel():
    """Export all orders to Excel file"""
    import sqlite3
    import json
    
    try:
        conn = sqlite3.connect('shop.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get all orders
        cursor.execute("SELECT * FROM orders ORDER BY id DESC")
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No orders found")
        
        # Convert rows to list of dictionaries
        orders_data = []
        for row in rows:
            order_dict = dict(row)
            # Parse items JSON if it exists
            if order_dict.get('items'):
                try:
                    order_dict['items'] = json.loads(order_dict['items'])
                except:
                    order_dict['items'] = []
            orders_data.append(order_dict)
        
        # Create DataFrame
        df = pd.DataFrame(orders_data)
        
        # Format items column for Excel display
        if 'items' in df.columns:
            def format_items_for_excel(items):
                """Format items list as readable string with variant_info support"""
                if not items:
                    return ""
                if isinstance(items, str):
                    try:
                        items = json.loads(items)
                    except:
                        return items
                
                if not isinstance(items, list):
                    return str(items)
                
                formatted_items = []
                for item in items:
                    if isinstance(item, dict):
                        name = item.get('name', 'Товар')
                        quantity = item.get('quantity', 1)
                        variant_info = item.get('variant_info')
                        
                        if variant_info:
                            # Format: "Название (вариант) x количество"
                            formatted_items.append(f"{name} ({variant_info}) x {quantity}")
                        else:
                            # Format: "Название x количество"
                            formatted_items.append(f"{name} x {quantity}")
                    else:
                        formatted_items.append(str(item))
                
                return ", ".join(formatted_items)
            
            # Convert items to formatted string representation for Excel
            df['items'] = df['items'].apply(format_items_for_excel)
        
        # Create Excel file in memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Orders')
        
        output.seek(0)
        
        # Return file as StreamingResponse
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=orders.xlsx"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        logger.error(f"Error exporting orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/orders/delete-batch")
async def delete_orders_batch(request: DeleteBatchRequest):
    """Delete multiple orders by IDs"""
    import sqlite3
    
    if not request.ids or len(request.ids) == 0:
        raise HTTPException(status_code=400, detail="No order IDs provided")
    
    try:
        conn = sqlite3.connect('shop.db')
        cursor = conn.cursor()
        
        # Create placeholders for IN clause (безопасный способ)
        placeholders = ','.join('?' * len(request.ids))
        
        # Delete orders (используем параметризованный запрос)
        query = f"DELETE FROM orders WHERE id IN ({placeholders})"
        cursor.execute(query, request.ids)
        deleted_count = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return {
            "message": f"Successfully deleted {deleted_count} order(s)",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        if 'conn' in locals():
            conn.close()
        logger.error(f"Error deleting orders batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/create_order")
async def create_order(order_data: OrderRequest):
    import sqlite3, json, os, httpx
    from datetime import datetime
    
    logger.info(f"📥 Получены данные от приложения: {order_data.dict()}")

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
                'order_id': order_id,
                'items': [item.dict() for item in order_data.items]
            })
        except Exception as tg_error:
            logger.warning(f"⚠️ Ошибка отправки Telegram уведомления: {tg_error}")
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
                logger.error("❌ Нет токена!")
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
                    logger.error(f"❌ Ошибка банка: {resp.text}")
        
        conn.close()
        return {"message": "Created", "order_id": order_id}

    except Exception as e:
        logger.error(f"🔥 ОШИБКА: {e}")
        return {"error": str(e)}

# --- CHAT ENDPOINT WITH GPT ---
class ChatRequest(BaseModel):
    messages: List[dict]

@app.post("/chat")
@limiter.limit("30/minute")
async def chat_with_gpt(request: Request, chat_data: ChatRequest):
    try:
        # Получаем API ключ OpenAI из переменных окружения
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            return {"error": "OpenAI API key not found in environment variables"}
        
        # Загружаем список товаров
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, price, description, category, unit FROM products")
        rows = cursor.fetchall()
        conn.close()
        
        # Формируем список товаров для промпта
        products_list = []
        for row in rows:
            product = dict(row)
            # Формируем краткое описание товара
            product_info = {
                "id": product.get("id"),
                "name": product.get("name", ""),
                "price": product.get("price", 0),
                "description": product.get("description", "")[:200],  # Ограничиваем длину
                "category": product.get("category", ""),
                "unit": product.get("unit", "шт")
            }
            products_list.append(product_info)
        
        # Формируем системный промпт
        products_json = json.dumps(products_list, ensure_ascii=False, indent=2)
        system_prompt = f"""Ты — эксперт по натуральным продуктам (грибы, травы, витамины) в магазине "Dikoros". 
Твоя цель — помочь клиенту выбрать лучший вариант для его здоровья.

Список доступных товаров:
{products_json}

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:

1. ВАЛЮТА: ВСЕ цены указаны в УКРАИНСКИХ ГРИВНАХ (UAH, ₴, грн, гривня).
   - НИКОГДА не используй RUB (рубли), USD (доллары) или EUR (евро)
   - Всегда указывай цены в гривнах: например, "500 грн", "1000 ₴" или "750 гривень"
   - В тексте ответа используй: "грн", "₴" или "гривень"

2. КАРТОЧКИ ТОВАРОВ: Когда пользователь спрашивает о товаре или хочет увидеть продукт:
   - ОБЯЗАТЕЛЬНО верни ID товара(ов) в поле "recommended_ids" JSON-ответа
   - Это необходимо для отображения карточек товаров в интерфейсе
   - Если пользователь спрашивает "Покажи чагу", "Есть ли рейши?", "Do you have Chaga?", "Покажи пиццу" — найди соответствующий товар в списке и верни его ID
   - Даже если просто упоминаешь товар в ответе — верни его ID в recommended_ids
   - Если товар не найден в списке — скажи об этом, но НЕ придумывай цены или характеристики

3. ЯЗЫКОВОЕ ЗЕРКАЛИРОВАНИЕ: СТРОГО отвечай на том же языке, на котором написал пользователь.
   - Если пользователь пишет на русском → отвечай на русском
   - Если на украинском → отвечай на украинском
   - Если на английском → отвечай на английском

4. ТОН: Экспертный, но дружелюбный. Используй эмодзи для живости: 🌿 (травы), 🍄 (грибы), 🔥 (энергия), 💪 (здоровье), ⭐ (рекомендация)

5. СТРУКТУРА ОТВЕТА (всегда следуй этому порядку):
   - Прямой ответ на вопрос клиента
   - Ключевая польза/преимущество товара
   - Призыв к действию (ненавязчивый апселл)

6. ПЕРСОНА: Ты эксперт по силе природы. Говори с уверенностью, но без высокомерия. 
   Показывай энтузиазм к натуральным продуктам.

7. В конце ответа ОБЯЗАТЕЛЬНО верни JSON в формате: {{ "reply": "Твой ответ клиенту", "recommended_ids": [id1, id2, ...] }}
   - "reply" — твой текстовый ответ клиенту (с эмодзи, в том же языке что и запрос, цены в грн/₴)
   - "recommended_ids" — массив ID рекомендованных товаров из списка выше (обязательно верни ID, если упоминаешь товар)

ВАЖНО: 
- Всегда завершай ответ JSON-объектом с полями "reply" и "recommended_ids"
- Все цены указывай ТОЛЬКО в гривнах (грн, ₴)
- При упоминании товара ВСЕГДА включай его ID в recommended_ids для отображения карточки"""

        # Инициализируем клиент OpenAI
        client = OpenAI(api_key=openai_api_key)
        
        # Формируем историю сообщений для GPT
        messages_for_gpt = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Добавляем историю диалога (последние 10 сообщений для контекста)
        recent_messages = chat_data.messages[-10:] if len(chat_data.messages) > 10 else chat_data.messages
        for msg in recent_messages:
            role = msg.get("role", "user")
            content = msg.get("content", msg.get("text", ""))
            if role in ["user", "assistant"]:
                messages_for_gpt.append({"role": role, "content": content})
        
        # Делаем запрос к GPT
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Используем более дешевую модель
            messages=messages_for_gpt,
            temperature=0.7,
            max_tokens=500
        )
        
        # Получаем ответ от GPT
        gpt_response = response.choices[0].message.content
        
        # Пытаемся извлечь JSON из ответа
        reply_text = gpt_response
        recommended_ids = []
        
        # Ищем JSON в ответе (может быть в конце или в отдельной строке)
        try:
            # Пытаемся найти JSON объект в ответе
            json_start = gpt_response.rfind("{")
            json_end = gpt_response.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                json_str = gpt_response[json_start:json_end]
                parsed_json = json.loads(json_str)
                if "reply" in parsed_json:
                    reply_text = parsed_json["reply"]
                if "recommended_ids" in parsed_json:
                    recommended_ids = parsed_json["recommended_ids"]
        except Exception as e:
            logger.warning(f"⚠️ Не удалось распарсить JSON из ответа GPT: {e}")
            # Если не удалось распарсить, используем весь ответ как текст
        
        # Получаем полные объекты рекомендованных товаров
        recommended_products = []
        if recommended_ids:
            conn = get_db_connection()
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Безопасный параметризованный запрос
            placeholders = ",".join("?" * len(recommended_ids))
            query = f"SELECT * FROM products WHERE id IN ({placeholders})"
            cursor.execute(query, recommended_ids)
            rows = cursor.fetchall()
            conn.close()
            
            for row in rows:
                item = dict(row)
                # Парсим variants если есть
                variants_val = item.get("variants")
                if variants_val and isinstance(variants_val, str):
                    try:
                        item["variants"] = json.loads(variants_val)
                    except:
                        item["variants"] = None
                else:
                    item["variants"] = variants_val if variants_val else None
                
                # Обрабатываем изображения
                image_value = item.get("image") or ""
                picture_value = item.get("picture") or ""
                image_url_value = item.get("image_url") or ""
                if not image_url_value:
                    item["image_url"] = image_value
                if not picture_value and item.get("image_url"):
                    item["picture"] = item["image_url"]
                elif not picture_value and image_value:
                    item["picture"] = image_value
                    if not item.get("image_url"):
                        item["image_url"] = image_value
                
                recommended_products.append(item)
        
        return {
            "text": reply_text,
            "products": recommended_products
        }
        
    except Exception as e:
        logger.error(f"🔥 Ошибка в /chat: {e}")
        import traceback
        traceback.print_exc()
        return {"error": f"Ошибка при обработке запроса: {str(e)}"}

@app.get("/image/{filename:path}")
async def get_optimized_image(
    filename: str,
    w: Optional[int] = None,
    h: Optional[int] = None,
    q: Optional[int] = None,
    format: Optional[str] = None
):
    """
    Оптимизированная выдача изображений с автоматическим ресайзом.
    
    Параметры:
    - w: ширина (опционально)
    - h: высота (опционально)
    - q: качество (1-100, по умолчанию 85)
    - format: формат (webp, jpg, png, по умолчанию - оригинальный или webp если поддерживается)
    
    Примеры:
    - /image/product.jpg?w=300 - ресайз до ширины 300px
    - /image/product.jpg?w=300&h=300 - ресайз до 300x300px
    - /image/product.jpg?w=300&q=80 - ресайз с качеством 80%
    - /image/product.jpg?w=300&format=webp - ресайз в WebP
    """
    try:
        # Путь к оригинальному файлу
        file_path = os.path.join(UPLOADS_DIR, filename)
        
        # Проверяем существование файла
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Если параметры не указаны, отдаем оригинал
        if w is None and h is None and q is None and format is None:
            return FileResponse(file_path)
        
        # Открываем изображение
        with PILImage.open(file_path) as img:
            original_format = img.format or 'JPEG'
            
            # Ресайз с сохранением пропорций
            if w or h:
                # Вычисляем размеры с сохранением пропорций
                if w and h:
                    # Если указаны оба размера, используем их (может обрезать)
                    new_size = (w, h)
                elif w:
                    # Только ширина
                    ratio = w / img.width
                    new_size = (w, int(img.height * ratio))
                else:
                    # Только высота
                    ratio = h / img.height
                    new_size = (int(img.width * ratio), h)
                
                # Ресайз с высоким качеством
                img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
            # Определяем формат вывода
            output_format = format.upper() if format else original_format
            if output_format not in ['JPEG', 'PNG', 'WEBP']:
                output_format = 'JPEG'
            
            # Конвертируем в RGB если нужно (для JPEG и WebP)
            if output_format in ['JPEG', 'WEBP'] and img.mode in ('RGBA', 'LA', 'P'):
                # Создаем белый фон для прозрачных изображений
                background = PILImage.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif output_format == 'PNG' and img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Качество сжатия
            quality = q if q and 1 <= q <= 100 else 85
            
            # Сохраняем в буфер
            output_buffer = io.BytesIO()
            
            if output_format == 'WEBP':
                img.save(output_buffer, format='WEBP', quality=quality, method=6)
                media_type = 'image/webp'
            elif output_format == 'PNG':
                img.save(output_buffer, format='PNG', optimize=True)
                media_type = 'image/png'
            else:
                img.save(output_buffer, format='JPEG', quality=quality, optimize=True)
                media_type = 'image/jpeg'
            
            output_buffer.seek(0)
            
            # Возвращаем оптимизированное изображение
            return StreamingResponse(
                output_buffer,
                media_type=media_type,
                headers={
                    "Cache-Control": "public, max-age=31536000",  # Кэш на 1 год
                }
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error optimizing image {filename}: {e}")
        import traceback
        traceback.print_exc()
        # В случае ошибки возвращаем оригинал
        try:
            return FileResponse(file_path)
        except:
            raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.get("/ping")
def ping():
    return {"message": "PONG", "server_id": "NEW_VERSION_WITH_CATEGORIES"}

if __name__ == "__main__":
    import uvicorn
    # Используем 0.0.0.0 чтобы слушать на всех интерфейсах
    # Это позволит подключаться и по localhost, и по IP адресу
    uvicorn.run(app, host="0.0.0.0", port=8001)
