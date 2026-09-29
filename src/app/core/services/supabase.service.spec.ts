import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { ConversionHistoryRecord, CreateHistoryRecordDto } from '../models/history.model';

describe('SupabaseService', () => {
  let service: SupabaseService;
  let toastCtrlMock: { create: ReturnType<typeof vi.fn> };

  const mockRecords: ConversionHistoryRecord[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      file_name: 'test1.png',
      conversion_type: 'heightmap',
      settings: { height: 10, invert: false },
      stl_size_bytes: 2048,
      created_at: '2026-09-27T12:00:00Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      file_name: 'test2.svg',
      conversion_type: 'svg',
      settings: { extrude_depth: 5 },
      stl_size_bytes: 4096,
      created_at: '2026-09-27T11:00:00Z',
    },
  ];

  beforeEach(() => {
    toastCtrlMock = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        SupabaseService,
        { provide: ToastController, useValue: toastCtrlMock },
      ],
    });

    service = TestBed.inject(SupabaseService);
  });

  it('should be created and have empty initial history signal', () => {
    expect(service).toBeTruthy();
    expect(service.history()).toEqual([]);
  });

  it('should fetch history and update reactive signal and observable', async () => {
    const client = service.getClient();
    const selectMock = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: mockRecords, error: null }),
      }),
    });

    vi.spyOn(client, 'from').mockReturnValue({
      select: selectMock,
    } as unknown as ReturnType<typeof client.from>);

    const result = await service.getHistory();

    expect(result).toHaveLength(2);
    expect(service.history()).toEqual(mockRecords);

    let observedCount = 0;
    service.history$.subscribe((list) => {
      observedCount = list.length;
    });
    expect(observedCount).toBe(2);
  });

  it('should save a record and refresh the history list', async () => {
    const newDto: CreateHistoryRecordDto = {
      file_name: 'new_mesh.png',
      conversion_type: 'heightmap',
      settings: { height: 8, invert: true },
      stl_size_bytes: 10240,
    };

    const insertedRecord: ConversionHistoryRecord = {
      id: '33333333-3333-3333-3333-333333333333',
      ...newDto,
      created_at: '2026-09-27T13:00:00Z',
    };

    const client = service.getClient();
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: insertedRecord, error: null }),
      }),
    });
    const selectMock = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [insertedRecord, ...mockRecords],
          error: null,
        }),
      }),
    });

    vi.spyOn(client, 'from').mockImplementation(((table: string) => {
      if (table === 'conversion_history') {
        return {
          insert: insertMock,
          select: selectMock,
        };
      }
      return {} as unknown;
    }) as unknown as typeof client.from);

    const saved = await service.saveRecord(newDto);

    expect(saved).toEqual(insertedRecord);
    expect(service.history()).toHaveLength(3);
  });
});
