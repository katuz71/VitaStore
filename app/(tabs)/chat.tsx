import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, Image, StyleSheet, ActivityIndicator, SafeAreaView, Vibration
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../config/api';
import { getImageUrl } from '../utils/image';

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
  // Initial welcome message constant
  const INITIAL_WELCOME_MESSAGE: Message = {
    id: '1',
    text: 'Привіт! Я експерт із сили природи. Допоможу підібрати гриби, вітаміни чи трави для твого здоров\'я. Що шукаємо? 🌿🍄',
    sender: 'bot'
  };

  const [messages, setMessages] = useState<Message[]>([INITIAL_WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  // Clear chat function
  const clearChat = async () => {
    try {
      // Clear AsyncStorage if it exists (for future persistence)
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.removeItem('chat_messages').catch(() => {});
    } catch (e) {
      // AsyncStorage might not be installed, ignore
    }
    
    // Reset messages to initial welcome message
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setInputText('');
    Vibration.vibrate(50);
  };

  // Автоскролл вниз при новом сообщении
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = inputText.trim();
    const userMsg: Message = { 
      id: Date.now(), 
      text: userMessage, 
      sender: 'user' 
    };
    
    // Добавляем сообщение пользователя
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      // Формируем историю для отправки (адаптировано под текущий API)
      const history = messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      history.push({ role: 'user', content: userMessage });

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const botMsg: Message = {
        id: Date.now() + 1,
        text: data.text || data.response || 'На жаль, я не зрозумів...',
        sender: 'bot',
        products: data.products || []
      };
      
      setMessages(prev => [...prev, botMsg]);
      Vibration.vibrate(50);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        text: 'Помилка з\'єднання 😔', 
        sender: 'bot' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginVertical: 5 }}>
        {/* Пузырь сообщения */}
        <View style={[
          styles.bubble, 
          isUser ? styles.userBubble : styles.botBubble
        ]}>
          <Text style={isUser ? styles.userText : styles.botText}>{item.text}</Text>
        </View>

        {/* Карточки товаров (если есть) */}
        {!isUser && item.products && item.products.length > 0 && (
          <View style={{ marginTop: 5, width: '85%' }}>
            {item.products.map((prod) => (
              <TouchableOpacity 
                key={prod.id} 
                activeOpacity={0.7}
                onPress={() => router.push(`/product/${prod.id}`)}
                style={styles.productCard}
              >
                <Image 
                  source={{ uri: getImageUrl(prod.image || prod.image_url || prod.picture) }} 
                  style={styles.productImage}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <Text style={styles.productName} numberOfLines={2}>{prod.name}</Text>
                  <View style={styles.priceContainer}>
                    {prod.old_price && prod.old_price > prod.price && (
                      <Text style={styles.oldPrice}>{formatPrice(prod.old_price)}</Text>
                    )}
                    <Text style={styles.productPrice}>{formatPrice(prod.price)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9f9f9' }}>
      {/* Header with Clear Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.closeButton}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Чат з експертом</Text>
        <TouchableOpacity 
          onPress={clearChat}
          style={styles.clearButton}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => `msg-${item.id}`}
          contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
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
            onPress={sendMessage} 
            disabled={loading || !inputText.trim()}
            style={[
              styles.sendButton, 
              { backgroundColor: (loading || !inputText.trim()) ? '#ccc' : '#000' }
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#000',
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  userText: { 
    color: '#fff', 
    fontSize: 16 
  },
  botText: { 
    color: '#333', 
    fontSize: 16 
  },
  
  // Styles for Product Card
  productCard: {
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
  },
  productImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  productName: {
    fontWeight: '600',
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  oldPrice: {
    textDecorationLine: 'line-through',
    color: '#999',
    fontSize: 12
  },
  productPrice: {
    color: '#2ecc71',
    fontWeight: 'bold',
    fontSize: 14,
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
  
  // Styles for Input
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
    minHeight: 45,
    maxHeight: 100,
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 20,
    paddingTop: 50,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    width: 40,
    alignItems: 'flex-start',
  },
  clearButton: {
    padding: 8,
    borderRadius: 8,
    width: 40,
    alignItems: 'flex-end',
  },
});
