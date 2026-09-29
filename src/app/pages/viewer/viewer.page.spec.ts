import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ViewerPage } from './viewer.page';
import { ConversionApiService } from '../../core/services/conversion-api.service';
import { ConversionStateService } from '../../core/services/conversion-state.service';
import { SupabaseService } from '../../core/services/supabase.service';

describe('ViewerPage', () => {
  let component: ViewerPage;
  let fixture: ComponentFixture<ViewerPage>;

  const validStlBytes = new Uint8Array(84);
  const mockConversionApi = {
    convertImageToStl: vi.fn().mockReturnValue(of(new Blob([validStlBytes], { type: 'model/stl' }))),
    convertSvgToStl: vi.fn().mockReturnValue(of(new Blob([validStlBytes], { type: 'model/stl' }))),
  };

  const mockSupabase = {
    saveRecord: vi.fn().mockResolvedValue(null),
    getHistory: vi.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ViewerPage],
      providers: [
        provideRouter([]),
        { provide: ConversionApiService, useValue: mockConversionApi },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });
    fixture = TestBed.createComponent(ViewerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create viewer component', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle wireframe mode', () => {
    component.wireframe = true;
    component.toggleWireframe();
    expect(component.wireframe).toBe(true);
  });

  it('should trigger conversion and invoke ConversionApiService', async () => {
    const stateService = TestBed.inject(ConversionStateService);
    stateService.setImageSource(
      new Blob(['image bytes'], { type: 'image/png' }),
      'foto.png',
      'heightmap'
    );

    await component.triggerConversion();
    expect(mockConversionApi.convertImageToStl).toHaveBeenCalled();
  });
});
