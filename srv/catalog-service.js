/**
 * Implementación del servicio de catálogo
 */
module.exports = async function () {
  const cds = require('@sap/cds');
  const { Products, Orders, OrderItems, Customers } = this.entities;

  // Inicializar datos de ejemplo si no existen
  this.before('READ', Products, async (req) => {
    const count = await SELECT.one.from(Products).columns('count(*) as count');
    if (!count || count.count === 0) {
      await INSERT.into(Products).entries([
        {
          ID: cds.utils.uuid(),
          name: 'Laptop Dell XPS 15',
          description: 'Laptop de alto rendimiento con procesador Intel i7',
          price: 1299.99,
          stock: 15,
          category: 'Electrónica',
          active: true
        },
        {
          ID: cds.utils.uuid(),
          name: 'Mouse Logitech MX Master 3',
          description: 'Mouse inalámbrico ergonómico',
          price: 99.99,
          stock: 50,
          category: 'Accesorios',
          active: true
        },
        {
          ID: cds.utils.uuid(),
          name: 'Monitor LG UltraWide 34"',
          description: 'Monitor ultrawide 34 pulgadas 21:9',
          price: 599.99,
          stock: 8,
          category: 'Electrónica',
          active: true
        },
        {
          ID: cds.utils.uuid(),
          name: 'Teclado Mecánico Keychron K2',
          description: 'Teclado mecánico compacto 75%',
          price: 89.99,
          stock: 3,
          category: 'Accesorios',
          active: true
        },
        {
          ID: cds.utils.uuid(),
          name: 'Webcam Logitech C920',
          description: 'Cámara web HD 1080p',
          price: 79.99,
          stock: 25,
          category: 'Accesorios',
          active: true
        }
      ]);
    }
  });

  // Acción: Crear orden completa
  this.on('createCompleteOrder', async (req) => {
    const { customerName, items } = req.data;

    if (!items || items.length === 0) {
      req.error(400, 'La orden debe contener al menos un producto');
    }

    let totalAmount = 0;
    const orderNumber = `ORD-${Date.now()}`;
    const orderId = cds.utils.uuid();

    // Crear la orden
    await INSERT.into(Orders).entries({
      ID: orderId,
      orderNumber,
      customerName,
      totalAmount: 0,
      status: 'PENDING'
    });

    // Crear los ítems de la orden
    for (const item of items) {
      const product = await SELECT.one.from(Products).where({ ID: item.productId });

      if (!product) {
        req.error(404, `Producto ${item.productId} no encontrado`);
      }

      if (product.stock < item.quantity) {
        req.error(400, `Stock insuficiente para el producto ${product.name}`);
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      await INSERT.into(OrderItems).entries({
        ID: cds.utils.uuid(),
        order_ID: orderId,
        product_ID: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal
      });

      // Actualizar stock del producto
      await UPDATE(Products)
        .set({ stock: product.stock - item.quantity })
        .where({ ID: item.productId });
    }

    // Actualizar el total de la orden
    await UPDATE(Orders)
      .set({ totalAmount })
      .where({ ID: orderId });

    return {
      orderId,
      orderNumber,
      totalAmount
    };
  });

  // Función: Obtener productos con bajo stock
  this.on('getLowStockProducts', async (req) => {
    const { threshold } = req.data;
    const lowStockProducts = await SELECT.from(Products)
      .where({ stock: { '<': threshold || 10 }, active: true });

    return lowStockProducts;
  });

  // Acción: Actualizar estado de orden
  this.on('updateOrderStatus', async (req) => {
    const { orderId, newStatus } = req.data;

    const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(newStatus)) {
      req.error(400, `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}`);
    }

    const order = await SELECT.one.from(Orders).where({ ID: orderId });
    if (!order) {
      req.error(404, 'Orden no encontrada');
    }

    await UPDATE(Orders)
      .set({ status: newStatus })
      .where({ ID: orderId });

    return await SELECT.one.from(Orders).where({ ID: orderId });
  });

  // Validación antes de crear producto
  this.before('CREATE', Products, async (req) => {
    if (req.data.price < 0) {
      req.error(400, 'El precio no puede ser negativo');
    }
    if (req.data.stock < 0) {
      req.error(400, 'El stock no puede ser negativo');
    }
  });

  // Validación antes de actualizar producto
  this.before('UPDATE', Products, async (req) => {
    if (req.data.price !== undefined && req.data.price < 0) {
      req.error(400, 'El precio no puede ser negativo');
    }
    if (req.data.stock !== undefined && req.data.stock < 0) {
      req.error(400, 'El stock no puede ser negativo');
    }
  });
};
