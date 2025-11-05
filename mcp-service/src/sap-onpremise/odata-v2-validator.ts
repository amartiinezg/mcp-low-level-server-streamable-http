/**
 * OData V2 Query Validator for S/4HANA 2022 On-Premise
 * Validates queries against known S/4HANA On-Premise OData V2 restrictions
 */

export interface ValidationWarning {
  severity: 'warning' | 'error';
  message: string;
  suggestion: string;
}

export interface ValidationResult {
  isValid: boolean;
  warnings: ValidationWarning[];
}

export class ODataV2Validator {
  /**
   * Validates query options against S/4HANA 2022 On-Premise restrictions
   */
  static validateQuery(options: {
    entitySet: string;
    select?: string;
    expand?: string;
    filter?: string;
  }): ValidationResult {
    const warnings: ValidationWarning[] = [];

    // Restriction 1: $select + $expand on root entity
    if (options.select && options.expand) {
      warnings.push({
        severity: 'error',
        message: '❌ Combinación de $select y $expand en la raíz NO es compatible con S/4HANA 2022 On-Premise',
        suggestion: `El $expand desaparecerá de la respuesta. SOLUCIÓN:
1. Opción recomendada: Remover el parámetro 'select' y traer todos los campos de la raíz con el expand
2. Opción alternativa: Si realmente necesitas solo campos específicos de la raíz, haz dos llamadas separadas:
   - Llamada 1: Con $expand (sin $select) para obtener datos de navegación
   - Llamada 2: Con $select (sin $expand) para obtener campos específicos de la raíz`
      });
    }

    // Restriction 2: $select inside $expand
    if (options.expand && options.expand.includes('(')) {
      warnings.push({
        severity: 'error',
        message: '❌ $select dentro de $expand NO está soportado en S/4HANA 2022 On-Premise',
        suggestion: `Sintaxis como 'to_BusinessPartnerAddress($select=City)' no funciona. SOLUCIÓN:
1. Opción recomendada: Usar $expand simple sin $select (ej: 'to_BusinessPartnerAddress') y filtrar los campos localmente en tu código
2. Opción alternativa: Hacer llamada directa al EntitySet de navegación:
   - Ejemplo: entitySet='A_BusinessPartnerAddress', filter='BusinessPartner eq "1000001"', select='AddressID,City,Country'`
      });
    }

    // Restriction 3: any() filter on navigation properties
    if (options.filter && /\/any\s*\(/i.test(options.filter)) {
      warnings.push({
        severity: 'error',
        message: '❌ Filtros con any() sobre navegaciones NO están soportados en OData V2 de S/4HANA 2022',
        suggestion: `Filtros como "to_Address/any(d: d/Country eq 'ES')" no funcionan. SOLUCIÓN:
1. Opción recomendada: Traer con $expand y filtrar localmente:
   - entitySet='A_BusinessPartner', expand='to_BusinessPartnerAddress'
   - Luego filtrar en tu código los business partners que tengan addresses con Country='ES'
2. Opción alternativa: Hacer consulta inversa directa:
   - entitySet='A_BusinessPartnerAddress', filter="Country eq 'ES'"
   - Obtendrás las direcciones y sus BusinessPartner IDs asociados`
      });
    }

    // Restriction 4: Detecting potential navigation-depth issues
    if (options.expand && options.expand.split(',').length > 2) {
      warnings.push({
        severity: 'warning',
        message: '⚠️  Estás expandiendo múltiples navegaciones (>2), esto puede causar respuestas grandes o timeouts',
        suggestion: `Considera dividir en múltiples llamadas más específicas si tienes problemas de rendimiento o si necesitas aplicar $filter/$select a las navegaciones expandidas.`
      });
    }

    return {
      isValid: warnings.filter(w => w.severity === 'error').length === 0,
      warnings
    };
  }

  /**
   * Suggests alternative queries for common patterns
   */
  static suggestAlternatives(options: {
    entitySet: string;
    select?: string;
    expand?: string;
    filter?: string;
  }): string[] {
    const suggestions: string[] = [];

    // If user wants to filter on expanded navigation
    if (options.expand && options.filter) {
      const navigationProps = options.expand.split(',').map(e => e.trim());

      suggestions.push(`💡 Si tu filtro intenta acceder a propiedades de las navegaciones (${navigationProps.join(', ')}), considera:`);

      navigationProps.forEach(navProp => {
        // Try to infer the target EntitySet (common patterns)
        const targetEntitySet = this.inferTargetEntitySet(navProp);
        if (targetEntitySet) {
          suggestions.push(`   - Llamada directa: entitySet='${targetEntitySet}', filter='<tu_filtro>'`);
        }
      });
    }

    return suggestions;
  }

  /**
   * Infers target EntitySet from navigation property name
   */
  private static inferTargetEntitySet(navigationProperty: string): string | null {
    // Common patterns in SAP Business Partner API
    const patterns: Record<string, string> = {
      'to_BusinessPartnerAddress': 'A_BusinessPartnerAddress',
      'to_BusinessPartnerBank': 'A_BusinessPartnerBank',
      'to_BusinessPartnerRole': 'A_BusinessPartnerRole',
      'to_BusinessPartnerTaxNumber': 'A_BusinessPartnerTaxNumber',
      'to_BPContactToAddress': 'A_AddressEmailAddress',
      'to_EmailAddress': 'A_AddressEmailAddress',
      'to_PhoneNumber': 'A_AddressPhoneNumber',
      'to_FaxNumber': 'A_AddressFaxNumber',
      'to_BPContactToFuncAndDept': 'A_BPContactToFuncAndDept',
      'to_BuPaIdentification': 'A_BuPaIdentification',
      'to_BuPaIndustry': 'A_BuPaIndustry',
      'to_BusinessPartnerRating': 'A_BusinessPartnerRating',
      'to_BPFinancialServicesReporting': 'A_BPFinancialServicesReporting',
    };

    return patterns[navigationProperty] || null;
  }

  /**
   * Formats validation warnings for display
   */
  static formatWarnings(warnings: ValidationWarning[]): string {
    if (warnings.length === 0) {
      return '';
    }

    let output = '\n⚠️  ADVERTENCIAS DE VALIDACIÓN:\n\n';

    warnings.forEach((warning, index) => {
      output += `${index + 1}. ${warning.message}\n`;
      output += `   ${warning.suggestion}\n\n`;
    });

    return output;
  }
}
