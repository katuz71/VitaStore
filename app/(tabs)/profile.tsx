import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, SafeAreaView, Alert, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useOrders, OrderItem } from '../context/OrdersContext';
import { getImageUrl } from '../utils/image';
import { FloatingChatButton } from '@/components/FloatingChatButton';
import { loadCustomerData, saveCustomerData, clearCustomerData, CustomerData } from '../utils/customerData';

export default function ProfileScreen() {
  const router = useRouter();
  const { orders, removeOrder, clearOrders } = useOrders();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Customer data state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+380');
  const [customerCity, setCustomerCity] = useState('');
  const [customerWarehouse, setCustomerWarehouse] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Load customer data on mount
  useEffect(() => {
    const loadData = async () => {
      const data = await loadCustomerData();
      if (data) {
        setCustomerName(data.name || '');
        setCustomerPhone(data.phone || '+380');
        setCustomerCity(data.city || '');
        setCustomerWarehouse(data.warehouse || '');
      }
    };
    loadData();
  }, []);

  const formatPrice = (price: number) => {
    return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₴`;
  };

  const displayToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleSaveCustomerData = async () => {
    if (!customerName.trim()) {
      Alert.alert('Помилка', 'Введіть ім\'я');
      return;
    }
    if (customerPhone.length !== 13) {
      Alert.alert('Помилка', 'Введіть коректний номер телефону');
      return;
    }
    
    try {
      const data: CustomerData = {
        name: customerName.trim(),
        phone: customerPhone,
        city: customerCity.trim() || undefined,
        warehouse: customerWarehouse.trim() || undefined,
      };
      await saveCustomerData(data);
      setIsEditing(false);
      displayToast('Дані збережено');
    } catch (error) {
      console.error('Error saving customer data:', error);
      Alert.alert('Помилка', 'Не вдалося зберегти дані');
    }
  };

  const handleClearCustomerData = () => {
    Alert.alert(
      'Видалити дані?',
      'Всі збережені дані будуть видалені.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCustomerData();
              setCustomerName('');
              setCustomerPhone('+380');
              setCustomerCity('');
              setCustomerWarehouse('');
              setIsEditing(false);
              displayToast('Дані видалено');
            } catch (error) {
              console.error('Error clearing customer data:', error);
              Alert.alert('Помилка', 'Не вдалося видалити дані');
            }
          }
        }
      ]
    );
  };

  const handleCancelEdit = () => {
    // Reload saved data to restore original values
    loadCustomerData().then(data => {
      if (data) {
        setCustomerName(data.name || '');
        setCustomerPhone(data.phone || '+380');
        setCustomerCity(data.city || '');
        setCustomerWarehouse(data.warehouse || '');
      } else {
        setCustomerName('');
        setCustomerPhone('+380');
        setCustomerCity('');
        setCustomerWarehouse('');
      }
      setIsEditing(false);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Customer Data Section */}
          <View style={styles.customerSection}>
            <View style={styles.sectionHeader}>
              <TouchableOpacity 
                onPress={() => router.back()}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color="black" />
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Мої дані</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.customerCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Ім'я *</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={customerName}
                    onChangeText={setCustomerName}
                    placeholder="Введіть ваше ім'я"
                  />
                ) : (
                  <Text style={styles.inputValue}>{customerName || 'Не вказано'}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Телефон *</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder="+380"
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.inputValue}>{customerPhone || 'Не вказано'}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Місто</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={customerCity}
                    onChangeText={setCustomerCity}
                    placeholder="Введіть місто"
                  />
                ) : (
                  <Text style={styles.inputValue}>{customerCity || 'Не вказано'}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Відділення</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={customerWarehouse}
                    onChangeText={setCustomerWarehouse}
                    placeholder="Введіть відділення"
                  />
                ) : (
                  <Text style={styles.inputValue}>{customerWarehouse || 'Не вказано'}</Text>
                )}
              </View>

              {!isEditing ? (
                (customerName || customerPhone || customerCity || customerWarehouse) && (
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editButtonBottom}>
                      <Ionicons name="pencil-outline" size={18} color="#007AFF" />
                      <Text style={styles.editButtonTextBottom}>Редагувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClearCustomerData} style={styles.clearButton}>
                      <Ionicons name="trash-outline" size={18} color="#ff3b30" />
                      <Text style={styles.clearButtonText}>Видалити дані</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <View style={styles.editButtonsRow}>
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveCustomerData} style={styles.saveButton}>
                    <Text style={styles.saveButtonText}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Orders Section */}
          <View style={styles.ordersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Історія замовлень</Text>
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
                          displayToast('Історія замовлень очищена');
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

            {orders.length === 0 ? (
              <View style={styles.emptyView}>
                <Ionicons name="receipt-outline" size={60} color="#ccc" />
                <Text style={styles.emptyText}>Історія замовлень порожня</Text>
              </View>
            ) : (
              orders.map((item) => (
                <View key={String(item.id)} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderHeaderLeft}>
                      <Text style={styles.orderNumber}>
                        <Text>Замовлення №</Text>
                        <Text>{item.id}</Text>
                      </Text>
                      <Text style={styles.orderDate}>{item.date}</Text>
                      {item.name && (
                        <Text style={styles.orderClient}>
                          <Text>Клієнт: </Text>
                          <Text>{item.name}</Text>
                        </Text>
                      )}
                    </View>
                    <View style={styles.orderHeaderRight}>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>Нове</Text>
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
                                displayToast('Замовлення видалено');
                              }
                            }
                          ]);
                        }}
                        style={styles.deleteButton}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {item.city && (
                    <View style={styles.infoRow}>
                      <Ionicons name="location-outline" size={16} color="#666" />
                      <Text style={styles.infoText}>
                        <Text style={styles.infoLabel}>Місто: </Text>
                        <Text>{item.city}</Text>
                      </Text>
                    </View>
                  )}

                  {item.warehouse && (
                    <View style={styles.infoRow}>
                      <Ionicons name="cube-outline" size={16} color="#666" style={styles.infoIcon} />
                      <Text style={styles.infoText}>
                        <Text style={styles.infoLabel}>Відділення: </Text>
                        <Text>{item.warehouse}</Text>
                      </Text>
                    </View>
                  )}

                  {item.phone && (
                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={16} color="#666" />
                      <Text style={styles.infoText}>
                        <Text style={styles.infoLabel}>Телефон: </Text>
                        <Text>{item.phone}</Text>
                      </Text>
                    </View>
                  )}

                  <View style={styles.itemsContainer}>
                    {item.items.map((prod: OrderItem, index: number) => (
                      <View key={index} style={styles.itemRow}>
                        <Image 
                          source={{ uri: getImageUrl(prod.image) }} 
                          style={styles.itemImage} 
                        />
                        <View style={styles.itemDetails}>
                          <Text style={styles.itemName}>
                            {prod.name}
                            {prod.variant_info && (
                              <Text style={styles.itemVariant}> ({prod.variant_info})</Text>
                            )}
                          </Text>
                          <Text style={styles.itemInfo}>
                            <Text>Кількість: </Text>
                            <Text style={styles.itemInfoBold}>{prod.quantity || 1}</Text>
                            <Text> • </Text>
                            <Text style={styles.itemInfoBold}>{formatPrice((prod.price || 0) * (prod.quantity || 1))}</Text>
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={styles.orderTotal}>
                    <Text style={styles.totalLabel}>Разом до сплати:</Text>
                    <Text style={styles.totalAmount}>{formatPrice(item.total)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <FloatingChatButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  customerSection: {
    padding: 20,
    paddingTop: 60,
  },
  ordersSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  closeButton: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
  },
  editButtonText: {
    color: '#007AFF',
    fontSize: 16,
    marginLeft: 5,
  },
  editButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cancelButton: {
    padding: 8,
    paddingHorizontal: 15,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  customerCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  inputValue: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  editButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  editButtonTextBottom: {
    color: '#007AFF',
    fontSize: 14,
    marginLeft: 5,
    fontWeight: '500',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 10,
    backgroundColor: '#fff0f0',
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#ff3b30',
    fontSize: 14,
    marginLeft: 5,
    fontWeight: '500',
  },
  trashButton: {
    padding: 5,
  },
  emptyView: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 20,
    color: '#888',
    fontSize: 16,
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  orderHeaderLeft: {
    flex: 1,
  },
  orderNumber: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  orderDate: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  orderClient: {
    color: '#666',
    fontSize: 13,
    marginTop: 4,
  },
  orderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 10,
  },
  statusText: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: 12,
  },
  deleteButton: {
    padding: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    marginLeft: 5,
    color: '#555',
    fontSize: 13,
    flex: 1,
  },
  infoLabel: {
    fontWeight: '600',
  },
  itemsContainer: {
    marginBottom: 15,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  itemVariant: {
    color: '#666',
    fontWeight: '400',
  },
  itemInfo: {
    fontSize: 12,
    color: '#888',
  },
  itemInfoBold: {
    fontWeight: '600',
  },
  orderTotal: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#666',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  toastText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});
