import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonChip,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  timeOutline,
  refreshOutline,
  cubeOutline,
  informationCircleOutline,
  documentOutline,
  arrowBackOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { ConversionHistoryRecord } from '../../core/models/history.model';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonChip,
  ],
})
export class HistoryPage implements OnInit {
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);

  /** Señal de solo lectura conectada reactivamente con el estado de Supabase */
  readonly history = this.supabaseService.history;

  /** Estado de refresco manual de la lista */
  isRefreshing = signal<boolean>(false);

  constructor() {
    addIcons({
      timeOutline,
      refreshOutline,
      cubeOutline,
      informationCircleOutline,
      documentOutline,
      arrowBackOutline,
      shieldCheckmarkOutline,
    });
  }

  ngOnInit(): void {
    void this.loadHistory();
  }

  /**
   * Consulta los registros históricos desde la tabla PostgreSQL de Supabase.
   * Conecta la capa de presentación con el servicio de persistencia cloud.
   */
  async loadHistory(): Promise<void> {
    this.isRefreshing.set(true);
    try {
      await this.supabaseService.getHistory();
    } finally {
      this.isRefreshing.set(false);
    }
  }

  /**
   * Resuelve el evento de arrastre para refrescar (Pull-to-refresh) en dispositivos móviles.
   * Completa la animación nativa de refresco tras recuperar la colección actualizada.
   */
  async handleRefresh(event: CustomEvent): Promise<void> {
    await this.supabaseService.getHistory();
    (event.target as HTMLIonRefresherElement).complete();
  }

  /**
   * Retorna a la página de carga y edición de modelos en el inicio de la aplicación.
   * Facilita la navegación rápida para iniciar una nueva conversión desde el historial.
   */
  navigateToHome(): void {
    void this.router.navigate(['/home']);
  }

  /**
   * Formatea el tamaño en bytes hacia unidades legibles en kilobytes o megabytes.
   * Transforma números crudos en magnitudes comprensibles para el usuario final.
   */
  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Construye un resumen legible de los parámetros geométricos aplicados a cada modelo.
   * Extrae la configuración guardada en formato JSONB desde la base de datos de Supabase.
   */
  formatSettings(item: ConversionHistoryRecord): string {
    const s = item.settings;
    if (!s) return 'Predeterminados';

    if (item.conversion_type === 'svg') {
      const depth = s['extrude_depth'] ?? s['height'] ?? '5';
      return `Profundidad de extrusión: ${depth} mm`;
    }

    const h = s['height'] ?? '5';
    const inv = s['invert'] ? 'Sí (Blanco bajo)' : 'No (Blanco alto)';
    return `Altura: ${h} mm | Relieve invertido: ${inv}`;
  }
}
