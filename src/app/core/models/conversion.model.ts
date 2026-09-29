/**
 * Modelos de datos para el motor de conversión 3D (Raster y Vectorial a STL).
 * Tipado estricto para garantizar contratos fiables entre FastAPI y la interfaz Angular.
 */

export type ConversionType = 'heightmap' | 'svg';

/**
 * Parámetros de configuración para la conversión de imágenes raster (mapa de altura).
 */
export interface HeightmapConversionOptions {
  /** Altura máxima del relieve en milímetros (Z) */
  height: number;
  /** Invertir escala de grises (blanco alto vs negro alto) */
  invert?: boolean;
}

/**
 * Parámetros de configuración para la extrusión de vectores SVG.
 */
export interface SvgConversionOptions {
  /** Profundidad de extrusión en milímetros (Z) */
  extrude_depth: number;
}

/**
 * Parámetros guardados como JSONB en el historial para Heightmap.
 */
export interface HeightmapSettings {
  height: number;
  invert: boolean;
  [key: string]: string | number | boolean;
}

/**
 * Parámetros guardados como JSONB en el historial para SVG.
 */
export interface SvgSettings {
  extrude_depth: number;
  [key: string]: string | number | boolean;
}

/**
 * Unión de posibles estructuras de configuración guardadas en base de datos.
 */
export type ConversionSettings = HeightmapSettings | SvgSettings;

/**
 * Payload para solicitud de conversión de imagen raster.
 */
export interface HeightmapConversionPayload {
  file: File | Blob;
  options: HeightmapConversionOptions;
  fileName?: string;
}

/**
 * Payload para solicitud de extrusión de SVG.
 */
export interface SvgConversionPayload {
  file: File | Blob;
  depth: number;
  fileName?: string;
}

/**
 * Resultado de una conversión exitosa listo para visualización y descarga.
 */
export interface ConversionResult {
  stlBlob: Blob;
  fileName: string;
  sizeBytes: number;
  conversionType: ConversionType;
  settings: Record<string, string | number | boolean>;
}

/**
 * Respuesta del endpoint de verificación de salud de FastAPI (/api/health).
 */
export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
}
