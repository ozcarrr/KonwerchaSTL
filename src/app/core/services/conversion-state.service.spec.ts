import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConversionStateService } from './conversion-state.service';

describe('ConversionStateService', () => {
  let service: ConversionStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConversionStateService],
    });
    service = TestBed.inject(ConversionStateService);
  });

  it('should be created with initial state', () => {
    expect(service).toBeTruthy();
    expect(service.activeBlob()).toBeNull();
    expect(service.height()).toBe(5.0);
    expect(service.invert()).toBe(false);
    expect(service.conversionType()).toBe('heightmap');
  });

  it('should set image source and update signals', () => {
    const fakeBlob = new Blob(['sample-content'], { type: 'image/png' });
    service.setImageSource(fakeBlob, 'test.png', 'heightmap', 'data:image/png;base64,...');

    expect(service.activeBlob()).toBe(fakeBlob);
    expect(service.fileName()).toBe('test.png');
    expect(service.conversionType()).toBe('heightmap');
    expect(service.previewUrl()).toBe('data:image/png;base64,...');
    expect(service.stlBlob()).toBeNull();
  });

  it('should update conversion parameters', () => {
    service.updateParameters(12.5, true);
    expect(service.height()).toBe(12.5);
    expect(service.invert()).toBe(true);
  });

  it('should set STL result and reset session', () => {
    const fakeStl = new Blob(['solid test'], { type: 'model/stl' });
    service.setStlResult(fakeStl);
    expect(service.stlBlob()).toBe(fakeStl);

    service.resetSession();
    expect(service.activeBlob()).toBeNull();
    expect(service.stlBlob()).toBeNull();
    expect(service.height()).toBe(5.0);
  });
});
