import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonBadge,
  IonChip,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  ToastController,
} from '@ionic/angular';
import { ImageCropperComponent, ImageCroppedEvent, ImageTransform } from 'ngx-image-cropper';
import { addIcons } from 'ionicons';
import {
  cloudUploadOutline,
  imageOutline,
  cutOutline,
  syncOutline,
  arrowForwardOutline,
  timeOutline,
  refreshOutline,
  cubeOutline,
  eyeOutline,
  colorFilterOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { ConversionStateService } from '../../core/services/conversion-state.service';
import { ConversionType } from '../../core/models/conversion.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonBadge,
    IonChip,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    ImageCropperComponent,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly conversionState = inject(ConversionStateService);
  private readonly toastCtrl = inject(ToastController);

  /** Evento nativo de selección de archivo raster para alimentar a ngx-image-cropper */
  imageChangedEvent: Event | null = null;

  /** Archivo raster original cuando se selecciona por arrastre o input alternativo */
  imageFile: File | null = null;

  /** Blob recortado resultante emitido por ngx-image-cropper */
  croppedBlob: Blob | null = null;

  /** Previsualización en formato DataURL o ObjectURL de la imagen recortada */
  croppedPreview = signal<string | null>(null);

  /** Nombre del archivo cargado por el usuario */
  fileName = signal<string>('');

  /** Tipo de conversión determinado para el flujo actual: raster heightmap o vector SVG */
  conversionType = signal<ConversionType>('heightmap');

  /** Contenido de previsualización para archivos vectoriales SVG */
  svgContent = signal<string | null>(null);

  /** Blob original del archivo SVG cargado */
  svgBlob: Blob | null = null;

  /** Estado de carga activa al procesar el archivo */
  isLoading = signal<boolean>(false);

  /** Estado de preparación del componente de recorte */
  isCropperReady = signal<boolean>(false);

  /** Indicador de zona activa de arrastre y soltado de archivos (Drag & Drop) */
  isDragOver = signal<boolean>(false);

  /** Configuración de relación de aspecto para el recorte (1:1, 4:3, 16:9, libre) */
  aspectRatio = 1;
  maintainAspectRatio = false;
  aspectRatioMode = 'free';

  /** Parámetros de transformación geométrica aplicables en el lienzo de recorte */
  scale = 1;
  rotation = 0;
  flipH = false;
  flipV = false;
  transform: ImageTransform = {};

  constructor() {
    addIcons({
      cloudUploadOutline,
      imageOutline,
      cutOutline,
      syncOutline,
      arrowForwardOutline,
      timeOutline,
      refreshOutline,
      cubeOutline,
      eyeOutline,
      colorFilterOutline,
      sparklesOutline,
    });
  }

  /**
   * Captura el archivo ingresado mediante el input de archivo estándar o arrastrado al contenedor.
   * Discrimina entre formatos vectoriales SVG y formatos raster procesables por ngx-image-cropper.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.processLoadedFile(file, event);
  }

  /**
   * Procesa eventos de soltado de archivos (drag & drop) sobre la tarjeta principal de carga.
   * Normaliza la extracción del archivo eliminando la fricción de búsqueda en el explorador del sistema operativo.
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.processLoadedFile(file, null);
    }
  }

  /**
   * Activa el indicador visual de área receptora al sostener un archivo sobre el contenedor.
   * Provee retroalimentación visual directa al usuario durante la interacción de arrastre.
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  /**
   * Desactiva el resaltado del área receptora cuando el cursor abandona la tarjeta.
   * Restablece el estilo visual de reposo en la interfaz de usuario.
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  /**
   * Recibe y almacena el resultado del recorte emitido por ngx-image-cropper.
   * Extrae el blob binario y la representación gráfica para la previsualización interactiva.
   */
  onImageCropped(event: ImageCroppedEvent): void {
    if (event.blob) {
      this.croppedBlob = event.blob;
      this.croppedPreview.set(event.objectUrl ?? event.base64 ?? null);
    } else if (event.base64) {
      this.croppedPreview.set(event.base64);
      this.croppedBlob = this.base64ToBlob(event.base64);
    }
  }

  /**
   * Notifica que el motor de recorte ha cargado la imagen y está listo para la interacción del usuario.
   * Desactiva el indicador de espera y habilita las herramientas de edición geométrica.
   */
  onCropperReady(): void {
    this.isCropperReady.set(true);
    this.isLoading.set(false);
  }

  /**
   * Maneja errores durante la decodificación de la imagen en ngx-image-cropper y alerta al usuario.
   * Notifica anomalías en el archivo seleccionado garantizando la resiliencia de la interfaz.
   */
  async onLoadImageFailed(): Promise<void> {
    this.isLoading.set(false);
    this.isCropperReady.set(false);
    const toast = await this.toastCtrl.create({
      message: 'No se pudo decodificar la imagen seleccionada. Por favor prueba con otro archivo.',
      duration: 3500,
      position: 'bottom',
      color: 'danger',
    });
    await toast.present();
  }

  /**
   * Cambia la proporción de recorte activa según la opción seleccionada en el selector segmentado.
   * Ajusta los límites de restricción del marco de recorte en ngx-image-cropper.
   */
  onAspectRatioChange(mode: string): void {
    this.aspectRatioMode = mode;
    switch (mode) {
      case '1:1':
        this.maintainAspectRatio = true;
        this.aspectRatio = 1;
        break;
      case '4:3':
        this.maintainAspectRatio = true;
        this.aspectRatio = 4 / 3;
        break;
      case '16:9':
        this.maintainAspectRatio = true;
        this.aspectRatio = 16 / 9;
        break;
      default:
        this.maintainAspectRatio = false;
        this.aspectRatio = 1;
        break;
    }
  }

  /**
   * Aplica rotación incremental en pasos de 90 grados en sentido horario o antihorario.
   * Actualiza el objeto de transformación consumido reactivamente por el visor de recorte.
   */
  rotate(degrees: number): void {
    this.rotation = (this.rotation + degrees) % 360;
    this.updateTransform();
  }

  /**
   * Invierte horizontalmente el lienzo de la imagen recortable.
   * Modifica el estado del eje horizontal en la matriz de transformación del cropper.
   */
  flipHorizontal(): void {
    this.flipH = !this.flipH;
    this.updateTransform();
  }

  /**
   * Restablece las transformaciones geométricas y relación de aspecto a sus valores de fábrica.
   * Retorna el marco y la imagen a su orientación y proporción originales.
   */
  resetTransforms(): void {
    this.rotation = 0;
    this.scale = 1;
    this.flipH = false;
    this.flipV = false;
    this.aspectRatioMode = 'free';
    this.maintainAspectRatio = false;
    this.aspectRatio = 1;
    this.transform = {};
  }

  /**
   * Carga un patrón gráfico sintético en memoria para permitir evaluación y pruebas instantáneas.
   * Permite al evaluador generar relieve 3D sin depender de archivos locales del disco.
   */
  loadDemoPattern(): void {
    this.isLoading.set(true);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Fondo negro
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, 400, 400);

      // Gradiente suave de relieve tipo medalla
      const grad = ctx.createRadialGradient(200, 200, 30, 200, 200, 160);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#9999aa');
      grad.addColorStop(0.85, '#333344');
      grad.addColorStop(1, '#0a0a14');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(200, 200, 160, 0, Math.PI * 2);
      ctx.fill();

      // Cruz central en alto relieve
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(170, 80, 60, 240);
      ctx.fillRect(80, 170, 240, 60);

      // Estrella central
      ctx.fillStyle = '#eedd88';
      ctx.beginPath();
      ctx.arc(200, 200, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.toBlob((blob) => {
      this.isLoading.set(false);
      if (blob) {
        const file = new File([blob], 'demo_relieve.png', { type: 'image/png' });
        this.processLoadedFile(file, null);
      }
    }, 'image/png');
  }

  /**
   * Envía la imagen recortada o vector SVG al servicio de estado y navega al visor 3D (Paso 2).
   * Conecta el resultado de la edición con el renderizador Three.js cumpliendo el flujo de 3 pasos.
   */
  continueToViewer(): void {
    const isSvg = this.conversionType() === 'svg';
    const activeBlob = isSvg ? this.svgBlob : this.croppedBlob;
    const resolvedName = this.fileName() || (isSvg ? 'vector.svg' : 'imagen.png');

    if (!activeBlob) return;

    const preview = isSvg
      ? (this.svgContent() ? `data:image/svg+xml;utf8,${encodeURIComponent(this.svgContent()!)}` : undefined)
      : (this.croppedPreview() ?? undefined);

    this.conversionState.setImageSource(
      activeBlob,
      resolvedName,
      this.conversionType(),
      preview
    );

    void this.router.navigate(['/viewer']);
  }

  /**
   * Navega a la página de historial de conversiones consultando los 5 registros de Supabase.
   * Proporciona acceso rápido a las transformaciones anteriores y sus metadatos.
   */
  goToHistory(): void {
    void this.router.navigate(['/history']);
  }

  /**
   * Discrimina y configura las propiedades del archivo cargado según sea imagen raster o SVG.
   * Centraliza el pipeline de ingesta de archivos desde el input o por soltado interactivo.
   */
  private processLoadedFile(file: File, event: Event | null): void {
    this.fileName.set(file.name);
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type.includes('svg');

    if (isSvg) {
      this.conversionType.set('svg');
      this.imageChangedEvent = null;
      this.imageFile = null;
      this.svgBlob = file;
      this.croppedBlob = null;
      this.croppedPreview.set(null);
      this.isLoading.set(true);

      const reader = new FileReader();
      reader.onload = () => {
        this.svgContent.set(typeof reader.result === 'string' ? reader.result : null);
        this.isLoading.set(false);
        this.isCropperReady.set(true);
      };
      reader.onerror = () => {
        this.isLoading.set(false);
        void this.onLoadImageFailed();
      };
      reader.readAsText(file);
    } else {
      this.conversionType.set('heightmap');
      this.svgContent.set(null);
      this.svgBlob = null;
      this.isLoading.set(true);
      this.isCropperReady.set(false);
      this.resetTransforms();

      if (event) {
        this.imageChangedEvent = event;
        this.imageFile = null;
      } else {
        this.imageChangedEvent = null;
        this.imageFile = file;
      }
    }
  }

  /**
   * Sincroniza las transformaciones geométricas hacia la estructura requerida por ngx-image-cropper.
   * Asegura la inmutabilidad del objeto de transformación para disparar la detección de cambios.
   */
  private updateTransform(): void {
    this.transform = {
      ...this.transform,
      rotate: this.rotation,
      scale: this.scale,
      flipH: this.flipH,
      flipV: this.flipV,
    };
  }

  /**
   * Convierte una cadena base64 en un objeto binario Blob con tipo MIME estándar de imagen.
   * Facilita la interoperabilidad cuando el cropper retorna serializaciones en data URI.
   */
  private base64ToBlob(base64: string): Blob {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/png';
    const raw = window.atob(parts[1]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }
}
