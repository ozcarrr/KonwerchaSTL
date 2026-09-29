import { ConversionType } from './conversion.model';

/**
 * Modelo que mapea exactamente el esquema de la tabla `conversion_history` en Supabase.
 * Permite tipado estricto en toda la capa de persistencia y consumo de historial.
 */
export type ConversionHistoryRecord = {
  /** Identificador único UUID generado por PostgreSQL */
  id: string;
  /** Nombre del archivo original subido por el usuario */
  file_name: string;
  /** Algoritmo utilizado: 'heightmap' o 'svg' */
  conversion_type: ConversionType;
  /** Parámetros aplicados serializados en formato JSONB */
  settings: Record<string, string | number | boolean>;
  /** Tamaño del archivo STL generado en bytes */
  stl_size_bytes: number;
  /** Marca de tiempo de inserción en formato ISO-8601 (timestamptz) */
  created_at: string;
};

/**
 * Payload requerido para insertar un nuevo registro de conversión en Supabase.
 * Excluye campos generados automáticamente por el motor de base de datos (`id` y `created_at`).
 */
export type CreateHistoryRecordDto = {
  /** Nombre del archivo original */
  file_name: string;
  /** Tipo de conversión efectuada */
  conversion_type: ConversionType;
  /** Parámetros geométricos aplicados */
  settings: Record<string, string | number | boolean>;
  /** Tamaño en bytes del STL binario devuelto */
  stl_size_bytes: number;
};

/**
 * Alias de conveniencia para colecciones de historial.
 */
export type ConversionHistoryList = ConversionHistoryRecord[];
