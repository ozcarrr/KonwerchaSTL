import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, from, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import {
  HeightmapConversionOptions,
  HealthCheckResponse,
} from '../models/conversion.model';

interface BackendErrorPayload {
  detail?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConversionApiService {
  private readonly http = inject(HttpClient);
  private readonly toastCtrl = inject(ToastController);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Envía una imagen raster a FastAPI con parámetros de altura y relieve para generar un STL.
   * Conecta la capa de presentación con el servicio geométrico determinista de conversión heightmap.
   */
  convertImageToStl(
    file: File | Blob,
    options: HeightmapConversionOptions,
    fileName?: string
  ): Observable<Blob> {
    const formData = new FormData();
    const resolvedName = fileName || (file instanceof File ? file.name : 'input_image.png');
    formData.append('file', file, resolvedName);
    formData.append('height', options.height.toString());
    formData.append('invert', String(Boolean(options.invert)));

    return this.http
      .post(`${this.apiUrl}/api/convert/heightmap`, formData, {
        responseType: 'blob',
      })
      .pipe(
        map((blob: Blob) => this.ensureStlMimeType(blob)),
        catchError((error: HttpErrorResponse) =>
          this.handleHttpError(error, 'Error al procesar relieve 3D de la imagen.')
        )
      );
  }

  /**
   * Envía un vector SVG a FastAPI para ejecutar la extrusión poligonal y generar una malla STL.
   * Conecta la interfaz de usuario con el motor backend de triangulación y extrusión vectorial.
   */
  convertSvgToStl(
    file: File | Blob,
    depth: number,
    fileName?: string
  ): Observable<Blob> {
    const formData = new FormData();
    const resolvedName = fileName || (file instanceof File ? file.name : 'vector_input.svg');
    formData.append('file', file, resolvedName);
    formData.append('extrude_depth', depth.toString());

    return this.http
      .post(`${this.apiUrl}/api/convert/svg`, formData, {
        responseType: 'blob',
      })
      .pipe(
        map((blob: Blob) => this.ensureStlMimeType(blob)),
        catchError((error: HttpErrorResponse) =>
          this.handleHttpError(error, 'Error al realizar la extrusión 3D del vector SVG.')
        )
      );
  }

  /**
   * Verifica la disponibilidad y conectividad del servicio backend en FastAPI.
   * Monitorea el estado del microservicio como punto de control de salud arquitectónico.
   */
  checkHealth(): Observable<HealthCheckResponse> {
    return this.http
      .get<HealthCheckResponse>(`${this.apiUrl}/api/health`)
      .pipe(
        catchError((error: HttpErrorResponse) =>
          this.handleHttpError(error, 'Backend de conversión no se encuentra accesible.')
        )
      );
  }

  /**
   * Asegura que el objeto binario Blob resultante posea el tipo MIME estricto 'model/stl'.
   * Prepara el archivo para su consumo directo en Three.js STLLoader y descarga en navegador.
   */
  private ensureStlMimeType(blob: Blob): Blob {
    if (blob.type === 'model/stl' || blob.type === 'application/sla') {
      return blob;
    }
    return new Blob([blob], { type: 'model/stl' });
  }

  /**
   * Extrae y decodifica el texto descriptivo del error contenido en respuestas binarias de FastAPI.
   * Resuelve el parseo de payloads de excepción en endpoints configurados con responseType blob.
   */
  private async extractErrorMessage(error: HttpErrorResponse, fallbackContext: string): Promise<string> {
    if (error.error instanceof Blob) {
      try {
        const text = await error.error.text();
        const parsed = JSON.parse(text) as BackendErrorPayload;
        if (parsed.detail && typeof parsed.detail === 'string') {
          return `${fallbackContext} (${parsed.detail})`;
        }
        if (parsed.message && typeof parsed.message === 'string') {
          return `${fallbackContext} (${parsed.message})`;
        }
      } catch {
        // En caso de que el Blob no contenga JSON legible
      }
    } else if (typeof error.error === 'object' && error.error !== null) {
      const errObj = error.error as BackendErrorPayload;
      if (errObj.detail) return `${fallbackContext} (${errObj.detail})`;
    } else if (typeof error.message === 'string') {
      return `${fallbackContext} (${error.message})`;
    }
    return fallbackContext;
  }

  /**
   * Despliega notificaciones visuales Toast de Ionic informando al usuario sobre incidencias HTTP.
   * Centraliza la retroalimentación de la capa de comunicación de red hacia la interfaz de usuario.
   */
  private async showToast(message: string, color: 'danger' | 'warning' = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 4000,
      position: 'bottom',
      color,
      buttons: [
        {
          text: 'Cerrar',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  /**
   * Normaliza las fallas HTTP recibidas desde FastAPI y coordina la notificación mediante Toast.
   * Aísla la gestión de fallos de red garantizando la estabilidad de los flujos reactivos.
   */
  private handleHttpError(error: HttpErrorResponse, fallbackContext: string): Observable<never> {
    return defer(() =>
      from(this.extractErrorMessage(error, fallbackContext)).pipe(
        switchMap((msg: string) =>
          from(this.showToast(msg, 'danger')).pipe(
            switchMap(() => throwError(() => new Error(msg)))
          )
        )
      )
    );
  }
}
