using cap.mcp.demo from '../db/schema';

/**
 * Servicio de Catálogo - Expone entidades como OData
 */
service CatalogService {
  /**
   * Productos - CRUD completo
   */
  entity Products as projection on demo.Products;

  /**
   * Órdenes - CRUD completo con ítems
   */
  entity Orders as projection on demo.Orders;

  /**
   * Ítems de Órdenes
   */
  entity OrderItems as projection on demo.OrderItems;

  /**
   * Clientes - CRUD completo
   */
  entity Customers as projection on demo.Customers;

  /**
   * Acción personalizada: Crear orden completa
   */
  action createCompleteOrder(
    customerName: String,
    items: array of {
      productId: UUID;
      quantity: Integer;
    }
  ) returns {
    orderId: UUID;
    orderNumber: String;
    totalAmount: Decimal;
  };

  /**
   * Función personalizada: Obtener productos con bajo stock
   */
  function getLowStockProducts(threshold: Integer) returns array of Products;

  /**
   * Acción: Actualizar estado de orden
   */
  action updateOrderStatus(
    orderId: UUID,
    newStatus: String
  ) returns Orders;
}
