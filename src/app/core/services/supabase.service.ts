import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { ConversionHistoryRecord, CreateHistoryRecordDto } from '../models/history.model';

/**
 * Esquema de base de datos tipado para el cliente de Supabase.
 * Evita cualquier uso de 'any' al consultar o insertar en PostgreSQL.
 */
export type Database = {
  public: {
    Tables: {
      conversion_history: {
        Row: ConversionHistoryRecord;
        Insert: CreateHistoryRecordDto;
        Update: Partial<CreateHistoryRecordDto>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly toastCtrl = inject(ToastController);
  private readonly client: SupabaseClient<Database>;
  private readonly _history = signal<ConversionHistoryRecord[]>([]);
  private readonly _historySubject = new BehaviorSubject<ConversionHistoryRecord[]>([]);

  /** Señal de solo lectura para consumo reactivo en componentes Angular modernos */
  readonly history = this._history.asReadonly();
  /** Observable para consumo mediante AsyncPipe o tuberías RxJS tradicionales */
  readonly history$: Observable<ConversionHistoryRecord[]> = this._historySubject.asObservable();

  constructor() {
    this.client = createClient<Database>(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /**
   * Consulta los últimos 5 registros de conversión desde Supabase ordenados por fecha descendente.
   * Pertenece a la capa de persistencia y actualiza el estado reactivo global mediante Signals.
   */
  async getHistory(): Promise<ConversionHistoryRecord[]> {
    try {
      const { data, error } = await this.client
        .from('conversion_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.warn('[SupabaseService] Error consultando historial:', error.message);
        return this._history();
      }

      const records: ConversionHistoryRecord[] = data ?? [];
      this._history.set(records);
      this._historySubject.next(records);
      return records;
    } catch (err: unknown) {
      console.warn('[SupabaseService] Excepción durante getHistory:', err);
      return this._history();
    }
  }

  /**
   * Persiste un nuevo registro de conversión en Supabase y refresca automáticamente el historial.
   * Conecta la capa de persistencia con el trigger PostgreSQL para mantener la rotación estricta de 5 filas.
   */
  async saveRecord(record: CreateHistoryRecordDto): Promise<ConversionHistoryRecord | null> {
    try {
      const { data, error } = await this.client
        .from('conversion_history')
        .insert(record)
        .select()
        .single();

      if (error) {
        console.warn('[SupabaseService] Error insertando registro:', error.message);
        await this.showToast('No se pudo sincronizar el registro en Supabase.');
        return null;
      }

      await this.getHistory();
      return data;
    } catch (err: unknown) {
      console.warn('[SupabaseService] Excepción durante saveRecord:', err);
      return null;
    }
  }

  /**
   * Retorna la instancia tipada del cliente Supabase configurada para el proyecto.
   * Provee acceso directo a la infraestructura cloud para extensiones o consultas avanzadas.
   */
  getClient(): SupabaseClient<Database> {
    return this.client;
  }

  /**
   * Despliega una alerta visual no bloqueante informando irregularidades en la sincronización.
   * Aborda la comunicación de eventos de persistencia cloud directamente hacia la interfaz de usuario.
   */
  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3500,
      position: 'bottom',
      color: 'warning',
    });
    await toast.present();
  }
}
