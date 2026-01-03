import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, Animated, Vibration } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrdersContext';
import { API_URL } from '../config/api';
import { Ionicons } from '@expo/vector-icons';

// Утилита для картинок
const getImageUrl = (path: any) => {
  if (!path) return 'https://via.placeholder.com/300';
  if (path.startsWith('http')) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const { products } = useOrders();
  
  const [product, setProduct] = useState<any>(null);
  const [activeVariant, setActiveVariant] = useState<any>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [currentOldPrice, setCurrentOldPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [tab, setTab] = useState<'desc' | 'ingr' | 'use'>('desc');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Вычисляем коэффициент наценки старой цены
  const oldPriceRatio = useMemo(() => {
    if (product?.old_price && product?.price && product.old_price > product.price) {
      return product.old_price / product.price;
    }
    return 1;
  }, [product]);

  // 1. Поиск товара
  useEffect(() => {
    if (products.length > 0 && id) {
      const found = products.find((p: any) => p.id.toString() === id.toString());
      if (found) {
        setProduct(found);
        setCurrentPrice(found.price);
        setCurrentOldPrice(found.old_price && found.old_price > found.price ? found.old_price : null);
        setQuantity(1); // Сброс количества при смене товара
        setTab('desc'); // Сброс вкладки при смене товара
      }
    }
  }, [products, id]);

  // 2. Подготовка вариантов (Нормализация данных)
  const variants = useMemo(() => {
    if (!product) return [];
    
    // Пытаемся достать variants
    let data = product.variants;
    
    // Если пришли строкой
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
    }
    
    // Если это массив - возвращаем
    if (Array.isArray(data) && data.length > 0) return data;

    // Fallback: старые pack_sizes
    if (product.pack_sizes) {
       return String(product.pack_sizes).split(',').map(s => ({
         size: s.trim(),
         price: product.price
       }));
    }
    return [];
  }, [product]);

  // 3. Автовыбор первого варианта и обновление цен
  useEffect(() => {
    if (variants.length > 0 && !activeVariant) {
      const firstVariant = variants[0];
      setActiveVariant(firstVariant);
      setCurrentPrice(firstVariant.price);
      // Если у товара есть старая цена, применяем тот же коэффициент к варианту
      if (product?.old_price && product.old_price > product.price) {
        setCurrentOldPrice(Math.round(firstVariant.price * oldPriceRatio));
      } else {
        setCurrentOldPrice(null);
      }
    }
  }, [variants, activeVariant, product, oldPriceRatio]);

  // 4. Обновление цен при изменении варианта
  useEffect(() => {
    if (activeVariant && product) {
      setCurrentPrice(activeVariant.price);
      // Если у товара есть старая цена, применяем тот же коэффициент к варианту
      if (product.old_price && product.old_price > product.price) {
        setCurrentOldPrice(Math.round(activeVariant.price * oldPriceRatio));
      } else {
        setCurrentOldPrice(null);
      }
    } else if (product && !activeVariant) {
      // Если вариантов нет, берем данные из продукта
      setCurrentPrice(product.price);
      setCurrentOldPrice(product.old_price && product.old_price > product.price ? product.old_price : null);
    }
  }, [activeVariant, product, oldPriceRatio]);

  // Функция форматирования цены (как в модальном окне)
  const formatPrice = (price: number) => {
    return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
  };

  // Функция показа toast-уведомления
  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    
    // Анимация появления
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setToastVisible(false);
      });
    }, 3000);
  };

  if (!product) return <ActivityIndicator style={{ flex: 1, marginTop: 50 }} size="large" color="#000" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* 1. Фото товара + Кнопки управления (Overlay) */}
        <View>
          <Image 
            source={{ uri: getImageUrl(product.image) }} 
            style={{ width: '100%', height: 350, resizeMode: 'cover' }} 
          />
          
          {/* Кнопка Назад (Плавающая) */}
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={{ 
              position: 'absolute', 
              top: 60, 
              left: 20, 
              zIndex: 100,
              backgroundColor: 'rgba(255,255,255,0.95)',
              width: 45,
              height: 45,
              borderRadius: 25,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            }}
          >
            <Ionicons name="arrow-back" size={26} color="black" />
          </TouchableOpacity>
        </View>

        <View style={{ padding: 20 }}>
          {/* 2. Заголовок и Цена */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 26, fontWeight: 'bold', marginBottom: 5 }}>{product.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                {currentOldPrice && (
                  <Text style={{ 
                    fontSize: 18, 
                    color: '#999', 
                    textDecorationLine: 'line-through' 
                  }}>
                    {formatPrice(currentOldPrice)}
                  </Text>
                )}
                <Text style={{ 
                  fontSize: 28, 
                  color: currentOldPrice ? '#e74c3c' : '#000', // Красный, если со скидкой
                  fontWeight: 'bold' 
                }}>
                  {formatPrice(currentPrice)}
                </Text>
              </View>
            </View>
            {product.rating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 6, borderRadius: 8 }}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={{ marginLeft: 4, fontWeight: 'bold' }}>{product.rating}</Text>
              </View>
            )}
          </View>

          {/* 3. Гарантии (Trust Badges) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12 }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" style={{ marginBottom: 5 }} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#555' }}>100% Оригінал</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name="rocket" size={20} color="#2196F3" style={{ marginBottom: 5 }} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#555' }}>Швидка доставка</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Ionicons name="calendar" size={20} color="#FF9800" style={{ marginBottom: 5 }} />
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#555' }}>Свіжі терміни</Text>
            </View>
          </View>

          {/* 4. ВЫБОР ФАСОВКИ (Варианты) */}
          {variants.length > 0 && (
            <>
              <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                <Text>Фасування (</Text>
                <Text>{product.unit || 'шт'}</Text>
                <Text>)</Text>
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                {variants.map((v: any, idx: number) => {
                  const isActive = activeVariant?.size === v.size;
                  const label = `${v.size} ${product.unit || ''}`;
                  
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => { 
                        setActiveVariant(v); 
                        setCurrentPrice(v.price);
                        // Обновляем старую цену для варианта
                        if (product?.old_price && product.old_price > product.price) {
                          setCurrentOldPrice(Math.round(v.price * oldPriceRatio));
                        } else {
                          setCurrentOldPrice(null);
                        }
                      }}
                      style={{
                        minWidth: 50, height: 50, borderRadius: 25,
                        borderWidth: 1,
                        borderColor: isActive ? 'black' : '#e0e0e0',
                        backgroundColor: isActive ? 'black' : 'white',
                        alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: 16
                      }}
                    >
                      <Text style={{ color: isActive ? 'white' : 'black', fontWeight: 'bold' }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* 5. ВКЛАДКИ (Опис / Склад / Прийом) */}
          <View style={{ flexDirection: 'row', marginBottom: 15, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 4 }}>
            {['desc', 'ingr', 'use'].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t as 'desc' | 'ingr' | 'use')}
                style={{
                  flex: 1, paddingVertical: 8, alignItems: 'center',
                  backgroundColor: tab === t ? 'white' : 'transparent',
                  borderRadius: 8,
                  shadowColor: tab === t ? '#000' : 'transparent', shadowOpacity: 0.1, elevation: tab === t ? 2 : 0
                }}
              >
                <Text style={{ fontWeight: tab === t ? 'bold' : '500', fontSize: 13 }}>
                  {t === 'desc' ? 'Опис' : t === 'ingr' ? 'Склад' : 'Прийом'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Текст описания */}
          <Text style={{ color: '#555', lineHeight: 22, fontSize: 15, marginBottom: 30, minHeight: 80 }}>
            {tab === 'desc' ? (product.description || 'Опис для цього товару поки відсутній.') : tab === 'ingr' ? (product.composition || 'Склад не вказано.') : (product.usage || 'Спосіб прийому не вказано.')}
          </Text>
        </View>
      </ScrollView>

      {/* 6. ЗАКРЕПЛЕННЫЙ ФУТЕР */}
      <View style={{ 
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 20, 
        borderTopWidth: 1, borderTopColor: '#f0f0f0', backgroundColor: 'white',
        paddingBottom: 30
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, padding: 5, marginRight: 15 }}>
            <TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))} style={{ padding: 10 }}>
              <Ionicons name="remove" size={20} color="black" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginHorizontal: 10 }}>
              <Text>{quantity} </Text>
              <Text>{product.unit || 'шт'}</Text>
            </Text>
            <TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={{ padding: 10 }}>
              <Ionicons name="add" size={20} color="black" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            onPress={() => {
              // Если есть вариант, используем его данные, иначе базовые
              if (activeVariant) {
                addToCart(product, quantity, activeVariant.size, product.unit || 'шт', activeVariant.price);
              } else {
                addToCart(product, quantity, product.weight || product.unit || 'шт', product.unit || 'шт', currentPrice);
              }
              Vibration.vibrate(10); // Очень короткий "тик" как при добавлении в избранное
              showToast('Товар додано в кошик');
              // Задержка перед возвратом, чтобы пользователь увидел toast (увеличено до 1500ms)
              setTimeout(() => {
                router.back();
              }, 1500);
            }}
            style={{ flex: 1, backgroundColor: 'black', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
              <Text>У кошик • </Text>
              <Text>{formatPrice(currentPrice * quantity)}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast уведомление - рендерится поверх всего контента */}
      {toastVisible && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 120,
            left: 0,
            right: 0,
            alignItems: 'center',
            zIndex: 99999,
            opacity: fadeAnim,
            transform: [{
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })
            }]
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 50,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 10,
            }}
          >
            <Ionicons 
              name="checkmark-circle" 
              size={20} 
              color="white" 
              style={{ marginRight: 10 }} 
            />
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}
