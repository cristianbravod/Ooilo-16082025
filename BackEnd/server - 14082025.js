// server.js - Restaurant Backend ACTUALIZADO con flujo completo de pedidos - CORREGIDO
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const QRCode = require('qrcode');
const uploadRoutes = require('./src/routes/upload');
const mesasRoutes = require('./src/routes/mesas');
const platosEspecialesRoutes = require('./src/routes/platos-especiales');
const OrderController = require('./src/controllers/OrderController'); // ✅ IMPORTAR CONTROLLER
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURACION DEL RESTAURANTE
// ==========================================
const RESTAURANT_CONFIG = {
  name: "Ooilo Taqueria",
  description: "Cocina autentica con los mejores ingredientes",
  phone: "+56912345678",
  hours: "Vier: 17:00 - 20:00, Sab-Dom: 13:00 - 20:00",
  address: "Antonio Moreno 0526, Temuco, Chile"
};

// ==========================================
// CONFIGURACION CORS PARA APLICACIONES MOVILES
// ==========================================
const corsOptions = {
  origin: function (origin, callback) {
    console.log('Origin:', origin);
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:19000',
      'http://192.1.1.16:3000',
      'http://192.1.1.16:19000',
      'exp://192.1.1.16:19000',
    ];
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400
};

// ✅ DEFINIR mobileMiddleware ANTES DE USARLO - CORREGIDO
const mobileMiddleware = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  console.log(`🌐 ${req.method} ${req.path} - Origin: ${req.get('Origin') || 'mobile-app'}`);
  
  if (req.method === 'OPTIONS') {
    console.log('✅ Preflight OPTIONS manejado correctamente');
    return res.status(200).end();
  }
  
  next();
};

// ==========================================
// MIDDLEWARE PRINCIPAL (ORDEN CORRECTO)
// ==========================================
app.use(cors(corsOptions));
app.use(mobileMiddleware);

// ✅ MIDDLEWARE DE DEBUG PARA PAYLOAD SIZE (ANTES DE BODY PARSER)
app.use('/api/platos-especiales', (req, res, next) => {
  console.log(`🔍 PAYLOAD SIZE DEBUG - Platos Especiales:`);
  console.log(`📊 Content-Length: ${req.headers['content-length'] || 'N/A'}`);
  console.log(`📦 Content-Type: ${req.headers['content-type'] || 'N/A'}`);
  
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length']);
    console.log(`📏 Payload size: ${contentLength} bytes (${Math.round(contentLength / 1024)} KB)`);
    if (contentLength > 100000) {  // >100KB
      console.log(`⚠️ LARGE PAYLOAD DETECTED: ${contentLength} bytes`);
    }
    if (contentLength > 50 * 1024 * 1024) { // >50MB
      console.log(`🚨 PAYLOAD EXCEEDS LIMIT: ${contentLength} bytes > 50MB`);
    }
  }
  
  next();
});

// ✅ CONFIGURACIÓN UNIFICADA DE BODY PARSER - LÍMITES AUMENTADOS A 50MB
app.use(express.json({ 
  limit: '50mb',          // Aumentar de 10mb a 50mb
  parameterLimit: 50000,  // Aumentar límite de parámetros
  type: ['application/json', 'text/plain']
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',          // Aumentar de 10mb a 50mb
  parameterLimit: 50000   // Aumentar límite de parámetros
}));

// ✅ ARCHIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ==========================================
// CONFIGURACION BASE DE DATOS
// ==========================================
const pool = new Pool({
  user: process.env.DB_USER || 'postgres.ugcrigkvfejqlsoqnxxh',
  host: process.env.DB_HOST || 'aws-0-us-east-2.pooler.supabase.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543,
  ssl: { rejectUnauthorized: false },
  max: 10,
  min: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
  statement_timeout: 15000,
  query_timeout: 15000,
  idle_in_transaction_session_timeout: 15000
});

// Test de conexión BD
async function testDB() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Error BD:', error.message);
    return false;
  }
}

// ==========================================
// MIDDLEWARE DE AUTENTICACION
// ==========================================
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin required' });
  }
  next();
};

// ==========================================
// REGISTRAR RUTAS
// ==========================================
app.use('/api/mesas', mesasRoutes);
app.use('/api/platos-especiales', platosEspecialesRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu', 'index.html'));
});

// ==========================================
// ENDPOINTS DE DIAGNOSTICO
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.json({ 
      status: 'OK',
      database: 'connected',
      timestamp: new Date().toISOString(),
      server: '192.1.1.16:3000',
      mobile_ready: true,
      orders_system: 'ACTIVE',
      uploads: {
        endpoint: '/api/upload',
        maxSize: '50MB',  // ✅ Actualizado
        formats: ['image/jpeg', 'image/png', 'image/webp'],
        staticPath: '/uploads'
      },
      middleware: {
        json_parser: 'OK - 50MB limit',  // ✅ Actualizado
        cors: 'OK',
        static_files: 'OK'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR',
      database: 'disconnected',
      error: error.message
    });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({
    status: 'PONG',
    timestamp: new Date().toISOString(),
    server: '192.1.1.16:3000'
  });
});

app.get('/api/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS funcionando',
    origin: req.get('Origin') || 'mobile-app',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/test-body', (req, res) => {
  console.log('🧪 TEST ENDPOINT - Body debugging:');
  console.log('📋 req.body:', req.body);
  console.log('📊 typeof req.body:', typeof req.body);
  console.log('📤 Content-Type:', req.headers['content-type']);
  
  const bodySize = JSON.stringify(req.body).length;
  console.log(`📏 Body size: ${bodySize} bytes (${Math.round(bodySize / 1024)} KB)`);
  
  res.json({
    success: true,
    received: {
      body: req.body,
      bodyType: typeof req.body,
      contentType: req.headers['content-type'],
      bodyExists: !!req.body,
      bodyIsObject: typeof req.body === 'object',
      bodySize: bodySize,
      bodySizeKB: Math.round(bodySize / 1024),
      timestamp: new Date().toISOString()
    }
  });
});

// ==========================================
// AUTENTICACION
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password } = req.body;
    console.log('🔐 Intento login:', email);
    
    const result = await client.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log('❌ Password incorrecto para:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Login exitoso:', email, 'Rol:', user.rol);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('❌ Error login:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const result = await client.query('DELETE FROM menu_items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ success: true, message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      nombre: req.user.nombre,
      rol: req.user.rol
    }
  });
});

// ==========================================
// CATEGORIAS
// ==========================================
app.get('/api/categorias', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
    console.log(`📂 ${result.rows.length} categorías`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error categorías:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

// ==========================================
// MENU
// ==========================================
app.post('/api/menu', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('Request body:', req.body);
    const { nombre, precio, categoria_id, descripcion, disponible, vegetariano, picante, imagen } = req.body;
    const result = await client.query(
      'INSERT INTO menu_items (nombre, precio, categoria_id, descripcion, disponible, vegetariano, picante, imagen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [nombre, precio, categoria_id, descripcion, disponible, vegetariano, picante, imagen]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.put('/api/menu/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, precio, categoria_id, descripcion, disponible, vegetariano, picante, imagen, imagen_url } = req.body;
    const finalImageUrl = imagen_url || imagen;
    const result = await client.query(
      'UPDATE menu_items SET nombre = $1, precio = $2, categoria_id = $3, descripcion = $4, disponible = $5, vegetariano = $6, picante = $7, imagen = $8, fecha_modificacion = NOW() WHERE id = $9 RETURNING *',
      [nombre, precio, categoria_id, descripcion, disponible, vegetariano, picante, finalImageUrl, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/menu', async (req, res) => {
  const client = await pool.connect();
  try {
    const { categoria_id, disponible } = req.query;
    
    let query = `
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE c.activo = true
    `;
    const params = [];

    if (categoria_id) {
      query += ` AND m.categoria_id = $1`;
      params.push(categoria_id);
    }

    if (disponible !== undefined) {
      const paramNum = params.length + 1;
      query += ` AND m.disponible = $${paramNum}`;
      params.push(disponible === 'true');
    }

    query += ' ORDER BY c.nombre, m.nombre';

    const result = await client.query(query, params);
    console.log(`🍽️ ${result.rows.length} productos en menú`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error menú:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  } finally {
    client.release();
  }
});

app.get('/api/menu/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🔄 Sync menú solicitado');
    
    const result = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true AND c.activo = true
      ORDER BY c.nombre, m.nombre
    `);
    
    console.log(`✅ Sync menú: ${result.rows.length} productos`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error sync menú:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  } finally {
    client.release();
  }
});

app.get('/api/sync', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🔄 Sync completo solicitado');
    
    const [menuResult, categoriasResult, especialesResult] = await Promise.all([
      client.query(`
        SELECT m.*, c.nombre as categoria_nombre 
        FROM menu_items m 
        JOIN categorias c ON m.categoria_id = c.id 
        WHERE c.activo = true ORDER BY c.nombre, m.nombre
      `),
      client.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre'),
      client.query(`
        SELECT * FROM platos_especiales 
        WHERE disponible = true
        AND vigente = true	
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
        ORDER BY created_at DESC
      `)
    ]);
    
    const response = {
      menu: menuResult.rows,
      categorias: categoriasResult.rows,
      especiales: especialesResult.rows,
      offline: false,
      timestamp: new Date().toISOString(),
      server: '192.1.1.16:3000'
    };
    
    console.log(`✅ Sync completo: ${menuResult.rows.length} menú, ${categoriasResult.rows.length} categorías, ${especialesResult.rows.length} especiales`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error sync completo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sync', 
      offline: true
    });
  } finally {
    client.release();
  }
});

// ==========================================
// ✅ ENDPOINTS DE ÓRDENES - FLUJO COMPLETO
// ==========================================

// 1. CREAR ORDEN RÁPIDA (Para app móvil - sin auth)
app.post('/api/ordenes/quick', async (req, res) => {
  console.log('🍽️ Endpoint: POST /api/ordenes/quick');
  console.log('📋 Body:', req.body);
  await OrderController.createQuickOrder(req, res);
});

// 2. OBTENER ÓRDENES ACTIVAS PARA COCINA (FIFO - orden de llegada)
app.get('/api/ordenes/activas', async (req, res) => {
  console.log('👨‍🍳 Endpoint: GET /api/ordenes/activas');
  await OrderController.getActiveOrders(req, res);
});

// 3. OBTENER ÓRDENES POR MESA
app.get('/api/ordenes/mesa/:mesa', async (req, res) => {
  console.log(`🪑 Endpoint: GET /api/ordenes/mesa/${req.params.mesa}`);
  await OrderController.getOrdersByTable(req, res);
});

// 4. ACTUALIZAR ESTADO DE ORDEN COMPLETA (cocina marca orden lista)
app.patch('/api/ordenes/:id/estado', async (req, res) => {
  console.log(`🔄 Endpoint: PATCH /api/ordenes/${req.params.id}/estado`);
  console.log('📋 Body:', req.body);
  await OrderController.updateOrderStatus(req, res);
});

// 5. ACTUALIZAR ESTADO DE ITEM INDIVIDUAL (cocina marca plato listo)
app.patch('/api/ordenes/:ordenId/items/:itemId/estado', async (req, res) => {
  console.log(`✅ Endpoint: PATCH /api/ordenes/${req.params.ordenId}/items/${req.params.itemId}/estado`);
  console.log('📋 Body:', req.body);
  await OrderController.updateItemStatus(req, res);
});

// 6. AGREGAR ITEMS A ORDEN EXISTENTE (pedidos adicionales)
app.post('/api/ordenes/:id/items', async (req, res) => {
  console.log(`➕ Endpoint: POST /api/ordenes/${req.params.id}/items`);
  console.log('📋 Body:', req.body);
  await OrderController.addItemsToOrder(req, res);
});

// 7. CERRAR MESA (cerrar cuenta final)
app.post('/api/ordenes/mesa/:mesa/cerrar', async (req, res) => {
  console.log(`🔒 Endpoint: POST /api/ordenes/mesa/${req.params.mesa}/cerrar`);
  console.log('📋 Body:', req.body);
  await OrderController.closeTable(req, res);
});

// 8. ENDPOINTS ADICIONALES

// Crear orden normal (con auth)
app.post('/api/ordenes', authMiddleware, async (req, res) => {
  console.log('📝 Endpoint: POST /api/ordenes (con auth)');
  await OrderController.createOrder(req, res);
});

// Obtener todas las órdenes (Admin)
app.get('/api/ordenes', authMiddleware, adminMiddleware, async (req, res) => {
  console.log('📊 Endpoint: GET /api/ordenes (admin)');
  await OrderController.getAllOrders(req, res);
});

// Obtener orden por ID
app.get('/api/ordenes/:id', async (req, res) => {
  console.log(`🔍 Endpoint: GET /api/ordenes/${req.params.id}`);
  await OrderController.getOrderById(req, res);
});

// Estadísticas de órdenes
app.get('/api/ordenes/stats/resumen', authMiddleware, adminMiddleware, async (req, res) => {
  console.log('📊 Endpoint: GET /api/ordenes/stats/resumen');
  await OrderController.getOrderStats(req, res);
});

// Obtener mis órdenes (requiere auth)
app.get('/api/ordenes/usuario/mis-ordenes', authMiddleware, async (req, res) => {
  console.log('👤 Endpoint: GET /api/ordenes/usuario/mis-ordenes');
  await OrderController.getMyOrders(req, res);
});

// ==========================================
// ENDPOINT DE TESTING PARA ÓRDENES
// ==========================================
app.get('/api/ordenes/test/crear-ejemplo', async (req, res) => {
  try {
    console.log('🧪 Creando orden de ejemplo para testing...');
    
    // Crear orden de ejemplo
    const ordenEjemplo = {
      mesa: `Mesa ${Math.floor(Math.random() * 8) + 1}`,
      items: [
        {
          menu_item_id: 1,
          cantidad: 2,
          precio: 8500,
          nombre: 'Hamburguesa Clásica',
          observaciones: 'Sin cebolla'
        },
        {
          menu_item_id: 2,
          cantidad: 1,
          precio: 3500,
          nombre: 'Papas Fritas',
          observaciones: 'Extra salsa'
        }
      ],
      total: 20500,
      cliente: 'Cliente de prueba',
      observaciones: 'Orden de prueba generada automáticamente'
    };
    
    // Simular request
    req.body = ordenEjemplo;
    await OrderController.createQuickOrder(req, res);
    
  } catch (error) {
    console.error('❌ Error creando orden de ejemplo:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creando orden de ejemplo',
      error: error.message 
    });
  }
});

// ==========================================
// ✅ ENDPOINT PARA PANTALLA DE COCINA (WEB)
// ==========================================
app.get('/api/cocina/ordenes', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('👨‍🍳 Obteniendo órdenes para pantalla de cocina...');
    
    const query = `
      SELECT 
        o.id,
        o.mesa,
        o.fecha_creacion,
        o.estado as estado_orden,
        o.notas,
        EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 as minutos_espera,
        
        -- Items de la orden
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', oi.id,
            'nombre', m.nombre,
            'cantidad', oi.cantidad,
            'instrucciones', oi.instrucciones_especiales,
            'estado', oi.estado
          ) ORDER BY oi.id
        ) as items,
        
        COUNT(oi.id) as total_items,
        
        -- Prioridad calculada
        CASE 
          WHEN EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 > 30 THEN 'ALTA'
          WHEN EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 > 15 THEN 'MEDIA'
          ELSE 'NORMAL'
        END as prioridad
        
      FROM ordenes o
      JOIN orden_items oi ON o.id = oi.orden_id
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE o.estado IN ('pendiente', 'confirmada', 'preparando')
      GROUP BY o.id, o.mesa, o.fecha_creacion, o.estado, o.notas
      ORDER BY o.fecha_creacion ASC -- FIFO: First In, First Out
    `;
    
    const result = await client.query(query);
    
    console.log(`👨‍🍳 ${result.rows.length} órdenes en cocina`);
    
    res.json({
      success: true,
      ordenes: result.rows,
      timestamp: new Date().toISOString(),
      total_ordenes: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo órdenes para cocina:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo órdenes para cocina',
      error: error.message
    });
  } finally {
    client.release();
  }
});

// ==========================================
// ENDPOINTS DE QR Y MENU PUBLICO
// ==========================================
app.get('/api/qr/menu-publico', async (req, res) => {
  const client = await pool.connect();
  try {
    const menuResult = await client.query(`
      SELECT m.*, c.nombre as categoria_nombre 
      FROM menu_items m 
      JOIN categorias c ON m.categoria_id = c.id 
      WHERE m.disponible = true AND c.activo = true
      ORDER BY c.nombre, m.nombre
    `);
    
    const especialesResult = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE disponible = true 
        AND vigente = true
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      restaurant: RESTAURANT_CONFIG,
      menu: menuResult.rows,
      especiales: especialesResult.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error menú público:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  } finally {
    client.release();
  }
});

// ==========================================
// MIDDLEWARE DE ERROR MEJORADO - ANTES DE INICIALIZACIÓN
// ==========================================
app.use((error, req, res, next) => {
  console.error('🔥 Error interceptado:', error.message);
  console.error('🔍 Error type:', error.name);
  console.error('📊 Error code:', error.code);
  
  // Errores específicos de tamaño de payload
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
    console.log('🚨 PAYLOAD TOO LARGE ERROR DETECTED');
    return res.status(413).json({
      success: false,
      message: 'Archivo o datos demasiado grandes',
      error: 'PAYLOAD_TOO_LARGE',
      details: {
        limit: error.limit || '50MB',
        received: error.length || 'Unknown',
        expected: error.expected || 'Unknown'
      }
    });
  }
  
  // Error de formulario multipart
  if (error.message === 'Unexpected end of form') {
    console.log('🚨 FORM ERROR DETECTED - Unexpected end of form');
    return res.status(400).json({
      success: false,
      message: 'Error procesando formulario - datos incompletos',
      error: 'FORM_ERROR',
      details: 'El formulario se cortó durante la transmisión. Posible problema de límite de tamaño.'
    });
  }
  
  // Otros errores de multer
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Demasiados archivos (máximo 1)',
      error: 'TOO_MANY_FILES'
    });
  }
  
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      success: false,
      message: 'Tipo de archivo no permitido. Solo imágenes.',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Error de JSON malformado
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Datos JSON malformados',
      error: 'JSON_PARSE_ERROR'
    });
  }
  
  // Error genérico
  console.error('💥 Error no manejado específicamente:', error.stack);
  next(error);
});

// ==========================================
// INICIALIZACION Y ARRANQUE DEL SERVIDOR
// ==========================================
testDB().then(connected => {
  if (connected) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Servidor Restaurant Backend iniciado');
      console.log(`🔌 Puerto: ${PORT}`);
      console.log(`🏪 Restaurante: ${RESTAURANT_CONFIG.name}`);
      console.log(`🌐 URLs disponibles:`);
      console.log(`   - Local: http://localhost:${PORT}`);
      console.log(`   - Red:   http://192.1.1.16:${PORT}`);
      console.log(`   - Móvil: http://192.1.1.16:${PORT}/api/health`);
      console.log('📱 CORS configurado para aplicaciones móviles');
      console.log('📝 Middleware JSON configurado CORRECTAMENTE con límite 50MB');
      console.log('🍽️ Sistema de órdenes COMPLETAMENTE ACTIVO');
      console.log('👨‍🍳 Pantalla de cocina disponible en /api/cocina/ordenes');
      console.log('🎯 Flujo completo de pedidos implementado');
      console.log('✅ Listo para recibir peticiones de la app');
    });
  } else {
    console.error('❌ No se pudo conectar a la base de datos. Servidor no iniciado.');
    process.exit(1);
  }
});

// ==========================================
// ERROR HANDLERS GLOBALES
// ==========================================
app.use('*', (req, res) => {
  console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    message: `Route ${req.originalUrl} not found`,
    server: '192.1.1.16:3000',
    availableRoutes: [
      // Diagnóstico
      'GET /api/health',
      'GET /api/ping',
      'GET /api/test-cors',
      'POST /api/test-body',
      
      // Autenticación
      'POST /api/auth/login',
      'POST /api/auth/verify',
      
      // Categorías y Menú
      'GET /api/categorias',
      'GET /api/menu',
      'GET /api/menu/sync',
      'GET /api/sync',
      
      // ✅ ÓRDENES - FLUJO COMPLETO
      'POST /api/ordenes/quick',                        // 1. Crear pedido desde app
      'GET /api/ordenes/activas',                       // 2. Ver pedidos en cocina
      'GET /api/cocina/ordenes',                        // 3. Pantalla web para cocina
      'PATCH /api/ordenes/:ordenId/items/:itemId/estado', // 4. Marcar plato listo
      'PATCH /api/ordenes/:id/estado',                  // 5. Cambiar estado orden
      'POST /api/ordenes/:id/items',                    // 6. Agregar items adicionales
      'GET /api/ordenes/mesa/:mesa',                    // 7. Ver pedidos por mesa
      'POST /api/ordenes/mesa/:mesa/cerrar',            // 8. Cerrar mesa/cuenta
      
      // Otros endpoints de órdenes
      'POST /api/ordenes',                              // Crear orden con auth
      'GET /api/ordenes',                               // Todas las órdenes (admin)
      'GET /api/ordenes/:id',                           // Orden específica
      'GET /api/ordenes/stats/resumen',                 // Estadísticas
      'GET /api/ordenes/usuario/mis-ordenes',           // Mis órdenes
      'GET /api/ordenes/test/crear-ejemplo',            // Testing
      
      // Platos especiales
      'GET /api/platos-especiales',
      'POST /api/platos-especiales',
      'PUT /api/platos-especiales/:id',
      'PATCH /api/platos-especiales/:id/disponibilidad',
      'DELETE /api/platos-especiales/:id',
      
      // Mesas
      'GET /api/mesas',
      'POST /api/mesas',
      'PUT /api/mesas/:id',
      'PATCH /api/mesas/:id/estado',
      
      // QR y Menú Público
      'GET /api/qr/menu-publico',
      
      // Upload de imágenes
      'GET /api/upload/list',
      'POST /api/upload/image', 
      'POST /api/upload/base64',
      'GET /api/upload/info/:fileName',
      'DELETE /api/upload/:fileName',
      'GET /api/upload/health'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('💥 Error del servidor no manejado:', err);
  res.status(500).json({ 
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Manejo de señales para cierre limpio
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});

module.exports = app;