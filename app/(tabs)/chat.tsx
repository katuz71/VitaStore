import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, Image, StyleSheet, ActivityIndicator, ScrollView, SafeAreaView, Vibration
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { getImageUrl } from '../utils/image';
import { useOrders } from '../context/OrdersContext';

interface Product {
  id: number;
  name: string;
  price: number;
  image?: string;
  image_url?: string;
  picture?: string;
  old_price?: number;
}

interface Message {
  id: string | number;
  text: string;
  sender: 'user' | 'bot';
  products?: Product[];
}

// Функция форматирования цены
const formatPrice = (price: number) => {
  return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
};

export default function ChatScreen() {
  const router = useRouter();
  const { products } = useOrders();
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'Привіт! Я VitaBot 🤖. Допомогти підібрати вітаміни?', sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = inputText.trim();
    const userMsg: Message = { 
      id: Date.now(), 
      text: userMessage, 
      sender: 'user' 
    };

    // 1. Добавляем сообщение пользователя
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    // Скроллим после добавления сообщения пользователя
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      // 2. Формируем историю для отправки (адаптировано под текущий API)
      const history = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      history.push({ role: 'user', content: userMessage });

      // 3. Запрос к бэкенду
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // 4. Формируем ответ бота (адаптировано под текущий формат ответа)
      const botMsg: Message = {
        id: Date.now() + 1,
        text: data.text || data.response || 'Вибачте, не вдалося отримати відповідь.',
        sender: 'bot',
        products: data.products || []
      };

      setMessages(prev => [...prev, botMsg]);
      Vibration.vibrate(50);

      // Скроллим после получения ответа
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (error) {
      console.error('Error calling API:', error);
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        text: 'Вибачте, не вдалося підключитися до сервера. Перевірте, чи запущений сервер.', 
        sender: 'bot' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Авто-скролл вниз при новых сообщениях
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[
        styles.messageContainer, 
        isUser ? styles.userMessage : styles.botMessage
      ]}>
        <Text style={isUser ? styles.userText : styles.botText}>{item.text}</Text>
        
        {/* Рендер товаров внутри сообщения бота */}
        {!isUser && item.products && item.products.length > 0 && (
          <View style={styles.productsContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productsScrollContent}
            >
              {item.products.map((prod) => (
                <TouchableOpacity 
                  key={prod.id} 
                  style={styles.productCard}
                  onPress={() => router.push(`/product/${prod.id}`)}
                >
                  <Image 
                    source={{ uri: getImageUrl(prod.image || prod.image_url || prod.picture) }} 
                    style={styles.productImage} 
                    resizeMode="cover"
                  />
                  <View style={styles.productInfo}>
                    <Text numberOfLines={1} style={styles.productName}>{prod.name}</Text>
                    <View style={styles.priceContainer}>
                      {prod.old_price && prod.old_price > prod.price && (
                        <Text style={styles.oldPrice}>{formatPrice(prod.old_price)}</Text>
                      )}
                      <Text style={styles.productPrice}>{formatPrice(prod.price)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#00bcd4" />
            </View>
            <View>
              <Text style={styles.headerTitle}>VitaBot AI 🤖</Text>
              <Text style={styles.headerSubtitle}>Online • Готовий допомогти</Text>
            </View>
          </View>
        </View>

        {/* Сообщения */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => `msg-${item.id}`}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          onContentSizeChange={() => {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }}
          ListFooterComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#999" style={{ marginRight: 10 }} />
                <Text style={styles.loadingText}>Бот печатає...</Text>
              </View>
            ) : null
          }
        />

        {/* Поле ввода */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Запитайте про вітаміни..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
            editable={!loading}
          />
          <TouchableOpacity 
            style={[
              styles.sendButton,
              (!inputText.trim() || loading) && styles.sendButtonDisabled
            ]} 
            onPress={sendMessage}
            disabled={!inputText.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  container: { 
    flex: 1, 
    backgroundColor: '#f5f5f5' 
  },
  header: {
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  avatar: {
    width: 45,
    height: 45,
    backgroundColor: '#e0f7fa',
    borderRadius: 22.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 17,
    color: '#000'
  },
  headerSubtitle: {
    color: '#4CAF50',
    fontSize: 13,
    marginTop: 2
  },
  list: {
    flex: 1
  },
  listContent: { 
    padding: 16, 
    paddingBottom: 20 
  },
  messageContainer: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#000',
    borderBottomRightRadius: 4,
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  userText: { 
    color: '#fff', 
    fontSize: 15,
    lineHeight: 20
  },
  botText: { 
    color: '#000', 
    fontSize: 15,
    lineHeight: 20
  },
  
  // Стили для товаров - ФИКСИРОВАННЫЕ РАЗМЕРЫ
  productsContainer: { 
    marginTop: 12 
  },
  productsScrollContent: {
    paddingRight: 16
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: 200
  },
  productImage: {
    width: 50,     // ЖЕСТКАЯ ШИРИНА
    height: 50,    // ЖЕСТКАЯ ВЫСОТА
    borderRadius: 8,
    backgroundColor: '#f5f5f5'
  },
  productInfo: {
    marginLeft: 10,
    flex: 1,
  },
  productName: {
    fontWeight: '600',
    fontSize: 13,
    color: '#333',
    marginBottom: 4
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  oldPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
    fontSize: 11
  },
  productPrice: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 13
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-start'
  },
  loadingText: {
    color: '#999',
    fontSize: 14
  },

  // Поле ввода
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 12 : 12
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  sendButton: {
    backgroundColor: '#000',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc'
  },
});

