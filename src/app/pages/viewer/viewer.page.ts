import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonRange,
  IonToggle,
  IonSpinner,
  IonBadge,
  IonChip,
  IonLabel,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cubeOutline,
  downloadOutline,
  refreshOutline,
  arrowBackOutline,
  layersOutline,
  sparklesOutline,
  timeOutline,
  informationCircleOutline,
  eyeOutline,
} from 'ionicons/icons';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { ConversionApiService } from '../../core/services/conversion-api.service';
import { ConversionStateService } from '../../core/services/conversion-state.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ConversionType } from '../../core/models/conversion.model';

@Component({
  selector: 'app-viewer',
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonRange,
    IonToggle,
    IonSpinner,
    IonBadge,
    IonChip,
    IonLabel,
  ],
})
export class ViewerPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: false })
  canvasContainer!: ElementRef<HTMLDivElement>;

  private readonly router = inject(Router);
  private readonly conversionApi = inject(ConversionApiService);
  readonly conversionState = inject(ConversionStateService);
  private readonly supabaseService = inject(SupabaseService);
  private readonly toastCtrl = inject(ToastController);

  /** Altura del relieve o profundidad de extrusión en milímetros */
  height = 5.0;

  /** Flag para invertir escala de grises en relieve */
  invert = false;

  /** Modo de visualización alámbrico de Three.js */
  wireframe = false;

  /** Nombre del archivo en proceso */
  fileName = signal<string>('modelo.stl');

  /** Tipo de conversión activo ('heightmap' o 'svg') */
  conversionType = signal<ConversionType>('heightmap');

  /** Estado de procesamiento activo en FastAPI */
  isConverting = signal<boolean>(false);

  /** Estadísticas técnicas de la malla STL cargada */
  triangleCount = signal<number>(0);
  vertexCount = signal<number>(0);
  fileSizeBytes = signal<number>(0);

  /** Componentes del ecosistema Three.js */
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private currentMesh: THREE.Mesh | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundResize = () => this.onResize();

  constructor() {
    addIcons({
      cubeOutline,
      downloadOutline,
      refreshOutline,
      arrowBackOutline,
      layersOutline,
      sparklesOutline,
      timeOutline,
      informationCircleOutline,
      eyeOutline,
    });
  }

  ngOnInit(): void {
    this.height = this.conversionState.height();
    this.invert = this.conversionState.invert();
    this.fileName.set(this.conversionState.fileName());
    this.conversionType.set(this.conversionState.conversionType());
  }

  ngAfterViewInit(): void {
    this.initThreeJs();

    // Si ya existe un STL generado previamente, cargarlo directamente
    const existingStl = this.conversionState.stlBlob();
    if (existingStl) {
      void this.renderStlBlob(existingStl);
    } else if (this.conversionState.activeBlob()) {
      // Si hay imagen recortada pero no STL, ejecutar la conversión inicial
      void this.triggerConversion();
    }
  }

  ngOnDestroy(): void {
    this.cleanUpThreeJs();
  }

  /**
   * Invoca los endpoints de FastAPI para procesar la geometría y sincroniza el registro en Supabase.
   * Conecta la interfaz de usuario con la API de conversión y mantiene actualizado el estado global.
   */
  async triggerConversion(): Promise<void> {
    const blob = this.conversionState.activeBlob();
    if (!blob) return;

    this.isConverting.set(true);
    this.conversionState.updateParameters(this.height, this.invert);

    const isSvg = this.conversionType() === 'svg';
    const request$ = isSvg
      ? this.conversionApi.convertSvgToStl(blob, this.height, this.fileName())
      : this.conversionApi.convertImageToStl(
          blob,
          { height: this.height, invert: this.invert },
          this.fileName()
        );

    request$.subscribe({
      next: async (stlBlob: Blob) => {
        this.conversionState.setStlResult(stlBlob);
        this.fileSizeBytes.set(stlBlob.size);
        await this.renderStlBlob(stlBlob);
        this.isConverting.set(false);

        // Persistir en Supabase cumpliendo la regla de rotación de 5 registros
        void this.saveToHistory(stlBlob.size);
      },
      error: () => {
        this.isConverting.set(false);
      },
    });
  }

  /**
   * Descarga directamente en el navegador el archivo binario STL generado.
   * Ejecuta el Paso 3 del flujo de usuario mediante la creación de un enlace dinámico en el DOM.
   */
  downloadStl(): void {
    const stlBlob = this.conversionState.stlBlob();
    if (!stlBlob) return;

    const baseName = this.fileName().replace(/\.[^/.]+$/, '');
    const downloadName = `${baseName || 'modelo'}.stl`;

    const downloadUrl = URL.createObjectURL(stlBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    void this.showToast(`Archivo "${downloadName}" descargado exitosamente.`, 'success');
  }

  /**
   * Alterna la representación alámbrica (wireframe) del material de la malla en Three.js.
   * Permite al usuario inspeccionar visualmente la distribución de polígonos triangulados.
   */
  toggleWireframe(): void {
    if (this.currentMesh && this.currentMesh.material instanceof THREE.MeshStandardMaterial) {
      this.currentMesh.material.wireframe = this.wireframe;
    }
  }

  /**
   * Carga una muestra de relieve en memoria y ejecuta la conversión para pruebas instantáneas.
   * Permite evaluar la renderización 3D y la comunicación con FastAPI en un solo clic.
   */
  loadSampleModel(): void {
    this.conversionState.loadSamplePattern();
    this.fileName.set(this.conversionState.fileName());
    this.conversionType.set('heightmap');
    void this.triggerConversion();
  }

  /**
   * Regresa al Paso 1 (Home) para cargar o recortar una nueva imagen de origen.
   * Facilita la transición fluida del usuario entre fases del proceso de modelado.
   */
  backToHome(): void {
    void this.router.navigate(['/home']);
  }

  /**
   * Navega a la vista de auditoría e historial de conversiones almacenadas en Supabase.
   * Permite comprobar el estado de los últimos 5 archivos procesados y su rotación FIFO.
   */
  goToHistory(): void {
    void this.router.navigate(['/history']);
  }

  /**
   * Inicializa la escena, cámara, sistema de iluminación y renderizador WebGL de Three.js.
   * Construye el entorno gráfico interactivo para la inspección de modelos 3D.
   */
  private initThreeJs(): void {
    const container = this.canvasContainer?.nativeElement;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Escena con fondo neutro oscuro
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13131a);

    // Cámara en perspectiva
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 40, 80);

    // Renderizador WebGL de alto rendimiento
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      container.appendChild(this.renderer.domElement);

      // Controles orbitales interactivos
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
    } catch (err: unknown) {
      console.warn('[ViewerPage] WebGL context no disponible en este entorno:', err);
      return;
    }

    // Iluminación para resaltar volumen y relieve
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(60, 90, 60);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x7799dd, 0.9);
    dirLight2.position.set(-60, 40, -60);
    this.scene.add(dirLight2);

    // Rejilla de referencia espacial
    this.gridHelper = new THREE.GridHelper(100, 20, 0x3b82f6, 0x22223a);
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);

    // Bucle de renderizado
    this.animate();

    // Adaptabilidad responsive mediante ResizeObserver y evento window
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.boundResize);
  }

  /**
   * Ejecuta el ciclo de animación interactivo manteniendo el renderizado continuo y controles orbitales.
   * Coordina el refresco de cuadros WebGL con la tasa de refresco del navegador.
   */
  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    if (this.controls) {
      this.controls.update();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  /**
   * Procesa el Blob binario STL recibido, genera la malla 3D y re-encuadra la cámara.
   * Transforma la respuesta binaria de FastAPI en un objeto geométrico visible con STLLoader.
   */
  private async renderStlBlob(stlBlob: Blob): Promise<void> {
    try {
      let buffer: ArrayBuffer;
      if (typeof stlBlob.arrayBuffer === 'function') {
        buffer = await stlBlob.arrayBuffer();
      } else {
        buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(stlBlob);
        });
      }

      const loader = new STLLoader();
      const geometry = loader.parse(buffer);

      geometry.computeVertexNormals();
      geometry.center();

      // Cálculo de métricas poligonales
      const positionAttr = geometry.getAttribute('position');
      const vCount = positionAttr ? positionAttr.count : 0;
      this.vertexCount.set(vCount);
      this.triangleCount.set(Math.floor(vCount / 3));

      // Limpieza de la malla anterior
      if (this.currentMesh) {
        this.scene.remove(this.currentMesh);
        this.currentMesh.geometry.dispose();
        if (Array.isArray(this.currentMesh.material)) {
          this.currentMesh.material.forEach((m) => m.dispose());
        } else {
          this.currentMesh.material.dispose();
        }
      }

      // Material azul metalizado reflectante con buen contraste de sombra
      const material = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.35,
        metalness: 0.2,
        flatShading: false,
        wireframe: this.wireframe,
      });

      this.currentMesh = new THREE.Mesh(geometry, material);
      this.scene.add(this.currentMesh);

      // Auto-encuadre de la cámara según el bounding box de la geometría
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (bbox) {
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 40;
        const fov = this.camera.fov * (Math.PI / 180);
        const cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;

        this.camera.position.set(0, maxDim * 0.9, cameraDist);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
          this.controls.target.set(0, 0, 0);
          this.controls.update();
        }

        if (this.gridHelper) {
          this.gridHelper.position.y = -size.y / 2 - 0.2;
        }
      }
    } catch (err: unknown) {
      console.error('[ViewerPage] Error al parsear STL:', err);
      void this.showToast('Error al procesar la geometría STL.', 'danger');
    }
  }

  /**
   * Ajusta dinámicamente las dimensiones del canvas y la relación de aspecto de la cámara Three.js.
   * Evita distorsiones anamórficas durante cambios de orientación o tamaño de pantalla.
   */
  private onResize(): void {
    const container = this.canvasContainer?.nativeElement;
    if (!container || !this.renderer || !this.camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Libera todos los recursos WebGL, geometrías, materiales y listeners para prevenir fugas de memoria.
   * Cumple con la directriz obligatoria del protocolo UI al destruir el componente.
   */
  private cleanUpThreeJs(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.boundResize);

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      if (Array.isArray(this.currentMesh.material)) {
        this.currentMesh.material.forEach((m) => m.dispose());
      } else {
        this.currentMesh.material.dispose();
      }
      this.currentMesh = null;
    }

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      if (Array.isArray(this.gridHelper.material)) {
        this.gridHelper.material.forEach((m) => m.dispose());
      } else {
        this.gridHelper.material.dispose();
      }
      this.gridHelper = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
  }

  /**
   * Registra la conversión en Supabase activando la rotación FIFO automática de 5 registros.
   * Asegura la persistencia de los metadatos de transformación sin interrumpir el flujo del usuario.
   */
  private async saveToHistory(sizeBytes: number): Promise<void> {
    const isSvg = this.conversionType() === 'svg';
    const settings: Record<string, string | number | boolean> = isSvg
      ? { extrude_depth: this.height }
      : { height: this.height, invert: this.invert };

    await this.supabaseService.saveRecord({
      file_name: this.fileName(),
      conversion_type: this.conversionType(),
      settings,
      stl_size_bytes: sizeBytes,
    });
  }

  /**
   * Muestra notificaciones visuales Toast de Ionic informando estados de éxito o advertencia.
   * Centraliza la retroalimentación hacia el usuario para operaciones de descarga y procesamiento.
   */
  private async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
