// BackEnd/src/controllers/ReportController.js - VERSIÓN CON FILTRO DE FECHA
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

class ReportController {
  
  // 📈 Dashboard estadísticas con filtro de fecha
  async getDashboardStats(req, res) {
    const client = await pool.connect();
    try {
      const { fecha_inicio, fecha_fin } = req.query;

      // Si no se proveen fechas, se usa el día de hoy por defecto.
      const f_start = fecha_inicio || new Date().toISOString().split('T')[0];
      const f_end = fecha_fin || f_start; // Si solo hay fecha_inicio, el rango es de un solo día.

      console.log(`📊 Generando estadísticas para el período: ${f_start} a ${f_end}`);

      // Se crea una lista de consultas para ejecutar en paralelo.
      // Cada objeto tiene el texto de la consulta y sus parámetros específicos.
      const queries = [
        {
          key: 'ordenes',
          text: `SELECT COUNT(*) as count FROM ordenes WHERE DATE(fecha_creacion) BETWEEN $1 AND $2`,
          values: [f_start, f_end]
        },
        {
          key: 'ingresos',
          text: `SELECT COALESCE(SUM(total), 0) as sum FROM ordenes WHERE estado = 'entregada' AND DATE(fecha_creacion) BETWEEN $1 AND $2`,
          values: [f_start, f_end]
        },
        {
          key: 'promedio_orden',
          text: `SELECT AVG(total) as avg FROM ordenes WHERE estado = 'entregada' AND DATE(fecha_creacion) BETWEEN $1 AND $2`,
          values: [f_start, f_end]
        },
        {
          key: 'producto_mas_vendido',
          text: `SELECT m.nombre, SUM(oi.cantidad) as cantidad FROM orden_items oi JOIN menu_items m ON oi.menu_item_id = m.id JOIN ordenes o ON oi.orden_id = o.id WHERE o.estado = 'entregada' AND DATE(o.fecha_creacion) BETWEEN $1 AND $2 GROUP BY m.id, m.nombre ORDER BY cantidad DESC LIMIT 1`,
          values: [f_start, f_end]
        },
        // Estas consultas no dependen de la fecha
        {
          key: 'ordenes_pendientes',
          text: `SELECT COUNT(*) as count FROM ordenes WHERE estado IN ('pendiente', 'confirmada', 'preparando')`,
          values: []
        },
        {
          key: 'items_activos',
          text: `SELECT COUNT(*) as count FROM menu_items WHERE disponible = true`,
          values: []
        }
      ];

      const results = await Promise.all(queries.map(q => client.query(q.text, q.values)));
      
      // Mapeamos los resultados a un objeto de estadísticas estructurado.
      const stats = {
        periodo: {
          ordenes: parseInt(results[0].rows[0].count),
          ingresos: parseFloat(results[1].rows[0].sum),
          promedio_orden: parseFloat(results[2].rows[0].avg) || 0,
          producto_mas_vendido: results[3].rows[0] || null,
        },
        general: {
          ordenes_pendientes: parseInt(results[4].rows[0].count),
          items_activos: parseInt(results[5].rows[0].count),
        },
        filtros_aplicados: {
            fecha_inicio: f_start,
            fecha_fin: f_end,
        },
        fecha_generacion: new Date().toISOString()
      };
      
      console.log('✅ Estadísticas del dashboard generadas exitosamente.');
      res.json({ success: true, estadisticas: stats });

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas del dashboard:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error obteniendo estadísticas del dashboard', 
        error: error.message 
      });
    } finally {
      client.release();
    }
  }

  // 🏆 Productos más populares (ya soporta filtro de fecha)
  async getPopularProducts(req, res) {
    const client = await pool.connect();
    try {
      const { fecha_inicio, fecha_fin, limit = 5 } = req.query;
      let query = `
        SELECT m.nombre, c.nombre as categoria, SUM(oi.cantidad) as total_vendido, SUM(oi.cantidad * oi.precio_unitario) as ingresos_totales
        FROM menu_items m
        JOIN categorias c ON m.categoria_id = c.id
        JOIN orden_items oi ON m.id = oi.menu_item_id
        JOIN ordenes o ON oi.orden_id = o.id
        WHERE o.estado = 'entregada'
      `;
      const params = [];
      if (fecha_inicio && fecha_fin) {
        query += ` AND DATE(o.fecha_creacion) BETWEEN $${params.length + 1} AND $${params.length + 2}`;
        params.push(fecha_inicio, fecha_fin);
      }
      query += ` GROUP BY m.nombre, c.nombre ORDER BY total_vendido DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));
      const result = await client.query(query, params);
      res.json({
        success: true,
        productos: result.rows.map(row => ({
          ...row,
          total_vendido: parseInt(row.total_vendido),
          ingresos_totales: parseFloat(row.ingresos_totales)
        }))
      });
    } catch (error) {
      console.error('❌ Error obteniendo productos populares:', error);
      res.status(500).json({ success: false, message: 'Error obteniendo productos populares', error: error.message });
    } finally {
      client.release();
    }
  }

  // 📅 Ventas por período específico
  async getSalesByPeriod(req, res) {
    const client = await pool.connect();
    try {
        const { periodo = 'dia', fecha_inicio, fecha_fin } = req.query;
        let groupBy, dateFormat;
        switch (periodo) {
            case 'hora': groupBy = "DATE_TRUNC('hour', fecha_creacion)"; dateFormat = 'HH24:00'; break;
            case 'semana': groupBy = "DATE_TRUNC('week', fecha_creacion)"; dateFormat = 'DD/MM/YYYY'; break;
            case 'mes': groupBy = "DATE_TRUNC('month', fecha_creacion)"; dateFormat = 'MM/YYYY'; break;
            default: groupBy = "DATE(fecha_creacion)"; dateFormat = 'DD/MM/YYYY';
        }
        let query = `
            SELECT TO_CHAR(${groupBy}, '${dateFormat}') as periodo_formato, SUM(total) as total_ventas
            FROM ordenes WHERE estado = 'entregada'
        `;
        const params = [];
        if (fecha_inicio && fecha_fin) {
            query += ` AND DATE(fecha_creacion) BETWEEN $${params.length + 1} AND $${params.length + 2}`;
            params.push(fecha_inicio, fecha_fin);
        }
        query += ` GROUP BY ${groupBy} ORDER BY ${groupBy} DESC LIMIT 30`;
        const result = await client.query(query, params);
        res.json({ success: true, ventas_por_periodo: result.rows });
    } catch (error) {
        console.error('❌ Error obteniendo ventas por período:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo ventas por período', error: error.message });
    } finally {
        client.release();
    }
  }
}

module.exports = new ReportController();
