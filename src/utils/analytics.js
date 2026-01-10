import analytics from '@react-native-firebase/analytics';
import { AppEventsLogger } from 'react-native-fbsdk-next';

// 1. Просмотр товара
export const logViewItem = async (product) => {
  try {
    const item = {
      item_id: String(product.id), // Важно: ID всегда строка
      item_name: product.name || product.title,
      price: parseFloat(product.price || product.currentPrice || 0),
      quantity: 1,
    };

    // Firebase (Новый синтаксис logEvent)
    await analytics().logEvent('view_item', {
      currency: 'UAH',
      value: item.price,
      items: [item],
    });

    // Facebook
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.ViewedContent, item.price, {
      currency: 'UAH',
      content_type: 'product',
      content_ids: item.item_id,
      description: item.item_name
    });

    console.log('📊 ViewItem:', { name: item.item_name, price: item.price, id: item.item_id });
  } catch (error) {
    console.log('⚠️ Analytics error (logViewItem):', error);
  }
};

// 2. Добавление в корзину
export const logAddToCart = async (product) => {
  try {
    // 1. Пытаемся взять количество из товара, если его нет — ставим 1
    const qty = product.quantity || 1;
    const price = parseFloat(product.price || product.currentPrice || 0);
    
    const item = {
      item_id: String(product.id),
      item_name: product.name || product.title,
      price: price,
      quantity: qty, 
    };

    // 2. Считаем общую сумму события (цена * количество)
    const totalValue = price * qty;

    await analytics().logEvent('add_to_cart', {
      currency: 'UAH',
      value: totalValue, // Теперь тут полная сумма
      items: [item],
    });

    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.AddedToCart, totalValue, {
      currency: 'UAH',
      content_type: 'product',
      content_ids: item.item_id,
    });
    
    // 3. Выводим подробный лог для проверки
    console.log('🛒 AddToCart:', { 
      name: item.item_name, 
      quantity: qty, 
      itemPrice: price,
      totalEventValue: totalValue 
    });

  } catch (error) {
    console.log('⚠️ Analytics error (logAddToCart):', error);
  }
};

// 3. Начало оформления (Checkout)
export const logBeginCheckout = async (products, totalAmount) => {
  try {
    const items = products.map(p => ({
      item_id: String(p.id),
      item_name: p.title || p.name,
      price: parseFloat(p.price || 0),
      quantity: p.quantity || 1
    }));

    await analytics().logEvent('begin_checkout', {
      currency: 'UAH',
      value: parseFloat(totalAmount),
      items: items,
    });

    AppEventsLogger.logEvent('InitiateCheckout', parseFloat(totalAmount), {
      currency: 'UAH',
      content_type: 'product',
      num_items: String(items.length),
      payment_info_available: '0' 
    });

    console.log('💳 BeginCheckout:', { amount: totalAmount, currency: 'UAH', itemsCount: items.length });
  } catch (error) {
    console.log('⚠️ Analytics error (logBeginCheckout):', error);
  }
};

// 4. Покупка (Purchase)
export const logPurchase = async (products, totalAmount) => {
  try {
    const items = products.map(p => ({
      item_id: String(p.id),
      item_name: p.title || p.name,
      price: parseFloat(p.price || 0),
      quantity: p.quantity || 1
    }));

    await analytics().logEvent('purchase', {
      currency: 'UAH',
      value: parseFloat(totalAmount),
      transaction_id: String(Date.now()), // Уникальный ID заказа
      items: items,
    });

    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.Purchased, parseFloat(totalAmount), {
      currency: 'UAH',
      content_type: 'product',
      num_items: String(items.length)
    });

    console.log('💰 Purchase SUCCESS:', { 
      transaction_id: String(Date.now()),
      amount: parseFloat(totalAmount), 
      currency: 'UAH', 
      items: items 
    });
  } catch (error) {
    console.log('⚠️ Analytics error (logPurchase):', error);
  }
};

