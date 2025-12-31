import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrdersContext';

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { products, fetchProducts } = useOrders();

  // Ищем товар
  const product = products.find(p => p.id === Number(id));

  // --- ДАННЫЕ ДЛЯ ЭКРАНА ---
  const [selectedPack, setSelectedPack] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'desc' | 'comp' | 'usage'>('desc');
  const [quantity, setQuantity] = useState(1);
  const { addToCart, addItem } = useCart();
  const safeAddToCart = addToCart || addItem;

  // Парсим фасовку, когда товар появляется
  const packSizes = product?.pack_sizes 
    ? product.pack_sizes.map((s: string) => s.trim()) 
    : [];

  useEffect(() => {
    if (packSizes.length > 0) setSelectedPack(packSizes[0]);
  }, [product]);

  // --- ДИАГНОСТИКА (ВЫВОДИМ ДАННЫЕ В КОНСОЛЬ И НА ЭКРАН) ---
  const debugInfo = product ? {
      name: product.name,
      packs: product.pack_sizes,
      comp: product.composition,
      usage: product.usage
  } : "Товар не найден (product is undefined)";
  // ---------------------------------------------------------

  const handleAddToCart = () => {
    if (!product) return;
    const finalPack = selectedPack || (product.weight ? product.weight : 'Std');
    if (safeAddToCart) {
        safeAddToCart(product, quantity, finalPack);
        Alert.alert("ОК", "Добавлено");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* === КРАСНАЯ ЗОНА ОТЛАДКИ === */}
        <View style={{ backgroundColor: '#FFECEC', padding: 10, borderBottomWidth: 2, borderColor: 'red' }}>
            <Text style={{ fontWeight: 'bold', color: 'red', marginBottom: 5 }}>🔧 СИСТЕМНАЯ ИНФОРМАЦИЯ:</Text>
            <Text style={{ fontFamily: 'monospace', fontSize: 10 }}>
              <Text>ID Товара: </Text>
              <Text>{id}</Text>
            </Text>
            <Text style={{ fontFamily: 'monospace', fontSize: 10 }}>
              <Text>Всего товаров загружено: </Text>
              <Text>{products.length}</Text>
            </Text>
            <Text style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 5 }}>ДАННЫЕ ТОВАРА:</Text>
            <Text style={{ fontFamily: 'monospace', fontSize: 10 }}>{JSON.stringify(debugInfo, null, 2)}</Text>
            
            <TouchableOpacity onPress={fetchProducts} style={{ backgroundColor: 'red', padding: 8, marginTop: 10, borderRadius: 5 }}>
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>🔄 ОБНОВИТЬ ДАННЫЕ С СЕРВЕРА</Text>
            </TouchableOpacity>
        </View>
        {/* ============================ */}

        {product ? (
            <>
                <Image source={{ uri: product.image }} style={styles.image} resizeMode="cover" />
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}><Ionicons name="close" size={24} color="black" /></TouchableOpacity>

                <View style={styles.content}>
                    <Text style={styles.title}>{product.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 }}>
                        {product.old_price && product.old_price > product.price && (
                            <Text style={{ textDecorationLine: 'line-through', color: 'gray', fontSize: 18 }}>
                                <Text>{product.old_price} </Text>
                                <Text>₴</Text>
                            </Text>
                        )}
                        <Text style={styles.price}>
                          <Text>{product.price} </Text>
                          <Text>₴</Text>
                        </Text>
                    </View>

                    {/* Фасовка */}
                    {packSizes.length > 0 ? (
                        <View style={{marginBottom: 20}}>
                            <Text style={styles.sectionTitle}>
                              <Text>Фасування (</Text>
                              <Text>{product.unit || 'шт'}</Text>
                              <Text>)</Text>
                            </Text>
                            <View style={styles.packRow}>
                                {packSizes.map((size: string) => (
                                    <TouchableOpacity key={size} style={[styles.packBtn, selectedPack === size && styles.packBtnActive]} onPress={() => setSelectedPack(size)}>
                                        <Text style={[styles.packText, selectedPack === size && styles.packTextActive]}>{size}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ) : <Text style={{color:'gray', marginBottom:10}}>Фасовки нет</Text>}

                    {/* Вкладки */}
                    <View style={styles.tabHeader}>
                        {['desc', 'comp', 'usage'].map(tab => (
                            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab as any)} style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
                                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                    {tab === 'desc' ? 'Опис' : tab === 'comp' ? 'Склад' : 'Прийом'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.tabBody}>
                        {activeTab === 'desc' && <Text style={styles.description}>{product.description || '-'}</Text>}
                        {activeTab === 'comp' && <Text style={styles.description}>{product.composition || '-'}</Text>}
                        {activeTab === 'usage' && <Text style={styles.description}>{product.usage || '-'}</Text>}
                    </View>
                </View>
            </>
        ) : (
            <View style={{padding: 20}}><Text>Товар не найден...</Text></View>
        )}
      </ScrollView>

      {/* Футер */}
      {product && (
        <View style={styles.bottomBar}>
            <Text style={{fontSize: 20, fontWeight:'bold'}}>
              <Text>{quantity} </Text>
              <Text>{product.unit || 'шт'}</Text>
            </Text>
            <TouchableOpacity style={styles.buyButton} onPress={handleAddToCart}>
                <Text style={styles.buyButtonText}>
                  <Text>В корзину • </Text>
                  <Text>
                    <Text>{product.price * quantity} </Text>
                    <Text>₴</Text>
                  </Text>
                </Text>
            </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  image: { width: '100%', height: 300, backgroundColor: '#eee' },
  backBtn: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, backgroundColor: 'white', borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  price: { fontSize: 22, fontWeight: 'bold', color: '#333', marginVertical: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  packRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  packBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  packBtnActive: { backgroundColor: 'black', borderColor: 'black' },
  packText: { color: 'black' },
  packTextActive: { color: 'white' },
  tabHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', marginBottom: 15 },
  tabItem: { flex: 1, padding: 10, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderColor: 'black' },
  tabText: { color: 'gray' },
  tabTextActive: { color: 'black', fontWeight: 'bold' },
  tabBody: { minHeight: 50 },
  description: { lineHeight: 22, color: '#444' },
  bottomBar: { position: 'absolute', bottom: 0, width: '100%', padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  buyButton: { backgroundColor: 'black', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10 },
  buyButtonText: { color: 'white', fontWeight: 'bold' }
});
