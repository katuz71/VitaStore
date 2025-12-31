import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, ActivityIndicator, Dimensions, FlatList, Image, ImageBackground, KeyboardAvoidingView, Modal, Platform, RefreshControl, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from "react-native";
import Markdown from 'react-native-markdown-display';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrdersContext';
import { API_URL } from '../config/api';

type Product = {
  id: number;
  name: string;
  price: number;
  image: string;
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
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Всі");
  const [sortType, setSortType] = useState<'popular' | 'asc' | 'desc'>('popular');
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [favModalVisible, setFavModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Обработка параметра для открытия профиля после заказа
  useEffect(() => {
    if (params.showProfile === 'true') {
      // Небольшая задержка для плавного перехода
      const timer = setTimeout(() => {
        setProfileModalVisible(true);
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
    { id: 1, text: 'Привіт! Я VitaBot 🤖. Допомогти підібрати вітаміни?', sender: 'bot' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const flatListRef = useRef<FlatList>(null);
  const chatFlatListRef = useRef<FlatList>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<'desc' | 'ingr' | 'use'>('desc');

  const categories = ['Всі', 'Вітаміни', 'Спорт', 'Краса', 'Енергія'];

  const banners = [
    { id: 1, title: 'Вітаміни для родини', subtitle: 'Зміцнення імунітету', image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=800' },
    { id: 2, title: 'Енергія та Спорт', subtitle: 'Досягай нових вершин', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800' },
    { id: 3, title: 'Краса та Сяйво', subtitle: 'Колаген та шкіра', image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800' },
  ];

  // Автоматическая прокрутка баннеров
  useEffect(() => {
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
  }, []);

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
    const packSize = size ? parseInt(size) : 30; // Конвертируем size в число или используем 30 по умолчанию
    addItem(item, packSize);
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

  const removeFromCart = (index: number) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
    if (newCart.length === 0) {
      setCartModalVisible(false);
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

  const API_URL = 'http://192.168.1.161:8000/chat';

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    const userMsg = { id: Date.now(), text: userMessage, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    // Construct conversation history
    const history = messages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant', // Adjust 'sender' check based on your actual state
      content: msg.text // Adjust 'text' if your field is named differently
    }));
    
    // Add the current new message explicitly
    history.push({ role: 'user', content: userMessage });

    // Call real API
    try {
      const response = await fetch(API_URL, {
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
      const botMsg = { id: Date.now() + 1, text: data.response, sender: 'bot' };
      setMessages(prev => [...prev, botMsg]);
      Vibration.vibrate(50); // Вибрация при ответе
    } catch (error) {
      console.error('Error calling API:', error);
      const errorMsg = { id: Date.now() + 1, text: 'Вибачте, не вдалося підключитися до сервера. Перевірте, чи запущений сервер.', sender: 'bot' };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const totalAmount = subtotal - (subtotal * discount);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Загружаем данные с сервера
    await fetchProducts();
    setRefreshing(false);
  }, [fetchProducts]);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % banners.length;
        const scrollPosition = nextIndex * 315; // 300 (width) + 15 (marginRight)
        scrollViewRef.current?.scrollTo({ x: scrollPosition, animated: true });
        return nextIndex;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Render Product Item для сетки из 2 колонок
  const renderProductItem = ({ item }: { item: Product }) => {
    // Safe value extraction with type checking
    const safeName = item.name && typeof item.name === 'string' ? item.name : '';
    const safeCategory = item.category && typeof item.category === 'string' ? item.category : 'Без категорії';
    const safeBadge = item.badge && typeof item.badge === 'string' ? item.badge : null;
    const safePrice = typeof item.price === 'number' ? item.price : 0;
    const safeOldPrice = typeof item.old_price === 'number' ? item.old_price : null;
    const hasDiscount = safeOldPrice !== null && safeOldPrice > safePrice;
    const imageUri = item.image?.startsWith('http') ? String(item.image) : `${API_URL}${String(item.image || '')}`;
    const isFavorite = favorites.some(f => f.id === item.id);

    return (
      <TouchableOpacity 
        onPress={() => {
          setSelectedProduct(item);
          setSelectedSize(null);
          setQuantity(1);
          setModalVisible(true);
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
        <View style={{ height: 140, marginBottom: 10, borderRadius: 10, overflow: 'hidden' }}>
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
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
            onPress={(e) => {
              e.stopPropagation();
              Vibration.vibrate(50);
              addItem(item, 30);
              showToast(`+1 ${safeName} у кошику`);
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
            onPress={() => setCartModalVisible(true)}
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
          <TouchableOpacity 
            onPress={() => setProfileModalVisible(true)}
            style={{ position: 'relative' }}
          >
            <Ionicons name="person-circle-outline" size={24} color="black" />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        ref={flatListRef}
        data={banners}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={{ width: Dimensions.get('window').width - 40, height: 200, marginRight: 20, overflow: 'hidden' }}>
            <Image source={{ uri: item.image?.startsWith('http') ? item.image : `${API_URL}${item.image}` }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>{item.title}</Text>
              <Text style={{ color: '#eee', fontSize: 16, marginTop: 4 }}>{item.subtitle}</Text>
            </View>
          </View>
        )}
        keyExtractor={item => item.id.toString()}
        snapToInterval={Dimensions.get('window').width - 20}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        style={{ marginBottom: 25 }}
      />
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
      <View style={{ marginBottom: 20 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ paddingHorizontal: 20 }}
        >
          {categories.map((cat, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setSelectedCategory(cat)}
              style={{
                backgroundColor: selectedCategory === cat ? 'black' : '#f0f0f0',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 25,
                marginRight: 10,
                borderWidth: 1,
                borderColor: selectedCategory === cat ? 'black' : 'transparent',
              }}
            >
              <Text style={{ 
                color: selectedCategory === cat ? 'white' : 'black', 
                fontWeight: '600',
                fontSize: 14 
              }}>
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

      {productsLoading ? (
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
      <Modal animationType="slide" visible={modalVisible}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ваш кошик</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButton}>Закрити</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={cartItems}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item, index }) => (
              <View style={styles.cartItem}>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  {item.size && (
                    <Text style={{ color: 'gray', fontSize: 12 }}>
                      <Text>Фасування: </Text>
                      <Text>{item.size} </Text>
                      <Text>{(item as any).unit || 'шт'}.</Text>
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {(item as any).old_price && (item as any).old_price > item.price && (
                      <Text style={{ textDecorationLine: 'line-through', color: 'gray', fontSize: 12 }}>
                        {formatPrice((item as any).old_price)}
                      </Text>
                    )}
                    <Text style={styles.cartItemPrice}>{formatPrice(item.price)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeFromCart(index)}>
                  <Text style={styles.removeButton}>Видалити</Text>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={styles.cartListContent}
          />
          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>
              <Text>Разом: </Text>
              <Text>{formatPrice(totalAmount)}</Text>
            </Text>
            <TouchableOpacity
              style={[styles.checkoutButton, cartItems.length === 0 && styles.checkoutButtonDisabled]}
              onPress={() => {
                if (cartItems.length === 0) {
                  Alert.alert('Кошик порожній', 'Додайте товари до кошика');
                  return;
                }
                setCartModalVisible(false);
                router.push('/checkout');
              }}
              disabled={cartItems.length === 0}
            >
              <Text style={styles.checkoutButtonText}>Оформити замовлення</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal animationType="slide" visible={cartModalVisible}>
        <SafeAreaView style={styles.cartModalContainer}>
          <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Кошик</Text>
            
            {cart.length > 0 && (
              <TouchableOpacity 
                onPress={() => {
                  Alert.alert("Очистити кошик?", "Ви впевнені?", [
                    { text: "Ні", style: "cancel" },
                    { text: "Так", style: "destructive", onPress: () => {
                      setCart([]);
                      setCartModalVisible(false);
                    }}
                  ]);
                }}
              >
                <Text style={{ color: 'red', fontSize: 14, fontWeight: '600' }}>Очистити все</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity onPress={() => setCartModalVisible(false)} style={{ marginLeft: 15 }}>
              <Ionicons name="close" size={28} color="black" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={cartItems}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            contentContainerStyle={{ padding: 20, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 100 }}>
                <View style={{ width: 100, height: 100, backgroundColor: '#f5f5f5', borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Ionicons name="cart-outline" size={50} color="#ccc" />
                </View>
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>Кошик порожній</Text>
                <Text style={{ color: '#888', textAlign: 'center', marginBottom: 30, width: '70%' }}>
                  Ви ще нічого не додали. Загляньте в каталог, там багато цікавого!
                </Text>
                
                <TouchableOpacity 
                  onPress={() => setCartModalVisible(false)}
                  style={{ backgroundColor: 'black', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15 }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Перейти до каталогу</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => {
              const renderCartItem = ({ item }: { item: Product }) => (
                <View style={{ flexDirection: 'row', marginBottom: 20, backgroundColor: 'white', borderRadius: 15, padding: 10, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                  
                  {/* Фото */}
                  <TouchableOpacity
                    onPress={() => {
                      const product = (products || []).find(p => p.id === item.id);
                      if (product) {
                        setCartModalVisible(false);
                        setTimeout(() => {
                          setSelectedProduct(product);
                          setSelectedSize(String((item as any).packSize || item.size || '30'));
                          setQuantity(item.quantity || 1);
                          setTab('desc');
                          setModalVisible(true);
                        }, 300);
                      }
                    }}
                  >
                    <Image source={{ uri: item.image?.startsWith('http') ? item.image : `${API_URL}${item.image}` }} style={{ width: 70, height: 70, borderRadius: 10, backgroundColor: '#f5f5f5' }} />
                  </TouchableOpacity>
                  
                  {/* Инфо */}
                  <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: 'bold' }}>
                      <Text>{item.name}</Text>
                      <Text> ({(item as any).unit || (item as any).packSize || 'шт'})</Text>
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '600', marginTop: 5 }}>{formatPrice(item.price * (item.quantity || 1))}</Text>
                  </View>

                  {/* Управление количеством */}
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, padding: 2, marginBottom: 8 }}>
                      <TouchableOpacity 
                        onPress={() => {
                          const itemUnit = (item as any).unit || (item as any).packSize || 'шт';
                          removeOne(item.id, itemUnit);
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="remove" size={16} color="black" />
                      </TouchableOpacity>
                      
                      <Text style={{ marginHorizontal: 8, fontWeight: 'bold', fontSize: 14 }}>{item.quantity || 1}</Text>
                      
                      <TouchableOpacity 
                        onPress={() => {
                          const itemUnit = (item as any).unit || (item as any).packSize || 'шт';
                          addOne(item.id, itemUnit);
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="add" size={16} color="black" />
                      </TouchableOpacity>
                    </View>

                    {/* Удалить */}
                    <TouchableOpacity 
                      onPress={() => {
                        Vibration.vibrate(100);
                        const itemPackSize = (item as any).packSize || parseInt(item.size || '30');
                        removeItem(item.id, itemPackSize);
                        if (cartItems.length <= 1) {
                          setCartModalVisible(false);
                        }
                        showToast('Видалено з кошика');
                      }}
                      style={{ padding: 5 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#999" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
              return renderCartItem({ item });
            }}
                contentContainerStyle={cart.length === 0 ? { padding: 20, flexGrow: 1 } : styles.cartModalListContent}
                ItemSeparatorComponent={() => <View style={styles.cartModalSeparator} />}
              />
              {cart.length > 0 && (
                <>
                  <View style={styles.cartModalFooter}>
                    {/* Промокод */}
                    <View style={{ flexDirection: 'row', marginBottom: 20, marginTop: 10 }}>
                      <TextInput
                        placeholder="Промокод (напр. START)"
                        value={promoCode}
                        onChangeText={setPromoCode}
                        autoCapitalize="characters"
                        style={{ flex: 1, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 10, marginRight: 10 }}
                      />
                      <TouchableOpacity 
                        onPress={applyPromo}
                        style={{ backgroundColor: 'black', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10 }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>OK</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Отображение скидки (если есть) */}
                    {discount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>Знижка 10%:</Text>
                        <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>- {formatPrice(subtotal * discount)}</Text>
                      </View>
                    )}

                    <Text style={styles.cartModalTotal}>
                      <Text>Разом: </Text>
                      <Text>{formatPrice(totalAmount)}</Text>
                    </Text>
                    <TouchableOpacity
                      disabled={cartItems.length === 0}
                      onPress={() => {
                        if (cartItems.length === 0) {
                          Alert.alert('Кошик порожній', 'Додайте товари до кошика');
                          return;
                        }
                        setCartModalVisible(false);
                        router.push('/checkout');
                      }}
                      style={{
                        backgroundColor: cartItems.length > 0 ? 'black' : '#ccc', // Серый, если пусто
                        paddingVertical: 15,
                        borderRadius: 12,
                        alignItems: 'center',
                        marginTop: 20
                      }}
                    >
                      <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                        Оформити замовлення
                      </Text>
                    </TouchableOpacity>
                  </View>
                  </>
              )}
        </SafeAreaView>
      </Modal>
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
                  <Image source={{ uri: selectedProduct.image?.startsWith('http') ? selectedProduct.image : `${API_URL}${selectedProduct.image}` }} style={{ width: '100%', height: 350, resizeMode: 'cover' }} />
                  
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
                            setModalVisible(false);
                            setTimeout(() => {
                              setSelectedProduct(item); setSelectedSize(null); setQuantity(1); setTab('desc'); setModalVisible(true);
                            }, 100);
                          }}
                          style={{ width: 120, marginRight: 15 }}
                        >
                          <Image source={{ uri: item.image?.startsWith('http') ? item.image : `${API_URL}${item.image}` }} style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0' }} />
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
                      <Text>{quantity} </Text>
                      <Text>{selectedProduct.unit || 'шт'}</Text>
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
            <Text style={styles.modalTitle}>Обране</Text>
            <TouchableOpacity onPress={() => setFavModalVisible(false)}>
              <Text style={styles.closeButton}>Закрити</Text>
            </TouchableOpacity>
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
                    // Небольшая задержка для плавности смены окон
                    setTimeout(() => {
                      setSelectedProduct(item);
                      setSelectedSize(null); // Сбрасываем выбор размера
                      setQuantity(1);        // Сбрасываем количество
                      setModalVisible(true); // Открываем карточку товара
                    }, 100);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: 'white', padding: 10, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }}
                >
                  <Image source={{ uri: item.image?.startsWith('http') ? item.image : `${API_URL}${item.image}` }} style={{ width: 60, height: 60, borderRadius: 8, marginRight: 15, backgroundColor: '#f0f0f0' }} />
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.name}</Text>
                    <Text style={{ fontWeight: '600', color: '#555' }}>{formatPrice(item.price)}</Text>
          </View>

                  <TouchableOpacity onPress={() => toggleFavorite(item)} style={{ padding: 10 }}>
                    <Ionicons name="heart" size={24} color="red" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
      {/* PROFILE MODAL (Экран Профиля) */}
      <Modal animationType="slide" visible={profileModalVisible} onRequestClose={() => setProfileModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
          <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            {/* Header Профиля */}
            <View style={{ padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Мої замовлення</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {orders.length > 0 && (
                  <TouchableOpacity 
                    onPress={() => {
                      Alert.alert("Очистити історію?", "Всі замовлення будуть видалені. Цю дію неможливо скасувати.", [
                        { text: "Скасувати", style: "cancel" },
                        { 
                          text: "Очистити", 
                          style: "destructive", 
                          onPress: () => {
                            clearOrders();
                            showToast('Історія замовлень очищена');
                          }
                        }
                      ]);
                    }}
                    style={{ marginRight: 15, padding: 5 }}
                  >
                    <Ionicons name="trash-outline" size={24} color="#ff3b30" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setProfileModalVisible(false)} style={{ padding: 5 }}>
                  <Ionicons name="close" size={24} color="black" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Список заказов */}
            <FlatList
              data={orders}
              keyExtractor={item => String(item.id)}
              contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 100 }}>
                  <Ionicons name="receipt-outline" size={60} color="#ccc" />
                  <Text style={{ marginTop: 20, color: '#888', fontSize: 16 }}>Історія замовлень порожня</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }}>
                  
                  {/* Верхняя часть: Номер, Дата, Статус */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                        <Text>Замовлення №</Text>
                        <Text>{item.id}</Text>
                      </Text>
                      <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{item.date}</Text>
                      {item.name && (
                        <Text style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                          <Text>Клієнт: </Text>
                          <Text>{item.name}</Text>
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start', marginRight: 10 }}>
                        <Text style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: 12 }}>Нове</Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => {
                          Alert.alert("Видалити замовлення?", "Цю дію неможливо скасувати.", [
                            { text: "Скасувати", style: "cancel" },
                            { 
                              text: "Видалити", 
                              style: "destructive", 
                              onPress: () => {
                                removeOrder(item.id);
                                showToast('Замовлення видалено');
                              }
                            }
                          ]);
                        }}
                        style={{ padding: 5 }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Город */}
                  {item.city && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 }}>
                      <Ionicons name="location-outline" size={16} color="#666" />
                      <Text style={{ marginLeft: 5, color: '#555', fontSize: 13, flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Місто: </Text>
                        <Text>{item.city}</Text>
                      </Text>
                    </View>
                  )}

                  {/* Отделение почты */}
                  {item.warehouse && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 }}>
                      <Ionicons name="cube-outline" size={16} color="#666" style={{ marginTop: 2 }} />
                      <Text style={{ marginLeft: 5, color: '#555', fontSize: 13, flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Відділення: </Text>
                        <Text>{item.warehouse}</Text>
                      </Text>
                    </View>
                  )}

                  {/* Телефон */}
                  {item.phone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 }}>
                      <Ionicons name="call-outline" size={16} color="#666" />
                      <Text style={{ marginLeft: 5, color: '#555', fontSize: 13, flex: 1 }}>
                        <Text style={{ fontWeight: '600' }}>Телефон: </Text>
                        <Text>{item.phone}</Text>
                      </Text>
                    </View>
                  )}

                  {/* Миниатюры товаров */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                    {item.items.map((prod, index) => (
                      <View key={index} style={{ marginRight: 10, width: 60 }}>
                        <Image source={{ uri: prod.image?.startsWith('http') ? prod.image : `${API_URL}${prod.image}` }} style={{ width: 60, height: 60, borderRadius: 10, backgroundColor: '#f0f0f0' }} />
                        <View style={{ position: 'absolute', bottom: -5, right: -5, backgroundColor: 'black', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{prod.quantity || 1}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>

                  {/* Итого */}
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#666' }}>Разом до сплати:</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{formatPrice(item.total)}</Text>
                  </View>
                  
                </View>
              )}
            />
          </View>
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
                  setProfileModalVisible(true);
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
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            {/* Header Чата */}
            <View style={{ padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, backgroundColor: '#e0f7fa', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Ionicons name="happy" size={24} color="#00bcd4" />
                </View>
                <View>
                  <Text style={{ fontWeight: 'bold', fontSize: 16 }}>VitaBot AI 🤖</Text>
                  <Text style={{ color: '#4CAF50', fontSize: 12 }}>Online</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAiVisible(false)}>
                <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Закрити</Text>
              </TouchableOpacity>
            </View>

            {/* Сообщения */}
            <FlatList
              ref={chatFlatListRef}
              data={messages}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{ padding: 15 }}
              style={{ flex: 1 }}
              onContentSizeChange={() => chatFlatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => chatFlatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => (
                <View style={{ alignSelf: item.sender === 'user' ? 'flex-end' : 'flex-start', backgroundColor: item.sender === 'user' ? 'black' : 'white', padding: 12, borderRadius: 16, maxWidth: '80%', marginBottom: 10, borderBottomRightRadius: item.sender === 'user' ? 2 : 16, borderBottomLeftRadius: item.sender === 'bot' ? 2 : 16 }}>
                <Markdown
                  style={{
                    body: {
                      color: item.sender === 'user' ? 'white' : 'black',
                      fontSize: 16,
                      margin: 0,
                      padding: 0,
                    },
                    paragraph: {
                      marginTop: 0,
                      marginBottom: 0,
                    },
                  }}
                  onLinkPress={(url) => {
                    if (url.startsWith('product://')) {
                      const id = url.split('product://')[1];
                      const product = (products || []).find(p => p.id.toString() === id);
                      if (product) {
                        setSelectedProduct(product);
                        setSelectedSize(null);
                        setQuantity(1);
                        setModalVisible(true);
                      }
                      return false; // Prevent default browser opening
                    }
                    return true; // Allow other links to open normally
                  }}
                >
                  {item.text}
                </Markdown>
                </View>
              )}
              ListFooterComponent={
                isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 15 }}>
                    <ActivityIndicator size="small" color="#999" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#999', fontSize: 14 }}>Бот печатает...</Text>
                  </View>
                ) : null
              }
            />

            {/* Ввод */}
            <View style={{ padding: 10, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={inputMessage}
                onChangeText={setInputMessage}
                placeholder="Запитайте про вітаміни..."
                style={{ flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, marginRight: 10, fontSize: 16 }}
              />
              <TouchableOpacity onPress={sendMessage} style={{ backgroundColor: 'black', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="send" size={20} color="white" />
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
      {/* AI FLOAT BUTTON */}
      <TouchableOpacity
        onPress={() => setAiVisible(true)}
        style={{
          position: 'absolute',
          bottom: 30,
          right: 20,
          width: 60,
          height: 60,
          backgroundColor: 'black',
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: 8,
          zIndex: 999
        }}
      >
        <Ionicons name="chatbubble-ellipses" size={30} color="white" />
      </TouchableOpacity>
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
  cartModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  cartModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cartModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  cartModalCloseButton: {
    color: 'red',
    fontSize: 16,
    fontWeight: '600',
  },
  cartEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartEmptyText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
  },
  cartModalListContent: {
    padding: 20,
  },
  cartModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  cartModalItemImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 15,
    resizeMode: 'cover',
  },
  cartModalItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cartModalItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  cartModalItemSize: {
    fontSize: 14,
    color: '#666',
  },
  cartModalItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cartModalItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  cartModalDeleteButton: {
    padding: 5,
  },
  cartModalSeparator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 5,
  },
  cartModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  cartModalTotal: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#000',
  },
  cartModalPayButton: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  cartModalPayButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  categoriesList: {
    paddingHorizontal: 20,
    alignItems: 'center', // Центрирование кнопок по вертикали
    paddingRight: 20,
  },
  categoryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
    marginRight: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40, // Фиксируем высоту кнопки, чтобы они были ровными
  },
  categoryButtonActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  categoryButtonInactive: {
    backgroundColor: '#fff',
    borderColor: '#E0E0E0',
  },
  categoryText: {
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18, // Фикс для выравнивания текста
  },
  categoryTextActive: {
    color: '#fff',
  },
  categoryTextInactive: {
    color: '#000',
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
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  modalTitle: { fontSize: 24, fontWeight: "bold" },
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