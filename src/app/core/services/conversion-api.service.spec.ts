import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ToastController } from '@ionic/angular';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversionApiService } from './conversion-api.service';
import { environment } from '../../../environments/environment';

describe('ConversionApiService', () => {
  let service: ConversionApiService;
  let httpMock: HttpTestingController;
  let toastCtrlMock: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toastCtrlMock = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ConversionApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastController, useValue: toastCtrlMock },
      ],
    });

    service = TestBed.inject(ConversionApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send heightmap conversion request and return Blob with model/stl MIME type', async () => {
    const dummyBlob = new Blob(['STL_BINARY_CONTENT'], { type: 'application/octet-stream' });
    const file = new File(['image_bytes'], 'test.png', { type: 'image/png' });

    let resultBlob: Blob | undefined;
    service.convertImageToStl(file, { height: 10, invert: false }).subscribe({
      next: (b) => {
        resultBlob = b;
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/convert/heightmap`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    req.flush(dummyBlob);

    expect(resultBlob).toBeDefined();
    expect(resultBlob?.type).toBe('model/stl');
  });

  it('should send svg conversion request and return Blob with model/stl MIME type', async () => {
    const dummyBlob = new Blob(['STL_SVG_BINARY'], { type: 'model/stl' });
    const file = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' });

    let resultBlob: Blob | undefined;
    service.convertSvgToStl(file, 5).subscribe({
      next: (b) => {
        resultBlob = b;
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/convert/svg`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    req.flush(dummyBlob);

    expect(resultBlob).toBeDefined();
    expect(resultBlob?.type).toBe('model/stl');
  });

  it('should call health endpoint and return status', async () => {
    service.checkHealth().subscribe({
      next: (res) => {
        expect(res.status).toBe('healthy');
        expect(res.service).toBe('konchewa-backend');
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/health`);
    expect(req.request.method).toBe('GET');

    req.flush({ status: 'healthy', service: 'konchewa-backend', version: '1.0.0' });
  });

  it('should trigger toast and propagate error on backend HTTP failure', async () => {
    const file = new File([''], 'empty.png', { type: 'image/png' });
    let errorCaught: Error | undefined;

    service.convertImageToStl(file, { height: -5 }).subscribe({
      next: () => {
        // should not succeed
      },
      error: (err) => {
        errorCaught = err;
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/convert/heightmap`);
    const errBlob = new Blob([JSON.stringify({ detail: 'Height parameter must be greater than zero.' })], {
      type: 'application/json',
    });
    req.flush(errBlob, {
      status: 400,
      statusText: 'Bad Request',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(errorCaught).toBeDefined();
    expect(toastCtrlMock.create).toHaveBeenCalled();
  });
});
