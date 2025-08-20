// backend/src/controllers/OrderController.js - VERSIÓN CORREGIDA Y COMPLETA
const { Pool } = require('pg');
const config = require('../config/database');
const pool = new Pool(config);

class OrderController {

  async createOrder(req, res) {
    console.log('Redirigiendo a createQuickOrder...');
    this.createQuickOrder(req, res);
  }

  // ==========================================
  // 1. CREAR ORDEN RÁPIDA (SIN AUTH)
  // ==========================================
  async createQuickOrder(req, res) {
    const client = await pool.connect();
    try {
      console.log('🍽️ Creando orden rápida...');
      console.log('📋 Datos recibidos:', req.body);

      await client.query('BEGIN');

      const { mesa, items, cliente, observaciones, notas, total } = req.body;

      // Validaciones básicas
      if (!mesa || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Mesa e items son requeridos'
        });
      }

      // Calcular total si no viene calculado
      let totalCalculado = total || 0;

      if (!total) {
        for (const item of items) {
          // Si viene precio en el item, usarlo; si no, buscarlo en BD
          if (item.precio) {
            totalCalculado += (item.precio * item.cantidad);
          } else {
            const menuResult = await client.query(
              'SELECT precio FROM menu_items WHERE id = $1',
              [item.menu_item_id]
            );
            if (menuResult.rows.length > 0) {
              totalCalculado += (menuResult.rows[0].precio * item.cantidad);
            }
          }
        }
      }

      // Crear la orden principal
      const orderResult = await client.query(`
        INSERT INTO ordenes (
          usuario_id, mesa, total, estado, metodo_pago, notas
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          1, // usuario por defecto para órdenes rápidas
          mesa,
          totalCalculado,
          'pendiente',
          'efectivo', // método por defecto
          observaciones || notas || ''
        ]
      );

      const order = orderResult.rows[0];
      console.log('✅ Orden creada:', order.id);

      // Insertar items de la orden
      for (const item of items) {
        console.log('DEBUG: Procesando item:', JSON.stringify(item, null, 2));
        let precioUnitario = item.precio;

        // Si no viene precio, buscarlo en BD
        if (!precioUnitario) {
          const menuResult = await client.query(
            'SELECT precio FROM menu_items WHERE id = $1',
            [item.menu_item_id]
          );

          if (menuResult.rows.length > 0) {
            precioUnitario = menuResult.rows[0].precio;
          } else {
            // Buscar en platos especiales si no está en menú regular
            const especialResult = await client.query(
              'SELECT precio FROM platos_especiales WHERE id = $1',
              [item.menu_item_id]
            );

            if (especialResult.rows.length > 0) {
              precioUnitario = especialResult.rows[0].precio;
            } else {
              precioUnitario = 0;
            }
          }
        }

        const esEspecial = item.esEspecial || item.es_especial;
        const query = esEspecial
          ? `INSERT INTO orden_items (orden_id, plato_especial_id, cantidad, precio_unitario, instrucciones_especiales, estado_item, fecha_creacion) VALUES ($1, $2, $3, $4, $5, $6, NOW())`
          : `INSERT INTO orden_items (orden_id, menu_item_id, cantidad, precio_unitario, instrucciones_especiales, estado_item, fecha_creacion) VALUES ($1, $2, $3, $4, $5, $6, NOW())`;

        const params = [
          order.id,
          esEspecial ? item.id : item.menu_item_id || item.id,
          item.cantidad,
          precioUnitario,
          item.observaciones || item.instrucciones || '',
          'pendiente'
        ];

        await client.query(query, params);
      }

      await client.query('COMMIT');

      console.log('✅ Orden creada exitosamente:', order.id);

      // Respuesta exitosa
      res.status(201).json({
        success: true,
        message: 'Pedido creado exitosamente',
        orden: {
          ...order,
          total: parseFloat(order.total)
        },
        resumen: {
          numero_orden: order.id,
          mesa: order.mesa,
          total: parseFloat(totalCalculado),
          cantidad_items: items.length,
          estado: order.estado,
          fecha_creacion: order.fecha_creacion
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error creando orden rápida:', error);
      res.status(500).json({
        success: false,
        message: 'Error creando orden',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 2. OBTENER ÓRDENES ACTIVAS PARA COCINA
  // ==========================================
  async getActiveOrders(req, res) {
    const client = await pool.connect();
    try {
      console.log('👨‍🍳 Obteniendo órdenes activas para cocina...');

      const result = await client.query(`
        SELECT
          o.id,
          o.mesa,
          o.total,
          o.estado,
          o.notas as observaciones,
          o.fecha_creacion,
          o.fecha_modificacion,
          -- Información de items
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'nombre', COALESCE(m.nombre, pe.nombre, 'Item desconocido'),
              'cantidad', oi.cantidad,
              'precio_unitario', oi.precio_unitario,
              'subtotal', (oi.cantidad * oi.precio_unitario),
              'instrucciones_especiales', oi.instrucciones_especiales,
              'observaciones', oi.instrucciones_especiales,
              'estado', COALESCE(oi.estado_item, 'pendiente'),
              'categoria', COALESCE(c1.nombre, c2.nombre, 'General')
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL) AS items,
          -- Tiempo de espera
          EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 as minutos_espera,
          -- Prioridad basada en tiempo
          CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 > 30 THEN 'ALTA'
            WHEN EXTRACT(EPOCH FROM (NOW() - o.fecha_creacion))/60 > 15 THEN 'MEDIA'
            ELSE 'NORMAL'
          END as prioridad
        FROM ordenes o
        LEFT JOIN orden_items oi ON o.id = oi.orden_id
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
        LEFT JOIN categorias c1 ON m.categoria_id = c1.id
        LEFT JOIN categorias c2 ON pe.categoria_id = c2.id
        WHERE o.estado IN ('pendiente', 'confirmada', 'preparando', 'lista')
        GROUP BY o.id
        ORDER BY o.fecha_creacion ASC  -- FIFO: Primero en entrar, primero en salir
      `);

      const ordenes = result.rows.map(orden => ({
        ...orden,
        total: parseFloat(orden.total),
        minutos_espera: Math.floor(orden.minutos_espera),
        prioridad: orden.prioridad || 'NORMAL',
        items: orden.items || [],
        mesa_numero: orden.mesa?.toString() || 'Sin mesa'
      }));

      console.log(`✅ Órdenes activas obtenidas: ${ordenes.length}`);

      res.json({
        success: true,
        data: ordenes,
        ordenes: ordenes, // compatibilidad
        count: ordenes.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error obteniendo órdenes activas:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo órdenes activas',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 3. OBTENER ÓRDENES POR MESA
  // ==========================================
  async getOrdersByTable(req, res) {
    const client = await pool.connect();
    try {
      const { mesa } = req.params;
      console.log(`🪑 Obteniendo órdenes para mesa: ${mesa}`);

      const result = await client.query(`
        SELECT
          o.*,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'nombre', COALESCE(m.nombre, pe.nombre, 'Item desconocido'),
              'cantidad', oi.cantidad,
              'precio_unitario', oi.precio_unitario,
              'subtotal', (oi.cantidad * oi.precio_unitario),
              'instrucciones', oi.instrucciones_especiales,
              'estado', COALESCE(oi.estado_item, 'pendiente')
            )
          ) FILTER (WHERE oi.id IS NOT NULL) AS items
        FROM ordenes o
        LEFT JOIN orden_items oi ON o.id = oi.orden_id
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN platos_especiales pe ON oi.menu_item_id = pe.id
        WHERE o.mesa = $1
        AND o.estado NOT IN ('entregada', 'cancelada')
        GROUP BY o.id
        ORDER BY o.fecha_creacion DESC
      `, [mesa]);

      const ordenes = result.rows.map(orden => ({
        ...orden,
        total: parseFloat(orden.total),
        items: orden.items || []
      }));

      console.log(`✅ Órdenes de mesa obtenidas: ${ordenes.length}`);

      res.json({
        success: true,
        data: ordenes,
        ordenes: ordenes, // compatibilidad
        mesa: mesa,
        count: ordenes.length
      });

    } catch (error) {
      console.error('❌ Error obteniendo órdenes por mesa:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo órdenes por mesa',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 4. ACTUALIZAR ESTADO DE ORDEN COMPLETA
  // ==========================================
  async updateOrderStatus(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { estado } = req.body;

      console.log(`🔄 Actualizando estado de orden ${id} a: ${estado}`);

      if (!estado) {
        return res.status(400).json({
          success: false,
          message: 'El estado es requerido'
        });
      }

      // Validar estados permitidos
      const estadosValidos = [
        'pendiente', 'confirmada', 'preparando',
        'lista', 'entregada', 'cancelada'
      ];

      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Estados permitidos: ${estadosValidos.join(', ')}`
        });
      }

      // Actualizar la orden principal
      await client.query(`
        UPDATE ordenes
        SET estado = $1, fecha_modificacion = NOW()
        WHERE id = $2
      `, [estado, id]);

      // Si se marca como 'preparando' o 'lista', actualizar todos los items
      if (estado === 'preparando' || estado === 'lista') {
        const newItemStatus = estado === 'lista' ? 'lista' : 'preparando';
        await client.query(`
          UPDATE orden_items
          SET estado_item = $1
          WHERE orden_id = $2
        `, [newItemStatus, id]);
        console.log(` cascading update for order ${id} to item status ${newItemStatus}`);
      }

      console.log(`✅ Estado de orden actualizado: ${id} -> ${estado}`);

      // Después de todas las actualizaciones, obtener el estado final de la orden con sus items
      const finalOrderResult = await client.query(`
        SELECT
          o.id,
          o.mesa,
          o.total,
          o.estado,
          o.notas as observaciones,
          o.fecha_creacion,
          o.fecha_modificacion,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'nombre', COALESCE(m.nombre, pe.nombre, 'Item desconocido'),
              'cantidad', oi.cantidad,
              'precio_unitario', oi.precio_unitario,
              'estado', COALESCE(oi.estado_item, 'pendiente')
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL) AS items
        FROM ordenes o
        LEFT JOIN orden_items oi ON o.id = o.orden_id
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
        WHERE o.id = $1
        GROUP BY o.id
      `, [id]);

      if (finalOrderResult.rows.length === 0) {
        // This should not happen as we just updated it, but as a safeguard
        return res.status(404).json({ success: false, message: 'Orden no encontrada después de la actualización.' });
      }

      const finalOrder = {
        ...finalOrderResult.rows[0],
        total: parseFloat(finalOrderResult.rows[0].total),
        items: finalOrderResult.rows[0].items || []
      };

      res.json({
        success: true,
        message: `Orden actualizada a estado: ${estado}`,
        data: finalOrder
      });

    } catch (error) {
      console.error('❌ Error actualizando estado de orden:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando estado de orden',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 5. ACTUALIZAR ESTADO DE ITEM INDIVIDUAL
  // ==========================================
  async updateItemStatus(req, res) {
    const client = await pool.connect();
    try {
      const { ordenId, itemId } = req.params;
      let { estado } = req.body;

      if (estado === 'listo') {
        estado = 'lista';
      }

      console.log(`✅ Actualizando item ${itemId} de orden ${ordenId} a estado: ${estado}`);

      if (!estado) {
        return res.status(400).json({
          success: false,
          message: 'El estado es requerido'
        });
      }

      // Actualizar estado del item
      const result = await client.query(`
        UPDATE orden_items
        SET estado_item = $1
        WHERE id = $2 AND orden_id = $3
        RETURNING *
      `, [estado, itemId, ordenId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Item no encontrado'
        });
      }

      // Verificar si todos los items están listos para actualizar la orden
      const checkResult = await client.query(`
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN estado_item = 'lista' THEN 1 END) as listos
        FROM orden_items
        WHERE orden_id = $1
      `, [ordenId]);

      const { total, listos } = checkResult.rows[0];
      console.log(`DEBUG: Total items: ${total}, Items listos: ${listos}`);

      // Si todos los items están listos, actualizar la orden
      if (parseInt(total) === parseInt(listos)) {
        await client.query(`
          UPDATE ordenes
          SET estado = 'lista', fecha_modificacion = NOW()
          WHERE id = $1
        `, [ordenId]);

        console.log(`🎯 Orden ${ordenId} marcada como LISTA (todos los items completados)`);
      }

      console.log(`✅ Estado de item actualizado: ${itemId} -> ${estado}`);

      res.json({
        success: true,
        message: `Item actualizado a estado: ${estado}`,
        data: result.rows[0],
        orden_completada: parseInt(total) === parseInt(listos)
      });

    } catch (error) {
      console.error('❌ Error actualizando estado de item:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando estado de item',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 6. AGREGAR ITEMS A ORDEN EXISTENTE
  // ==========================================
  async addItemsToOrder(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { items } = req.body;

      console.log(`➕ Agregando items a orden ${id}:`, items);

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items son requeridos'
        });
      }

      await client.query('BEGIN');

      // Verificar que la orden existe
      const ordenResult = await client.query(
        'SELECT * FROM ordenes WHERE id = $1', [id]
      );

      if (ordenResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Orden no encontrada'
        });
      }

      let totalAdicionado = 0;

      // Agregar cada item
      for (const item of items) {
        let precioUnitario = item.precio;

        // Si no viene precio, buscarlo en BD
        if (!precioUnitario) {
          const menuResult = await client.query(
            'SELECT precio FROM menu_items WHERE id = $1',
            [item.menu_item_id]
          );

          if (menuResult.rows.length > 0) {
            precioUnitario = menuResult.rows[0].precio;
          } else {
            // Buscar en platos especiales
            const especialResult = await client.query(
              'SELECT precio FROM platos_especiales WHERE id = $1',
              [item.menu_item_id]
            );

            if (especialResult.rows.length > 0) {
              precioUnitario = especialResult.rows[0].precio;
            } else {
              precioUnitario = 0;
            }
          }
        }

        await client.query(`
          INSERT INTO orden_items (
            orden_id, menu_item_id, cantidad, precio_unitario,
            instrucciones_especiales, estado_item, fecha_creacion
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            id,
            item.menu_item_id,
            item.cantidad,
            precioUnitario,
            item.observaciones || item.instrucciones || '',
            'pendiente'
          ]
        );

        totalAdicionado += (precioUnitario * item.cantidad);
      }

      // Actualizar total de la orden
      await client.query(`
        UPDATE ordenes
        SET total = total + $1, fecha_modificacion = NOW()
        WHERE id = $2
      `, [totalAdicionado, id]);

      await client.query('COMMIT');

      console.log(`✅ Items agregados exitosamente a orden ${id}, total adicional: $${totalAdicionado}`);

      res.json({
        success: true,
        message: 'Items agregados exitosamente',
        items_agregados: items.length,
        total_adicional: totalAdicionado
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error agregando items a orden:', error);
      res.status(500).json({
        success: false,
        message: 'Error agregando items a orden',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // 7. CERRAR MESA
  // ==========================================
  async closeTable(req, res) {
    const client = await pool.connect();
    try {
      const { mesa } = req.params;
      const { metodo_pago, propina, descuento } = req.body;

      console.log(`🔒 Cerrando mesa: ${mesa}`);

      await client.query('BEGIN');

      // Obtener todas las órdenes activas de la mesa
      const ordenesResult = await client.query(`
        SELECT id, total
        FROM ordenes
        WHERE mesa = $1 AND estado NOT IN ('entregada', 'cancelada')
      `, [mesa]);

      if (ordenesResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No hay órdenes activas para esta mesa'
        });
      }

      // Calcular total final
      const totalBase = ordenesResult.rows.reduce((sum, orden) => sum + parseFloat(orden.total), 0);
      const propinaCalculada = propina || 0;
      const descuentoCalculado = descuento || 0;
      const totalFinal = totalBase + propinaCalculada - descuentoCalculado;

      // Marcar todas las órdenes como entregadas
      const ordenIds = ordenesResult.rows.map(o => o.id);

      for (const ordenId of ordenIds) {
        await client.query(`
          UPDATE ordenes
          SET estado = 'entregada',
              metodo_pago = $1,
              fecha_modificacion = NOW()
          WHERE id = $2
        `, [metodo_pago || 'efectivo', ordenId]);

        // Marcar todos los items como entregados
        await client.query(`
          UPDATE orden_items
          SET estado_item = 'entregado', fecha_modificacion = NOW()
          WHERE orden_id = $1
        `, [ordenId]);
      }

      await client.query('COMMIT');

      console.log(`✅ Mesa ${mesa} cerrada exitosamente`);

      res.json({
        success: true,
        message: 'Mesa cerrada exitosamente',
        resumen: {
          mesa: mesa,
          ordenes_cerradas: ordenIds.length,
          total_base: totalBase,
          propina: propinaCalculada,
          descuento: descuentoCalculado,
          total_final: totalFinal,
          metodo_pago: metodo_pago || 'efectivo'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error cerrando mesa:', error);
      res.status(500).json({
        success: false,
        message: 'Error cerrando mesa',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  // ==========================================
  // MÉTODOS ADICIONALES
  // ==========================================

  async getAllOrders(req, res) {
    const client = await pool.connect();
    try {
      console.log('📊 Obteniendo todas las órdenes...');

      const { limit = 50, offset = 0, estado, mesa } = req.query;

      let whereClause = '';
      let params = [];
      let paramCount = 1;

      if (estado) {
        whereClause += ` WHERE o.estado = $${paramCount}`;
        params.push(estado);
        paramCount++;
      }

      if (mesa) {
        whereClause += estado ? ' AND' : ' WHERE';
        whereClause += ` o.mesa = $${paramCount}`;
        params.push(mesa);
        paramCount++;
      }

      params.push(parseInt(limit), parseInt(offset));

      const result = await client.query(`
        SELECT
          o.*,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'nombre', COALESCE(m.nombre, pe.nombre, 'Item desconocido'),
              'cantidad', oi.cantidad,
              'precio_unitario', oi.precio_unitario,
              'estado', COALESCE(oi.estado_item, 'pendiente')
            )
          ) FILTER (WHERE oi.id IS NOT NULL) AS items
        FROM ordenes o
        LEFT JOIN orden_items oi ON o.id = oi.orden_id
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN platos_especiales pe ON oi.plato_especial_id = pe.id
        ${whereClause}
        GROUP BY o.id
        ORDER BY o.fecha_creacion DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `, params);

      const ordenes = result.rows.map(orden => ({
        ...orden,
        total: parseFloat(orden.total),
        items: orden.items || []
      }));

      res.json({
        success: true,
        data: ordenes,
        count: ordenes.length,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      console.error('❌ Error obteniendo todas las órdenes:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo órdenes',
        error: error.message
      });
    } finally {
      client.release();
    }
  }

  async getOrderById(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      console.log(`🔍 Obteniendo orden por ID: ${id}`);

      const result = await client.query(`
        SELECT
          o.*,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'nombre', COALESCE(m.nombre, pe.nombre, 'Item desconocido'),
              'cantidad', oi.cantidad,
              'precio_unitario', oi.precio_unitario,
              'subtotal', (oi.cantidad * oi.precio_unitario),
              'instrucciones', oi.instrucciones_especiales,
              'estado', COALESCE(oi.estado_item, 'pendiente')
            )
          ) FILTER (WHERE oi.id IS NOT NULL) AS items
        FROM ordenes o
        LEFT JOIN orden_items oi ON o.id = oi.orden_id
        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
        LEFT JOIN platos_especiales pe ON oi.menu_item_id = pe.id
        WHERE o.id = $1
        GROUP BY o.id
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Orden no encontrada'
        });
      }

      const orden = {
        ...result.rows[0],
        total: parseFloat(result.rows[0].total),
        items: result.rows[0].items || []
      };

      res.json({
        success: true,
        data: orden
      });

    } catch (error) {
      console.error('❌ Error obteniendo orden por ID:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo orden',
        error: error.message
      });
    } finally {
      client.release();
    }
  }
}

module.exports = new OrderController();
