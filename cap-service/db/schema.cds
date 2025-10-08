namespace cap.mcp.demo;

/**
 * Entidad de Productos
 */
entity Products {
  key ID          : UUID;
      name        : String(100) @title: 'Nombre del Producto';
      description : String(500) @title: 'Descripción';
      price       : Decimal(10, 2) @title: 'Precio';
      stock       : Integer @title: 'Stock Disponible';
      category    : String(50) @title: 'Categoría';
      active      : Boolean default true @title: 'Activo';
      createdAt   : Timestamp @cds.on.insert: $now;
      modifiedAt  : Timestamp @cds.on.insert: $now @cds.on.update: $now;
}

/**
 * Entidad de Órdenes
 */
entity Orders {
  key ID          : UUID;
      orderNumber : String(20) @title: 'Número de Orden';
      customerName: String(100) @title: 'Nombre del Cliente';
      totalAmount : Decimal(10, 2) @title: 'Monto Total';
      status      : String(20) @title: 'Estado' default 'PENDING';
      orderDate   : DateTime @title: 'Fecha de Orden' @cds.on.insert: $now;
      items       : Composition of many OrderItems on items.order = $self;
}

/**
 * Ítems de Órdenes
 */
entity OrderItems {
  key ID       : UUID;
      order    : Association to Orders;
      product  : Association to Products;
      quantity : Integer @title: 'Cantidad';
      unitPrice: Decimal(10, 2) @title: 'Precio Unitario';
      subtotal : Decimal(10, 2) @title: 'Subtotal';
}

/**
 * Entidad de Clientes
 */
entity Customers {
  key ID    : UUID;
      name  : String(100) @title: 'Nombre';
      email : String(100) @title: 'Email';
      phone : String(20) @title: 'Teléfono';
      address: String(200) @title: 'Dirección';
      active: Boolean default true @title: 'Activo';
      createdAt: Timestamp @cds.on.insert: $now;
}
