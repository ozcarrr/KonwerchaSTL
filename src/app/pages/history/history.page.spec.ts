import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HistoryPage } from './history.page';
import { SupabaseService } from '../../core/services/supabase.service';
import { ConversionHistoryRecord } from '../../core/models/history.model';

describe('HistoryPage', () => {
  let component: HistoryPage;
  let fixture: ComponentFixture<HistoryPage>;

  const mockRecord: ConversionHistoryRecord = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    file_name: 'test_logo.svg',
    conversion_type: 'svg',
    settings: { extrude_depth: 8.5 },
    stl_size_bytes: 204800,
    created_at: new Date().toISOString(),
  };

  const supabaseMock = {
    history: signal([mockRecord]),
    getHistory: vi.fn().mockResolvedValue([mockRecord]),
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HistoryPage],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    });
    fixture = TestBed.createComponent(HistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and call getHistory on init', () => {
    expect(component).toBeTruthy();
    expect(supabaseMock.getHistory).toHaveBeenCalled();
  });

  it('should correctly format byte sizes', () => {
    expect(component.formatBytes(0)).toBe('0 B');
    expect(component.formatBytes(1024)).toBe('1 KB');
    expect(component.formatBytes(1048576)).toBe('1 MB');
  });

  it('should format SVG and Heightmap settings', () => {
    const svgFormatted = component.formatSettings(mockRecord);
    expect(svgFormatted).toContain('Profundidad de extrusión: 8.5 mm');

    const rasterRecord: ConversionHistoryRecord = {
      ...mockRecord,
      conversion_type: 'heightmap',
      settings: { height: 6.0, invert: true },
    };
    const rasterFormatted = component.formatSettings(rasterRecord);
    expect(rasterFormatted).toContain('Altura: 6 mm');
    expect(rasterFormatted).toContain('Relieve invertido: Sí');
  });
});
