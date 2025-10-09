/**
 * 🔗 Integración CAP con MCP
 *
 * Este módulo proporciona funciones para interactuar con el servicio OData de CAP
 * desde las herramientas MCP. Actúa como capa de abstracción entre MCP y CAP.
 */

import axios, { AxiosInstance } from 'axios';

/**
 * Cliente HTTP para comunicarse con el servicio OData de CAP
 */
export class CAPClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:4004') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: `${baseUrl}/odata/v4/catalog`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Obtiene todos los productos del catálogo
   */
  async getProducts() {
    try {
      console.log(`[CAPClient] Intentando conectar a: ${this.baseUrl}/odata/v4/catalog/Products`);
      const response = await this.client.get('/Products');
      console.log(`[CAPClient] Productos obtenidos exitosamente: ${response.data.value?.length || 0} productos`);
      return response.data.value || [];
    } catch (error: any) {
      console.error(`[CAPClient] Error completo:`, error);
      console.error(`[CAPClient] URL base configurada: ${this.baseUrl}`);
      console.error(`[CAPClient] Código de error: ${error.code}`);
      console.error(`[CAPClient] Respuesta del servidor:`, error.response?.data);
      throw new Error(`Error obteniendo productos: ${error.message} (${error.code || 'UNKNOWN'}) - URL: ${this.baseUrl}`);
    }
  }

  /**
   * Obtiene un producto específico por ID
   */
  async getProductById(id: string) {
    try {
      const response = await this.client.get(`/Products(${id})`);
      return response.data;
    } catch (error: any) {
      throw new Error(`Error obteniendo producto ${id}: ${error.message}`);
    }
  }

  /**
   * Crea un nuevo producto
   */
  async createProduct(productData: {
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
  }) {
    try {
      const response = await this.client.post('/Products', productData);
      return response.data;
    } catch (error: any) {
      throw new Error(`Error creando producto: ${error.message}`);
    }
  }

  /**
   * Actualiza un producto existente
   */
  async updateProduct(id: string, productData: any) {
    try {
      const response = await this.client.patch(`/Products(${id})`, productData);
      return response.data;
    } catch (error: any) {
      throw new Error(`Error actualizando producto: ${error.message}`);
    }
  }

  /**
   * Obtiene todas las órdenes
   */
  async getOrders() {
    try {
      const response = await this.client.get('/Orders?$expand=items($expand=product)');
      return response.data.value || [];
    } catch (error: any) {
      throw new Error(`Error obteniendo órdenes: ${error.message}`);
    }
  }

  /**
   * Obtiene una orden específica por ID
   */
  async getOrderById(id: string) {
    try {
      const response = await this.client.get(`/Orders(${id})?$expand=items($expand=product)`);
      return response.data;
    } catch (error: any) {
      throw new Error(`Error obteniendo orden ${id}: ${error.message}`);
    }
  }

  /**
   * Crea una orden completa con ítems
   */
  async createCompleteOrder(customerName: string, items: Array<{ productId: string; quantity: number }>) {
    try {
      const response = await this.client.post('/createCompleteOrder', {
        customerName,
        items
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Error creando orden: ${error.message}`);
    }
  }

  /**
   * Actualiza el estado de una orden
   */
  async updateOrderStatus(orderId: string, newStatus: string) {
    try {
      const response = await this.client.post('/updateOrderStatus', {
        orderId,
        newStatus
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Error actualizando estado de orden: ${error.message}`);
    }
  }

  /**
   * Obtiene productos con bajo stock
   */
  async getLowStockProducts(threshold: number = 10) {
    try {
      console.log(`[CAPClient] Obteniendo productos con bajo stock (threshold: ${threshold})`);
      const response = await this.client.get(`/getLowStockProducts?threshold=${threshold}`);
      console.log(`[CAPClient] Productos con bajo stock obtenidos: ${response.data.value?.length || 0}`);
      return response.data.value || [];
    } catch (error: any) {
      console.error(`[CAPClient] Error al obtener productos con bajo stock:`, error);
      throw new Error(`Error obteniendo productos con bajo stock: ${error.message} (${error.code || 'UNKNOWN'}) - URL: ${this.baseUrl}`);
    }
  }

  /**
   * Obtiene todos los clientes
   */
  async getCustomers() {
    try {
      const response = await this.client.get('/Customers');
      return response.data.value || [];
    } catch (error: any) {
      throw new Error(`Error obteniendo clientes: ${error.message}`);
    }
  }

  /**
   * Crea un nuevo cliente
   */
  async createCustomer(customerData: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  }) {
    try {
      const response = await this.client.post('/Customers', customerData);
      return response.data;
    } catch (error: any) {
      throw new Error(`Error creando cliente: ${error.message}`);
    }
  }

  /**
   * Verifica si el servicio CAP está disponible
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}
