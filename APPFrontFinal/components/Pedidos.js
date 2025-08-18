// FrontEnd/components/Pedidos.js - VERSIÓN FINAL CON TODAS LAS CORRECCIONES
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
  ActivityIndicator, RefreshControl, Image, TextInput, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import ApiService from '../services/ApiService';
import { useAuth } from '../contexts/AuthContext';

export default function Pedidos() {
  const { user } = useAuth();
  const isInitialMount = useRef(true);
  
  const [menu, setMenu] = useState([]);
  const [platosEspeciales, setPlatosEspeciales] = useState([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [mesasDisponibles, setMesasDisponibles] = useState([]);
  
  const [mesaActual, setMesaActual] = useState(null);
  const [pedidosMesas, setPedidosMesas] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  
  const [refreshing, setRefreshing] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [mostrarSelectorMesa, setMostrarSelectorMesa] = useState(false);

  const cargarDatosIniciales = useCallback(async () => {
    setRefreshing(true);
    try {
      const [mesas, categorias, menuCompleto] = await Promise.all([
        ApiService.getMesas(),
        ApiService.getCategorias(),
        ApiService.getMenu(),
      ]);
      
      setMesasDisponibles(mesas.filter(m => m.activa !== false && m.estado !== 'fuera_servicio'));
      setCategoriasDisponibles(categorias);
      
      setMenu(menuCompleto.filter(item => !item.es_especial));
      setPlatosEspeciales(menuCompleto.filter(item => item.es_especial));

    } catch (error) {
      console.error('❌ Error en carga inicial:', error);
      Alert.alert('Error', 'Hubo un problema cargando los datos iniciales.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cargarPedidosGuardados = async () => {
      try {
        const jsonValue = await AsyncStorage.getItem('@pedidosMesas');
        if (jsonValue != null) {
          setPedidosMesas(JSON.parse(jsonValue));
          console.log('✅ Pedidos recuperados de AsyncStorage');
        }
      } catch (e) {
        console.error('❌ Error al cargar pedidos desde AsyncStorage', e);
      }
    };
    cargarPedidosGuardados();
  }, []);

  useEffect(() => {
    cargarDatosIniciales();
  }, [cargarDatosIniciales]);

  // Guardar pedidos en AsyncStorage cuando cambian
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      const guardarPedidos = async () => {
        try {
          const jsonValue = JSON.stringify(pedidosMesas);
          await AsyncStorage.setItem('@pedidosMesas', jsonValue);
        } catch (e) {
          console.error('❌ Error guardando pedidos en AsyncStorage:', e);
        }
      };
      guardarPedidos();
    }
  }, [pedidosMesas]);

  const formatearPrecio = useCallback((precio) => {
    const numPrecio = typeof precio === 'string' ? parseFloat(precio) : precio;
    if (isNaN(numPrecio)) return '$0';
    return `$${numPrecio.toLocaleString('es-CL')}`;
  }, []);

  const getPedidoMesaActual = useCallback(() => {
    if (!mesaActual) return { productos: [], total: 0 };
    const pedidoGuardado = pedidosMesas[mesaActual.id] || { productos: [] };
    const todosProductos = [...(pedidoGuardado.productos || []), ...productosTemporales];
    const total = todosProductos.reduce((sum, item) => {
        const precio = typeof item.precio === 'string' ? parseFloat(item.precio) : item.precio;
        return sum + (precio * item.cantidad);
    }, 0);
    return { ...pedidoGuardado, productos: todosProductos, total };
  }, [mesaActual, pedidosMesas, productosTemporales]);

  const agregarProducto = useCallback((item, esEspecial) => {
    if (!mesaActual) {
      Alert.alert('Atención', 'Por favor, selecciona una mesa antes de agregar productos.');
      return;
    }
    setProductosTemporales(prev => {
      const existente = prev.find(p => p.id === item.id && p.es_especial === esEspecial);
      if (existente) {
        return prev.map(p => p.id === item.id && p.es_especial === esEspecial ? { ...p, cantidad: p.cantidad + 1 } : p);
      }
      return [...prev, { ...item, cantidad: 1, es_especial: esEspecial }];
    });
  }, [mesaActual]);
  
  const eliminarDelPedido = (itemId, esEspecial) => {
    const filterFn = p => !(p.id === itemId && p.es_especial === esEspecial);
    setProductosTemporales(prev => prev.filter(filterFn));
    if (pedidosMesas[mesaActual?.id]) {
      setPedidosMesas(prev => ({
        ...prev,
        [mesaActual.id]: { ...prev[mesaActual.id], productos: prev[mesaActual.id].productos.filter(filterFn) }
      }));
    }
  };

  const cambiarCantidadPedido = useCallback((itemId, esEspecial, nuevaCantidad) => {
    if (nuevaCantidad < 1) {
      eliminarDelPedido(itemId, esEspecial);
      return;
    }
    const updateList = list => list.map(p => (p.id === itemId && p.es_especial === esEspecial) ? { ...p, cantidad: nuevaCantidad } : p);

    if (productosTemporales.some(p => p.id === itemId && p.es_especial === esEspecial)) {
        setProductosTemporales(updateList);
    } else if (pedidosMesas[mesaActual?.id]?.productos.some(p => p.id === itemId && p.es_especial === esEspecial)) {
        setPedidosMesas(prev => ({
            ...prev,
            [mesaActual.id]: { ...prev[mesaActual.id], productos: updateList(prev[mesaActual.id].productos) }
        }));
    }
  }, [mesaActual, productosTemporales, pedidosMesas, eliminarDelPedido]);

  const enviarPedidoACocina = useCallback(async () => {
    if (productosTemporales.length === 0) return Alert.alert('Info', 'No hay productos nuevos para enviar a cocina.');
    if (!mesaActual) return;
    
    setEnviandoPedido(true);
    try {
      const pedidoParaEnviar = {
        mesa: mesaActual.nombre,
        items: productosTemporales.map(p => ({ ...p, menu_item_id: p.id, precio: parseFloat(p.precio) })),
        total: productosTemporales.reduce((sum, item) => sum + (parseFloat(item.precio) * item.cantidad), 0),
        cliente: `Mesa ${mesaActual.nombre}`,
        observaciones: `Pedido por ${user?.nombre || 'sistema'}`
      };
      
      await ApiService.createQuickOrder(pedidoParaEnviar);
      
      setPedidosMesas(prev => {
        const pedidoAnterior = prev[mesaActual.id] || { productos: [] };
        return {
          ...prev,
          [mesaActual.id]: {
            ...pedidoAnterior,
            productos: [...pedidoAnterior.productos, ...productosTemporales],
            estado: 'enviado',
          }
        };
      });
      setProductosTemporales([]);
      Alert.alert('Éxito', `Nuevos productos enviados a cocina para ${mesaActual.nombre}.`);
    } catch (error) {
      console.error('❌ Error enviando pedido adicional:', error);
      Alert.alert('Error', `No se pudo enviar el pedido a cocina. ${error.message}`);
    } finally {
      setEnviandoPedido(false);
    }
  }, [productosTemporales, mesaActual, user]);
  
  const cerrarMesa = useCallback(() => {
    if (!mesaActual) return;
    const pedidoMesa = getPedidoMesaActual();
    if (pedidoMesa.productos.length === 0) return Alert.alert('Info', 'No hay nada que cobrar en esta mesa.');

    Alert.alert(
      'Confirmar Cierre',
      `¿Deseas cerrar la mesa ${mesaActual.nombre} con un total de ${formatearPrecio(pedidoMesa.total)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Mesa', style: 'destructive', onPress: () => {
            setPedidosMesas(prev => {
                const newPedidos = { ...prev };
                delete newPedidos[mesaActual.id];
                return newPedidos;
            });
            setProductosTemporales([]);
            setMesaActual(null);
            Alert.alert('Mesa Cerrada', `${mesaActual.nombre} ha sido cerrada.`);
        }}
      ]
    );
  }, [mesaActual, getPedidoMesaActual, formatearPrecio, pedidosMesas]);

  const { menuFiltrado, especialesFiltrados } = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    const filtrar = (lista) => lista.filter(p => p.nombre.toLowerCase().includes(searchLower));
    
    const menuFiltrado = {};
    const menuNormal = menu.filter(p => p && p.nombre);

    if (searchQuery) {
        menuFiltrado['Resultados de la Búsqueda'] = filtrar(menuNormal);
    } else {
        categoriasDisponibles.forEach(cat => {
            if (cat && cat.nombre) {
                menuFiltrado[cat.nombre] = menuNormal.filter(p => p.categoria_id === cat.id && p.disponible !== false);
            }
        });
    }
    const especialesFiltrados = filtrar(platosEspeciales.filter(p => p && p.nombre && p.disponible !== false));
    return { menuFiltrado, especialesFiltrados };
  }, [searchQuery, menu, platosEspeciales, categoriasDisponibles]); // ✅ CORREGIDO: Usar platosEspeciales en lugar de platosEspecialesLocal
  
  const pedidoActual = getPedidoMesaActual();
  const productosEnviadosIds = new Set((pedidosMesas[mesaActual?.id]?.productos || []).map(p => `${p.id}-${p.es_especial}`));

  const renderProductGrid = (productos, esEspecial = false) => {
    if (!productos || productos.length === 0) return null;
    const filas = [];
    for (let i = 0; i < productos.length; i += 2) {
      filas.push(productos.slice(i, i + 2));
    }
    return filas.map((fila, filaIndex) => (
      <View key={filaIndex} style={styles.gridRow}>
        {fila.map((item) => (
          <TouchableOpacity key={`${item.id}-${esEspecial}`} style={styles.productCard} onPress={() => agregarProducto(item, esEspecial)}>
            <Image source={{ uri: item.imagen_url || item.imagen }} style={styles.productImage} />
            <Text style={styles.productName} numberOfLines={2}>{item.nombre}</Text>
            <Text style={styles.productPrice}>{formatearPrecio(item.precio)}</Text>
          </TouchableOpacity>
        ))}
        {fila.length % 2 !== 0 && <View style={styles.productCardPlaceholder} />}
      </View>
    ));
  };

  const renderPedidoYResumen = () => {
    if (!mesaActual || pedidoActual.productos.length === 0) return null;

    return (
        <View style={styles.resumenCard}>
            <Text style={styles.pedidoMesaTitulo}>Pedido de {mesaActual.nombre}</Text>
            {pedidoActual.productos.map(item => {
                const esTemporal = productosTemporales.some(p => p.id === item.id && p.es_especial === item.es_especial);
                const haSidoEnviado = !esTemporal;
                return (
                    <View key={`${item.id}-${item.es_especial}`} style={styles.pedidoItem}>
                        <Text style={[styles.pedidoNombre, haSidoEnviado && styles.itemEnviado]} numberOfLines={1}>
                            {haSidoEnviado && "🧾 "}{item.nombre}
                        </Text>
                        <View style={styles.pedidoControles}>
                            <TouchableOpacity onPress={() => cambiarCantidadPedido(item.id, item.es_especial, item.cantidad - 1)}><Ionicons name="remove-circle-outline" size={28} color="#FF9800" /></TouchableOpacity>
                            <Text style={styles.cantidadText}>{item.cantidad}</Text>
                            <TouchableOpacity onPress={() => cambiarCantidadPedido(item.id, item.es_especial, item.cantidad + 1)}><Ionicons name="add-circle" size={28} color="#4CAF50" /></TouchableOpacity>
                            <TouchableOpacity onPress={() => eliminarDelPedido(item.id, item.es_especial)} style={{marginLeft: 10}}><Ionicons name="trash-bin" size={24} color="#f44336" /></TouchableOpacity>
                        </View>
                    </View>
                );
            })}
            <View style={styles.resumenTotal}>
              <Text style={styles.totalText}>Total: {formatearPrecio(pedidoActual.total)}</Text>
            </View>
            <TouchableOpacity style={[styles.actionButton, styles.enviarButton, productosTemporales.length === 0 && styles.buttonDisabled]} onPress={enviarPedidoACocina} disabled={enviandoPedido || productosTemporales.length === 0}>
              {enviandoPedido ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Enviar a Cocina ({productosTemporales.length})</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.cerrarButton]} onPress={cerrarMesa}>
                <Text style={styles.actionButtonText}>Cerrar Mesa</Text>
            </TouchableOpacity>
          </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mesaSelector}>
        <Text style={styles.label}>Mesa:</Text>
        <TouchableOpacity style={styles.mesaPicker} onPress={() => setMostrarSelectorMesa(true)}>
          <Text style={styles.mesaTexto}>{mesaActual ? mesaActual.nombre : 'Seleccionar mesa'}</Text>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput style={styles.searchInput} placeholder="Buscar producto..." value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <ScrollView style={styles.scrollView} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={cargarDatosIniciales} />}>
        {especialesFiltrados.length > 0 && (
          <View style={styles.categoriaSeccion}>
            <Text style={styles.categoriaTitulo}>🌟 Especiales</Text>
            {renderProductGrid(especialesFiltrados, true)}
          </View>
        )}
        
        {Object.entries(menuFiltrado).map(([categoria, productos]) => (
          productos.length > 0 && (
            <View key={categoria} style={styles.categoriaSeccion}>
              <Text style={styles.categoriaTitulo}>{categoria}</Text>
              {renderProductGrid(productos, false)}
            </View>
          )
        ))}
        
        {renderPedidoYResumen()}
      </ScrollView>

      <Modal visible={mostrarSelectorMesa} animationType="slide" transparent={true} onRequestClose={() => setMostrarSelectorMesa(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleccionar Mesa</Text>
            <ScrollView>
              {mesasDisponibles.map(mesa => (
                <TouchableOpacity key={mesa.id} style={styles.mesaItem} onPress={() => { setMesaActual(mesa); setProductosTemporales([]); setMostrarSelectorMesa(false); }}>
                  <Text style={styles.mesaNombre}>{mesa.nombre}</Text>
                  <Ionicons name={mesa.estado === 'disponible' ? "checkmark-circle" : "time-outline"} size={24} color={mesa.estado === 'disponible' ? "#4CAF50" : "#FF9800"} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    mesaSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderBottomWidth: 1, borderColor: '#e0e0e0' },
    label: { fontSize: 16, fontWeight: '600', marginRight: 12 },
    mesaPicker: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
    mesaTexto: { fontSize: 16 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 8, marginHorizontal: 16, marginTop: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0e0e0' },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8 },
    scrollView: { flex: 1 },
    categoriaSeccion: { marginTop: 20 },
    categoriaTitulo: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, paddingHorizontal: 16 },
    gridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    productCard: { width: '48%', backgroundColor: 'white', borderRadius: 12, padding: 12, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: {width: 0, height: 2} },
    productCardPlaceholder: { width: '48%' },
    productImage: { width: '100%', height: 100, borderRadius: 8, marginBottom: 8 },
    productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', minHeight: 34 },
    productPrice: { fontSize: 16, fontWeight: 'bold', color: '#d32f2f', marginTop: 4 },
    resumenCard: { backgroundColor: 'white', borderRadius: 12, margin: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#e0e0e0' },
    pedidoMesaTitulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    pedidoItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' },
    pedidoNombre: { fontSize: 16, flex: 1 },
    itemEnviado: { color: '#777', fontStyle: 'italic' },
    pedidoControles: { flexDirection: 'row', alignItems: 'center' },
    cantidadText: { fontSize: 18, fontWeight: 'bold', marginHorizontal: 12 },
    resumenTotal: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#f0f0f0', alignItems: 'flex-end' },
    totalText: { fontSize: 18, fontWeight: 'bold' },
    actionButton: { marginTop: 10, padding: 14, borderRadius: 8, alignItems: 'center' },
    enviarButton: { backgroundColor: '#4CAF50' },
    cerrarButton: { backgroundColor: '#d32f2f' },
    buttonDisabled: { backgroundColor: '#a5d6a7' },
    actionButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
    mesaItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f0f0f0' },
});