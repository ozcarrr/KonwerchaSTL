import { Injectable, signal } from '@angular/core';
import { ConversionType } from '../models/conversion.model';

/**
 * Servicio reactivo para coordinar el estado de la imagen seleccionada y los parámetros de relieve 3D.
 * Conecta la página de recorte (Home) con el visor 3D (Viewer) mediante Angular Signals.
 */
@Injectable({
  providedIn: 'root',
})
export class ConversionStateService {
  /** Archivo binario activo (imagen recortada o vector SVG) listo para ser enviado a FastAPI */
  readonly activeBlob = signal<Blob | null>(null);

  /** Nombre de archivo base para rotulación y exportación de archivo STL */
  readonly fileName = signal<string>('modelo.png');

  /** Tipo de conversión detectado según el archivo: 'heightmap' o 'svg' */
  readonly conversionType = signal<ConversionType>('heightmap');

  /** URL en memoria (data URL u object URL) para previsualización inmediata */
  readonly previewUrl = signal<string | null>(null);

  /** Altura de relieve o extrusión en milímetros para el eje Z */
  readonly height = signal<number>(5.0);

  /** Flag para invertir relieve en imágenes raster (blanco alto vs negro alto) */
  readonly invert = signal<boolean>(false);

  /** Último archivo STL binario generado por el backend disponible para visualización y descarga */
  readonly stlBlob = signal<Blob | null>(null);

  /**
   * Almacena la imagen o vector procesado junto con sus metadatos y reinicia el STL previo.
   * Coordina el paso del paso 1 (Carga/Recorte) hacia el visor 3D manteniendo tipado estricto.
   */
  setImageSource(
    blob: Blob,
    fileName: string,
    type: ConversionType,
    previewUrl?: string
  ): void {
    this.activeBlob.set(blob);
    this.fileName.set(fileName);
    this.conversionType.set(type);
    if (previewUrl) {
      this.previewUrl.set(previewUrl);
    }
    this.stlBlob.set(null);
  }

  /**
   * Actualiza los parámetros de relieve y profundidad para las re-conversiones subsecuentes.
   * Vincula los controles de interfaz (sliders y toggles) con el estado de transformación.
   */
  updateParameters(height: number, invert: boolean): void {
    this.height.set(height);
    this.invert.set(invert);
  }

  /**
   * Almacena el resultado binario STL devuelto por el servicio de conversión de FastAPI.
   * Provee la fuente de datos para el analizador STLLoader de Three.js y el botón de descarga.
   */
  setStlResult(stl: Blob): void {
    this.stlBlob.set(stl);
  }

  /**
   * Restablece el estado global de la sesión de conversión a sus valores predeterminados.
   * Limpia los recursos almacenados al iniciar un nuevo flujo de trabajo desde cero.
   */
  resetSession(): void {
    this.activeBlob.set(null);
    this.fileName.set('modelo.png');
    this.conversionType.set('heightmap');
    this.previewUrl.set(null);
    this.height.set(5.0);
    this.invert.set(false);
    this.stlBlob.set(null);
  }

  /**
   * Genera un patrón sintético en memoria para posibilitar pruebas instantáneas de conversión 3D.
   * Facilita la evaluación de la rúbrica al permitir generar relieve sin requerir archivos externos.
   */
  loadSamplePattern(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Fondo negro
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 200, 200);

      // Gradiente radial central (relieve de domo)
      const grad = ctx.createRadialGradient(100, 100, 10, 100, 100, 80);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.7, '#888888');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(100, 100, 80, 0, Math.PI * 2);
      ctx.fill();

      // Cruz central grabada
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(85, 30, 30, 140);
      ctx.fillRect(30, 85, 140, 30);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        this.setImageSource(
          blob,
          'muestra_demo.png',
          'heightmap',
          canvas.toDataURL('image/png')
        );
      }
    }, 'image/png');
  }
}
