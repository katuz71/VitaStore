import { FloatingChatButton } from '@/components/FloatingChatButton';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Image, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { logBeginCheckout } from '../../src/utils/analytics';
import { useCart } from '../context/CartContext';
import { getImageUrl } from '../utils/image';

export default function CartScreen() {
  const router = useRouter();
  const { items: cartItems, removeItem, clearCart, addOne, removeOne } = useCart();
  
  const formatPrice = (price: number) => {
    return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
  };

  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);

  const applyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'START') {
      setDiscount(0.1); // 10% скидка
    } else {
      setDiscount(0);
      Alert.alert('Помилка', 'Невірний промокод');
    }
  };

  const subtotal = cartItems.reduce((sum, item) => {
    return sum + (item.price * (item.quantity || 1));
  }, 0);

  const totalAmount = subtotal * (1 - discount);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={28} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Кошик</Text>
        <View style={styles.headerRight}>
          {cartItems.length > 0 && (
            <TouchableOpacity 
              onPress={() => {
                Alert.alert("Очистити кошик?", "Всі товари будуть видалені з кошика.", [
                  { text: "Скасувати", style: "cancel" },
                  { 
                    text: "Очистити", 
                    style: "destructive", 
                    onPress: () => {
                      clearCart();
                      Vibration.vibrate(100);
                    }
                  }
                ]);
              }}
              style={styles.trashButton}
            >
              <Ionicons name="trash-outline" size={24} color="#ff3b30" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={cartItems}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={cartItems.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="cart-outline" size={50} color="#ccc" />
            </View>
            <Text style={styles.emptyTitle}>Кошик порожній</Text>
            <Text style={styles.emptyText}>
              Ви ще нічого не додали. Загляньте в каталог, там багато цікавого!
            </Text>
            <TouchableOpacity 
              onPress={() => router.replace('/(tabs)/')}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>Перейти до каталогу</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const product = item;
          return (
            <View style={styles.itemContainer}>
              <TouchableOpacity
                onPress={() => router.push(`/product/${item.id}`)}
                style={styles.itemImageContainer}
              >
                <Image 
                  source={{ uri: getImageUrl(item.image || item.image_url || item.picture) }} 
                  style={styles.itemImage} 
                />
              </TouchableOpacity>
              
              <View style={styles.itemInfo}>
                <Text numberOfLines={1} style={styles.itemName}>
                  {item.name}
                  {(item as any).unit && (
                    <Text style={styles.itemUnit}> ({(item as any).unit || (item as any).packSize || 'шт'})</Text>
                  )}
                </Text>
                <Text style={styles.itemPrice}>{formatPrice(item.price * (item.quantity || 1))}</Text>
              </View>

              <View style={styles.itemControls}>
                <View style={styles.quantityControls}>
                  <TouchableOpacity 
                    onPress={() => {
                      const itemUnit = (item as any).variantSize || (item as any).unit || (item as any).packSize || 'шт';
                      removeOne(item.id, itemUnit);
                    }}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="remove" size={16} color="black" />
                  </TouchableOpacity>
                  
                  <Text style={styles.quantityText}>{item.quantity || 1}</Text>
                  
                  <TouchableOpacity 
                    onPress={() => {
                      const itemUnit = (item as any).variantSize || (item as any).unit || (item as any).packSize || 'шт';
                      addOne(item.id, itemUnit);
                    }}
                    style={styles.quantityButton}
                  >
                    <Ionicons name="add" size={16} color="black" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  onPress={() => {
                    Vibration.vibrate(100);
                    const itemPackSize = (item as any).packSize || (item as any).size || '30';
                    const compositeId = `${item.id}-${String(itemPackSize)}`;
                    removeItem(compositeId);
                  }}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={18} color="#999" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {cartItems.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.promoContainer}>
            <TextInput
              placeholder="Промокод (напр. START)"
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              style={styles.promoInput}
            />
            <TouchableOpacity onPress={applyPromo} style={styles.promoButton}>
              <Text style={styles.promoButtonText}>Застосувати</Text>
            </TouchableOpacity>
          </View>

          {discount > 0 && (
            <Text style={styles.discountText}>Знижка {discount * 100}% застосована! 🎉</Text>
          )}

          <Text style={styles.totalText}>
            <Text>Разом: </Text>
            <Text>{formatPrice(totalAmount)}</Text>
          </Text>

          <TouchableOpacity
            disabled={cartItems.length === 0}
            onPress={async () => {
              // Отправка события начала оформления заказа в аналитику
              const productsForAnalytics = cartItems.map(item => ({
                ...item,
                title: item.name,
                price: item.price
              }));
              
              try {
                await logBeginCheckout(productsForAnalytics, totalAmount);
              } catch (error) {
                console.error('Error logging begin checkout:', error);
              }
              
              router.push('/checkout');
            }}
            style={[
              styles.checkoutButton,
              cartItems.length === 0 && styles.checkoutButtonDisabled
            ]}
          >
            <Text style={styles.checkoutButtonText}>Оформити замовлення</Text>
          </TouchableOpacity>
        </View>
      )}

      <FloatingChatButton bottomOffset={30} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeButton: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  trashButton: {
    padding: 5,
  },
  emptyContainer: {
    flexGrow: 1,
    padding: 20,
  },
  emptyView: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
    width: '70%',
  },
  emptyButton: {
    backgroundColor: 'black',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 15,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listContent: {
    padding: 20,
  },
  itemContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 10,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  itemImageContainer: {
    marginRight: 15,
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 0,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemUnit: {
    fontWeight: 'normal',
    color: '#666',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 5,
  },
  itemControls: {
    alignItems: 'flex-end',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 2,
    marginBottom: 8,
  },
  quantityButton: {
    padding: 6,
  },
  quantityText: {
    marginHorizontal: 8,
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteButton: {
    padding: 5,
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 5,
  },
  footer: {
    padding: 20,
    paddingBottom: 100,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  promoContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    marginTop: 10,
  },
  promoInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 10,
    marginRight: 10,
    fontSize: 14,
  },
  promoButton: {
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  promoButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  discountText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  totalText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#000',
  },
  checkoutButton: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutButtonDisabled: {
    backgroundColor: '#ccc',
  },
  checkoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

