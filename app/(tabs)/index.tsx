import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import { API_URL } from '../config/api';
import { useCart } from '../context/CartContext';
import { OrderItem, useOrders } from '../context/OrdersContext';
import { getImageUrl } from '../utils/image';
import { checkServerHealth, getConnectionErrorMessage } from '../utils/serverCheck';
import { FloatingChatButton } from '@/components/FloatingChatButton';

type Variant = {
  size: string;
  price: number;
};

type Product = {
  id: number;
  name: string;
  price: number;
  image?: string;
  image_url?: string;  // For CSV imports
  picture?: string;     // For XML imports
  category?: string;
  rating?: number;
  size?: string;
  description?: string;
  badge?: string;
  quantity?: number;
  composition?: string; // Changed from ingredients to match OrdersContext
  usage?: string;
  weight?: string;
  pack_sizes?: string[];  // Changed to array to match backend
  old_price?: number;  // For discount logic
  unit?: string;  // Measurement unit (e.g., "шт", "г", "мл")
  variants?: Variant[];  // Variants with different prices
};

// BannerImage component for handling banner images with error fallback
const BannerImage = ({ uri, width, height }: { uri: string; width: number; height: number }) => {
  const [error, setError] = useState(false);
  
  if (error) {
    // Fallback UI (Placeholder)
    return (
      <View style={{
        width,
        height,
        backgroundColor: '#f5f5f5',
        borderRadius: 15,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Ionicons name="image-outline" size={40} color="#ccc" />
      </View>
    );
  }
  
  return (
    <Image 
      source={{ uri }} 
      style={{ 
        width,
        height, 
        borderTopLeftRadius: 0,
        borderTopRightRadius: 15,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 15,
        marginRight: 10,
        backgroundColor: '#f5f5f5'
      }} 
      resizeMode="cover"
      onError={() => {
        console.error("❌ Banner image failed to load:", uri);
        setError(true);
      }}
      onLoad={() => {
        // Image loaded successfully
      }}
    />
  );
};

// ProductImage component for handling images with error fallback
const ProductImage = ({ uri }: { uri: string }) => {
  const [error, setError] = useState(false);
  const { width } = Dimensions.get('window');
  
  // Вычисляем оптимальный размер для карточки товара (2 колонки)
  const cardImageWidth = Math.round((width - 40) / 2); // Ширина экрана минус отступы, делим на 2 колонки
  
  // Clean the URI and get full URL with automatic optimization for local images
  const validUri = uri ? getImageUrl(uri.trim(), {
    width: cardImageWidth,
    quality: 80,
    format: 'webp' // WebP для лучшего сжатия
  }) : getImageUrl(null);

  if (error) {
    // Fallback UI (Placeholder)
    return (
      <View style={{ width: '100%', height: 150, backgroundColor: '#e1e1e1', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 5 }}>
        <Text style={{ color: '#999' }}>Нет фото</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: validUri }}
      style={{ width: '100%', height: 150, borderRadius: 8, marginBottom: 5 }}
      resizeMode="cover"
      onError={() => setError(true)}
    />
  );
};

export default function Index() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Get cart context
  const { addItem, items: cartItems, removeItem, clearCart, totalPrice, updateQuantity, addOne, removeOne } = useCart();

  // Get products from OrdersContext (fetched from server)
  const { products: fetchedProducts, isLoading: productsLoading, fetchProducts, orders, removeOrder, clearOrders } = useOrders();
  
  // Use products from OrdersContext (fetched from server)
  const products = fetchedProducts;

  // Функция форматирования цены
  const formatPrice = (price: number) => {
    return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
  };

  // Используем cartItems из контекста вместо локального cart
  const cart = cartItems; // Алиас для совместимости со старым кодом
  const [modalVisible, setModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Всі");
  const [sortType, setSortType] = useState<'popular' | 'asc' | 'desc'>('popular');
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favModalVisible, setFavModalVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [categories, setCategories] = useState(['Всі']);
  const [banners, setBanners] = useState<any[]>([]);
  const [connectionError, setConnectionError] = useState(false);

  // Загрузка данных с сервера
  const fetchData = async () => {
    try {
      // Сначала проверяем доступность сервера
      console.log("🔍 Checking server health at", API_URL);
      const serverAvailable = await checkServerHealth();
      if (!serverAvailable) {
        console.error("❌ Server is not available at", API_URL);
        console.error(getConnectionErrorMessage());
        setConnectionError(true);
        return;
      }
      console.log("✅ Server is available");
      setConnectionError(false);

      // Fetch Categories
      const catUrl = `${API_URL}/all-categories`;
      console.log("🔥 TRYING TO FETCH CATEGORIES:", catUrl);
      try {
        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 10000);
        
        const catResponse = await fetch(catUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller1.signal,
        });
        
        clearTimeout(timeout1);
        console.log("📦 Categories response status:", catResponse.status);
        if (catResponse.ok) {
          const catData = await catResponse.json();
          let list = Array.isArray(catData) ? catData : (catData.categories || []);
          const names = list.map((c: any) => (typeof c === 'object' ? c.name : c));
          setCategories(['Всі', ...names]);
          console.log("✅ Categories loaded:", names.length);
        } else {
          console.error("❌ Categories failed:", catResponse.status, catResponse.statusText);
        }
      } catch (catError: any) {
        console.error("🔥 CATEGORIES FETCH ERROR:", catError);
        if (catError.name === 'AbortError') {
          console.error("⏱️ Categories request timeout");
        } else {
          console.error("Error details:", {
            message: catError?.message,
            name: catError?.name,
            stack: catError?.stack
          });
        }
      }

      // Fetch Products - используем fetchProducts из OrdersContext
      // (он уже имеет проверку сервера)
      if (fetchProducts) {
        await fetchProducts();
      }

      // Fetch Banners (non-critical - failures are silently ignored)
      // Загружаем баннеры независимо, даже если другие запросы упали
      const loadBanners = async () => {
        try {
          const bannersUrl = `${API_URL}/banners`;
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 15000); // Увеличен таймаут до 15 секунд
          
          const bannerRes = await fetch(bannersUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: controller2.signal,
          });
          
          clearTimeout(timeout2);
          if (bannerRes.ok) {
            const bannersData = await bannerRes.json();
            const bannersArray = Array.isArray(bannersData) ? bannersData : [];
            setBanners(bannersArray);
          } else {
            setBanners([]);
          }
        } catch (bannerError: any) {
          // Игнорируем ошибки баннеров - они не критичны
          setBanners([]);
        }
      };
      
      // Загружаем баннеры асинхронно, не блокируя основной поток
      loadBanners();
    } catch (e: any) {
      console.error("🔥 FETCH ERROR (GLOBAL):", e);
      console.error("Error fetching data:", e);
      // Если это сетевая ошибка, устанавливаем флаг ошибки подключения
      if (e.message?.includes('Network request failed') || e.message?.includes('Failed to fetch') || e.name === 'AbortError') {
        setConnectionError(true);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Обработка параметра для открытия профиля после заказа
  useEffect(() => {
    if (params.showProfile === 'true') {
      // Небольшая задержка для плавного перехода
      const timer = setTimeout(() => {
        router.push('/(tabs)/profile');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [params.showProfile]);

  // Set initial selectedSize when product is selected
  useEffect(() => {
    if (selectedProduct?.pack_sizes && selectedProduct.pack_sizes.length > 0) {
      setSelectedSize(selectedProduct.pack_sizes[0]);
    } else {
      setSelectedSize(null);
    }
  }, [selectedProduct]);
  const [aiVisible, setAiVisible] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: 'Привіт! Я експерт із сили природи. Допоможу підібрати гриби, вітаміни чи трави для твого здоров\'я. Що шукаємо? 🌿🍄', sender: 'bot' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const flatListRef = useRef<FlatList>(null);
  const chatFlatListRef = useRef<FlatList>(null);
  const bannerRef = useRef<ScrollView>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<'desc' | 'ingr' | 'use'>('desc');


  // Автоматическая прокрутка баннеров
  useEffect(() => {
    if (banners.length === 0) return;
    
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % banners.length;
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5
      });
    }, 4000); // Листаем каждые 4 секунды
    return () => clearInterval(interval);
  }, [banners]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    
    // Анимация появления
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    
    // Автоматическое скрытие через 2 секунды
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setToastVisible(false);
      });
    }, 2000);
  };

  const toggleFavorite = (product: Product) => {
    Vibration.vibrate(10); // Очень короткий "тик"
    if (favorites.some(f => f.id === product.id)) {
      setFavorites(favorites.filter(f => f.id !== product.id));
      showToast("Видалено з обраного");
    } else {
      setFavorites([...favorites, product]);
      showToast("Додано в обране ❤️");
    }
  };

  const addToCart = (item: Product, size?: string) => {
    Vibration.vibrate(50); // Легкий отклик (50мс)
    const packSize = size ? String(parseInt(size)) : '30'; // Конвертируем size в строку или используем '30' по умолчанию
    addItem(item, 1, packSize);
    showToast('Товар додано в кошик');
  };

  const applyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'START') {
      setDiscount(0.1); // 10% скидка
      showToast('Промокод активовано! -10%');
    } else {
      setDiscount(0);
      showToast('Невірний промокод');
    }
  };



  const onShare = async (product: Product) => {
    try {
      await Share.share({
        message: `Смотри, классная вещь: ${product.name} за ${formatPrice(product.price)}!`,
      });
    } catch (error: any) {
      console.log(error.message);
    }
  };

  const CHAT_API_URL = `${API_URL}/chat`;

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    const userMsg = { id: Date.now(), text: userMessage, sender: 'user' };
    
    // Добавляем сообщение пользователя
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsLoading(true);
    
    // Скроллим после добавления сообщения пользователя
    setTimeout(() => {
      chatFlatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Формируем историю для отправки
    const history = updatedMessages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
    
    // Отправляем запрос
    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const replyText = data.text || data.response || 'Вибачте, не вдалося отримати відповідь.';
      const recommendedProducts = data.products || [];
      
      const botMsg = { 
        id: Date.now() + 1, 
        text: replyText, 
        sender: 'bot',
        products: recommendedProducts
      };
      
      // Добавляем ответ бота
      setMessages(prev => [...prev, botMsg]);
      
      // Скроллим после получения ответа
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      Vibration.vibrate(50);
      setIsLoading(false);
    } catch (error) {
      console.error('Error calling API:', error);
      const errorMsg = { 
        id: Date.now() + 1, 
        text: 'Вибачте, не вдалося підключитися до сервера. Перевірте, чи запущений сервер.', 
        sender: 'bot' 
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsLoading(false);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const totalAmount = subtotal - (subtotal * discount);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setConnectionError(false);
    // Загружаем данные с сервера
    await fetchData();
    setRefreshing(false);
  }, []);

  // Фильтрация товаров по поисковому запросу и категории
  const getSortedProducts = () => {
    if (!products || !Array.isArray(products)) {
      return [];
    }
    
    let result = products.filter(p => 
      (selectedCategory === 'Всі' || (p.category || 'Без категорії') === selectedCategory) &&
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortType === 'asc') {
      return result.sort((a, b) => a.price - b.price);
    } else if (sortType === 'desc') {
      return result.sort((a, b) => b.price - a.price);
    }
    return result; // 'popular' - порядок по умолчанию (id)
  };
  
  const filteredProducts = getSortedProducts();

  // Ensure fetchProducts is called on mount
  useEffect(() => {
    fetchProducts();
  }, []); // Empty dependency array = run once on mount

  // Auto-scrolling banner carousel
  useEffect(() => {
    if (banners.length === 0) return;
    
    const { width } = Dimensions.get('window');
    const CARD_WIDTH = width - 40;
    const CARD_MARGIN = 10;
    const TOTAL_WIDTH = CARD_WIDTH + CARD_MARGIN;
    
    const interval = setInterval(() => {
      setBannerIndex(prev => {
        const next = prev === banners.length - 1 ? 0 : prev + 1;
        const scrollPosition = next * TOTAL_WIDTH;
        bannerRef.current?.scrollTo({ x: scrollPosition, animated: true });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [banners]);

  // Render Product Item для сетки из 2 колонок
  const renderProductItem = ({ item }: { item: Product }) => {
    // Safe value extraction with type checking
    const safeName = item.name && typeof item.name === 'string' ? item.name : '';
    const safeCategory = item.category && typeof item.category === 'string' ? item.category : 'Без категорії';
    const safeBadge = item.badge && typeof item.badge === 'string' ? item.badge : null;
    const safePrice = typeof item.price === 'number' ? item.price : 0;
    const safeOldPrice = typeof item.old_price === 'number' ? item.old_price : null;
    const hasDiscount = safeOldPrice !== null && safeOldPrice > safePrice;
    
    const isFavorite = favorites.some(f => f.id === item.id);

    return (
      <TouchableOpacity 
        onPress={() => {
          router.push(`/product/${item.id}`);
        }}
        activeOpacity={0.8}
        style={{ 
          flex: 1, 
          marginBottom: 0,
          backgroundColor: 'white', 
          borderRadius: 15, 
          padding: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          maxWidth: (Dimensions.get('window').width - 16) / 2
        }}
      >
        <View style={{ marginBottom: 5, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' }}>
          <ProductImage uri={item.picture || item.image || item.image_url || ''} />
          {safeBadge && (
            <View style={{ position: 'absolute', top: 5, left: 5, backgroundColor: 'black', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{safeBadge}</Text>
            </View>
          )}
          <TouchableOpacity 
            onPress={() => toggleFavorite(item)}
            style={{ position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(255,255,255,0.8)', padding: 5, borderRadius: 15 }}
          >
            <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={16} color={isFavorite ? "red" : "black"} />
          </TouchableOpacity>
        </View>

        {safeName ? (
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>
            {safeName}
          </Text>
        ) : null}

        <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          {safeCategory}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {hasDiscount && (
              <Text style={{ textDecorationLine: 'line-through', color: 'gray', fontSize: 14 }}>
                {formatPrice(safeOldPrice!)}
              </Text>
            )}
            <Text style={{ fontSize: 15, fontWeight: 'bold' }}>
              {formatPrice(safePrice)}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              Vibration.vibrate(10); // Очень короткий "тик" как при добавлении в избранное
              addItem(item, 1, '', item.unit || 'шт');
              showToast('Товар додано в кошик');
            }}
            style={{ backgroundColor: 'black', borderRadius: 20, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={{ fontSize: 28, fontWeight: '900', color: 'black', letterSpacing: -1 }}>VitaStore 🌿</Text>
          <Text style={{ fontSize: 13, color: '#888', fontWeight: '500' }}>Твій здоровий вибір</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity 
            onPress={() => setIsSearchVisible(!isSearchVisible)}
            style={{ marginRight: 12, position: 'relative' }}
          >
            <Ionicons name="search" size={24} color="black" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setFavModalVisible(true)}
            style={{ marginRight: 12, position: 'relative' }}
          >
            <Ionicons name="heart" color="red" size={24} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ marginRight: 12, position: 'relative' }} 
            onPress={() => router.push('/(tabs)/cart')}
          >
            <Ionicons name="cart" size={26} color="black" />
            {cart.length > 0 && (
              <View style={{
                position: 'absolute',
                right: -8,
                top: -5,
                backgroundColor: 'red',
                borderRadius: 12,
                minWidth: 22,
                height: 22,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 6,
                zIndex: 10,
                borderWidth: 2,
                borderColor: 'white'
              }}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>
                  {cart.reduce((sum, item) => sum + (item.quantity || 1), 0)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      {/* BANNERS */}
      {banners.length > 0 && (() => {
        const { width } = Dimensions.get('window');
        const CARD_WIDTH = width - 40;
        return (
          <ScrollView 
            ref={bannerRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            pagingEnabled={true}
            style={{ marginBottom: 20 }}
            contentContainerStyle={{ paddingLeft: 20, paddingRight: 20 }}
            snapToInterval={CARD_WIDTH + 10}
            decelerationRate="fast"
          >
            {banners.map((b) => {
              // Обеспечиваем правильное формирование URL для баннера
              // Используем getImageUrl для обработки относительных путей
              const imageUrl = b.image_url || b.image || b.picture;
              if (!imageUrl) {
                return null;
              }
              const fullImageUrl = getImageUrl(imageUrl);
              
              return (
                <BannerImage 
                  key={b.id}
                  uri={fullImageUrl}
                  width={CARD_WIDTH}
                  height={220}
                />
              );
            })}
          </ScrollView>
        );
      })()}
      {isSearchVisible && (
        <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            placeholder="Пошук..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{
              backgroundColor: '#f0f0f0',
              padding: 10,
              borderRadius: 10,
              fontSize: 16,
              flex: 1,
              marginRight: 10
            }}
            autoFocus={true}
          />
          <TouchableOpacity
            onPress={() => {
              setIsSearchVisible(false);
              setSearchQuery('');
            }}
            style={{ padding: 8 }}
          >
            <Ionicons name="close" size={24} color="black" />
          </TouchableOpacity>
        </View>
      )}
      {/* CATEGORY CHIPS */}
      <View style={styles.categoriesList}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ paddingRight: 20 }}
        >
          {categories.map((cat, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setSelectedCategory(cat)}
              style={[
                styles.categoryItem,
                selectedCategory === cat && styles.categoryItemActive
              ]}
            >
              <Text style={[
                styles.categoryText,
                selectedCategory === cat && styles.categoryTextActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {/* SORT & COUNT PANEL */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 }}>
        <Text style={{ color: '#888', fontWeight: '600' }}>
          <Text>Знайдено: </Text>
          <Text>{filteredProducts.length}</Text>
        </Text>

        <TouchableOpacity 
          onPress={() => {
            // Циклическое переключение: Popular -> Cheap -> Expensive -> Popular
            if (sortType === 'popular') { setSortType('asc'); showToast('Спочатку дешевші'); }
            else if (sortType === 'asc') { setSortType('desc'); showToast('Спочатку дорожчі'); }
            else { setSortType('popular'); showToast('За популярністю'); }
            Vibration.vibrate(10);
          }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: 'bold', marginRight: 5 }}>
            {sortType === 'popular' ? 'Популярні' : sortType === 'asc' ? 'Дешевші' : 'Дорожчі'}
          </Text>
          <Ionicons name="swap-vertical" size={16} color="black" />
        </TouchableOpacity>
      </View>

      {connectionError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100, paddingHorizontal: 20 }}>
          <Ionicons name="cloud-offline-outline" size={64} color="#ff6b6b" />
          <Text style={{ marginTop: 20, fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' }}>
            Не вдалося підключитися до сервера
          </Text>
          <Text style={{ marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 }}>
            {getConnectionErrorMessage()}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setConnectionError(false);
              fetchData();
            }}
            style={{
              marginTop: 20,
              backgroundColor: '#000',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Спробувати ще раз</Text>
          </TouchableOpacity>
        </View>
      ) : productsLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 100 }}>
          <ActivityIndicator size="large" color="black" />
          <Text style={{ marginTop: 10, color: '#666' }}>Завантаження товарів...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProductItem}
          keyExtractor={item => item.id.toString()}
          numColumns={2}
          key={2}
          columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 1 }}
          contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#000']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateText}>😔</Text>
              <Text style={styles.emptyStateMessage}>Нічого не знайдено</Text>
            </View>
          }
        />
      )}
      <Modal 
        animationType="slide" 
        visible={modalVisible && selectedProduct !== null}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
          {selectedProduct && (
            <View style={{ flex: 1, backgroundColor: 'white' }}>
              
              {/* Основной контент (Скролл) */}
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                
                {/* 1. Фото товара + Кнопки управления (Overlay) */}
                <View>
                  <Image source={{ uri: getImageUrl(selectedProduct.image) }} style={{ width: '100%', height: 350, resizeMode: 'cover' }} />
                  
                  {/* Верхняя панель на фото */}
                  <View style={{ position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Кнопка Закрыть (Слева) */}
                    <TouchableOpacity 
                      onPress={() => {
                        setModalVisible(false);
                        setSelectedProduct(null);
                        setSelectedSize(null);
                        setTab('desc');
                      }} 
                      style={{ backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}
                    >
                      <Text style={{ color: 'black', fontWeight: 'bold' }}>Закрити</Text>
                    </TouchableOpacity>

                    {/* Иконки справа (Лайк + Шер) */}
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity 
                        onPress={() => onShare(selectedProduct)}
                        style={{ backgroundColor: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 20, marginRight: 10 }}
                      >
                        <Ionicons name="share-outline" size={24} color="black" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => toggleFavorite(selectedProduct)} 
                        style={{ backgroundColor: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 20 }}
                      >
                        <Ionicons name={favorites.some(f => f.id === selectedProduct.id) ? "heart" : "heart-outline"} size={24} color={favorites.some(f => f.id === selectedProduct.id) ? "red" : "black"} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={{ padding: 20 }}>
                  {/* 2. Заголовок и Цена */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 26, fontWeight: 'bold', marginBottom: 5 }}>{selectedProduct.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {selectedProduct.old_price && selectedProduct.old_price > selectedProduct.price && (
                          <Text style={{ textDecorationLine: 'line-through', color: 'gray', fontSize: 18 }}>
                            {formatPrice(selectedProduct.old_price)}
                          </Text>
                        )}
                        <Text style={{ fontSize: 22, fontWeight: '600', color: '#000' }}>{formatPrice(selectedProduct.price)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 6, borderRadius: 8 }}>
                      <Ionicons name="star" size={16} color="#FFD700" />
                      <Text style={{ marginLeft: 4, fontWeight: 'bold' }}>{selectedProduct.rating}</Text>
                    </View>
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

                  {/* 4. ВЫБОР ФАСОВКИ */}
                  {selectedProduct.pack_sizes && selectedProduct.pack_sizes.length > 0 && (
                    <>
                      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                        <Text>Фасування (</Text>
                        <Text>{selectedProduct.unit || 'шт'}</Text>
                        <Text>)</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                        {selectedProduct.pack_sizes.map((size) => (
                          <TouchableOpacity
                            key={size}
                            onPress={() => setSelectedSize(size)}
                            style={{
                              minWidth: 50, height: 50, borderRadius: 25,
                              borderWidth: 1,
                              borderColor: selectedSize === size ? 'black' : '#e0e0e0',
                              backgroundColor: selectedSize === size ? 'black' : 'white',
                              alignItems: 'center', justifyContent: 'center',
                              paddingHorizontal: 16
                            }}
                          >
                            <Text style={{ color: selectedSize === size ? 'white' : 'black', fontWeight: 'bold' }}>{size}</Text>
                          </TouchableOpacity>
                        ))}
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
                    {tab === 'desc' ? (selectedProduct.description || 'Опис для цього товару поки відсутній.') : tab === 'ingr' ? (selectedProduct.composition || 'Склад не вказано.') : (selectedProduct.usage || 'Спосіб прийому не вказано.')}
                  </Text>

                  {/* 6. Схожі товари */}
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Схожі товари</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {(products || [])
                      .filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id)
                      .map(item => (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => {
                            router.push(`/product/${item.id}`);
                          }}
                          style={{ width: 120, marginRight: 15 }}
                        >
                          <Image source={{ uri: getImageUrl(item.image) }} style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0' }} />
                          <Text numberOfLines={1} style={{ marginTop: 8, fontWeight: '600', fontSize: 13 }}>{item.name}</Text>
                          <Text style={{ color: '#666', fontSize: 12 }}>{formatPrice(item.price)}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              </ScrollView>

              {/* 7. ЗАКРЕПЛЕННЫЙ ФУТЕР */}
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
                      {quantity}
                    </Text>
                    <TouchableOpacity onPress={() => setQuantity(quantity + 1)} style={{ padding: 10 }}>
                      <Ionicons name="add" size={20} color="black" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity 
                    onPress={() => {
                      // Force combination of Size + Unit
                      let finalUnit = selectedProduct.unit || 'шт';
                      
                      // If product has pack sizes (e.g., ["200", "500"])
                      if (selectedProduct.pack_sizes && selectedProduct.pack_sizes.length > 0) {
                        if (!selectedSize) {
                          Alert.alert('Увага', 'Будь ласка, оберіть фасування');
                          return;
                        }
                        // Combine: "200" + " " + "г" -> "200 г"
                        finalUnit = `${selectedSize} ${selectedProduct.unit || ''}`.trim();
                      }
                      
                      console.log("DEBUG: Adding to cart with unit:", finalUnit); // Check terminal
                      addItem(selectedProduct, quantity, selectedSize || '', finalUnit);
                      setModalVisible(false);
                      showToast('Товар додано в кошик');
                    }}
                    style={{ flex: 1, backgroundColor: 'black', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
                  >
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                      <Text>У кошик • </Text>
                      <Text>{formatPrice(selectedProduct.price * quantity)}</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* TOAST INSIDE MODAL */}
          {toastVisible && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 60,
                alignSelf: 'center',
                backgroundColor: 'rgba(30, 30, 30, 0.85)',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 50,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.15,
                shadowRadius: 10,
                elevation: 10,
                zIndex: 10000,
                opacity: fadeAnim,
                transform: [{
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0]
                  })
                }]
              }}
            >
              <Ionicons 
                name={toastMessage.includes('Видалено') ? "trash-outline" : "checkmark-circle"} 
                size={20} 
                color="white" 
                style={{ marginRight: 10 }}
              />
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
                {toastMessage}
              </Text>
            </Animated.View>
          )}
        </SafeAreaView>
      </Modal>
      <Modal animationType="slide" visible={favModalVisible}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => setFavModalVisible(false)}
              style={styles.closeIconButton}
            >
              <Ionicons name="close" size={28} color="black" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Обране</Text>
            <View style={{ width: 40 }} />
          </View>
          {favorites.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>В обраному пусто</Text>
            </View>
          ) : (
            <FlatList
              data={favorites}
        keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.cartListContent}
        renderItem={({ item }) => (
                <TouchableOpacity 
                  onPress={() => {
                    setFavModalVisible(false); // Сначала закрываем Избранное
                    router.push(`/product/${item.id}`);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: 'white', padding: 10, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }}
                >
                  <Image source={{ uri: getImageUrl(item.image) }} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 15, backgroundColor: '#f0f0f0' }} />
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</Text>
                    <Text style={{ fontWeight: '600', color: '#555' }}>{formatPrice(item.price)}</Text>
          </View>

                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item);
                    }} 
                    style={{ padding: 10 }}
                  >
                    <Ionicons name="trash-outline" size={24} color="#ff3b30" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
          <FloatingChatButton />
        </SafeAreaView>
      </Modal>
      {/* SUCCESS ORDER MODAL */}
      <Modal animationType="fade" transparent={true} visible={successVisible}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: 'white', width: '80%', padding: 30, borderRadius: 25, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 }}>

            <View style={{ width: 80, height: 80, backgroundColor: '#e8f5e9', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Ionicons name="checkmark-circle" size={50} color="#4CAF50" />
            </View>

            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>Замовлення прийнято! 🎉</Text>
            <Text style={{ color: '#666', textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              Дякуємо за довіру.{'\n'}Менеджер зв'яжеться з вами найближчим часом для підтвердження.
            </Text>

            <TouchableOpacity 
              onPress={() => {
                setSuccessVisible(false);
                setTimeout(() => {
                  router.push('/(tabs)/profile');
                }, 300);
              }}
              style={{ backgroundColor: 'black', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15, width: '100%' }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Чудово</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
      {/* AI CHAT MODAL */}
      <Modal animationType="slide" visible={aiVisible} presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f2' }}>
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            {/* Header */}
            <View style={{ 
              padding: 15, 
              backgroundColor: 'white', 
              borderBottomWidth: 1, 
              borderColor: '#e0e0e0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={{ 
                  width: 45, 
                  height: 45, 
                  backgroundColor: '#e0f7fa', 
                  borderRadius: 22.5, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginRight: 12 
                }}>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#00bcd4" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 17, color: '#000' }}>Експерт природи 🌿</Text>
                  <Text style={{ color: '#4CAF50', fontSize: 13, marginTop: 2 }}>Online • Готовий допомогти</Text>
                </View>
              </View>
              <TouchableOpacity 
                onPress={() => setAiVisible(false)}
                style={{ padding: 8, borderRadius: 8 }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Сообщения */}
            <FlatList
              ref={chatFlatListRef}
              data={messages}
              renderItem={({ item }) => {
                const isUser = item.sender === 'user';
                return (
                  <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 15 }}>
                    {/* Текст сообщения */}
                    <View style={[
                      {
                        padding: 12,
                        borderRadius: 18,
                        maxWidth: '80%',
                      },
                      isUser ? {
                        backgroundColor: '#000',
                        borderBottomRightRadius: 4,
                      } : {
                        backgroundColor: '#fff',
                        borderBottomLeftRadius: 4,
                        borderWidth: 1,
                        borderColor: '#e5e5e5',
                      }
                    ]}>
                      <Text style={{ 
                        color: isUser ? '#fff' : '#333', 
                        fontSize: 16 
                      }}>
                        {item.text}
                      </Text>
                    </View>

                    {/* Карточки товаров (только у бота) */}
                    {!isUser && (item as any).products && Array.isArray((item as any).products) && (item as any).products.length > 0 && (
                      <View style={{ marginTop: 8, width: '85%' }}>
                        {((item as any).products as any[]).map((prod: any) => (
                          <TouchableOpacity 
                            key={prod.id} 
                            style={{
                              flexDirection: 'row',
                              backgroundColor: '#fff',
                              padding: 10,
                              borderRadius: 12,
                              marginBottom: 8,
                              borderWidth: 1,
                              borderColor: '#eee',
                              alignItems: 'center',
                              shadowColor: '#000',
                              shadowOpacity: 0.05,
                              shadowRadius: 5,
                              elevation: 2,
                            }}
                            activeOpacity={0.7}
                            onPress={() => {
                              setAiVisible(false);
                              setTimeout(() => {
                                router.push(`/product/${prod.id}`);
                              }, 300);
                            }}
                          >
                            <Image 
                              source={{ uri: getImageUrl(prod.image || prod.image_url || prod.picture) }} 
                              style={{
                                width: 50,
                                height: 50,
                                borderRadius: 8,
                                marginRight: 12,
                                backgroundColor: '#f0f0f0',
                              }}
                              resizeMode="cover"
                            />
                            <View style={{ flex: 1, justifyContent: 'center' }}>
                              <Text style={{
                                fontWeight: '600',
                                fontSize: 14,
                                color: '#000',
                                marginBottom: 4,
                              }} numberOfLines={1}>
                                {prod.name}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {prod.old_price && prod.old_price > prod.price && (
                                  <Text style={{
                                    textDecorationLine: 'line-through',
                                    color: '#999',
                                    fontSize: 12
                                  }}>
                                    {formatPrice(prod.old_price)}
                                  </Text>
                                )}
                                <Text style={{
                                  color: '#2ecc71',
                                  fontWeight: 'bold',
                                  fontSize: 14,
                                }}>
                                  {formatPrice(prod.price)}
                                </Text>
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              }}
              keyExtractor={item => `msg-${item.id}`}
              contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
              style={{ flex: 1 }}
              onContentSizeChange={() => {
                setTimeout(() => {
                  chatFlatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              ListFooterComponent={
                isLoading ? (
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    paddingVertical: 12,
                    alignSelf: 'flex-start'
                  }}>
                    <ActivityIndicator size="small" color="#999" style={{ marginRight: 10 }} />
                    <Text style={{ color: '#999', fontSize: 14 }}>Бот печатає...</Text>
                  </View>
                ) : null
              }
            />

            {/* Зона ввода */}
            <View style={{
              flexDirection: 'row',
              padding: 10,
              paddingHorizontal: 15,
              backgroundColor: '#fff',
              borderTopWidth: 1,
              borderColor: '#eee',
              alignItems: 'center',
            }}>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 25,
                  paddingHorizontal: 15,
                  paddingVertical: 10,
                  fontSize: 16,
                  marginRight: 10,
                  height: 45,
                }}
                value={inputMessage}
                onChangeText={setInputMessage}
                placeholder="Запитайте про товар..."
                placeholderTextColor="#888"
                onSubmitEditing={sendMessage}
                editable={!isLoading}
                multiline={false}
              />
              <TouchableOpacity 
                style={{
                  width: 45,
                  height: 45,
                  borderRadius: 25,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: (isLoading || !inputMessage.trim()) ? '#b0b0b0' : '#000'
                }} 
                onPress={sendMessage}
                disabled={isLoading || !inputMessage.trim()}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      {/* ELEGANT TOP TOAST */}
      {toastVisible && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 60,
            alignSelf: 'center',
            backgroundColor: 'rgba(30, 30, 30, 0.85)',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 50,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 5,
            zIndex: 10000,
            opacity: fadeAnim,
            transform: [{
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0]
              })
            }]
          }}
        >
          <Ionicons 
            name={toastMessage.includes('Видалено') ? "trash-outline" : "checkmark-circle"} 
            size={20} 
            color="white" 
            style={{ marginRight: 10 }}
          />
          <Text style={{ color: 'white', fontWeight: '600', fontSize: 14, letterSpacing: 0.5 }}>
            {toastMessage}
          </Text>
        </Animated.View>
      )}
      {/* Floating Chat Button */}
      <FloatingChatButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#fff", 
    paddingTop: 50, 
    paddingHorizontal: 20 
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { 
    fontSize: 28, 
    fontWeight: "bold", 
    marginBottom: 10 
  },
  searchContainer: {
    marginBottom: 15,
    position: 'relative',
  },
  searchInput: {
    height: 45,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingRight: 45,
    fontSize: 16,
  },
  searchClearButton: {
    position: 'absolute',
    right: 10,
    top: 12,
    padding: 5,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyStateMessage: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
  },
  categoriesList: { 
    paddingHorizontal: 20, 
    paddingBottom: 20,
    gap: 10 
  },
  categoryItem: { 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 25, 
    backgroundColor: '#F0F0F0', 
    marginRight: 10 
  },
  categoryItemActive: { 
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3
  },
  categoryText: { 
    color: '#333', 
    fontWeight: '600',
    fontSize: 14 
  },
  categoryTextActive: { 
    color: '#fff' 
  },
  card: { 
    marginBottom: 15, 
    padding: 0, 
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  image: { 
    width: "100%", 
    height: 250, 
    borderRadius: 0,
    resizeMode: 'cover'
  },
  productBadge: {
    position: 'absolute',
    top: 15,
    left: 15,
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    zIndex: 10,
  },
  productBadgeSale: {
    backgroundColor: '#FF3B30',
  },
  productBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    padding: 8,
  },
  shareButton: {
    position: 'absolute',
    top: 10,
    right: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 30,
    padding: 8,
  },
  productModalImageContainer: {
    position: 'relative',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  cardInfo: {
    flex: 1,
  },
  name: { 
    fontSize: 16, 
    fontWeight: "600",
    marginBottom: 4,
    color: '#333',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    color: '#666',
    fontSize: 13,
    marginLeft: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  price: { 
    fontSize: 18, 
    color: "#000", 
    fontWeight: 'bold',
  },
  addButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  cartBar: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'green',
    padding: 15,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cartBarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  categoriesContent: { paddingRight: 20 },
  listContent: { paddingBottom: 80 },
  cartPanel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "green", padding: 15, alignItems: "center" },
  cartText: { color: "white", fontSize: 16, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0", position: "relative" },
  closeIconButton: { width: 40, alignItems: "flex-start", justifyContent: "center", padding: 5, zIndex: 1 },
  modalTitle: { fontSize: 24, fontWeight: "bold", position: "absolute", left: 0, right: 0, textAlign: "center" },
  closeButton: { color: "red", fontSize: 16, fontWeight: "600" },
  cartListContent: { padding: 20 },
  cartItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 16 },
  cartItemPrice: { fontSize: 16, color: "green", fontWeight: "600" },
  removeButton: { color: "red", fontSize: 16, fontWeight: "600" },
  totalContainer: { padding: 20, borderTopWidth: 1, borderTopColor: "#e0e0e0" },
  totalText: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  checkoutButton: { backgroundColor: "orange", padding: 15, borderRadius: 10, marginTop: 15, alignItems: "center" },
  checkoutButtonDisabled: { backgroundColor: "#ccc" },
  checkoutButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
  productModalContainer: { flex: 1, backgroundColor: "#fff" },
  productModalHeader: { flexDirection: "row", justifyContent: "flex-end", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  productModalContent: { paddingBottom: 20 },
  productModalImage: { width: "100%", height: 300, borderRadius: 15, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  productModalTitle: { fontSize: 28, fontWeight: "bold", marginBottom: 10, color: "#333" },
  productModalRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  productModalRatingText: {
    color: '#333',
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 8,
  },
  productModalPrice: { fontSize: 24, color: "#000", fontWeight: "bold", marginBottom: 20 },
  productModalDescription: { fontSize: 15, lineHeight: 22, color: "#666", marginBottom: 20 },
  addToCartButton: { 
    backgroundColor: "#000", 
    padding: 18, 
    borderRadius: 30, 
    alignItems: "center", 
    width: '100%',
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.2, 
    shadowRadius: 4, 
    elevation: 5 
  },
  addToCartButtonText: { color: "white", fontSize: 18, fontWeight: "bold" },
  sizeSelectorContainer: { marginBottom: 20 },
  sizeSelectorLabel: { fontSize: 14, color: "#666", marginBottom: 10 },
  sizeButtonsContainer: { flexDirection: "row", alignItems: "center" },
  sizeButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: "#ddd", 
    backgroundColor: "#fff", 
    justifyContent: "center", 
    alignItems: "center", 
    marginRight: 10 
  },
  sizeButtonSelected: { 
    backgroundColor: "#000", 
    borderColor: "#000" 
  },
  sizeButtonText: { 
    fontSize: 14, 
    fontWeight: "600", 
    color: "#000" 
  },
  sizeButtonTextSelected: { 
    color: "#fff" 
  },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { fontSize: 18, color: "#666", textAlign: "center" },
  headerIcons: { flexDirection: "row", alignItems: "center" },
  searchIconButton: { marginRight: 15 },
  profileIconButton: { marginLeft: 15 },
  profileContent: { padding: 20 },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 20,
  },
  profileAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  profileStatus: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 15,
  },
  profileStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  ordersTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderCardLeft: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  orderDate: {
    fontSize: 14,
    color: '#666',
  },
  orderCardRight: {
    alignItems: 'flex-end',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  orderStatus: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  orderItems: {
    marginTop: 10,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  orderItemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'cover',
  },
  orderItemName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  orderItemSize: {
    fontSize: 12,
    color: '#666',
    marginLeft: 10,
  },
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '80%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  successModalSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  successModalButton: {
    backgroundColor: '#000',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  successModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

// Force Refresh Data: 1737123456789