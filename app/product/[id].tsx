import { FloatingChatButton } from '@/components/FloatingChatButton';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Image, SafeAreaView, ScrollView, Share, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { logAddToCart, logViewItem } from '../../src/utils/analytics';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrdersContext';
import { isFavorite as isFavoriteUtil, toggleFavorite as toggleFavoriteUtil } from '../utils/favorites';
import { getImageUrl } from '../utils/image';

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
  const [isFavorite, setIsFavorite] = useState(false);
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
        
        // Отправка события просмотра товара в аналитику
        logViewItem(found).catch((error) => {
          console.error('Error logging view item:', error);
        });
      }
    }
  }, [products, id]);

  // Загрузка состояния избранного
  useEffect(() => {
    const checkFavorite = async () => {
      if (product?.id) {
        const favorite = await isFavoriteUtil(product.id);
        setIsFavorite(favorite);
      }
    };
    checkFavorite();
  }, [product]);

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

  // Функция переключения избранного
  const handleToggleFavorite = async () => {
    if (!product) return;
    try {
      Vibration.vibrate(10);
      const newState = await toggleFavoriteUtil(product);
      setIsFavorite(newState);
      showToast(newState ? "Додано в обране ❤️" : "Видалено з обраного");
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Помилка при роботі з обраним');
    }
  };

  // Функция поделиться
  const handleShare = async () => {
    if (!product) return;
    try {
      Vibration.vibrate(10); // Эффект дрожания при нажатии
      const shareMessage = `${product.name}\n${formatPrice(currentPrice)}\n\nПереглянути товар в додатку`;
      await Share.share({
        message: shareMessage,
        title: product.name,
      });
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        console.error('Error sharing:', error);
      }
    }
  };

  if (!product) return <ActivityIndicator style={{ flex: 1, marginTop: 50 }} size="large" color="#000" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* 1. Фото товара + Кнопки управления (Overlay) */}
        <View>
          <Image 
            source={{ uri: getImageUrl(product.picture || product.image || product.image_url, {
              width: Dimensions.get('window').width,
              height: 350,
              quality: 90,
              format: 'webp'
            }) }} 
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

          {/* Иконки избранного и поделиться (Верхний правый угол) */}
          <View style={{
            position: 'absolute',
            top: 60,
            right: 20,
            zIndex: 100,
            flexDirection: 'row',
            gap: 10,
          }}>
            {/* Иконка избранного */}
            <TouchableOpacity 
              onPress={handleToggleFavorite}
              style={{
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
              <Ionicons 
                name={isFavorite ? "heart" : "heart-outline"} 
                size={24} 
                color={isFavorite ? "#ff3b30" : "black"} 
              />
            </TouchableOpacity>

            {/* Иконка поделиться */}
            <TouchableOpacity 
              onPress={handleShare}
              style={{
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
              <Ionicons 
                name="share-outline" 
                size={24} 
                color="black" 
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ padding: 20 }}>
          {/* 2. Заголовок и Цена */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 26, fontWeight: 'bold', marginBottom: 5 }}>{product.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
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
              
              {/* Кнопки рядом с ценой */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                {/* Селектор количества (уменьшенный) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, padding: 3 }}>
                  <TouchableOpacity onPress={() => setQuantity(Math.max(1, quantity - 1))} style={{ padding: 6 }}>
                    <Ionicons name="remove" size={16} color="black" />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', marginHorizontal: 8, minWidth: 30, textAlign: 'center' }}>
                    {quantity}
                  </Text>
                  <TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={{ padding: 6 }}>
                    <Ionicons name="add" size={16} color="black" />
                  </TouchableOpacity>
                </View>

                {/* Кнопка "У кошик" (компактная) */}
                <TouchableOpacity 
                  onPress={async () => {
                    // Если есть вариант, используем его данные, иначе базовые
                    if (activeVariant) {
                      addToCart(product, quantity, activeVariant.size, product.unit || 'шт', activeVariant.price);
                    } else {
                      addToCart(product, quantity, product.weight || product.unit || 'шт', product.unit || 'шт', currentPrice);
                    }
                    
                    // Отправка события добавления в корзину в аналитику
                    const productForAnalytics = {
                      ...product,
                      price: activeVariant ? activeVariant.price : currentPrice,
                      title: product.name,
                      quantity: quantity
                    };
                    logAddToCart(productForAnalytics).catch((error) => {
                      console.error('Error logging add to cart:', error);
                    });
                    
                    Vibration.vibrate(10);
                    showToast('Товар додано в кошик');
                    setTimeout(() => {
                      router.back();
                    }, 1500);
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: 'black', 
                    borderRadius: 10, 
                    paddingVertical: 10, 
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    maxWidth: 200
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>
                    <Text>У кошик • </Text>
                    <Text>{formatPrice(currentPrice * quantity)}</Text>
                  </Text>
                </TouchableOpacity>
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

          {/* 6. Похожие товары */}
          {(() => {
            // Фильтруем товары той же категории, исключая текущий товар
            const similarProducts = products.filter((p: any) => 
              p.category === product.category && 
              p.id !== product.id
            ).slice(0, 10); // Ограничиваем до 10 товаров

            if (similarProducts.length === 0) return null;

            return (
              <View style={{ marginTop: 20, marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 15, paddingHorizontal: 20 }}>
                  Схожі товари
                </Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                >
                  {similarProducts.map((item: any, idx: number) => (
                    <TouchableOpacity
                      key={item.id || idx}
                      onPress={() => router.push(`/product/${item.id}`)}
                      style={{ 
                        width: 140, 
                        marginRight: 15,
                        backgroundColor: 'white',
                        borderRadius: 12,
                        overflow: 'hidden',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 3,
                      }}
                    >
                      <Image 
                        source={{ uri: getImageUrl(item.picture || item.image || item.image_url) }} 
                        style={{ 
                          width: '100%', 
                          height: 140, 
                          borderRadius: 12,
                          backgroundColor: '#f0f0f0',
                          marginBottom: 8
                        }}
                        resizeMode="cover"
                      />
                      <View style={{ padding: 10 }}>
                        <Text 
                          numberOfLines={2} 
                          style={{ 
                            fontSize: 13, 
                            fontWeight: '600', 
                            marginBottom: 6,
                            minHeight: 36
                          }}
                        >
                          {item.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {item.old_price && item.old_price > item.price && (
                            <Text style={{ 
                              textDecorationLine: 'line-through', 
                              color: '#999', 
                              fontSize: 11 
                            }}>
                              {formatPrice(item.old_price)}
                            </Text>
                          )}
                          <Text style={{ 
                            fontSize: 15, 
                            fontWeight: 'bold', 
                            color: item.old_price && item.old_price > item.price ? '#e74c3c' : '#000'
                          }}>
                            {formatPrice(item.price)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })()}
        </View>
      </ScrollView>


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
      <FloatingChatButton bottomOffset={180} />
    </SafeAreaView>
  );
}
